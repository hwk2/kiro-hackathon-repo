# Room Vision AI — AI & Asset Pipeline

Privacy-first AI pipeline for room object detection, 3D block model generation,
and safety-focused room manipulation. Runs as a local REST API server on
`localhost:8321`.

> **⚠️ This project does NOT include any AI model or API keys.**
> Users must set up their own AI agent (Ollama, Gemini, or a custom agent).
> **You are responsible for your own API usage, rate limits, and costs.**

## Quick Start

```bash
cd ai-pipeline
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
# .venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

Run the server:

```bash
# From the ai-pipeline/ directory:
PYTHONPATH=src uvicorn room_vision_ai.main:app --host 127.0.0.1 --port 8321
```

Verify it works:

```bash
curl http://localhost:8321/api/v1/health
```

## AI Agent Setup (Bring Your Own LLM)

This project is **open source (MIT)** and does not bundle any AI model.
You must configure your own AI agent. The architecture makes it trivially
easy to swap agents — just edit `agent_config.json`.

The default configuration points to [Ollama](https://ollama.com/) — a free,
local LLM runner — so you can get started without any API key.

### Option 1: Ollama (Default — Free, Local)

1. Install Ollama: <https://ollama.com/download>
2. Pull a vision model:
   ```bash
   ollama pull llava:13b
   ```
3. Start Ollama (it runs on `http://localhost:11434` by default).
4. The default `agent_config.json` already points to Ollama — no changes needed.

**Example `agent_config.json`:**
```json
{
  "agent_type": "ollama",
  "model_name": "llava:13b",
  "endpoint": "http://localhost:11434",
  "api_key": null,
  "timeout_seconds": 120,
  "max_retries": 2
}
```

### Option 2: Gemini (Google AI — Free Tier Available)

> **You are responsible for your own Gemini API usage, rate limits, and costs.**

1. Get a Gemini API key from <https://aistudio.google.com/apikey>
2. Edit `agent_config.json`:

**Example `agent_config.json`:**
```json
{
  "agent_type": "gemini",
  "model_name": "gemini-1.5-flash",
  "endpoint": "https://generativelanguage.googleapis.com",
  "api_key": "YOUR_API_KEY_HERE",
  "timeout_seconds": 120,
  "max_retries": 2
}
```

> **Important:** When using Gemini, image data is sent to Google's API.
> Review Google's data handling policies before use.

### Option 3: Custom Agent

You can implement your own agent by subclassing `AgentInterface` and pointing
the config at your module.

**Example `agent_config.json`:**
```json
{
  "agent_type": "custom",
  "model_name": "my_package.my_module.MyAgent",
  "endpoint": "",
  "api_key": null,
  "timeout_seconds": 120,
  "max_retries": 2
}
```

#### Creating a Custom Agent

1. Create a Python module that subclasses `AgentInterface`:

```python
# my_package/my_module.py
from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.models import AgentConfig
from typing import List


class MyAgent(AgentInterface):
    """My custom AI agent implementation."""

    def __init__(self, config: AgentConfig) -> None:
        super().__init__(config)
        # Initialize your agent (connect to your LLM, load model, etc.)

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        """Detect objects in room images.

        Args:
            images: List of raw image bytes
            metadata: List of ImageMetadata dicts

        Returns:
            List of DetectionResult dicts, one per image. Each dict has:
            - image_filename: str
            - detections: list of dicts with category, confidence_score, bounding_box
        """
        results = []
        for idx, img in enumerate(images):
            meta = metadata[idx] if idx < len(metadata) else {}
            # ... your detection logic here ...
            results.append({
                "image_filename": meta.get("filename", f"image_{idx}"),
                "detections": [],  # populate with your detections
            })
        return results

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        """Generate 2-5 response options for a manipulation prompt.

        Args:
            prompt: Natural language manipulation prompt
            block_model: Current BlockModel dict
            rules: Applicable manipulation rules

        Returns:
            List of ResponseOption dicts (2-5 items)
        """
        # ... your manipulation logic here ...
        return []

    def health_check(self) -> dict:
        """Return agent status information."""
        return {
            "status": "ok",
            "agent_type": "custom",
            "model": "my-model",
        }
```

2. Make sure your module is importable (install it or add it to `PYTHONPATH`).
3. Set `model_name` in `agent_config.json` to the dotted path of your class.
4. Restart the server.

## Configuration

Edit `agent_config.json` in the project root:

| Field             | Description                                      |
|-------------------|--------------------------------------------------|
| `agent_type`      | `"ollama"`, `"gemini"`, or `"custom"`            |
| `model_name`      | Model identifier or custom class path            |
| `endpoint`        | Agent API endpoint URL                           |
| `api_key`         | API key (set `null` for local agents like Ollama)|
| `timeout_seconds` | Request timeout (default: 120)                   |
| `max_retries`     | Retry count on failure (default: 2)              |

## API Endpoints

Base URL: `http://localhost:8321/api/v1`

| Method | Path          | Description                                |
|--------|---------------|--------------------------------------------|
| GET    | `/health`     | Health check — agent name, version, plugins|
| POST   | `/detect`     | Submit images for object detection         |
| POST   | `/manipulate` | Submit manipulation prompt + block model   |
| GET    | `/categories` | List all registered object categories      |
| GET    | `/rules`      | List all registered manipulation rules     |

## Project Structure

```
ai-pipeline/
├── pyproject.toml
├── requirements.txt
├── README.md
├── agent_config.json
├── plugins/
│   ├── core/
│   │   ├── categories.json
│   │   └── rules.json
│   └── installed/
├── data/
│   └── feedback/
├── src/
│   └── room_vision_ai/
│       ├── __init__.py
│       ├── main.py
│       ├── api_server.py
│       ├── models.py
│       ├── agent_interface.py
│       ├── agents/
│       │   ├── __init__.py
│       │   ├── ollama_agent.py
│       │   ├── gemini_agent.py
│       │   └── custom_agent.py
│       ├── object_detector.py
│       ├── model_generator.py
│       ├── prompt_processor.py
│       ├── category_registry.py
│       ├── plugin_manager.py
│       └── block_model_serializer.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── test_agents.py
```

## Plugin System

Drop plugin folders into `plugins/installed/`. Each plugin needs a
`manifest.json` following the `PluginManifest` schema. Plugins can add:

- New object categories
- New manipulation rules
- New prompt types
- Custom agent configurations

Plugins are loaded at startup. Invalid plugins are skipped with a warning.

## Data Privacy

- All data stays on your local machine.
- No external calls are made except to your configured AI agent endpoint.
- Training feedback is stored locally and never transmitted externally.
- When using an external API agent (e.g. Gemini), image data is sent to
  that endpoint — you are responsible for understanding the provider's
  data handling policies.

## License

MIT — see [LICENSE](../LICENSE) in the repository root.
