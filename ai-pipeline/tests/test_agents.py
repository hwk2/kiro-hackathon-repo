# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Tests for the AI Agent Interface and Configuration (Tasks 2.1–2.6).

Covers:
- AgentInterface is abstract and can't be instantiated directly
- OllamaAgent, GeminiAgent, CustomAgent all implement AgentInterface
- Agent config loading and validation
- Agent factory/swap logic
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.agents.ollama_agent import OllamaAgent
from room_vision_ai.agents.gemini_agent import GeminiAgent
from room_vision_ai.agents.custom_agent import load_custom_agent
from room_vision_ai.main import load_agent_config, create_agent
from room_vision_ai.models import AgentConfig, AgentType


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ollama_config() -> AgentConfig:
    return AgentConfig(
        agent_type=AgentType.OLLAMA,
        model_name="llava:13b",
        endpoint="http://localhost:11434",
        api_key=None,
        timeout_seconds=30,
        max_retries=1,
    )


@pytest.fixture
def gemini_config() -> AgentConfig:
    return AgentConfig(
        agent_type=AgentType.GEMINI,
        model_name="gemini-1.5-flash",
        endpoint="https://generativelanguage.googleapis.com",
        api_key="test-api-key-12345",
        timeout_seconds=30,
        max_retries=1,
    )


@pytest.fixture
def custom_config() -> AgentConfig:
    return AgentConfig(
        agent_type=AgentType.CUSTOM,
        model_name="tests.test_agents.StubAgent",
        endpoint="",
        api_key=None,
        timeout_seconds=30,
        max_retries=1,
    )


# ---------------------------------------------------------------------------
# Stub agent for custom loader tests
# ---------------------------------------------------------------------------

class StubAgent(AgentInterface):
    """Minimal concrete agent for testing the custom loader."""

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        return [{"image_filename": "stub", "detections": []}]

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        return []

    def health_check(self) -> dict:
        return {"status": "ok", "agent_type": "stub"}


class NotAnAgent:
    """A class that does NOT implement AgentInterface."""
    pass


# ===================================================================
# Task 2.1 — AgentInterface is abstract
# ===================================================================

class TestAgentInterfaceAbstract:
    """AgentInterface cannot be instantiated directly."""

    def test_cannot_instantiate_directly(self, ollama_config):
        """Attempting to instantiate AgentInterface raises TypeError."""
        with pytest.raises(TypeError):
            AgentInterface(ollama_config)

    def test_has_required_abstract_methods(self):
        """AgentInterface declares the three required abstract methods."""
        abstract_methods = AgentInterface.__abstractmethods__
        assert "detect_objects" in abstract_methods
        assert "generate_manipulation" in abstract_methods
        assert "health_check" in abstract_methods


# ===================================================================
# Task 2.2 — OllamaAgent implements AgentInterface
# ===================================================================

class TestOllamaAgent:
    """OllamaAgent is a valid AgentInterface implementation."""

    def test_is_subclass_of_agent_interface(self):
        assert issubclass(OllamaAgent, AgentInterface)

    def test_can_instantiate(self, ollama_config):
        agent = OllamaAgent(ollama_config)
        assert isinstance(agent, AgentInterface)
        assert agent.config == ollama_config

    def test_stores_config_fields(self, ollama_config):
        agent = OllamaAgent(ollama_config)
        assert agent._endpoint == "http://localhost:11434"
        assert agent._model == "llava:13b"
        assert agent._timeout == 30

    def test_health_check_returns_error_when_not_running(self, ollama_config):
        """health_check handles connection errors gracefully."""
        agent = OllamaAgent(ollama_config)
        result = agent.health_check()
        assert result["status"] == "error"
        assert result["agent_type"] == "ollama"
        assert "error" in result

    def test_detect_objects_handles_connection_error(self, ollama_config):
        """detect_objects returns empty detections on connection failure."""
        agent = OllamaAgent(ollama_config)
        results = agent.detect_objects(
            images=[b"fake-image-data"],
            metadata=[{"filename": "test.jpg"}],
        )
        assert len(results) == 1
        assert results[0]["image_filename"] == "test.jpg"
        assert results[0]["detections"] == []

    def test_generate_manipulation_handles_connection_error(self, ollama_config):
        """generate_manipulation returns empty list on connection failure."""
        agent = OllamaAgent(ollama_config)
        results = agent.generate_manipulation(
            prompt="Make it safer",
            block_model={"blocks": []},
            rules=[],
        )
        assert results == []


