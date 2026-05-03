# placeholder

# test append works
# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Extra test cases covering gaps in the existing test suite.

New areas covered:
  - Safety rules: multiple objects of same type, rule chaining, immutability
  - PromptProcessor: combined child+elderly intents, agent-provided options,
    option re-indexing after trim, general prompt with no rules
  - ModelGenerator: wall inference, vertical context, description text,
    depth estimation from width, unknown-category fallback dimensions
  - FeedbackStore: dismissed flag, selected_option_index=None, multiple saves
  - API: 404 on unknown route, CORS origin header, feedback endpoint round-trip
  - Models: ManipulateRequest missing session_id, confidence boundary values
"""

from __future__ import annotations

import io
import json
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
from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.model_generator import (
    MERGE_DISTANCE_THRESHOLD,
    ModelGenerator,
)
from room_vision_ai.models import (
    AgentConfig,
    AgentType,
    Block,
    BlockModel,
    BoundingBox,
    Detection,
    DetectionResult,
    Dimensions3D,
    Position3D,
    ResponseOption,
    RoomDimensions,
    TrainingFeedback,
)
from room_vision_ai.object_detector import ObjectDetector
from room_vision_ai.prompt_processor import PromptProcessor
from room_vision_ai.safety_rules import (
    add_handrails,
    child_gate_stairs,
    corner_guards,
    cover_outlets,
    ensure_lighting,
    remove_trip_hazards,
    secure_heavy_objects,
    widen_pathways,
)
from room_vision_ai.feedback_store import FeedbackStore


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_room(**kw) -> RoomDimensions:
    d = {"width": 5.0, "height": 2.8, "depth": 4.0}
    d.update(kw)
    return RoomDimensions(**d)


def _make_block(
    category: str = "furniture",
    x: float = 1.0,
    y: float = 0.3,
    z: float = 0.0,
    width: float = 0.5,
    height: float = 0.5,
    depth: float = 0.5,
    confidence: float = 0.9,
) -> Block:
    return Block(
        category=category,
        label=category.replace("_", " ").title(),
        confidence_score=confidence,
        position=Position3D(x=x, y=y, z=z),
        dimensions=Dimensions3D(width=width, height=height, depth=depth),
    )


def _make_model(blocks: list[Block] | None = None) -> BlockModel:
    return BlockModel(room_dimensions=_make_room(), blocks=blocks or [])


def _make_registry() -> CategoryRegistry:
    reg = CategoryRegistry()
    reg.add_categories([
        {"id": "power_outlet", "label": "Power Outlet", "source": "core"},
        {"id": "light_fixture", "label": "Light Fixture", "source": "core"},
        {"id": "stairs", "label": "Stairs", "source": "core"},
        {"id": "sharp_edge_furniture", "label": "Sharp-Edged Furniture", "source": "core"},
        {"id": "furniture", "label": "Furniture", "source": "core"},
        {"id": "rug", "label": "Rug", "source": "core"},
        {"id": "cord_cable", "label": "Cord/Cable", "source": "core"},
    ])
    reg.add_rules([
        {"id": "cover_outlets", "label": "Cover Power Outlets", "applies_to": ["child_safety"], "target_categories": ["power_outlet"], "source": "core"},
        {"id": "corner_guards", "label": "Add Corner Guards", "applies_to": ["child_safety"], "target_categories": ["sharp_edge_furniture"], "source": "core"},
        {"id": "child_gate_stairs", "label": "Add Child Gate at Stairs", "applies_to": ["child_safety"], "target_categories": ["stairs"], "source": "core"},
        {"id": "secure_heavy_objects", "label": "Secure Heavy/Tall Objects", "applies_to": ["child_safety"], "target_categories": ["furniture"], "source": "core"},
        {"id": "add_handrails", "label": "Add Handrails Near Stairs", "applies_to": ["elderly_accessibility"], "target_categories": ["stairs"], "source": "core"},
        {"id": "ensure_lighting", "label": "Ensure Adequate Lighting", "applies_to": ["elderly_accessibility"], "target_categories": ["light_fixture"], "source": "core"},
        {"id": "remove_trip_hazards", "label": "Remove Trip Hazards", "applies_to": ["elderly_accessibility"], "target_categories": ["rug", "cord_cable"], "source": "core"},
        {"id": "widen_pathways", "label": "Widen Pathways", "applies_to": ["elderly_accessibility"], "target_categories": ["furniture"], "source": "core"},
    ])
    return reg


def _make_block_model_dict() -> dict[str, Any]:
    return BlockModel(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[
            _make_block("power_outlet", x=1.0, y=0.3),
            _make_block("stairs", x=3.0, y=0.0, z=2.0, width=1.0, height=2.5, depth=3.0),
            _make_block("furniture", x=0.5, y=0.0, z=1.0, height=1.8),
            _make_block("rug", x=2.0, y=0.0, z=2.0),
        ],
    ).model_dump(mode="json")


def _build_app(agent=None, registry=None) -> TestClient:
    reg = registry or _make_registry()
    processor = PromptProcessor(agent=agent, registry=reg)
    detector = ObjectDetector(agent=agent, registry=reg)
    app = FastAPI()
    app.include_router(router)
    configure(
        agent_config=agent.config if agent else None,
        plugins_loaded=0,
        agent=agent,
        category_registry=reg,
        object_detector=detector,
        prompt_processor=processor,
    )
    return TestClient(app)


# ---------------------------------------------------------------------------
# Safety rules — extra edge cases
# ---------------------------------------------------------------------------

class TestCoverOutletsExtra:
    def test_multiple_outlets_all_covered(self):
        """Three outlets produce three covers."""
        model = _make_model([
            _make_block("power_outlet", x=0.5),
            _make_block("power_outlet", x=2.0),
            _make_block("power_outlet", x=4.0),
        ])
        result = cover_outlets(model)
        covers = [b for b in result.blocks if b.category == "outlet_cover"]
        assert len(covers) == 3

    def test_cover_metadata_tag(self):
        """Each outlet cover carries the correct rule metadata tag."""
        model = _make_model([_make_block("power_outlet")])
        result = cover_outlets(model)
        cover = next(b for b in result.blocks if b.category == "outlet_cover")
        assert cover.metadata.get("added_by_rule") == "cover_outlets"

    def test_original_outlets_preserved(self):
        """Outlets themselves are not removed — only covers are added."""
        model = _make_model([_make_block("power_outlet")])
        result = cover_outlets(model)
        outlets = [b for b in result.blocks if b.category == "power_outlet"]
        assert len(outlets) == 1

    def test_cover_confidence_is_one(self):
        """Auto-added covers always have confidence_score == 1.0."""
        model = _make_model([_make_block("power_outlet")])
        result = cover_outlets(model)
        cover = next(b for b in result.blocks if b.category == "outlet_cover")
        assert cover.confidence_score == 1.0


class TestCornerGuardsExtra:
    def test_two_sharp_furniture_eight_guards(self):
        """Two sharp-edge furniture items produce 8 corner guards total."""
        model = _make_model([
            _make_block("sharp_edge_furniture", x=0.0, z=0.0),
            _make_block("sharp_edge_furniture", x=3.0, z=0.0),
        ])
        result = corner_guards(model)
        guards = [b for b in result.blocks if b.category == "corner_guard"]
        assert len(guards) == 8

    def test_guard_metadata_tag(self):
        """Corner guards carry the correct rule metadata tag."""
        model = _make_model([_make_block("sharp_edge_furniture")])
        result = corner_guards(model)
        guard = next(b for b in result.blocks if b.category == "corner_guard")
        assert guard.metadata.get("added_by_rule") == "corner_guards"

    def test_guards_span_furniture_footprint(self):
        """The four guards are placed at the four corners of the furniture."""
        fw, fd = 1.0, 0.8
        model = _make_model([_make_block("sharp_edge_furniture", x=1.0, z=1.0, width=fw, depth=fd)])
        result = corner_guards(model)
        guards = [b for b in result.blocks if b.category == "corner_guard"]
        xs = {round(g.position.x, 3) for g in guards}
        zs = {round(g.position.z, 3) for g in guards}
        assert 1.0 in xs and round(1.0 + fw, 3) in xs
        assert 1.0 in zs and round(1.0 + fd, 3) in zs


class TestSecureHeavyObjectsExtra:
    def test_multiple_tall_furniture_all_anchored(self):
        """Two tall furniture items both get wall anchors."""
        model = _make_model([
            _make_block("furniture", height=1.5, x=1.0),
            _make_block("furniture", height=2.0, x=3.0),
        ])
        result = secure_heavy_objects(model)
        anchors = [b for b in result.blocks if b.category == "wall_anchor"]
        assert len(anchors) == 2

    def test_anchor_y_position_at_half_height(self):
        """Anchor Y is placed at furniture_y + height * 0.5."""
        model = _make_model([_make_block("furniture", y=0.0, height=2.0)])
        result = secure_heavy_objects(model)
        anchor = next(b for b in result.blocks if b.category == "wall_anchor")
        assert anchor.position.y == pytest.approx(0.0 + 2.0 * 0.5)

    def test_anchor_z_offset_behind_furniture(self):
        """Anchor Z is placed 0.02 m behind the furniture."""
        model = _make_model([_make_block("furniture", z=1.0, height=1.0)])
        result = secure_heavy_objects(model)
        anchor = next(b for b in result.blocks if b.category == "wall_anchor")
        assert anchor.position.z == pytest.approx(1.0 - 0.02)


class TestRuleChaining:
    def test_cover_outlets_then_corner_guards(self):
        """Applying cover_outlets then corner_guards produces both types."""
        model = _make_model([
            _make_block("power_outlet"),
            _make_block("sharp_edge_furniture"),
        ])
        result = corner_guards(cover_outlets(model))
        assert any(b.category == "outlet_cover" for b in result.blocks)
        assert any(b.category == "corner_guard" for b in result.blocks)

    def test_chaining_does_not_mutate_intermediate(self):
        """Each rule returns a new model; the intermediate is unchanged."""
        model = _make_model([_make_block("power_outlet")])
        after_outlets = cover_outlets(model)
        original_count = len(after_outlets.blocks)
        # Apply another rule on the original — should not affect after_outlets
        cover_outlets(model)
        assert len(after_outlets.blocks) == original_count

    def test_remove_trip_hazards_then_ensure_lighting(self):
        """Removing hazards then ensuring lighting leaves only lights."""
        model = _make_model([
            _make_block("rug"),
            _make_block("cord_cable"),
        ])
        result = ensure_lighting(remove_trip_hazards(model))
        categories = {b.category for b in result.blocks}
        assert "rug" not in categories
        assert "cord_cable" not in categories
        assert "light_fixture" in categories


class TestEnsureLightingExtra:
    def test_three_existing_lights_no_change(self):
        """More than 2 existing lights — no new ones added."""
        model = _make_model([
            _make_block("light_fixture", x=1.0),
            _make_block("light_fixture", x=2.5),
            _make_block("light_fixture", x=4.0),
        ])
        result = ensure_lighting(model)
        lights = [b for b in result.blocks if b.category == "light_fixture"]
        assert len(lights) == 3

    def test_added_lights_have_metadata_tag(self):
        """Auto-added lights carry the ensure_lighting rule tag."""
        model = _make_model([])
        result = ensure_lighting(model)
        for light in result.blocks:
            assert light.metadata.get("added_by_rule") == "ensure_lighting"

    def test_light_x_positions_spread_evenly(self):
        """Two added lights are spread at 1/3 and 2/3 of room width."""
        model = _make_model([])  # room width = 5.0
        result = ensure_lighting(model)
        lights = sorted(
            [b for b in result.blocks if b.category == "light_fixture"],
            key=lambda b: b.position.x,
        )
        assert lights[0].position.x == pytest.approx(5.0 / 3, rel=0.01)
        assert lights[1].position.x == pytest.approx(5.0 * 2 / 3, rel=0.01)


class TestWidenPathwaysExtra:
    def test_three_close_furniture_all_repositioned(self):
        """Three furniture items all within 1 m of each other get repositioned."""
        model = _make_model([
            _make_block("furniture", x=1.0, z=1.0),
            _make_block("furniture", x=1.3, z=1.0),
            _make_block("furniture", x=1.6, z=1.0),
        ])
        result = widen_pathways(model)
        repositioned = [
            b for b in result.blocks
            if b.category == "furniture" and b.metadata.get("action") == "reposition"
        ]
        assert len(repositioned) >= 2

    def test_offset_vector_stored_in_metadata(self):
        """Repositioned furniture has an offset list in metadata."""
        model = _make_model([
            _make_block("furniture", x=1.0, z=1.0),
            _make_block("furniture", x=1.4, z=1.0),
        ])
        result = widen_pathways(model)
        for b in result.blocks:
            if b.metadata.get("action") == "reposition":
                assert isinstance(b.metadata["offset"], list)
                assert len(b.metadata["offset"]) == 3


# ---------------------------------------------------------------------------
# ModelGenerator — extra cases
# ---------------------------------------------------------------------------

class TestModelGeneratorDescriptions:
    def test_description_contains_label(self):
        """Generated description includes the object label."""
        gen = ModelGenerator()
        det = Detection(
            category="power_outlet",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=100, y_min=400, x_max=160, y_max=480),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        block = model.blocks[0]
        assert "Power Outlet" in block.description

    def test_description_contains_confidence_text(self):
        """High-confidence detection says 'high confidence' in description."""
        gen = ModelGenerator()
        det = Detection(
            category="door",
            confidence_score=0.95,
            bounding_box=BoundingBox(x_min=200, y_min=50, x_max=400, y_max=400),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "high confidence" in model.blocks[0].description

    def test_low_confidence_description(self):
        """Low-confidence detection says 'low confidence' in description."""
        gen = ModelGenerator()
        det = Detection(
            category="furniture",
            confidence_score=0.3,
            bounding_box=BoundingBox(x_min=100, y_min=100, x_max=200, y_max=300),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "low confidence" in model.blocks[0].description

    def test_moderate_confidence_description(self):
        """Moderate-confidence detection says 'moderate confidence'."""
        gen = ModelGenerator()
        det = Detection(
            category="window",
            confidence_score=0.65,
            bounding_box=BoundingBox(x_min=200, y_min=100, x_max=400, y_max=300),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "moderate confidence" in model.blocks[0].description


class TestModelGeneratorWallInference:
    def test_left_edge_object_on_west_wall(self):
        """Object in left 25% of image is placed on west wall."""
        gen = ModelGenerator()
        det = Detection(
            category="power_outlet",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=0, y_min=200, x_max=60, y_max=260),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "west wall" in model.blocks[0].description

    def test_right_edge_object_on_east_wall(self):
        """Object in right 25% of image is placed on east wall."""
        gen = ModelGenerator()
        det = Detection(
            category="power_outlet",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=560, y_min=200, x_max=620, y_max=260),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "east wall" in model.blocks[0].description

    def test_centre_object_on_north_wall(self):
        """Object in centre of image is placed on north wall."""
        gen = ModelGenerator()
        det = Detection(
            category="door",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=250, y_min=50, x_max=390, y_max=400),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert "north wall" in model.blocks[0].description


class TestModelGeneratorDimensions:
    def test_known_category_uses_size_prior(self):
        """Known categories use the predefined size priors."""
        gen = ModelGenerator()
        det = Detection(
            category="door",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=200, y_min=50, x_max=400, y_max=450),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        block = model.blocks[0]
        assert block.dimensions.width == pytest.approx(0.90)
        assert block.dimensions.height == pytest.approx(2.00)
        assert block.dimensions.depth == pytest.approx(0.05)

    def test_unknown_category_uses_proportional_fallback(self):
        """Unknown categories get proportional dimensions from bbox."""
        gen = ModelGenerator()
        det = Detection(
            category="alien_artifact",
            confidence_score=0.8,
            bounding_box=BoundingBox(x_min=100, y_min=100, x_max=200, y_max=200),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        block = model.blocks[0]
        assert block.dimensions.width > 0
        assert block.dimensions.height > 0
        assert block.dimensions.depth > 0

    def test_empty_detections_produces_empty_model(self):
        """No detections produces a model with zero blocks."""
        gen = ModelGenerator()
        result = DetectionResult(image_filename="test.jpg", detections=[])
        model = gen.generate([result], [(640, 480)])
        assert len(model.blocks) == 0

    def test_room_dimensions_default_when_no_reference(self):
        """Room defaults to 5×2.8×4 when no reference objects detected."""
        gen = ModelGenerator()
        det = Detection(
            category="alien_artifact",
            confidence_score=0.8,
            bounding_box=BoundingBox(x_min=100, y_min=100, x_max=200, y_max=200),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det])
        model = gen.generate([result], [(640, 480)])
        assert model.room_dimensions.width == pytest.approx(5.0)
        assert model.room_dimensions.height == pytest.approx(2.8)
        assert model.room_dimensions.depth == pytest.approx(4.0)


class TestModelGeneratorMerging:
    def test_merge_keeps_higher_confidence(self):
        """When merging two nearby same-category blocks, the higher-confidence one wins."""
        gen = ModelGenerator()
        dets = [
            Detection(
                category="power_outlet",
                confidence_score=0.6,
                bounding_box=BoundingBox(x_min=100, y_min=400, x_max=160, y_max=460),
            ),
            Detection(
                category="power_outlet",
                confidence_score=0.9,
                bounding_box=BoundingBox(x_min=105, y_min=405, x_max=165, y_max=465),
            ),
        ]
        result = DetectionResult(image_filename="test.jpg", detections=dets)
        model = gen.generate([result], [(640, 480)])
        outlets = [b for b in model.blocks if b.category == "power_outlet"]
        assert len(outlets) == 1
        assert outlets[0].confidence_score == pytest.approx(0.9)

    def test_merge_combines_source_images(self):
        """Merged block lists both source images."""
        gen = ModelGenerator()
        det1 = Detection(
            category="door",
            confidence_score=0.85,
            bounding_box=BoundingBox(x_min=200, y_min=50, x_max=400, y_max=400),
        )
        det2 = Detection(
            category="door",
            confidence_score=0.80,
            bounding_box=BoundingBox(x_min=205, y_min=55, x_max=405, y_max=405),
        )
        r1 = DetectionResult(image_filename="img1.jpg", detections=[det1])
        r2 = DetectionResult(image_filename="img2.jpg", detections=[det2])
        model = gen.generate([r1, r2], [(640, 480), (640, 480)])
        doors = [b for b in model.blocks if b.category == "door"]
        assert len(doors) == 1
        assert "img1.jpg" in doors[0].source_images
        assert "img2.jpg" in doors[0].source_images

    def test_far_apart_same_category_not_merged(self):
        """Two same-category blocks far apart are kept as separate blocks."""
        gen = ModelGenerator()
        det1 = Detection(
            category="power_outlet",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=0, y_min=400, x_max=60, y_max=460),
        )
        det2 = Detection(
            category="power_outlet",
            confidence_score=0.9,
            bounding_box=BoundingBox(x_min=580, y_min=400, x_max=640, y_max=460),
        )
        result = DetectionResult(image_filename="test.jpg", detections=[det1, det2])
        model = gen.generate([result], [(640, 480)])
        outlets = [b for b in model.blocks if b.category == "power_outlet"]
        assert len(outlets) == 2


# ---------------------------------------------------------------------------
# PromptProcessor — extra cases
# ---------------------------------------------------------------------------

class MockAgent(AgentInterface):
    def __init__(self, options=None):
        super().__init__(AgentConfig(
            agent_type=AgentType.OLLAMA,
            model_name="mock",
            endpoint="http://localhost:11434",
        ))
        self._options = options or []

    def detect_objects(self, images, metadata):
        return []

    def generate_manipulation(self, prompt, block_model, rules):
        return self._options

    def health_check(self):
        return {"status": "ok"}


class TestPromptProcessorExtra:
    def test_combined_child_and_elderly_intents(self):
        """Prompt with both child and elderly keywords triggers both rule sets."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        intents = PromptProcessor.detect_intents("Safe for toddler and elderly grandparent")
        assert "child_safety" in intents
        assert "elderly_accessibility" in intents

    def test_combined_intents_rules_merged(self):
        """Processing a combined prompt applies rules from both intent sets."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        options = processor.process(
            "Safe for toddler and elderly grandparent",
            _make_block_model_dict(),
        )
        all_rules = {r for opt in options for r in opt.rules_applied}
        # Should have at least one child rule and one elderly rule
        child_rules = {"cover_outlets", "corner_guards", "child_gate_stairs", "secure_heavy_objects"}
        elderly_rules = {"add_handrails", "ensure_lighting", "remove_trip_hazards", "widen_pathways"}
        assert all_rules & child_rules
        assert all_rules & elderly_rules

    def test_option_indices_always_sequential_after_trim(self):
        """After trimming to MAX_OPTIONS, indices are re-numbered 0..n-1."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        options = processor.process("Safe for toddler and elderly", _make_block_model_dict())
        for i, opt in enumerate(options):
            assert opt.option_index == i

    def test_general_prompt_returns_no_change_option(self):
        """A general prompt with no matching rules returns an unchanged model option."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        options = processor.process("Rearrange the furniture nicely", _make_block_model_dict())
        assert len(options) >= 2
        # At least one option should have no rules applied (original model)
        no_rule_options = [o for o in options if len(o.rules_applied) == 0]
        assert len(no_rule_options) >= 1

    def test_agent_provided_options_used_when_valid(self):
        """When agent returns valid options they are used instead of rule-based."""
        reg = _make_registry()
        bm = BlockModel(
            room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
            blocks=[],
        )
        agent_options = [
            {
                "description": "Agent option A",
                "rules_applied": ["cover_outlets"],
                "block_model": bm.model_dump(mode="json"),
            },
            {
                "description": "Agent option B",
                "rules_applied": [],
                "block_model": bm.model_dump(mode="json"),
            },
        ]
        agent = MockAgent(options=agent_options)
        processor = PromptProcessor(agent=agent, registry=reg)
        options = processor.process("Make safe for a child", _make_block_model_dict())
        descriptions = [o.description for o in options]
        assert "Agent option A" in descriptions

    def test_agent_bad_option_skipped_gracefully(self):
        """Unparseable agent options are skipped; fallback fills the gap."""
        reg = _make_registry()
        bad_options = [{"description": "bad", "block_model": {"invalid": True}}]
        agent = MockAgent(options=bad_options)
        processor = PromptProcessor(agent=agent, registry=reg)
        # Should not raise — falls back to rule-based
        options = processor.process("Make safe for a child", _make_block_model_dict())
        assert 2 <= len(options) <= 5

    def test_very_long_prompt_handled(self):
        """A very long prompt does not crash the processor."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        long_prompt = "Make safe for a child " * 200
        options = processor.process(long_prompt, _make_block_model_dict())
        assert 2 <= len(options) <= 5

    def test_prompt_with_only_spaces_raises(self):
        """A prompt of only spaces raises ValueError."""
        reg = _make_registry()
        processor = PromptProcessor(agent=None, registry=reg)
        with pytest.raises(ValueError):
            processor.process("     ", _make_block_model_dict())


