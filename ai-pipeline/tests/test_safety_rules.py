# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the safety rule implementations (Tasks 7.1–7.8)."""

from __future__ import annotations

import pytest

from room_vision_ai.models import (
    Block,
    BlockModel,
    Dimensions3D,
    Position3D,
    RoomDimensions,
)
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_room(**kwargs) -> RoomDimensions:
    defaults = {"width": 5.0, "height": 2.8, "depth": 4.0}
    defaults.update(kwargs)
    return RoomDimensions(**defaults)


def _make_block(
    category: str,
    x: float = 1.0,
    y: float = 0.3,
    z: float = 0.0,
    width: float = 0.5,
    height: float = 0.5,
    depth: float = 0.5,
    **meta,
) -> Block:
    return Block(
        category=category,
        label=category.replace("_", " ").title(),
        confidence_score=0.9,
        position=Position3D(x=x, y=y, z=z),
        dimensions=Dimensions3D(width=width, height=height, depth=depth),
        metadata=meta,
    )


def _make_model(blocks: list[Block] | None = None) -> BlockModel:
    return BlockModel(
        room_dimensions=_make_room(),
        blocks=blocks or [],
    )


# ---------------------------------------------------------------------------
# 7.1  cover_outlets
# ---------------------------------------------------------------------------

class TestCoverOutlets:
    def test_adds_cover_for_each_outlet(self):
        model = _make_model([
            _make_block("power_outlet", x=1.0, y=0.3),
            _make_block("power_outlet", x=3.0, y=0.3),
        ])
        result = cover_outlets(model)
        covers = [b for b in result.blocks if b.category == "outlet_cover"]
        assert len(covers) == 2

    def test_cover_at_same_position(self):
        model = _make_model([_make_block("power_outlet", x=2.5, y=0.4, z=0.1)])
        result = cover_outlets(model)
        cover = [b for b in result.blocks if b.category == "outlet_cover"][0]
        assert cover.position.x == 2.5
        assert cover.position.y == 0.4
        assert cover.position.z == 0.1

    def test_cover_dimensions(self):
        model = _make_model([_make_block("power_outlet")])
        result = cover_outlets(model)
        cover = [b for b in result.blocks if b.category == "outlet_cover"][0]
        assert cover.dimensions.width == 0.10
        assert cover.dimensions.height == 0.14
        assert cover.dimensions.depth == 0.02

    def test_no_outlets_no_change(self):
        model = _make_model([_make_block("furniture")])
        result = cover_outlets(model)
        assert len(result.blocks) == 1

    def test_does_not_mutate_original(self):
        model = _make_model([_make_block("power_outlet")])
        original_count = len(model.blocks)
        cover_outlets(model)
        assert len(model.blocks) == original_count


# ---------------------------------------------------------------------------
# 7.2  corner_guards
# ---------------------------------------------------------------------------

class TestCornerGuards:
    def test_adds_four_guards_per_sharp_furniture(self):
        model = _make_model([_make_block("sharp_edge_furniture")])
        result = corner_guards(model)
        guards = [b for b in result.blocks if b.category == "corner_guard"]
        assert len(guards) == 4

    def test_guard_dimensions(self):
        model = _make_model([_make_block("sharp_edge_furniture")])
        result = corner_guards(model)
        guard = [b for b in result.blocks if b.category == "corner_guard"][0]
        assert guard.dimensions.width == 0.05
        assert guard.dimensions.height == 0.05
        assert guard.dimensions.depth == 0.05

    def test_no_sharp_furniture_no_change(self):
        model = _make_model([_make_block("furniture")])
        result = corner_guards(model)
        assert len(result.blocks) == 1


# ---------------------------------------------------------------------------
# 7.3  child_gate_stairs
# ---------------------------------------------------------------------------

class TestChildGateStairs:
    def test_adds_gate_for_stairs(self):
        model = _make_model([_make_block("stairs", width=1.0)])
        result = child_gate_stairs(model)
        gates = [b for b in result.blocks if b.category == "child_gate"]
        assert len(gates) == 1

    def test_gate_dimensions(self):
        model = _make_model([_make_block("stairs", width=1.0)])
        result = child_gate_stairs(model)
        gate = [b for b in result.blocks if b.category == "child_gate"][0]
        assert gate.dimensions.width == 0.80
        assert gate.dimensions.height == 0.75
        assert gate.dimensions.depth == 0.05

    def test_gate_offset_by_stair_width(self):
        model = _make_model([_make_block("stairs", x=2.0, width=1.2)])
        result = child_gate_stairs(model)
        gate = [b for b in result.blocks if b.category == "child_gate"][0]
        assert gate.position.x == pytest.approx(2.0 + 1.2)

    def test_no_stairs_no_change(self):
        model = _make_model([_make_block("furniture")])
        result = child_gate_stairs(model)
        assert len(result.blocks) == 1


# ---------------------------------------------------------------------------
# 7.4  secure_heavy_objects
# ---------------------------------------------------------------------------

