"""
Configuration loader with deep-merge: defaults + config.yaml
"""
import yaml
from pathlib import Path
from typing import Any

from .defaults import DEFAULTS


def deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dicts. override takes precedence."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """
    Load configuration from YAML file and merge with defaults.

    Args:
        config_path: Path to config.yaml. If None, searches standard locations.

    Returns:
        Merged configuration dictionary.
    """
    if config_path is None:
        # Search standard locations
        search_paths = [
            Path.cwd() / "config" / "config.yaml",
            Path(__file__).parent.parent.parent / "config" / "config.yaml",
        ]
        for p in search_paths:
            if p.exists():
                config_path = p
                break

    if config_path is None or not Path(config_path).exists():
        return DEFAULTS.copy()

    with open(config_path, encoding="utf-8") as f:
        user_config = yaml.safe_load(f) or {}

    return deep_merge(DEFAULTS, user_config)


# Global config instance (loaded on first import)
_config: dict[str, Any] | None = None


def get_config() -> dict[str, Any]:
    """Get global config instance (lazy load)."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def reset_config() -> None:
    """Reset global config (for testing)."""
    global _config
    _config = None