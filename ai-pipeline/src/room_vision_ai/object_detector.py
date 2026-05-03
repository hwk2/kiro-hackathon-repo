# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Object detection orchestration via the configured AI agent."""

from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING, List

from PIL import Image

from room_vision_ai.models import (
    BlockModel,
    BoundingBox,
    Detection,
    DetectionResult,
    DetectionSummary,
)

if TYPE_CHECKING:
    from room_vision_ai.agent_interface import AgentInterface
    from room_vision_ai.category_registry import CategoryRegistry

logger = logging.getLogger("room_vision_ai")

# Supported image content types and extensions
SUPPORTED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
}

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
    ".heif",
}

MIN_RESOLUTION = 480


def validate_image_format(content_type: str | None, filename: str) -> str | None:
    """Check if the image format is supported.

    Returns an error message string if invalid, or None if valid.
    """
    # Check content type
    if content_type and content_type.lower() in SUPPORTED_CONTENT_TYPES:
        return None

    # Fall back to extension check
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()

    if ext in SUPPORTED_EXTENSIONS:
        return None

    return f"{filename}: unsupported format (expected JPEG, PNG, or HEIC)"


def validate_image_resolution(image_bytes: bytes, filename: str) -> str | None:
    """Check if the image resolution meets the minimum requirement.

    Returns an error message string if invalid, or None if valid.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        if width < MIN_RESOLUTION or height < MIN_RESOLUTION:
            return (
                f"{filename}: resolution {width}x{height} is below "
                f"minimum {MIN_RESOLUTION}x{MIN_RESOLUTION}"
            )
        return None
    except Exception:
        return f"{filename}: unable to read image dimensions"


class ObjectDetector:
    """Orchestrates object detection through the configured AI agent.

    Parameters
    ----------
    agent : AgentInterface | None
        The configured AI agent. May be ``None`` if no agent is available.
    registry : CategoryRegistry
        The category registry for validating detected categories.
    """

    def __init__(
        self,
        agent: "AgentInterface | None",
        registry: "CategoryRegistry",
    ) -> None:
        self._agent = agent
        self._registry = registry

    @property
    def has_agent(self) -> bool:
        """Return True if an AI agent is configured."""
        return self._agent is not None

    def validate_images(
        self,
        image_bytes_list: list[bytes],
        filenames: list[str],
        content_types: list[str | None],
    ) -> list[str]:
        """Validate all images for format and resolution.

        Returns a list of error detail strings. Empty list means all valid.
        """
        errors: list[str] = []
        for i, (img_bytes, fname, ctype) in enumerate(
            zip(image_bytes_list, filenames, content_types)
        ):
            # Format check
            fmt_err = validate_image_format(ctype, fname)
            if fmt_err:
                errors.append(fmt_err)
                continue  # skip resolution check for unsupported formats

            # Resolution check
            res_err = validate_image_resolution(img_bytes, fname)
            if res_err:
                errors.append(res_err)

        return errors

    def detect(
        self,
        image_bytes_list: list[bytes],
        metadata: list[dict],
    ) -> tuple[list[DetectionResult], list[str]]:
        """Run object detection on the provided images.

        Parameters
        ----------
        image_bytes_list : list[bytes]
            Raw image bytes for each image.
        metadata : list[dict]
            Image metadata dicts (one per image).

        Returns
        -------
        tuple[list[DetectionResult], list[str]]
            A tuple of (detection_results, warnings).

        Raises
        ------
        RuntimeError
            If no agent is configured.
        """
        if self._agent is None:
            raise RuntimeError("No AI agent configured")

        # Forward to agent
        raw_results = self._agent.detect_objects(image_bytes_list, metadata)

        # Parse results into DetectionResult format
        detection_results: list[DetectionResult] = []
        warnings: list[str] = []

        for raw in raw_results:
            result = self._parse_detection_result(raw, warnings)
            detection_results.append(result)

        return detection_results, warnings

    def _parse_detection_result(
        self, raw: dict, warnings: list[str]
    ) -> DetectionResult:
        """Parse a single raw agent response dict into a DetectionResult."""
        image_filename = raw.get("image_filename", "unknown")
        raw_detections = raw.get("detections", [])

        detections: list[Detection] = []
        for det in raw_detections:
            category = det.get("category", "unknown")
            confidence = det.get("confidence_score", 0.0)
            bbox_raw = det.get("bounding_box", {})

            bbox = BoundingBox(
                x_min=int(bbox_raw.get("x_min", 0)),
                y_min=int(bbox_raw.get("y_min", 0)),
                x_max=int(bbox_raw.get("x_max", 0)),
                y_max=int(bbox_raw.get("y_max", 0)),
            )

            # Validate category against registry
            if not self._registry.has_category(category):
                warnings.append(
                    f"Unknown category '{category}' detected in {image_filename}"
                )

            detections.append(
                Detection(
                    category=category,
                    confidence_score=confidence,
                    bounding_box=bbox,
                )
            )

        return DetectionResult(
            image_filename=image_filename,
            detections=detections,
        )

    def build_block_model(
        self, detection_results: list[DetectionResult]
    ) -> BlockModel:
        """Convert detection results into a BlockModel.

        Delegates to :class:`ModelGenerator` for sophisticated 3D block
        model generation including room dimension estimation, 3D
        positioning, and multi-image merging.
        """
        from room_vision_ai.model_generator import ModelGenerator

        generator = ModelGenerator()
        return generator.generate(detection_results)

    def build_detection_summary(
        self, detection_results: list[DetectionResult]
    ) -> DetectionSummary:
        """Build a summary of detection results."""
        total_objects = 0
        low_confidence_count = 0
        categories: set[str] = set()

        for result in detection_results:
            for det in result.detections:
                total_objects += 1
                if det.confidence_score < 0.5:
                    low_confidence_count += 1
                categories.add(det.category)

        return DetectionSummary(
            total_objects=total_objects,
            low_confidence_count=low_confidence_count,
            categories_detected=sorted(categories),
        )