# ===================================================================
# Task 2.3 — GeminiAgent implements AgentInterface
# ===================================================================

class TestGeminiAgent:
    """GeminiAgent is a valid AgentInterface implementation."""

    def test_is_subclass_of_agent_interface(self):
        assert issubclass(GeminiAgent, AgentInterface)

    def test_can_instantiate_with_api_key(self, gemini_config):
        agent = GeminiAgent(gemini_config)
        assert isinstance(agent, AgentInterface)
        assert agent.config == gemini_config

    def test_requires_api_key(self):
        """GeminiAgent raises ValueError if api_key is missing."""
        config = AgentConfig(
            agent_type=AgentType.GEMINI,
            model_name="gemini-1.5-flash",
            endpoint="https://generativelanguage.googleapis.com",
            api_key=None,
        )
        with pytest.raises(ValueError, match="api_key"):
            GeminiAgent(config)

    def test_stores_config_fields(self, gemini_config):
        agent = GeminiAgent(gemini_config)
        assert agent._model == "gemini-1.5-flash"
        assert agent._api_key == "test-api-key-12345"

    def test_health_check_handles_connection_error(self, gemini_config):
        """health_check handles connection errors gracefully."""
        # Point to a non-existent endpoint to trigger connection error
        gemini_config.endpoint = "http://localhost:1"
        agent = GeminiAgent(gemini_config)
        result = agent.health_check()
        assert result["status"] == "error"
        assert result["agent_type"] == "gemini"

    def test_detect_objects_handles_connection_error(self, gemini_config):
        """detect_objects returns empty detections on connection failure."""
        gemini_config.endpoint = "http://localhost:1"
        agent = GeminiAgent(gemini_config)
        results = agent.detect_objects(
            images=[b"fake-image-data"],
            metadata=[{"filename": "test.jpg"}],
        )
        assert len(results) == 1
        assert results[0]["image_filename"] == "test.jpg"
        assert results[0]["detections"] == []


# ===================================================================
# Task 2.4 — CustomAgent loader
# ===================================================================

class TestCustomAgent:
    """Custom agent loader dynamically imports user-provided modules."""

    def test_loads_valid_agent(self, custom_config):
        """Successfully loads a class that implements AgentInterface."""
        agent = load_custom_agent(custom_config)
        assert isinstance(agent, AgentInterface)
        assert isinstance(agent, StubAgent)

    def test_rejects_non_dotted_path(self):
        """Raises ValueError for a model_name without a dot."""
        config = AgentConfig(
            agent_type=AgentType.CUSTOM,
            model_name="NoDotsHere",
            endpoint="",
        )
        with pytest.raises(ValueError, match="dotted path"):
            load_custom_agent(config)

    def test_rejects_missing_module(self):
        """Raises ImportError for a module that doesn't exist."""
        config = AgentConfig(
            agent_type=AgentType.CUSTOM,
            model_name="nonexistent_module.MyAgent",
            endpoint="",
        )
        with pytest.raises(ImportError, match="nonexistent_module"):
            load_custom_agent(config)

    def test_rejects_missing_class(self):
        """Raises ImportError when the module exists but class doesn't."""
        config = AgentConfig(
            agent_type=AgentType.CUSTOM,
            model_name="tests.test_agents.NonExistentClass",
            endpoint="",
        )
        with pytest.raises(ImportError, match="NonExistentClass"):
            load_custom_agent(config)

    def test_rejects_non_agent_class(self):
        """Raises TypeError when the class doesn't implement AgentInterface."""
        config = AgentConfig(
            agent_type=AgentType.CUSTOM,
            model_name="tests.test_agents.NotAnAgent",
            endpoint="",
        )
        with pytest.raises(TypeError, match="not a subclass of AgentInterface"):
            load_custom_agent(config)


