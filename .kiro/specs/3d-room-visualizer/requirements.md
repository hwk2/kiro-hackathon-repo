# Requirements Document

## Introduction

The 3D Room Visualizer is a Unity (C#) desktop application that allows DIY users to design and furnish a virtual room in real time. Users can build a room layout, place and manipulate 3D furniture and object models, adjust surfaces and lighting, and import scanned real-world objects supplied by a companion AI Vision tool (Teammate 1) as glTF/GLB assets. A separate UI layer (Teammate 2) surfaces controls and menus; this document focuses on the game-engine mechanics owned by the game developer.

The system is built by a three-person team sharing a single repository with an 8-hour sprint window. Scope is intentionally constrained to what is achievable in that window.

---

## Glossary

- **Visualizer**: The Unity desktop application described in this document.
- **Room**: The bounded 3D environment rendered inside the Visualizer in which objects are placed.
- **Object**: Any 3D mesh asset (furniture, decoration, fixture) placed inside the Room.
- **Scanned_Object**: A glTF/GLB asset produced by the AI Vision tool and imported into the Visualizer at runtime.
- **Asset_Loader**: The Visualizer subsystem responsible for loading glTF/GLB files from disk at runtime.
- **Object_Placer**: The Visualizer subsystem responsible for placing, moving, rotating, and removing Objects in the Room.
- **Camera_Controller**: The Visualizer subsystem responsible for navigating the 3D scene.
- **Surface_Manager**: The Visualizer subsystem responsible for applying materials (colors/textures) to walls, floor, and ceiling.
- **Lighting_Manager**: The Visualizer subsystem responsible for managing light sources in the Room.
- **Scene_Serializer**: The Visualizer subsystem responsible for saving and loading Room layouts to/from disk.
- **Collision_System**: The Visualizer subsystem that detects and resolves overlaps between placed Objects and Room boundaries.
- **UI_Bridge**: The interface layer through which the Desktop Visualization Engine (Member 2) and any UI communicates with game-engine subsystems.
- **BlockModel**: The JSON data structure produced by the AI Pipeline (`POST /detect`) representing a room as a list of detected object blocks with 3D positions, dimensions, and confidence scores. Defined in the Room Vision AI shared design.
- **BlockModel_Importer**: The Visualizer subsystem responsible for translating an incoming `BlockModel` JSON into a populated Unity scene.
- **HTTP_Listener**: The local HTTP server (port `localhost:8322`) embedded in the Visualizer that exposes `UIBridge` operations as REST endpoints for the Desktop Visualization Engine.
- **Desktop_Visualization_Engine**: The Python/PySide6 desktop application (Member 2) that handles Bluetooth reception, AI Pipeline communication, prompt UI, and response comparison. It drives the Visualizer via the HTTP_Listener.
- **AI_Pipeline**: The Python FastAPI service (Member 3) running on `localhost:8321` that performs object detection and generates `BlockModel` JSON and `ResponseOption` entries.
- **Wall_Visibility_Manager**: The Visualizer subsystem responsible for fading or restoring the transparency of front-facing walls based on the current camera yaw step.
- **Placement_Grid_Manager**: The Visualizer subsystem responsible for maintaining per-surface placement grids, converting between grid coordinates and world-space positions, and tracking cell occupancy.
- **Placeable_Object**: A Unity component attached to each furniture or decoration prefab that declares the allowed placement surfaces and the grid footprint (width × height in cells) for that prefab.
- **Object_Palette**: The in-game UI panel that displays available prefabs as clickable buttons and initiates placement sessions when a button is clicked.
- **Grid_Cell**: A discrete unit of space on a placement surface, with a configurable side length (default 0.5 metres). Objects occupy one or more contiguous grid cells.
- **Yaw_Step**: One of four discrete camera yaw angles (45°, 135°, 225°, 315°) used in isometric view mode. The step index (0–3) determines which walls are faded by the Wall_Visibility_Manager.

---

## Requirements

### Requirement 1: Room Construction

**User Story:** As a DIY user, I want to define the dimensions of my room, so that the virtual space matches my real room.

#### Acceptance Criteria

1. THE Visualizer SHALL provide a default Room with configurable width, depth, and height expressed in metres.
2. WHEN a user sets a Room dimension value, THE Visualizer SHALL update the Room geometry within one rendered frame.
3. IF a user enters a Room dimension less than 1 metre or greater than 50 metres, THEN THE Visualizer SHALL reject the value and display a validation message.
4. THE Room SHALL include four walls, a floor, and a ceiling rendered as distinct surfaces.

---

### Requirement 2: Runtime Asset Import

**User Story:** As a DIY user, I want to import scanned objects produced by the AI Vision tool, so that I can place real-world items in my virtual room.

#### Acceptance Criteria

1. WHEN a user selects a glTF/GLB file from disk, THE Asset_Loader SHALL load the file and instantiate it as an Object in the scene.
2. WHEN a glTF/GLB file is loaded successfully, THE Asset_Loader SHALL preserve the mesh geometry, materials, and textures encoded in the file.
3. IF a selected file is not a valid glTF or GLB file, THEN THE Asset_Loader SHALL surface an error message and leave the scene unchanged.
4. IF a glTF/GLB file references external textures that are missing from disk, THEN THE Asset_Loader SHALL load the mesh with a default material and notify the user.
5. THE Asset_Loader SHALL complete loading of a glTF/GLB file under 50 MB within 5 seconds on the target desktop hardware.

---

### Requirement 3: Object Placement

**User Story:** As a DIY user, I want to place objects anywhere in the room, so that I can arrange my furniture layout.

#### Acceptance Criteria

1. WHEN a user selects an Object from the asset panel, THE Object_Placer SHALL attach the Object to the cursor and display a placement preview.
2. WHEN a user confirms placement, THE Object_Placer SHALL position the Object at the cursor location with its base resting on the floor or on the surface directly beneath it.
3. WHEN a user selects a placed Object, THE Object_Placer SHALL highlight the Object and display transform handles for move and rotate operations.
4. WHEN a user drags a placed Object, THE Object_Placer SHALL move the Object along the floor plane in real time.
5. WHEN a user rotates a placed Object, THE Object_Placer SHALL rotate the Object around its vertical axis in 15-degree increments.
6. WHEN a user removes a placed Object, THE Object_Placer SHALL delete the Object from the scene immediately.
7. THE Collision_System SHALL prevent a placed Object from overlapping another placed Object or extending beyond the Room boundaries.
8. IF a placement position would cause a collision, THEN THE Object_Placer SHALL display a visual indicator and prevent confirmation of that placement.

---

### Requirement 4: Camera Navigation

**User Story:** As a DIY user, I want to navigate the 3D room freely, so that I can view my layout from any angle.

#### Acceptance Criteria

1. WHILE no Object is selected, THE Camera_Controller SHALL respond to keyboard input (WASD or arrow keys) to translate the camera horizontally.
2. WHILE no Object is selected, THE Camera_Controller SHALL respond to mouse drag input to orbit the camera around the Room centre.
3. THE Camera_Controller SHALL respond to mouse scroll input to zoom the camera in and out within a range of 1 metre to 20 metres from the Room centre.
4. THE Camera_Controller SHALL provide a top-down orthographic view mode toggled by a keyboard shortcut.
5. IF the camera position would move outside the Room bounding volume, THEN THE Camera_Controller SHALL clamp the position to the boundary.

---

### Requirement 5: Surface Customisation

**User Story:** As a DIY user, I want to change the colour and texture of walls, floor, and ceiling, so that I can visualise different finish options.

#### Acceptance Criteria

1. WHEN a user selects a surface (wall, floor, or ceiling) and chooses a colour, THE Surface_Manager SHALL apply that colour to the selected surface within one rendered frame.
2. WHEN a user selects a surface and imports a texture image (PNG or JPG), THE Surface_Manager SHALL tile the texture across the selected surface.
3. IF a texture image file exceeds 10 MB, THEN THE Surface_Manager SHALL reject the file and display a size-limit message.
4. THE Surface_Manager SHALL allow each of the four walls, the floor, and the ceiling to hold independent material assignments.

---

### Requirement 6: Lighting Control

**User Story:** As a DIY user, I want to adjust the room lighting, so that I can see how my layout looks under different conditions.

#### Acceptance Criteria

1. THE Lighting_Manager SHALL provide a default ambient light source active when the Room is first created.
2. WHEN a user adjusts the ambient light intensity slider, THE Lighting_Manager SHALL update the scene illumination in real time.
3. WHEN a user places a point light Object, THE Lighting_Manager SHALL add a point light source at the specified position with configurable colour and intensity.
4. THE Lighting_Manager SHALL support a minimum of one ambient light and up to four point lights simultaneously.

---

### Requirement 7: Scene Save and Load

**User Story:** As a DIY user, I want to save and reload my room layout, so that I can continue working across sessions.

#### Acceptance Criteria

1. WHEN a user triggers a save action, THE Scene_Serializer SHALL write the current Room dimensions, all Object transforms and asset references, surface materials, and lighting configuration to a JSON file on disk.
2. WHEN a user triggers a load action and selects a valid save file, THE Scene_Serializer SHALL restore the Room to the saved state.
3. IF a save file references a glTF/GLB asset that is no longer present on disk, THEN THE Scene_Serializer SHALL load the remaining scene and display a warning listing the missing assets.
4. FOR ALL valid saved scenes, saving then loading SHALL produce a Room whose Object positions, rotations, surface materials, and lighting values are equal to those at the time of saving (round-trip property).
5. THE Scene_Serializer SHALL complete a save or load operation for a scene containing up to 50 Objects within 3 seconds.

---

### Requirement 8: UI Bridge Contract

**User Story:** As a developer integrating with Teammate 2's UI, I want a defined interface between the game engine and the UI layer, so that both can be developed in parallel without blocking each other.

#### Acceptance Criteria

1. THE UI_Bridge SHALL expose public C# methods or UnityEvents for each user-facing action: load asset, place object, move object, rotate object, remove object, set surface material, set lighting parameter, save scene, and load scene.
2. THE UI_Bridge SHALL raise a C# event carrying a status payload whenever an operation completes or fails, so that the UI layer can update its state without polling.
3. THE Visualizer SHALL compile and run with stub implementations of all UI_Bridge methods, so that game mechanics can be tested independently of the UI implementation.

---

### Requirement 9: Performance Baseline

**User Story:** As a DIY user, I want the visualizer to run smoothly on a standard desktop, so that interaction feels responsive.

#### Acceptance Criteria

1. WHILE a scene contains up to 50 placed Objects, THE Visualizer SHALL maintain a minimum of 30 frames per second on a desktop with a discrete GPU.
2. WHEN the user performs any Object_Placer or Camera_Controller interaction, THE Visualizer SHALL reflect the result within one rendered frame.

---

### Requirement 10: BlockModel Import from AI Pipeline

**User Story:** As a developer integrating with the team's AI Pipeline, I want the Visualizer to accept a `BlockModel` JSON produced by the AI Pipeline (`POST /detect` response), so that AI-detected room objects are automatically laid out in the 3D scene without manual placement.

#### Acceptance Criteria

1. WHEN the Visualizer receives a valid `BlockModel` JSON (conforming to the Room Vision AI schema), THE Asset_Loader SHALL map each block entry to a placed Object in the scene using the block's `position`, `dimensions`, and `rotation` fields.
2. WHEN a block's `category` field matches a known glTF/GLB asset in the local asset library, THE Asset_Loader SHALL instantiate that asset; OTHERWISE THE Asset_Loader SHALL instantiate a default geometric primitive scaled to the block's `dimensions`.
3. WHEN a block has `low_confidence: true` (i.e., `confidence_score < 0.5`), THE Visualizer SHALL render that Object with a distinct visual indicator (e.g., a translucent overlay or outline) to match the Desktop Visualization Engine's low-confidence styling.
4. WHEN a `BlockModel` contains `room_dimensions`, THE RoomController SHALL apply those dimensions (width, depth, height in metres) to the Room geometry, subject to the [1, 50] metre validation in Requirement 1.3.
5. IF a `BlockModel` JSON fails schema validation, THEN THE Visualizer SHALL surface an error message and leave the current scene unchanged.

---

### Requirement 11: Local HTTP Command Interface

**User Story:** As a developer integrating with the team's Desktop Visualization Engine (Python/PySide6), I want the Visualizer to expose a local HTTP interface, so that the Desktop Visualization Engine can drive the Unity scene programmatically without requiring a Unity-specific integration layer.

#### Acceptance Criteria

1. THE Visualizer SHALL start a local HTTP listener on `localhost:8322` when launched.
2. THE HTTP interface SHALL expose the following endpoints, each mapping to the corresponding `UIBridge` method:
   - `POST /load-asset` → `UIBridge.LoadAsset`
   - `POST /place-object` → `UIBridge.PlaceObject`
   - `POST /move-object` → `UIBridge.MoveObject`
   - `POST /rotate-object` → `UIBridge.RotateObject`
   - `POST /remove-object` → `UIBridge.RemoveObject`
   - `POST /set-surface` → `UIBridge.SetSurfaceMaterial`
   - `POST /set-lighting` → `UIBridge.SetLightingParameter`
   - `POST /save-scene` → `UIBridge.SaveScene`
   - `POST /load-scene` → `UIBridge.LoadScene`
   - `POST /load-block-model` → triggers BlockModel import (Requirement 10)
   - `GET /health` → returns `{ "status": "ok", "version": "1.0" }`
3. ALL request and response bodies SHALL use JSON.
4. WHEN a `UIBridge` operation completes or fails, THE HTTP response SHALL carry the `OperationResult` payload (success flag, operation name, message).
5. THE HTTP listener SHALL be non-blocking and SHALL NOT affect the Unity render loop or frame rate.
6. IF the HTTP listener port `8322` is already in use at launch, THE Visualizer SHALL log an error and continue running without the HTTP interface, so the standalone Unity scene remains usable.

---

### Requirement 12: Isometric Orthographic Camera

**User Story:** As a DIY user, I want a fixed isometric view of my room, so that I can see the layout clearly without perspective distortion.

#### Acceptance Criteria

1. THE Camera_Controller SHALL provide an isometric view mode that uses orthographic projection with a fixed yaw of 45 degrees and a fixed pitch of 30 degrees.
2. WHEN the isometric view mode is active, THE Camera_Controller SHALL use orthographic projection and SHALL NOT allow free-orbit mouse input to change the yaw or pitch.
3. WHEN the isometric view mode is active, THE Camera_Controller SHALL respond to mouse scroll input to adjust the orthographic size within a range of 1 metre to 20 metres equivalent.
4. THE Camera_Controller SHALL provide a keyboard shortcut to toggle between the isometric view mode and any previously active perspective view mode.
5. WHEN the user switches from perspective mode to isometric mode, THE Camera_Controller SHALL preserve the current zoom level and restore it when switching back.

---

### Requirement 13: Four-Step Camera Rotation

**User Story:** As a DIY user, I want to rotate the camera around the room in 90-degree steps, so that I can view each wall face-on without losing track of object positions.

#### Acceptance Criteria

1. WHEN the isometric view mode is active, THE Camera_Controller SHALL respond to a rotate-left or rotate-right input by advancing the camera yaw by exactly 90 degrees around the room's vertical axis.
2. THE Camera_Controller SHALL support exactly four discrete yaw positions: 45 degrees, 135 degrees, 225 degrees, and 315 degrees (each offset 45 degrees from a cardinal axis to maintain the isometric angle).
3. WHEN the camera yaw changes, THE Camera_Controller SHALL animate the transition over no more than 0.3 seconds.
4. WHEN the camera yaw changes, all placed Objects SHALL retain their world-space positions and grid-cell assignments unchanged.
5. THE Camera_Controller SHALL expose the current yaw step index (0 through 3) as a readable property so that the Wall_Visibility_Manager can determine which walls to fade.

---

### Requirement 14: Wall Visibility and Fade

**User Story:** As a DIY user, I want the walls facing the camera to become transparent, so that I can always see inside the room regardless of the camera angle.

#### Acceptance Criteria

1. THE Wall_Visibility_Manager SHALL determine the two walls that face the camera based on the Camera_Controller's current yaw step index.
2. WHEN the camera yaw step changes, THE Wall_Visibility_Manager SHALL fade the two front-facing walls to a configurable transparency (default alpha 0.15) within 0.2 seconds.
3. WHEN the camera yaw step changes, THE Wall_Visibility_Manager SHALL restore the two previously front-facing walls to fully opaque within 0.2 seconds.
4. THE Wall_Visibility_Manager SHALL apply the fade effect by modifying the alpha channel of each wall surface's material instance without affecting the material assets shared with other surfaces.
5. IF a wall surface has a user-assigned texture, THEN THE Wall_Visibility_Manager SHALL preserve the texture and tiling settings while applying the transparency change.

---

### Requirement 15: Placement Grid Manager

**User Story:** As a DIY user, I want objects to snap to a grid on each surface, so that my room layout looks tidy and aligned.

#### Acceptance Criteria

1. THE Placement_Grid_Manager SHALL maintain a separate grid for the floor and for each of the four walls (WallNorth, WallSouth, WallEast, WallWest), with a configurable cell size (default 0.5 metres).
2. THE Placement_Grid_Manager SHALL provide a `GridToWorld(surfaceId, gridX, gridY)` method that returns the world-space centre position of the specified grid cell on the specified surface.
3. THE Placement_Grid_Manager SHALL provide a `WorldToGrid(surfaceId, worldPosition)` method that returns the nearest grid cell coordinates for a given world-space position on the specified surface.
4. WHEN the room dimensions change, THE Placement_Grid_Manager SHALL recalculate all grid extents so that grid cells remain aligned to the surface boundaries.
5. THE Placement_Grid_Manager SHALL track which grid cells are occupied by placed objects and expose an `IsCellOccupied(surfaceId, gridX, gridY)` query method.
6. FOR ALL valid grid cell coordinates on a surface, converting to world space and back to grid coordinates SHALL return the original grid coordinates (round-trip property).

---

### Requirement 16: Placeable Object Component

**User Story:** As a DIY user, I want each furniture prefab to know which surfaces it can be placed on and how much space it occupies, so that placement rules are enforced automatically.

#### Acceptance Criteria

1. THE Placeable_Object component SHALL store the list of allowed surfaces (any combination of Floor, WallNorth, WallSouth, WallEast, WallWest) for the prefab it is attached to.
2. THE Placeable_Object component SHALL store the grid footprint of the prefab as a width and height expressed in whole grid cells.
3. WHEN a placement is attempted, THE Object_Placer SHALL read the Placeable_Object component on the prefab to determine allowed surfaces and grid footprint.
4. IF a prefab does not have a Placeable_Object component, THEN THE Object_Placer SHALL treat the prefab as floor-only with a 1x1 grid footprint and log a warning.
5. THE Placeable_Object component SHALL be configurable in the Unity Editor inspector without requiring code changes.

---

### Requirement 17: Grid Snapping

**User Story:** As a DIY user, I want placed objects to snap to the grid automatically, so that I do not have to align them manually.

#### Acceptance Criteria

1. WHEN a user confirms placement of a floor object, THE Object_Placer SHALL snap the object's position to the nearest floor grid cell centre as returned by `Placement_Grid_Manager.GridToWorld`.
2. WHEN a user confirms placement of a wall object, THE Object_Placer SHALL snap the object's position to the nearest grid cell centre on the target wall surface.
3. WHILE a placement preview is active, THE Object_Placer SHALL update the preview position to the nearest valid grid cell centre on every frame so the user sees the snapped position before confirming.
4. WHEN a user moves a placed object, THE Object_Placer SHALL snap the object to the nearest grid cell centre on the same surface after each move operation.
5. THE Object_Placer SHALL use the Placeable_Object grid footprint to determine the anchor cell such that the object is centred within its occupied cells.

---

### Requirement 18: Ghost Preview with Validity Color

**User Story:** As a DIY user, I want the placement preview to show green when valid and red when invalid, so that I know immediately whether I can place an object at the current position.

#### Acceptance Criteria

1. WHEN a placement preview is active and the current grid position is valid, THE Object_Placer SHALL render the preview object with a semi-transparent green material (RGBA approximately 0, 1, 0, 0.4).
2. WHEN a placement preview is active and the current grid position is invalid, THE Object_Placer SHALL render the preview object with a semi-transparent red material (RGBA approximately 1, 0, 0, 0.4).
3. THE Object_Placer SHALL update the preview material color on every frame to reflect the current validity state.
4. THE Object_Placer SHALL replace the existing cyan preview material with the green/red validity-color system described in criteria 1 and 2.
5. WHEN the preview transitions between valid and invalid states, THE Object_Placer SHALL change the material color within one rendered frame.

---

### Requirement 19: Placement Validation

**User Story:** As a DIY user, I want the system to prevent me from placing objects in invalid positions, so that my room layout remains physically coherent.

#### Acceptance Criteria

1. WHEN a placement is confirmed, THE Object_Placer SHALL verify that the target surface is listed in the Placeable_Object component's allowed surfaces; IF the surface is not allowed, THEN THE Object_Placer SHALL return `PlacementResult.Blocked`.
2. WHEN a placement is confirmed, THE Object_Placer SHALL verify that all grid cells required by the object's footprint lie within the surface's grid bounds; IF any cell is out of bounds, THEN THE Object_Placer SHALL return `PlacementResult.OutOfBounds`.
3. WHEN a placement is confirmed, THE Object_Placer SHALL verify that none of the grid cells required by the object's footprint are already occupied; IF any cell is occupied, THEN THE Object_Placer SHALL return `PlacementResult.Blocked`.
4. WHEN a placement is confirmed, THE Collision_System SHALL verify that the object's world-space bounds do not overlap any existing placed object's bounds; IF they overlap, THEN THE Object_Placer SHALL return `PlacementResult.Blocked`.
5. WHEN a placement succeeds, THE Placement_Grid_Manager SHALL mark all grid cells covered by the object's footprint as occupied.
6. WHEN an object is removed, THE Placement_Grid_Manager SHALL mark all grid cells previously covered by that object's footprint as unoccupied.

---

### Requirement 20: Object Palette UI

**User Story:** As a DIY user, I want a panel of furniture buttons, so that I can quickly select and place items without navigating a file browser.

#### Acceptance Criteria

1. THE Object_Palette SHALL display a scrollable panel of prefab buttons, each showing a thumbnail image and the prefab's display name.
2. WHEN a user clicks a prefab button in the Object_Palette, THE Object_Placer SHALL begin a placement session for that prefab, attaching a ghost preview to the cursor.
3. THE Object_Palette SHALL be populated from the same AssetLibraryConfig ScriptableObject used by the BlockModel_Importer, so that adding a new prefab to the library automatically adds it to the palette.
4. THE Object_Palette SHALL group prefabs by category (e.g., Furniture, Decoration, Lighting) as defined in the AssetLibraryConfig.
5. WHEN a placement session is active, THE Object_Palette SHALL highlight the selected prefab button to indicate the active selection.
6. WHEN a user presses the Escape key during a placement session, THE Object_Placer SHALL cancel the placement and THE Object_Palette SHALL deselect the active button.

---

### Requirement 21: Starter Prefab Library

**User Story:** As a DIY user, I want a set of built-in low-poly furniture and decoration prefabs, so that I can start designing my room immediately without importing external assets.

#### Acceptance Criteria

1. THE AssetLibraryConfig SHALL include entries for the following starter prefabs: bed, desk, chair, wardrobe, shelves, poster, hook, guitar, window, rug, lamp, books, laptop.
2. EACH starter prefab SHALL be a low-poly diorama-style mesh with a single material, suitable for real-time rendering at 30 fps with up to 50 instances in the scene.
3. EACH starter prefab SHALL have a Placeable_Object component pre-configured with appropriate allowed surfaces and grid footprint (e.g., bed: floor only, 2x3 cells; poster: wall only, 1x2 cells).
4. EACH starter prefab SHALL have a thumbnail image stored alongside the prefab for use in the Object_Palette.
5. THE starter prefabs SHALL be stored under `Assets/RoomVisualizer/Prefabs/Starter/` and SHALL be loadable by the AssetLibraryConfig without runtime file I/O.

---

### Requirement 22: Extended Save and Load

**User Story:** As a DIY user, I want my saved room to remember which prefab each object came from, which surface it is on, and its grid position, so that the room loads back exactly as I left it.

#### Acceptance Criteria

1. WHEN a user triggers a save action, THE Scene_Serializer SHALL write the following additional fields for each placed object: prefab ID (string key matching the AssetLibraryConfig entry), surface type (SurfaceId), grid position (gridX and gridY integers), rotation step (integer 0 through 3), and a dictionary of custom string properties.
2. WHEN a user triggers a load action, THE Scene_Serializer SHALL restore each object's surface assignment and grid position and SHALL call `Placement_Grid_Manager.MarkOccupied` for each loaded object's footprint.
3. IF a save file contains a prefab ID that is not present in the current AssetLibraryConfig, THEN THE Scene_Serializer SHALL skip that object, add a warning to the load result, and continue loading the remaining objects.
4. FOR ALL valid saved scenes that use the extended format, saving then loading SHALL produce a room whose object prefab IDs, surface types, grid positions, rotation steps, and custom properties are equal to those at the time of saving (round-trip property).
5. THE Scene_Serializer SHALL remain backward-compatible with save files written in the original format (Requirement 7); objects in the original format SHALL be loaded using world-space position and the Collision_System for placement, with grid position inferred from `WorldToGrid`.
