"""
AI Pipeline Client — HTTP client for the localhost REST API (port 8321).
Endpoints: GET /health, POST /detect, POST /manipulate, GET /categories, GET /rules
"""

AI_PIPELINE_BASE = "http://localhost:8321/api/v1"

# TODO: Implement health check polling
# TODO: Implement detect request (multipart/form-data with images + metadata)
# TODO: Implement manipulate request (JSON with prompt + block_model)
# TODO: Implement image queue for when AI Pipeline is unreachable
