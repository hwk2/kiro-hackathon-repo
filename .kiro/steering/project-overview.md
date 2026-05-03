---
inclusion: auto
---

# Room Vision AI — Project Overview

## What This Project Is
A privacy-first, open-source computer vision app that captures room images on mobile, transfers them over encrypted Bluetooth to a desktop, and generates interactive 3D block models with AI-powered room manipulation (e.g., child safety, elderly accessibility).

## Team Structure
- **Member 1**: Mobile App (Expo/React Native, TypeScript) — image capture, Bluetooth pairing, encrypted transfer
- **Member 2**: Desktop Visualization Engine (Python, PySide6, OpenGL) — 3D rendering, prompt UI, feedback storage
- **Member 3**: AI & Asset Pipeline (Python, FastAPI) — object detection, model generation, prompt processing, plugins
- **Member 4 (You)**: 3D Room Visualizer (Unity 2022 LTS, C#) — interactive 3D game engine for room design, furniture placement, surface/lighting customisation, and BlockModel import from the AI Pipeline

## Current Focus
Unity 3D Room Visualizer (Member 4) is the active development area. Tasks 1, 2.1, 3.1, 4.1, 5 (checkpoint), 6.1, 7.1, 8.1, 9.1, 10 (checkpoint), 11.1, and 12.1 are complete. All core subsystems are implemented: `RoomController`, `CollisionSystem`, `ObjectPlacer`, `CameraController`, `SurfaceManager`, `LightingManager`, `AssetLoader`, `SceneSerializer`, and `UIBridge`. Next up: Task 12.4 (wire all subsystems in a Unity scene), Task 13.1 (BlockModelImporter), Task 14.1 (HttpListenerService), and Task 15 (final checkpoint).

Member 1's mobile app is also active. Using Expo (React Native) with TypeScript for iOS-first development.

Member 4's Unity 3D Room Visualizer: Task 12.1 (UIBridge MonoBehaviour) is complete. All ten public methods are implemented and wired to subsystem dependencies. Next up: Task 12.2 (property tests for UIBridge) and Task 12.4 (wire all subsystems in a Unity scene).

## Repository Layout
```
mobile/ios-app/     # Expo React Native app (Member 1) — ACTIVE
desktop/            # PySide6 desktop app (Member 2) — scaffolded
ai_pipeline/        # FastAPI AI pipeline (Member 3) — scaffolded
.kiro/specs/        # Requirements, design, and tasks for all members
```

## Unity 3D Room Visualizer
The Unity desktop game lives in a **separate repository**: [https://github.com/OverseerUniverse/RoomVisualizer](https://github.com/OverseerUniverse/RoomVisualizer). It:
- Exposes a local HTTP interface on `localhost:8322` so Member 2's Python app can drive the 3D scene
- Consumes `BlockModel` JSON from the AI Pipeline (`localhost:8321`) via `POST /load-block-model`
- Handles glTF/GLB asset import, object placement, surface/lighting customisation, and scene save/load
- Spec files: `.kiro/specs/3d-room-visualizer/`

## Key Architecture Decisions
- **Expo (React Native)** for mobile: enables iOS development from Windows via Expo Go, no Mac needed
- **Bluetooth for transfer**: local-only, no accounts, no cloud — privacy first
- **Localhost REST API** for desktop ↔ AI pipeline: language-agnostic, easy to swap AI backends
- **Unity 3D Visualizer** on `localhost:8322`: Member 2's Python app drives the Unity scene via HTTP; the AI Pipeline's `BlockModel` JSON is forwarded directly to Unity for rendering
- **Plugin system**: JSON manifests in a directory, no compilation needed
- **All data local**: images, models, feedback never leave the user's devices

## Documentation Requirements
When working on any component, always update:
1. The component's README.md
2. Relevant steering docs in .kiro/steering/
3. Task status in .kiro/specs/room-vision-ai/tasks-memberN-*.md
4. Hooks if new automation is needed
5. Specs if requirements change
