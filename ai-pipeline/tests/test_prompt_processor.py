# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for PromptProcessor and POST /manipulate endpoint (Tasks 6.1–6.9)."""

from __future__ import annotations

import json
from typing import Any, List
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.api_server import configure, router
from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.models import (
    AgentConfig,
    AgentType,
    BlockModel,
    Dimensions3D,
    Position3D,
    RoomDimensions,
    Block,
)
from room_vision_ai.prompt_processor import PromptProcessor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_registry() -> CategoryRegistry:
    """Create a registry with core categories and rules."""
    registry = CategoryRegistry()
    registry.add_categories([
        {"id": "power_outlet", "label": "Power Outlet", "source": "core"},
        {"id": "light_fixture", "label": "Light Fixture", "source": "core"},
        {"id": "stairs", "label": "Stairs", "source": "core"},
        {"id": "sharp_edge_furniture", "label": "Sharp-Edged Furniture", "source": "core"},
        {"id": "furniture", "label": "Furniture", "source": "core"},
        {"id": "rug", "label": "Rug", "source": "core"},
        {"id": "cord_cable", "label": "Cord/Cable", "source": "core"},
        {"id": "handrail", "label": "Handrail", "source": "core"},
    ])
    registry.add_rules([
        {"id": "cover_outlets", "label": "Cover Power Outlets", "applies_to": ["child_safety"], "target_categories": ["power_outlet"], "source": "core"},
        {"id": "corner_guards", "label": "Add Corner Guards", "applies_to": ["child_safety"], "target_categories": ["sharp_edge_furniture"], "source": "core"},
        {"id": "child_gate_stairs", "label": "Add Child Gate at Stairs", "applies_to": ["child_safety"], "target_categories": ["stairs"], "source": "core"},
        {"id": "secure_heavy_objects", "label": "Secure Heavy/Tall Objects", "applies_to": ["child_safety"], "target_categories": ["furniture"], "source": "core"},
        {"id": "add_handrails", "label": "Add Handrails Near Stairs", "applies_to": ["elderly_accessibility"], "target_categories": ["stairs"], "source": "core"},
        {"id": "ensure_lighting", "label": "Ensure Adequate Lighting", "applies_to": ["elderly_accessibility"], "target_categories": ["light_fixture"], "source": "core"},
        {"id": "remove_trip_hazards", "label": "Remove Trip Hazards", "applies_to": ["elderly_accessibility"], "target_categories": ["rug", "cord_cable"], "source": "core"},
        {"id": "widen_pathways", "label": "Widen Pathways", "applies_to": ["elderly_accessibility"], "target_categories": ["furniture"], "source": "core"},
    ])
    return registry


def _make_block_model_dict() -> dict[str, Any]:
    """Return a minimal valid BlockModel dict."""
    model = BlockModel(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[
            Block(
                category="power_outlet",
                label="Power Outlet",
                confidence_score=0.9,
                position=Position3D(x=1.0, y=0.3, z=0.0),
                dimensions=Dimensions3D(width=0.08, height=0.12, depth=0.03),
            ),
            Block(
                category="stairs",
                label="Stairs",
                confidence_score=0.85,
                position=Position3D(x=3.0, y=0.0, z=2.0),
                dimensions=Dimensions3D(width=1.0, height=2.5, depth=3.0),
            ),
            Block(
                category="furniture",
                label="Bookshelf",
                confidence_score=0.88,
                position=Position3D(x=0.5, y=0.0, z=1.0),
                dimensions=Dimensions3D(width=0.8, height=1.8, depth=0.4),
            ),
            Block(
                category="rug",
                label="Rug",
                confidence_score=0.75,
                position=Position3D(x=2.0, y=0.0, z=2.0),
                dimensions=Dimensions3D(width=2.0, height=0.02, depth=1.5),
            ),
        ],
    )
    return model.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Mock agent for testing
# ---------------------------------------------------------------------------

