# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Tests for CategoryRegistry, PluginManager, and /categories + /rules endpoints."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.plugin_manager import PluginManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_PLUGINS_DIR = _PROJECT_ROOT / "plugins"


@pytest.fixture
def registry() -> CategoryRegistry:
    """Return a CategoryRegistry loaded with core data."""
    reg = CategoryRegistry()
    reg.load_core(_PLUGINS_DIR)
    return reg


# ---------------------------------------------------------------------------
# 3.1 / 3.3  Core categories load correctly
# ---------------------------------------------------------------------------


def test_core_categories_count(registry: CategoryRegistry):
    """16 built-in categories are loaded from categories.json."""
    assert len(registry.get_categories()) == 16


def test_core_categories_ids(registry: CategoryRegistry):
    """All 16 expected category ids are present."""
    expected_ids = {
        "light_fixture", "wall_fixture", "power_outlet", "light_switch",
        "stairs", "handrail", "door_handle", "door", "window",
        "window_lock", "furniture", "rug", "cord_cable",
        "smoke_detector", "fire_extinguisher", "sharp_edge_furniture",
    }
    actual_ids = {c["id"] for c in registry.get_categories()}
    assert actual_ids == expected_ids


# ---------------------------------------------------------------------------
# 3.2 / 3.3  Core rules load correctly
# ---------------------------------------------------------------------------


def test_core_rules_count(registry: CategoryRegistry):
    """8 built-in rules are loaded from rules.json."""
    assert len(registry.get_rules()) == 8


def test_core_rules_ids(registry: CategoryRegistry):
    """All 8 expected rule ids are present."""
    expected_ids = {
        "cover_outlets", "corner_guards", "child_gate_stairs",
        "secure_heavy_objects", "add_handrails", "ensure_lighting",
        "remove_trip_hazards", "widen_pathways",
    }
    actual_ids = {r["id"] for r in registry.get_rules()}
    assert actual_ids == expected_ids


# ---------------------------------------------------------------------------
# 3.3  get_category() returns correct category
# ---------------------------------------------------------------------------


def test_get_category_found(registry: CategoryRegistry):
    """get_category returns the correct dict for a known id."""
    cat = registry.get_category("power_outlet")
    assert cat is not None
    assert cat["id"] == "power_outlet"
    assert cat["label"] == "Power Outlet"
    assert "child_hazard" in cat["safety_tags"]
    assert "electrical" in cat["safety_tags"]
    assert cat["source"] == "core"


def test_get_category_not_found(registry: CategoryRegistry):
    """get_category returns None for an unknown id."""
    assert registry.get_category("nonexistent") is None


# ---------------------------------------------------------------------------
# 3.3  get_rules_for_intent
# ---------------------------------------------------------------------------


def test_get_rules_for_intent_child_safety(registry: CategoryRegistry):
    """get_rules_for_intent('child_safety') returns the 4 child safety rules."""
    rules = registry.get_rules_for_intent("child_safety")
    ids = {r["id"] for r in rules}
    assert ids == {
        "cover_outlets", "corner_guards", "child_gate_stairs",
        "secure_heavy_objects",
    }


def test_get_rules_for_intent_elderly(registry: CategoryRegistry):
    """get_rules_for_intent('elderly_accessibility') returns the 4 elderly rules."""
    rules = registry.get_rules_for_intent("elderly_accessibility")
    ids = {r["id"] for r in rules}
    assert ids == {
        "add_handrails", "ensure_lighting", "remove_trip_hazards",
        "widen_pathways",
    }


def test_get_rules_for_intent_unknown(registry: CategoryRegistry):
    """get_rules_for_intent with an unknown intent returns an empty list."""
    assert registry.get_rules_for_intent("unknown_intent") == []


# ---------------------------------------------------------------------------
# 3.3  has_category
# ---------------------------------------------------------------------------


def test_has_category_true(registry: CategoryRegistry):
    assert registry.has_category("stairs") is True


def test_has_category_false(registry: CategoryRegistry):
    assert registry.has_category("nonexistent") is False


# ---------------------------------------------------------------------------
# 3.5 / 3.6 / 3.7  Plugin loading and merging
# ---------------------------------------------------------------------------


