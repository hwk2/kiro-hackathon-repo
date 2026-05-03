# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Shared test fixtures for the Room Vision AI pipeline."""

import pytest
from fastapi.testclient import TestClient

from room_vision_ai.main import app


@pytest.fixture
def client():
    """Create a FastAPI test client with lifespan events."""
    with TestClient(app) as c:
        yield c
