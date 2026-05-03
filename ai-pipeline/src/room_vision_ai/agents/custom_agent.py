# Room Vision AI — AI & Asset Pipeline
# MIT License — see LICENSE in repository root
"""
Custom agent loader — dynamically imports a user-provided Python module.

The ``model_name`` field in ``AgentConfig`` specifies the fully-qualified
class path, e.g. ``"my_package.my_module.MyAgent"``.

The loaded class must be a subclass of ``AgentInterface``.
"""

from __future__ import annotations

import importlib
import logging

from room_vision_ai.agent_interface import AgentInterface
from room_vision_ai.models import AgentConfig

logger = logging.getLogger("room_vision_ai.agents.custom")


def load_custom_agent(config: AgentConfig) -> AgentInterface:
    """Dynamically import and instantiate a user-provided agent class.

    The ``config.model_name`` must be a dotted path to a Python class that
    subclasses ``AgentInterface``, e.g. ``"my_module.MyAgent"``.

    Parameters
    ----------
    config : AgentConfig
        Agent configuration with ``model_name`` set to the class path.

    Returns
    -------
    AgentInterface
        An instance of the user-provided agent class.

    Raises
    ------
    ValueError
        If ``model_name`` is not a valid dotted path.
    ImportError
        If the module cannot be imported.
    TypeError
        If the loaded class does not implement ``AgentInterface``.
    """
    class_path = config.model_name
    if "." not in class_path:
        raise ValueError(
            f"Custom agent model_name must be a dotted path "
            f"(e.g. 'my_module.MyAgent'), got: '{class_path}'"
        )

    module_path, class_name = class_path.rsplit(".", 1)

    try:
        module = importlib.import_module(module_path)
    except ModuleNotFoundError as exc:
        raise ImportError(
            f"Cannot import custom agent module '{module_path}'. "
            f"Make sure the module is installed or on PYTHONPATH. "
            f"Original error: {exc}"
        ) from exc

    if not hasattr(module, class_name):
        raise ImportError(
            f"Module '{module_path}' does not have a class named '{class_name}'."
        )

    agent_class = getattr(module, class_name)

    if not (isinstance(agent_class, type) and issubclass(agent_class, AgentInterface)):
        raise TypeError(
            f"'{class_path}' is not a subclass of AgentInterface. "
            f"Custom agents must extend room_vision_ai.agent_interface.AgentInterface."
        )

    logger.info("Loading custom agent: %s", class_path)
    return agent_class(config)
