# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Abstract AI Agent Interface — all agents must implement this.

This module defines the contract that every AI agent adapter must satisfy.
The system supports three built-in agent types (Ollama, Gemini, Custom)
and users can add their own by implementing this interface.

**This project does NOT include any AI model or API keys.**
Users are responsible for their own AI agent setup, usage, and costs.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from room_vision_ai.models import AgentConfig


class AgentInterface(ABC):
    """Abstract interface for swappable AI agents.

    All agent implementations must subclass this and provide concrete
    implementations of ``detect_objects``, ``generate_manipulation``,
    and ``health_check``.

    Parameters
    ----------
    config : AgentConfig
        Agent configuration loaded from ``agent_config.json``.
    """

    def __init__(self, config: AgentConfig) -> None:
        self.config = config

    @abstractmethod
    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        """Detect objects in room images.

        Args:
            images: List of raw image bytes.
            metadata: List of ImageMetadata dicts (one per image).

        Returns:
            List of DetectionResult dicts, one per image.
        """
        pass

    @abstractmethod
    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        """Generate 2-5 response options for a manipulation prompt.

        Args:
            prompt: Natural language manipulation prompt.
            block_model: Current BlockModel dict.
            rules: Applicable manipulation rules from the CategoryRegistry.

        Returns:
            List of ResponseOption dicts (2-5 items).
        """
        pass

    @abstractmethod
    def health_check(self) -> dict:
        """Return agent status information.

        Returns:
            Dict with at least ``{"status": "ok"|"error", "agent_type": "...", ...}``.
        """
        pass