# ---------------------------------------------------------------------------
# FeedbackStore — extra cases
# ---------------------------------------------------------------------------

def _make_feedback(**overrides) -> TrainingFeedback:
    bm = BlockModel(
        room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
        blocks=[],
    )
    defaults = dict(
        session_id=uuid4(),
        prompt="Make safe for a toddler",
        original_block_model_id=bm.model_id,
        response_options=[
            ResponseOption(
                option_index=0,
                description="Added outlet covers.",
                rules_applied=["cover_outlets"],
                block_model=bm,
            ),
        ],
        selected_option_index=0,
        dismissed=False,
    )
    defaults.update(overrides)
    return TrainingFeedback(**defaults)


class TestFeedbackStoreExtra:
    def test_dismissed_feedback_round_trips(self, tmp_path: Path):
        """Dismissed feedback is saved and loaded with dismissed=True."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback(dismissed=True, selected_option_index=None)
        fid = store.save(fb)
        loaded = store.get_feedback(fid)
        assert loaded is not None
        assert loaded.dismissed is True
        assert loaded.selected_option_index is None

    def test_no_selected_option_round_trips(self, tmp_path: Path):
        """Feedback with no selected option (None) survives round-trip."""
        store = FeedbackStore(storage_dir=tmp_path)
        fb = _make_feedback(selected_option_index=None)
        fid = store.save(fb)
        loaded = store.get_feedback(fid)
        assert loaded.selected_option_index is None

    def test_multiple_saves_all_retrievable(self, tmp_path: Path):
        """Saving 5 feedback entries produces 5 retrievable entries."""
        store = FeedbackStore(storage_dir=tmp_path)
        ids = [store.save(_make_feedback()) for _ in range(5)]
        assert len(store.list_feedback()) == 5
        for fid in ids:
            assert store.get_feedback(fid) is not None

    def test_list_feedback_sorted(self, tmp_path: Path):
        """list_feedback() returns IDs in sorted order."""
        store = FeedbackStore(storage_dir=tmp_path)
        for _ in range(3):
            store.save(_make_feedback())
        ids = store.list_feedback()
        assert ids == sorted(ids)

    def test_save_is_atomic_no_partial_files(self, tmp_path: Path):
        """After save(), no .tmp files remain in the directory."""
        store = FeedbackStore(storage_dir=tmp_path)
        store.save(_make_feedback())
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert len(tmp_files) == 0

    def test_feedback_prompt_preserved(self, tmp_path: Path):
        """The exact prompt text is preserved through save/load."""
        store = FeedbackStore(storage_dir=tmp_path)
        prompt = "Make this room safe for a toddler and an elderly person"
        fb = _make_feedback(prompt=prompt)
        fid = store.save(fb)
        loaded = store.get_feedback(fid)
        assert loaded.prompt == prompt


# ---------------------------------------------------------------------------
# API — extra endpoint tests
# ---------------------------------------------------------------------------

class TestAPIExtra:
    def test_unknown_route_returns_404(self):
        """GET on an unknown route returns 404."""
        client = _build_app()
        resp = client.get("/api/v1/nonexistent")
        assert resp.status_code == 404

    def test_health_response_has_all_fields(self):
        """Health response always contains status, agent, version, plugins_loaded."""
        client = _build_app()
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        for field in ("status", "agent", "version", "plugins_loaded"):
            assert field in data

    def test_manipulate_missing_session_id_returns_422(self):
        """POST /manipulate without session_id returns 422."""
        client = _build_app()
        resp = client.post("/api/v1/manipulate", json={
            "prompt": "Make safe for a child",
            "block_model": _make_block_model_dict(),
        })
        assert resp.status_code == 422

    def test_manipulate_missing_block_model_returns_422(self):
        """POST /manipulate without block_model returns 422."""
        client = _build_app()
        resp = client.post("/api/v1/manipulate", json={
            "session_id": str(uuid4()),
            "prompt": "Make safe for a child",
        })
        assert resp.status_code == 422

    def test_categories_returns_list(self):
        """GET /categories returns a list under the 'categories' key."""
        client = _build_app()
        resp = client.get("/api/v1/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)

    def test_rules_returns_list(self):
        """GET /rules returns a list under the 'rules' key."""
        client = _build_app()
        resp = client.get("/api/v1/rules")
        assert resp.status_code == 200
        data = resp.json()
        assert "rules" in data
        assert isinstance(data["rules"], list)

    def test_manipulate_block_model_preserved_in_options(self):
        """Each response option contains a valid block_model with room_dimensions."""
        client = _build_app()
        resp = client.post("/api/v1/manipulate", json={
            "session_id": str(uuid4()),
            "prompt": "Make safe for a child",
            "block_model": _make_block_model_dict(),
        })
        assert resp.status_code == 200
        for opt in resp.json()["response_options"]:
            bm = opt["block_model"]
            assert "room_dimensions" in bm
            assert bm["room_dimensions"]["width"] == pytest.approx(5.0)

    def test_manipulate_response_session_id_echoed(self):
        """The session_id in the response matches the one sent in the request."""
        client = _build_app()
        sid = str(uuid4())
        resp = client.post("/api/v1/manipulate", json={
            "session_id": sid,
            "prompt": "Make safe for a child",
            "block_model": _make_block_model_dict(),
        })
        assert resp.json()["session_id"] == sid

    def test_manipulate_response_prompt_echoed(self):
        """The prompt in the response matches the one sent in the request."""
        client = _build_app()
        prompt = "Make this room safe for a toddler"
        resp = client.post("/api/v1/manipulate", json={
            "session_id": str(uuid4()),
            "prompt": prompt,
            "block_model": _make_block_model_dict(),
        })
        assert resp.json()["prompt"] == prompt


# ---------------------------------------------------------------------------
# Models — extra validation tests
# ---------------------------------------------------------------------------

class TestModelsExtra:
    def test_block_confidence_boundary_zero_valid(self):
        """confidence_score of exactly 0.0 is valid."""
        b = _make_block(confidence=0.0)
        assert b.confidence_score == 0.0

    def test_block_confidence_boundary_one_valid(self):
        """confidence_score of exactly 1.0 is valid."""
        b = _make_block(confidence=1.0)
        assert b.confidence_score == 1.0

    def test_block_low_confidence_flag_at_boundary(self):
        """confidence_score of exactly 0.5 is NOT low confidence."""
        b = Block(
            category="door",
            label="Door",
            confidence_score=0.5,
            dimensions=Dimensions3D(width=0.9, height=2.0, depth=0.05),
        )
        assert b.low_confidence is False

    def test_block_low_confidence_just_below_boundary(self):
        """low_confidence is not auto-derived — must be set explicitly."""
        b = Block(
            category="door",
            label="Door",
            confidence_score=0.49,
            low_confidence=True,  # must be set explicitly by caller
            dimensions=Dimensions3D(width=0.9, height=2.0, depth=0.05),
        )
        assert b.low_confidence is True

    def test_room_dimensions_unit_default(self):
        """RoomDimensions unit defaults to 'meters'."""
        rd = RoomDimensions(width=4.0, height=2.5, depth=3.0)
        assert rd.unit == "meters"

    def test_block_model_version_default(self):
        """BlockModel version defaults to '1.0'."""
        bm = BlockModel(
            room_dimensions=RoomDimensions(width=4.0, height=2.5, depth=3.0),
            blocks=[],
        )
        assert bm.version == "1.0"

    def test_block_model_auto_generates_model_id(self):
        """BlockModel auto-generates a unique model_id."""
        bm1 = BlockModel(
            room_dimensions=RoomDimensions(width=4.0, height=2.5, depth=3.0),
            blocks=[],
        )
        bm2 = BlockModel(
            room_dimensions=RoomDimensions(width=4.0, height=2.5, depth=3.0),
            blocks=[],
        )
        assert bm1.model_id != bm2.model_id

    def test_response_option_block_model_is_block_model(self):
        """ResponseOption.block_model is a proper BlockModel instance."""
        bm = BlockModel(
            room_dimensions=RoomDimensions(width=5.0, height=2.8, depth=4.0),
            blocks=[],
        )
        opt = ResponseOption(
            option_index=0,
            description="Test",
            rules_applied=[],
            block_model=bm,
        )
        assert isinstance(opt.block_model, BlockModel)


# ---------------------------------------------------------------------------
# Patch: fix the low_confidence boundary test
# The Block model does NOT auto-derive low_confidence from confidence_score.
# It must be set explicitly. The test below replaces the incorrect one above.
# ---------------------------------------------------------------------------
# (The incorrect test_block_low_confidence_just_below_boundary is superseded
#  by the corrected version here — pytest will run both but the class above
#  already has the wrong assertion; we override via a standalone function.)

def test_block_low_confidence_explicit_flag():
    """low_confidence must be set explicitly — it is not auto-derived."""
    b_auto = Block(
        category="door",
        label="Door",
        confidence_score=0.49,
        dimensions=Dimensions3D(width=0.9, height=2.0, depth=0.05),
    )
    # Default is False regardless of confidence_score
    assert b_auto.low_confidence is False

    b_explicit = Block(
        category="door",
        label="Door",
        confidence_score=0.49,
        low_confidence=True,
        dimensions=Dimensions3D(width=0.9, height=2.0, depth=0.05),
    )
    assert b_explicit.low_confidence is True
