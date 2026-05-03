# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Converts detection results into Block_Model geometry.

The ModelGenerator is the dedicated module for transforming raw
DetectionResult lists into a fully populated BlockModel with estimated
room dimensions, 3D positions, object dimensions, rotations, and
human-readable descriptions.  It also handles multi-image merging
and deduplication.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from room_vision_ai.models import (
    Block,
    BlockModel,
    BoundingBox,
    Detection,
    DetectionResult,
    Dimensions3D,
    Position3D,
    RoomDimensions,
    Rotation3D,
)

logger = logging.getLogger("room_vision_ai")

# ---------------------------------------------------------------------------
# Category-specific size priors (width, height, depth) in metres
# ---------------------------------------------------------------------------
CATEGORY_SIZE_PRIORS: dict[str, tuple[float, float, float]] = {
    "power_outlet": (0.08, 0.12, 0.03),
    "light_switch": (0.08, 0.12, 0.03),
    "light_fixture": (0.40, 0.10, 0.40),
    "door": (0.90, 2.00, 0.05),
    "door_handle": (0.12, 0.06, 0.06),
    "window": (1.20, 1.00, 0.10),
    "window_lock": (0.06, 0.04, 0.03),
    "stairs": (1.00, 2.50, 3.00),
    "handrail": (0.05, 0.90, 1.50),
    "furniture": (0.80, 0.75, 0.60),
    "sharp_edge_furniture": (0.80, 0.75, 0.60),
    "rug": (2.00, 0.02, 1.50),
    "cord_cable": (0.02, 0.02, 1.00),
    "smoke_detector": (0.12, 0.04, 0.12),
    "fire_extinguisher": (0.15, 0.40, 0.15),
    "wall_fixture": (0.20, 0.20, 0.10),
}

# Known real-world reference sizes used for room estimation
_REFERENCE_HEIGHTS: dict[str, float] = {
    "door": 2.00,
    "power_outlet": 0.12,
    "light_switch": 0.12,
    "window": 1.00,
}

_REFERENCE_WIDTHS: dict[str, float] = {
    "power_outlet": 0.08,
    "light_switch": 0.08,
    "door": 0.90,
    "window": 1.20,
}

# Default room dimensions when estimation is uncertain
DEFAULT_ROOM_WIDTH = 5.0
DEFAULT_ROOM_HEIGHT = 2.8
DEFAULT_ROOM_DEPTH = 4.0

