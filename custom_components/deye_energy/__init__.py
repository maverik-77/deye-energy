from __future__ import annotations

import json
import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from . import entity_map
from .const import (
    ABSOLUTE_INVERTER_MAX_POWER_W,
    CONF_BUY_SELLER_ID,
    CONF_BUY_SELLER_TARIFF_ID,
    CONF_INVERTER_PROVIDER,
    DEFAULT_BUY_SELLER_ID,
    DEFAULT_BUY_SELLER_TARIFF_ID,
    DEFAULT_INVERTER_PROVIDER,
    DOMAIN,
    PHYSICAL_NORMAL_MODES,
    PLATFORMS,
    PROVIDER_DEYE_ADDON,
    PROVIDER_LEWA_REKA,
    PROVIDER_SUNSYNK,
    WORK_MODES,
    WORK_MODE_SERVICE_VALUES,
)
from .frontend import async_setup_frontend, cancel_frontend_followup
from .inverter_config import INVERTER_CONFIG_GROUP_KEYS
from .manager import DeyeEnergyRuntime
from .price_sources import (
    contract_mapping_matches,
    detect_source_adapter,
    migrate_legacy_price_contracts,
    rebuild_price_contract,
    resolve_contract_schemas,
)

_LOGGER = logging.getLogger(__name__)