class MockManipulationAgent(AgentInterface):
    """Agent that returns predictable manipulation results."""

    def __init__(self, options: list[dict] | None = None):
        config = AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="mock",
            endpoint="http://localhost:11434",
        )
        super().__init__(config)
        self._options = options

    def detect_objects(self, images: List[bytes], metadata: List[dict]) -> List[dict]:
        return []

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict],
    ) -> List[dict]:
        if self._options is not None:
            return self._options
        return []

    def health_check(self) -> dict:
        return {"status": "ok"}


class FailingManipulationAgent(AgentInterface):
    """Agent that always raises."""

    def __init__(self):
        config = AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="failing",
            endpoint="http://localhost:11434",
        )
        super().__init__(config)

    def detect_objects(self, images, metadata):
        return []

    def generate_manipulation(self, prompt, block_model, rules):
        raise RuntimeError("Agent exploded")

    def health_check(self):
        return {"status": "error"}


# ---------------------------------------------------------------------------
# Build test app helper
# ---------------------------------------------------------------------------

def _build_test_app(
    agent: AgentInterface | None = None,
    registry: CategoryRegistry | None = None,
) -> TestClient:
    reg = registry or _make_registry()
    processor = PromptProcessor(agent=agent, registry=reg)

    test_app = FastAPI()
    test_app.include_router(router)

    agent_config = agent.config if agent else None
    configure(
        agent_config=agent_config,
        plugins_loaded=0,
        agent=agent,
        category_registry=reg,
        object_detector=None,
        prompt_processor=processor,
    )
    return TestClient(test_app)


# ---------------------------------------------------------------------------
# Unit tests — intent detection
# ---------------------------------------------------------------------------

class TestIntentDetection:
    def test_child_safety_keywords(self):
        for kw in ["child", "toddler", "baby", "kid", "infant"]:
            intents = PromptProcessor.detect_intents(f"Make room safe for {kw}")
            assert "child_safety" in intents

    def test_elderly_keywords(self):
        for kw in ["elderly", "senior", "aging", "wheelchair", "accessible", "mobility"]:
            intents = PromptProcessor.detect_intents(f"Adapt for {kw} person")
            assert "elderly_accessibility" in intents

    def test_general_modification(self):
        intents = PromptProcessor.detect_intents("Rearrange the furniture")
        assert intents == ["general_modification"]

    def test_multiple_intents(self):
        intents = PromptProcessor.detect_intents(
            "Make safe for a child and an elderly person"
        )
        assert "child_safety" in intents
        assert "elderly_accessibility" in intents

    def test_case_insensitive(self):
        intents = PromptProcessor.detect_intents("Safe for TODDLER")
        assert "child_safety" in intents


# ---------------------------------------------------------------------------
# Unit tests — rule retrieval
# ---------------------------------------------------------------------------