# Merge threshold — objects of the same category within this distance
# (in metres) are considered duplicates from different angles.
MERGE_DISTANCE_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ModelGenerator:
    """Converts a list of :class:`DetectionResult` objects into a
    :class:`BlockModel` with estimated room geometry, 3D block positions,
    dimensions, rotations, and human-readable descriptions.

    This is the enhanced replacement for the basic conversion previously
    done inside ``ObjectDetector.build_block_model()``.
    """

    def generate(
        self,
        detection_results: list[DetectionResult],
        image_dimensions: list[tuple[int, int]] | None = None,
    ) -> BlockModel:
        """Build a complete :class:`BlockModel` from detection results.

        Parameters
        ----------
        detection_results:
            One :class:`DetectionResult` per image processed.
        image_dimensions:
            Optional list of ``(width, height)`` pixel sizes for each
            image, used to improve room-dimension estimation.  When
            ``None``, a default image size of ``(1920, 1080)`` is assumed.

        Returns
        -------
        BlockModel
            A fully populated block model.
        """
        if image_dimensions is None:
            image_dimensions = [(1920, 1080)] * len(detection_results)

        # 1. Estimate room dimensions (Task 5.2)
        room_dims = self._estimate_room_dimensions(
            detection_results, image_dimensions
        )

        # 2. Convert each detection to a Block (Tasks 5.1, 5.3, 5.4)
        blocks: list[Block] = []
        for result, img_dim in zip(detection_results, image_dimensions):
            for det in result.detections:
                block = self._detection_to_block(
                    det, result.image_filename, img_dim, room_dims
                )
                blocks.append(block)

        # 3. Multi-image merging / deduplication (Task 5.5)
        merged_blocks = self._merge_blocks(blocks)

        return BlockModel(
            room_dimensions=room_dims,
            blocks=merged_blocks,
        )

    # ------------------------------------------------------------------
    # Task 5.2 — Room dimension estimation
    # ------------------------------------------------------------------

    def _estimate_room_dimensions(
        self,
        detection_results: list[DetectionResult],
        image_dimensions: list[tuple[int, int]],
    ) -> RoomDimensions:
        """Estimate room width, height, and depth from detection cues.

        Uses known real-world object sizes as reference points.  When no
        reliable reference is found, falls back to sensible defaults.
        """
        height_estimates: list[float] = []
        width_estimates: list[float] = []

        for result, (img_w, img_h) in zip(detection_results, image_dimensions):
            for det in result.detections:
                bbox = det.bounding_box
                bbox_h = abs(bbox.y_max - bbox.y_min)
                bbox_w = abs(bbox.x_max - bbox.x_min)

                # Use known object heights to estimate room height
                if det.category in _REFERENCE_HEIGHTS and bbox_h > 0:
                    real_h = _REFERENCE_HEIGHTS[det.category]
                    scale = real_h / bbox_h  # metres per pixel
                    estimated_room_h = scale * img_h
                    # Sanity-check: room height between 2.0 and 5.0 m
                    if 2.0 <= estimated_room_h <= 5.0:
                        height_estimates.append(estimated_room_h)

                # Use known object widths to estimate room width
                if det.category in _REFERENCE_WIDTHS and bbox_w > 0:
                    real_w = _REFERENCE_WIDTHS[det.category]
                    scale = real_w / bbox_w  # metres per pixel
                    estimated_room_w = scale * img_w
                    # Sanity-check: room width between 2.0 and 15.0 m
                    if 2.0 <= estimated_room_w <= 15.0:
                        width_estimates.append(estimated_room_w)

        est_height = (
            sum(height_estimates) / len(height_estimates)
            if height_estimates
            else DEFAULT_ROOM_HEIGHT
        )
        est_width = (
            sum(width_estimates) / len(width_estimates)
            if width_estimates
            else DEFAULT_ROOM_WIDTH
        )
        # Depth is harder to estimate from 2D images; use a ratio of width
        est_depth = est_width * 0.8 if width_estimates else DEFAULT_ROOM_DEPTH

        return RoomDimensions(
            width=round(est_width, 2),
            height=round(est_height, 2),
            depth=round(est_depth, 2),
        )

    # ------------------------------------------------------------------
    # Tasks 5.1, 5.3, 5.4 — Detection → Block conversion
    # ------------------------------------------------------------------

    def _detection_to_block(
        self,
        detection: Detection,
        image_filename: str,
        image_dim: tuple[int, int],
        room_dims: RoomDimensions,
    ) -> Block:
        """Convert a single :class:`Detection` into a :class:`Block`."""
        bbox = detection.bounding_box
        img_w, img_h = image_dim

        # --- 3D position (Task 5.3) ---
        position = self._estimate_position(bbox, img_w, img_h, room_dims)

        # --- Dimensions (Task 5.3) ---
        dimensions = self._estimate_dimensions(
            detection.category, bbox, img_w, img_h, room_dims
        )

        # --- Rotation (Task 5.3) ---
        rotation = self._estimate_rotation(bbox, img_w)

        # --- Label ---
        label = detection.category.replace("_", " ").title()

        # --- Description (Task 5.4) ---
        description = self._generate_description(
            detection.category, label, position, room_dims,
            detection.confidence_score,
        )

        return Block(
            category=detection.category,
            label=label,
            description=description,
            confidence_score=detection.confidence_score,
            low_confidence=detection.confidence_score < 0.5,
            position=position,
            dimensions=dimensions,
            rotation=rotation,
            source_images=[image_filename],
        )

    def _estimate_position(
        self,
        bbox: BoundingBox,
        img_w: int,
        img_h: int,
        room_dims: RoomDimensions,
    ) -> Position3D:
        """Map 2D bounding-box centre to a 3D room position.

        Horizontal pixel position maps to room X (width).
        Vertical pixel position maps to room Y (height), inverted so
        that y=0 is the floor.
        Z is set to 0 (on the wall plane) by default.
        """
        cx = (bbox.x_min + bbox.x_max) / 2.0
        cy = (bbox.y_min + bbox.y_max) / 2.0

        x = (cx / img_w) * room_dims.width if img_w > 0 else 0.0
        # Invert Y: top of image → high on wall, bottom → near floor
        y = ((img_h - cy) / img_h) * room_dims.height if img_h > 0 else 0.0
        z = 0.0  # wall plane

        return Position3D(
            x=round(x, 3),
            y=round(y, 3),
            z=round(z, 3),
        )

    def _estimate_dimensions(
        self,
        category: str,
        bbox: BoundingBox,
        img_w: int,
        img_h: int,
        room_dims: RoomDimensions,
    ) -> Dimensions3D:
        """Estimate block dimensions from category priors and bbox proportions."""
        if category in CATEGORY_SIZE_PRIORS:
            w, h, d = CATEGORY_SIZE_PRIORS[category]
            return Dimensions3D(width=w, height=h, depth=d)

        # Fallback: derive from bounding box proportions relative to room
        bbox_w = abs(bbox.x_max - bbox.x_min)
        bbox_h = abs(bbox.y_max - bbox.y_min)

        w = max((bbox_w / img_w) * room_dims.width, 0.01) if img_w > 0 else 0.1
        h = max((bbox_h / img_h) * room_dims.height, 0.01) if img_h > 0 else 0.1
        d = max(min(w, h) * 0.3, 0.01)

        return Dimensions3D(
            width=round(w, 3),
            height=round(h, 3),
            depth=round(d, 3),
        )

    def _estimate_rotation(
        self,
        bbox: BoundingBox,
        img_w: int,
    ) -> Rotation3D:
        """Estimate rotation based on wall orientation.

        Objects near the left/right edges of the image are assumed to be
        on side walls and face inward; objects in the centre face the
        camera (yaw=0).
        """
        if img_w <= 0:
            return Rotation3D()

        cx = (bbox.x_min + bbox.x_max) / 2.0
        normalised_x = cx / img_w  # 0..1

        # Objects at the edges get a slight yaw rotation
        if normalised_x < 0.2:
            yaw = 90.0  # left wall, facing right
        elif normalised_x > 0.8:
            yaw = -90.0  # right wall, facing left
        else:
            yaw = 0.0  # front wall, facing camera

        return Rotation3D(pitch=0.0, yaw=yaw, roll=0.0)

    # ------------------------------------------------------------------
    # Task 5.4 — Description generation
    # ------------------------------------------------------------------

    def _generate_description(
        self,
        category: str,
        label: str,
        position: Position3D,
        room_dims: RoomDimensions,
        confidence: float,
    ) -> str:
        """Generate a human-readable description for a block."""
        # Spatial context — wall
        wall = self._infer_wall(position, room_dims)

        # Spatial context — vertical
        vertical = self._infer_vertical_context(position, room_dims)

        # Confidence qualifier
        if confidence >= 0.8:
            conf_text = "high confidence"
        elif confidence >= 0.5:
            conf_text = "moderate confidence"
        else:
            conf_text = "low confidence"

        height_cm = round(position.y * 100)

        return (
            f"{label} on {wall}, {height_cm}cm above floor level. "
            f"Detection {conf_text} ({confidence:.0%})."
        )

    def _infer_wall(
        self, position: Position3D, room_dims: RoomDimensions
    ) -> str:
        """Infer which wall an object is on based on its X position."""
        ratio = position.x / room_dims.width if room_dims.width > 0 else 0.5
        if ratio < 0.25:
            return "west wall"
        elif ratio > 0.75:
            return "east wall"
        else:
            return "north wall"

    def _infer_vertical_context(
        self, position: Position3D, room_dims: RoomDimensions
    ) -> str:
        """Infer vertical context (near floor / mid-wall / near ceiling)."""
        ratio = position.y / room_dims.height if room_dims.height > 0 else 0.5
        if ratio < 0.25:
            return "near floor"
        elif ratio > 0.75:
            return "near ceiling"
        else:
            return "mid-wall"

    # ------------------------------------------------------------------
    # Task 5.5 — Multi-image merging
    # ------------------------------------------------------------------

    def _merge_blocks(self, blocks: list[Block]) -> list[Block]:
        """Deduplicate blocks from multiple images.

        Two blocks are considered duplicates when they share the same
        category and their 3D positions are within
        :data:`MERGE_DISTANCE_THRESHOLD` metres.  The block with the
        higher confidence score is kept, and source images are combined.
        """
        if not blocks:
            return []

        merged: list[Block] = []

        for block in blocks:
            match_idx = self._find_merge_candidate(block, merged)
            if match_idx is not None:
                existing = merged[match_idx]
                merged[match_idx] = self._merge_two_blocks(existing, block)
            else:
                merged.append(block)

        return merged

    def _find_merge_candidate(
        self, block: Block, merged: list[Block]
    ) -> int | None:
        """Find the index of a block in *merged* that should be merged
        with *block*, or ``None`` if no match."""
        for i, existing in enumerate(merged):
            if existing.category != block.category:
                continue
            dist = self._position_distance(existing.position, block.position)
            if dist <= MERGE_DISTANCE_THRESHOLD:
                return i
        return None

    @staticmethod
    def _position_distance(a: Position3D, b: Position3D) -> float:
        """Euclidean distance between two 3D positions."""
        return math.sqrt(
            (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
        )

    @staticmethod
    def _merge_two_blocks(existing: Block, new: Block) -> Block:
        """Merge *new* into *existing*, keeping the higher-confidence one
        and combining source images."""
        # Keep the higher-confidence block's data
        if new.confidence_score > existing.confidence_score:
            base = new
            other = existing
        else:
            base = existing
            other = new

        combined_images = list(
            dict.fromkeys(base.source_images + other.source_images)
        )

        return Block(
            block_id=base.block_id,
            category=base.category,
            label=base.label,
            description=base.description,
            confidence_score=base.confidence_score,
            low_confidence=base.confidence_score < 0.5,
            position=base.position,
            dimensions=base.dimensions,
            rotation=base.rotation,
            source_images=combined_images,
            metadata=base.metadata,
        )
