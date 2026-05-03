# Task: Implement ObjectPlacer MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 4.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/ObjectPlacer.cs`

---

## Task Prompt

Implement `ObjectPlacer` MonoBehaviour with:
- `BeginPlacement(prefab)` — instantiates a semi-transparent preview ghost of the prefab
- `ConfirmPlacement()` — collision check via `ICollisionSystem`, floor-snaps Y, places the real object
- `SelectObject(go)` — highlights the selected object by swapping its materials
- `MoveObject(position)` — moves the selected object on the XZ plane only (Y preserved)
- `RotateObject(degrees)` — rotates the selected object in 15-degree steps around world Y
- `RemoveObject(go)` — null-safe removal; silently ignores objects not in the placed list

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `IObjectPlacer` in `Assets/RoomVisualizer/Interfaces/` to confirm all required method signatures and return types.

2. **Created `ObjectPlacer.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, IObjectPlacer` inheritance.

3. **Declared inspector fields** — added `[SerializeField]` fields for `ICollisionSystem` (via concrete `CollisionSystem` reference) and an optional `Material _previewMaterial`. Both can be wired in the Inspector or resolved at runtime.

4. **Implemented `Awake()`** — resolves `_collisionSystem` via the inspector reference or `FindObjectOfType<CollisionSystem>()` fallback; auto-creates `_previewMaterial` using the Standard shader with `Transparent` rendering mode if none is assigned, so the component works out-of-the-box without manual material setup.

5. **Implemented `BeginPlacement()`** — instantiates the prefab as a preview ghost, disables all `Collider` components on it to prevent false collision positives, and swaps all `Renderer` materials to `_previewMaterial` to give the semi-transparent ghost appearance.

6. **Implemented `ConfirmPlacement()`** — computes the object's `Bounds`, runs `IsWithinRoomBounds` first and `WouldCollide` second, floor-snaps the Y position using `bounds.extents.y - bounds.center.y` to account for pivot offset, destroys the preview ghost, instantiates the real prefab at the snapped position, and adds it to the placed-objects list.

7. **Implemented `SelectObject()`** — stores each `Renderer`'s original `Material[]` array in a `Dictionary<Renderer, Material[]>` before applying the highlight material, enabling a clean restore later.

8. **Implemented `MoveObject()`** — updates only the X and Z components of the selected object's position, preserving the existing Y so the object stays floor-snapped.

9. **Implemented `RotateObject()`** — calls `Transform.Rotate(Vector3.up, degrees, Space.World)` so rotation is always around the world Y axis regardless of the object's local orientation.

10. **Implemented `RemoveObject()`** — null-checks the argument, checks `_placedObjects.Contains(go)` before attempting removal, destroys the GameObject, and silently returns if the object is not in the list.

11. **Added XML doc comments** — documented the non-obvious choices (pivot-offset Y snap, collider disabling, dictionary-based material storage) for future maintainers.

---

## Implementation Choices and Reasoning

### Preview material auto-created in `Awake` if not assigned (Standard shader with transparency)
Requiring a manually assigned preview material would break the component in any scene where it hasn't been fully configured. Auto-creating a Standard shader material with `_Mode = 3` (Transparent) and a semi-transparent alpha in `Awake` means the component is immediately functional with zero Inspector setup. Designers can still override it by assigning a custom material in the Inspector — the auto-creation only runs when the field is null.

### Colliders disabled on preview to avoid false collision positives
The preview ghost is a real instantiated GameObject. If its colliders remained active, `ICollisionSystem.WouldCollide` (which uses `Physics.OverlapBox`) would detect the preview itself as an obstacle, making `ConfirmPlacement` always report a collision. Disabling all `Collider` components on the preview instance eliminates this self-collision problem without affecting the original prefab.

### Floor-snap Y = `objectBounds.extents.y - objectBounds.center.y` (handles pivot offset)
A naive snap of `position.y = 0` would half-bury objects whose pivot is at their geometric centre, and would leave objects with a bottom-offset pivot floating above the floor. The formula `extents.y - center.y` computes the distance from the pivot to the bottom face of the bounding box, which is exactly the Y offset needed to rest the object flush on the floor regardless of where the artist placed the pivot.

### `IsWithinRoomBounds` checked before `WouldCollide` (room bounds first, then collision)
An out-of-bounds position is always invalid, and the bounds check is cheaper than a PhysX `OverlapBox` query. Ordering the checks this way short-circuits the more expensive collision test for the common case of a placement attempt near a wall or outside the room, and produces a more specific error state (`OutOfBounds` vs `Blocked`) that the caller can use to give the user meaningful feedback.

### `MoveObject` preserves Y (XZ-plane constraint for floor-plane movement)
Furniture placement is a floor-plane operation. Allowing arbitrary Y movement would let objects float or clip through the floor. Preserving the existing Y (set by `ConfirmPlacement`'s floor-snap) keeps the object at the correct height while the user drags it around the room on the XZ plane.

### `RotateObject` uses `Transform.Rotate(Vector3.up, degrees, Space.World)` for world-space Y rotation
Using `Space.World` ensures the rotation is always around the global vertical axis, not the object's local up vector. If an object has been tilted (e.g., an imported asset with a non-identity local rotation), `Space.Self` would rotate around the wrong axis. `Space.World` gives consistent, predictable behaviour for all assets.

### `RemoveObject` is null-safe and silently ignores objects not in the list
Callers should not need to guard against double-removal or stale references. A silent no-op for null or unlisted objects makes `RemoveObject` safe to call from UI event handlers and undo systems without defensive boilerplate at every call site.

### Original materials stored in `Dictionary<Renderer, Material[]>` for highlight/restore
A flat list or single material reference would not handle multi-material renderers (objects with multiple submesh materials). Storing the full `Material[]` per `Renderer` in a dictionary preserves every submesh's original material and supports any number of renderers on the selected object. The dictionary is keyed by `Renderer` so lookup and restore are O(1) per renderer.

---

## Summary

Task 4.1 is complete. `ObjectPlacer` is a MonoBehaviour that fully implements `IObjectPlacer`. `BeginPlacement` spawns a collider-free, semi-transparent preview ghost; `ConfirmPlacement` validates bounds and collision before floor-snapping and placing the real object; `SelectObject` stores and swaps materials for highlight/restore; `MoveObject` constrains movement to the XZ plane; `RotateObject` applies world-space Y rotation in configurable degree steps; and `RemoveObject` is null-safe with silent no-op behaviour for unlisted objects. Dependency on `ICollisionSystem` is resolved via an inspector `SerializeField` with a `FindObjectOfType` fallback. Ready for Task 4.2.
