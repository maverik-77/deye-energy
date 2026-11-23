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
import os
from pathlib import Path
import re
from typing import Any

BUNDLED_PATH = Path(__file__).with_name("mqtt_entity_map.json")

_TOU_KINDS = ("start", "soc", "grid", "charge", "mode", "sell", "power", "voltage")
_ENTITY_ID_KINDS = ("sensor", "number", "select", "switch", "time", "text", "weather", "button", "binary_sensor")
_POWER_FLOW_FORMATS = ("w", "kw", "kwh", "num", "gbp", "pct")
_POWER_FLOW_CHIP_KINDS = ("import", "export", "bolt", "flame", "pound")
_POWER_FLOW_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
_POWER_FLOW_MAX_ROWS = 20
_POWER_FLOW_BUILTIN_DETAILS = (
    "pv_energy",
    "grid_import", "grid_export", "grid_voltage",
    "inv_temperature", "inv_status",
    "home_energy", "home_consumers",
    "batt_soc", "batt_voltage", "batt_current", "batt_temperature",
    "batt_charged", "batt_discharged",
)

_state: dict[str, Any] = {
    "bundled": None,
    "override": None,
    "override_dir": None,
    "override_errors": [],
}


def _validate_entity_id(value: Any, source: str) -> str:
    entity_id = str(value or "").strip()
    if not entity_id:
        return ""
    domain, _, object_id = entity_id.partition(".")
    if domain not in _ENTITY_ID_KINDS or not object_id:
        raise ValueError(f"invalid entity id in {source}: {entity_id}")
    return entity_id


def _validate_power_flow_row(row: Any, source: str, formats: set[str], kinds: set[str], summary: bool) -> None:
    if not isinstance(row, dict):
        raise ValueError(f"power flow chip/detail row in {source} must be an object")
    allowed = {"label", "items"} if summary else {"label", "entity", "format"}
    unknown = set(row) - allowed
    if unknown:
        raise ValueError(f"unsupported power flow row fields in {source}: {sorted(unknown)}")
    label = str(row.get("label", "")).strip()
    if not label or len(label) > 64:
        raise ValueError(f"invalid power flow row label in {source}: {label!r}")
    if not summary:
        if str(row.get("format", "num")) not in formats:
            raise ValueError(f"unsupported power flow format in {source}")
        _validate_entity_id(row.get("entity"), source)
        return
    items = row.get("items", [])
    if not isinstance(items, list) or len(items) > 6:
        raise ValueError(f"power flow summary items in {source} must be a list of at most 6 entries")
    for item in items:
        if not isinstance(item, dict):
            raise ValueError(f"power flow summary item in {source} must be an object")
        unknown = set(item) - {"label", "entity", "format", "kind", "color"}
        if unknown:
            raise ValueError(f"unsupported power flow item fields in {source}: {sorted(unknown)}")
        item_label = str(item.get("label", "")).strip()
        if not item_label or len(item_label) > 64:
            raise ValueError(f"invalid power flow item label in {source}: {item_label!r}")
        if str(item.get("format", "num")) not in formats:
            raise ValueError(f"unsupported power flow format in {source}")
        if str(item.get("kind", "")) not in kinds:
            raise ValueError(f"unsupported power flow chip kind in {source}")
        color = str(item.get("color", "")).strip()
        if color and not _POWER_FLOW_COLOR.match(color):
            raise ValueError(f"invalid power flow chip colour in {source}")
        _validate_entity_id(item.get("entity"), source)


def _validate_power_flow_layout(
    layout: Any, source: str, groups: set[str], formats: set[str]
) -> dict[str, list[dict[str, Any]]]:
    """Validate the ordered layout of rows shown below a node's divider."""
    if not isinstance(layout, dict):
        raise ValueError(f"Power Flow node detail layout in {source} must be an object")
    normalized: dict[str, list[dict[str, Any]]] = {}
    for group, rows in layout.items():
        if group not in groups:
            raise ValueError(f"unknown Power Flow node group in layout: {group}")
        if not isinstance(rows, list) or len(rows) > _POWER_FLOW_MAX_ROWS:
            raise ValueError(
                f"Power Flow node detail layout for {group} must be a list of at most {_POWER_FLOW_MAX_ROWS} rows"
            )
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError(f"power flow layout row in {source} must be an object")
            builtin = row.get("builtin")
            if builtin is not None:
                if set(row) != {"builtin"} or str(builtin) not in _POWER_FLOW_BUILTIN_DETAILS:
                    raise ValueError(f"unsupported power flow built-in row in {source}: {builtin!r}")
                continue
            _validate_power_flow_row(row, source, formats, set(), summary=False)
        normalized[str(group)] = rows
    return normalized


