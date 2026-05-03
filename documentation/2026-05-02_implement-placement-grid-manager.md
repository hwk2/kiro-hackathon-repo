# Task: Implement PlacementGridManager MonoBehaviour

**Date:** 2026-05-02
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 16.1
**Unity Version:** 6000.3.1f1
**Files created/modified:**
- `Assets/RoomVisualizer/Scripts/Interfaces/IPlacementGridManager.cs` (new)
- `Assets/RoomVisualizer/Scripts/PlacementGridManager.cs` (new)
- `Assets/RoomVisualizer/Scripts/RoomController.cs` (modified — added `OnDimensionsChanged` event)

---

## Task Prompt

Implement `PlacementGridManager` MonoBehaviour:
- `GridToWorld(surfaceId, gridX, gridY)` — world-space centre of a grid cell for Floor, WallNorth, WallSouth, WallEast, WallWest
- `WorldToGrid(surfaceId, worldPosition)` — nearest grid cell coordinates clamped to valid bounds
- `IsCellOccupied(surfaceId, gridX, gridY)` — queries a `HashSet<Vector2Int>` per surface
- `MarkOccupied` / `MarkUnoccupied` — iterate over the footprint rectangle
- `RecalculateGrids()` — rebuilds extents from `IRoomController.Dimensions`, clears occupancy; subscribes to `RoomController.OnDimensionsChanged`
- Default `CellSize = 0.5f` metres; exposed as `[SerializeField]`

---

## Step-by-Step Process

1. **Read existing contracts** — reviewed `IRoomController`, `SurfaceId` enum, and `RoomController` to understand the room geometry coordinate system (width = X, height = Y, depth = Z; room centred at world origin).

2. **Created `IPlacementGridManager` interface** at `Scripts/Interfaces/IPlacementGridManager.cs` with all six methods: `CellSize`, `GridToWorld`, `WorldToGrid`, `IsCellOccupied`, `MarkOccupied`, `MarkUnoccupied`, `RecalculateGrids`.

3. **Added `OnDimensionsChanged` event to `RoomController`** — declared `public event Action<Vector3> OnDimensionsChanged` and raised it at the end of the successful `SetDimensions` path. This avoids polling and keeps `PlacementGridManager` in sync without coupling the two classes directly.

4. **Implemented `PlacementGridManager`** — MonoBehaviour implementing `IPlacementGridManager`:
   - `Awake` resolves `RoomController` (inspector ref or `FindObjectOfType`), subscribes to `OnDimensionsChanged`, and calls `RecalculateGrids()`.
   - `RecalculateGrids` computes grid dimensions using `CeilToInt(dimension / cellSize)` and clears all occupancy `HashSet<Vector2Int>` instances.
   - `GridToWorld` uses per-surface origin offsets derived from room half-dimensions, adding `gridX * cellSize + cellSize/2` for the cell centre.
   - `WorldToGrid` inverts the same formula with `FloorToInt`, then clamps to `[0, gridSize - 1]`.
   - `MarkOccupied` / `MarkUnoccupied` iterate the `width × height` footprint rectangle.

5. **Created `.meta` files** for both new C# files with fresh GUIDs.

6. **Verified diagnostics** — no compile errors or warnings on all three affected files.

---

## Implementation Choices and Reasoning

### Per-surface `HashSet<Vector2Int>` for occupancy
A `HashSet` gives O(1) lookup for `IsCellOccupied` and O(footprint) for mark/unmark — the right trade-off for a grid that may have hundreds of cells but only tens of placed objects. A 2D boolean array would be faster for dense grids but requires reallocation on every `RecalculateGrids` call; the `HashSet` approach is simpler and allocation-free during normal gameplay.

### `CeilToInt` for grid dimensions
Using `Ceil` rather than `Floor` ensures the grid always covers the full surface even when the room dimension is not an exact multiple of `cellSize`. A 5.1 m wall with 0.5 m cells gets 11 columns, not 10, so no surface area is left uncovered.

### Separate coordinate origins per surface
Each surface has a different world-space origin for its grid:
- Floor: `(-w/2, 0, -d/2)` — bottom-left corner when viewed from above.
- North/South walls: `(-w/2, 0, ±d/2)` — left edge at floor level.
- East/West walls: `(±w/2, 0, -d/2)` — front edge at floor level, with gridX mapping to Z.

This keeps `GridToWorld` and `WorldToGrid` exact inverses of each other (Property 20), which is the key correctness requirement.

### `OnDimensionsChanged` event on `RoomController`
Rather than having `PlacementGridManager` poll `RoomController.Dimensions` every frame or call `RecalculateGrids` manually, adding a C# event to `RoomController` creates a clean publish-subscribe relationship. The event carries the new `Vector3` dimensions so subscribers don't need to re-query. This pattern is consistent with the existing `OnValidationError` event on the same class.

### Ceiling excluded from placement surfaces
The `PlacementSurfaces` array omits `SurfaceId.Ceiling` because no furniture or decoration prefab in the starter library is ceiling-mounted. Excluding it keeps the occupancy dictionary smaller and avoids confusing `WorldToGrid` calls for a surface that is never used for placement.

---

## Summary

Task 16.1 is complete. `IPlacementGridManager` defines the grid contract; `PlacementGridManager` implements it as a MonoBehaviour with five independent grids (Floor + 4 walls), `HashSet`-based occupancy tracking, and automatic recalculation when room dimensions change via the new `RoomController.OnDimensionsChanged` event. All diagnostics are clean. Ready for Task 16.2 (property tests) and Task 17 (PlaceableObject component).
