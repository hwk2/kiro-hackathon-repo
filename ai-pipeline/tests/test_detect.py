# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the POST /detect endpoint and ObjectDetector."""

from __future__ import annotations

import io
import json
from datetime import UTC, datetime
from typing import List
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.models import AgentConfig, AgentType
from room_vision_ai.object_detector import (
    ObjectDetector,
    validate_image_format,
    validate_image_resolution,
)


# ---------------------------------------------------------------------------
# Helpers — create test images
# ---------------------------------------------------------------------------

def make_jpeg_bytes(width: int = 480, height: int = 480) -> bytes:
    """Create a minimal JPEG image of the given size."""
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def make_png_bytes(width: int = 480, height: int = 480) -> bytes:
    """Create a minimal PNG image of the given size."""
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Mock agent
# ---------------------------------------------------------------------------

class MockAgent(AgentInterface):
    """A mock agent that returns predictable detection results."""

    def __init__(self, detections: list[dict] | None = None):
        config = AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="mock-model",
            endpoint="http://localhost:11434",
        )
        super().__init__(config)
        self._detections = detections

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        if self._detections is not None:
            return self._detections
        # Default: return one detection per image
        results = []
        for i, _ in enumerate(images):
            fname = f"image_{i}.jpg"
            if metadata and i < len(metadata):
                fname = metadata[i].get("filename", fname)
            results.append({
                "image_filename": fname,
                "detections": [
                    {
                        "category": "power_outlet",
                        "confidence_score": 0.87,
                        "bounding_box": {
                            "x_min": 120, "y_min": 450,
                            "x_max": 180, "y_max": 530,
                        },
                    },
                    {
                        "category": "light_fixture",
                        "confidence_score": 0.92,
                        "bounding_box": {
                            "x_min": 300, "y_min": 50,
                            "x_max": 400, "y_max": 100,
                        },
                    },
                    {
                        "category": "door",
                        "confidence_score": 0.35,
                        "bounding_box": {
                            "x_min": 500, "y_min": 100,
                            "x_max": 700, "y_max": 800,
                        },
                    },
                ],
            })
        return results

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        return []

    def health_check(self) -> dict:
        return {"status": "ok", "agent_type": "mock"}


