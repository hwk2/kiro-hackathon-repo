# Task: Implement RoomController MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 2.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/RoomController.cs`

---

## Task Prompt

Implement `RoomController` MonoBehaviour with:
- `SetDimensions(width, depth, height)` — validates all three values in [1, 50] metres; returns `false` and raises `OnValidationError` on rejection
- `GetRoomBounds()` — returns an axis-aligned `Bounds` matching current dimensions
- `GetSurface(SurfaceId)` — returns the corresponding child `GameObject`
- Six surface child GameObjects: `WallNorth`, `WallSouth`, `WallEast`, `WallWest`, `Floor`, `Ceiling`; transforms updated whenever dimensions change

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `IRoomController` in `Assets/RoomVisualizer/Interfaces/` to confirm the required method signatures, `Dimensions` property, and `OnValidationError` event.

2. **Created `RoomController.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, IRoomController` inheritance.

3. **Defined constants** — `MinDimension = 1f`, `MaxDimension = 50f`, and default room size (5 m × 5 m × 3 m) as named constants to avoid magic numbers.

4. **Implemented `Awake()`** — sets `Dimensions` to defaults, calls `CreateSurfaces()` to build the six child GameObjects, then calls `UpdateSurfaceTransforms()` to position them correctly from the first frame.

5. **Implemented `CreateSurfaces()`** — iterates `Enum.GetValues(typeof(SurfaceId))`, creates a `Quad` primitive for each value, parents it to the `RoomController` transform, names it after the enum value, and immediately destroys the auto-added `MeshCollider`.

6. **Implemented `UpdateSurfaceTransforms()`** — computes half-extents from current `Dimensions` and calls `SetSurfaceTransform()` for each of the six surfaces with the correct `localPosition`, `localEulerAngles`, and `localScale`.

7. **Implemented `SetDimensions()`** — validates each parameter independently with `IsValidDimension()`, fires `OnValidationError` with a descriptive message on the first failing parameter, and returns `false` without mutating state. On success, updates `Dimensions` and calls `UpdateSurfaceTransforms()`.

8. **Implemented `GetRoomBounds()`** — returns `new Bounds(Vector3.zero, Dimensions)`, centred at the world origin.

9. **Implemented `GetSurface()`** — performs a `Dictionary<SurfaceId, GameObject>.TryGetValue` lookup and returns the result (or `null` if not found).

---

## Implementation Choices and Reasoning

### Quad primitives for surfaces
`GameObject.CreatePrimitive(PrimitiveType.Quad)` produces a flat, single-sided mesh with a `MeshRenderer` and `MeshFilter` already attached. This is the lightest Unity primitive for a flat surface — no wasted geometry compared to a `Plane` (which is 10×10 subdivided). The `SurfaceManager` (Task 7) can later access the `MeshRenderer` directly via `GetComponent` to apply materials.

### Collider removal
`CreatePrimitive` automatically adds a `MeshCollider` to a Quad. Room surfaces must not participate in `Physics.OverlapBox` queries used by `CollisionSystem` (Task 3) — otherwise every placement attempt would report a collision with the floor or walls. The collider is destroyed immediately after creation in `CreateSurfaces()`.

### `Bounds` centred at origin
`GetRoomBounds()` returns `new Bounds(Vector3.zero, Dimensions)`. Centring at the world origin simplifies all downstream consumers: `CollisionSystem.IsWithinRoomBounds`, `CameraController` clamping, and `SceneSerializer` all work in world space relative to the origin without needing to account for a room offset.

### `Dimensions` stored as `Vector3(width, height, depth)`
Unity's `Bounds.size` uses `(x, y, z)` = `(width, height, depth)`, so storing `Dimensions` in the same layout means `GetRoomBounds()` is a one-liner and the mapping is unambiguous. The `SetDimensions` signature takes `(width, depth, height)` to match the interface contract; the constructor reorders to `(width, height, depth)` for the `Vector3`.

### `OnValidationError` event instead of exceptions
MonoBehaviours run on Unity's main thread inside the game loop. Throwing exceptions from `SetDimensions` would propagate up through Unity's update cycle and produce noisy console errors. The `event Action<string>` pattern lets the UI layer (UIBridge, Task 12) subscribe and display a user-facing message without disrupting the game loop.

### Validation fails on first bad parameter
Each parameter is validated independently and the method returns immediately on the first failure. This gives the caller a specific error message (e.g. "Width 0.5 m is out of range") rather than a generic "invalid dimensions" message, making it easier to surface actionable feedback in the UI.

### `Dictionary<SurfaceId, GameObject>` for surface lookup
A dictionary keyed by `SurfaceId` gives O(1) lookup in `GetSurface()` and `UpdateSurfaceTransforms()`. The alternative (a switch statement or array indexed by cast int) would be more fragile if the enum order ever changes.

### Surface orientations
All Quad normals face inward (toward the room interior) so Unity's default single-sided shader renders them correctly from inside the room:
- **Floor**: rotated +90° around X so the Quad (default normal +Z) faces +Y
- **Ceiling**: rotated −90° around X, placed at Y = height, normal faces −Y
- **WallNorth/South/East/West**: rotated around Y to face inward, positioned at the corresponding half-extent edge

---

## Summary

Task 2.1 is complete. `RoomController` is a 180-line MonoBehaviour that fully implements `IRoomController`: six Quad-primitive surface children are created in `Awake`, colliders are stripped, and all transforms are recomputed whenever `SetDimensions` is called with valid values. Invalid dimensions are rejected with a descriptive `OnValidationError` event and a `false` return value, leaving the room state unchanged. Ready for Task 2.2 (property test for dimension validation) and Task 3 (CollisionSystem).