# ===================================================================
# Task 2.5 — AgentConfig JSON loader
# ===================================================================

class TestAgentConfigLoader:
    """Agent config loading and validation."""

    def test_loads_valid_config(self, tmp_path):
        """Loads a valid agent_config.json file."""
        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "ollama",
            "model_name": "llava:13b",
            "endpoint": "http://localhost:11434",
        }))
        result = load_agent_config(config_file)
        assert result is not None
        assert result.agent_type == AgentType.OLLAMA
        assert result.model_name == "llava:13b"

    def test_returns_none_for_missing_file(self, tmp_path):
        """Returns None when the config file doesn't exist."""
        result = load_agent_config(tmp_path / "nonexistent.json")
        assert result is None

    def test_returns_none_for_invalid_json(self, tmp_path):
        """Returns None when the file contains invalid JSON."""
        config_file = tmp_path / "agent_config.json"
        config_file.write_text("not valid json {{{")
        result = load_agent_config(config_file)
        assert result is None

    def test_returns_none_for_invalid_schema(self, tmp_path):
        """Returns None when JSON doesn't match AgentConfig schema."""
        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "invalid_type",
            "model_name": "test",
            "endpoint": "http://localhost",
        }))
        result = load_agent_config(config_file)
        assert result is None

    def test_loads_gemini_config(self, tmp_path):
        """Loads a Gemini config with api_key."""
        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "gemini",
            "model_name": "gemini-1.5-flash",
            "endpoint": "https://generativelanguage.googleapis.com",
            "api_key": "my-key",
        }))
        result = load_agent_config(config_file)
        assert result is not None
        assert result.agent_type == AgentType.GEMINI
        assert result.api_key == "my-key"

    def test_loads_custom_config(self, tmp_path):
        """Loads a custom agent config."""
        config_file = tmp_path / "agent_config.json"
        config_file.write_text(json.dumps({
            "agent_type": "custom",
            "model_name": "my_module.MyAgent",
            "endpoint": "",
        }))
        result = load_agent_config(config_file)
        assert result is not None
        assert result.agent_type == AgentType.CUSTOM
        assert result.model_name == "my_module.MyAgent"


# ===================================================================
# Task 2.6 — Agent factory / swap logic
# ===================================================================

class TestAgentFactory:
    """Agent factory creates the correct agent type."""

    def test_creates_ollama_agent(self, ollama_config):
        agent = create_agent(ollama_config)
        assert isinstance(agent, OllamaAgent)
        assert isinstance(agent, AgentInterface)

    def test_creates_gemini_agent(self, gemini_config):
        agent = create_agent(gemini_config)
        assert isinstance(agent, GeminiAgent)
        assert isinstance(agent, AgentInterface)

    def test_creates_custom_agent(self, custom_config):
        agent = create_agent(custom_config)
        assert isinstance(agent, StubAgent)
        assert isinstance(agent, AgentInterface)

    def test_returns_none_on_failure(self):
        """Returns None (doesn't crash) when agent instantiation fails."""
        config = AgentConfig(
            agent_type=AgentType.GEMINI,
            model_name="gemini-1.5-flash",
            endpoint="https://generativelanguage.googleapis.com",
            api_key=None,  # Missing key → GeminiAgent raises ValueError
        )
        agent = create_agent(config)
        assert agent is None

    def test_returns_none_for_bad_custom_module(self):
        """Returns None when custom module can't be loaded."""
        config = AgentConfig(
            agent_type=AgentType.CUSTOM,
            model_name="nonexistent.Agent",
            endpoint="",
        )
        agent = create_agent(config)
        assert agent is None

    def test_agent_injected_into_api_server(self, client):
        """After startup, the agent is available in api_server module."""
        from room_vision_ai import api_server
        # The default config is ollama, so _agent should be an OllamaAgent
        # (or None if Ollama isn't running — but the object should be created)
        assert api_server._agent_config is not None
        assert api_server._agent is not None
        assert isinstance(api_server._agent, AgentInterface)
