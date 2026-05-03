# Implementation Plan: 3D Room Visualizer

## Overview

Implement the Unity (C#) game-engine mechanics for the 3D Room Visualizer in discrete, incremental steps. Each task builds on the previous, wiring subsystems together progressively. The UI_Bridge is implemented last so all subsystems can be tested independently first.

## Tasks

- [ ] 1. Project setup and core interfaces
  - Create the Unity 2022 LTS project folder structure under `Assets/RoomVisualizer/`
  - Add `com.unity.cloud.gltfast` (v6.x) via Package Manager
  - Add `Newtonsoft.Json` (Json.NET for Unity) via Package Manager
  - Add `FsCheck` v3.x and `FsCheck.NUnit` as `.dll` plugins under `Assets/Plugins/`
  - Create `Tests.EditMode` and `Tests.PlayMode` Unity Test Framework assemblies with their `.asmdef` files
  - Define all interfaces: `IRoomController`, `IAssetLoader`, `IObjectPlacer`, `ICameraController`, `ISurfaceManager`, `ILightingManager`, `ISceneSerializer`, `ICollisionSystem`, `IBlockModelImporter`
  - Define all data models: `SceneData`, `RoomDimensionsData`, `PlacedObjectData`, `MaterialData`, `LightingData`, `PointLightData`, `SerializableVector3`, `SerializableColor`, `PlacementResult`, `LoadResult`, `OperationResult`, `ImportResult`, `BlockModelData`, `BlockEntry`, `BlockRoomDimensions`, `BlockVector3`, `BlockRotation`
  - Define enums: `SurfaceId`, `PlacementResult`
  - Create `AssetLibraryConfig` ScriptableObject with a serialised `Dictionary<string, string>` mapping AI Pipeline category IDs (e.g. `"power_outlet"`) to local glTF/GLB asset paths
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 10.1, 11.1_

- [ ] 2. Implement RoomController
  - [ ] 2.1 Implement `RoomController` MonoBehaviour
    - Implement `SetDimensions(width, depth, height)` with [1, 50] metre validation; return `false` and raise `OnValidationError` on rejection
    - Implement `GetRoomBounds()` returning an axis-aligned `Bounds` matching current dimensions
    - Implement `GetSurface(SurfaceId)` returning the corresponding child `GameObject`
    - Create the six surface child GameObjects (WallNorth, WallSouth, WallEast, WallWest, Floor, Ceiling) and update their transforms when dimensions change
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.2 Write property test for room dimension validation
    - **Property 1: Room dimension validation rejects all out-of-range values**
    - **Validates: Requirements 1.3**
    - Use `Arb.From<float>().Filter(f => f < 1f || f > 50f)` to generate out-of-range values
    - Assert `SetDimensions` returns `false` and dimensions remain unchanged

  - [ ]* 2.3 Write unit tests for RoomController
    - Test default room creation produces six distinct surface GameObjects
    - Test valid dimension update changes `GetRoomBounds()` extents within one frame
    - Test `OnValidationError` event fires with a non-null message on rejection

- [ ] 3. Implement CollisionSystem
  - [ ] 3.1 Implement `CollisionSystem` MonoBehaviour
    - Implement `WouldCollide(objectBounds, proposedPosition)` using `Physics.OverlapBox`
    - Implement `IsWithinRoomBounds(objectBounds, position)` comparing against `IRoomController.GetRoomBounds()`
    - Inject `IRoomController` dependency via constructor/inspector reference
    - _Requirements: 3.7, 3.8_

  - [ ]* 3.2 Write property test for collision prevention
    - **Property 7: Collision system prevents overlapping placement**
    - **Validates: Requirements 3.7, 3.8**
    - Use `FakeCollisionSystem` returning configurable results; verify `PlacementResult.Blocked` and count unchanged

  - [ ]* 3.3 Write unit tests for CollisionSystem
    - Test `IsWithinRoomBounds` returns `false` for bounds outside room extents
    - Test `WouldCollide` returns `false` for an empty scene

- [ ] 4. Implement ObjectPlacer
  - [ ] 4.1 Implement `ObjectPlacer` MonoBehaviour
    - Implement `BeginPlacement(prefab)` attaching the prefab to cursor with a preview material
    - Implement `ConfirmPlacement(cursorWorldPos)` calling `CollisionSystem.WouldCollide`; return `PlacementResult.Blocked` on collision, set `IsColliding` flag
    - Implement `SelectObject(obj)` highlighting the object and showing transform handles
    - Implement `MoveObject(obj, delta)` constraining movement to the XZ plane
    - Implement `RotateObject(obj, steps)` applying `steps * 15f` degrees around Y axis
    - Implement `RemoveObject(obj)` destroying the GameObject and removing it from `PlacedObjects`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 4.2 Write property test for floor-plane placement
    - **Property 3: Placed object base rests on the floor or surface beneath**
    - **Validates: Requirements 3.2**
    - Generate random valid (x, z) positions within room bounds; assert base Y equals floor/surface Y

  - [ ]* 4.3 Write property test for drag preserving Y coordinate
    - **Property 4: Drag preserves floor-plane Y coordinate**
    - **Validates: Requirements 3.4**
    - Generate random placed objects and (dx, dz) deltas; assert Y position unchanged after `MoveObject`

  - [ ]* 4.4 Write property test for rotation multiples of 15 degrees
    - **Property 5: Rotation produces multiples of 15 degrees**
    - **Validates: Requirements 3.5**
    - Use `RotationStepsArb` to generate positive integers; assert `eulerAngles.y % 15 == 0` after `RotateObject`

  - [ ]* 4.5 Write property test for remove decreasing count by one
    - **Property 6: Removing an object decreases the placed object count by exactly one**
    - **Validates: Requirements 3.6**
    - Assert `PlacedObjects.Count` decreases by exactly 1 and removed object absent from list

  - [ ]* 4.6 Write unit tests for ObjectPlacer
    - Test placement preview attaches to cursor
    - Test `PlacementResult.Blocked` when `CollisionSystem` returns collision
    - Test `RemoveObject` on an empty list does not throw

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement CameraController
  - [ ] 6.1 Implement `CameraController` MonoBehaviour
    - Implement `Translate(input)` moving camera on XZ plane, clamped to room bounding volume
    - Implement `Orbit(mouseDelta)` rotating camera around room centre, clamped to room bounding volume
    - Implement `Zoom(scrollDelta)` clamping `DistanceFromCenter` to [1, 20] metres
    - Implement `ToggleTopDownView()` switching between `Perspective` and `Orthographic` projection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 6.2 Write property test for camera translation staying on horizontal plane
    - **Property 8: Camera translation stays on the horizontal plane**
    - **Validates: Requirements 4.1**
    - Generate random WASD input vectors; assert Y position unchanged after `Translate`

  - [ ]* 6.3 Write property test for orbit preserving distance from centre
    - **Property 9: Orbit preserves distance from room centre**
    - **Validates: Requirements 4.2**
    - Generate random mouse drag deltas; assert distance from room centre unchanged (within floating-point tolerance)

  - [ ]* 6.4 Write property test for zoom clamping
    - **Property 10: Zoom clamps distance to [1, 20] metres**
    - **Validates: Requirements 4.3**
    - Generate extreme positive and negative scroll deltas; assert `DistanceFromCenter` always in [1.0, 20.0]

  - [ ]* 6.5 Write property test for camera position within room bounds
    - **Property 11: Camera position is always within room bounding volume**
    - **Validates: Requirements 4.5**
    - Generate random sequences of translate and orbit operations; assert camera world position within room bounds

  - [ ]* 6.6 Write PlayMode integration tests for CameraController
    - Test orbit and zoom in a live scene
    - Test `ToggleTopDownView` switches projection type

- [ ] 7. Implement SurfaceManager
  - [ ] 7.1 Implement `SurfaceManager` MonoBehaviour
    - Implement `SetSurfaceColor(surfaceId, color)` applying color to the surface's `Material` instance within one frame
    - Implement `SetSurfaceTextureAsync(surfaceId, filePath)` loading PNG/JPG, checking file size ≤ 10 MB, applying texture tiling via `material.mainTextureScale`; return `false` and raise `OnValidationError` for oversized files
    - Implement `GetSurfaceMaterial(surfaceId)` returning the surface's `Material` instance
    - Ensure each `SurfaceId` maps to a distinct `Material` instance
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.2 Write property test for surface material independence
    - **Property 12: Surface materials are independently assignable**
    - **Validates: Requirements 5.1, 5.4**
    - Use `ColorArb` to assign distinct colors to all six surfaces; assert each surface's material color equals its assigned color and is unaffected by others

  - [ ]* 7.3 Write property test for texture size validation
    - **Property 13: Texture size validation rejects files exceeding 10 MB**
    - **Validates: Requirements 5.3**
    - Generate file sizes > 10 MB; assert `SetSurfaceTextureAsync` returns `false`, raises validation error, and leaves material unchanged

  - [ ]* 7.4 Write unit tests for SurfaceManager
    - Test `SetSurfaceColor` updates material color within one frame
    - Test `SetSurfaceTextureAsync` with a valid PNG applies texture tiling
    - Test missing-texture fallback does not throw

- [ ] 8. Implement LightingManager
  - [ ] 8.1 Implement `LightingManager` MonoBehaviour
    - Implement `SetAmbientIntensity(intensity)` setting `RenderSettings.ambientIntensity` directly
    - Implement `AddPointLight(position, color, intensity)` creating a `Light` component; return `false` if `PointLightCount >= 4`
    - Implement `RemovePointLight(index)` destroying the light at the given index
    - Provide a default ambient light active on room creation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 8.2 Write property test for ambient intensity update
    - **Property 14: Ambient intensity update is reflected immediately**
    - **Validates: Requirements 6.2**
    - Generate float values in [0.0, 1.0]; assert `RenderSettings.ambientIntensity` equals provided value after `SetAmbientIntensity`

  - [ ]* 8.3 Write property test for point light property preservation
    - **Property 15: Point light properties are preserved on creation**
    - **Validates: Requirements 6.3**
    - Use `Vector3Arb` and `ColorArb`; assert created `Light` component's `color`, `intensity`, and `transform.position` equal provided values

  - [ ]* 8.4 Write unit tests for LightingManager
    - Test default ambient light is active on room creation
    - Test `AddPointLight` returns `false` when attempting to add a 5th light
    - Test `RemovePointLight` decreases `PointLightCount` by one

- [ ] 9. Implement AssetLoader
  - [ ] 9.1 Implement `AssetLoader` MonoBehaviour
    - Wrap `com.unity.cloud.gltfast`'s `GltfImport` using async/await
    - Validate file extension (`.gltf` or `.glb`) before attempting load; return `LoadResult{Success=false}` for invalid extensions
    - Enforce 5-second timeout via `CancellationToken`
    - Handle missing external textures by substituting a default material and setting `HasMissingTextures=true`
    - Raise `OnLoadComplete` event with the `LoadResult` on completion or failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 9.2 Write property test for invalid asset load leaving scene unchanged
    - **Property 2: Invalid asset load leaves scene unchanged**
    - **Validates: Requirements 2.3**
    - Use `FakeAssetLoader`; generate invalid file paths; assert no new GameObjects added and `LoadResult.Success` is `false`

  - [ ]* 9.3 Write unit tests for AssetLoader
    - Test valid glTF file loads successfully and `InstantiatedObject` is non-null
    - Test invalid extension returns `LoadResult{Success=false}` without throwing
    - Test missing-texture fallback sets `HasMissingTextures=true` and loads mesh

  - [ ]* 9.4 Write PlayMode integration test for AssetLoader
    - Load a real glTF/GLB test asset and verify it appears in the scene
    - Load a PNG texture and verify it is applied to a surface

- [ ] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement SceneSerializer
  - [ ] 11.1 Implement `SceneSerializer` class
    - Implement `SaveAsync(filePath, sceneData)` serialising `SceneData` to JSON via `Newtonsoft.Json`; return `false` on I/O or serialisation error
    - Implement `LoadAsync(filePath)` deserialising JSON to `SceneData`; populate `MissingAssetWarning` list for any referenced glTF/GLB files not found on disk
    - Ensure `SceneData` uses only plain C# types (`SerializableVector3`, `SerializableColor`) for JSON round-trip fidelity
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 11.2 Write property test for scene save/load round-trip
    - **Property 16: Scene save/load round-trip preserves all state**
    - **Validates: Requirements 7.1, 7.2, 7.4**
    - Use `SceneDataArb` to generate random valid `SceneData`; assert loaded data equals saved data for all fields (dimensions, positions, rotations, surface colors, lighting)

  - [ ]* 11.3 Write unit tests for SceneSerializer
    - Test `LoadAsync` with a missing asset reference populates `MissingAssetWarning` and loads remaining scene
    - Test `LoadAsync` with a corrupt JSON file returns a failure result with a descriptive error message
    - Test `SaveAsync` completes within 3 seconds for a scene with 50 objects

  - [ ]* 11.4 Write PlayMode integration test for SceneSerializer
    - Full save → load cycle with a real JSON file on disk; verify scene state matches

- [ ] 12. Implement UIBridge and wire all subsystems
  - [ ] 12.1 Implement `UIBridge` MonoBehaviour
    - Expose all ten public methods: `LoadAsset`, `PlaceObject`, `MoveObject`, `RotateObject`, `RemoveObject`, `SetSurfaceMaterial`, `SetLightingParameter`, `SaveScene`, `LoadScene`, `LoadBlockModel`
    - Inject all subsystem dependencies (`IRoomController`, `IAssetLoader`, `IObjectPlacer`, `ICameraController`, `ISurfaceManager`, `ILightingManager`, `ISceneSerializer`, `IBlockModelImporter`)
    - Raise `OnOperationComplete` event exactly once per method call with a non-null `OperationResult` carrying a non-null `OperationName`, for both success and failure paths
    - All async operations complete via the event; public methods are non-blocking
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 12.2 Write property test for UIBridge always raising a status event
    - **Property 17: UI_Bridge operations always raise a status event**
    - **Validates: Requirements 8.2**
    - For each of the ten public methods, call with both valid and invalid parameters; assert `OnOperationComplete` fires exactly once with non-null `OperationResult` and non-null `OperationName`

  - [ ]* 12.3 Write unit tests for UIBridge
    - Test stub compiles and all ten methods are invocable without throwing
    - Test `OnOperationComplete` carries `Success=false` and a non-null message when a subsystem returns an error

  - [ ] 12.4 Wire all subsystems in a Unity scene
    - Create a root `RoomVisualizerBootstrapper` MonoBehaviour that instantiates and injects all subsystem dependencies into `UIBridge`
    - Verify the scene compiles and runs with stub implementations of all subsystems
    - _Requirements: 8.3_

- [ ] 13. Implement BlockModelImporter
  - [ ] 13.1 Implement `BlockModelImporter` MonoBehaviour
    - Deserialise incoming JSON string to `BlockModelData` using `Newtonsoft.Json`; return `ImportResult{Success=false}` on parse or schema error
    - Call `IRoomController.SetDimensions` from `blockModel.room_dimensions` (width, depth, height in metres)
    - For each block, look up `block.category` in `AssetLibraryConfig`; if found, call `IAssetLoader.LoadGltfAsync` with the mapped path; if not found, instantiate a default box primitive scaled to `block.dimensions` and add a warning to `ImportResult.Warnings`
    - Call `IObjectPlacer.ConfirmPlacement` with the resolved asset at `block.position`
    - If `block.low_confidence` is `true`, add a `LowConfidenceTag` component to the instantiated `GameObject` so the renderer applies a translucent overlay
    - Return `ImportResult` with counts of imported and failed blocks
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 13.2 Write property test for BlockModel import preserving block count and positions
    - **Property 18: BlockModel import round-trip preserves block count and positions**
    - **Validates: Requirements 10.1, 10.4**
    - Generate random valid `BlockModelData` with N blocks; assert `ImportResult.BlocksImported == N` and each placed Object's world position equals the corresponding block's `position` (within floating-point tolerance)

  - [ ]* 13.3 Write unit tests for BlockModelImporter
    - Test invalid JSON returns `ImportResult{Success=false}` without throwing
    - Test unknown category uses default primitive and adds a warning
    - Test `low_confidence=true` block gets `LowConfidenceTag` component
    - Test `room_dimensions` outside [1, 50] range are clamped and a warning is logged

- [ ] 14. Implement HttpListenerService
  - [ ] 14.1 Implement `HttpListenerService` MonoBehaviour
    - Start `System.Net.HttpListener` on `localhost:8322` in `Awake()` on a background thread
    - Implement a `ConcurrentQueue<Action>` drained in `Update()` to marshal Unity API calls to the main thread
    - Route `GET /health` → return `{"status":"ok","version":"1.0"}` immediately (no main-thread dispatch needed)
    - Route all `POST` endpoints to the corresponding `UIBridge` method per the routing table in the design
    - Await `OnOperationComplete` event from `UIBridge` and return the `OperationResult` as the HTTP response body (JSON)
    - Return HTTP 400 with `OperationResult{Success=false}` for malformed JSON request bodies
    - If port 8322 is already bound at startup, log an error and disable the component without crashing
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 14.2 Write property test for HTTP listener returning OperationResult for every request
    - **Property 19: HTTP listener returns OperationResult for every request**
    - **Validates: Requirements 11.3, 11.4**
    - For each valid endpoint, send requests with both valid and invalid bodies; assert response is valid JSON deserializable to `OperationResult` with non-null `OperationName`

  - [ ]* 14.3 Write unit tests for HttpListenerService
    - Test `GET /health` returns `{"status":"ok","version":"1.0"}` without requiring UIBridge
    - Test malformed JSON body returns HTTP 400 with `Success=false`
    - Test port-in-use scenario disables the component without throwing

  - [ ]* 14.4 Write PlayMode integration test for HttpListenerService
    - Start the listener in a live scene; send `POST /load-block-model` with a sample `BlockModel` JSON; verify blocks appear in the scene and response is `Success=true`

- [ ] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 5, 10, and 15 ensure incremental validation
- Property tests use FsCheck v3.x with `[FsCheck.NUnit.Property(MaxTest = 100)]` and reference design property numbers in comments
- Unit tests cover specific examples and edge cases not covered by property tests
- PlayMode integration tests require a live Unity scene and are run separately from EditMode tests
- `FakeCollisionSystem`, `FakeAssetLoader`, and `FakeSceneSerializer` fakes keep EditMode tests fast and deterministic

### Team Integration Notes

- The `BlockModelImporter` (task 13) consumes the exact JSON schema produced by Member 3's AI Pipeline `POST /detect` response — no transformation needed on the Python side
- The `HttpListenerService` (task 14) runs on `localhost:8322`; Member 2's Desktop Visualization Engine should call this instead of (or in addition to) its own OpenGL viewport for 3D rendering
- The `AssetLibraryConfig` ScriptableObject is the single place to map AI Pipeline category IDs to local glTF assets — update it as Member 3 finalises the category list in `plugins/core/categories.json`
- The `LowConfidenceTag` component mirrors Member 2's low-confidence visual distinction (Requirement 8.4 in `requirements-member2-desktop.md`) — both apps should show the same visual treatment for blocks with `confidence_score < 0.5`
- Port assignments: AI Pipeline = `localhost:8321`, Unity Visualizer HTTP = `localhost:8322`
