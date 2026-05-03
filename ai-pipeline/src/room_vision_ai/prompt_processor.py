# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Prompt parsing, intent detection, and response generation.

The :class:`PromptProcessor` interprets manipulation prompts, detects
user intent (child safety, elderly accessibility, general modification),
retrieves applicable rules from the :class:`CategoryRegistry`, and
generates 2–5 :class:`ResponseOption` entries — either via the
configured AI agent or purely from local safety rules.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.category_registry import CategoryRegistry
from room_vision_ai.models import (
    Block,
    BlockModel,
    ResponseOption,
)
from room_vision_ai.safety_rules import SAFETY_RULE_FUNCTIONS

logger = logging.getLogger("room_vision_ai")

# ---------------------------------------------------------------------------
# Intent keyword mapping  (Task 6.2)
# ---------------------------------------------------------------------------

INTENT_KEYWORDS: dict[str, list[str]] = {
    "child_safety": [
        "child", "toddler", "baby", "kid", "infant",
    ],
    "elderly_accessibility": [
        "elderly", "senior", "aging", "wheelchair", "accessible", "mobility",
    ],
}

# Minimum / maximum number of response options
MIN_OPTIONS = 2
MAX_OPTIONS = 5


class PromptProcessor:
    """Interprets manipulation prompts and generates response options.

    Parameters
    ----------
    agent : AgentInterface | None
        The configured AI agent.  When ``None`` the processor operates
        in *fallback mode* and generates options purely from safety rules.
    registry : CategoryRegistry
        The category/rule registry used to look up applicable rules.
    """

    def __init__(
        self,
        agent: AgentInterface | None,
        registry: CategoryRegistry,
    ) -> None:
        self._agent = agent
        self._registry = registry

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(
        self,
        prompt: str,
        block_model_dict: dict[str, Any],
    ) -> list[ResponseOption]:
        """Process a manipulation prompt and return response options.

        Parameters
        ----------
        prompt :
            The natural-language manipulation prompt.
        block_model_dict :
            The current BlockModel as a plain dict (from the API request).

        Returns
        -------
        list[ResponseOption]
            Between 2 and 5 response options, each containing a modified
            BlockModel and a description of the changes.

        Raises
        ------
        ValueError
            If the prompt is empty or cannot be interpreted.
        """
        # --- Validate prompt (Task 6.9) ---
        stripped = prompt.strip()
        if not stripped:
            raise ValueError("Prompt is empty.")

        # --- Parse the BlockModel dict ---
        block_model = BlockModel.model_validate(block_model_dict)

        # --- Detect intents (Task 6.2) ---
        intents = self.detect_intents(stripped)

        # --- Retrieve applicable rules (Task 6.3) ---
        rules = self._get_rules_for_intents(intents)

        # --- Try agent first, fall back to local rules (Tasks 6.4, 6.5) ---
        options: list[ResponseOption] = []

        if self._agent is not None:
            try:
                agent_options = self._agent.generate_manipulation(
                    stripped, block_model_dict, rules,
                )
                options = self._parse_agent_response(
                    agent_options, block_model, rules,
                )
            except Exception:
                logger.exception("Agent failed — falling back to rule-based options")
                options = []

        # If agent returned nothing (or no agent), generate from rules
        if not options:
            options = self._generate_rule_based_options(
                block_model, rules, intents,
            )

        # Ensure 2–5 options (Task 6.5)
        options = self._ensure_option_count(options, block_model, rules, intents)

        return options

    # ------------------------------------------------------------------
    # Intent detection  (Task 6.2)
    # ------------------------------------------------------------------

    @staticmethod
    def detect_intents(prompt: str) -> list[str]:
        """Return a list of detected intent strings from *prompt*.

        Keyword matching is case-insensitive.  If no specific intent
        keywords are found, ``["general_modification"]`` is returned.
        """
        lower = prompt.lower()
        found: list[str] = []
        for intent, keywords in INTENT_KEYWORDS.items():
            if any(kw in lower for kw in keywords):
                found.append(intent)
        if not found:
            found.append("general_modification")
        return found

    # ------------------------------------------------------------------
    # Rule retrieval  (Task 6.3)
    # ------------------------------------------------------------------

    def _get_rules_for_intents(
        self, intents: list[str],
    ) -> list[dict[str, Any]]:
        """Collect rules from the registry for all detected intents."""
        rules: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for intent in intents:
            for rule in self._registry.get_rules_for_intent(intent):
                rid = rule.get("id", "")
                if rid not in seen_ids:
                    rules.append(rule)
                    seen_ids.add(rid)
        return rules

    # ------------------------------------------------------------------
    # Agent response parsing  (Task 6.5)
    # ------------------------------------------------------------------

    def _parse_agent_response(
        self,
        agent_options: list[dict[str, Any]],
        original_model: BlockModel,
        rules: list[dict[str, Any]],
    ) -> list[ResponseOption]:
        """Parse raw agent dicts into validated :class:`ResponseOption` objects."""
        options: list[ResponseOption] = []
        for idx, raw in enumerate(agent_options[:MAX_OPTIONS]):
            try:
                bm_dict = raw.get("block_model", original_model.model_dump(mode="json"))
                bm = BlockModel.model_validate(bm_dict)
                rules_applied = raw.get("rules_applied", [r["id"] for r in rules])
                description = raw.get("description", f"Agent-generated option {idx}")
                options.append(ResponseOption(
                    option_index=idx,
                    description=description,
                    rules_applied=rules_applied,
                    block_model=bm,
                ))
            except Exception:
                logger.warning("Skipping unparseable agent option %d", idx)
        return options

    # ------------------------------------------------------------------
    # Rule-based option generation  (Tasks 6.5, 6.6, 7.x)
    # ------------------------------------------------------------------

    def _generate_rule_based_options(
        self,
        block_model: BlockModel,
        rules: list[dict[str, Any]],
        intents: list[str],
    ) -> list[ResponseOption]:
        """Generate response options by applying safety rules locally."""
        options: list[ResponseOption] = []

        if rules:
            # Option 1: apply ALL applicable rules
            all_rules_model, all_rule_ids = self._apply_rules(block_model, rules)
            if all_rule_ids:
                desc = self._build_description(all_rule_ids, rules)
                options.append(ResponseOption(
                    option_index=0,
                    description=desc,
                    rules_applied=all_rule_ids,
                    block_model=all_rules_model,
                ))

            # Option 2+: apply each rule individually
            for rule in rules:
                rid = rule["id"]
                single_model, applied = self._apply_rules(block_model, [rule])
                if applied:
                    desc = self._build_description(applied, [rule])
                    options.append(ResponseOption(
                        option_index=len(options),
                        description=desc,
                        rules_applied=applied,
                        block_model=single_model,
                    ))
                if len(options) >= MAX_OPTIONS:
                    break

        # If still no options (e.g. general_modification with no rules),
        # return the original model as a "no changes" option.
        if not options:
            options.append(ResponseOption(
                option_index=0,
                description="No specific safety rules apply. Original model returned unchanged.",
                rules_applied=[],
                block_model=block_model.model_copy(deep=True),
            ))

        return options

    def _apply_rules(
        self,
        block_model: BlockModel,
        rules: list[dict[str, Any]],
    ) -> tuple[BlockModel, list[str]]:
        """Apply the given rules sequentially and return the modified model
        plus the list of rule IDs that were actually applied."""
        current = block_model
        applied: list[str] = []
        for rule in rules:
            rid = rule.get("id", "")
            fn = SAFETY_RULE_FUNCTIONS.get(rid)
            if fn is not None:
                current = fn(current)
                applied.append(rid)
            else:
                logger.debug("No implementation for rule %r — skipping", rid)
        return current, applied

    @staticmethod
    def _build_description(
        rule_ids: list[str],
        rules: list[dict[str, Any]],
    ) -> str:
        """Build a human-readable description listing applied rules."""
        label_map = {r["id"]: r.get("label", r["id"]) for r in rules}
        parts = [label_map.get(rid, rid) for rid in rule_ids]
        return "Applied: " + ", ".join(parts) + "."

    # ------------------------------------------------------------------
    # Ensure 2–5 options  (Task 6.5)
    # ------------------------------------------------------------------

    def _ensure_option_count(
        self,
        options: list[ResponseOption],
        block_model: BlockModel,
        rules: list[dict[str, Any]],
        intents: list[str],
    ) -> list[ResponseOption]:
        """Pad or trim the options list to be within [2, 5]."""
        # Trim
        options = options[:MAX_OPTIONS]

        # Pad with the original (unmodified) model if needed
        while len(options) < MIN_OPTIONS:
            options.append(ResponseOption(
                option_index=len(options),
                description="Original model with no modifications applied.",
                rules_applied=[],
                block_model=block_model.model_copy(deep=True),
            ))

        # Re-index
        for i, opt in enumerate(options):
            opt.option_index = i

        return options
