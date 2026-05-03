# Room Vision AI

A privacy-first, open-source computer vision system that captures room images on mobile, transfers them over encrypted Bluetooth to a desktop, and generates interactive 3D models with AI-powered room manipulation.

## Repositories

| Component | Repo | Description |
|-----------|------|-------------|
| **This repo** | (current) | Mobile app, desktop engine, AI pipeline, specs |
| **Unity 3D Visualizer** | [OverseerUniverse/RoomVisualizer](https://github.com/OverseerUniverse/RoomVisualizer) | Unity 2022 LTS desktop game — 3D room rendering, furniture placement, surface/lighting |

## Team

| Member | Component | Stack | Directory |
|--------|-----------|-------|-----------|
| Member 1 | Mobile App | Expo / React Native / TypeScript | `mobile/ios-app/` |
| Member 2 | Desktop Visualization Engine | Python / PySide6 / OpenGL | `desktop/` |
| Member 3 | AI & Asset Pipeline | Python / FastAPI | `ai_pipeline/` |
| Member 4 | Unity 3D Room Visualizer | Unity 2022 LTS / C# | [separate repo](https://github.com/OverseerUniverse/RoomVisualizer) |

## Architecture

```
iPhone (Expo)
    │  Bluetooth (AES-256-GCM)
    ▼
Desktop App (Python/PySide6)  ──── POST /detect ────►  AI Pipeline (FastAPI)
    │                                                        localhost:8321
    │  POST /load-block-model
    ▼
Unity Visualizer (C#)
    localhost:8322
```

## Quick Start

### Mobile
```bash
cd mobile/ios-app
npm install
npx expo start
```

### Desktop
```bash
cd desktop
pip install -r requirements.txt
python src/main.py
```

### AI Pipeline
```bash
cd ai_pipeline
pip install -r requirements.txt
python src/main.py
```

### Unity Visualizer
Clone [OverseerUniverse/RoomVisualizer](https://github.com/OverseerUniverse/RoomVisualizer), open in Unity 2022 LTS, and press Play. The HTTP listener starts automatically on `localhost:8322`.

## Integration Ports

| Service | Address |
|---------|---------|
| AI Pipeline REST API | `http://localhost:8321/api/v1` |
| Unity Visualizer HTTP | `http://localhost:8322` |

## Specs & Design Docs

- [Room Vision AI — Requirements & Design](`.kiro/specs/room-vision-ai/`)
- [Unity 3D Visualizer — Requirements & Design](`.kiro/specs/3d-room-visualizer/`)

## Privacy

All data stays local. No accounts, no cloud storage, no telemetry. Bluetooth transfer uses AES-256-GCM encryption. The only external network calls are to a user-configured AI agent endpoint (optional).
