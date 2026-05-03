# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
FastAPI route definitions for the AI Pipeline REST API.

Base URL: http://localhost:8321/api/v1
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, List, Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from room_vision_ai import __version__
from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.feedback_store import FeedbackStore
from room_vision_ai.models import (
    AgentConfig,
    ErrorResponse,
    ManipulateRequest,
    TrainingFeedback,
)

if TYPE_CHECKING:
    from room_vision_ai.category_registry import CategoryRegistry
    from room_vision_ai.object_detector import ObjectDetector
    from room_vision_ai.prompt_processor import PromptProcessor

logger = logging.getLogger("room_vision_ai")

router = APIRouter(prefix="/api/v1")

# ---------------------------------------------------------------------------
# Module-level state (injected at startup from main.py)
# ---------------------------------------------------------------------------
_agent_config: AgentConfig | None = None
_plugins_loaded: int = 0
_agent: AgentInterface | None = None
_category_registry: CategoryRegistry | None = None
_object_detector: ObjectDetector | None = None
_prompt_processor: PromptProcessor | None = None
_feedback_store: FeedbackStore | None = None


def configure(
    agent_config: AgentConfig | None,
    plugins_loaded: int,
    agent: AgentInterface | None = None,
    category_registry: "CategoryRegistry | None" = None,
    object_detector: "ObjectDetector | None" = None,
    prompt_processor: "PromptProcessor | None" = None,
    feedback_store: FeedbackStore | None = None,
) -> None:
    """Called at startup to inject runtime state into the router module."""
    global _agent_config, _plugins_loaded, _agent, _category_registry
    global _object_detector, _prompt_processor, _feedback_store
    _agent_config = agent_config
    _plugins_loaded = plugins_loaded
    _agent = agent
    _category_registry = category_registry
    _object_detector = object_detector
    _prompt_processor = prompt_processor
    _feedback_store = feedback_store


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@router.get("/health")
async def health():
    """
    Health check endpoint.

    Returns agent name, version, and plugins loaded count.
    Works even before the full agent is configured — returns
    ``"no_agent"`` when no agent config is present.
    """
    if _agent_config is not None:
        agent_name = f"{_agent_config.agent_type.value}-{_agent_config.model_name}"
    else:
        agent_name = "no_agent"

    return {
        "status": "ok",
        "agent": agent_name,
        "version": __version__,
        "plugins_loaded": _plugins_loaded,
    }


# ---------------------------------------------------------------------------
# GET /categories
# ---------------------------------------------------------------------------

@router.get("/categories")
async def list_categories():
    """Return all registered object categories (core + plugins)."""
    if _category_registry is None:
        return {"categories": []}
    return {"categories": _category_registry.get_categories()}


# ---------------------------------------------------------------------------
# GET /rules
# ---------------------------------------------------------------------------

@router.get("/rules")
async def list_rules():
    """Return all registered manipulation rules (core + plugins)."""
    if _category_registry is None:
        return {"rules": []}
    return {"rules": _category_registry.get_rules()}


# ---------------------------------------------------------------------------
# POST /detect
# ---------------------------------------------------------------------------

