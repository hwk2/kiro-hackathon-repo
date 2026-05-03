# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
FastAPI application entry point.

Run with:
    uvicorn room_vision_ai.main:app --host 127.0.0.1 --port 8321

Or directly:
    python -m room_vision_ai.main
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from room_vision_ai import __version__
from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.models import AgentConfig, AgentType

logger = logging.getLogger("room_vision_ai")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ---------------------------------------------------------------------------
# Resolve project paths
# ---------------------------------------------------------------------------
# The project root is two levels up from this file:
#   ai-pipeline/src/room_vision_ai/main.py  →  ai-pipeline/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_AGENT_CONFIG_PATH = _PROJECT_ROOT / "agent_config.json"
_PLUGINS_DIR = _PROJECT_ROOT / "plugins"


# ---------------------------------------------------------------------------
# Agent config loader  (Task 2.5)
# ---------------------------------------------------------------------------

def load_agent_config(
    path: Path | None = None,
) -> AgentConfig | None:
    """Load and validate agent_config.json.

    Parameters
    ----------
    path : Path | None
        Path to the config file.  Defaults to ``<project_root>/agent_config.json``.

    Returns
    -------
    AgentConfig | None
        Validated config, or ``None`` if the file is missing or invalid.
    """
    config_path = path or _AGENT_CONFIG_PATH

    if not config_path.exists():
        logger.warning("agent_config.json not found at %s", config_path)
        return None

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        config = AgentConfig(**raw)
        logger.info(
            "Loaded agent config: %s (%s) at %s",
            config.agent_type.value,
            config.model_name,
            config.endpoint,
        )
        return config
    except Exception:
        logger.exception("Failed to parse agent_config.json at %s", config_path)
        return None


# ---------------------------------------------------------------------------
# Agent factory  (Task 2.6)
# ---------------------------------------------------------------------------

def create_agent(config: AgentConfig) -> AgentInterface | None:
    """Instantiate the correct agent based on ``config.agent_type``.

    Returns ``None`` (with a logged error) if instantiation fails, so the
    application can still start — endpoints that need the agent will return
    appropriate errors.
    """
    try:
        if config.agent_type == AgentType.OLLAMA:
            from room_vision_ai.agents.ollama_agent import OllamaAgent
            return OllamaAgent(config)

        if config.agent_type == AgentType.GEMINI:
            from room_vision_ai.agents.gemini_agent import GeminiAgent
            return GeminiAgent(config)

        if config.agent_type == AgentType.CUSTOM:
            from room_vision_ai.agents.custom_agent import load_custom_agent
            return load_custom_agent(config)

        logger.error("Unknown agent_type: %s", config.agent_type)
        return None

    except Exception:
        logger.exception(
            "Failed to instantiate %s agent — endpoints requiring the "
            "agent will return errors.",
            config.agent_type.value,
        )
        return None


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup and shutdown logic."""
    # --- Startup ---
    logger.info("Room Vision AI Pipeline v%s starting up …", __version__)

    # Load agent config (Task 2.5)
    agent_config = load_agent_config()

    # Instantiate agent (Task 2.6)
    agent: Optional[AgentInterface] = None
    if agent_config:
        agent = create_agent(agent_config)
        if agent:
            logger.info(
                "Agent ready: %s (%s)",
                agent_config.agent_type.value,
                agent_config.model_name,
            )
        else:
            logger.warning(
                "Agent instantiation failed — running without an agent."
            )
    else:
        logger.warning("No agent configured — /health will report 'no_agent'")

    # --- Category Registry & Plugin System (Tasks 3.x) ---
    from room_vision_ai.category_registry import CategoryRegistry
    from room_vision_ai.plugin_manager import PluginManager

    # 1. Create registry and load core categories/rules
    registry = CategoryRegistry()
    registry.load_core(_PLUGINS_DIR)

    # 2. Scan installed plugins
    plugin_mgr = PluginManager(_PLUGINS_DIR)
    plugin_mgr.scan()

    # 3. Merge plugin contributions into the registry
    plugins_loaded = plugin_mgr.merge_into(registry)
    logger.info("Plugins loaded: %d", plugins_loaded)

    # --- Object Detector (Tasks 4.x) ---
    from room_vision_ai.object_detector import ObjectDetector

    object_detector = ObjectDetector(agent=agent, registry=registry)

    # --- Prompt Processor (Tasks 6.x) ---
    from room_vision_ai.prompt_processor import PromptProcessor

    prompt_processor = PromptProcessor(agent=agent, registry=registry)

    # --- Feedback Store (Tasks 8.x) ---
    from room_vision_ai.feedback_store import FeedbackStore

    feedback_store = FeedbackStore()
    logger.info("Feedback store ready at %s", feedback_store._storage_dir)

    # 4. Inject state into the router module
    from room_vision_ai.api_server import configure
    configure(
        agent_config=agent_config,
        plugins_loaded=plugins_loaded,
        agent=agent,
        category_registry=registry,
        object_detector=object_detector,
        prompt_processor=prompt_processor,
        feedback_store=feedback_store,
    )

    yield  # application is running

    # --- Shutdown ---
    logger.info("Room Vision AI Pipeline shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Room Vision AI Pipeline",
    description="Privacy-first AI pipeline for room object detection, "
    "3D model generation, and safety-focused manipulation.",
    version=__version__,
    lifespan=lifespan,
)

# CORS — restricted to localhost only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:8321",
        "http://127.0.0.1",
        "http://127.0.0.1:8321",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
from room_vision_ai.api_server import router  # noqa: E402

app.include_router(router)


# ---------------------------------------------------------------------------
# Direct execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "room_vision_ai.main:app",
        host="127.0.0.1",
        port=8321,
        reload=True,
    )
