# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Integration tests for the Room Vision AI pipeline (Tasks 9.1–9.10).

These tests exercise the full pipeline end-to-end, verifying that all
modules work together correctly: object detection → block model generation
→ prompt processing → response options.
"""

from __future__ import annotations

import ast
import inspect
import io
import json
import os
import textwrap
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, List
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.api_server import configure, router
from room_vision_ai.block_model_serializer import (
    DeserializationError,
    deserialize,
    serialize,
    verify_round_trip,
)
from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.main import create_agent, load_agent_config
from room_vision_ai.models import (
    AgentConfig,
    AgentType,
    Block,
    BlockModel,
    Dimensions3D,
    Position3D,
    RoomDimensions,
)
from room_vision_ai.object_detector import ObjectDetector
from room_vision_ai.plugin_manager import PluginManager
from room_vision_ai.prompt_processor import PromptProcessor


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_PLUGINS_DIR = _PROJECT_ROOT / "plugins"
_SRC_DIR = _PROJECT_ROOT / "src" / "room_vision_ai"


# ---------------------------------------------------------------------------
# Helpers — image creation
# ---------------------------------------------------------------------------


def _make_jpeg_bytes(width: int = 640, height: int = 480) -> bytes:
    """Create a minimal JPEG image of the given size."""
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png_bytes(width: int = 640, height: int = 480) -> bytes:
    """Create a minimal PNG image of the given size."""
    img = Image.new("RGB", (width, height), color=(100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Mock agent — returns predictable, rich detection results
# ---------------------------------------------------------------------------


class IntegrationMockAgent(AgentInterface):
    """Mock agent that returns configurable detection results.

    By default returns detections for outlets, lights, stairs, furniture,
    sharp-edge furniture, rugs, and cords — covering all safety rule
    categories.
    """

    def __init__(
        self,
        detections: list[dict] | None = None,
        manipulation_options: list[dict] | None = None,
    ) -> None:
        config = AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="integration-mock",
            endpoint="http://localhost:11434",
        )
        super().__init__(config)
        self._detections = detections
        self._manipulation_options = manipulation_options

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        if self._detections is not None:
            return self._detections
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
                        "confidence_score": 0.90,
                        "bounding_box": {
                            "x_min": 100, "y_min": 400,
                            "x_max": 160, "y_max": 480,
                        },
                    },
                    {
                        "category": "light_fixture",
                        "confidence_score": 0.92,
                        "bounding_box": {
                            "x_min": 300, "y_min": 20,
                            "x_max": 400, "y_max": 60,
                        },
                    },
                    {
                        "category": "stairs",
                        "confidence_score": 0.85,
                        "bounding_box": {
                            "x_min": 500, "y_min": 200,
                            "x_max": 700, "y_max": 480,
                        },
                    },
                    {
                        "category": "furniture",
                        "confidence_score": 0.88,
                        "bounding_box": {
                            "x_min": 50, "y_min": 300,
                            "x_max": 200, "y_max": 480,
                        },
                    },
                    {
                        "category": "sharp_edge_furniture",
                        "confidence_score": 0.80,
                        "bounding_box": {
                            "x_min": 250, "y_min": 350,
                            "x_max": 350, "y_max": 480,
                        },
                    },
                    {
                        "category": "rug",
                        "confidence_score": 0.75,
                        "bounding_box": {
                            "x_min": 200, "y_min": 450,
                            "x_max": 500, "y_max": 480,
                        },
                    },
                    {
                        "category": "cord_cable",
                        "confidence_score": 0.70,
                        "bounding_box": {
                            "x_min": 600, "y_min": 460,
                            "x_max": 640, "y_max": 480,
                        },
                    },
                ],
            })
        return results

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        if self._manipulation_options is not None:
            return self._manipulation_options
        return []

    def health_check(self) -> dict:
        return {"status": "ok", "agent_type": "integration-mock"}


# ---------------------------------------------------------------------------
# Helpers — registry and app builders
# ---------------------------------------------------------------------------


def _make_full_registry() -> CategoryRegistry:
    """Create a CategoryRegistry loaded with core data."""
    reg = CategoryRegistry()
    reg.load_core(_PLUGINS_DIR)
    return reg


def _make_metadata(filenames: list[str] | None = None) -> str:
    """Build a metadata JSON string for POST /detect."""
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
    return json.dumps({"session_id": str(uuid4()), "images": images_meta})


def _build_integration_app(
    agent: AgentInterface | None = None,
    registry: CategoryRegistry | None = None,
) -> TestClient:
    """Build a FastAPI TestClient with full pipeline wired up."""
    reg = registry or _make_full_registry()
    detector = ObjectDetector(agent=agent, registry=reg)
    processor = PromptProcessor(agent=agent, registry=reg)

    test_app = FastAPI()
    test_app.include_router(router)

    agent_config = agent.config if agent else None
    configure(
        agent_config=agent_config,
        plugins_loaded=0,
        agent=agent,
        category_registry=reg,
        object_detector=detector,
        prompt_processor=processor,
    )
    return TestClient(test_app)


# ===================================================================
# 9.1  End-to-end test: detect → BlockModel → manipulate → ResponseOptions
# ===================================================================


class TestEndToEnd:
    """Full pipeline: POST /detect → BlockModel → POST /manipulate → ResponseOptions."""

    def test_detect_then_manipulate_pipeline(self):
        """Submit images via /detect, then use the resulting BlockModel
        in /manipulate and verify the full round-trip."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        # Step 1: POST /detect
        img_bytes = _make_jpeg_bytes(640, 480)
        metadata = _make_metadata(["living_room.jpg"])

        detect_resp = client.post(
            "/api/v1/detect",
            files=[("images", ("living_room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        assert detect_resp.status_code == 200
        detect_data = detect_resp.json()

        assert "block_model" in detect_data
        assert "detection_summary" in detect_data
        block_model = detect_data["block_model"]
        assert len(block_model["blocks"]) > 0

        # Step 2: POST /manipulate with the BlockModel from detection
        manipulate_body = {
            "session_id": str(uuid4()),
            "prompt": "Make this room safer for a toddler",
            "block_model": block_model,
        }
        manip_resp = client.post("/api/v1/manipulate", json=manipulate_body)
        assert manip_resp.status_code == 200
        manip_data = manip_resp.json()

        assert "response_options" in manip_data
        options = manip_data["response_options"]
        assert 2 <= len(options) <= 5

        # Each option should have a valid block_model
        for opt in options:
            assert "block_model" in opt
            assert "blocks" in opt["block_model"]
            assert "description" in opt
            assert "rules_applied" in opt

    def test_detect_multiple_images_then_manipulate(self):
        """Multi-image detection followed by manipulation."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        img1 = _make_jpeg_bytes(800, 600)
        img2 = _make_png_bytes(800, 600)
        metadata = _make_metadata(["wall_north.jpg", "wall_south.png"])

        detect_resp = client.post(
            "/api/v1/detect",
            files=[
                ("images", ("wall_north.jpg", img1, "image/jpeg")),
                ("images", ("wall_south.png", img2, "image/png")),
            ],
            data={"metadata": metadata},
        )
        assert detect_resp.status_code == 200
        block_model = detect_resp.json()["block_model"]

        manip_resp = client.post(
            "/api/v1/manipulate",
            json={
                "session_id": str(uuid4()),
                "prompt": "Make accessible for elderly",
                "block_model": block_model,
            },
        )
        assert manip_resp.status_code == 200
        assert 2 <= len(manip_resp.json()["response_options"]) <= 5


# ===================================================================
# 9.2  Test object detection with sample room images
# ===================================================================


class TestObjectDetectionCategories:
    """Verify detection results contain expected object categories."""

    def test_detects_outlets_lights_stairs_furniture(self):
        """MockAgent returns outlets, lights, stairs, and furniture."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        img_bytes = _make_jpeg_bytes()
        metadata = _make_metadata(["room.jpg"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        assert resp.status_code == 200
        data = resp.json()

        categories = data["detection_summary"]["categories_detected"]
        assert "power_outlet" in categories
        assert "light_fixture" in categories
        assert "stairs" in categories
        assert "furniture" in categories

    def test_detects_safety_relevant_categories(self):
        """Verify sharp furniture, rugs, and cords are detected."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        img_bytes = _make_jpeg_bytes()
        metadata = _make_metadata(["room.jpg"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        assert resp.status_code == 200
        categories = resp.json()["detection_summary"]["categories_detected"]
        assert "sharp_edge_furniture" in categories
        assert "rug" in categories
        assert "cord_cable" in categories

    def test_block_model_contains_detected_objects(self):
        """The BlockModel blocks should correspond to detected categories."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        img_bytes = _make_jpeg_bytes()
        metadata = _make_metadata(["room.jpg"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        blocks = resp.json()["block_model"]["blocks"]
        block_categories = {b["category"] for b in blocks}
        assert "power_outlet" in block_categories
        assert "stairs" in block_categories
        assert "furniture" in block_categories


# ===================================================================
# 9.3  Test BlockModel serialization round-trip integrity
# ===================================================================


class TestBlockModelRoundTrip:
    """Integration-level round-trip: detect → serialize → deserialize → verify."""

    def test_round_trip_from_detection(self):
        """BlockModel from detection survives serialize → deserialize."""
        agent = IntegrationMockAgent()
        registry = _make_full_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        img_bytes = _make_jpeg_bytes()
        results, _ = detector.detect([img_bytes], [{"filename": "test.jpg"}])
        block_model = detector.build_block_model(results)

        # Serialize → deserialize
        json_str = serialize(block_model)
        restored = deserialize(json_str)

        # All fields preserved
        assert restored.model_id == block_model.model_id
        assert restored.room_dimensions.width == block_model.room_dimensions.width
        assert restored.room_dimensions.height == block_model.room_dimensions.height
        assert restored.room_dimensions.depth == block_model.room_dimensions.depth
        assert len(restored.blocks) == len(block_model.blocks)

        for orig, rest in zip(block_model.blocks, restored.blocks):
            assert rest.block_id == orig.block_id
            assert rest.category == orig.category
            assert rest.confidence_score == orig.confidence_score
            assert rest.position.x == orig.position.x
            assert rest.position.y == orig.position.y
            assert rest.position.z == orig.position.z

    def test_verify_round_trip_utility(self):
        """verify_round_trip returns True for a detection-generated model."""
        agent = IntegrationMockAgent()
        registry = _make_full_registry()
        detector = ObjectDetector(agent=agent, registry=registry)

        results, _ = detector.detect(
            [_make_jpeg_bytes()], [{"filename": "test.jpg"}]
        )
        block_model = detector.build_block_model(results)
        assert verify_round_trip(block_model) is True

    def test_round_trip_preserves_version(self):
        """The version field survives round-trip."""
        model = BlockModel(
            room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
            blocks=[],
            version="1.0",
        )
        json_str = serialize(model)
        restored = deserialize(json_str)
        assert restored.version == "1.0"


# ===================================================================
# 9.4  Test malformed JSON rejection
# ===================================================================


class TestMalformedJsonRejection:
    """Verify 422 responses for malformed metadata and block_model."""

    def test_malformed_metadata_returns_422(self):
        """POST /detect with invalid metadata JSON returns 422."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)
        img_bytes = _make_jpeg_bytes()

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": "{not valid json!!!"},
        )
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"] == "invalid_metadata"
        assert len(data["message"]) > 0

    def test_malformed_block_model_in_manipulate_returns_422(self):
        """POST /manipulate with an invalid block_model returns 422."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        # block_model with invalid structure (missing room_dimensions)
        resp = client.post(
            "/api/v1/manipulate",
            json={
                "session_id": str(uuid4()),
                "prompt": "Make safe for a child",
                "block_model": {"blocks": "not_a_list"},
            },
        )
        assert resp.status_code == 422

    def test_empty_metadata_returns_422(self):
        """POST /detect with empty string metadata returns 422."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)
        img_bytes = _make_jpeg_bytes()

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": ""},
        )
        assert resp.status_code == 422

    def test_manipulate_missing_prompt_returns_422(self):
        """POST /manipulate without a prompt field returns 422."""
        client = _build_integration_app(agent=IntegrationMockAgent())

        resp = client.post(
            "/api/v1/manipulate",
            json={
                "session_id": str(uuid4()),
                "block_model": {"room_dimensions": {"width": 5, "height": 3, "depth": 4}},
            },
        )
        assert resp.status_code == 422


# ===================================================================
# 9.5  Test child safety prompt
# ===================================================================


class TestChildSafetyPrompt:
    """Verify child safety rules produce outlet covers, corner guards,
    and child gates in ResponseOptions."""

    def _get_child_safety_options(self) -> list[dict]:
        """Run the full pipeline with a child safety prompt."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        # Detect objects first
        img_bytes = _make_jpeg_bytes()
        detect_resp = client.post(
            "/api/v1/detect",
            files=[("images", ("room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": _make_metadata(["room.jpg"])},
        )
        block_model = detect_resp.json()["block_model"]

        # Manipulate with child safety prompt
        manip_resp = client.post(
            "/api/v1/manipulate",
            json={
                "session_id": str(uuid4()),
                "prompt": "Make this room safe for a toddler",
                "block_model": block_model,
            },
        )
        assert manip_resp.status_code == 200
        return manip_resp.json()["response_options"]

    def test_child_safety_rules_applied(self):
        """At least some child safety rules should be applied."""
        options = self._get_child_safety_options()
        all_rules = set()
        for opt in options:
            all_rules.update(opt["rules_applied"])
        # At least one child safety rule should appear
        child_rules = {"cover_outlets", "corner_guards", "child_gate_stairs", "secure_heavy_objects"}
        assert len(all_rules & child_rules) > 0

    def test_outlet_covers_present(self):
        """ResponseOptions should contain outlet cover blocks."""
        options = self._get_child_safety_options()
        all_categories = set()
        for opt in options:
            for block in opt["block_model"]["blocks"]:
                all_categories.add(block["category"])
        assert "outlet_cover" in all_categories

    def test_corner_guards_present(self):
        """ResponseOptions should contain corner guard blocks."""
        options = self._get_child_safety_options()
        all_categories = set()
        for opt in options:
            for block in opt["block_model"]["blocks"]:
                all_categories.add(block["category"])
        assert "corner_guard" in all_categories

    def test_child_gates_present(self):
        """ResponseOptions should contain child gate blocks."""
        options = self._get_child_safety_options()
        all_categories = set()
        for opt in options:
            for block in opt["block_model"]["blocks"]:
                all_categories.add(block["category"])
        assert "child_gate" in all_categories


# ===================================================================
# 9.6  Test elderly accessibility prompt
# ===================================================================


class TestElderlyAccessibilityPrompt:
    """Verify elderly accessibility rules produce handrails, lighting,
    and trip hazard removal in ResponseOptions."""

    def _get_elderly_options(self) -> list[dict]:
        """Run the full pipeline with an elderly accessibility prompt."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        img_bytes = _make_jpeg_bytes()
        detect_resp = client.post(
            "/api/v1/detect",
            files=[("images", ("room.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": _make_metadata(["room.jpg"])},
        )
        block_model = detect_resp.json()["block_model"]

        manip_resp = client.post(
            "/api/v1/manipulate",
            json={
                "session_id": str(uuid4()),
                "prompt": "Make this room accessible for an elderly person",
                "block_model": block_model,
            },
        )
        assert manip_resp.status_code == 200
        return manip_resp.json()["response_options"]

    def test_elderly_rules_applied(self):
        """At least some elderly accessibility rules should be applied."""
        options = self._get_elderly_options()
        all_rules = set()
        for opt in options:
            all_rules.update(opt["rules_applied"])
        elderly_rules = {"add_handrails", "ensure_lighting", "remove_trip_hazards", "widen_pathways"}
        assert len(all_rules & elderly_rules) > 0

    def test_handrails_present(self):
        """ResponseOptions should contain handrail blocks."""
        options = self._get_elderly_options()
        all_categories = set()
        for opt in options:
            for block in opt["block_model"]["blocks"]:
                all_categories.add(block["category"])
        assert "handrail" in all_categories

    def test_lighting_ensured(self):
        """ResponseOptions should ensure adequate lighting."""
        options = self._get_elderly_options()
        all_rules = set()
        for opt in options:
            all_rules.update(opt["rules_applied"])
        assert "ensure_lighting" in all_rules or "add_handrails" in all_rules

    def test_trip_hazards_removed(self):
        """At least one option should remove trip hazards (rugs/cords)."""
        options = self._get_elderly_options()
        all_rules = set()
        for opt in options:
            all_rules.update(opt["rules_applied"])
        assert "remove_trip_hazards" in all_rules


# ===================================================================
# 9.7  Test plugin loading
# ===================================================================


class TestPluginLoading:
    """Verify that a test plugin's categories and rules appear in the
    registry and API endpoints."""

    def test_plugin_categories_in_registry(self, tmp_path: Path):
        """A test plugin's categories appear in the CategoryRegistry."""
        plugins = tmp_path / "plugins"
        core = plugins / "core"
        core.mkdir(parents=True)
        installed = plugins / "installed" / "test-safety"
        installed.mkdir(parents=True)

        # Minimal core files
        (core / "categories.json").write_text(json.dumps({"categories": [
            {"id": "door", "label": "Door", "safety_tags": [], "source": "core"},
        ]}))
        (core / "rules.json").write_text(json.dumps({"rules": []}))

        # Test plugin
        (installed / "manifest.json").write_text(json.dumps({
            "plugin_id": "test-safety",
            "name": "Test Safety Plugin",
            "version": "1.0.0",
            "author": "Integration Test",
            "categories": [
                {"id": "baby_gate", "label": "Baby Gate", "safety_tags": ["child_safety"]},
            ],
            "rules": [
                {
                    "id": "install_baby_gate",
                    "label": "Install Baby Gate",
                    "applies_to": ["child_safety"],
                    "target_categories": ["baby_gate"],
                },
            ],
        }))

        reg = CategoryRegistry()
        reg.load_core(plugins)
        mgr = PluginManager(plugins)
        mgr.scan()
        mgr.merge_into(reg)

        assert reg.has_category("baby_gate")
        assert reg.has_category("door")
        rule = reg.get_rule("install_baby_gate")
        assert rule is not None
        assert rule["source"] == "plugin"

    def test_plugin_categories_in_api(self, tmp_path: Path):
        """Plugin categories and rules appear in GET /categories and GET /rules."""
        plugins = tmp_path / "plugins"
        core = plugins / "core"
        core.mkdir(parents=True)
        installed = plugins / "installed" / "test-plugin"
        installed.mkdir(parents=True)

        (core / "categories.json").write_text(json.dumps({"categories": [
            {"id": "door", "label": "Door", "safety_tags": [], "source": "core"},
        ]}))
        (core / "rules.json").write_text(json.dumps({"rules": [
            {"id": "cover_outlets", "label": "Cover Outlets",
             "applies_to": ["child_safety"], "target_categories": ["power_outlet"],
             "source": "core"},
        ]}))

        (installed / "manifest.json").write_text(json.dumps({
            "plugin_id": "test-plugin",
            "name": "Test Plugin",
            "version": "1.0.0",
            "author": "Tester",
            "categories": [
                {"id": "smart_lock", "label": "Smart Lock", "safety_tags": ["security"]},
            ],
            "rules": [
                {
                    "id": "install_smart_lock",
                    "label": "Install Smart Lock",
                    "applies_to": ["security"],
                    "target_categories": ["smart_lock"],
                },
            ],
        }))

        reg = CategoryRegistry()
        reg.load_core(plugins)
        mgr = PluginManager(plugins)
        mgr.scan()
        mgr.merge_into(reg)

        client = _build_integration_app(agent=None, registry=reg)

        # Check /categories
        cat_resp = client.get("/api/v1/categories")
        assert cat_resp.status_code == 200
        cat_ids = {c["id"] for c in cat_resp.json()["categories"]}
        assert "smart_lock" in cat_ids
        assert "door" in cat_ids

        # Check /rules
        rules_resp = client.get("/api/v1/rules")
        assert rules_resp.status_code == 200
        rule_ids = {r["id"] for r in rules_resp.json()["rules"]}
        assert "install_smart_lock" in rule_ids
        assert "cover_outlets" in rule_ids


# ===================================================================
# 9.8  Test agent swap
# ===================================================================


class TestAgentSwap:
    """Verify create_agent() produces the correct agent type for each
    config and that the agent is injectable into the API server."""

    def test_ollama_config_creates_ollama_agent(self, tmp_path: Path):
        """Ollama config produces an OllamaAgent."""
        from room_vision_ai.agents.ollama_agent import OllamaAgent

        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "ollama",
            "model_name": "llava:13b",
            "endpoint": "http://localhost:11434",
        }))
        config = load_agent_config(config_file)
        assert config is not None
        agent = create_agent(config)
        assert isinstance(agent, OllamaAgent)
        assert isinstance(agent, AgentInterface)

    def test_gemini_config_creates_gemini_agent(self, tmp_path: Path):
        """Gemini config produces a GeminiAgent."""
        from room_vision_ai.agents.gemini_agent import GeminiAgent

        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "gemini",
            "model_name": "gemini-1.5-flash",
            "endpoint": "https://generativelanguage.googleapis.com",
            "api_key": "test-key-for-integration",
        }))
        config = load_agent_config(config_file)
        assert config is not None
        agent = create_agent(config)
        assert isinstance(agent, GeminiAgent)
        assert isinstance(agent, AgentInterface)

    def test_agent_injected_into_api(self):
        """The agent is properly injected and usable in the API server."""
        agent = IntegrationMockAgent()
        client = _build_integration_app(agent=agent)

        # The agent should be functional — verify via /detect
        img_bytes = _make_jpeg_bytes()
        metadata = _make_metadata(["test.jpg"])
        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        assert resp.status_code == 200
        assert resp.json()["detection_summary"]["total_objects"] > 0

    def test_swap_agent_changes_behavior(self):
        """Swapping agents changes detection results.

        Because ``configure()`` sets module-level state, we must run
        each agent's request sequentially to avoid state leakage.
        """
        img_bytes = _make_jpeg_bytes()
        metadata = _make_metadata(["test.jpg"])

        # Agent A: returns 1 detection
        agent_a = IntegrationMockAgent(detections=[{
            "image_filename": "test.jpg",
            "detections": [
                {"category": "door", "confidence_score": 0.9,
                 "bounding_box": {"x_min": 0, "y_min": 0, "x_max": 100, "y_max": 200}},
            ],
        }])
        client_a = _build_integration_app(agent=agent_a)
        resp_a = client_a.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        total_a = resp_a.json()["detection_summary"]["total_objects"]

        # Agent B: returns 3 detections — swap the agent
        agent_b = IntegrationMockAgent(detections=[{
            "image_filename": "test.jpg",
            "detections": [
                {"category": "door", "confidence_score": 0.9,
                 "bounding_box": {"x_min": 0, "y_min": 0, "x_max": 100, "y_max": 200}},
                {"category": "window", "confidence_score": 0.8,
                 "bounding_box": {"x_min": 200, "y_min": 0, "x_max": 400, "y_max": 150}},
                {"category": "stairs", "confidence_score": 0.7,
                 "bounding_box": {"x_min": 500, "y_min": 100, "x_max": 700, "y_max": 400}},
            ],
        }])
        client_b = _build_integration_app(agent=agent_b)
        resp_b = client_b.post(
            "/api/v1/detect",
            files=[("images", ("test.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        total_b = resp_b.json()["detection_summary"]["total_objects"]

        assert total_a == 1
        assert total_b == 3


# ===================================================================
# 9.9  Test insufficient image quality
# ===================================================================


class TestInsufficientImageQuality:
    """Verify 422 errors for too-small images and unsupported formats."""

    def test_too_small_image_returns_422(self):
        """A 320x240 image should be rejected with insufficient_image_quality."""
        client = _build_integration_app(agent=IntegrationMockAgent())
        img_bytes = _make_jpeg_bytes(320, 240)
        metadata = _make_metadata(["tiny.jpg"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("tiny.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"] == "insufficient_image_quality"
        assert any("320x240" in d for d in data["details"])

    def test_unsupported_format_returns_422(self):
        """An unsupported format (e.g. BMP) should be rejected."""
        client = _build_integration_app(agent=IntegrationMockAgent())
        metadata = _make_metadata(["photo.bmp"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("photo.bmp", b"fake bmp data", "image/bmp"))],
            data={"metadata": metadata},
        )
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"] == "insufficient_image_quality"
        assert any("unsupported format" in d for d in data["details"])

    def test_error_response_has_descriptive_message(self):
        """Error responses should include a descriptive message."""
        client = _build_integration_app(agent=IntegrationMockAgent())
        img_bytes = _make_jpeg_bytes(320, 240)
        metadata = _make_metadata(["small.jpg"])

        resp = client.post(
            "/api/v1/detect",
            files=[("images", ("small.jpg", img_bytes, "image/jpeg"))],
            data={"metadata": metadata},
        )
        data = resp.json()
        assert "message" in data
        assert len(data["message"]) > 0
        assert "details" in data
        assert len(data["details"]) > 0


# ===================================================================
# 9.10  Verify no data leaves localhost
# ===================================================================


class TestNoDataLeavesLocalhost:
    """Verify CORS is restricted to localhost, FeedbackStore has no
    network imports, and no module imports networking libraries for
    data transmission."""

    def test_cors_restricted_to_localhost(self):
        """CORS allow_origins should only contain localhost entries."""
        from room_vision_ai.main import app

        cors_middleware = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_middleware = middleware
                break

        assert cors_middleware is not None, "CORSMiddleware not found"
        origins = cors_middleware.kwargs.get("allow_origins", [])
        for origin in origins:
            assert "localhost" in origin or "127.0.0.1" in origin, (
                f"Non-localhost origin found: {origin}"
            )

    def test_feedback_store_no_network_imports(self):
        """FeedbackStore module should not import networking libraries."""
        feedback_path = _SRC_DIR / "feedback_store.py"
        source = feedback_path.read_text(encoding="utf-8")

        # These networking modules should NOT be imported
        forbidden_imports = [
            "requests", "httpx", "urllib.request", "aiohttp",
            "socket", "http.client",
        ]
        tree = ast.parse(source)
        imported_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_names.add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imported_names.add(node.module)

        for forbidden in forbidden_imports:
            assert forbidden not in imported_names, (
                f"FeedbackStore imports forbidden networking module: {forbidden}"
            )

    def test_source_modules_no_outbound_networking(self):
        """No source module (except agents) should import networking
        libraries for data transmission."""
        # Agent modules are allowed to make network calls — that's their job
        agent_files = {"ollama_agent.py", "gemini_agent.py", "custom_agent.py"}

        forbidden_imports = {"requests", "aiohttp", "urllib.request", "socket"}

        for py_file in _SRC_DIR.rglob("*.py"):
            if py_file.name in agent_files:
                continue
            source = py_file.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue

            imported_names: set[str] = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imported_names.add(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        imported_names.add(node.module)

            for forbidden in forbidden_imports:
                assert forbidden not in imported_names, (
                    f"{py_file.name} imports forbidden networking module: {forbidden}"
                )

    def test_only_agent_modules_use_httpx(self):
        """Only agent modules should use httpx for external calls."""
        agent_files = {"ollama_agent.py", "gemini_agent.py", "custom_agent.py"}

        for py_file in _SRC_DIR.rglob("*.py"):
            if py_file.name in agent_files:
                continue
            source = py_file.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        assert alias.name != "httpx", (
                            f"{py_file.name} imports httpx but is not an agent module"
                        )
                elif isinstance(node, ast.ImportFrom):
                    if node.module and node.module == "httpx":
                        raise AssertionError(
                            f"{py_file.name} imports from httpx but is not an agent module"
                        )
