# Task 11.1 — Implement SceneSerializer

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 11.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/SceneSerializer.cs`

---

## Task Prompt

Implement `SceneSerializer` (plain C# class, not MonoBehaviour) with `SaveAsync` (Newtonsoft.Json serialization, async file write) and `LoadAsync` (async file read, deserialization, missing asset detection).

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `ISceneSerializer` in `Assets/RoomVisualizer/Scripts/Interfaces/` to confirm the expected method signatures (`SaveAsync(string filePath, SceneData data)` and `LoadAsync(string filePath)`), the `SceneData` data model, and the `LoadSceneResult`/`MissingAssetWarning` types.

2. **Confirmed data model types** — checked `SceneData`, `PlacedObjectData`, `MaterialData`, `RoomDimensionsData`, `LightingData`, `PointLightData`, `SerializableVector3`, and `SerializableColor` in `Scripts/Models/DataModels.cs` to understand the full object graph that needs to round-trip through JSON.

3. **Scaffolded the plain C# class** — created `SceneSerializer.cs` implementing `ISceneSerializer` as a plain C# class (no `MonoBehaviour` inheritance), with a default constructor and no Unity lifecycle methods.

4. **Implemented `SaveAsync`** — serialized `SceneData` to a JSON string via `JsonConvert.SerializeObject(data, Formatting.Indented)`, then wrote the string to disk using `await Task.Run(() => File.WriteAllText(filePath, json))` to keep the write off the main thread. Wrapped the entire body in a `try/catch` returning `false` with a logged error on any failure.

5. **Implemented `LoadAsync`** — checked file existence first (early return on missing file), read the file off the main thread via `await Task.Run(() => File.ReadAllText(filePath))`, then deserialized with `JsonConvert.DeserializeObject<SceneData>(json)`. Caught `JsonException` separately from `Exception` to produce a descriptive parse-error message.

6. **Added missing asset detection** — after successful deserialization, iterated `sceneData.Objects` and called `File.Exists(obj.AssetPath)` for each entry. Any path not found on disk is appended to the `MissingAssets` list. The load still succeeds; missing assets are non-blocking warnings.

7. **Verified `SerializableVector3` and `SerializableColor`** — confirmed both are plain C# structs with public fields, ensuring Newtonsoft.Json can serialize and deserialize them without custom converters.

---

## Implementation Choices & Reasoning

### Plain C# class (not MonoBehaviour)

`SceneSerializer` has no Unity lifecycle needs — it does not need `Awake`, `Start`, `Update`, or access to the scene graph. Making it a plain C# class keeps it lightweight, easily unit-testable without a running Unity scene, and instantiable directly (`new SceneSerializer()`) rather than requiring a `GameObject` host.

### `Newtonsoft.Json` for serialization (vs Unity's `JsonUtility`)

Unity's built-in `JsonUtility` cannot serialize `Dictionary<string, MaterialData>`, nested class hierarchies with null values, or collections of interface types. `Newtonsoft.Json` handles all of these transparently. Since `SceneData` contains `Dictionary<string, MaterialData>` for surface materials and nested `LightingData`/`PointLightData` objects, `JsonUtility` would silently drop fields or throw at runtime. `Newtonsoft.Json` was already a project dependency (added in Task 1), so there is no new package cost.

### `await Task.Run(() => File.WriteAllText / File.ReadAllText)` for async I/O

Unity's main thread must not be blocked by file I/O, especially for scenes with many placed objects where the JSON payload can be large. `Task.Run` offloads the synchronous file calls to the .NET thread pool, keeping the main thread responsive.

### `JsonException` caught separately from `Exception`

A `JsonException` means the file was read successfully but its content is not valid JSON (corrupt file, truncated write, manual edit error). Catching it separately allows the error message to say "JSON parse error: \<detail\>" rather than a generic "Unexpected error". This distinction is actionable for the user.

### `File.Exists(obj.AssetPath)` for missing asset detection

After deserialization, each `PlacedObjectData.AssetPath` is checked with `File.Exists`. This is a synchronous, non-blocking stat call that does not attempt to load the asset. Missing assets are recorded in `MissingAssets` and the load result is still marked successful — the scene can be opened and inspected even if some assets are unavailable.

### `SerializableVector3` and `SerializableColor` (plain C# structs)

Unity's `Vector3` and `Color` types are not reliably round-tripped by Newtonsoft.Json. `SerializableVector3` (`X`, `Y`, `Z` floats) and `SerializableColor` (`R`, `G`, `B`, `A` floats) are plain C# structs with only public fields, guaranteeing that Newtonsoft.Json serializes and deserializes them identically with no custom converters needed.

---

## Summary

`SceneSerializer` is a plain C# class implementing `ISceneSerializer` using `Newtonsoft.Json` for full-fidelity serialization of `SceneData`. File I/O is offloaded to the thread pool via `Task.Run`. `JsonException` is caught separately for descriptive parse error messages. Missing asset paths are detected post-deserialization via `File.Exists` and recorded as non-blocking warnings. `SerializableVector3` and `SerializableColor` structs ensure JSON round-trip fidelity without custom converters.
