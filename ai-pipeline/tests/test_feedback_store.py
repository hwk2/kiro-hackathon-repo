# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the FeedbackStore module and POST /feedback endpoint."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from room_vision_ai.feedback_store import FeedbackStore
from room_vision_ai.models import (
    BlockModel,
    Dimensions3D,
    ResponseOption,
    RoomDimensions,
    TrainingFeedback,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_block_model() -> BlockModel:
    """Create a minimal valid BlockModel for testing."""
    return BlockModel(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[],
    )


def _make_feedback(**overrides) -> TrainingFeedback:
    """Create a valid TrainingFeedback instance with optional overrides."""
    block_model = _make_block_model()
    defaults = dict(
        session_id=uuid4(),
        prompt="Make this room safer for a toddler",
        original_block_model_id=block_model.model_id,
        response_options=[
            ResponseOption(
                option_index=0,
                description="Added outlet covers.",
                rules_applied=["cover_outlets"],
                block_model=block_model,
            ),
        ],
        selected_option_index=0,
        dismissed=False,
    )
    defaults.update(overrides)
    return TrainingFeedback(**defaults)


# ---------------------------------------------------------------------------
# FeedbackStore unit tests
# ---------------------------------------------------------------------------

class TestFeedbackStoreSaveAndRetrieve:
    """Task 8.1 / 8.2 / 8.4 — save, retrieve, and list feedback."""

    def test_save_creates_json_file(self, tmp_path: Path) -> None:
        """Saving feedback creates a {feedback_id}.json file."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback()

        feedback_id = store.save(fb)

        expected_file = tmp_path / f"{feedback_id}.json"
        assert expected_file.is_file()

    def test_save_returns_feedback_id(self, tmp_path: Path) -> None:
        """save() returns the feedback_id as a string."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback()

        feedback_id = store.save(fb)

        assert feedback_id == str(fb.feedback_id)

    def test_saved_json_matches_schema(self, tmp_path: Path) -> None:
        """The saved JSON contains all expected top-level keys."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback()
        feedback_id = store.save(fb)

        raw = json.loads((tmp_path / f"{feedback_id}.json").read_text())

        expected_keys = {
            "feedback_id",
            "session_id",
            "created_at",
            "prompt",
            "original_block_model_id",
            "response_options",
            "selected_option_index",
            "dismissed",
        }
        assert expected_keys.issubset(raw.keys())

    def test_get_feedback_round_trip(self, tmp_path: Path) -> None:
        """Saving then loading feedback preserves all fields."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback()
        feedback_id = store.save(fb)

        loaded = store.get_feedback(feedback_id)

        assert loaded is not None
        assert loaded.feedback_id == fb.feedback_id
        assert loaded.session_id == fb.session_id
        assert loaded.prompt == fb.prompt
        assert loaded.original_block_model_id == fb.original_block_model_id
        assert loaded.selected_option_index == fb.selected_option_index
        assert loaded.dismissed == fb.dismissed
        assert len(loaded.response_options) == len(fb.response_options)

    def test_list_feedback_returns_ids(self, tmp_path: Path) -> None:
        """list_feedback() returns all stored feedback IDs."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb1 = _make_feedback()
        fb2 = _make_feedback()
        store.save(fb1)
        store.save(fb2)

        ids = store.list_feedback()

        assert len(ids) == 2
        assert str(fb1.feedback_id) in ids
        assert str(fb2.feedback_id) in ids

    def test_get_all_feedback(self, tmp_path: Path) -> None:
        """get_all_feedback() loads every stored entry."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb1 = _make_feedback()
        fb2 = _make_feedback()
        store.save(fb1)
        store.save(fb2)

        all_fb = store.get_all_feedback()

        assert len(all_fb) == 2
        loaded_ids = {str(f.feedback_id) for f in all_fb}
        assert str(fb1.feedback_id) in loaded_ids
        assert str(fb2.feedback_id) in loaded_ids


class TestFeedbackStoreGracefulHandling:
    """Task 8.4 — handle missing files gracefully."""

    def test_get_missing_feedback_returns_none(self, tmp_path: Path) -> None:
        """get_feedback() returns None for a non-existent ID."""
        store = FeedbackStore(storage_dir=tmp_path)

        result = store.get_feedback("non-existent-id")

        assert result is None

    def test_list_empty_directory(self, tmp_path: Path) -> None:
        """list_feedback() returns an empty list for an empty directory."""
        store = FeedbackStore(storage_dir=tmp_path)

        ids = store.list_feedback()

        assert ids == []

    def test_get_all_empty_directory(self, tmp_path: Path) -> None:
        """get_all_feedback() returns an empty list for an empty directory."""
        store = FeedbackStore(storage_dir=tmp_path)

        all_fb = store.get_all_feedback()

        assert all_fb == []

    def test_corrupted_file_skipped(self, tmp_path: Path) -> None:
        """A corrupted JSON file is skipped gracefully."""
        store = FeedbackStore(storage_dir=tmp_path)
        # Write a corrupted file
        bad_file = tmp_path / "bad-id.json"
        bad_file.write_text("{invalid json", encoding="utf-8")

        result = store.get_feedback("bad-id")

        assert result is None

    def test_get_all_skips_corrupted(self, tmp_path: Path) -> None:
        """get_all_feedback() skips corrupted files and returns valid ones."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback()
        store.save(fb)
        # Add a corrupted file
        (tmp_path / "corrupted.json").write_text("not json", encoding="utf-8")

        all_fb = store.get_all_feedback()

        assert len(all_fb) == 1
        assert all_fb[0].feedback_id == fb.feedback_id


class TestFeedbackStoreDirectoryCreation:
    """Task 8.2 — directory creation."""

    def test_creates_directory_if_missing(self, tmp_path: Path) -> None:
        """FeedbackStore creates the storage directory if it doesn't exist."""
        new_dir = tmp_path / "nested" / "feedback"
        assert not new_dir.exists()

        store = FeedbackStore(storage_dir=new_dir)

        assert new_dir.is_dir()


class TestFeedbackStoreLocalOnly:
    """Task 8.3 — verify no external calls."""

    def test_no_network_imports(self) -> None:
        """The feedback_store module does not import networking libraries."""
        import room_vision_ai.feedback_store as mod
        import inspect

        source = inspect.getsource(mod)
        # Should not contain imports of networking libraries
        assert "import httpx" not in source
        assert "import requests" not in source
        assert "import urllib" not in source
        assert "import socket" not in source
        assert "import http.client" not in source

    def test_module_docstring_states_local_only(self) -> None:
        """The module docstring explicitly states local-only storage."""
        import room_vision_ai.feedback_store as mod

        assert mod.__doc__ is not None
        doc_lower = mod.__doc__.lower()
        assert "local" in doc_lower
        assert "no" in doc_lower and "external" in doc_lower


# ---------------------------------------------------------------------------
# POST /feedback API endpoint tests
# ---------------------------------------------------------------------------

class TestFeedbackEndpoint:
    """Integration tests for POST /api/v1/feedback."""

    def test_submit_feedback_returns_id(self, client, tmp_path: Path) -> None:
        """POST /feedback stores feedback and returns the feedback_id."""
        from room_vision_ai.api_server import _feedback_store

        fb = _make_feedback()
        payload = fb.model_dump(mode="json")

        response = client.post("/api/v1/feedback", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "feedback_id" in data
        assert data["feedback_id"] == str(fb.feedback_id)

    def test_submit_feedback_persists_to_disk(self, client) -> None:
        """POST /feedback actually writes a file that can be retrieved."""
        from room_vision_ai import api_server

        fb = _make_feedback()
        payload = fb.model_dump(mode="json")

        response = client.post("/api/v1/feedback", json=payload)
        assert response.status_code == 200

        # Verify the feedback store can retrieve it
        if api_server._feedback_store is not None:
            loaded = api_server._feedback_store.get_feedback(
                str(fb.feedback_id)
            )
            assert loaded is not None
            assert loaded.prompt == fb.prompt

    def test_submit_invalid_feedback_returns_422(self, client) -> None:
        """POST /feedback with invalid data returns 422."""
        response = client.post("/api/v1/feedback", json={"bad": "data"})

        assert response.status_code == 422
