# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the ModelGenerator module (tasks 5.1–5.5)."""

from __future__ import annotations

import pytest

from room_vision_ai.model_generator import (
    CATEGORY_SIZE_PRIORS,
    DEFAULT_ROOM_DEPTH,
    DEFAULT_ROOM_HEIGHT,
    DEFAULT_ROOM_WIDTH,
    MERGE_DISTANCE_THRESHOLD,
    ModelGenerator,
)
from room_vision_ai.models import (
    Block,
    BlockModel,
    BoundingBox,
    Detection,
    DetectionResult,
    Dimensions3D,
    Position3D,
    RoomDimensions,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_detection(
    category: str = "power_outlet",
    confidence: float = 0.87,
    x_min: int = 120,
    y_min: int = 450,
    x_max: int = 180,
    y_max: int = 530,
) -> Detection:
    return Detection(
        category=category,
        confidence_score=confidence,
        bounding_box=BoundingBox(
            x_min=x_min, y_min=y_min, x_max=x_max, y_max=y_max,
        ),
    )


def _make_result(
    filename: str = "wall_north.jpg",
    detections: list[Detection] | None = None,
) -> DetectionResult:
    if detections is None:
        detections = [_make_detection()]
    return DetectionResult(image_filename=filename, detections=detections)


# ---------------------------------------------------------------------------
# Task 5.1 — ModelGenerator produces valid BlockModel from DetectionResults
# ---------------------------------------------------------------------------

class TestModelGeneratorBasic:
    """Task 5.1: Convert DetectionResult list into a BlockModel."""

    def test_single_detection_produces_block_model(self) -> None:
        gen = ModelGenerator()
        result = _make_result()
        model = gen.generate([result])

        assert isinstance(model, BlockModel)
        assert len(model.blocks) == 1
        assert model.blocks[0].category == "power_outlet"
        assert model.blocks[0].label == "Power Outlet"
        assert model.blocks[0].confidence_score == 0.87
        assert model.blocks[0].low_confidence is False

    def test_low_confidence_flagged(self) -> None:
        gen = ModelGenerator()
        det = _make_detection(category="door", confidence=0.35)
        result = _make_result(detections=[det])
        model = gen.generate([result])

        assert model.blocks[0].low_confidence is True

    def test_multiple_detections_in_one_image(self) -> None:
        gen = ModelGenerator()
        dets = [
            _make_detection(category="power_outlet", confidence=0.9),
            _make_detection(category="light_fixture", confidence=0.85,
                            x_min=300, y_min=50, x_max=400, y_max=100),
            _make_detection(category="door", confidence=0.35,
                            x_min=500, y_min=100, x_max=700, y_max=800),
        ]
        result = _make_result(detections=dets)
        model = gen.generate([result])

        assert len(model.blocks) == 3
        categories = {b.category for b in model.blocks}
        assert categories == {"power_outlet", "light_fixture", "door"}

    def test_empty_detection_results(self) -> None:
        gen = ModelGenerator()
        model = gen.generate([])

        assert isinstance(model, BlockModel)
        assert len(model.blocks) == 0

    def test_source_images_populated(self) -> None:
        gen = ModelGenerator()
        result = _make_result(filename="wall_east.jpg")
        model = gen.generate([result])

        assert model.blocks[0].source_images == ["wall_east.jpg"]

    def test_block_has_description(self) -> None:
        gen = ModelGenerator()
        result = _make_result()
        model = gen.generate([result])

        desc = model.blocks[0].description
        assert len(desc) > 0
        assert "Power Outlet" in desc

    def test_block_has_valid_dimensions(self) -> None:
        gen = ModelGenerator()
        result = _make_result()
        model = gen.generate([result])

        dims = model.blocks[0].dimensions
        assert dims.width > 0
        assert dims.height > 0
        assert dims.depth > 0


# ---------------------------------------------------------------------------
# Task 5.2 — Room dimension estimation
# ---------------------------------------------------------------------------

class TestRoomDimensionEstimation:
    """Task 5.2: Estimate room dimensions from detection spatial cues."""

    def test_defaults_when_no_reference_objects(self) -> None:
        """Unknown categories should fall back to default room dims."""
        gen = ModelGenerator()
        det = _make_detection(category="alien_artifact", confidence=0.9)
        result = _make_result(detections=[det])
        model = gen.generate([result])

        assert model.room_dimensions.width == DEFAULT_ROOM_WIDTH
        assert model.room_dimensions.height == DEFAULT_ROOM_HEIGHT
        assert model.room_dimensions.depth == DEFAULT_ROOM_DEPTH

    def test_door_detection_influences_height(self) -> None:
        """A door detection should help estimate room height."""
        gen = ModelGenerator()
        # Door bbox occupying ~70% of image height in a 1080p image
        det = _make_detection(
            category="door", confidence=0.9,
            x_min=500, y_min=100, x_max=700, y_max=856,
        )
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        # Door is 2m tall, bbox is 756px in 1080px image
        # scale = 2.0 / 756 ≈ 0.00265, estimated height ≈ 2.86m
        assert 2.0 <= model.room_dimensions.height <= 5.0

    def test_reasonable_room_dimensions(self) -> None:
        """Room dimensions should always be positive and reasonable."""
        gen = ModelGenerator()
        dets = [
            _make_detection(category="power_outlet", confidence=0.9,
                            x_min=100, y_min=800, x_max=120, y_max=830),
            _make_detection(category="door", confidence=0.85,
                            x_min=400, y_min=100, x_max=600, y_max=900),
        ]
        result = _make_result(detections=dets)
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        rd = model.room_dimensions
        assert rd.width > 0
        assert rd.height > 0
        assert rd.depth > 0
        assert rd.unit == "meters"


# ---------------------------------------------------------------------------
# Task 5.3 — 3D position, dimensions, rotation
# ---------------------------------------------------------------------------

class TestBlock3DAttributes:
    """Task 5.3: 3D position, dimensions, and rotation assignment."""

    def test_position_within_room_bounds(self) -> None:
        gen = ModelGenerator()
        det = _make_detection(x_min=100, y_min=200, x_max=200, y_max=300)
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        pos = model.blocks[0].position
        rd = model.room_dimensions
        assert 0 <= pos.x <= rd.width
        assert 0 <= pos.y <= rd.height

    def test_category_size_priors_used(self) -> None:
        """Known categories should use size priors."""
        gen = ModelGenerator()
        det = _make_detection(category="power_outlet")
        result = _make_result(detections=[det])
        model = gen.generate([result])

        dims = model.blocks[0].dimensions
        expected = CATEGORY_SIZE_PRIORS["power_outlet"]
        assert dims.width == expected[0]
        assert dims.height == expected[1]
        assert dims.depth == expected[2]

    def test_unknown_category_gets_proportional_dimensions(self) -> None:
        """Unknown categories derive dimensions from bbox proportions."""
        gen = ModelGenerator()
        det = _make_detection(
            category="alien_artifact",
            x_min=100, y_min=100, x_max=300, y_max=400,
        )
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        dims = model.blocks[0].dimensions
        assert dims.width > 0
        assert dims.height > 0
        assert dims.depth > 0

    def test_left_edge_object_gets_yaw_rotation(self) -> None:
        """Objects near the left edge should have yaw=90 (left wall)."""
        gen = ModelGenerator()
        det = _make_detection(x_min=10, y_min=200, x_max=100, y_max=300)
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        assert model.blocks[0].rotation.yaw == 90.0

    def test_right_edge_object_gets_negative_yaw(self) -> None:
        """Objects near the right edge should have yaw=-90 (right wall)."""
        gen = ModelGenerator()
        det = _make_detection(x_min=1700, y_min=200, x_max=1900, y_max=300)
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        assert model.blocks[0].rotation.yaw == -90.0

    def test_centre_object_gets_zero_yaw(self) -> None:
        """Objects in the centre should have yaw=0 (front wall)."""
        gen = ModelGenerator()
        det = _make_detection(x_min=800, y_min=200, x_max=1000, y_max=300)
        result = _make_result(detections=[det])
        model = gen.generate([result], image_dimensions=[(1920, 1080)])

        assert model.blocks[0].rotation.yaw == 0.0


# ---------------------------------------------------------------------------
# Task 5.5 — Multi-image merging
# ---------------------------------------------------------------------------

class TestMultiImageMerging:
    """Task 5.5: Merge detections from multiple images."""

    def test_same_category_nearby_merged(self) -> None:
        """Two detections of the same category at similar positions merge."""
        gen = ModelGenerator()
        # Two images with a power_outlet at roughly the same position
        det1 = _make_detection(
            category="power_outlet", confidence=0.80,
            x_min=120, y_min=450, x_max=180, y_max=530,
        )
        det2 = _make_detection(
            category="power_outlet", confidence=0.90,
            x_min=125, y_min=455, x_max=185, y_max=535,
        )
        r1 = _make_result(filename="img1.jpg", detections=[det1])
        r2 = _make_result(filename="img2.jpg", detections=[det2])

        model = gen.generate([r1, r2], image_dimensions=[(1920, 1080)] * 2)

        # Should merge into one block
        outlets = [b for b in model.blocks if b.category == "power_outlet"]
        assert len(outlets) == 1
        # Higher confidence kept
        assert outlets[0].confidence_score == 0.90
        # Both source images combined
        assert "img1.jpg" in outlets[0].source_images
        assert "img2.jpg" in outlets[0].source_images

    def test_different_categories_not_merged(self) -> None:
        """Different categories at the same position should not merge."""
        gen = ModelGenerator()
        det1 = _make_detection(category="power_outlet", confidence=0.9,
                                x_min=120, y_min=450, x_max=180, y_max=530)
        det2 = _make_detection(category="light_switch", confidence=0.85,
                                x_min=120, y_min=450, x_max=180, y_max=530)
        r1 = _make_result(filename="img1.jpg", detections=[det1])
        r2 = _make_result(filename="img2.jpg", detections=[det2])

        model = gen.generate([r1, r2], image_dimensions=[(1920, 1080)] * 2)

        assert len(model.blocks) == 2

    def test_same_category_far_apart_not_merged(self) -> None:
        """Same category at distant positions should not merge."""
        gen = ModelGenerator()
        det1 = _make_detection(
            category="power_outlet", confidence=0.9,
            x_min=100, y_min=450, x_max=160, y_max=530,
        )
        det2 = _make_detection(
            category="power_outlet", confidence=0.85,
            x_min=1500, y_min=450, x_max=1560, y_max=530,
        )
        r1 = _make_result(filename="img1.jpg", detections=[det1])
        r2 = _make_result(filename="img2.jpg", detections=[det2])

        model = gen.generate([r1, r2], image_dimensions=[(1920, 1080)] * 2)

        outlets = [b for b in model.blocks if b.category == "power_outlet"]
        assert len(outlets) == 2

    def test_single_image_no_merging_needed(self) -> None:
        """Single image with distinct detections should not merge."""
        gen = ModelGenerator()
        dets = [
            _make_detection(category="power_outlet", x_min=100, y_min=450,
                            x_max=160, y_max=530),
            _make_detection(category="light_fixture", x_min=800, y_min=50,
                            x_max=900, y_max=100),
        ]
        result = _make_result(detections=dets)
        model = gen.generate([result])

        assert len(model.blocks) == 2
