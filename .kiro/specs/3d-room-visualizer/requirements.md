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