class TestSecureHeavyObjects:
    def test_adds_anchor_for_tall_furniture(self):
        model = _make_model([_make_block("furniture", height=1.2)])
        result = secure_heavy_objects(model)
        anchors = [b for b in result.blocks if b.category == "wall_anchor"]
        assert len(anchors) == 1

    def test_anchor_dimensions(self):
        model = _make_model([_make_block("furniture", height=0.8)])
        result = secure_heavy_objects(model)
        anchor = [b for b in result.blocks if b.category == "wall_anchor"][0]
        assert anchor.dimensions.width == 0.10
        assert anchor.dimensions.height == 0.10
        assert anchor.dimensions.depth == 0.02

    def test_short_furniture_no_anchor(self):
        model = _make_model([_make_block("furniture", height=0.4)])
        result = secure_heavy_objects(model)
        anchors = [b for b in result.blocks if b.category == "wall_anchor"]
        assert len(anchors) == 0

    def test_exactly_half_metre_no_anchor(self):
        model = _make_model([_make_block("furniture", height=0.5)])
        result = secure_heavy_objects(model)
        anchors = [b for b in result.blocks if b.category == "wall_anchor"]
        assert len(anchors) == 0


# ---------------------------------------------------------------------------
# 7.5  add_handrails
# ---------------------------------------------------------------------------

class TestAddHandrails:
    def test_adds_handrail_for_stairs(self):
        model = _make_model([_make_block("stairs", width=1.0)])
        result = add_handrails(model)
        rails = [b for b in result.blocks if b.category == "handrail"]
        assert len(rails) == 1

    def test_handrail_dimensions(self):
        model = _make_model([_make_block("stairs", width=1.0)])
        result = add_handrails(model)
        rail = [b for b in result.blocks if b.category == "handrail"][0]
        assert rail.dimensions.width == 0.05
        assert rail.dimensions.height == 0.90
        assert rail.dimensions.depth == 1.50

    def test_handrail_offset_by_stair_width(self):
        model = _make_model([_make_block("stairs", x=1.0, width=1.5)])
        result = add_handrails(model)
        rail = [b for b in result.blocks if b.category == "handrail"][0]
        assert rail.position.x == pytest.approx(1.0 + 1.5)


# ---------------------------------------------------------------------------
# 7.6  ensure_lighting
# ---------------------------------------------------------------------------

class TestEnsureLighting:
    def test_adds_lights_when_none_exist(self):
        model = _make_model([_make_block("furniture")])
        result = ensure_lighting(model)
        lights = [b for b in result.blocks if b.category == "light_fixture"]
        assert len(lights) == 2

    def test_adds_one_light_when_one_exists(self):
        model = _make_model([
            _make_block("light_fixture", y=2.7),
        ])
        result = ensure_lighting(model)
        lights = [b for b in result.blocks if b.category == "light_fixture"]
        assert len(lights) == 2

    def test_no_change_when_enough_lights(self):
        model = _make_model([
            _make_block("light_fixture", x=1.0, y=2.7),
            _make_block("light_fixture", x=3.0, y=2.7),
        ])
        result = ensure_lighting(model)
        lights = [b for b in result.blocks if b.category == "light_fixture"]
        assert len(lights) == 2

    def test_light_at_ceiling_height(self):
        model = _make_model([])
        result = ensure_lighting(model)
        lights = [b for b in result.blocks if b.category == "light_fixture"]
        for light in lights:
            assert light.position.y == pytest.approx(2.8 - 0.1)

    def test_light_dimensions(self):
        model = _make_model([])
        result = ensure_lighting(model)
        light = [b for b in result.blocks if b.category == "light_fixture"][0]
        assert light.dimensions.width == 0.40
        assert light.dimensions.height == 0.10
        assert light.dimensions.depth == 0.40


# ---------------------------------------------------------------------------
# 7.7  remove_trip_hazards
# ---------------------------------------------------------------------------

class TestRemoveTripHazards:
    def test_removes_rugs(self):
        model = _make_model([
            _make_block("rug"),
            _make_block("furniture"),
        ])
        result = remove_trip_hazards(model)
        assert len(result.blocks) == 1
        assert result.blocks[0].category == "furniture"

    def test_removes_cord_cables(self):
        model = _make_model([
            _make_block("cord_cable"),
            _make_block("furniture"),
        ])
        result = remove_trip_hazards(model)
        assert len(result.blocks) == 1
        assert result.blocks[0].category == "furniture"

    def test_removes_both_types(self):
        model = _make_model([
            _make_block("rug"),
            _make_block("cord_cable"),
            _make_block("furniture"),
        ])
        result = remove_trip_hazards(model)
        assert len(result.blocks) == 1

    def test_no_hazards_no_change(self):
        model = _make_model([_make_block("furniture")])
        result = remove_trip_hazards(model)
        assert len(result.blocks) == 1


# ---------------------------------------------------------------------------
# 7.8  widen_pathways
# ---------------------------------------------------------------------------

class TestWidenPathways:
    def test_moves_close_furniture_apart(self):
        model = _make_model([
            _make_block("furniture", x=1.0, z=1.0),
            _make_block("furniture", x=1.5, z=1.0),
        ])
        result = widen_pathways(model)
        furn = [b for b in result.blocks if b.category == "furniture"]
        # Both should have reposition metadata
        for f in furn:
            assert f.metadata.get("action") == "reposition"
            assert "offset" in f.metadata

    def test_far_furniture_not_moved(self):
        model = _make_model([
            _make_block("furniture", x=0.0, z=0.0),
            _make_block("furniture", x=5.0, z=5.0),
        ])
        result = widen_pathways(model)
        furn = [b for b in result.blocks if b.category == "furniture"]
        for f in furn:
            assert "action" not in f.metadata

    def test_non_furniture_ignored(self):
        model = _make_model([
            _make_block("power_outlet", x=1.0, z=1.0),
            _make_block("power_outlet", x=1.2, z=1.0),
        ])
        result = widen_pathways(model)
        for b in result.blocks:
            assert "action" not in b.metadata