@pytest.fixture
def plugin_dir(tmp_path: Path) -> Path:
    """Create a temporary plugins directory with a valid test plugin."""
    plugins = tmp_path / "plugins"
    core = plugins / "core"
    core.mkdir(parents=True)
    installed = plugins / "installed"
    installed.mkdir()

    # Minimal core files
    (core / "categories.json").write_text(json.dumps({"categories": [
        {"id": "door", "label": "Door", "safety_tags": ["structural"], "source": "core"},
    ]}))
    (core / "rules.json").write_text(json.dumps({"rules": [
        {"id": "cover_outlets", "label": "Cover Power Outlets",
         "applies_to": ["child_safety"], "target_categories": ["power_outlet"], "source": "core"},
    ]}))

    # Valid plugin
    valid_plugin = installed / "test-plugin"
    valid_plugin.mkdir()
    (valid_plugin / "manifest.json").write_text(json.dumps({
        "plugin_id": "test-plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "author": "Tester",
        "categories": [
            {"id": "baby_monitor", "label": "Baby Monitor", "safety_tags": ["child_safety"]}
        ],
        "rules": [
            {"id": "secure_baby_monitor", "label": "Secure Baby Monitor",
             "applies_to": ["child_safety"], "target_categories": ["baby_monitor"]}
        ],
    }))

    return plugins


def test_plugin_scan_and_merge(plugin_dir: Path):
    """PluginManager scans, validates, and merges a valid plugin."""
    reg = CategoryRegistry()
    reg.load_core(plugin_dir)

    mgr = PluginManager(plugin_dir)
    mgr.scan()
    merged = mgr.merge_into(reg)

    assert merged == 1
    assert reg.has_category("baby_monitor")
    cat = reg.get_category("baby_monitor")
    assert cat["source"] == "plugin"
    assert cat["label"] == "Baby Monitor"

    rule = reg.get_rule("secure_baby_monitor")
    assert rule is not None
    assert rule["source"] == "plugin"


# ---------------------------------------------------------------------------
# 3.8  Invalid plugin handling
# ---------------------------------------------------------------------------


@pytest.fixture
def bad_plugin_dir(tmp_path: Path) -> Path:
    """Create a plugins directory with invalid plugins."""
    plugins = tmp_path / "plugins"
    core = plugins / "core"
    core.mkdir(parents=True)
    installed = plugins / "installed"
    installed.mkdir()

    (core / "categories.json").write_text(json.dumps({"categories": []}))
    (core / "rules.json").write_text(json.dumps({"rules": []}))

    # Malformed JSON
    bad_json = installed / "bad-json"
    bad_json.mkdir()
    (bad_json / "manifest.json").write_text("{not valid json!!!")

    # Missing required fields
    bad_fields = installed / "bad-fields"
    bad_fields.mkdir()
    (bad_fields / "manifest.json").write_text(json.dumps({
        "plugin_id": "bad-fields",
        # missing name, version, author
    }))

    # Valid plugin alongside bad ones
    good = installed / "good-plugin"
    good.mkdir()
    (good / "manifest.json").write_text(json.dumps({
        "plugin_id": "good-plugin",
        "name": "Good Plugin",
        "version": "1.0.0",
        "author": "Tester",
    }))

    return plugins


def test_invalid_plugins_skipped(bad_plugin_dir: Path, caplog):
    """Invalid plugins are skipped with warnings; valid ones still load."""
    mgr = PluginManager(bad_plugin_dir)
    with caplog.at_level(logging.WARNING):
        manifests = mgr.scan()

    # Only the good plugin should load
    assert len(manifests) == 1
    assert manifests[0].plugin_id == "good-plugin"

    # Warnings should mention the bad plugins
    warning_text = caplog.text
    assert "bad-json" in warning_text
    assert "bad-fields" in warning_text


# ---------------------------------------------------------------------------
# 3.9  GET /categories endpoint
# ---------------------------------------------------------------------------


def test_get_categories_endpoint(client):
    """GET /categories returns all registered categories."""
    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    categories = data["categories"]
    assert len(categories) == 16
    ids = {c["id"] for c in categories}
    assert "power_outlet" in ids
    assert "stairs" in ids
    # Verify structure
    sample = next(c for c in categories if c["id"] == "power_outlet")
    assert "label" in sample
    assert "safety_tags" in sample
    assert "source" in sample


# ---------------------------------------------------------------------------
# 3.10  GET /rules endpoint
# ---------------------------------------------------------------------------


def test_get_rules_endpoint(client):
    """GET /rules returns all registered manipulation rules."""
    response = client.get("/api/v1/rules")
    assert response.status_code == 200
    data = response.json()
    assert "rules" in data
    rules = data["rules"]
    assert len(rules) == 8
    ids = {r["id"] for r in rules}
    assert "cover_outlets" in ids
    assert "add_handrails" in ids
    # Verify structure
    sample = next(r for r in rules if r["id"] == "cover_outlets")
    assert "label" in sample
    assert "applies_to" in sample
    assert "target_categories" in sample
    assert "source" in sample