def validate_power_flow_payload(payload: Any) -> dict[str, Any]:
    """Validate a card submission for the Power Flow display override."""
    source = "power flow display payload"
    if not isinstance(payload, dict):
        raise ValueError("Power Flow display must be an object")
    defaults = _state["bundled"].get("power_flow", {})
    known = set(defaults.get("entities", {}))
    formats = set(defaults.get("formats", _POWER_FLOW_FORMATS))
    kinds = set(defaults.get("chip_kinds", _POWER_FLOW_CHIP_KINDS))
    allowed_groups = set(defaults.get("node_detail_keys", ()))
    unknown = set(payload) - {
        "schema_version", "entities", "node_details", "node_detail_layout", "chip_rows"
    }
    if unknown:
        raise ValueError(f"unsupported Power Flow display fields: {sorted(unknown)}")
    entities = payload.get("entities", {})
    if not isinstance(entities, dict):
        raise ValueError("Power Flow entities must be an object")
    normalized_entities: dict[str, str] = {}
    for key, value in entities.items():
        if key not in known:
            raise ValueError(f"unknown Power Flow sensor key: {key}")
        normalized_entities[str(key)] = _validate_entity_id(value, source)
    node_details = payload.get("node_details", {})
    if not isinstance(node_details, dict):
        raise ValueError("Power Flow node details must be an object")
    normalized_details: dict[str, list[dict[str, Any]]] = {}
    for group, rows in node_details.items():
        if group not in allowed_groups:
            raise ValueError(f"unknown Power Flow node group: {group}")
        if not isinstance(rows, list) or len(rows) > _POWER_FLOW_MAX_ROWS:
            raise ValueError(f"Power Flow node details for {group} must be a list of at most {_POWER_FLOW_MAX_ROWS} rows")
        for row in rows:
            _validate_power_flow_row(row, source, formats, kinds, summary=False)
        normalized_details[str(group)] = rows
    layout = payload.get("node_detail_layout", {})
    normalized_layout = _validate_power_flow_layout(layout, source, allowed_groups, formats)
    chip_rows = payload.get("chip_rows", {})
    if not isinstance(chip_rows, dict):
        raise ValueError("Power Flow chip rows must be an object")
    unknown_rows = set(chip_rows) - {"main", "summary"}
    if unknown_rows:
        raise ValueError(f"unknown Power Flow chip row: {sorted(unknown_rows)}")
    normalized_chips: dict[str, list[dict[str, Any]]] = {}
    for row_key, chips in chip_rows.items():
        if not isinstance(chips, list) or len(chips) > _POWER_FLOW_MAX_ROWS:
            raise ValueError(f"Power Flow chip row {row_key} must be a list of at most {_POWER_FLOW_MAX_ROWS} chips")
        for chip in chips:
            _validate_power_flow_row(chip, source, formats, kinds, summary=(row_key == "summary"))
        normalized_chips[str(row_key)] = chips
    return {
        "schema_version": 1,
        "entities": normalized_entities,
        "node_details": normalized_details,
        "node_detail_layout": normalized_layout,
        "chip_rows": normalized_chips,
    }


