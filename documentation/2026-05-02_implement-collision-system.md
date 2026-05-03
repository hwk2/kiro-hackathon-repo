# Task: Implement CollisionSystem MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 3.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/CollisionSystem.cs`

---

## Task Prompt

Implement `CollisionSystem` MonoBehaviour with:
- `WouldCollide(objectBounds, proposedPosition)` — uses `Physics.OverlapBox` to detect whether placing an object at the proposed position would overlap any existing collider
- `IsWithinRoomBounds(objectBounds, position)` — checks full containment inside `IRoomController.GetRoomBounds()` by testing both the min and max corners of the object's world-space bounds
- `IRoomController` injected via a `[SerializeField]` inspector reference, with a `FindObjectOfType<RoomController>()` fallback in `Awake()`

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `ICollisionSystem` in `Assets/RoomVisualizer/Interfaces/` to confirm the required method signatures (`WouldCollide` and `IsWithinRoomBounds`), both accepting a `Bounds` and a `Vector3`.

2. **Created `CollisionSystem.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, ICollisionSystem` inheritance.

3. **Declared the inspector field** — added a `[SerializeField] private RoomController _roomControllerRef` field (concrete type so Unity can serialize it) alongside a private `IRoomController _roomController` field used at runtime.

4. **Implemented `Awake()`** — assigns `_roomController` from the inspector reference if set; otherwise calls `FindObjectOfType<RoomController>()` and logs a `Debug.LogError` if nothing is found, so misconfiguration is immediately visible in the console.

5. **Implemented `WouldCollide()`** — computes `worldCenter = proposedPosition + objectBounds.center` to account for pivot offset, then calls `Physics.OverlapBox(worldCenter, objectBounds.extents, Quaternion.identity)` and returns `true` if any colliders are reported.

6. **Implemented `IsWithinRoomBounds()`** — guards against a null `_roomController` with a `Debug.LogWarning` and early `false` return; constructs `worldObjectBounds` at `position + objectBounds.center`; returns `roomBounds.Contains(worldObjectBounds.min) && roomBounds.Contains(worldObjectBounds.max)`.

7. **Added XML doc comments** — documented the pivot-offset reasoning on `WouldCollide` and the null-guard behaviour on `IsWithinRoomBounds` so future readers understand the non-obvious choices.

---

## Implementation Choices and Reasoning

### `Physics.OverlapBox` for collision detection
`Physics.OverlapBox` delegates the broad-phase and narrow-phase work to Unity's PhysX integration. The alternative — manually intersecting `Bounds` structs against every placed object — would require maintaining a separate registry of all placed-object bounds and replicating intersection logic that PhysX already handles correctly and efficiently. `OverlapBox` also naturally handles any future non-axis-aligned objects if a rotation is passed in.

### `worldCenter = proposedPosition + objectBounds.center` (handles pivot offset)
A `Bounds` returned by a `Renderer` or `Collider` has its `center` expressed relative to the object's pivot, not necessarily at the pivot itself. If an object's mesh is offset from its pivot (common with imported assets), using `proposedPosition` alone as the box centre would shift the overlap check by that offset. Adding `objectBounds.center` corrects for this, placing the PhysX query exactly where the object's geometry would be.

### `Bounds.Contains` on both min and max corners for full containment
`Bounds.Contains(point)` tests a single point. Testing only the centre would allow an object to straddle a wall as long as its centre was inside. Testing both `worldObjectBounds.min` and `worldObjectBounds.max` is sufficient for an axis-aligned box: if both extreme corners are inside the room bounds, all intermediate points must be as well (by convexity of the AABB). This avoids iterating all eight corners while still guaranteeing full containment.

### `SerializeField` + `FindObjectOfType` fallback for dependency injection
Unity MonoBehaviours cannot use constructor injection. A `[SerializeField]` reference lets a designer wire up the dependency in the Inspector without any code change, which is the idiomatic Unity pattern. The `FindObjectOfType<RoomController>()` fallback means the component works correctly in scenes where the reference was not manually assigned (e.g., during automated testing or when the scene is assembled at runtime), at the cost of a one-time scene scan in `Awake`.

### Room surfaces have no colliders — they don't interfere with `OverlapBox`
`RoomController.CreateSurfaces()` (Task 2.1) immediately destroys the `MeshCollider` that `CreatePrimitive(PrimitiveType.Quad)` adds automatically. Because the floor, ceiling, and walls carry no colliders, `Physics.OverlapBox` never reports them as overlaps. This means `WouldCollide` only detects other placed-object colliders, which is the correct behaviour — an object resting on the floor should not be considered "colliding" with it.

---

## Summary

Task 3.1 is complete. `CollisionSystem` is a ~90-line MonoBehaviour that fully implements `ICollisionSystem`. `WouldCollide` delegates to `Physics.OverlapBox` with a pivot-corrected world-space centre, and `IsWithinRoomBounds` performs a two-corner containment check against the live room bounds from `IRoomController`. Dependency on `IRoomController` is resolved via an inspector `SerializeField` with a `FindObjectOfType` fallback, and a `Debug.LogError` surfaces misconfiguration immediately. Ready for Task 3.2 (property tests for collision and bounds logic).
