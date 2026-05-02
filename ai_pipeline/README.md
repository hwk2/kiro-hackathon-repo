# Room Vision AI — AI & Asset Pipeline (Member 3)

Python-based AI pipeline running as a local REST API server. Handles object detection, 3D model generation, prompt processing, safety rules, and the plugin system.

## Structure

```
ai_pipeline/
├── src/
│   ├── main.py                  # FastAPI entry point (localhost:8321)
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── interface.py         # Abstract AgentInterface class
│   │   ├── ollama_agent.py      # Ollama local model adapter
│   │   ├── gemini_agent.py      # Gemini free-tier API adapter
│   │   └── custom_agent.py      # User-provided custom agent loader
│   ├── detection/
│   │   ├── __init__.py
│   │   └── detector.py          # Object detection orchestration
│   ├── generation/
│   │   ├── __init__.py
│   │   └── model_generator.py   # DetectionResult → BlockModel conversion
│   ├── prompt/
│   │   ├── __init__.py
│   │   └── processor.py         # Prompt parsing, intent detection, response generation
│   ├── registry/
│   │   ├── __init__.py
│   │   ├── category_registry.py # Category and rule loading/serving
│   │   └── plugin_manager.py    # Plugin discovery, validation, merging
│   ├── serialization/
│   │   ├── __init__.py
│   │   └── block_model.py       # BlockModel JSON serialize/deserialize with validation
│   ├── feedback/
│   │   ├── __init__.py
│   │   └── store.py             # Local training feedback storage
│   └── models/
│       ├── __init__.py
│       └── schemas.py           # All data model definitions
├── plugins/
│   ├── core/
│   │   ├── categories.json      # Built-in object categories
│   │   └── rules.json           # Built-in manipulation rules
│   └── installed/               # User-installed plugins go here
├── config/
│   └── agent_config.json        # AI agent configuration
├── data/
│   └── feedback/                # Local training feedback storage
├── requirements.txt
└── README.md
```

## Setup

```bash
cd ai_pipeline
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn src.main:app --port 8321
```

See [tasks-member3-ai.md](../.kiro/specs/room-vision-ai/tasks-member3-ai.md) for implementation tasks.
See [requirements-member3-ai.md](../.kiro/specs/room-vision-ai/requirements-member3-ai.md) for requirements.