def _validate_power_flow(document: dict[str, Any], source: str) -> None:
    power_flow = document.get("power_flow")
    if power_flow is None:
        return
    defaults = _state["bundled"] if _state.get("bundled") else document
    bundled = defaults.get("power_flow", {})
    known = set(bundled.get("entities", {}))
    formats = set(bundled.get("formats", _POWER_FLOW_FORMATS))
    kinds = set(bundled.get("chip_kinds", _POWER_FLOW_CHIP_KINDS))
    groups = set(bundled.get("node_detail_keys", ()))
    if not isinstance(power_flow, dict):
        raise ValueError(f"power_flow in {source} must be an object")
    allowed = {
        "schema_version", "entities", "sensor_groups", "node_detail_keys",
        "formats", "chip_kinds", "node_details", "node_detail_layout", "chip_rows",
    }
    unknown = set(power_flow) - allowed
    if unknown:
        raise ValueError(f"unsupported power_flow fields in {source}: {sorted(unknown)}")
    entities = power_flow.get("entities", {})
    if not isinstance(entities, dict):
        raise ValueError(f"power_flow.entities in {source} must be an object")
    for key, value in entities.items():
        if key not in known:
            raise ValueError(f"unknown power_flow entity key in {source}: {key}")
        _validate_entity_id(value, source)
    details = power_flow.get("node_details", {})
    if not isinstance(details, dict):
        raise ValueError(f"power_flow.node_details in {source} must be an object")
    for group, rows in details.items():
        if group not in groups or not isinstance(rows, list) or len(rows) > _POWER_FLOW_MAX_ROWS:
            raise ValueError(f"invalid power_flow node details in {source}: {group}")
        for row in rows:
            _validate_power_flow_row(row, source, formats, kinds, summary=False)
    _validate_power_flow_layout(power_flow.get("node_detail_layout", {}), source, groups, formats)
    chip_rows = power_flow.get("chip_rows", {})
    if not isinstance(chip_rows, dict):
        raise ValueError(f"power_flow.chip_rows in {source} must be an object")
    for row_key, chips in chip_rows.items():
        if row_key not in ("main", "summary") or not isinstance(chips, list) or len(chips) > _POWER_FLOW_MAX_ROWS:
            raise ValueError(f"invalid power_flow chip row in {source}: {row_key}")
        for chip in chips:
            _validate_power_flow_row(chip, source, formats, kinds, summary=(row_key == "summary"))


def _load_document(path: Path, *, require_full: bool = True) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict):
        raise ValueError("entity map must be a JSON object")
    common = document.get("common")
    profiles = document.get("profiles")
    if require_full and (not isinstance(common, dict) or not isinstance(profiles, dict)):
        raise ValueError("entity map needs common and profiles objects")
    common = common if isinstance(common, dict) else {}
    profiles = profiles if isinstance(profiles, dict) else {}
    for section in ("entities", "specs", "special", "config_fields"):
        if section in common and not isinstance(common[section], dict):
            raise ValueError(f"common.{section} must be an object")
    default_profile = document.get("default_profile")
    if require_full or default_profile is not None:
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
    _validate_power_flow(document, str(path))
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
    power_flow = override.get("power_flow")
    if isinstance(power_flow, dict):
        target = merged.setdefault("power_flow", {})
        entities = power_flow.get("entities")
        if isinstance(entities, dict) and isinstance(target.get("entities"), dict):
            target["entities"].update(entities)
        details = power_flow.get("node_details")
        if isinstance(details, dict):
            for group, rows in details.items():
                if isinstance(rows, list):
                    target.setdefault("node_details", {})[group] = rows
        chip_rows = power_flow.get("chip_rows")
        if isinstance(chip_rows, dict):
            for row_key, chips in chip_rows.items():
                if isinstance(chips, list):
                    target.setdefault("chip_rows", {})[row_key] = chips
        layout = power_flow.get("node_detail_layout")
        if isinstance(layout, dict):
            for group, rows in layout.items():
                if isinstance(rows, list):
                    target.setdefault("node_detail_layout", {})[group] = rows
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
        document = _load_document(path, require_full=False)
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


def power_flow_display() -> dict[str, Any]:
    """Return the effective Power Flow mapping/display config for the cards."""
    power_flow = _document().get("power_flow", {})
    return json.loads(json.dumps(power_flow))


def power_flow_override_path() -> Path | None:
    """Return the user override path, or None outside a config entry."""
    override_dir = _state.get("override_dir")
    if not override_dir:
        return None
    filename = _state["bundled"].get("override_file", "deye_energy_entity_map.json")
    return Path(override_dir) / str(filename)


def save_power_flow_display(payload: Any) -> dict[str, Any]:
    """Persist the card's Power Flow display config to the user override file.

    Only the ``power_flow`` section is replaced; every other section of an
    existing override is preserved.  The candidate file is validated before it
    replaces the live one, so an invalid submission never corrupts the map.
    """
    normalized = validate_power_flow_payload(payload)
    path = power_flow_override_path()
    if path is None:
        raise ValueError("Home Assistant configuration directory is unavailable")
    document: dict[str, Any] = {}
    if path.is_file():
        with path.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if not isinstance(loaded, dict):
            raise ValueError("entity map override must be a JSON object")
        document = loaded
    document["power_flow"] = normalized
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        _load_document(temporary, require_full=False)
        os.replace(temporary, path)
    except (OSError, ValueError, json.JSONDecodeError) as err:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise ValueError(f"refusing to write invalid entity map override: {err}") from err
    configure(_state["override_dir"])
    if _state["override_errors"]:
        raise ValueError("; ".join(_state["override_errors"]))
    return power_flow_display()
