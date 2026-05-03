# Task: Implement SurfaceManager MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 7.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/SurfaceManager.cs`

---

## Task Prompt

Implement `SurfaceManager` MonoBehaviour with:
- `SetSurfaceColor(surfaceId, color)` — applies color to the surface's `Material` instance within one frame
- `SetSurfaceTextureAsync(surfaceId, filePath)` — loads PNG/JPG, checks file size ≤ 10 MB, applies texture tiling via `material.mainTextureScale`; returns `false` and raises `OnValidationError` for oversized files
- `GetSurfaceMaterial(surfaceId)` — returns the surface's `Material` instance
- Each `SurfaceId` maps to a distinct `Material` instance (no shared materials between surfaces)

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `ISurfaceManager` in `Assets/RoomVisualizer/Scripts/Interfaces/` to confirm the required method signatures (`SetSurfaceColor`, `SetSurfaceTextureAsync`, `GetSurfaceMaterial`) and the `OnValidationError` event.

2. **Created `SurfaceManager.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, ISurfaceManager` inheritance.

3. **Defined constants and SerializeFields** — `MaxFileSizeBytes = 10 * 1024 * 1024` (10 MB) as a named constant; `_defaultTileX` and `_defaultTileY` as `[SerializeField] float` fields (default 1×1) so tiling is configurable from the Inspector without code changes.

4. **Implemented `Awake()`** — resolves the `IRoomController` dependency (Inspector-assigned `RoomController` field with `FindObjectOfType<RoomController>()` fallback), then iterates all `SurfaceId` enum values. For each surface, retrieves the `MeshRenderer` via `roomController.GetSurface(id)`, creates an independent `Material` instance with `new Material(renderer.sharedMaterial)`, assigns it back to `renderer.material`, and stores it in `_materials`.

5. **Implemented `SetSurfaceColor()`** — calls `GetMaterialOrWarn()` to retrieve the material, then sets `mat.color`. The assignment is synchronous and takes effect within the current rendered frame.

6. **Implemented `SetSurfaceTextureAsync()`** — performs three sequential checks before touching the material:
   - File existence (`File.Exists`)
   - File size (`new FileInfo(filePath).Length > MaxFileSizeBytes`) — raises `OnValidationError` and returns `false` immediately if exceeded
   - Async byte read (`await Task.Run(() => File.ReadAllBytes(filePath))`) off the main thread
   
   Then decodes on the main thread with `Texture2D.LoadImage(bytes)`, applies `mat.mainTexture` and `mat.mainTextureScale`, and returns `true`. Any failure path raises `OnValidationError` and returns `false`.

7. **Implemented `GetSurfaceMaterial()`** — performs a `Dictionary<SurfaceId, Material>.TryGetValue` lookup and returns the result (or `null` if not found).

8. **Added `GetMaterialOrWarn()` helper** — centralises the dictionary lookup with a `Debug.LogWarning` for missing entries, keeping `SetSurfaceColor` and `SetSurfaceTextureAsync` free of repeated boilerplate.

---

## Implementation Choices and Reasoning

### `new Material(renderer.sharedMaterial)` in Awake for independent material instances
Unity's `renderer.sharedMaterial` is shared across all GameObjects using the same material asset. Mutating it would change every surface simultaneously. Creating a `new Material(renderer.sharedMaterial)` copies the material properties into a fresh instance and assigns it to `renderer.material`, so each surface has its own independent material. This satisfies Requirement 5.4 and is the standard Unity pattern for per-instance material customisation.

### `Task.Run(() => File.ReadAllBytes(...))` for async file reading
`File.ReadAllBytes` is a blocking I/O call. Running it on the main thread would stall Unity's game loop for the duration of the disk read — noticeable for textures approaching the 10 MB limit. `Task.Run` offloads the read to a thread-pool thread, keeping the main thread responsive. The `await` then resumes on the main thread (Unity's `SynchronizationContext`) so subsequent Unity API calls are safe.

### `Texture2D.LoadImage` on the main thread (Unity API restriction)
Unity's rendering API is not thread-safe. `Texture2D.LoadImage` (and all `Texture2D` construction) must be called on the main thread. The async pattern therefore splits the work: bytes are read off-thread, then decoded on-thread. This is the correct approach for async texture loading without `UnityWebRequest`.

### `FileInfo.Length > 10 MB` check before loading (fail fast, no wasted I/O)
The size check uses `new FileInfo(filePath).Length`, which reads only the file's metadata from the filesystem — no file content is read. Performing this check before `Task.Run` means oversized files are rejected immediately without ever allocating a byte array or touching the disk for content. This is the "fail fast" principle: validate cheaply before committing to expensive work.

### `material.mainTextureScale` for tiling (configurable via SerializeField)
`material.mainTextureScale` is the standard Unity property for UV tiling on the main texture. Exposing `_defaultTileX` and `_defaultTileY` as `[SerializeField]` fields lets designers adjust tiling per-scene in the Inspector without modifying code. The default of `(1, 1)` means no tiling, which is the correct neutral default.

### `OnValidationError` event for oversized files (consistent with RoomController pattern)
`RoomController.SetDimensions` uses the same `event Action<string> OnValidationError` pattern to report validation failures without throwing exceptions. `SurfaceManager` follows the same convention so the UI layer (`UIBridge`, Task 12) can subscribe to a uniform error event across all subsystems. Throwing exceptions from async Unity code would be harder to catch and would produce noisy console output.

### `IRoomController` injected via SerializeField with FindObjectOfType fallback
The same dependency injection pattern used by `CollisionSystem` and `ObjectPlacer`: an Inspector-assignable `[SerializeField] RoomController` field for explicit wiring in the Editor, with a `FindObjectOfType<RoomController>()` fallback for scenes where the reference was not set. This keeps the component usable in both hand-crafted and programmatically constructed scenes.

---

## Summary

Task 7.1 is complete. `SurfaceManager` is a ~170-line MonoBehaviour that fully implements `ISurfaceManager`: in `Awake`, it creates one independent `Material` instance per surface by copying from `sharedMaterial`, ensuring all six surfaces are fully decoupled. `SetSurfaceColor` applies color synchronously. `SetSurfaceTextureAsync` validates file existence and size before reading bytes off the main thread, then decodes and applies the texture on the main thread with configurable UV tiling. All failure paths raise `OnValidationError` and return `false`, leaving the material unchanged. Ready for Task 7.2 (property test for surface material independence) and Task 7.3 (property test for texture size validation).