class TestRuleRetrieval:
    def test_child_safety_rules(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        rules = processor._get_rules_for_intents(["child_safety"])
        rule_ids = {r["id"] for r in rules}
        assert "cover_outlets" in rule_ids
        assert "corner_guards" in rule_ids
        assert "child_gate_stairs" in rule_ids
        assert "secure_heavy_objects" in rule_ids

    def test_elderly_rules(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        rules = processor._get_rules_for_intents(["elderly_accessibility"])
        rule_ids = {r["id"] for r in rules}
        assert "add_handrails" in rule_ids
        assert "ensure_lighting" in rule_ids
        assert "remove_trip_hazards" in rule_ids
        assert "widen_pathways" in rule_ids

    def test_general_modification_no_rules(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        rules = processor._get_rules_for_intents(["general_modification"])
        assert len(rules) == 0


# ---------------------------------------------------------------------------
# Unit tests — PromptProcessor.process()
# ---------------------------------------------------------------------------

class TestPromptProcessorProcess:
    def test_returns_2_to_5_options(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        options = processor.process("Make safe for a child", _make_block_model_dict())
        assert 2 <= len(options) <= 5

    def test_each_option_has_required_fields(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        options = processor.process("Make safe for a toddler", _make_block_model_dict())
        for opt in options:
            assert isinstance(opt.option_index, int)
            assert isinstance(opt.description, str)
            assert isinstance(opt.rules_applied, list)
            assert opt.block_model is not None

    def test_rules_applied_in_options(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        options = processor.process("Make safe for a baby", _make_block_model_dict())
        # The first option should have all child safety rules applied
        all_rules = set()
        for opt in options:
            all_rules.update(opt.rules_applied)
        assert "cover_outlets" in all_rules

    def test_empty_prompt_raises(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        with pytest.raises(ValueError, match="empty"):
            processor.process("", _make_block_model_dict())

    def test_whitespace_prompt_raises(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        with pytest.raises(ValueError, match="empty"):
            processor.process("   ", _make_block_model_dict())

    def test_fallback_when_agent_fails(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=FailingManipulationAgent(), registry=registry)
        options = processor.process("Make safe for a child", _make_block_model_dict())
        assert 2 <= len(options) <= 5

    def test_general_prompt_returns_options(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        options = processor.process("Rearrange the furniture", _make_block_model_dict())
        assert 2 <= len(options) <= 5

    def test_option_indices_sequential(self):
        registry = _make_registry()
        processor = PromptProcessor(agent=None, registry=registry)
        options = processor.process("Make safe for a child", _make_block_model_dict())
        for i, opt in enumerate(options):
            assert opt.option_index == i


# ---------------------------------------------------------------------------
# Integration tests — POST /manipulate endpoint
# ---------------------------------------------------------------------------

class TestManipulateEndpoint:
    def test_valid_request_returns_200(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make this room safer for a toddler",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "prompt" in data
        assert "response_options" in data
        assert 2 <= len(data["response_options"]) <= 5

    def test_response_options_structure(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make safe for a child",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        data = response.json()
        for opt in data["response_options"]:
            assert "option_index" in opt
            assert "description" in opt
            assert "rules_applied" in opt
            assert "block_model" in opt
            assert isinstance(opt["rules_applied"], list)

    def test_empty_prompt_returns_422(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "invalid_prompt"

    def test_whitespace_prompt_returns_422(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "   ",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "invalid_prompt"

    def test_without_agent_falls_back_to_rules(self):
        client = _build_test_app(agent=None)
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make safe for a baby",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 200
        data = response.json()
        assert 2 <= len(data["response_options"]) <= 5
        # At least one option should have rules applied
        all_rules = set()
        for opt in data["response_options"]:
            all_rules.update(opt["rules_applied"])
        assert len(all_rules) > 0

    def test_elderly_prompt_applies_elderly_rules(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make accessible for an elderly person",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 200
        data = response.json()
        all_rules = set()
        for opt in data["response_options"]:
            all_rules.update(opt["rules_applied"])
        assert "add_handrails" in all_rules or "ensure_lighting" in all_rules

    def test_child_prompt_applies_child_rules(self):
        client = _build_test_app()
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make this room safe for a toddler",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 200
        data = response.json()
        all_rules = set()
        for opt in data["response_options"]:
            all_rules.update(opt["rules_applied"])
        assert "cover_outlets" in all_rules

    def test_response_contains_session_and_prompt(self):
        client = _build_test_app()
        sid = str(uuid4())
        prompt_text = "Make safe for a child"
        body = {
            "session_id": sid,
            "prompt": prompt_text,
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        data = response.json()
        assert data["session_id"] == sid
        assert data["prompt"] == prompt_text

    def test_agent_failure_falls_back(self):
        client = _build_test_app(agent=FailingManipulationAgent())
        body = {
            "session_id": str(uuid4()),
            "prompt": "Make safe for a child",
            "block_model": _make_block_model_dict(),
        }
        response = client.post("/api/v1/manipulate", json=body)
        assert response.status_code == 200
        data = response.json()
        assert 2 <= len(data["response_options"]) <= 5
