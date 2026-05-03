# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for the GET /health endpoint."""


def test_health_returns_ok(client):
    """Health endpoint returns status ok with expected fields."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "agent" in data
    assert "version" in data
    assert "plugins_loaded" in data
    assert data["version"] == "1.0.0"


def test_health_agent_name_from_config(client):
    """Health endpoint reports the configured agent name."""
    response = client.get("/api/v1/health")
    data = response.json()
    # Default config is ollama with llava:13b
    assert data["agent"] == "ollama-llava:13b"


def test_health_plugins_loaded_is_int(client):
    """plugins_loaded is an integer >= 0."""
    response = client.get("/api/v1/health")
    data = response.json()
    assert isinstance(data["plugins_loaded"], int)
    assert data["plugins_loaded"] >= 0