APPLY_SCHEMA = vol.Schema(
    {
        vol.Required("mode"): vol.In(WORK_MODE_SERVICE_VALUES),
        vol.Required("sell_power"): vol.All(vol.Coerce(float), vol.Range(min=0, max=ABSOLUTE_INVERTER_MAX_POWER_W)),
    }
)
MANUAL_SELL_SCHEMA = vol.Schema(
    {
        vol.Required("sell_power"): vol.All(vol.Coerce(float), vol.Range(min=0, max=ABSOLUTE_INVERTER_MAX_POWER_W)),
    }
)
CHARGE_SCHEMA = vol.Schema({})
AI_DATA_SCHEMA = vol.Schema({vol.Required("data"): vol.All(cv.string, vol.Length(max=200000))})
AI_RATING_SCHEMA = vol.Schema({vol.Required("timestamp"): vol.Coerce(float), vol.Required("rating"): vol.All(vol.Coerce(int), vol.Range(min=1, max=5))})
DEFAULT_SETTINGS_SCHEMA = vol.Schema(
    {
        vol.Required("mode"): vol.In(WORK_MODE_SERVICE_VALUES),
        vol.Optional("physical_work_mode"): vol.In(list(PHYSICAL_NORMAL_MODES)),
        vol.Required("sell_power"): vol.All(vol.Coerce(float), vol.Range(min=0, max=ABSOLUTE_INVERTER_MAX_POWER_W)),
    }
)
SCHEDULE_PATCH_SCHEMA = vol.Schema(
    {vol.Required("data"): vol.All(cv.string, vol.Length(max=100000))}
)
TARIFF_SETTINGS_SCHEMA = vol.Schema(
    {vol.Required("data"): vol.All(cv.string, vol.Length(max=50000))}
)
CHARGE_PROFILE_SCHEMA = vol.Schema(
    {
        vol.Required("grid_charge_enabled"): cv.boolean,
        vol.Required("target_soc"): vol.All(vol.Coerce(float), vol.Range(min=0, max=100)),
    }
)
NORMAL_PROFILE_SCHEMA = vol.Schema(
    {
        vol.Required("physical_work_mode"): vol.In(list(PHYSICAL_NORMAL_MODES)),
        vol.Required("sell_power"): vol.All(vol.Coerce(float), vol.Range(min=0, max=ABSOLUTE_INVERTER_MAX_POWER_W)),
        vol.Required("tou_soc"): vol.All(vol.Coerce(float), vol.Range(min=0, max=100)),
    }
)
PLAN_EXECUTION_SCHEMA = vol.Schema(
    {
        vol.Optional("date"): vol.All(cv.string, vol.Length(max=10)),
    }
)
TOU_SLOT_SCHEMA = vol.Schema(
    {
        vol.Required("slot"): vol.All(vol.Coerce(int), vol.Range(min=1, max=6)),
        vol.Optional("start"): vol.All(cv.string, vol.Length(max=5)),
        vol.Optional("end"): vol.All(cv.string, vol.Length(max=5)),
        vol.Optional("soc"): vol.All(vol.Coerce(float), vol.Range(min=0, max=100)),
        vol.Optional("grid_charge"): cv.boolean,
        vol.Optional("mode"): vol.All(cv.string, vol.Length(max=64)),
        vol.Optional("charge"): vol.All(cv.string, vol.Length(max=64)),
        vol.Optional("sell"): cv.boolean,
        vol.Optional("power"): vol.All(vol.Coerce(float), vol.Range(min=0, max=200000)),
        vol.Optional("voltage"): vol.All(vol.Coerce(float), vol.Range(min=0, max=1000)),
    }
)
MANUAL_SCHEDULE_DATA_SCHEMA = vol.Schema(
    {vol.Required("data"): vol.All(cv.string, vol.Length(max=100000))}
)
ENERGY_STATUS_DISPLAY_DATA_SCHEMA = vol.Schema(
    {vol.Required("data"): vol.All(cv.string, vol.Length(max=50000))}
)
POWER_FLOW_DISPLAY_DATA_SCHEMA = vol.Schema(
    {vol.Required("data"): vol.All(cv.string, vol.Length(max=50000))}
)
INVERTER_CONFIG_SCHEMA = vol.Schema({})
APPLY_INVERTER_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("group"): vol.In(INVERTER_CONFIG_GROUP_KEYS),
        vol.Required("values"): dict,
    }
)
SYNC_INVERTER_DATETIME_SCHEMA = vol.Schema({})
SERVICE_NAMES = (
    "apply_settings",
    "manual_sell",
    "charge_now",
    "stop_selling",
    "restore_defaults",
    "resume_manager",
    "emergency_stop",
    "save_ai_settings",
    "save_ai_profiles",
    "save_ai_api_settings",
    "test_ai_api",
    "analyze_ai_api",
    "save_ai_analysis",
    "clear_ai_history",
    "rate_ai_analysis",
    "clear_history",
    "apply_schedule_patch",
    "save_tariff_settings",
    "save_charge_profile",
    "save_normal_profile",
    "save_default_settings",
    "refresh_tariff_catalog",
    "save_future_plan",
    "cancel_future_plan",
    "get_plan_execution",
    "set_tou_slot",
    "save_manual_schedule",
    "init_manual_schedule_from_tou",
    "activate_manual_schedule",
    "deactivate_manual_schedule",
    "save_energy_status_display",
    "get_inverter_configuration",
    "apply_inverter_configuration_group",
    "sync_inverter_datetime",
    "get_power_flow_display",
    "save_power_flow_display",
)
async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration domain before config entries are loaded.

    The runtime remains config-entry-only.  This lightweight domain hook is
    required by Home Assistant during the normal integration setup phase and
    also keeps a legacy YAML domain declaration from preventing config entries
    and the frontend resource from loading.
    """
    hass.data.setdefault(DOMAIN, {})

    # An optional entity-map override in the HA config directory is loaded
    # before any config entry is set up.  Invalid overrides fail closed to the
    # bundled catalogue; disk I/O stays off the event loop.
    config = getattr(hass, "config", None)
    config_dir = getattr(config, "config_dir", None) if config is not None else None
    if config_dir:
        await hass.async_add_executor_job(entity_map.configure, config_dir)
        for error in entity_map.override_errors():
            _LOGGER.warning("Ignoring Deye entity map override: %s", error)
    return True


# Sunsynk migration fallbacks come from the shared entity-map catalogue.
_SUNSYNK_ENTITY_FALLBACKS: dict[str, str] = entity_map.fallback_map(PROVIDER_SUNSYNK)


def _entity_exists(hass: HomeAssistant, entity_id: str) -> bool:
    """True when an entity is loaded or at least registered in HA."""
    if not entity_id:
        return False
    if hass.states.get(entity_id) is not None:
        return True
    try:
        from homeassistant.helpers import entity_registry as er

        return er.async_get(hass).async_get(entity_id) is not None
    except (ImportError, AttributeError, RuntimeError):
        return False


def _fill_missing_sunsynk_fallbacks(
    hass: HomeAssistant, entry: ConfigEntry
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    """Fill empty Sunsynk entity mappings when the default HA entity exists.

    Existing user mappings are never overwritten. This covers TOU mode/charge/
    sell/power/voltage (and any other Sunsynk fallback) for entries that were
    created before those fields were exposed or migrated.
    """
    data = dict(entry.data)
    options = dict(entry.options)
    merged = {**data, **options}
    if str(merged.get(CONF_INVERTER_PROVIDER, DEFAULT_INVERTER_PROVIDER)) != PROVIDER_SUNSYNK:
        return data, options, False
    changed = False
    for key, entity_id in _SUNSYNK_ENTITY_FALLBACKS.items():
        if str(merged.get(key) or "").strip():
            continue
        if not _entity_exists(hass, entity_id):
            continue
        _set_migrated_value(data, options, key, entity_id)
        merged[key] = entity_id
        changed = True
    return data, options, changed


def _set_migrated_value(
    data: dict, options: dict, key: str, value: str
) -> None:
    """Persist a migrated value where the entry already stores that key."""
    if key in data:
        data[key] = value
    options[key] = value


async def _migrate_24_to_25(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Enable writable control for read-only Deye MQTT mappings.

    Version 24 allowed selecting the read-only "Deye Inverter MQTT" provider
    even when the mapped entities are the writable Sunsynk-compatible Deye
    MQTT entities.  Version 25 moves only those entries to the Sunsynk
    profile and fills the Time Of Use mappings the read-only profile never
    asked for.  Existing mappings and all unrelated config are left intact.
    """
    data = dict(entry.data)
    options = dict(entry.options)
    merged = {**data, **options}
    if str(merged.get(CONF_INVERTER_PROVIDER, "")) != PROVIDER_DEYE_ADDON:
        hass.config_entries.async_update_entry(entry, minor_version=25)
        return True
    _set_migrated_value(data, options, CONF_INVERTER_PROVIDER, PROVIDER_SUNSYNK)
    for key, entity_id in _SUNSYNK_ENTITY_FALLBACKS.items():
        if str(merged.get(key) or "").strip() or not _entity_exists(hass, entity_id):
            continue
        _set_migrated_value(data, options, key, entity_id)
    hass.config_entries.async_update_entry(
        entry, data=data, options=options, minor_version=25
    )
    return True


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Migrate legacy entries without changing any mapped entity identifier.

    Entries created before the provider layer are Lewa-Reka mappings.  Adding
    the explicit provider is data-only and deliberately leaves options and all
    entity IDs untouched.
    """
    if entry.version != 1:
        return False
    if entry.minor_version == 24:
        return await _migrate_24_to_25(hass, entry)
    if entry.minor_version >= 24:
        return True
    data = dict(entry.data)
    options = dict(entry.options)
    if entry.minor_version >= 23:
        if CONF_BUY_SELLER_ID not in data and CONF_BUY_SELLER_ID not in options:
            options[CONF_BUY_SELLER_ID] = DEFAULT_BUY_SELLER_ID
        if CONF_BUY_SELLER_TARIFF_ID not in data and CONF_BUY_SELLER_TARIFF_ID not in options:
            options[CONF_BUY_SELLER_TARIFF_ID] = DEFAULT_BUY_SELLER_TARIFF_ID
        hass.config_entries.async_update_entry(
            entry,
            data=data,
            options=options,
            minor_version=24,
        )
        return True
    if CONF_INVERTER_PROVIDER not in data and CONF_INVERTER_PROVIDER not in options:
        data[CONF_INVERTER_PROVIDER] = PROVIDER_LEWA_REKA
    merged = migrate_legacy_price_contracts({**data, **options})
    definitions = {
        "buy_price_contract": ("buy_price_today_sensor", "buy_price_tomorrow_sensor"),
        "sell_price_contract": ("price_sensor", "sell_price_tomorrow_sensor"),
    }
    for key, mapping_keys in definitions.items():
        saved_contract = dict(merged.get(key) or {})
        entities = {
            day_name: str(
                merged.get(mapping_key) or ""
                if mapping_key in merged
                else saved_contract.get(f"{day_name}_entity") or ""
            )
            for day_name, mapping_key in zip(("today", "tomorrow"), mapping_keys)
        }
        try:
            from homeassistant.helpers import entity_registry as er

            registry = er.async_get(hass)
        except (AttributeError, ImportError, TypeError):
            registry = None
        states = []
        bindings: dict[str, dict[str, str]] = {}
        adapters: dict[str, str] = {}
        for day_name in ("today", "tomorrow"):
            entity_id = entities[day_name]
            registry_entry = registry.async_get(entity_id) if registry is not None and hasattr(registry, "async_get") else None
            if registry_entry is None and registry is not None:
                registry_entry = getattr(registry, "entities", {}).get(entity_id)
            binding = {"entity_id": entity_id} if entity_id else {}
            if registry_entry is not None:
                binding.update({
                    "registry_entry_id": str(getattr(registry_entry, "id", "") or ""),
                    "platform": str(getattr(registry_entry, "platform", "") or ""),
                    "config_entry_id": str(getattr(registry_entry, "config_entry_id", "") or ""),
                    "unique_id": str(getattr(registry_entry, "unique_id", "") or ""),
                    "device_id": str(getattr(registry_entry, "device_id", "") or ""),
                })
            bindings[day_name] = binding
            detected = detect_source_adapter(
                entity_id,
                platform=str(getattr(registry_entry, "platform", "") or "") or None,
            )
            saved_adapter = str(
                saved_contract.get(f"resolved_adapter_{day_name}")
                or saved_contract.get("source_adapter")
                or ""
            )
            adapters[day_name] = (
                saved_adapter
                if detected == "generic"
                and contract_mapping_matches(saved_contract, entities["today"], entities["tomorrow"])
                and saved_adapter in {"octopus_energy", "custom"}
                else detected
            )
            states.append(hass.states.get(entity_id) if entity_id else None)
        contract = rebuild_price_contract(
            saved_contract,
            "buy" if key == "buy_price_contract" else "sell",
            entities["today"],
            entities["tomorrow"],
            adapters["today"],
            adapters["tomorrow"],
        )
        for day_name in ("today", "tomorrow"):
            entity_id = entities[day_name]
            binding = bindings[day_name]
            contract[f"{day_name}_binding"] = binding
            contract[f"resolved_{day_name}_entity"] = entity_id
            contract[f"stable_identity_{day_name}_status"] = "unmapped" if not entity_id else "bound" if binding.get("registry_entry_id") else "entity_id_only"
            contract[f"stable_identity_{day_name}_reason"] = "user_unmapped" if not entity_id else ""
            if not entity_id:
                contract[f"resolved_schema_{day_name}"] = {}
        contract, _diagnostics = resolve_contract_schemas(contract, states[0], states[1])
        if key in data:
            data[key] = contract
        else:
            options[key] = contract
        for mapping_key, entity_field in zip(mapping_keys, ("today_entity", "tomorrow_entity")):
            value = entities["today" if entity_field == "today_entity" else "tomorrow"]
            if mapping_key in data:
                data[mapping_key] = value
            elif mapping_key in options:
                options[mapping_key] = value
            elif key in data:
                data[mapping_key] = value
            else:
                options[mapping_key] = value
    if CONF_BUY_SELLER_ID not in data and CONF_BUY_SELLER_ID not in options:
        options[CONF_BUY_SELLER_ID] = DEFAULT_BUY_SELLER_ID
    if CONF_BUY_SELLER_TARIFF_ID not in data and CONF_BUY_SELLER_TARIFF_ID not in options:
        options[CONF_BUY_SELLER_TARIFF_ID] = DEFAULT_BUY_SELLER_TARIFF_ID
    hass.config_entries.async_update_entry(
        entry,
        data=data,
        options=options,
        minor_version=24,
    )
    return True


def _parse_json_payload(value: str, expected_type: type | tuple[type, ...]) -> Any:
    """Parse a JSON string passed from the Lovelace card and validate its type.

    Raises a clear ValueError for malformed JSON or unexpected type so that
    the service call fails with a controlled message instead of an unhandled
    exception.
    """
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as err:
        raise ValueError("Invalid JSON") from err
    if not isinstance(parsed, expected_type):
        raise ValueError(f"Expected type {expected_type}, got {type(parsed).__name__}")
    return parsed


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data, options, changed = _fill_missing_sunsynk_fallbacks(hass, entry)
    if changed:
        update_entry = getattr(hass.config_entries, "async_update_entry", None)
        if callable(update_entry):
            update_entry(entry, data=data, options=options)
    runtime = DeyeEnergyRuntime(
        hass=hass,
        entry_id=entry.entry_id,
        data={**data, **options},
    )
    runtime._platform_setup_in_progress = True
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = runtime
    await runtime.async_start()
    await async_setup_frontend(hass)
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        runtime._platform_setup_in_progress = False
        raise
    else:
        runtime.finish_platform_setup()

    async def handle_apply_settings(call: ServiceCall) -> None:
        sell_power = call.data["sell_power"]
        runtime.validate_manual_sell_power_w("apply_settings", sell_power)
        await runtime.async_apply_settings(call.data["mode"], sell_power)

    async def handle_manual_sell(call: ServiceCall) -> None:
        sell_power = call.data["sell_power"]
        runtime.validate_manual_sell_power_w("manual_sell", sell_power)
        runtime.manual_sell_power = sell_power
        await runtime.async_manual_sell()

    async def handle_charge_now(call: ServiceCall) -> None:
        await runtime.async_charge_now()

    async def handle_stop_selling(call: ServiceCall) -> None:
        await runtime.async_request_stop()

    async def handle_restore_defaults(call: ServiceCall) -> None:
        await runtime.async_restore_defaults()

    async def handle_resume_manager(call: ServiceCall) -> None:
        await runtime.async_resume_manager()

    async def handle_emergency_stop(call: ServiceCall) -> None:
        await runtime.async_emergency_stop()

    async def handle_save_ai_settings(call: ServiceCall) -> None:
        data = _parse_json_payload(call.data["data"], dict)
        await runtime.async_set_ai_settings(data)

    async def handle_save_ai_profiles(call: ServiceCall) -> None:
        data = _parse_json_payload(call.data["data"], dict)
        await runtime.async_set_user_profiles(data)

    async def handle_save_ai_api_settings(call: ServiceCall) -> None:
        data = _parse_json_payload(call.data["data"], dict)
        normalized = runtime.update_ai_api_config(data)
        hass.config_entries.async_update_entry(
            entry,
            options={**entry.options, "ai_api": normalized},
        )

    async def handle_test_ai_api(call: ServiceCall) -> None:
        await runtime.async_run_ai_api(connection_test=True, force=True)

    async def handle_analyze_ai_api(call: ServiceCall) -> None:
        await runtime.async_run_ai_api(force=True)

    async def handle_save_ai_analysis(call: ServiceCall) -> None:
        data = _parse_json_payload(call.data["data"], dict)
        await runtime.async_add_ai_analysis(data)

    async def handle_clear_ai_history(call: ServiceCall) -> None:
        await runtime.async_clear_ai_history()

    async def handle_rate_ai_analysis(call: ServiceCall) -> None:
        await runtime.async_rate_ai_analysis(call.data["timestamp"], call.data["rating"])

    async def handle_clear_history(call: ServiceCall) -> None:
        await runtime.async_clear_all_history()

    async def handle_apply_schedule_patch(call: ServiceCall) -> None:
        payload = _parse_json_payload(call.data["data"], (list, dict))
        if isinstance(payload, list):
            await runtime.async_apply_schedule_patch(payload)
            return
        unknown = set(payload) - {"updates", "replace_day", "date"}
        if unknown:
            raise ValueError(
                "Unsupported Apply Today fields: " + ", ".join(sorted(unknown))
            )
        if payload.get("replace_day") is not True:
            raise ValueError("An object schedule payload requires replace_day=true")
        updates = payload.get("updates")
        if not isinstance(updates, list):
            raise ValueError("Apply Today requires an updates list")
        await runtime.async_apply_schedule_patch(
            updates,
            replace_day=True,
            date=str(payload.get("date") or ""),
        )

    async def handle_save_tariff_settings(call: ServiceCall) -> None:
        settings = _parse_json_payload(call.data["data"], dict)
        normalized = await runtime.async_update_tariff_settings(settings)
        hass.config_entries.async_update_entry(
            entry,
            options={**entry.options, **normalized},
        )

    async def handle_save_charge_profile(call: ServiceCall) -> None:
        await runtime.async_save_charge_profile(dict(call.data))

    async def handle_save_normal_profile(call: ServiceCall) -> None:
        await runtime.async_save_normal_profile(dict(call.data))

    async def handle_save_default_settings(call: ServiceCall) -> None:
        await runtime.async_save_default_settings(dict(call.data))

    async def handle_refresh_tariff_catalog(call: ServiceCall) -> None:
        await runtime.async_refresh_tariff_catalog()

    async def handle_save_future_plan(call: ServiceCall) -> None:
        plan = _parse_json_payload(call.data["data"], dict)
        await runtime.async_save_future_plan(plan)

    async def handle_cancel_future_plan(call: ServiceCall) -> None:
        await runtime.async_cancel_future_plan()

    async def handle_get_plan_execution(call: ServiceCall) -> dict[str, Any]:
        return runtime.plan_execution_day(call.data.get("date"))

    async def handle_set_tou_slot(call: ServiceCall) -> None:
        await runtime.async_set_physical_tou_slot(
            call.data["slot"],
            start=call.data.get("start"),
            end=call.data.get("end"),
            soc=call.data.get("soc"),
            grid_charge=call.data.get("grid_charge"),
            mode=call.data.get("mode"),
            charge=call.data.get("charge"),
            sell=call.data.get("sell"),
            power=call.data.get("power"),
            voltage=call.data.get("voltage"),
        )

    async def handle_save_manual_schedule(call: ServiceCall) -> dict[str, Any]:
        payload = _parse_json_payload(call.data["data"], (list, dict))
        if isinstance(payload, list):
            rows = payload
        else:
            unknown = set(payload) - {"rows"}
            if unknown:
                raise ValueError(
                    "Unsupported manual schedule fields: " + ", ".join(sorted(unknown))
                )
            rows = payload.get("rows")
        return await runtime.async_save_manual_schedule(rows)

    async def handle_init_manual_schedule_from_tou(call: ServiceCall) -> dict[str, Any]:
        return await runtime.async_init_manual_schedule_from_tou()

    async def handle_activate_manual_schedule(call: ServiceCall) -> dict[str, Any]:
        return await runtime.async_activate_manual_schedule()

    async def handle_deactivate_manual_schedule(call: ServiceCall) -> dict[str, Any]:
        return await runtime.async_deactivate_manual_schedule()

    async def handle_save_energy_status_display(call: ServiceCall) -> dict[str, Any]:
        payload = _parse_json_payload(call.data["data"], dict)
        return await runtime.async_save_energy_status_display(payload)

    async def handle_get_inverter_configuration(call: ServiceCall) -> dict[str, Any]:
        return runtime.read_inverter_configuration()

    async def handle_apply_inverter_configuration_group(call: ServiceCall) -> dict[str, Any]:
        return await runtime.async_apply_inverter_configuration_group(
            call.data["group"], call.data["values"]
        )

    async def handle_sync_inverter_datetime(call: ServiceCall) -> dict[str, Any]:
        return await runtime.async_sync_inverter_datetime(reason="manual_service")

    async def handle_get_power_flow_display(call: ServiceCall) -> dict[str, Any]:
        return entity_map.power_flow_display()

    async def handle_save_power_flow_display(call: ServiceCall) -> dict[str, Any]:
        payload = _parse_json_payload(call.data["data"], dict)
        result = await hass.async_add_executor_job(
            entity_map.save_power_flow_display, payload
        )
        runtime.request_sensor_snapshot_refresh({"ai_state"})
        runtime.notify_update()
        return result

    hass.services.async_register(DOMAIN, "apply_settings", handle_apply_settings, schema=APPLY_SCHEMA)
    hass.services.async_register(DOMAIN, "manual_sell", handle_manual_sell, schema=MANUAL_SELL_SCHEMA)
    hass.services.async_register(DOMAIN, "charge_now", handle_charge_now, schema=CHARGE_SCHEMA)
    hass.services.async_register(DOMAIN, "stop_selling", handle_stop_selling)
    hass.services.async_register(DOMAIN, "restore_defaults", handle_restore_defaults)
    hass.services.async_register(DOMAIN, "resume_manager", handle_resume_manager)
    hass.services.async_register(DOMAIN, "emergency_stop", handle_emergency_stop)
    hass.services.async_register(DOMAIN, "save_ai_settings", handle_save_ai_settings, schema=AI_DATA_SCHEMA)
    hass.services.async_register(DOMAIN, "save_ai_profiles", handle_save_ai_profiles, schema=AI_DATA_SCHEMA)
    hass.services.async_register(DOMAIN, "save_ai_api_settings", handle_save_ai_api_settings, schema=AI_DATA_SCHEMA)
    hass.services.async_register(DOMAIN, "test_ai_api", handle_test_ai_api)
    hass.services.async_register(DOMAIN, "analyze_ai_api", handle_analyze_ai_api)
    hass.services.async_register(DOMAIN, "save_ai_analysis", handle_save_ai_analysis, schema=AI_DATA_SCHEMA)
    hass.services.async_register(DOMAIN, "clear_ai_history", handle_clear_ai_history)
    hass.services.async_register(DOMAIN, "rate_ai_analysis", handle_rate_ai_analysis, schema=AI_RATING_SCHEMA)
    hass.services.async_register(DOMAIN, "clear_history", handle_clear_history)
    hass.services.async_register(
        DOMAIN,
        "apply_schedule_patch",
        handle_apply_schedule_patch,
        schema=SCHEDULE_PATCH_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "save_tariff_settings",
        handle_save_tariff_settings,
        schema=TARIFF_SETTINGS_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "save_charge_profile",
        handle_save_charge_profile,
        schema=CHARGE_PROFILE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "save_normal_profile",
        handle_save_normal_profile,
        schema=NORMAL_PROFILE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "save_default_settings",
        handle_save_default_settings,
        schema=DEFAULT_SETTINGS_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "refresh_tariff_catalog",
        handle_refresh_tariff_catalog,
    )
    hass.services.async_register(DOMAIN, "save_future_plan", handle_save_future_plan, schema=AI_DATA_SCHEMA)
    hass.services.async_register(DOMAIN, "cancel_future_plan", handle_cancel_future_plan)
    hass.services.async_register(
        DOMAIN,
        "get_plan_execution",
        handle_get_plan_execution,
        schema=PLAN_EXECUTION_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "set_tou_slot",
        handle_set_tou_slot,
        schema=TOU_SLOT_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        "save_manual_schedule",
        handle_save_manual_schedule,
        schema=MANUAL_SCHEDULE_DATA_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "init_manual_schedule_from_tou",
        handle_init_manual_schedule_from_tou,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "activate_manual_schedule",
        handle_activate_manual_schedule,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "deactivate_manual_schedule",
        handle_deactivate_manual_schedule,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "save_energy_status_display",
        handle_save_energy_status_display,
        schema=ENERGY_STATUS_DISPLAY_DATA_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "get_inverter_configuration",
        handle_get_inverter_configuration,
        schema=INVERTER_CONFIG_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "apply_inverter_configuration_group",
        handle_apply_inverter_configuration_group,
        schema=APPLY_INVERTER_CONFIG_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "sync_inverter_datetime",
        handle_sync_inverter_datetime,
        schema=SYNC_INVERTER_DATETIME_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "get_power_flow_display",
        handle_get_power_flow_display,
        schema=INVERTER_CONFIG_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "save_power_flow_display",
        handle_save_power_flow_display,
        schema=POWER_FLOW_DISPLAY_DATA_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    runtime = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    if runtime:
        await runtime.async_unload()
    if unload_ok and DOMAIN in hass.data and not hass.data[DOMAIN]:
        cancel_frontend_followup(hass)
        hass.data.pop(DOMAIN)
        for service_name in SERVICE_NAMES:
            if hass.services.has_service(DOMAIN, service_name):
                hass.services.async_remove(DOMAIN, service_name)
    return unload_ok
