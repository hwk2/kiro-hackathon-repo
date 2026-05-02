"""
Abstract AI Agent Interface — all agents (Ollama, Gemini, custom) must implement this.
"""

from abc import ABC, abstractmethod
from typing import List


class AgentInterface(ABC):
    """Abstract interface for swappable AI agents."""

    @abstractmethod
    def detect_objects(self, images: List[bytes], metadata: List[dict]) -> List[dict]:
        """Detect objects in room images. Returns list of DetectionResult dicts."""
        pass

    @abstractmethod
    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        """Generate 2-5 ResponseOption dicts for a manipulation prompt."""
        pass

    @abstractmethod
    def health_check(self) -> dict:
        """Return agent status information."""
        pass
