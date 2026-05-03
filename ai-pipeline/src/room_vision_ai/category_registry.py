# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""Category and rule loading/serving from core + plugins."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("room_vision_ai")


class CategoryRegistry:
    """Loads and serves Object_Category entries and manipulation rules.

    At startup the registry loads the core definitions from
    ``plugins/core/categories.json`` and ``plugins/core/rules.json``.
    Plugin contributions are merged in later via :meth:`add_categories`
    and :meth:`add_rules`.
    """

    def __init__(self) -> None:
        self._categories: dict[str, dict[str, Any]] = {}
        self._rules: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Loading helpers
    # ------------------------------------------------------------------

    def load_core(self, plugins_dir: Path) -> None:
        """Load core categories and rules from the *plugins/core/* directory.

        Parameters
        ----------
        plugins_dir : Path
            Path to the ``plugins/`` directory (e.g. ``<project_root>/plugins``).
        """
        categories_path = plugins_dir / "core" / "categories.json"
        rules_path = plugins_dir / "core" / "rules.json"

        if categories_path.exists():
            try:
                data = json.loads(categories_path.read_text(encoding="utf-8"))
                for cat in data.get("categories", []):
                    self._categories[cat["id"]] = cat
                logger.info(
                    "Loaded %d core categories from %s",
                    len(data.get("categories", [])),
                    categories_path,
                )
            except Exception:
                logger.exception("Failed to load core categories from %s", categories_path)
        else:
            logger.warning("Core categories file not found: %s", categories_path)

        if rules_path.exists():
            try:
                data = json.loads(rules_path.read_text(encoding="utf-8"))
                for rule in data.get("rules", []):
                    self._rules[rule["id"]] = rule
                logger.info(
                    "Loaded %d core rules from %s",
                    len(data.get("rules", [])),
                    rules_path,
                )
            except Exception:
                logger.exception("Failed to load core rules from %s", rules_path)
        else:
            logger.warning("Core rules file not found: %s", rules_path)

    # ------------------------------------------------------------------
    # Query methods
    # ------------------------------------------------------------------

    def get_categories(self) -> list[dict[str, Any]]:
        """Return all registered categories as a list of dicts."""
        return list(self._categories.values())

    def get_rules(self) -> list[dict[str, Any]]:
        """Return all registered rules as a list of dicts."""
        return list(self._rules.values())

    def get_category(self, category_id: str) -> dict[str, Any] | None:
        """Return a single category by *id*, or ``None`` if not found."""
        return self._categories.get(category_id)

    def get_rule(self, rule_id: str) -> dict[str, Any] | None:
        """Return a single rule by *id*, or ``None`` if not found."""
        return self._rules.get(rule_id)

    def get_rules_for_intent(self, intent: str) -> list[dict[str, Any]]:
        """Return all rules whose ``applies_to`` list contains *intent*."""
        return [
            rule for rule in self._rules.values()
            if intent in rule.get("applies_to", [])
        ]

    def has_category(self, category_id: str) -> bool:
        """Return ``True`` if a category with the given *id* is registered."""
        return category_id in self._categories

    # ------------------------------------------------------------------
    # Mutation methods (used by PluginManager during merging)
    # ------------------------------------------------------------------

    def add_categories(self, categories: list[dict[str, Any]]) -> None:
        """Merge additional categories into the registry.

        Each category dict must have at least an ``id`` key.
        """
        for cat in categories:
            cat_id = cat.get("id")
            if cat_id:
                self._categories[cat_id] = cat
            else:
                logger.warning("Skipping category without id: %s", cat)

    def add_rules(self, rules: list[dict[str, Any]]) -> None:
        """Merge additional rules into the registry.

        Each rule dict must have at least an ``id`` key.
        """
        for rule in rules:
            rule_id = rule.get("id")
            if rule_id:
                self._rules[rule_id] = rule
            else:
                logger.warning("Skipping rule without id: %s", rule)
