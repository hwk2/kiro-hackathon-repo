# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Local-only training feedback storage.

This module provides **local filesystem storage only** for training feedback
data.  No data is ever transmitted to any external service, network endpoint,
or third-party API.  All feedback JSON files are written to and read from a
designated directory on the local machine.

Privacy guarantee:
    - No HTTP calls are made by this module.
    - No sockets are opened.
    - No external dependencies are used for storage.
    - Data stays on the user's local filesystem at all times.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from room_vision_ai.models import TrainingFeedback

logger = logging.getLogger("room_vision_ai")

# Default storage directory — relative to the project root
_DEFAULT_FEEDBACK_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "feedback"


class FeedbackStore:
    """Local-only storage for TrainingFeedback JSON files.

    All data is persisted as individual JSON files in a local directory.
    **No data is ever transmitted externally.**  This class performs only
    local filesystem reads and writes.

    Parameters
    ----------
    storage_dir : Path | None
        Directory where feedback JSON files are stored.
        Defaults to ``<project_root>/data/feedback/``.
    """

    def __init__(self, storage_dir: Path | None = None) -> None:
        self._storage_dir = storage_dir or _DEFAULT_FEEDBACK_DIR
        self._ensure_directory()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save(self, feedback: TrainingFeedback) -> str:
        """Persist a TrainingFeedback instance as a JSON file.

        Uses atomic writes (write to a temporary file, then rename) to
        prevent corruption from interrupted writes.

        Parameters
        ----------
        feedback : TrainingFeedback
            Validated feedback instance to store.

        Returns
        -------
        str
            The ``feedback_id`` of the saved feedback.
        """
        feedback_id = str(feedback.feedback_id)
        target = self._storage_dir / f"{feedback_id}.json"

        # Serialize to JSON matching the design spec schema
        data = feedback.model_dump(mode="json")

        # Atomic write: write to temp file in the same directory, then rename
        fd, tmp_path = tempfile.mkstemp(
            dir=self._storage_dir, suffix=".tmp", prefix=".feedback_"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, target)
            logger.info("Saved feedback %s to %s", feedback_id, target)
        except Exception:
            # Clean up the temp file on failure
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

        return feedback_id

    def get_feedback(self, feedback_id: str) -> Optional[TrainingFeedback]:
        """Load a specific feedback entry by ID.

        Parameters
        ----------
        feedback_id : str
            UUID string of the feedback to retrieve.

        Returns
        -------
        TrainingFeedback | None
            The deserialized feedback, or ``None`` if the file does not exist
            or cannot be parsed.
        """
        path = self._storage_dir / f"{feedback_id}.json"
        if not path.is_file():
            logger.warning("Feedback file not found: %s", path)
            return None

        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return TrainingFeedback(**raw)
        except Exception:
            logger.exception("Failed to load feedback from %s", path)
            return None

    def list_feedback(self) -> List[str]:
        """List all stored feedback IDs.

        Returns
        -------
        list[str]
            Sorted list of feedback ID strings (without the ``.json`` extension).
        """
        if not self._storage_dir.is_dir():
            return []

        ids: list[str] = []
        for entry in self._storage_dir.iterdir():
            if entry.suffix == ".json" and entry.stem != ".gitkeep":
                ids.append(entry.stem)
        return sorted(ids)

    def get_all_feedback(self) -> List[TrainingFeedback]:
        """Load all stored feedback entries.

        Entries that fail to parse are skipped with a logged warning.

        Returns
        -------
        list[TrainingFeedback]
            All successfully loaded feedback instances.
        """
        results: list[TrainingFeedback] = []
        for feedback_id in self.list_feedback():
            fb = self.get_feedback(feedback_id)
            if fb is not None:
                results.append(fb)
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_directory(self) -> None:
        """Create the storage directory if it does not exist."""
        self._storage_dir.mkdir(parents=True, exist_ok=True)
