# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Plugin discovery, validation, and merging."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.models import PluginManifest

logger = logging.getLogger("room_vision_ai")


class PluginManager:
    """Scans the ``plugins/installed/`` directory for plugin manifests,
    validates them, and merges their contributions into a
    :class:`CategoryRegistry`.

    Parameters
    ----------
    plugins_dir : Path
        Path to the ``plugins/`` directory (e.g. ``<project_root>/plugins``).
    """

    def __init__(self, plugins_dir: Path) -> None:
        self._plugins_dir = plugins_dir
        self._installed_dir = plugins_dir / "installed"
        self._manifests: list[PluginManifest] = []

    # ------------------------------------------------------------------
    # Discovery & validation
    # ------------------------------------------------------------------

    def scan(self) -> list[PluginManifest]:
        """Scan ``plugins/installed/`` for subdirectories containing
        ``manifest.json``, validate each manifest, and return the list
        of successfully loaded :class:`PluginManifest` objects.

        Invalid manifests are skipped with a logged warning — the
        application never crashes due to a bad plugin.
        """
        self._manifests = []

        if not self._installed_dir.is_dir():
            logger.info("No installed plugins directory at %s", self._installed_dir)
            return self._manifests

        for child in sorted(self._installed_dir.iterdir()):
            if not child.is_dir():
                continue

            manifest_path = child / "manifest.json"
            if not manifest_path.exists():
                continue

            try:
                raw = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest = PluginManifest(**raw)
                self._manifests.append(manifest)
                logger.info(
                    "Loaded plugin '%s' v%s by %s from %s",
                    manifest.name,
                    manifest.version,
                    manifest.author,
                    child.name,
                )
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Skipping plugin in '%s': malformed manifest.json — %s",
                    child.name,
                    exc,
                )
            except ValidationError as exc:
                logger.warning(
                    "Skipping plugin in '%s': manifest validation failed — %s",
                    child.name,
                    exc,
                )
            except Exception as exc:
                logger.warning(
                    "Skipping plugin in '%s': unexpected error — %s",
                    child.name,
                    exc,
                )

        return self._manifests

    @property
    def manifests(self) -> list[PluginManifest]:
        """Return the list of successfully loaded manifests."""
        return list(self._manifests)

    # ------------------------------------------------------------------
    # Merging
    # ------------------------------------------------------------------

    def merge_into(self, registry: CategoryRegistry) -> int:
        """Merge all loaded plugin categories and rules into *registry*.

        Returns the number of plugins whose contributions were merged.
        """
        count = 0
        for manifest in self._manifests:
            cats = [
                {
                    "id": c.id,
                    "label": c.label,
                    "safety_tags": c.safety_tags,
                    "source": "plugin",
                }
                for c in manifest.categories
            ]
            rules = [
                {
                    "id": r.id,
                    "label": r.label,
                    "applies_to": r.applies_to,
                    "target_categories": r.target_categories,
                    "source": "plugin",
                }
                for r in manifest.rules
            ]
            if cats:
                registry.add_categories(cats)
            if rules:
                registry.add_rules(rules)
            count += 1
        return count
