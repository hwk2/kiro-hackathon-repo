# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
BlockModel JSON serialization/deserialization with schema validation.

Provides ``serialize``, ``deserialize``, and ``verify_round_trip``
functions for converting :class:`BlockModel` instances to and from
JSON strings with full round-trip integrity.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from room_vision_ai.models import BlockModel

logger = logging.getLogger("room_vision_ai")


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


@dataclass
class SerializationError:
    """Structured error describing a schema violation."""

    field_path: str
    violation: str

    def __str__(self) -> str:
        return f"{self.field_path}: {self.violation}"


class DeserializationError(Exception):
    """Raised when JSON cannot be deserialized into a BlockModel.

    Attributes
    ----------
    errors : list[SerializationError]
        One or more structured errors describing the violations found.
    """

    def __init__(self, errors: list[SerializationError]) -> None:
        self.errors = errors
        first = errors[0] if errors else SerializationError("unknown", "unknown error")
        super().__init__(f"Deserialization failed: {first}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def serialize(block_model: BlockModel) -> str:
    """Serialize a :class:`BlockModel` to a JSON string.

    Uses Pydantic's ``model_dump(mode="json")`` to ensure that UUID
    and datetime objects are properly converted to JSON-safe types.

    Parameters
    ----------
    block_model:
        The block model to serialize.

    Returns
    -------
    str
        A JSON string representation of the block model.
    """
    data = block_model.model_dump(mode="json")
    return json.dumps(data, indent=2)


def deserialize(json_str: str) -> BlockModel:
    """Deserialize a JSON string into a :class:`BlockModel`.

    Parameters
    ----------
    json_str:
        A JSON string conforming to the BlockModel schema.

    Returns
    -------
    BlockModel
        The reconstructed block model.

    Raises
    ------
    DeserializationError
        If the JSON is malformed or does not conform to the schema.
    """
    # Step 1: Parse raw JSON
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise DeserializationError([
            SerializationError(
                field_path="<root>",
                violation=f"Invalid JSON syntax: {exc.msg} (line {exc.lineno}, col {exc.colno})",
            )
        ]) from exc

    # Step 2: Validate against Pydantic schema
    try:
        return BlockModel.model_validate(data)
    except ValidationError as exc:
        errors = _pydantic_errors_to_serialization_errors(exc)
        raise DeserializationError(errors) from exc


def verify_round_trip(block_model: BlockModel) -> bool:
    """Verify that serializing and deserializing produces an equivalent model.

    Parameters
    ----------
    block_model:
        The block model to test.

    Returns
    -------
    bool
        ``True`` if the round-trip produces an equivalent model.
    """
    try:
        json_str = serialize(block_model)
        restored = deserialize(json_str)
    except DeserializationError:
        return False

    return _models_equivalent(block_model, restored)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _pydantic_errors_to_serialization_errors(
    exc: ValidationError,
) -> list[SerializationError]:
    """Convert Pydantic validation errors to our structured format."""
    errors: list[SerializationError] = []
    for err in exc.errors():
        loc_parts = [str(p) for p in err.get("loc", [])]
        field_path = ".".join(loc_parts) if loc_parts else "<root>"
        violation = err.get("msg", "validation error")
        error_type = err.get("type", "")
        if error_type:
            violation = f"{violation} [{error_type}]"
        errors.append(SerializationError(field_path=field_path, violation=violation))
    return errors or [SerializationError(field_path="<root>", violation="Unknown validation error")]


def _models_equivalent(a: BlockModel, b: BlockModel) -> bool:
    """Deep-compare two BlockModel instances for equivalence.

    Compares the JSON-serialized forms to handle UUID/datetime
    normalization consistently.
    """
    a_data = a.model_dump(mode="json")
    b_data = b.model_dump(mode="json")
    return a_data == b_data
