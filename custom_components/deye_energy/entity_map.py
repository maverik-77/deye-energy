"""Shared entity mapping catalogue for inverter integrations.

All Home Assistant entity identifiers used for inverter readings and controls
live in ``mqtt_entity_map.json`` next to this module.  The file is the single
source of truth for the integration code and its tests.  An optional override
file in the Home Assistant configuration directory can replace individual
entries (or add new ones) without editing integration code, which makes the
same integration reusable with a differently mapped inverter.

Bundled defaults are read once at import.  Runtime code must call
:func:`configure` during async setup so a user override is applied; tests can
call it with an explicit configuration directory.  Entity mappings supplied in
a config entry always take precedence over anything in this catalogue.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BUNDLED_PATH = Path(__file__).with_name("mqtt_entity_map.json")

_TOU_KINDS = ("start", "soc", "grid", "charge", "mode", "sell", "power", "voltage")
_ENTITY_ID_KINDS = ("sensor", "number", "select", "switch", "time", "text", "weather", "button", "binary_sensor")

_state: dict[str, Any] = {
    "bundled": None,
    "override": None,
    "override_dir": None,
    "override_errors": [],
}


def _load_document(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict):
        raise ValueError("entity map must be a JSON object")
    common = document.get("common")
    profiles = document.get("profiles")
    if not isinstance(common, dict) or not isinstance(profiles, dict):
        raise ValueError("entity map needs common and profiles objects")
    for section in ("entities", "specs", "special", "config_fields"):
        if section in common and not isinstance(common[section], dict):
            raise ValueError(f"common.{section} must be an object")
    default_profile = document.get("default_profile")
    if not isinstance(default_profile, str) or default_profile not in profiles:
        raise ValueError("default_profile must name a bundled profile")
    for name, profile in profiles.items():
        if not isinstance(profile, dict):
            raise ValueError(f"profile {name} must be an object")
        for section in (
            "entities",
            "match_tokens",
            "tou_match_tokens",
            "fallbacks",
            "tou_fallback_templates",
        ):
            if section in profile and not isinstance(profile[section], dict):
                raise ValueError(f"profiles.{name}.{section} must be an object")
    return document


def _validate_values(document: dict[str, Any], source: str) -> None:
    """Reject malformed identifiers and tokens before they reach runtime."""
    sections = [
        document.get("common", {}).get("entities", {}),
        document.get("common", {}).get("special", {}),
        document.get("common", {}).get("config_fields", {}),
    ]
    for profile in document.get("profiles", {}).values():
        for section in ("entities", "fallbacks"):
            sections.append(profile.get(section, {}))
    for name, values in enumerate(sections):
        if not isinstance(values, dict):
            raise ValueError(f"entity section {name} in {source} must be an object")
        for key, value in values.items():
            if not isinstance(key, str) or not key.replace("_", "").isalnum():
                raise ValueError(f"invalid entity key in {source}: {key!r}")
            if value is None or value == "":
                continue
            if not isinstance(value, str) or "." not in value:
                raise ValueError(f"invalid entity id for {key} in {source}")
            domain = value.split(".", 1)[0]
            if domain not in _ENTITY_ID_KINDS:
                raise ValueError(f"unsupported entity domain for {key} in {source}: {domain}")


def _load_bundled() -> dict[str, Any]:
    document = _load_document(BUNDLED_PATH)
    _validate_values(document, str(BUNDLED_PATH))
    return document


_state["bundled"] = _load_bundled()


def _document() -> dict[str, Any]:
    override = _state["override"]
    if not override:
        return _state["bundled"]
    merged = json.loads(json.dumps(_state["bundled"]))
    for section in ("entities", "special", "config_fields"):
        merged["common"].setdefault(section, {}).update(
            override.get("common", {}).get(section, {})
        )
    specs = override.get("common", {}).get("specs", {})
    for key, spec in specs.items():
        if not isinstance(spec, dict):
            continue
        current = merged["common"].setdefault("specs", {}).setdefault(key, {})
        if "domains" in spec:
            current["domains"] = spec["domains"]
        if "tokens" in spec:
            current["tokens"] = spec["tokens"]
    for name, profile in override.get("profiles", {}).items():
        target = merged["profiles"].setdefault(name, {})
        for section, values in profile.items():
            if isinstance(values, dict) and isinstance(target.get(section), dict):
                target[section].update(values)
            else:
                target[section] = values
    if override.get("default_profile") in merged["profiles"]:
        merged["default_profile"] = override["default_profile"]
    return merged


def configure(config_dir: str | Path | None = None) -> bool:
    """Load an optional user override from a Home Assistant config directory.

    Invalid or unreadable overrides are ignored so the bundled defaults remain
    usable.  Returns True when an override was loaded.
    """
    _state["override"] = None
    _state["override_dir"] = str(config_dir) if config_dir is not None else None
    _state["override_errors"] = []
    if config_dir is None:
        return False
    filename = _state["bundled"].get("override_file", "deye_energy_entity_map.json")
    path = Path(config_dir) / str(filename)
    if not path.is_file():
        return False
    try:
        document = _load_document(path)
        _validate_values(document, str(path))
    except (OSError, ValueError, json.JSONDecodeError) as err:
        _state["override_errors"].append(f"{path}: {err}")
        return False
    _state["override"] = document
    return True


def reset() -> None:
    """Drop any user override (mainly for tests)."""
    configure(None)


def override_errors() -> tuple[str, ...]:
    return tuple(_state["override_errors"])


def default_profile() -> str:
    return str(_document().get("default_profile", "sunsynk"))


def profile_names() -> tuple[str, ...]:
    return tuple(_document().get("profiles", {}))


def _profile(profile: str | None) -> dict[str, Any]:
    document = _document()
    name = profile or document.get("default_profile")
    profiles = document.get("profiles", {})
    return profiles.get(name, profiles.get(document.get("default_profile"), {}))


def tou_key(index: int, kind: str) -> str:
    """Return the config key for one physical TOU field."""
    if kind == "grid_charge":
        kind = "grid"
    if kind not in _TOU_KINDS or not 1 <= int(index) <= 6:
        raise ValueError("Invalid TOU config key")
    return f"tou_{int(index)}_{kind}_entity"


def _tou_parts(key: str) -> tuple[int, str] | None:
    if not key.startswith("tou_") or not key.endswith("_entity"):
        return None
    parts = key[4:-7].split("_")
    if len(parts) != 2 or not parts[0].isdigit():
        return None
    index, kind = int(parts[0]), parts[1]
    if kind not in _TOU_KINDS:
        return None
    return index, kind


def entity_default(key: str, profile: str | None = None) -> str:
    """Return the default entity id for a config key."""
    document = _document()
    mapped = _profile(profile).get("entities", {}).get(key)
    if mapped is None:
        mapped = document.get("common", {}).get("entities", {}).get(key, "")
    return str(mapped or "")


def spec(key: str, profile: str | None = None) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Return domains and discovery tokens for a config key."""
    document = _document()
    common_spec = document.get("common", {}).get("specs", {}).get(key, {})
    domains = tuple(common_spec.get("domains", ()))
    return domains, match_tokens(key, profile)