class FailingAgent(AgentInterface):
    """An agent that always raises an exception."""

    def __init__(self):
        config = AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="failing",
            endpoint="http://localhost:11434",
        )
        super().__init__(config)

    def detect_objects(self, images, metadata):
        raise RuntimeError("Agent processing failed")

    def generate_manipulation(self, prompt, block_model, rules):
        return []

    def health_check(self):
        return {"status": "error"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_registry() -> CategoryRegistry:
    """Create a registry with a few known categories."""
    registry = CategoryRegistry()
    registry.add_categories([
        {"id": "power_outlet", "label": "Power Outlet", "source": "core"},
        {"id": "light_fixture", "label": "Light Fixture", "source": "core"},
        {"id": "door", "label": "Door", "source": "core"},
        {"id": "window", "label": "Window", "source": "core"},
    ])
    return registry


def _make_metadata(filenames: list[str] | None = None) -> str:
    """Build a metadata JSON string."""
    fnames = filenames or ["test_image.jpg"]
    images_meta = []
    for fname in fnames:
        images_meta.append({
            "filename": fname,
            "format": "jpeg",
            "width": 1920,
            "height": 1080,
            "captured_at": datetime.now(UTC).isoformat(),
            "file_size_bytes": 100000,
        })
    return json.dumps({"session_id": "test-session-123", "images": images_meta})


def _build_test_app(
    agent: AgentInterface | None = None,
    registry: CategoryRegistry | None = None,
) -> TestClient:
    """Build a FastAPI TestClient with the given agent/registry injected."""
    from fastapi import FastAPI

    from room_vision_ai.api_server import configure, router

    reg = registry or _make_registry()
    detector = ObjectDetector(agent=agent, registry=reg) if agent is not None else ObjectDetector(agent=None, registry=reg)

    # We need a fresh app to avoid state leaking between tests
    test_app = FastAPI()
    test_app.include_router(router)

    agent_config = agent.config if agent else None
    configure(
        agent_config=agent_config,
        plugins_loaded=0,
        agent=agent,
        category_registry=reg,
        object_detector=detector,
    )

    return TestClient(test_app)


# ---------------------------------------------------------------------------
# Unit tests — validate_image_format
# ---------------------------------------------------------------------------

class TestValidateImageFormat:
    def test_jpeg_content_type_valid(self):
        assert validate_image_format("image/jpeg", "photo.jpg") is None

    def test_png_content_type_valid(self):
        assert validate_image_format("image/png", "photo.png") is None

    def test_heic_content_type_valid(self):
        assert validate_image_format("image/heic", "photo.heic") is None

    def test_extension_fallback_jpeg(self):
        assert validate_image_format(None, "photo.jpg") is None

    def test_extension_fallback_png(self):
        assert validate_image_format(None, "photo.png") is None

    def test_extension_fallback_heic(self):
        assert validate_image_format(None, "photo.heic") is None

    def test_unsupported_format(self):
        result = validate_image_format("application/pdf", "doc.pdf")
        assert result is not None
        assert "unsupported format" in result

    def test_unsupported_extension(self):
        result = validate_image_format(None, "image.bmp")
        assert result is not None
        assert "unsupported format" in result


# ---------------------------------------------------------------------------
# Unit tests — validate_image_resolution
# ---------------------------------------------------------------------------

class TestValidateImageResolution:
    def test_valid_resolution(self):
        img_bytes = make_jpeg_bytes(480, 480)
        assert validate_image_resolution(img_bytes, "test.jpg") is None

    def test_large_resolution(self):
        img_bytes = make_jpeg_bytes(1920, 1080)
        assert validate_image_resolution(img_bytes, "test.jpg") is None

    def test_too_small_width(self):
        img_bytes = make_jpeg_bytes(320, 480)
        result = validate_image_resolution(img_bytes, "small.jpg")
        assert result is not None
        assert "320x480" in result
        assert "below minimum" in result

    def test_too_small_height(self):
        img_bytes = make_jpeg_bytes(480, 320)
        result = validate_image_resolution(img_bytes, "small.jpg")
        assert result is not None
        assert "480x320" in result

    def test_invalid_image_data(self):
        result = validate_image_resolution(b"not an image", "bad.jpg")
        assert result is not None
        assert "unable to read" in result


# ---------------------------------------------------------------------------
# Unit tests — ObjectDetector
# ---------------------------------------------------------------------------

class TestObjectDetector:
    def test_detect_returns_results_and_warnings(self):
        agent = MockAgent()
        registry = _make_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        img_bytes = [make_jpeg_bytes()]
        meta = [{"filename": "test.jpg"}]

        results, warnings = detector.detect(img_bytes, meta)
        assert len(results) == 1
        assert len(results[0].detections) == 3

    def test_detect_without_agent_raises(self):
        registry = _make_registry()
        detector = ObjectDetector(agent=None, registry=registry)

        with pytest.raises(RuntimeError, match="No AI agent configured"):
            detector.detect([make_jpeg_bytes()], [{}])

    def test_unknown_category_generates_warning(self):
        """Unknown categories should produce warnings but not fail."""
        detections = [{
            "image_filename": "test.jpg",
            "detections": [
                {
                    "category": "alien_artifact",
                    "confidence_score": 0.9,
                    "bounding_box": {"x_min": 0, "y_min": 0, "x_max": 100, "y_max": 100},
                },
            ],
        }]
        agent = MockAgent(detections=detections)
        registry = _make_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        results, warnings = detector.detect([make_jpeg_bytes()], [{}])
        assert len(results) == 1
        assert len(results[0].detections) == 1
        assert any("alien_artifact" in w for w in warnings)

    def test_low_confidence_flagging(self):
        """Detections with confidence < 0.5 should be flagged."""
        agent = MockAgent()  # default has a door at 0.35
        registry = _make_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        results, _ = detector.detect([make_jpeg_bytes()], [{"filename": "test.jpg"}])
        block_model = detector.build_block_model(results)

        low_conf_blocks = [b for b in block_model.blocks if b.low_confidence]
        high_conf_blocks = [b for b in block_model.blocks if not b.low_confidence]

        assert len(low_conf_blocks) == 1
        assert low_conf_blocks[0].category == "door"
        assert low_conf_blocks[0].confidence_score == 0.35
        assert len(high_conf_blocks) == 2

    def test_detection_summary_counts(self):
        """Summary should correctly count objects and categories."""
        agent = MockAgent()
        registry = _make_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        results, _ = detector.detect([make_jpeg_bytes()], [{"filename": "test.jpg"}])
        summary = detector.build_detection_summary(results)

        assert summary.total_objects == 3
        assert summary.low_confidence_count == 1
        assert set(summary.categories_detected) == {"power_outlet", "light_fixture", "door"}

    def test_has_agent_property(self):
        registry = _make_registry()
        assert ObjectDetector(agent=MockAgent(), registry=registry).has_agent is True
        assert ObjectDetector(agent=None, registry=registry).has_agent is False


# ---------------------------------------------------------------------------
# Integration tests — POST /detect endpoint
# ---------------------------------------------------------------------------

class TestDetectEndpoint:
    def test_valid_image_returns_200(self):
        """POST /detect with a valid image returns 200 with block_model and summary."""
        client = _build_test_app(agent=MockAgent())
        img_bytes = make_jpeg_bytes(640, 480)
        metadata = _make_metadata(["wall_north.jpg"])

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("wall_north.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "block_model" in data
        assert "detection_summary" in data
        assert data["session_id"] == "test-session-123"

        # Check block_model structure
        bm = data["block_model"]
        assert "blocks" in bm
        assert "room_dimensions" in bm
        assert len(bm["blocks"]) == 3

        # Check summary
        summary = data["detection_summary"]
        assert summary["total_objects"] == 3
        assert summary["low_confidence_count"] == 1
        assert "power_outlet" in summary["categories_detected"]

    def test_too_small_image_returns_422(self):
        """POST /detect with an image below 480x480 returns 422."""
        client = _build_test_app(agent=MockAgent())
        img_bytes = make_jpeg_bytes(320, 240)
        metadata = _make_metadata(["tiny.jpg"])

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("tiny.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "insufficient_image_quality"
        assert any("320x240" in d for d in data["details"])

    def test_unsupported_format_returns_422(self):
        """POST /detect with an unsupported format returns 422."""
        client = _build_test_app(agent=MockAgent())
        metadata = _make_metadata(["document.pdf"])

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("document.pdf", b"fake pdf content", "application/pdf"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "insufficient_image_quality"
        assert any("unsupported format" in d for d in data["details"])

    def test_no_agent_returns_422(self):
        """POST /detect without an agent configured returns 422."""
        client = _build_test_app(agent=None)
        img_bytes = make_jpeg_bytes()
        metadata = _make_metadata()

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "no_agent_configured"

    def test_agent_failure_returns_422(self):
        """POST /detect when agent raises returns 422."""
        client = _build_test_app(agent=FailingAgent())
        img_bytes = make_jpeg_bytes()
        metadata = _make_metadata()

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "detection_failed"

    def test_invalid_metadata_json_returns_422(self):
        """POST /detect with invalid metadata JSON returns 422."""
        client = _build_test_app(agent=MockAgent())
        img_bytes = make_jpeg_bytes()

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": "not valid json {{{"},
        )

        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "invalid_metadata"

    def test_multiple_images(self):
        """POST /detect with multiple images processes all of them."""
        client = _build_test_app(agent=MockAgent())
        img1 = make_jpeg_bytes(640, 480)
        img2 = make_png_bytes(800, 600)
        metadata = _make_metadata(["wall_north.jpg", "wall_south.png"])

        response = client.post(
            "/api/v1/detect",
            files=[
                ("images", ("wall_north.jpg", img1, "image/jpeg")),
                ("images", ("wall_south.png", img2, "image/png")),
            ],
            data={"metadata": metadata},
        )

        assert response.status_code == 200
        data = response.json()
        # 3 detections per image × 2 images = 6 total
        assert data["detection_summary"]["total_objects"] == 6

    def test_low_confidence_blocks_flagged_in_response(self):
        """Blocks with confidence < 0.5 have low_confidence=True in the response."""
        client = _build_test_app(agent=MockAgent())
        img_bytes = make_jpeg_bytes()
        metadata = _make_metadata(["test.jpg"])

        response = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )

        assert response.status_code == 200
        blocks = response.json()["block_model"]["blocks"]
        low_conf = [b for b in blocks if b["low_confidence"]]
        high_conf = [b for b in blocks if not b["low_confidence"]]
        assert len(low_conf) == 1
        assert low_conf[0]["confidence_score"] == 0.35
        assert len(high_conf) == 2
