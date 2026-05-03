# Task: Implement LightingManager MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 8.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/LightingManager.cs`

---

## Task Prompt

Implement `LightingManager` MonoBehaviour with:
- `SetAmbientIntensity(float intensity)` — sets `RenderSettings.ambientIntensity` directly
- `AddPointLight(Vector3 position, float intensity, Color color)` — creates a child GameObject with a `Light` component (type `Point`), enforces a maximum of 4 point lights, returns `false` if the limit is already reached
- `RemovePointLight(int index)` — destroys the point light at the given index and removes it from the tracking list; silent no-op if the index is out of range
- Default ambient light configured in `Awake`

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `ILightingManager` in `Assets/RoomVisualizer/Scripts/Interfaces/` to confirm the required method signatures (`SetAmbientIntensity`, `AddPointLight`, `RemovePointLight`) and any events.

2. **Created `LightingManager.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, ILightingManager` inheritance.

3. **Defined the constant and tracking field** — `MaxPointLights = 4` as a named constant; `_pointLights` as a `List<GameObject>` to track created point light GameObjects.

4. **Implemented `Awake()`** — set `RenderSettings.ambientMode = AmbientMode.Flat` for uniform ambient lighting, then assigned a default `RenderSettings.ambientIntensity` of `1.0f` to establish a sensible starting state.

5. **Implemented `SetAmbientIntensity()`** — directly assigns the provided value to `RenderSettings.ambientIntensity`. No clamping is applied, matching the spec's intent to leave range enforcement to the caller.

6. **Implemented `AddPointLight()`** — checks `_pointLights.Count >= MaxPointLights` first and returns `false` immediately if the limit is reached. Otherwise, creates a new `GameObject` named `"PointLight_N"` (where N is the current count), parents it to the `LightingManager`'s own transform, adds a `Light` component, sets `light.type = LightType.Point`, assigns `position`, `intensity`, and `color`, appends the GameObject to `_pointLights`, and returns `true`.

7. **Implemented `RemovePointLight()`** — performs a bounds check (`index < 0 || index >= _pointLights.Count`) and returns silently if out of range. Otherwise, calls `Destroy(_pointLights[index])` and removes the entry from `_pointLights` at that index.

---

## Implementation Choices and Reasoning

### `RenderSettings.ambientMode = AmbientMode.Flat` for uniform ambient
Unity supports three ambient modes: `Skybox` (samples the skybox cubemap), `Trilight` (separate sky/equator/ground colors), and `Flat` (single uniform color). `Flat` mode is the only one where `RenderSettings.ambientIntensity` has a direct, predictable effect on a single ambient color. Using `Skybox` or `Trilight` would make `ambientIntensity` interact with additional color parameters, complicating the `SetAmbientIntensity` contract. `Flat` keeps the API surface simple and the behavior deterministic.

### `RenderSettings.ambientIntensity` direct assignment (no clamping)
The spec defines `SetAmbientIntensity` as a direct setter with no stated range constraint. Clamping silently would hide caller bugs (e.g., passing `2.5f` and getting `1.0f` back with no feedback). Leaving clamping to the caller — or to a future validation layer — keeps the method honest and consistent with how Unity itself exposes `RenderSettings.ambientIntensity`.

### Child GameObjects for point lights (parented to LightingManager)
Parenting each point light GameObject to the `LightingManager`'s transform keeps the scene hierarchy clean: all dynamic lights appear nested under a single manager node in the Editor's Hierarchy window. It also means that if the `LightingManager` GameObject is destroyed, all child point lights are automatically destroyed with it — no orphaned lights left in the scene.

### `List<GameObject>` for point light tracking (vs `Light[]` array)
A fixed-size `Light[]` array would require pre-allocating four slots and tracking which are occupied. A `List<GameObject>` grows and shrinks naturally with `Add` and `RemoveAt`, making the count check (`_pointLights.Count >= MaxPointLights`) and index-based removal straightforward without any slot-management bookkeeping. The `GameObject` reference (rather than `Light`) is stored because `Destroy` operates on GameObjects, and the `Light` component can always be retrieved via `GetComponent<Light>()` if needed.

### Max 4 point lights enforced at `AddPointLight` time (fail fast, return false)
The limit is checked before any allocation occurs. If the cap is already reached, the method returns `false` immediately without creating a GameObject or a Light component. This "fail fast" approach avoids partial state (e.g., a GameObject created but not added to the list) and gives the caller a clear boolean signal to act on — consistent with the `false`-on-failure convention used by `SurfaceManager.SetSurfaceTextureAsync`.

### Index-based `RemovePointLight` with bounds check (silent no-op on out-of-range)
An out-of-range index is treated as a no-op rather than an exception. This matches the defensive pattern used by `ObjectPlacer.RemoveObject` (null-safe, no throw) and keeps the caller's code simple — no try/catch needed for routine cases like removing a light that was already removed. The bounds check (`index < 0 || index >= Count`) covers both underflow and overflow.

---

## Summary

Task 8.1 is complete. `LightingManager` is a MonoBehaviour that fully implements `ILightingManager`: `Awake` configures flat ambient mode with a default intensity of `1.0f`. `SetAmbientIntensity` assigns directly to `RenderSettings.ambientIntensity`. `AddPointLight` enforces the four-light cap, creates a named child GameObject with a configured `Light` component, and returns a boolean result. `RemovePointLight` performs a bounds-safe destroy-and-remove. All point lights are parented to the manager for clean scene hierarchy management. Ready for Task 8.2 (property tests for point light management).
