# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the BlockModelSerializer module (tasks 5.6–5.9)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from room_vision_ai.block_model_serializer import (
    DeserializationError,
    SerializationError,
    deserialize,
    serialize,
    verify_round_trip,
)
from room_vision_ai.models import (
    Block,
    BlockModel,
    Dimensions3D,
    Position3D,
    RoomDimensions,
    Rotation3D,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_block(**overrides) -> Block:
    defaults = dict(
        category="power_outlet",
        label="Power Outlet",
        description="Standard dual power outlet on north wall, 30cm above floor level.",
        confidence_score=0.87,
        low_confidence=False,
        position=Position3D(x=1.2, y=0.3, z=0.0),
        dimensions=Dimensions3D(width=0.08, height=0.12, depth=0.03),
        rotation=Rotation3D(pitch=0.0, yaw=0.0, roll=0.0),
        source_images=["wall_north.jpg"],
    )
    defaults.update(overrides)
    return Block(**defaults)


def _make_block_model(**overrides) -> BlockModel:
    defaults = dict(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[_make_block()],
    )
    defaults.update(overrides)
    return BlockModel(**defaults)


# ---------------------------------------------------------------------------
# Task 5.6 — Serialize BlockModel to JSON
# ---------------------------------------------------------------------------

class TestSerialize:
    """Task 5.6: serialize BlockModel to JSON."""

    def test_serialize_returns_valid_json(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        data = json.loads(json_str)

        assert "model_id" in data
        assert "created_at" in data
        assert "room_dimensions" in data
        assert "blocks" in data
        assert "version" in data

    def test_serialize_block_fields(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        data = json.loads(json_str)

        block = data["blocks"][0]
        assert block["category"] == "power_outlet"
        assert block["label"] == "Power Outlet"
        assert block["confidence_score"] == 0.87
        assert block["low_confidence"] is False
        assert "block_id" in block
        assert "position" in block
        assert "dimensions" in block
        assert "rotation" in block
        assert "source_images" in block

    def test_serialize_room_dimensions(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        data = json.loads(json_str)

        rd = data["room_dimensions"]
        assert rd["width"] == 5.0
        assert rd["height"] == 2.8
        assert rd["depth"] == 4.0
        assert rd["unit"] == "meters"

    def test_serialize_uuid_as_string(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        data = json.loads(json_str)

        # UUIDs should be serialized as strings
        assert isinstance(data["model_id"], str)
        assert isinstance(data["blocks"][0]["block_id"], str)

    def test_serialize_empty_blocks(self) -> None:
        model = _make_block_model(blocks=[])
        json_str = serialize(model)
        data = json.loads(json_str)

        assert data["blocks"] == []


# ---------------------------------------------------------------------------
# Task 5.7 — Deserialize JSON back to BlockModel
# ---------------------------------------------------------------------------

class TestDeserialize:
    """Task 5.7: deserialize JSON to BlockModel with validation."""

    def test_deserialize_valid_json(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        restored = deserialize(json_str)

        assert isinstance(restored, BlockModel)
        assert len(restored.blocks) == 1
        assert restored.blocks[0].category == "power_outlet"

    def test_deserialize_preserves_room_dimensions(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        restored = deserialize(json_str)

        assert restored.room_dimensions.width == 5.0
        assert restored.room_dimensions.height == 2.8
        assert restored.room_dimensions.depth == 4.0

    def test_deserialize_invalid_json_syntax(self) -> None:
        with pytest.raises(DeserializationError) as exc_info:
            deserialize("{not valid json")

        assert len(exc_info.value.errors) > 0
        assert "Invalid JSON syntax" in exc_info.value.errors[0].violation

    def test_deserialize_missing_required_field(self) -> None:
        """Missing room_dimensions should raise a descriptive error."""
        data = {
            "model_id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            "blocks": [],
            "version": "1.0",
            # room_dimensions is missing
        }
        with pytest.raises(DeserializationError) as exc_info:
            deserialize(json.dumps(data))

        errors = exc_info.value.errors
        assert len(errors) > 0
        assert "room_dimensions" in errors[0].field_path

    def test_deserialize_wrong_type(self) -> None:
        """Wrong type for a field should raise a descriptive error."""
        data = {
            "model_id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            "room_dimensions": {
                "width": "not_a_number",
                "height": 2.8,
                "depth": 4.0,
            },
            "blocks": [],
            "version": "1.0",
        }
        with pytest.raises(DeserializationError) as exc_info:
            deserialize(json.dumps(data))

        errors = exc_info.value.errors
        assert len(errors) > 0


# ---------------------------------------------------------------------------
# Task 5.8 — Round-trip integrity
# ---------------------------------------------------------------------------

class TestRoundTrip:
    """Task 5.8: serialize → deserialize produces equivalent BlockModel."""

    def test_round_trip_single_block(self) -> None:
        model = _make_block_model()
        assert verify_round_trip(model) is True

    def test_round_trip_multiple_blocks(self) -> None:
        blocks = [
            _make_block(category="power_outlet", confidence_score=0.87),
            _make_block(category="door", confidence_score=0.35,
                        low_confidence=True,
                        position=Position3D(x=2.0, y=1.0, z=0.0),
                        dimensions=Dimensions3D(width=0.9, height=2.0, depth=0.05)),
        ]
        model = _make_block_model(blocks=blocks)
        assert verify_round_trip(model) is True

    def test_round_trip_empty_blocks(self) -> None:
        model = _make_block_model(blocks=[])
        assert verify_round_trip(model) is True

    def test_round_trip_preserves_all_fields(self) -> None:
        model = _make_block_model()
        json_str = serialize(model)
        restored = deserialize(json_str)

        orig_data = model.model_dump(mode="json")
        rest_data = restored.model_dump(mode="json")
        assert orig_data == rest_data


# ---------------------------------------------------------------------------
# Task 5.9 — Malformed JSON error handling
# ---------------------------------------------------------------------------

class TestMalformedJsonErrors:
    """Task 5.9: descriptive errors for malformed JSON."""

    def test_invalid_json_syntax_error(self) -> None:
        with pytest.raises(DeserializationError) as exc_info:
            deserialize("{{{{")

        err = exc_info.value.errors[0]
        assert err.field_path == "<root>"
        assert "Invalid JSON syntax" in err.violation

    def test_missing_required_fields_error(self) -> None:
        with pytest.raises(DeserializationError) as exc_info:
            deserialize("{}")

        errors = exc_info.value.errors
        assert len(errors) > 0
        # Should identify the missing field
        field_paths = [e.field_path for e in errors]
        assert any("room_dimensions" in fp for fp in field_paths)

    def test_wrong_type_error(self) -> None:
        data = {
            "model_id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            "room_dimensions": "not_an_object",
            "blocks": [],
            "version": "1.0",
        }
        with pytest.raises(DeserializationError) as exc_info:
            deserialize(json.dumps(data))

        errors = exc_info.value.errors
        assert len(errors) > 0

    def test_out_of_range_confidence_error(self) -> None:
        data = {
            "model_id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            "room_dimensions": {"width": 5.0, "height": 2.8, "depth": 4.0},
            "blocks": [{
                "block_id": str(uuid4()),
                "category": "door",
                "label": "Door",
                "confidence_score": 1.5,  # out of range
                "dimensions": {"width": 0.9, "height": 2.0, "depth": 0.05},
                "source_images": [],
            }],
            "version": "1.0",
        }
        with pytest.raises(DeserializationError) as exc_info:
            deserialize(json.dumps(data))

        errors = exc_info.value.errors
        assert len(errors) > 0

    def test_negative_dimensions_error(self) -> None:
        data = {
            "model_id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            "room_dimensions": {"width": -1.0, "height": 2.8, "depth": 4.0},
            "blocks": [],
            "version": "1.0",
        }
        with pytest.raises(DeserializationError) as exc_info:
            deserialize(json.dumps(data))

        errors = exc_info.value.errors
        assert len(errors) > 0

    def test_error_has_field_path_and_violation(self) -> None:
        """Every error should have both field_path and violation."""
        with pytest.raises(DeserializationError) as exc_info:
            deserialize("{}")

        for err in exc_info.value.errors:
            assert isinstance(err.field_path, str)
            assert len(err.field_path) > 0
            assert isinstance(err.violation, str)
            assert len(err.violation) > 0

    def test_error_str_representation(self) -> None:
        err = SerializationError(field_path="blocks.0.confidence_score",
                                  violation="value must be <= 1.0")
        assert "blocks.0.confidence_score" in str(err)
        assert "value must be <= 1.0" in str(err)
