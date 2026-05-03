# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Concrete safety-rule implementations used by PromptProcessor.

Each rule function accepts a :class:`BlockModel` and returns a new
:class:`BlockModel` with the appropriate modifications applied.  The
functions never mutate the input model.
"""

from __future__ import annotations

import copy
import logging
import math
from typing import Any, Callable

from room_vision_ai.models import (
    Block,
    BlockModel,
    Dimensions3D,
    Position3D,
)

logger = logging.getLogger("room_vision_ai")

# Type alias for a safety-rule function
SafetyRuleFn = Callable[[BlockModel], BlockModel]


# ---------------------------------------------------------------------------
# Helper — deep-copy a BlockModel so we never mutate the original
# ---------------------------------------------------------------------------

def _copy_model(model: BlockModel) -> BlockModel:
    """Return a deep copy of *model* suitable for mutation."""
    return model.model_copy(deep=True)


# ---------------------------------------------------------------------------
# 7.1  cover_outlets
# ---------------------------------------------------------------------------

def cover_outlets(model: BlockModel) -> BlockModel:
    """Find all ``power_outlet`` blocks and add an ``outlet_cover`` block
    at the same position.

    Outlet cover dimensions: 0.10 × 0.14 × 0.02 m.
    """
    new_model = _copy_model(model)
    outlets = [b for b in new_model.blocks if b.category == "power_outlet"]
    for outlet in outlets:
        cover = Block(
            category="outlet_cover",
            label="Outlet Cover",
            description=f"Safety cover added over power outlet at "
                        f"({outlet.position.x:.2f}, {outlet.position.y:.2f}, {outlet.position.z:.2f}).",
            confidence_score=1.0,
            position=Position3D(
                x=outlet.position.x,
                y=outlet.position.y,
                z=outlet.position.z,
            ),
            dimensions=Dimensions3D(width=0.10, height=0.14, depth=0.02),
            metadata={"added_by_rule": "cover_outlets"},
        )
        new_model.blocks.append(cover)
    return new_model


# ---------------------------------------------------------------------------
# 7.2  corner_guards
# ---------------------------------------------------------------------------

def corner_guards(model: BlockModel) -> BlockModel:
    """Find all ``sharp_edge_furniture`` blocks and add 4 corner-guard
    blocks at each corner.

    Corner guard dimensions: 0.05 × 0.05 × 0.05 m.
    """
    new_model = _copy_model(model)
    sharp = [b for b in new_model.blocks if b.category == "sharp_edge_furniture"]
    for furniture in sharp:
        px, py, pz = furniture.position.x, furniture.position.y, furniture.position.z
        fw, fd = furniture.dimensions.width, furniture.dimensions.depth
        offsets = [
            (0.0, 0.0),
            (fw, 0.0),
            (0.0, fd),
            (fw, fd),
        ]
        for i, (dx, dz) in enumerate(offsets):
            guard = Block(
                category="corner_guard",
                label=f"Corner Guard {i + 1}",
                description=f"Corner guard on sharp-edged furniture at "
                            f"({px:.2f}, {py:.2f}, {pz:.2f}).",
                confidence_score=1.0,
                position=Position3D(x=px + dx, y=py, z=pz + dz),
                dimensions=Dimensions3D(width=0.05, height=0.05, depth=0.05),
                metadata={"added_by_rule": "corner_guards"},
            )
            new_model.blocks.append(guard)
    return new_model


# ---------------------------------------------------------------------------
# 7.3  child_gate_stairs
# ---------------------------------------------------------------------------

def child_gate_stairs(model: BlockModel) -> BlockModel:
    """Find all ``stairs`` blocks and add a child gate at the entrance.

    The gate is offset by the stair width along the X axis.
    Child gate dimensions: 0.80 × 0.75 × 0.05 m.
    """
    new_model = _copy_model(model)
    stairs = [b for b in new_model.blocks if b.category == "stairs"]
    for stair in stairs:
        gate = Block(
            category="child_gate",
            label="Child Gate",
            description=f"Child safety gate at stairway entrance near "
                        f"({stair.position.x:.2f}, {stair.position.y:.2f}, {stair.position.z:.2f}).",
            confidence_score=1.0,
            position=Position3D(
                x=stair.position.x + stair.dimensions.width,
                y=stair.position.y,
                z=stair.position.z,
            ),
            dimensions=Dimensions3D(width=0.80, height=0.75, depth=0.05),
            metadata={"added_by_rule": "child_gate_stairs"},
        )
        new_model.blocks.append(gate)
    return new_model


# ---------------------------------------------------------------------------
# 7.4  secure_heavy_objects
# ---------------------------------------------------------------------------

def secure_heavy_objects(model: BlockModel) -> BlockModel:
    """Find all ``furniture`` blocks taller than 0.5 m and add a
    wall-anchor indicator behind each.

    Wall anchor dimensions: 0.10 × 0.10 × 0.02 m.
    """
    new_model = _copy_model(model)
    tall_furniture = [
        b for b in new_model.blocks
        if b.category == "furniture" and b.dimensions.height > 0.5
    ]
    for furn in tall_furniture:
        anchor = Block(
            category="wall_anchor",
            label="Wall Anchor",
            description=f"Wall anchor securing tall furniture at "
                        f"({furn.position.x:.2f}, {furn.position.y:.2f}, {furn.position.z:.2f}).",
            confidence_score=1.0,
            position=Position3D(
                x=furn.position.x,
                y=furn.position.y + furn.dimensions.height * 0.5,
                z=furn.position.z - 0.02,
            ),
            dimensions=Dimensions3D(width=0.10, height=0.10, depth=0.02),
            metadata={"added_by_rule": "secure_heavy_objects"},
        )
        new_model.blocks.append(anchor)
    return new_model


# ---------------------------------------------------------------------------
# 7.5  add_handrails
# ---------------------------------------------------------------------------

def add_handrails(model: BlockModel) -> BlockModel:
    """Find all ``stairs`` blocks and add a handrail alongside.

    The handrail is offset by the stair width along the X axis.
    Handrail dimensions: 0.05 × 0.90 × 1.50 m.
    """
    new_model = _copy_model(model)
    stairs = [b for b in new_model.blocks if b.category == "stairs"]
    for stair in stairs:
        handrail = Block(
            category="handrail",
            label="Handrail",
            description=f"Handrail added alongside stairs at "
                        f"({stair.position.x:.2f}, {stair.position.y:.2f}, {stair.position.z:.2f}).",
            confidence_score=1.0,
            position=Position3D(
                x=stair.position.x + stair.dimensions.width,
                y=stair.position.y,
                z=stair.position.z,
            ),
            dimensions=Dimensions3D(width=0.05, height=0.90, depth=1.50),
            metadata={"added_by_rule": "add_handrails"},
        )
        new_model.blocks.append(handrail)
    return new_model


# ---------------------------------------------------------------------------
# 7.6  ensure_lighting
# ---------------------------------------------------------------------------

def ensure_lighting(model: BlockModel) -> BlockModel:
    """If there are fewer than 2 ``light_fixture`` blocks, add new ones
    at ceiling height.

    Light fixture dimensions: 0.40 × 0.10 × 0.40 m.
    Placed at ``room_height - 0.1`` on the Y axis.
    """
    new_model = _copy_model(model)
    existing_lights = [b for b in new_model.blocks if b.category == "light_fixture"]
    room_h = new_model.room_dimensions.height
    room_w = new_model.room_dimensions.width
    room_d = new_model.room_dimensions.depth

    if len(existing_lights) < 2:
        needed = 2 - len(existing_lights)
        for i in range(needed):
            # Spread lights evenly across the room
            x = room_w * (i + 1) / (needed + 1)
            light = Block(
                category="light_fixture",
                label="Ceiling Light",
                description=f"Additional ceiling light added for adequate lighting.",
                confidence_score=1.0,
                position=Position3D(
                    x=round(x, 2),
                    y=round(room_h - 0.1, 2),
                    z=round(room_d / 2, 2),
                ),
                dimensions=Dimensions3D(width=0.40, height=0.10, depth=0.40),
                metadata={"added_by_rule": "ensure_lighting"},
            )
            new_model.blocks.append(light)
    return new_model


# ---------------------------------------------------------------------------
# 7.7  remove_trip_hazards
# ---------------------------------------------------------------------------

def remove_trip_hazards(model: BlockModel) -> BlockModel:
    """Find all ``rug`` and ``cord_cable`` blocks and remove them.

    Removed blocks are excluded from the output model.
    """
    new_model = _copy_model(model)
    trip_categories = {"rug", "cord_cable"}
    new_model.blocks = [
        b for b in new_model.blocks if b.category not in trip_categories
    ]
    return new_model


# ---------------------------------------------------------------------------
# 7.8  widen_pathways
# ---------------------------------------------------------------------------

def widen_pathways(model: BlockModel) -> BlockModel:
    """Find pairs of ``furniture`` blocks that are close together
    (< 1.0 m apart) and reposition them to widen the pathway.

    Adds ``metadata.action = "reposition"`` and an offset vector.
    """
    new_model = _copy_model(model)
    furniture = [b for b in new_model.blocks if b.category == "furniture"]

    moved_ids: set[str] = set()

    for i, a in enumerate(furniture):
        for j, b in enumerate(furniture):
            if j <= i:
                continue
            dist = _distance(a.position, b.position)
            if dist < 1.0:
                # Move each block outward by 0.3 m along the line between them
                dx, dy, dz = _direction(a.position, b.position)
                a_id = str(a.block_id)
                b_id = str(b.block_id)

                if a_id not in moved_ids:
                    a.position.x -= dx * 0.3
                    a.position.z -= dz * 0.3
                    a.metadata["action"] = "reposition"
                    a.metadata["offset"] = [round(-dx * 0.3, 3), 0.0, round(-dz * 0.3, 3)]
                    moved_ids.add(a_id)

                if b_id not in moved_ids:
                    b.position.x += dx * 0.3
                    b.position.z += dz * 0.3
                    b.metadata["action"] = "reposition"
                    b.metadata["offset"] = [round(dx * 0.3, 3), 0.0, round(dz * 0.3, 3)]
                    moved_ids.add(b_id)

    return new_model


# ---------------------------------------------------------------------------
# Registry: rule_id → function
# ---------------------------------------------------------------------------

SAFETY_RULE_FUNCTIONS: dict[str, SafetyRuleFn] = {
    "cover_outlets": cover_outlets,
    "corner_guards": corner_guards,
    "child_gate_stairs": child_gate_stairs,
    "secure_heavy_objects": secure_heavy_objects,
    "add_handrails": add_handrails,
    "ensure_lighting": ensure_lighting,
    "remove_trip_hazards": remove_trip_hazards,
    "widen_pathways": widen_pathways,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _distance(a: Position3D, b: Position3D) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def _direction(a: Position3D, b: Position3D) -> tuple[float, float, float]:
    """Unit direction vector from *a* to *b*.  Returns (0,0,0) if coincident."""
    dist = _distance(a, b)
    if dist == 0:
        return (0.0, 0.0, 0.0)
    return (
        (b.x - a.x) / dist,
        (b.y - a.y) / dist,
        (b.z - a.z) / dist,
    )