def match_tokens(key: str, profile: str | None = None) -> tuple[str, ...]:
    """Return name-match tokens for a config key, including TOU templates."""
    document = _document()
    profile_data = _profile(profile)
    parts = _tou_parts(key)
    if parts is not None:
        index, kind = parts
        tokens = profile_data.get("tou_match_tokens", {}).get(kind)
        if tokens is None:
            tokens = document.get("common", {}).get("specs", {}).get(f"tou_{kind}", {}).get("tokens", ())
        return tuple(str(token).replace("{index}", str(index)) for token in tokens)
    tokens = profile_data.get("match_tokens", {}).get(key)
    if tokens is None:
        tokens = document.get("common", {}).get("specs", {}).get(key, {}).get("tokens", ())
    return tuple(str(token) for token in tokens)


def tou_match_tokens(index: int, kind: str, profile: str | None = None) -> tuple[str, ...]:
    return match_tokens(tou_key(index, kind), profile)


def special_entity(name: str, profile: str | None = None) -> str:
    document = _document()
    mapped = _profile(profile).get("special", {}).get(name)
    if mapped is None:
        mapped = document.get("common", {}).get("special", {}).get(name, "")
    return str(mapped or "")


def config_field_entity(field_key: str, profile: str | None = None) -> str | None:
    document = _document()
    mapped = _profile(profile).get("config_fields", {}).get(field_key)
    if mapped is None:
        mapped = document.get("common", {}).get("config_fields", {}).get(field_key)
    return str(mapped) if mapped else None


def tou_fallback_templates(profile: str | None = None) -> dict[str, str]:
    return dict(_profile(profile).get("tou_fallback_templates", {}))


def fallback_map(profile: str | None = None) -> dict[str, str]:
    """Return config-key to entity-id fallbacks for a profile."""
    profile_data = _profile(profile)
    fallbacks = {str(key): str(value) for key, value in profile_data.get("fallbacks", {}).items()}
    templates = profile_data.get("tou_fallback_templates", {})
    for index in range(1, 7):
        for kind, template in templates.items():
            fallbacks[tou_key(index, kind)] = str(template).replace("{index}", str(index))
    return fallbacks


def bundled_document() -> dict[str, Any]:
    """Return a copy of the bundled catalogue (for diagnostics/tests)."""
    return json.loads(json.dumps(_state["bundled"]))
