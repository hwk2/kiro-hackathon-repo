# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Gemini agent adapter — communicates with the Google Gemini API.

**Users are responsible for their own Gemini API usage and costs.**

This agent requires a valid Gemini API key configured in ``agent_config.json``.
Get a key at https://aistudio.google.com/apikey

The free tier has rate limits. See Google's documentation for current quotas.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, List

import httpx

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.models import AgentConfig

logger = logging.getLogger("room_vision_ai.agents.gemini")

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


class GeminiAgent(AgentInterface):
    """Agent adapter for Google Gemini API.

    **Users are responsible for their own Gemini API usage and costs.**

    Communicates with the Gemini REST API using ``httpx``. Requires a valid
    API key set in ``agent_config.json``.
    """

    def __init__(self, config: AgentConfig) -> None:
        super().__init__(config)
        self._endpoint = config.endpoint.rstrip("/")
        self._model = config.model_name
        self._api_key = config.api_key
        self._timeout = config.timeout_seconds
        self._max_retries = config.max_retries

        if not self._api_key:
            raise ValueError(
                "GeminiAgent requires an api_key in agent_config.json. "
                "Get one at https://aistudio.google.com/apikey — "
                "you are responsible for your own API usage and costs."
            )

    # ------------------------------------------------------------------
    # AgentInterface implementation
    # ------------------------------------------------------------------

    def detect_objects(
        self, images: List[bytes], metadata: List[dict]
    ) -> List[dict]:
        """Send images to Gemini vision model for object detection."""
        results: List[dict] = []

        for idx, image_bytes in enumerate(images):
            image_meta = metadata[idx] if idx < len(metadata) else {}
            filename = image_meta.get("filename", f"image_{idx}")
            mime_type = self._mime_type_from_meta(image_meta)

            try:
                raw_response = self._generate_with_image(
                    text_prompt=_DETECT_SYSTEM_PROMPT,
                    image_bytes=image_bytes,
                    mime_type=mime_type,
                )
                detections = self._parse_json_response(raw_response)
                if not isinstance(detections, list):
                    detections = []
            except Exception:
                logger.exception(
                    "Gemini detection failed for %s", filename
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
        """Send manipulation prompt to Gemini and parse response options."""
        context = (
            f"{_MANIPULATE_SYSTEM_PROMPT}\n\n"
            f"Current block model:\n{json.dumps(block_model, default=str)}\n\n"
            f"Applicable rules:\n{json.dumps(rules, default=str)}\n\n"
            f"User prompt: {prompt}"
        )

        try:
            raw_response = self._generate_text(context)
            options = self._parse_json_response(raw_response)
            if not isinstance(options, list):
                options = []
        except Exception:
            logger.exception("Gemini manipulation generation failed")
            options = []

        return options

    def health_check(self) -> dict:
        """Verify API key is valid and model is accessible."""
        try:
            url = (
                f"{self._endpoint}/v1beta/models/{self._model}"
                f"?key={self._api_key}"
            )
            with httpx.Client(timeout=10) as client:
                resp = client.get(url)

            if resp.status_code == 200:
                return {
                    "status": "ok",
                    "agent_type": "gemini",
                    "model": self._model,
                    "endpoint": self._endpoint,
                }
            elif resp.status_code == 403:
                return {
                    "status": "error",
                    "agent_type": "gemini",
                    "model": self._model,
                    "error": "Invalid or expired API key.",
                }
            elif resp.status_code == 429:
                return {
                    "status": "error",
                    "agent_type": "gemini",
                    "model": self._model,
                    "error": "Rate limit exceeded. Try again later.",
                }
            else:
                return {
                    "status": "error",
                    "agent_type": "gemini",
                    "model": self._model,
                    "error": f"Unexpected status {resp.status_code}: {resp.text[:200]}",
                }
        except httpx.ConnectError:
            return {
                "status": "error",
                "agent_type": "gemini",
                "error": "Cannot connect to Gemini API endpoint.",
            }
        except Exception as exc:
            return {
                "status": "error",
                "agent_type": "gemini",
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_with_image(
        self, text_prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg"
    ) -> str:
        """Call Gemini generateContent with text + inline image."""
        b64_image = base64.b64encode(image_bytes).decode("ascii")

        payload: dict[str, Any] = {
            "contents": [
                {
                    "parts": [
                        {"text": text_prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ]
        }

        url = (
            f"{self._endpoint}/v1beta/models/{self._model}:generateContent"
            f"?key={self._api_key}"
        )

        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()

        return self._extract_text_from_response(resp.json())

    def _generate_text(self, prompt: str) -> str:
        """Call Gemini generateContent with text only."""
        payload: dict[str, Any] = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ]
        }

        url = (
            f"{self._endpoint}/v1beta/models/{self._model}:generateContent"
            f"?key={self._api_key}"
        )

        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()

        return self._extract_text_from_response(resp.json())

    @staticmethod
    def _extract_text_from_response(data: dict) -> str:
        """Extract text content from Gemini API response."""
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        except (IndexError, KeyError, TypeError):
            return ""

    @staticmethod
    def _mime_type_from_meta(meta: dict) -> str:
        """Derive MIME type from image metadata."""
        fmt = meta.get("format", "jpeg").lower()
        mapping = {
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "heic": "image/heic",
        }
        return mapping.get(fmt, "image/jpeg")

    @staticmethod
    def _parse_json_response(raw: str) -> Any:
        """Extract and parse JSON from an LLM response string."""
        text = raw.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [
                ln for ln in lines
                if not ln.strip().startswith("```")
            ]
            text = "\n".join(lines).strip()

        return json.loads(text)
