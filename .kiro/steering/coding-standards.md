---
inclusion: auto
---

# Coding Standards

## Mobile App (Expo / React Native / TypeScript)
- Use TypeScript strict mode — no `any` types
- Functional components with hooks only (no class components)
- Keep screens in `src/screens/`, shared components in `src/components/`, utilities in `src/utils/`
- Use `expo-image-picker` for camera/gallery, not raw native APIs
- Validate all images: minimum 480×480, JPEG/PNG/HEIC only
- All state management via React hooks (useState, useContext) — no Redux unless complexity demands it
- Escape/sanitize any user-facing strings

## Desktop App (Python / PySide6)
- Use type hints on all function signatures
- Async where needed for Bluetooth and HTTP operations
- Keep modules small and focused (one responsibility per file)
- PySide6 signals/slots for UI event handling

## AI Pipeline (Python / FastAPI)
- Async/await for all database and HTTP operations
- Parameterized queries only — never interpolate user input into SQL
- Pydantic models for all API request/response validation
- Keep route handlers thin — business logic in separate modules

## Cross-Cutting
- JSON for all data serialization (Bluetooth protocol, BlockModel, feedback, plugins)
- No data stored outside local device/machine
- No external API calls unless user explicitly configures an external AI agent
- All file paths relative to project root
- Commit messages: `[mobile]`, `[desktop]`, `[ai]`, or `[docs]` prefix

## Documentation
- Update README.md in the relevant directory after any structural change
- Update steering docs when architecture decisions change
- Update task files when completing or adding tasks
- Update specs when requirements change
