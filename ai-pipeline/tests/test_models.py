# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for Pydantic data models."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from room_vision_ai.models import (
    AgentConfig,
    AgentType,
    Block,
    BlockModel,
    BoundingBox,
    Detection,
    DetectionResult,
    DetectionSummary,
    DetectResponse,
    Dimensions3D,
    ErrorResponse,
    ImageFormat,
    ImageMetadata,
    ManipulateRequest,
    ManipulateResponse,
    PluginCategory,
    PluginManifest,
    PluginRule,
    Position3D,
    ResponseOption,
    Rotation3D,
    RoomDimensions,
    TrainingFeedback,
)


# --- Geometry primitives ---

def test_position3d_defaults():
    pos = Position3D()
    assert pos.x == 0.0 and pos.y == 0.0 and pos.z == 0.0


def test_dimensions3d_rejects_zero():
    with pytest.raises(ValidationError):
        Dimensions3D(width=0, height=1, depth=1)


def test_dimensions3d_rejects_negative():
    with pytest.raises(ValidationError):
        Dimensions3D(width=1, height=-1, depth=1)


def test_rotation3d_defaults():
    rot = Rotation3D()
    assert rot.pitch == 0.0 and rot.yaw == 0.0 and rot.roll == 0.0


# --- Room dimensions ---

def test_room_dimensions_valid():
    rd = RoomDimensions(width=5.0, height=2.8, depth=4.0)
    assert rd.unit == "meters"


def test_room_dimensions_rejects_zero():
    with pytest.raises(ValidationError):
        RoomDimensions(width=0, height=2.8, depth=4.0)


# --- Block and BlockModel ---

def _make_block(**overrides):
    defaults = dict(
        category="power_outlet",
        label="Power Outlet",
        confidence_score=0.87,
        dimensions=Dimensions3D(width=0.08, height=0.12, depth=0.03),
    )
    defaults.update(overrides)
    return Block(**defaults)


def test_block_auto_generates_uuid():
    b = _make_block()
    assert b.block_id is not None


def test_block_confidence_score_range():
    with pytest.raises(ValidationError):
        _make_block(confidence_score=1.5)
    with pytest.raises(ValidationError):
        _make_block(confidence_score=-0.1)


def test_block_model_valid():
    bm = BlockModel(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[_make_block()],
    )
    assert bm.version == "1.0"
    assert len(bm.blocks) == 1


# --- Detection models ---

def test_bounding_box():
    bb = BoundingBox(x_min=10, y_min=20, x_max=100, y_max=200)
    assert bb.x_min == 10


def test_detection_result():
    dr = DetectionResult(
        image_filename="wall.jpg",
        detections=[
            Detection(
                category="door",
                confidence_score=0.9,
                bounding_box=BoundingBox(x_min=0, y_min=0, x_max=100, y_max=200),
            )
        ],
    )
    assert len(dr.detections) == 1


# --- Image metadata ---

def test_image_metadata_valid():
    im = ImageMetadata(
        filename="wall.jpg",
        format=ImageFormat.JPEG,
        width=1920,
        height=1080,
        captured_at=datetime.now(UTC),
        file_size_bytes=245760,
    )
    assert im.format == ImageFormat.JPEG


def test_image_metadata_rejects_small_resolution():
    with pytest.raises(ValidationError):
        ImageMetadata(
            filename="tiny.jpg",
            format=ImageFormat.JPEG,
            width=100,
            height=100,
            captured_at=datetime.now(UTC),
            file_size_bytes=1000,
        )


def test_image_metadata_rejects_zero_file_size():
    with pytest.raises(ValidationError):
        ImageMetadata(
            filename="empty.jpg",
            format=ImageFormat.JPEG,
            width=480,
            height=480,
            captured_at=datetime.now(UTC),
            file_size_bytes=0,
        )


# --- Agent config ---

def test_agent_config_ollama():
    ac = AgentConfig(
        agent_type=AgentType.OLLAMA,
        model_name="llava:13b",
        endpoint="http://localhost:11434",
    )
    assert ac.timeout_seconds == 120
    assert ac.max_retries == 2
    assert ac.api_key is None


def test_agent_config_gemini():
    ac = AgentConfig(
        agent_type=AgentType.GEMINI,
        model_name="gemini-1.5-flash",
        endpoint="https://generativelanguage.googleapis.com",
        api_key="test-key",
    )
    assert ac.agent_type == AgentType.GEMINI


# --- Plugin models ---

def test_plugin_manifest():
    pm = PluginManifest(
        plugin_id="test-plugin",
        name="Test Plugin",
        version="1.0.0",
        author="Test Author",
        categories=[
            PluginCategory(id="test_cat", label="Test Category")
        ],
        rules=[
            PluginRule(id="test_rule", label="Test Rule")
        ],
    )
    assert pm.categories[0].source == "plugin"
    assert pm.rules[0].source == "plugin"


# --- API models ---

def test_error_response():
    er = ErrorResponse(
        error="test_error",
        message="Something went wrong",
        details=["detail1"],
    )
    assert er.error == "test_error"


def test_detection_summary():
    ds = DetectionSummary(
        total_objects=5,
        low_confidence_count=1,
        categories_detected=["door", "window"],
    )
    assert ds.total_objects == 5