@router.post("/detect")
async def detect(
    images: List[UploadFile] = File(...),
    metadata: str = Form(...),
):
    """Submit images for object detection and 3D model generation.

    Accepts multipart/form-data with:
    - ``images``: one or more image files (JPEG, PNG, HEIC)
    - ``metadata``: JSON string with session_id and image metadata list
    """
    # --- Check that an object detector is available ---
    if _object_detector is None or not _object_detector.has_agent:
        error = ErrorResponse(
            error="no_agent_configured",
            message="No AI agent is configured. Cannot perform object detection.",
            details=["Configure an agent in agent_config.json and restart the server."],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # --- Parse metadata JSON ---
    try:
        meta = json.loads(metadata)
    except json.JSONDecodeError as exc:
        error = ErrorResponse(
            error="invalid_metadata",
            message="The metadata field is not valid JSON.",
            details=[str(exc)],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    session_id = meta.get("session_id", str(uuid4()))
    image_meta_list: list[dict] = meta.get("images", [])

    # --- Read image bytes ---
    image_bytes_list: list[bytes] = []
    filenames: list[str] = []
    content_types: list[str | None] = []

    for upload in images:
        data = await upload.read()
        image_bytes_list.append(data)
        filenames.append(upload.filename or "unknown")
        content_types.append(upload.content_type)

    # --- Validate images (format + resolution) ---
    validation_errors = _object_detector.validate_images(
        image_bytes_list, filenames, content_types
    )
    if validation_errors:
        error = ErrorResponse(
            error="insufficient_image_quality",
            message="One or more images failed validation.",
            details=validation_errors,
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # --- Run detection ---
    try:
        detection_results, warnings = _object_detector.detect(
            image_bytes_list, image_meta_list
        )
    except Exception as exc:
        logger.exception("Object detection failed")
        # Distinguish "no agent" from general agent failures
        if "No AI agent configured" in str(exc):
            error = ErrorResponse(
                error="no_agent_configured",
                message=str(exc),
                details=[],
            )
        else:
            error = ErrorResponse(
                error="detection_failed",
                message="The AI agent could not process the images.",
                details=[str(exc)],
            )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # Log warnings for unknown categories
    for warning in warnings:
        logger.warning(warning)

    # --- Build block model and summary ---
    block_model = _object_detector.build_block_model(detection_results)
    summary = _object_detector.build_detection_summary(detection_results)

    return {
        "session_id": session_id,
        "block_model": block_model.model_dump(mode="json"),
        "detection_summary": summary.model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# POST /manipulate  (Task 6.1)
# ---------------------------------------------------------------------------

@router.post("/manipulate")
async def manipulate(request: ManipulateRequest):
    """Submit a manipulation prompt with the current BlockModel.

    Accepts JSON with ``session_id``, ``prompt``, and ``block_model``.
    Returns 2–5 response options, each containing a modified BlockModel
    and a description of the changes applied.
    """
    # --- Validate prompt (Task 6.9) ---
    if not request.prompt or not request.prompt.strip():
        error = ErrorResponse(
            error="invalid_prompt",
            message="The prompt field is empty or contains only whitespace.",
            details=["A non-empty manipulation prompt is required."],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # --- Ensure PromptProcessor is available ---
    if _prompt_processor is None:
        error = ErrorResponse(
            error="service_unavailable",
            message="Prompt processing is not available.",
            details=["The PromptProcessor has not been initialised."],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # --- Process the prompt ---
    try:
        options = _prompt_processor.process(
            prompt=request.prompt,
            block_model_dict=request.block_model,
        )
    except ValueError as exc:
        error = ErrorResponse(
            error="invalid_prompt",
            message=str(exc),
            details=["Could not interpret the manipulation prompt."],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))
    except Exception as exc:
        logger.exception("Prompt processing failed")
        error = ErrorResponse(
            error="processing_failed",
            message="An error occurred while processing the manipulation prompt.",
            details=[str(exc)],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    # --- Build response (Task 6.8) ---
    return {
        "session_id": str(request.session_id),
        "prompt": request.prompt,
        "response_options": [
            opt.model_dump(mode="json") for opt in options
        ],
    }


# ---------------------------------------------------------------------------
# POST /feedback  (Task 8.x)
# ---------------------------------------------------------------------------

@router.post("/feedback")
async def submit_feedback(feedback: TrainingFeedback):
    """Store training feedback locally.

    Accepts a TrainingFeedback JSON payload and persists it to the local
    filesystem via :class:`FeedbackStore`.  **No data is transmitted
    externally.**

    Returns the ``feedback_id`` of the stored entry.
    """
    if _feedback_store is None:
        error = ErrorResponse(
            error="service_unavailable",
            message="Feedback storage is not available.",
            details=["The FeedbackStore has not been initialised."],
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    try:
        feedback_id = _feedback_store.save(feedback)
    except Exception as exc:
        logger.exception("Failed to store feedback")
        error = ErrorResponse(
            error="storage_failed",
            message="Could not store the training feedback.",
            details=[str(exc)],
        )
        return JSONResponse(status_code=500, content=error.model_dump(mode="json"))

    return {"feedback_id": feedback_id}
