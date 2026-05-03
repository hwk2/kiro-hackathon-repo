---
inclusion: fileMatch
fileMatchPattern: "ai-pipeline/**"
---

# AI Pipeline Development Standards

## Runtime
- **Always use `python3`** — never bare `python`
- Virtual environment: `ai-pipeline/.venv/` (created with `python3 -m venv .venv`)
- Run tests: `cd ai-pipeline && PYTHONPATH=src .venv/bin/python3 -m pytest tests/ -v`
- Run server: `cd ai-pipeline && PYTHONPATH=src .venv/bin/python3 -m uvicorn room_vision_ai.main:app --host 127.0.0.1 --port 8321`

## Open Source / Bring Your Own LLM
This project does NOT bundle any AI model or API keys. Users bring their own LLM.

- **Never hardcode API keys** in source code or config files
- Default `agent_config.json` points to Ollama (free, local) — no API key needed
- All agent adapters must clearly state in docstrings that users are responsible for their own usage and costs
- The README must prominently warn: "You are responsible for your own API usage, rate limits, and costs"
- When adding a new agent adapter, always include a disclaimer about external data transmission

## Project Structure
```
ai-pipeline/
├── pyproject.toml          # Project metadata, pinned dependencies
├── requirements.txt        # Pip-installable dependencies (pinned)
├── README.md               # Setup, agent config, API docs
├── agent_config.json       # User-editable agent configuration
├── plugins/
│   ├── core/               # Built-in categories and rules
│   │   ├── categories.json # 16 object categories
│   │   └── rules.json      # 8 safety/accessibility rules
│   ├── installed/          # User-installed plugins (manifest.json each)
│   └── plugin_schema.json  # JSON Schema for plugin manifests
├── data/
│   └── feedback/           # Local-only training feedback storage
├── src/
│   └── room_vision_ai/
│       ├── __init__.py
│       ├── main.py              # FastAPI app, lifespan, agent factory
│       ├── api_server.py        # Route definitions (/health, /detect, /manipulate, /categories, /rules)
│       ├── models.py            # All Pydantic data models
│       ├── agent_interface.py   # Abstract AgentInterface base class
│       ├── agents/
│       │   ├── ollama_agent.py  # Ollama adapter
│       │   ├── gemini_agent.py  # Gemini adapter
│       │   └── custom_agent.py  # Dynamic custom agent loader
│       ├── object_detector.py   # Detection orchestration + image validation
│       ├── model_generator.py   # DetectionResult → BlockModel conversion
│       ├── prompt_processor.py  # Manipulation prompt processing + safety rules
│       ├── safety_rules.py      # 8 concrete safety rule implementations
│       ├── feedback_store.py    # Local-only training feedback storage
│       ├── category_registry.py # Category and rule loading/serving
│       ├── plugin_manager.py    # Plugin discovery, validation, merging
│       └── block_model_serializer.py # BlockModel JSON serialization
└── tests/
    ├── conftest.py          # Shared fixtures (FastAPI TestClient)
    ├── test_health.py
    ├── test_models.py
    ├── test_agents.py
    ├── test_category_registry.py
    ├── test_detect.py
    ├── test_model_generator.py
    ├── test_serializer.py
    ├── test_prompt_processor.py
    ├── test_safety_rules.py
    ├── test_feedback_store.py
    └── test_integration.py
```

## Coding Conventions
- MIT license header comment at top of every source file
- Type hints on all function signatures
- Pydantic models for all API request/response validation
- Route handlers stay thin — business logic in separate modules
- All dependencies pinned to exact versions in both `pyproject.toml` and `requirements.txt`
- Use `httpx` for all HTTP client operations (not `requests`)
- Use `Pillow` for image operations
- Graceful error handling — the server should never crash due to bad input or agent failures

## API Design
- Base URL: `http://localhost:8321/api/v1`
- CORS restricted to localhost only
- All responses are JSON
- Error responses use `ErrorResponse` model: `{error, message, details[]}`
- 422 for validation failures, agent errors, and bad input

## Data Privacy
- All data stays local — no external calls except to the user's configured AI agent
- Training feedback stored in `data/feedback/` — never transmitted
- When using external agents (Gemini), warn the user that image data leaves the machine

## Testing
- Every new module gets a corresponding test file in `tests/`
- Use `MockAgent` (in test_detect.py) for testing detection without a real LLM
- Use `tmp_path` fixture for plugin/config file tests
- Integration tests use `FastAPI.TestClient` with the real app lifespan
- Always run full suite after changes: all tests must pass before marking a task complete

## Plugin System
- Plugins are JSON manifest files in `plugins/installed/<plugin-name>/manifest.json`
- Validated against `PluginManifest` Pydantic model at startup
- Invalid plugins are skipped with warnings — never crash
- Plugin categories and rules merge into the CategoryRegistry
