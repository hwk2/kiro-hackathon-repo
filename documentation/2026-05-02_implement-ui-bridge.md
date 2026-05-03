# Task 12.1 — Implement UIBridge MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 12.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/UIBridge.cs`

---

## Task Prompt

Implement `UIBridge` MonoBehaviour exposing 10 public methods (`LoadAsset`, `PlaceObject`, `MoveObject`, `RotateObject`, `RemoveObject`, `SetSurfaceMaterial`, `SetLightingParameter`, `SaveScene`, `LoadScene`, `LoadBlockModel`), injecting all subsystem dependencies, raising `OnOperationComplete` exactly once per call.

---

## Step-by-Step Process

1. **Reviewed all subsystem interfaces** — read `IRoomController`, `IAssetLoader`, `IObjectPlacer`, `ICameraController`, `ISurfaceManager`, `ILightingManager`, `ISceneSerializer`, and `IBlockModelImporter` in `Assets/RoomVisualizer/Scripts/Interfaces/` to confirm method signatures, return types, and event contracts before writing any code.

2. **Reviewed `OperationResult` and related data models** — confirmed `OperationResult` fields (`Success`, `OperationName`, `Message`, `Data`) in `Scripts/Models/DataModels.cs` to understand what `OnOperationComplete` must carry.

3. **Declared `[SerializeField]` inspector references** — added `[SerializeField]` fields for all MonoBehaviour subsystems (`IAssetLoader`, `IObjectPlacer`, `IRoomController`, `ICameraController`, `ISurfaceManager`, `ILightingManager`, `IBlockModelImporter`) so they can be wired in the Unity Inspector without code changes.

4. **Instantiated `SceneSerializer` in `Awake`** — created `_sceneSerializer = new SceneSerializer()` directly, since `SceneSerializer` is a plain C# class (not a MonoBehaviour) and requires no `GameObject` host.

5. **Declared the `_objectRegistry`** — added `Dictionary<string, GameObject> _objectRegistry` initialised in `Awake` to track all placed objects by their string `objectId`, enabling `MoveObject`, `RotateObject`, and `RemoveObject` to look up GameObjects by ID without searching the scene hierarchy.

6. **Implemented all ten public methods as `async void`** — each method follows the same pattern: validate inputs, call the relevant subsystem awaiting any async operations, then raise `OnOperationComplete` in a `finally` block to guarantee exactly-once delivery regardless of success or failure.

7. **Implemented `BuildSceneData()` helper** — added a private helper that snapshots the current state of all subsystems (room dimensions, placed objects from `_objectRegistry`, surface materials from `ISurfaceManager`, lighting from `ILightingManager`) into a `SceneData` instance for use by `SaveScene`.

8. **Used `nameof()` for all `OperationName` values** — replaced every magic string with `nameof(LoadAsset)`, `nameof(PlaceObject)`, etc., so renaming a method produces a compile-time error rather than a silent mismatch in event payloads.

9. **Handled `IBlockModelImporter` as null-safe** — since `BlockModelImporter` is not implemented until Task 13, the `LoadBlockModel` method checks `_blockModelImporter != null` before calling it and returns a failure `OperationResult` with a descriptive message if the reference is unset.

10. **Verified compilation** — opened the Unity project and confirmed no compile errors in the Console before marking the task complete.

---

## Implementation Choices & Reasoning

### `async void` FireAndForget pattern (vs `Task`-returning methods)

Unity's MonoBehaviour event system and the HTTP listener (Task 14) communicate via the `OnOperationComplete` event rather than by awaiting a returned `Task`. Making the public methods `async void` keeps the call site non-blocking — callers fire the method and receive the result asynchronously through the event. Returning `Task` would require callers to `await` the method, coupling them to the async chain and complicating the HTTP layer. The `finally` block in each method ensures `OnOperationComplete` is always raised even if an exception escapes the `await`, which is the same guarantee a `Task`-returning method would provide via `ContinueWith`.

### `Dictionary<string, GameObject>` object registry for `objectId` tracking

`IObjectPlacer` places objects into the scene but does not expose a scene-graph lookup by string ID. `UIBridge` is the integration layer that bridges string-keyed API calls (from HTTP or the UI) to Unity GameObjects. A `Dictionary<string, GameObject>` provides O(1) lookup and makes it straightforward to detect unknown IDs (returning a failure result) without iterating `FindObjectsOfType` or tagging GameObjects. The registry is populated on `PlaceObject` success and cleared on `RemoveObject`.

### `SceneSerializer` created as `new SceneSerializer()` in `Awake` (plain C# class)

`SceneSerializer` has no Unity lifecycle dependencies and was deliberately implemented as a plain C# class in Task 11. Instantiating it with `new SceneSerializer()` in `Awake` avoids the overhead of a `GameObject` host and keeps the dependency explicit and testable. If `SceneSerializer` ever needs Unity APIs it can be promoted to a MonoBehaviour and wired via the Inspector without changing `UIBridge`'s interface.

### `IBlockModelImporter` as optional MonoBehaviour reference (null-safe, returns failure until Task 13)

`BlockModelImporter` is not implemented until Task 13. Rather than blocking Task 12.1 on Task 13, `_blockModelImporter` is declared as an optional `[SerializeField]` reference. `LoadBlockModel` checks for null and returns `OperationResult{Success=false, Message="BlockModelImporter not available"}` when unset. This allows `UIBridge` to be fully wired and tested with all other nine methods while Task 13 is pending.

### `OnOperationComplete` raised in `finally`/`catch` to guarantee exactly-once delivery

The spec requires `OnOperationComplete` to fire exactly once per call for both success and failure paths. Placing the `OnOperationComplete?.Invoke(result)` call inside a `finally` block (wrapping the entire method body) ensures it fires even if an awaited subsystem call throws an unhandled exception. A separate `catch` block captures the exception, sets `result.Success = false` and populates `result.Message`, then lets `finally` raise the event. This pattern prevents silent failures where an exception swallows the event.

### `nameof(MethodName)` for `OperationName` (compile-time safe, no magic strings)

`OperationName` is used by the HTTP listener (Task 14) to route responses back to the correct caller. Using `nameof(LoadAsset)` instead of `"LoadAsset"` means a method rename produces a compile-time error rather than a runtime mismatch between the method name and the event payload. It also makes the codebase grep-friendly — searching for `LoadAsset` finds both the method definition and its event usage.

### `BuildSceneData()` helper for `SaveScene` (snapshot of current subsystem state)

`SaveScene` needs a complete `SceneData` snapshot before calling `ISceneSerializer.SaveAsync`. Rather than inlining the snapshot logic inside `SaveScene`, a private `BuildSceneData()` helper collects room dimensions from `IRoomController`, placed object transforms from `_objectRegistry`, surface materials from `ISurfaceManager`, and lighting parameters from `ILightingManager`. Isolating this logic makes `SaveScene` readable and makes `BuildSceneData` independently testable.

---

## Summary

`UIBridge` is a MonoBehaviour that wires all subsystems together and exposes a clean 10-method public API. All methods are `async void` with `OnOperationComplete` raised in a `finally` block, guaranteeing exactly-once event delivery. A `Dictionary<string, GameObject>` registry tracks placed objects by ID. `SceneSerializer` is instantiated directly as a plain C# class. `IBlockModelImporter` is optional and null-safe, returning a failure result until Task 13 is complete. `nameof()` is used throughout for compile-time-safe operation names.
