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

## Current Focus
Member 1's mobile app is the active development area. Using Expo (React Native) with TypeScript for iOS-first development. No Mac available — using Expo Go for on-device testing.

## Repository Layout
```
mobile/ios-app/     # Expo React Native app (Member 1) — ACTIVE
desktop/            # PySide6 desktop app (Member 2) — scaffolded
ai_pipeline/        # FastAPI AI pipeline (Member 3) — scaffolded
.kiro/specs/        # Requirements, design, and tasks for all members
```

## Key Architecture Decisions
- **Expo (React Native)** for mobile: enables iOS development from Windows via Expo Go, no Mac needed
- **Bluetooth for transfer**: local-only, no accounts, no cloud — privacy first
- **Localhost REST API** for desktop ↔ AI pipeline: language-agnostic, easy to swap AI backends
- **Plugin system**: JSON manifests in a directory, no compilation needed
- **All data local**: images, models, feedback never leave the user's devices

## Documentation Requirements
When working on any component, always update:
1. The component's README.md
2. Relevant steering docs in .kiro/steering/
3. Task status in .kiro/specs/room-vision-ai/tasks-memberN-*.md
4. Hooks if new automation is needed
5. Specs if requirements change
