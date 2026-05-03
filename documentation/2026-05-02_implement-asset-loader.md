# Task 9.1 — Implement AssetLoader MonoBehaviour

## Task Prompt

Implement `AssetLoader` MonoBehaviour wrapping GLTFast's `GltfImport` with async/await, extension validation (`.gltf`/`.glb`), 5-second `CancellationToken` timeout, missing texture detection, and `OnLoadComplete` event.

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `IAssetLoader` in `Assets/RoomVisualizer/Interfaces/` to confirm the expected method signature (`LoadGltfAsync(string filePath)`), the `LoadResult` data model, and the `OnLoadComplete` event signature.

2. **Scaffolded the MonoBehaviour** — created `Assets/RoomVisualizer/Runtime/AssetLoader.cs` implementing `IAssetLoader`, with `[RequireComponent]` guards and a `[SerializeField]` reference to the scene root transform.

3. **Added extension validation** — before any I/O, the method checks `Path.GetExtension(filePath).ToLowerInvariant()` against `{".gltf", ".glb"}`. An invalid extension returns immediately with `LoadResult{Success=false, Error="Unsupported file extension"}` and raises `OnLoadComplete`.

4. **Wired up GltfImport** — instantiated `GltfImport` and called `gltf.Load(new Uri(filePath))` inside a `try/catch`. The `Uri` constructor handles both absolute paths (`file:///...`) and relative paths transparently.

5. **Added CancellationToken timeout** — created a `CancellationTokenSource(TimeSpan.FromSeconds(5))` and passed its token to `gltf.Load(...)`. Caught `OperationCanceledException` to distinguish timeout from other failures.

6. **Instantiated the scene hierarchy** — on a successful load, called `gltf.InstantiateMainSceneAsync(sceneRoot)` where `sceneRoot` is a new child `GameObject` named after the file (without extension), parented to the `AssetLoader` transform.

7. **Detected missing textures** — after instantiation, iterated `gltf.MaterialCount` and checked `gltf.GetMaterial(i) == null`. If any material slot is null, set `HasMissingTextures = true` on the result.

8. **Raised OnLoadComplete on every path** — ensured the event fires in the `finally` block (or at each early-return point) so callers are never left waiting regardless of outcome.

9. **Verified compilation** — confirmed no CS errors in the Unity Editor console and that the assembly definition (`RoomVisualizer.Runtime.asmdef`) correctly references `com.unity.cloud.gltfast`.

---

## Implementation Choices & Reasoning

### `new Uri(filePath)` for `GltfImport.Load`

GLTFast's `Load` overload accepts a `Uri` rather than a raw string. Using `new Uri(filePath)` handles both absolute paths (e.g. `C:\assets\chair.glb` → `file:///C:/assets/chair.glb`) and relative paths without manual string manipulation. A raw string would require the caller to pre-format the path correctly, which is error-prone across platforms.

### `CancellationTokenSource(TimeSpan.FromSeconds(5))` for timeout

Passing a `TimeSpan` directly to the `CancellationTokenSource` constructor is the idiomatic .NET approach — the runtime manages the timer internally. The alternative (a manual `Task.Delay` + `CancellationTokenSource.Cancel()`) requires more boilerplate and introduces a second async chain that must be disposed carefully. The constructor overload is simpler, self-documenting, and less likely to leak resources.

### `OperationCanceledException` catch for timeout detection

When the `CancellationToken` fires, `GltfImport.Load` throws `OperationCanceledException`. Catching this type specifically (rather than the base `Exception`) lets the code set a distinct `Error = "Load timed out after 5 seconds"` message on the `LoadResult`, which is more actionable for callers than a generic failure message.

### `gltf.MaterialCount` + `gltf.GetMaterial(i) == null` for missing texture detection

GLTFast does not surface a dedicated "missing texture" flag. The reliable signal is a null material slot: when an external texture file cannot be resolved, GLTFast leaves that material index null rather than substituting a placeholder. Iterating all `MaterialCount` slots and checking for null is the documented pattern for this detection. A default material is then applied to the instantiated mesh renderers so the scene remains visually coherent.

### Child GameObject for scene root (named after file, parented to AssetLoader)

Parenting the loaded scene under a dedicated child `GameObject` (rather than the `AssetLoader` itself or the scene root) keeps the hierarchy clean and makes it trivial to destroy or replace a loaded asset without affecting the `AssetLoader` component or other scene objects. Naming the child after the file (sans extension) aids debugging in the Hierarchy window.

### `OnLoadComplete` raised on every code path

The event is the only feedback mechanism for async callers (e.g. `UIBridge`). If the event were silently skipped on any failure path, the caller would hang indefinitely waiting for a response. Raising on every path — including early extension-validation returns and timeout catches — is a correctness requirement, not just a convenience.

### Extension check before any I/O (fail fast)

Validating the extension synchronously before creating a `GltfImport` instance or touching the file system avoids unnecessary allocations and I/O overhead for obviously invalid inputs. It also produces a clearer error message than whatever GLTFast would return for an unsupported format.

---

## Summary

`AssetLoader` is a thin async wrapper around GLTFast's `GltfImport`. It validates the file extension up front, enforces a 5-second load timeout via `CancellationTokenSource`, detects missing external textures by inspecting null material slots, and always raises `OnLoadComplete` with a populated `LoadResult` — whether the load succeeded, timed out, or failed for any other reason. The loaded scene is parented under a named child `GameObject` for clean hierarchy management.
