# Task 12.4 — Wire All Subsystems in a Unity Scene

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 12.4  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/RoomVisualizerBootstrapper.cs`

---

## Task Prompt

Create `RoomVisualizerBootstrapper` MonoBehaviour that programmatically creates all subsystem GameObjects and wires them into `UIBridge` via `UIBridge.SetSubsystems()`.

---

## Step-by-Step Process

1. **Reviewed all subsystem MonoBehaviours** — read `RoomController`, `CollisionSystem`, `ObjectPlacer`, `CameraController`, `SurfaceManager`, `LightingManager`, `AssetLoader`, `SceneSerializer`, and `UIBridge` to confirm which are MonoBehaviours (requiring a `GameObject` host) and which are plain C# classes (instantiated with `new`).

2. **Reviewed `UIBridge`** — confirmed that `UIBridge` already holds `[SerializeField]` references for all subsystem interfaces. Added a `SetSubsystems()` public method to `UIBridge` to allow programmatic injection from the bootstrapper, avoiding reflection.

3. **Designed the `ResolveOrCreate<T>` generic helper** — implemented a private helper that checks whether the bootstrapper's inspector field for a given subsystem is already assigned; if so, it uses that instance; if not, it creates a new child `GameObject` named after the type and adds the component. This respects optional inspector overrides while guaranteeing all subsystems exist at runtime.

4. **Created the root container GameObject** — in `Awake`, the bootstrapper creates a `GameObject` named `"RoomVisualizer"` as the scene hierarchy root, then parents all subsystem GameObjects under it for a clean, inspectable hierarchy.

5. **Resolved each subsystem in dependency order** — `RoomController` first (no dependencies), then `CollisionSystem` (depends on `IRoomController`), then `ObjectPlacer` (depends on `ICollisionSystem`), then `CameraController`, `SurfaceManager`, `LightingManager`, and `AssetLoader` independently, and finally `UIBridge` last (depends on all others).

6. **Added a `Camera` component to `CameraController`'s GameObject** — `CameraController` requires a `Camera` component on the same `GameObject` to call `camera.orthographic` and related Unity APIs. The bootstrapper adds `Camera` alongside `CameraController` when creating that child object.

7. **Called `UIBridge.SetSubsystems()`** — after all subsystems are resolved, the bootstrapper calls `uiBridge.SetSubsystems(roomController, assetLoader, objectPlacer, cameraController, surfaceManager, lightingManager, sceneSerializer, blockModelImporter)` to complete the wiring in a single explicit call.

8. **Verified the scene compiles and runs** — opened the Unity project, attached `RoomVisualizerBootstrapper` to a `GameObject` in the scene, entered Play mode, and confirmed no compile errors or null-reference exceptions in the Console.

---

## Implementation Choices & Reasoning

### Programmatic scene setup (vs Unity scene file)

Wiring subsystems in code rather than in a `.unity` scene file means the bootstrapper works at runtime without any prior editor setup. A new developer cloning the repository can enter Play mode immediately — no manual drag-and-drop wiring in the Inspector is required. It also makes the dependency graph explicit and version-controllable in C# rather than buried in a binary scene asset.

### `ResolveOrCreate<T>` generic helper — respects optional inspector overrides, creates if null

The helper follows a "use what's there, create what's missing" policy. If a developer has already dragged a pre-configured subsystem into the bootstrapper's Inspector slot, that instance is used as-is. If the slot is empty, a new child `GameObject` is created and the component is added. This makes the bootstrapper non-destructive: it never replaces an intentionally assigned reference, which is important for scenes that customise subsystem configuration via the Inspector.

### `UIBridge.SetSubsystems()` public method — avoids reflection for dependency injection

A dedicated `SetSubsystems()` method on `UIBridge` is the simplest, most transparent injection mechanism available in Unity C#. Alternatives considered: (1) reflection to set private fields — fragile, breaks on rename, not AOT-safe; (2) a service locator / static registry — introduces global mutable state; (3) constructor injection — not available for MonoBehaviours. `SetSubsystems()` is explicit, compile-time safe, and easy to read in both the bootstrapper and `UIBridge`.

### Camera component added to CameraController's GameObject (required by CameraController)

`CameraController` calls Unity's `Camera` component APIs (`camera.orthographic`, `camera.fieldOfView`, etc.) on its own `GameObject`. Unity does not add a `Camera` automatically when `AddComponent<CameraController>()` is called, so the bootstrapper explicitly calls `AddComponent<Camera>()` on the same child object. This is done in the bootstrapper rather than inside `CameraController.Awake` to keep `CameraController` focused on camera logic and to make the hardware dependency visible at the wiring layer.

### `FindObjectOfType` fallbacks in subsystems handle wiring automatically

Several subsystems (e.g., `CollisionSystem` looking up `IRoomController`) use `FindObjectOfType` in their `Awake` or `Start` if their inspector reference is null. Because the bootstrapper creates all GameObjects in a single `Awake` call before any subsystem `Start` runs, these fallbacks resolve correctly without the bootstrapper needing to manually set every cross-subsystem reference. This keeps the bootstrapper's wiring surface minimal — it only needs to call `UIBridge.SetSubsystems()`.

### Root "RoomVisualizer" container GameObject for clean hierarchy

All subsystem GameObjects are parented under a single `"RoomVisualizer"` root. This keeps the scene hierarchy readable in the Unity Editor (one top-level entry instead of seven floating GameObjects), makes it straightforward to destroy or disable the entire visualizer at once, and avoids polluting the root of the scene with implementation-detail objects.

---

## Summary

`RoomVisualizerBootstrapper` is a single MonoBehaviour that programmatically creates all subsystem GameObjects under a `"RoomVisualizer"` root, adds required Unity components (e.g., `Camera` on `CameraController`'s object), and wires everything into `UIBridge` via `UIBridge.SetSubsystems()`. A `ResolveOrCreate<T>` helper respects any inspector-assigned overrides while guaranteeing all subsystems exist at runtime. The scene compiles and runs with no editor setup required.
