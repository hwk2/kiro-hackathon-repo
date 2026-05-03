# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Ollama agent adapter — communicates with a local Ollama instance.

Ollama is a free, open-source local LLM runner. Users must install Ollama
and pull a vision model (e.g. ``ollama pull llava:13b``) before using this
agent.

See https://ollama.com/ for installation instructions.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, List

import httpx

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.models import AgentConfig

logger = logging.getLogger("room_vision_ai.agents.ollama")

# Default system prompt for object detection
_DETECT_SYSTEM_PROMPT = (
    "You are a room object detection assistant. Analyze the provided room image "
    "and identify all objects present. For each object, provide:\n"
    "- category: one of the known categories (light_fixture, wall_fixture, "
    "power_outlet, light_switch, stairs, handrail, door_handle, door, window, "
    "window_lock, furniture, rug, cord_cable, smoke_detector, fire_extinguisher, "
    "sharp_edge_furniture) or a descriptive category if none match.\n"
    "- confidence_score: a float between 0.0 and 1.0\n"
    "- bounding_box: with x_min, y_min, x_max, y_max in pixels\n\n"
    "Respond ONLY with a JSON array of detection objects. Example:\n"
    '[{"category": "power_outlet", "confidence_score": 0.87, '
    '"bounding_box": {"x_min": 120, "y_min": 450, "x_max": 180, "y_max": 530}}]'
)

_MANIPULATE_SYSTEM_PROMPT = (
    "You are a room safety and accessibility assistant. Given a room's 3D block "
    "model and a set of safety/manipulation rules, generate response options for "
    "the user's prompt. Each option should describe changes to the room and "
    "include the modified block model.\n\n"
    "Respond ONLY with a JSON array of response option objects. Each must have:\n"
    "- option_index: integer starting from 0\n"
    "- description: text describing the changes\n"
    "- rules_applied: list of rule IDs that were applied\n"
    "- block_model: the modified block model dict\n"
)


class OllamaAgent(AgentInterface):
    """Agent adapter for Ollama local models.

    Communicates with the Ollama HTTP API (default: ``http://localhost:11434``)
    using ``httpx``. Requires Ollama to be running and the configured model
    to be pulled.
    """

    def __init__(self, config: AgentConfig) -> None:
        super().__init__(config)
        self._endpoint = config.endpoint.rstrip("/")
        self._model = config.model_name
        self._timeout = config.timeout_seconds
        self._max_retries = config.max_retries

    # ------------------------------------------------------------------
    # AgentInterface implementation
    # ------------------------------------------------------------------

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        """Send images to Ollama vision model for object detection."""
        results: List[dict] = []

        for idx, image_bytes in enumerate(images):
            image_meta = metadata[idx] if idx < len(metadata) else {}
            filename = image_meta.get("filename", f"image_{idx}")

            try:
                raw_response = self._generate_with_image(
                    prompt=_DETECT_SYSTEM_PROMPT,
                    image_bytes=image_bytes,
                )
                detections = self._parse_json_response(raw_response)
                if not isinstance(detections, list):
                    detections = []
            except Exception:
                logger.exception(
                    "Ollama detection failed for %s", filename
                )
                detections = []

            results.append({
                "image_filename": filename,
                "detections": detections,
            })

        return results

    def generate_manipulation(
        self, prompt: str, block_model: dict, rules: List[dict]
    ) -> List[dict]:
        """Send manipulation prompt to Ollama and parse response options."""
        context = (
            f"{_MANIPULATE_SYSTEM_PROMPT}\n\n"
            f"Current block model:\n{json.dumps(block_model, default=str)}\n\n"
            f"Applicable rules:\n{json.dumps(rules, default=str)}\n\n"
            f"User prompt: {prompt}"
        )

        try:
            raw_response = self._generate(context)
            options = self._parse_json_response(raw_response)
            if not isinstance(options, list):
                options = []
        except Exception:
            logger.exception("Ollama manipulation generation failed")
            options = []

        return options

    def health_check(self) -> dict:
        """Check if Ollama is running and the model is available."""
        try:
            with httpx.Client(timeout=10) as client:
                # Ollama exposes GET / or GET /api/tags
                resp = client.get(f"{self._endpoint}/api/tags")
                resp.raise_for_status()
                data = resp.json()

            models = [m.get("name", "") for m in data.get("models", [])]
            # Check if configured model is available (handle tag variants)
            model_available = any(
                self._model in m or m.startswith(self._model.split(":")[0])
                for m in models
            )

            return {
                "status": "ok" if model_available else "model_not_found",
                "agent_type": "ollama",
                "endpoint": self._endpoint,
                "model": self._model,
                "model_available": model_available,
                "available_models": models,
            }
        except httpx.ConnectError:
            return {
                "status": "error",
                "agent_type": "ollama",
                "endpoint": self._endpoint,
                "model": self._model,
                "error": "Cannot connect to Ollama. Is it running?",
            }
        except Exception as exc:
            return {
                "status": "error",
                "agent_type": "ollama",
                "endpoint": self._endpoint,
                "model": self._model,
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_with_image(self, prompt: str, image_bytes: bytes) -> str:
        """Call Ollama /api/generate with an image (vision model)."""
        b64_image = base64.b64encode(image_bytes).decode("ascii")

        payload: dict[str, Any] = {
            "model": self._model,
            "prompt": prompt,
            "images": [b64_image],
            "stream": False,
        }

        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                f"{self._endpoint}/api/generate",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json().get("response", "")

    def _generate(self, prompt: str) -> str:
        """Call Ollama /api/generate (text-only)."""
        payload: dict[str, Any] = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
        }

        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                f"{self._endpoint}/api/generate",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json().get("response", "")

    @staticmethod
    def _parse_json_response(raw: str) -> Any:
        """Extract and parse JSON from an LLM response string.

        The model may wrap JSON in markdown code fences — this helper
        strips them before parsing.
        """
        text = raw.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json or ```) and last line (```)
            lines = [
                ln for ln in lines
                if not ln.strip().startswith("```")
            ]
            text = "\n".join(lines).strip()

        return json.loads(text)
