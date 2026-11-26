from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "deye_energy"


def _install_home_assistant_stubs() -> None:
    homeassistant = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    helpers = types.ModuleType("homeassistant.helpers")
    event = types.ModuleType("homeassistant.helpers.event")
    storage = types.ModuleType("homeassistant.helpers.storage")
    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")
    components = types.ModuleType("homeassistant.components")
    components_number = types.ModuleType("homeassistant.components.number")
    components_select = types.ModuleType("homeassistant.components.select")
    components_switch = types.ModuleType("homeassistant.components.switch")
    config_entries = types.ModuleType("homeassistant.config_entries")
    entity_platform = types.ModuleType("homeassistant.helpers.entity_platform")
    restore_state = types.ModuleType("homeassistant.helpers.restore_state")
    entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    entity_module = types.ModuleType("homeassistant.helpers.entity")

    core.HomeAssistant = object
    core.callback = lambda function: function
    core.ServiceCall = object
    core.SupportsResponse = object
    event.async_track_time_interval = lambda *_args, **_kwargs: lambda: None
    event.async_track_point_in_time = lambda *_args, **_kwargs: lambda: None
    event.async_track_state_change_event = lambda *_args, **_kwargs: lambda: None

    class Store:
        def __init__(self, *_args, **_kwargs):
            pass

    class NumberEntity:
        pass

    class SelectEntity:
        pass

    class SwitchEntity:
        pass

    class RestoreEntity:
        async def async_get_last_state(self):
            return None

    class AddEntitiesCallback:
        pass

    class ConfigEntry:
        pass

    class EntityRegistry:
        pass

    class DeviceInfo:
        pass

    class Entity:
        entity_id = None
        hass = None

        @property
        def name(self):
            return getattr(self, "_attr_name", None)

        def async_write_ha_state(self):
            if self.hass is None or self.entity_id is None:
                return
            self.hass.states.values[self.entity_id] = types.SimpleNamespace(
                entity_id=self.entity_id,
                state="on" if bool(getattr(self, "is_on", False)) else "off",
                attributes={"friendly_name": getattr(self, "_attr_name", None)},
            )

    storage.Store = Store
    dt.now = lambda: datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    components_number.NumberEntity = NumberEntity
    components_select.SelectEntity = SelectEntity
    components_switch.SwitchEntity = SwitchEntity
    restore_state.RestoreEntity = RestoreEntity
    entity_platform.AddEntitiesCallback = AddEntitiesCallback
    config_entries.ConfigEntry = ConfigEntry
    entity_registry.async_get = lambda *_args, **_kwargs: None
    device_registry.DeviceInfo = DeviceInfo
    entity_module.Entity = Entity

    sys.modules.update(
        {
            "homeassistant": homeassistant,
            "homeassistant.core": core,
            "homeassistant.components": components,
            "homeassistant.components.number": components_number,
            "homeassistant.components.select": components_select,
            "homeassistant.components.switch": components_switch,
            "homeassistant.config_entries": config_entries,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.event": event,
            "homeassistant.helpers.storage": storage,
            "homeassistant.helpers.entity_platform": entity_platform,
            "homeassistant.helpers.restore_state": restore_state,
            "homeassistant.helpers.entity_registry": entity_registry,
            "homeassistant.helpers.device_registry": device_registry,
            "homeassistant.helpers.entity": entity_module,
            "homeassistant.util": util,
            "homeassistant.util.dt": dt,
        }
    )


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_install_home_assistant_stubs()
package = types.ModuleType("custom_components.deye_energy")
package.__path__ = [str(PACKAGE)]
sys.modules[package.__name__] = package
const = _load_module(f"{package.__name__}.const", PACKAGE / "const.py")
manager = _load_module(f"{package.__name__}.manager", PACKAGE / "manager.py")
manager.ha_now = lambda: datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
number = _load_module(f"{package.__name__}.number", PACKAGE / "number.py")
select_module = _load_module(f"{package.__name__}.select", PACKAGE / "select.py")
switch_module = _load_module(f"{package.__name__}.switch", PACKAGE / "switch.py")


class FakeState:
    def __init__(self, state, attributes=None, entity_id=""):
        self.entity_id = entity_id
        self.state = str(state)
        self.attributes = attributes or {}
        # Mirror the minimum timestamp contract of a real HA State. Individual
        # freshness tests may still add/advance ``last_reported`` explicitly.
        self.last_changed = manager.ha_now()
        self.last_updated = manager.ha_now()


class FakeStates:
    def __init__(self, values=None):
        self.values = values or {}
        for entity_id, state in self.values.items():
            state.entity_id = entity_id

    def get(self, entity_id):
        return self.values.get(entity_id)

    def async_all(self, domain=None):
        prefix = f"{domain}." if domain else ""
        return [state for entity_id, state in self.values.items() if entity_id.startswith(prefix)]


class FakeServices:
    def __init__(self, hass):
        self.hass = hass
        self.calls = []
        self.failures = []

    def ignore_once(self, domain, service, *, entity_id=None, option=None):
        self.failures.append({"domain": domain, "service": service, "entity_id": entity_id, "option": option, "remaining": 1, "ignore": True})

    def fail_once(self, domain, service, *, entity_id=None, option=None):
        self.failures.append(
            {
                "domain": domain,
                "service": service,
                "entity_id": entity_id,
                "option": option,
                "remaining": 1,
            }
        )

    async def async_call(self, domain, service, data, blocking=False):
        self.calls.append((domain, service, dict(data), blocking))
        for failure in self.failures:
            if failure["remaining"] <= 0:
                continue
            if failure["domain"] != domain or failure["service"] != service:
                continue
            if failure["entity_id"] is not None and data.get("entity_id") != failure["entity_id"]:
                continue
            if failure["option"] is not None and data.get("option") != failure["option"]:
                continue
            failure["remaining"] -= 1
            if failure.get("ignore"):
                return
            raise RuntimeError(f"Injected {domain}.{service} failure")

        entity_id = data.get("entity_id")
        if not entity_id:
            return
        if domain == "select" and service == "select_option":
            value = data["option"]
        elif domain == "number" and service == "set_value":
            value = data["value"]
        elif domain == "switch":
            value = "on" if service == "turn_on" else "off"
        elif domain == "time" and service == "set_value":
            value = data["time"]
        else:
            return
        self.hass.states.values[entity_id] = FakeState(value, entity_id=entity_id)


class FakeHass:
    def __init__(self, states):
        self.states = FakeStates(states)
        self.services = FakeServices(self)

    def async_create_task(self, coroutine):
        coroutine.close()
        return None


def make_runtime(soc="50", price="0.50", default_mode=None):
    states = {
        const.DEFAULT_WORK_MODE_SELECT: FakeState(const.MODE_ZERO_EXPORT),
        const.DEFAULT_MAX_SELL_POWER: FakeState("0"),
    }
    for idx in range(1, 7):
        states[f"time.deye_inverter_time_of_use_{idx}_start"] = FakeState("00:00:00")
        states[f"number.deye_inverter_time_of_use_{idx}_soc"] = FakeState("20")
        states[f"switch.deye_inverter_time_of_use_{idx}_grid_charge"] = FakeState("off")
    if soc is not None:
        states[const.DEFAULT_BATTERY_SOC] = FakeState(soc)
    if price is not None:
        states["sensor.octopus_export_current_rate"] = FakeState(price)
    runtime = manager.DeyeEnergyRuntime(
        hass=FakeHass(states),
        entry_id="test",
        data={
            const.CONF_INVERTER_PROVIDER: const.PROVIDER_LEWA_REKA,
            const.CONF_WORK_MODE_SELECT: const.DEFAULT_WORK_MODE_SELECT,
            const.CONF_MAX_SELL_POWER_NUMBER: const.DEFAULT_MAX_SELL_POWER,
            const.CONF_BATTERY_SOC_SENSOR: const.DEFAULT_BATTERY_SOC,
            const.CONF_PRICE_SENSOR: "sensor.octopus_export_current_rate",
            **{
                const.conf_tou_entity(idx, kind): entity_id
                for idx in range(1, 7)
                for kind, entity_id in (
                    ("start", f"time.deye_inverter_time_of_use_{idx}_start"),
                    ("soc", f"number.deye_inverter_time_of_use_{idx}_soc"),
                    ("grid", f"switch.deye_inverter_time_of_use_{idx}_grid_charge"),
                )
            },
        },
    )
    runtime.default_work_mode = default_mode or const.MODE_NORMAL_OPERATION
    runtime.default_sell_power = const.DEFAULT_INVERTER_MAX_POWER_W
    # The regular fixture represents a configuration whose physical TOU SOC
    # values have already been confirmed through the six physical TOU entities.
    return runtime


CONTROL_NUMBERS = {
    const.DEFAULT_MAX_SELL_POWER: const.DEFAULT_INVERTER_MAX_POWER_W,
}


def hour_snapshot(runtime):
    """Mapping snapshot with whole-hour start/end for hour-aligned schedules."""
    return [
        {
            "range": item["range"],
            "start": item["start"] // 60,
            "end": item["end"] // 60,
            "tou_soc": item["tou_soc"],
            "grid_charge": item["grid_charge"],
        }
        for item in runtime.schedule_mapping_snapshot()
    ]



def control_number_calls(runtime):
    return [
        call
        for call in runtime.hass.services.calls
        if call[:2] == ("number", "set_value") and call[2].get("entity_id") in CONTROL_NUMBERS
    ]


class DataSourceQualityTests(unittest.TestCase):
    @staticmethod
    def _power(value, unit="W"):
        return FakeState(value, {"unit_of_measurement": unit})

    def test_load_power_remains_primary_and_phases_are_not_added_twice(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_LOAD_POWER_SENSOR: self._power(756),
            const.DEFAULT_LOAD_L1_POWER_SENSOR: self._power(44),
            const.DEFAULT_LOAD_L2_POWER_SENSOR: self._power(535),
            const.DEFAULT_LOAD_L3_POWER_SENSOR: self._power(177),
        })
        reading = runtime.load_power_reading()
        self.assertEqual(reading["source"], "primary")
        self.assertEqual(reading["value"], 756)
        self.assertEqual(reading["phase_sum_w"], 756)

    def test_complete_load_phases_are_fallback_when_total_is_unavailable(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_LOAD_POWER_SENSOR: FakeState("unavailable", {"unit_of_measurement": "W"}),
            const.DEFAULT_LOAD_L1_POWER_SENSOR: self._power(100),
            const.DEFAULT_LOAD_L2_POWER_SENSOR: self._power(200),
            const.DEFAULT_LOAD_L3_POWER_SENSOR: self._power(300),
        })
        reading = runtime.load_power_reading()
        self.assertEqual(reading["source"], "load_phases")
        self.assertEqual(reading["value"], 600)
        self.assertEqual(reading["quality"], "degraded")

    def test_missing_phase_prevents_phase_sum_fallback(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_LOAD_POWER_SENSOR: FakeState("unavailable", {"unit_of_measurement": "W"}),
            const.DEFAULT_LOAD_L1_POWER_SENSOR: self._power(100),
            const.DEFAULT_LOAD_L2_POWER_SENSOR: self._power(200),
        })
        reading = runtime.load_power_reading()
        self.assertNotEqual(reading["source"], "load_phases")
        self.assertIsNone(reading["value"])

    def test_load_disagreement_reduces_quality_without_replacing_total(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_LOAD_POWER_SENSOR: self._power(1000),
            const.DEFAULT_LOAD_L1_POWER_SENSOR: self._power(100),
            const.DEFAULT_LOAD_L2_POWER_SENSOR: self._power(100),
            const.DEFAULT_LOAD_L3_POWER_SENSOR: self._power(100),
        })
        reading = runtime.load_power_reading()
        self.assertEqual(reading["value"], 1000)
        self.assertEqual(reading["status"], "inconsistent")
        self.assertEqual(reading["quality"], "degraded")

    def test_direct_battery_power_wins_over_voltage_times_current(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_BATTERY_POWER_SENSOR: self._power(500),
            const.DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR: FakeState(50, {"unit_of_measurement": "V"}),
            const.DEFAULT_BATTERY_CURRENT_SENSOR: FakeState(20, {"unit_of_measurement": "A"}),
        })
        reading = runtime.battery_power_reading()
        self.assertEqual(reading["source"], "primary")
        self.assertEqual(reading["value"], 500)

    def test_solarman_rejects_misleading_grid_total_and_uses_phase_sum(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_SOLARMAN
        runtime.data.update({
            const.CONF_GRID_POWER_SENSOR: const.DEFAULT_GRID_POWER_SENSOR,
            const.CONF_GRID_L1_POWER_SENSOR: const.DEFAULT_GRID_L1_POWER_SENSOR,
            const.CONF_GRID_L2_POWER_SENSOR: const.DEFAULT_GRID_L2_POWER_SENSOR,
            const.CONF_GRID_L3_POWER_SENSOR: const.DEFAULT_GRID_L3_POWER_SENSOR,
        })
        runtime.hass.states.values.update({
            const.DEFAULT_GRID_POWER_SENSOR: self._power(85),
            const.DEFAULT_GRID_L1_POWER_SENSOR: self._power(-1000),
            const.DEFAULT_GRID_L2_POWER_SENSOR: self._power(-991),
            const.DEFAULT_GRID_L3_POWER_SENSOR: self._power(-998),
        })

        reading = runtime.grid_power_reading()

        self.assertEqual(reading["source"], "grid_phases")
        self.assertEqual(reading["value"], -2989)
        self.assertEqual(runtime.normalized_grid_power(), -2989)
        self.assertEqual(reading["quality"], "degraded")

    def test_non_solarman_keeps_grid_total_but_marks_phase_disagreement(self):
        runtime = make_runtime()
        runtime.hass.states.values.update({
            const.DEFAULT_GRID_POWER_SENSOR: self._power(85),
            const.DEFAULT_GRID_L1_POWER_SENSOR: self._power(-1000),
            const.DEFAULT_GRID_L2_POWER_SENSOR: self._power(-991),
            const.DEFAULT_GRID_L3_POWER_SENSOR: self._power(-998),
        })

        reading = runtime.grid_power_reading()

        self.assertEqual(reading["value"], 85)
        self.assertEqual(reading["status"], "inconsistent")
        self.assertEqual(reading["quality"], "degraded")

    def test_daily_energy_value_normalizes_wh_to_kwh(self):
        runtime = make_runtime()
        entity_id = "sensor.solarman_daily_grid_export"
        runtime.hass.states.values[entity_id] = FakeState(
            600,
            {"unit_of_measurement": "Wh"},
            entity_id=entity_id,
        )

        self.assertAlmostEqual(runtime.daily_energy_value(entity_id), 0.6)

    def test_physical_tou_end_comes_from_next_actual_start(self):
        runtime = make_runtime()
        starts = ("00:00:00", "06:00:00", "09:00:00", "13:00:00", "16:00:00", "20:00:00")
        for index, value in enumerate(starts, start=1):
            runtime.hass.states.values[f"time.deye_inverter_time_of_use_{index}_start"] = FakeState(value)

        rows = runtime.physical_tou_snapshot()

        self.assertEqual(
            [row["actual_end"][:5] for row in rows],
            ["06:00", "09:00", "13:00", "16:00", "20:00", "00:00"],
        )

    def test_daily_export_counter_is_authoritative_for_current_day_energy(self):
        runtime = make_runtime()
        entity_id = "sensor.solarman_daily_grid_export"
        runtime.data[const.CONF_DAILY_ENERGY_SOLD_SENSOR] = entity_id
        runtime.hass.states.values[entity_id] = FakeState(
            0.60,
            {"unit_of_measurement": "kWh"},
            entity_id=entity_id,
        )
        runtime.sales_stats = runtime.empty_sales_stats()
        runtime.sales_stats["hourly"]["12"] = {"kwh": 0.02, "value": 0.01}

        runtime.refresh_sales_totals()

        self.assertEqual(runtime.sold_energy_today, 0.6)
        self.assertEqual(runtime.sold_value_today, 0.01)
        self.assertEqual(runtime.data_quality["sales_today"]["energy_source"], "daily_export_counter")
        self.assertEqual(runtime.data_quality["sales_today"]["difference_kwh"], 0.58)

    def test_hourly_price_parser_preserves_zero_and_negative_values(self):
        runtime = make_runtime()
        entity_id = "sensor.test_hourly_prices"
        runtime.hass.states.values[entity_id] = FakeState(
            "unavailable",
            {
                "prices": [
                    {"hour": "01:00", "price": 0.0},
                    {"hour": "02:00", "price": -0.25},
                    {"hour": "03:00", "price": None},
                ]
            },
            entity_id=entity_id,
        )
        self.assertEqual({1: 0.0, 2: -0.25}, runtime.price_map(entity_id))


class SafetyTests(unittest.TestCase):
    def assert_safe_defaults(self, runtime, expected_mode=const.MODE_ZERO_EXPORT):
        self.assertEqual(runtime.target_sell_power, runtime.default_sell_power)
        # Safe defaults keep the configured default work mode/profile; verify
        # the effective target resolves to that default.
        self.assertEqual(runtime.default_work_mode, runtime.default_work_mode)
        mode_calls = [
            c for c in runtime.hass.services.calls
            if c[:2] == ("select", "select_option")
            and c[2].get("entity_id") == const.DEFAULT_WORK_MODE_SELECT
        ]
        self.assertTrue(mode_calls)
        self.assertEqual(mode_calls[-1][2].get("option"), expected_mode)

    @staticmethod
    def _tou_calls(runtime):
        return [
            call
            for call in runtime.hass.services.calls
            if call[:2] in (
                ("number", "set_value"),
                ("time", "set_value"),
                ("select", "select_option"),
                ("switch", "turn_on"),
                ("switch", "turn_off"),
            )
            and ("time_of_use" in str(call[2].get("entity_id", "")) or "_tou_" in str(call[2].get("entity_id", "")))
        ]

    def test_default_control_confirmation_window_is_30_seconds(self):
        self.assertEqual(make_runtime().control_confirmation_timeout, 30.0)

    def test_unavailable_control_entity_still_gates_inverter_link(self):
        runtime = make_runtime()
        entity_id = runtime._control_confirmation_entities()[0]
        runtime.hass.states.values[entity_id].state = "unavailable"
        self.assertIn(entity_id, runtime._inverter_link_issue())

    def test_stale_unchanged_mqtt_control_entities_do_not_gate_inverter_link(self):
        runtime = make_runtime()
        stale_at = manager.ha_now() - timedelta(seconds=901)
        for entity_id in runtime._control_confirmation_entities():
            state = runtime.hass.states.get(entity_id)
            state.last_reported = stale_at
            state.last_updated = stale_at
        self.assertEqual(runtime._inverter_link_issue(), "")

    def test_stale_measurement_sensor_still_gates_inverter_link(self):
        runtime = make_runtime()
        sensor_id = "sensor.deye_grid_power"
        runtime.hass.states.values[sensor_id] = FakeState("0", entity_id=sensor_id)
        runtime.hass.states.values[sensor_id].last_reported = manager.ha_now() - timedelta(seconds=901)
        with mock.patch.object(
            manager.DeyeEnergyRuntime,
            "_control_confirmation_entities",
            return_value=[sensor_id],
        ):
            self.assertIn(sensor_id, runtime._inverter_link_issue())

    def test_required_entities_complete_includes_battery_soc(self):
        runtime = make_runtime()
        self.assertTrue(runtime.required_entities_complete)

    def test_required_entities_complete_false_when_soc_missing(self):
        runtime = make_runtime(soc=None)
        self.assertFalse(runtime.required_entities_complete)
        self.assertTrue(runtime.data_available)

    def test_required_entities_do_not_include_direct_current_limits(self):
        runtime = make_runtime()
        self.assertTrue(runtime.required_entities_complete)
        for entity_id in (
            const.DEFAULT_DISCHARGE_CURRENT,
            const.DEFAULT_CHARGE_CURRENT,
            const.DEFAULT_GRID_CHARGE_CURRENT,
        ):
            self.assertNotIn(entity_id, str(runtime._control_confirmation_entities()))

    def test_read_only_provider_fails_closed_even_with_old_control_entities(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_DEYE_ADDON

        self.assertFalse(runtime.data_available)
        self.assertFalse(runtime.required_entities_complete)
        with self.assertRaisesRegex(ValueError, "does not support inverter control"):
            asyncio.run(runtime.async_set_work_mode(const.MODE_SELLING_FIRST))
        self.assertEqual(runtime.hass.services.calls, [])

    def test_read_only_provider_rejects_plan_before_first_write(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_DEYE_ADDON

        with self.assertRaisesRegex(ValueError, "does not support inverter control"):
            runtime._validate_control_plan(
                const.MODE_NORMAL_OPERATION, 0.0)
        self.assertEqual(runtime.hass.services.calls, [])

    def test_missing_soc_blocks_selling(self):
        runtime = make_runtime(soc=None)
        self.assertTrue(runtime.data_available)
        self.assertFalse(runtime.soc_ok)
        self.assertFalse(runtime.sell_allowed)

    def test_unavailable_and_non_finite_soc_block_selling(self):
        for value in ("unavailable", "unknown", "nan", "inf"):
            with self.subTest(value=value):
                runtime = make_runtime(soc=value)
                self.assertFalse(runtime.soc_ok)
                self.assertFalse(runtime.sell_allowed)

    def test_price_guard_fails_closed(self):
        runtime = make_runtime(price=None)
        runtime.price_guard_enabled = True
        runtime.price_sell_threshold = 0.2
        self.assertTrue(runtime.data_available)
        self.assertFalse(runtime.price_ok)
        self.assertFalse(runtime.sell_allowed)

    def test_disabled_price_guard_does_not_require_price(self):
        runtime = make_runtime(price=None)
        runtime.price_guard_enabled = False
        runtime.price_sell_threshold = 0.2
        self.assertTrue(runtime.data_available)
        self.assertTrue(runtime.price_ok)

    def test_stop_sell_applies_defaults_and_remains_latched(self):
        runtime = make_runtime()
        asyncio.run(runtime.async_request_stop())
        self.assertEqual(runtime.control_mode, "Stop Sell")
        self.assert_safe_defaults(runtime)
        self.assertEqual(runtime.default_sell_power, const.DEFAULT_INVERTER_MAX_POWER_W)
        runtime.hass.services.calls.clear()
        asyncio.run(runtime.async_tick())
        self.assertEqual(runtime.control_mode, "Stop Sell")
        self.assert_safe_defaults(runtime)

    def test_emergency_stop_latches_stopped_control_mode(self):
        runtime = make_runtime()
        runtime.scheduler_enabled = True
        asyncio.run(runtime.async_emergency_stop())
        self.assertTrue(runtime.emergency_stop)
        self.assertEqual(runtime.control_mode, "Stop Sell")
        self.assert_safe_defaults(runtime)
        runtime.emergency_stop = False
        runtime.hass.services.calls.clear()
        asyncio.run(runtime.async_tick())
        self.assertEqual(runtime.control_mode, "Stop Sell")
        self.assert_safe_defaults(runtime)

    def test_safe_defaults_preserve_a_configured_selling_first_mode(self):
        runtime = make_runtime(default_mode=const.MODE_SELLING_FIRST)
        asyncio.run(runtime.async_emergency_stop())
        self.assert_safe_defaults(runtime, "Selling First")

    def test_safe_defaults_preserve_zero_export_to_ct(self):
        runtime = make_runtime(default_mode=const.MODE_NORMAL_OPERATION)
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        asyncio.run(runtime.async_emergency_stop())
        self.assert_safe_defaults(runtime, const.MODE_ZERO_EXPORT_CT)

    def test_user_selected_zero_defaults_are_respected(self):
        runtime = make_runtime()
        runtime.default_sell_power = 0
        asyncio.run(runtime.async_request_stop())
        calls = control_number_calls(runtime)
        self.assertEqual({call[2]["value"] for call in calls}, {0})

    def test_partial_safe_default_failure_is_reported_as_critical(self):
        runtime = make_runtime(default_mode=const.MODE_NORMAL_OPERATION)
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        runtime.hass.services.fail_once("number", "set_value")
        self.assertFalse(asyncio.run(runtime.async_apply_safe_defaults("Test awarii")))
        self.assertIn("CRITICAL", runtime.last_error)
        self.assertIn("Max Sell Power", runtime.last_error)
        select_calls = [call for call in runtime.hass.services.calls if call[:2] == ("select", "select_option")]
        self.assertTrue(select_calls)
        self.assertTrue(all(call[2]["option"] == const.MODE_ZERO_EXPORT_CT for call in select_calls))

    def test_direct_selling_is_blocked_without_soc(self):
        runtime = make_runtime(soc=None)
        with self.assertRaises(ValueError):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))
        self.assert_safe_defaults(runtime)

    def test_apply_settings_does_not_write_direct_current_limits(self):
        runtime = make_runtime()
        asyncio.run(runtime.async_apply_settings(const.MODE_NORMAL_OPERATION, 0))
        written = {call[2].get("entity_id") for call in runtime.hass.services.calls}
        for entity_id in (
            const.DEFAULT_DISCHARGE_CURRENT,
            const.DEFAULT_CHARGE_CURRENT,
            const.DEFAULT_GRID_CHARGE_CURRENT,
        ):
            self.assertNotIn(entity_id, written)

    def test_apply_settings_leaves_direct_current_states_unchanged(self):
        runtime = make_runtime()
        direct_currents = {
            const.DEFAULT_DISCHARGE_CURRENT: FakeState("30"),
            const.DEFAULT_CHARGE_CURRENT: FakeState("45"),
            const.DEFAULT_GRID_CHARGE_CURRENT: FakeState("60"),
        }
        runtime.hass.states.values.update(direct_currents)
        asyncio.run(runtime.async_apply_settings(const.MODE_NORMAL_OPERATION, 0))
        for entity_id, original in direct_currents.items():
            self.assertIs(runtime.hass.states.get(entity_id), original)

    def test_background_schedule_reconciliation_coalesces_rapid_requests(self):
        runtime = make_runtime()

        async def scenario():
            tick_calls = 0

            async def tracked_tick():
                nonlocal tick_calls
                tick_calls += 1
                return True

            runtime._async_tick_impl = tracked_tick
            runtime.hass.async_create_task = asyncio.create_task
            runtime._schedule_schedule_reconciliation()
            first_task = runtime._schedule_reconcile_task
            runtime._schedule_schedule_reconciliation()

            self.assertIs(first_task, runtime._schedule_reconcile_task)
            await first_task
            self.assertEqual(tick_calls, 1)
            self.assertIsNone(runtime._schedule_reconcile_task)
            self.assertFalse(runtime._schedule_reconcile_requested)

        asyncio.run(scenario())

    def test_direct_settings_do_not_use_transitional_zeroes(self):
        runtime = make_runtime()
        asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))
        self.assertFalse(any(call[2]["value"] == 0 for call in control_number_calls(runtime)))
        select_calls = [call for call in runtime.hass.services.calls if call[:2] == ("select", "select_option")]
        self.assertEqual(len(select_calls), 1)
        self.assertEqual(select_calls[-1][2]["option"], "Selling First")

    def test_restore_defaults_uses_exact_mode_after_all_numeric_values(self):
        for default_mode, physical_variant, expected_option in (
            (const.MODE_NORMAL_OPERATION, const.MODE_ZERO_EXPORT, const.MODE_ZERO_EXPORT),
            (const.MODE_NORMAL_OPERATION, const.MODE_ZERO_EXPORT_CT, const.MODE_ZERO_EXPORT_CT),
            (const.MODE_SELLING_FIRST, None, "Selling First"),
        ):
            with self.subTest(mode=default_mode, physical=physical_variant):
                runtime = make_runtime(default_mode=default_mode)
                if physical_variant:
                    runtime.normal_profile_physical_work_mode = physical_variant
                runtime.scheduler_enabled = True

                asyncio.run(runtime.async_restore_defaults())

                ordered_control_calls = [
                    call
                    for call in runtime.hass.services.calls
                    if call[:2] in (("select", "select_option"), ("number", "set_value"))
                    and (
                        call[2].get("entity_id") == const.DEFAULT_WORK_MODE_SELECT
                        or call[2].get("entity_id") in CONTROL_NUMBERS
                    )
                ]
                self.assertEqual(
                    [call[2]["entity_id"] for call in ordered_control_calls[:-1]],
                    list(CONTROL_NUMBERS),
                )
                self.assertEqual(
                    [call[2]["value"] for call in ordered_control_calls[:-1]],
                    list(CONTROL_NUMBERS.values()),
                )
                self.assertEqual(ordered_control_calls[-1][2]["option"], expected_option)
                self.assertFalse(runtime.scheduler_enabled)
                self.assertEqual(runtime.last_error, "")

    def test_restore_defaults_raises_when_full_set_is_not_confirmed(self):
        runtime = make_runtime(default_mode=const.MODE_NORMAL_OPERATION)
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        runtime.hass.services.fail_once("number", "set_value")

        with self.assertRaisesRegex(RuntimeError, "CRITICAL"):
            asyncio.run(runtime.async_restore_defaults())

        self.assertIn("Max Sell Power", runtime.last_error)
        self.assertNotEqual(runtime.last_error, "")


class ApplySettingsTransactionTests(unittest.TestCase):
    @staticmethod
    async def _run_under_fake_time(runtime, coro, state_restorer):
        """Run coroutine with patched loop.time() and manager.asyncio.sleep.

        ``state_restorer`` receives the fake monotonic time after each sleep.
        """
        fake_time = [0.0]
        loop = asyncio.get_running_loop()
        real_time = loop.time
        real_sleep = manager.asyncio.sleep

        async def fake_sleep(delay, result=None):
            fake_time[0] += delay
            state_restorer(fake_time[0])
            await real_sleep(0)
            return result

        with mock.patch.object(loop, "time", side_effect=lambda: fake_time[0]):
            with mock.patch.object(manager.asyncio, "sleep", fake_sleep):
                try:
                    return await coro
                finally:
                    loop.time = real_time

    def test_apply_settings_confirms_immediately_when_values_match(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState("Selling First")
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState("5000")

        asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

        self.assertEqual(runtime.last_action, "Direct settings applied")
        self.assertEqual(runtime.last_error, "")

    def test_apply_settings_rejects_unreadable_snapshot_entities(self):
        runtime = make_runtime()
        # A non-numeric sell-power state is still "available" for sell_allowed,
        # but the snapshot parser cannot read it, so the transaction aborts early.
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState("not_a_number")

        with self.assertRaisesRegex(RuntimeError, "snapshot"):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

    def test_apply_settings_rolls_back_on_write_failure(self):
        runtime = make_runtime()
        runtime.hass.services.fail_once("number", "set_value")
        original_values = {
            const.DEFAULT_WORK_MODE_SELECT: str(runtime.hass.states.get(const.DEFAULT_WORK_MODE_SELECT).state),
            const.DEFAULT_MAX_SELL_POWER: str(runtime.hass.states.get(const.DEFAULT_MAX_SELL_POWER).state),
        }

        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

        self.assertIn("Changes rolled back", runtime.last_action)
        for entity_id, expected in original_values.items():
            actual = runtime.hass.states.values[entity_id].state
            if entity_id == const.DEFAULT_WORK_MODE_SELECT:
                self.assertEqual(str(actual), expected, entity_id)
            else:
                self.assertAlmostEqual(float(actual), float(expected), places=3, msg=entity_id)

    def test_apply_settings_rolls_back_on_confirmation_timeout(self):
        runtime = make_runtime()
        runtime.control_confirmation_timeout = 0
        # Prevent the work mode write from updating the fake state so confirmation
        # fails immediately within the zero-second window.
        runtime.hass.services.ignore_once(
            "select", "select_option", entity_id=const.DEFAULT_WORK_MODE_SELECT,
            option="Selling First",
        )
        original_values = {
            const.DEFAULT_WORK_MODE_SELECT: str(runtime.hass.states.get(const.DEFAULT_WORK_MODE_SELECT).state),
            const.DEFAULT_MAX_SELL_POWER: str(runtime.hass.states.get(const.DEFAULT_MAX_SELL_POWER).state),
        }

        with self.assertRaisesRegex(RuntimeError, "Unconfirmed settings"):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

        self.assertIn("Changes rolled back", runtime.last_action)
        for entity_id, expected in original_values.items():
            actual = runtime.hass.states.values[entity_id].state
            if entity_id == const.DEFAULT_WORK_MODE_SELECT:
                self.assertEqual(str(actual), expected, entity_id)
            else:
                self.assertAlmostEqual(float(actual), float(expected), places=3, msg=entity_id)

    def test_rollback_uses_control_confirmation_timeout(self):
        runtime = make_runtime()
        runtime.control_confirmation_timeout = 7.0

        snapshot, _ = runtime._control_entities_to_write(const.MODE_SELLING_FIRST)
        # Put wrong values on the entities so rollback has something to restore.
        runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState("Selling First")
        for entity_id in CONTROL_NUMBERS:
            runtime.hass.states.values[entity_id] = FakeState("9999")

        # Ignore rollback writes so readback lags and confirmation loop is exercised.
        for entity_id in CONTROL_NUMBERS:
            runtime.hass.services.ignore_once("number", "set_value", entity_id=entity_id)
        runtime.hass.services.ignore_once(
            "select", "select_option",
            entity_id=const.DEFAULT_WORK_MODE_SELECT,
            option=snapshot[const.DEFAULT_WORK_MODE_SELECT][1],
        )

        restored = [False]

        def restore_states(fake_time):
            if not restored[0] and fake_time > 5.5:
                runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState(
                    snapshot[const.DEFAULT_WORK_MODE_SELECT][1]
                )
                for entity_id in CONTROL_NUMBERS:
                    runtime.hass.states.values[entity_id] = FakeState(snapshot[entity_id][1])
                restored[0] = True

        async def _scenario():
            return await self._run_under_fake_time(
                runtime, runtime._async_rollback_control_values(snapshot), restore_states
            )

        self.assertTrue(asyncio.run(_scenario()))

    def test_delayed_confirmation_succeeds_without_rewriting(self):
        runtime = make_runtime()
        runtime.control_confirmation_timeout = 0.5

        # Ignore the real writes so states lag and confirmation loop is needed.
        for entity_id in CONTROL_NUMBERS:
            runtime.hass.services.ignore_once("number", "set_value", entity_id=entity_id)
        runtime.hass.services.ignore_once(
            "select", "select_option",
            entity_id=const.DEFAULT_WORK_MODE_SELECT,
            option="Selling First",
        )

        expected = {
            const.DEFAULT_WORK_MODE_SELECT: "Selling First",
            const.DEFAULT_MAX_SELL_POWER: "5000",
        }

        def restore_states(fake_time):
            if fake_time > 0.2:
                for entity_id, value in expected.items():
                    runtime.hass.states.values[entity_id] = FakeState(value, entity_id=entity_id)

        async def _scenario():
            await self._run_under_fake_time(
                runtime,
                runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000),
                restore_states,
            )

        asyncio.run(_scenario())

        self.assertEqual(runtime.last_action, "Direct settings applied")
        self.assertEqual(runtime.last_error, "")
        for entity_id in CONTROL_NUMBERS:
            calls = [
                c for c in runtime.hass.services.calls
                if c[:2] == ("number", "set_value") and c[2].get("entity_id") == entity_id
            ]
            self.assertEqual(len(calls), 1, entity_id)
        mode_calls = [
            c for c in runtime.hass.services.calls
            if c[:2] == ("select", "select_option")
            and c[2].get("entity_id") == const.DEFAULT_WORK_MODE_SELECT
        ]
        self.assertEqual(len(mode_calls), 1)

    def test_incomplete_rollback_triggers_safe_defaults(self):
        runtime = make_runtime()
        runtime.control_confirmation_timeout = 0.5

        # Ignore the initial work mode write so the confirmation loop fails and
        # triggers rollback; the number write still updates state so we can
        # observe partial restoration.
        runtime.hass.services.ignore_once(
            "select", "select_option",
            entity_id=const.DEFAULT_WORK_MODE_SELECT,
            option="Selling First",
        )

        original_restore = runtime._async_restore_raw_entity

        async def failing_restore(entity_id: str, raw_value: str) -> None:
            if entity_id == const.DEFAULT_WORK_MODE_SELECT:
                raise RuntimeError("Injected rollback failure for System Work Mode")
            await original_restore(entity_id, raw_value)

        runtime._async_restore_raw_entity = failing_restore

        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

        self.assertIn("Default settings applied", runtime.last_action)
        self.assertIn("System Work Mode", runtime.last_error)
        # The number was restored before the failing work mode write.
        max_sell_rollback = [
            c for c in runtime.hass.services.calls
            if c[:2] == ("number", "set_value")
            and c[2].get("entity_id") == const.DEFAULT_MAX_SELL_POWER
            and c[2].get("value") == 0
        ]
        self.assertTrue(max_sell_rollback)

    def test_emergency_stop_aborts_pending_confirmation(self):
        runtime = make_runtime()
        original_wait = runtime._async_wait_for_control_confirmation

        async def _wait_with_emergency(*args, **kwargs):
            runtime.emergency_stop = True
            return await original_wait(*args, **kwargs)

        runtime._async_wait_for_control_confirmation = _wait_with_emergency

        with self.assertRaisesRegex(RuntimeError, "emergency stop"):
            asyncio.run(runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000))

        self.assertTrue(runtime.emergency_stop)

    def test_real_emergency_stop_during_confirmation(self):
        runtime = make_runtime()
        runtime.control_confirmation_timeout = 10.0

        # Ignore writes so async_apply_settings stays in the confirmation loop.
        for entity_id in CONTROL_NUMBERS:
            runtime.hass.services.ignore_once("number", "set_value", entity_id=entity_id)
        runtime.hass.services.ignore_once(
            "select", "select_option",
            entity_id=const.DEFAULT_WORK_MODE_SELECT,
            option="Selling First",
        )

        async def _scenario():
            apply_task = asyncio.create_task(
                runtime.async_apply_settings(const.MODE_SELLING_FIRST, 5000)
            )
            await asyncio.sleep(0.1)
            self.assertFalse(runtime.emergency_stop)
            stop_task = asyncio.create_task(runtime.async_emergency_stop())
            results = await asyncio.gather(apply_task, stop_task, return_exceptions=True)
            return results

        results = asyncio.run(_scenario())
        apply_result = results[0]

        self.assertIsInstance(apply_result, RuntimeError)
        self.assertIn("emergency stop", str(apply_result).lower())
        self.assertTrue(runtime.emergency_stop)
        self.assertEqual(runtime.control_mode, "Stop Sell")
        # async_emergency_stop() applied safe defaults exactly once.
        self.assertIn("Default settings applied", runtime.last_action)
        self.assertIn("Emergency stop", runtime.last_error)

    def test_emergency_stop_sets_flag_before_acquiring_lock(self):
        runtime = make_runtime()

        async def _hold_lock():
            async with runtime._operation_lock:
                # Give async_emergency_stop time to set the flag while blocked.
                await asyncio.sleep(0.1)
                self.assertTrue(runtime.emergency_stop)

        async def _main():
            await asyncio.gather(_hold_lock(), runtime.async_emergency_stop())

        asyncio.run(_main())
        self.assertTrue(runtime.emergency_stop)
        self.assertEqual(runtime.control_mode, "Stop Sell")

    def test_save_charge_profile_while_stopped_persists_without_deye_calls(self):
        runtime = make_runtime()
        runtime.control_mode = "Stop Sell"
        runtime.scheduler_enabled = False
        calls_before = list(runtime.hass.services.calls)

        asyncio.run(runtime.async_save_charge_profile({
            "target_soc": 85,
            "grid_charge_enabled": True,
        }))

        self.assertEqual(runtime.hass.services.calls, calls_before)
        self.assertEqual(
            runtime.last_action,
            "Charging settings template saved",
        )

    def test_save_normal_profile_rejects_non_physical_mode(self):
        runtime = make_runtime()
        with self.assertRaises(ValueError):
            asyncio.run(runtime.async_save_normal_profile({
                "physical_work_mode": const.MODE_NORMAL_OPERATION,
                "sell_power": 1000,
                "tou_soc": 50,
            }))

    def test_save_normal_profile_partial_update_preserves_existing_tou_soc(self):
        runtime = make_runtime()
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        runtime.normal_profile_tou_soc = 75
        runtime.normal_profile_sell_power = 2500
        asyncio.run(runtime.async_save_normal_profile({
            "physical_work_mode": const.MODE_ZERO_EXPORT,
        }))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT)
        self.assertEqual(runtime.normal_profile_tou_soc, 75)
        self.assertEqual(runtime.normal_profile_sell_power, 2500)

    def test_save_normal_profile_rejects_explicit_nan_tou_soc(self):
        runtime = make_runtime()
        with self.assertRaises(ValueError):
            asyncio.run(runtime.async_save_normal_profile({
            "physical_work_mode": const.MODE_ZERO_EXPORT,
                "sell_power": 1000,
                "tou_soc": None,
            }))


class ChargeProfileSlotReloadTests(unittest.TestCase):
    """Regression coverage for copying the Charge template into slots."""

    def _runtime_for_provider(self, provider):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = provider
        return runtime

    def _configure_charge_profile(self, runtime):
        runtime.charge_profile_target_soc = 80
        runtime.charge_profile_grid_enabled = True

    def test_normal_profile_select_exposes_only_english_labels(self):
        runtime = self._runtime_for_provider(const.PROVIDER_LEWA_REKA)
        select = select_module.DeyeNormalProfileModeSelect(runtime)
        self.assertEqual(
            select.options,
            [
                "Export disabled — Load measurement",
                "Export disabled — CT measurement",
            ],
        )

    def test_normal_profile_select_restores_legacy_provider_value_as_english_label(self):
        runtime = self._runtime_for_provider(const.PROVIDER_LEWA_REKA)
        key = select_module.physical_normal_option_to_key(
            runtime.data, "Zero Export To CT"
        )
        self.assertEqual(key, const.MODE_ZERO_EXPORT_CT)

    def test_normal_profile_english_label_maps_to_lewa_reka_option(self):
        runtime = self._runtime_for_provider(const.PROVIDER_LEWA_REKA)
        key = select_module.normal_profile_mode_label_to_key(
            runtime.data, "Export disabled — Load measurement"
        )
        self.assertEqual(key, const.MODE_ZERO_EXPORT)

    def test_normal_profile_english_label_maps_to_solarman_option(self):
        runtime = self._runtime_for_provider(const.PROVIDER_SOLARMAN)
        select = select_module.DeyeNormalProfileModeSelect(runtime)
        self.assertEqual(
            select.options,
            [
                "Export disabled — Load measurement",
                "Export disabled — CT measurement",
            ],
        )
        key = select_module.normal_profile_mode_label_to_key(
            runtime.data, "Export disabled — Load measurement"
        )
        self.assertEqual(key, const.MODE_ZERO_EXPORT)

    def test_normal_profile_english_label_maps_to_sunsynk_option(self):
        runtime = self._runtime_for_provider(const.PROVIDER_SUNSYNK)
        select = select_module.DeyeNormalProfileModeSelect(runtime)
        self.assertEqual(
            select.options,
            [
                "Essential loads supply",
                "Export disabled",
            ],
        )
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT
        self.assertEqual(select.current_option, "Essential loads supply")
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        self.assertEqual(select.current_option, "Export disabled")



class ProviderMappingTests(unittest.TestCase):
    @staticmethod
    def _set_valid_tou_starts(runtime, hours=(0, 4, 8, 12, 16, 20)):
        for idx, hour in enumerate(hours, start=1):
            entity_id = runtime._tou_entity(idx, "start")
            state = runtime.hass.states.get(entity_id)
            attrs = {} if state is None else dict(state.attributes)
            runtime.hass.states.values[entity_id] = FakeState(f"{hour:02d}:00:00", attrs)
            soc_entity = runtime._tou_entity(idx, "soc")
            soc_state = runtime.hass.states.get(soc_entity)
            soc_attrs = {} if soc_state is None else dict(soc_state.attributes)
            runtime.hass.states.values[soc_entity] = FakeState(str(idx * 10), soc_attrs)

    @staticmethod
    def _add_solarman_entities(runtime):
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_SOLARMAN
        runtime.data[const.CONF_WORK_MODE_SELECT] = "select.solarman_work_mode"
        runtime.hass.states.values["select.solarman_work_mode"] = FakeState(
            "Zero Export To Load",
            {"options": ["Export First", "Zero Export To Load", "Zero Export To CT"]},
        )
        for idx in range(1, 7):
            start = f"time.solarman_program_{idx}_time"
            soc = f"number.solarman_program_{idx}_soc"
            grid = f"select.solarman_program_{idx}_charging"
            runtime.data[const.conf_tou_entity(idx, "start")] = start
            runtime.data[const.conf_tou_entity(idx, "soc")] = soc
            runtime.data[const.conf_tou_entity(idx, "grid")] = grid
            runtime.hass.states.values[start] = FakeState("00:00:00")
            runtime.hass.states.values[soc] = FakeState("20", {"min": 0, "max": 100, "step": 1})
            runtime.hass.states.values[grid] = FakeState(
                "Disabled", {"options": ["Disabled", "Grid", "Generator", "Both"]}
            )

    @staticmethod
    def _add_sunsynk_entities(runtime):
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_SUNSYNK
        runtime.data[const.CONF_WORK_MODE_SELECT] = "select.sunsynk_load_limit"
        runtime.data[const.CONF_WORK_MODE_AUX_ENTITY] = "switch.sunsynk_solar_export"
        runtime.hass.states.values["select.sunsynk_load_limit"] = FakeState(
            "Essentials", {"options": ["Allow Export", "Essentials", "Zero Export"]}
        )
        runtime.hass.states.values["switch.sunsynk_solar_export"] = FakeState("off")
        time_options = [f"{hour:02d}:00" for hour in range(24)]
        for idx in range(1, 7):
            start = f"select.sunsynk_prog_{idx}_time"
            soc = f"number.sunsynk_prog_{idx}_capacity"
            grid = f"select.sunsynk_prog_{idx}_charge"
            runtime.data[const.conf_tou_entity(idx, "start")] = start
            runtime.data[const.conf_tou_entity(idx, "soc")] = soc
            runtime.data[const.conf_tou_entity(idx, "grid")] = grid
            runtime.hass.states.values[start] = FakeState("00:00", {"options": time_options})
            runtime.hass.states.values[soc] = FakeState("20", {"min": 0, "max": 100, "step": 1})
            runtime.hass.states.values[grid] = FakeState(
                "No Grid or Gen",
                {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]},
            )

class CardBackendModeContract5FTests(unittest.TestCase):
    """The card's current mode values must be accepted by the real backend."""

    _set_valid_tou_starts = staticmethod(ProviderMappingTests._set_valid_tou_starts)
    _add_solarman_entities = staticmethod(ProviderMappingTests._add_solarman_entities)
    _add_sunsynk_entities = staticmethod(ProviderMappingTests._add_sunsynk_entities)

    @staticmethod
    def _force_tou_mapping(runtime, *, grid_charge=False, soc=20.0):
        runtime._manual_tou_mapping = manager.TouMapping(
            slots=[manager.TouMappingSlot(i, 0, 0, float(soc), bool(grid_charge)) for i in range(1, 7)]
        )

    @staticmethod
    def _configure_blocked_selling_slot(runtime, min_sell=35):
        runtime.control_mode = "Schedule"
        runtime.scheduler_enabled = True
        runtime.soc_guard_enabled = True
        runtime.min_sell_soc = float(min_sell)
        runtime.default_work_mode = const.MODE_NORMAL_OPERATION
        runtime.default_sell_power = 250
        # Legacy helper name; in minute-level model this means active selling decision is guard-blocked.
        runtime._test_force_active_decision = manager.ActiveDecision(
            key="0000_0030",
            label="00:00-00:30",
            source="test",
            start=0,
            end=30,
            enabled=True,
            mode=const.MODE_SELLING_FIRST,
            physical_work_mode=const.MODE_SELLING_FIRST,
            sell_power=500,
            charge_enabled=False,
            minimum_sell_soc=float(min_sell),
            tou_soc=None,
            min_sell_price=0.0,
            battery_charge_enabled=False,
        )


    def test_schedule_mapping_snapshot_has_no_legacy_schedule_function(self):
        runtime = make_runtime()
        snapshot = runtime.schedule_mapping_snapshot()
        self.assertTrue(snapshot)
        for item in snapshot:
            self.assertNotIn("schedule_function", item)
            self.assertEqual(
                set(item), {"range", "start", "end", "start_time", "end_time", "tou_soc", "grid_charge"}
            )

    @staticmethod
    def _active_physical_segment(runtime):
        now = manager.ha_now()
        minute = now.hour * 60 + now.minute
        for segment in runtime._tou_mapping.slots:
            start = int(segment.start)
            end = 1440 if int(segment.end) == 0 else int(segment.end)
            if start <= minute < end:
                return segment.index, segment
        raise AssertionError("Nie znaleziono fizycznego zakresu dla aktywnej godziny")

    def _map_active_decision(self, runtime, expected_soc, expected_grid):
        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        index, segment = self._active_physical_segment(runtime)
        self.assertEqual(segment.soc, expected_soc)
        self.assertEqual(segment.grid_charge, expected_grid)
        self.assertEqual(
            runtime.hass.states.get(f"number.deye_inverter_time_of_use_{index}_soc").state,
            str(float(expected_soc)),
        )
        self.assertEqual(
            runtime.hass.states.get(f"switch.deye_inverter_time_of_use_{index}_grid_charge").state,
            "on" if expected_grid else "off",
        )

    def test_blocked_sale_uses_default_work_mode(self):
        runtime = make_runtime(soc="30")
        self._configure_blocked_selling_slot(runtime, min_sell=35)
        self.assertTrue(asyncio.run(runtime.async_apply_targets()))
        self.assertEqual(runtime.manager_status, "SELLING BLOCKED")
        self.assertEqual(runtime.target_mode, runtime.default_work_mode)
        self.assertEqual(runtime.target_mode, const.MODE_NORMAL_OPERATION)

    def test_blocked_sale_uses_default_sell_power(self):
        runtime = make_runtime(soc="30")
        self._configure_blocked_selling_slot(runtime, min_sell=35)
        self.assertTrue(asyncio.run(runtime.async_apply_targets()))
        self.assertEqual(
            runtime.hass.states.get(const.DEFAULT_MAX_SELL_POWER).state,
            "250",
        )

    def test_blocked_sale_does_not_write_direct_current_limits(self):
        runtime = make_runtime(soc="30")
        self._configure_blocked_selling_slot(runtime, min_sell=35)
        self.assertTrue(asyncio.run(runtime.async_apply_targets()))
        written = {call[2].get("entity_id") for call in runtime.hass.services.calls}
        for entity_id in (
            const.DEFAULT_DISCHARGE_CURRENT,
            const.DEFAULT_CHARGE_CURRENT,
            const.DEFAULT_GRID_CHARGE_CURRENT,
        ):
            self.assertNotIn(entity_id, written)

    def test_solarman_translates_work_mode_and_complete_tou_map(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        # Force an expected mapping different from physical so reconciliation writes.
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        for idx in range(1, 7):
            runtime.hass.states.values[f"select.solarman_program_{idx}_charging"] = FakeState(
                "Grid", {"options": ["Disabled", "Grid", "Generator", "Both"]}
            )

        asyncio.run(runtime.async_set_work_mode(const.MODE_SELLING_FIRST))
        self.assertIn(
            ("select", "select_option", {"entity_id": "select.solarman_work_mode", "option": "Export First"}, True),
            runtime.hass.services.calls,
        )

        runtime.hass.services.calls.clear()
        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        self.assertFalse(any(
            data.get("entity_id") == "select.solarman_time_of_use"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))
        grid_calls = [
            data for domain, service, data, _blocking in runtime.hass.services.calls
            if domain == "select" and service == "select_option" and "charging" in data.get("entity_id", "")
        ]
        self.assertEqual(len(grid_calls), 6)
        self.assertTrue(all(item["option"] == "Disabled" for item in grid_calls))

    def test_solarman_accepts_disable_alias_and_uses_grid_only_for_charge(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        grid_entity = "select.solarman_program_1_charging"
        runtime.hass.states.values[grid_entity] = FakeState(
            "Disable", {"options": ["Disable", "Grid", "Generator", "Both"]}
        )

        asyncio.run(runtime.async_set_boolean_control(grid_entity, False, "grid"))
        self.assertEqual(
            runtime.hass.services.calls[-1],
            ("select", "select_option", {"entity_id": grid_entity, "option": "Disable"}, True),
        )

        asyncio.run(runtime.async_set_boolean_control(grid_entity, True, "grid"))
        self.assertEqual(
            runtime.hass.services.calls[-1],
            ("select", "select_option", {"entity_id": grid_entity, "option": "Grid"}, True),
        )

    def test_manual_tou_slot_edit_updates_range_and_next_boundary(self):
        runtime = make_runtime()
        self._set_valid_tou_starts(runtime, (0, 4, 6, 10, 16, 20))

        asyncio.run(
            runtime.async_set_physical_tou_slot(
                3,
                "08:00",
                "09:00",
                100,
                True,
            )
        )

        self.assertEqual(
            runtime.hass.states.get("time.deye_inverter_time_of_use_3_start").state,
            "08:00:00",
        )
        self.assertEqual(
            runtime.hass.states.get("time.deye_inverter_time_of_use_4_start").state,
            "09:00:00",
        )
        self.assertEqual(
            runtime.hass.states.get("number.deye_inverter_time_of_use_3_soc").state,
            "100.0",
        )
        self.assertEqual(
            runtime.hass.states.get(
                "switch.deye_inverter_time_of_use_3_grid_charge"
            ).state,
            "on",
        )

    def test_sunsynk_uses_safe_composite_mode_order_and_select_tou(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        # Make at least one time slot and every charging source differ from plan.
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        runtime.hass.states.values["select.sunsynk_prog_1_time"] = FakeState(
            "01:00", {"options": [f"{h:02d}:00" for h in range(24)]}
        )
        for idx in range(1, 7):
            runtime.hass.states.values[f"select.sunsynk_prog_{idx}_charge"] = FakeState(
                "Allow Grid", {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]}
            )

        asyncio.run(runtime.async_set_work_mode(const.MODE_SELLING_FIRST))

        self.assertEqual(runtime.hass.services.calls[-2][0:2], ("select", "select_option"))
        self.assertEqual(runtime.hass.services.calls[-2][2]["option"], "Allow Export")
        self.assertEqual(runtime.hass.services.calls[-1][0:2], ("switch", "turn_on"))

        runtime.hass.services.calls.clear()
        asyncio.run(runtime.async_set_work_mode(const.MODE_ZERO_EXPORT))
        self.assertEqual(runtime.hass.services.calls[0][0:2], ("switch", "turn_off"))
        self.assertEqual(runtime.hass.services.calls[1][0:2], ("select", "select_option"))
        self.assertEqual(runtime.hass.services.calls[1][2]["option"], "Essentials")

        runtime.hass.services.calls.clear()
        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertFalse(any(
            data.get("entity_id") == "switch.sunsynk_use_timer"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))
        self.assertTrue(all(
            data["option"] == "No Grid or Gen"
            for domain, service, data, _blocking in runtime.hass.services.calls
            if domain == "select" and service == "select_option" and "_charge" in data.get("entity_id", "")
        ))

        grid_entity = "select.sunsynk_prog_1_charge"
        asyncio.run(runtime.async_set_boolean_control(grid_entity, True, "grid"))
        self.assertEqual(
            runtime.hass.services.calls[-1],
            ("select", "select_option", {"entity_id": grid_entity, "option": "Allow Grid"}, True),
        )

    def test_global_tou_entity_is_never_written_for_lewa_reka(self):
        runtime = make_runtime()
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        for idx in range(1, 7):
            runtime.hass.states.values[f"switch.deye_inverter_time_of_use_{idx}_grid_charge"] = FakeState("on")
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        self.assertFalse(any(
            data.get("entity_id") == "switch.deye_inverter_time_of_use"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))
        grid_calls = [
            data
            for domain, service, data, _blocking in runtime.hass.services.calls
            if domain == "switch"
            and service in ("turn_on", "turn_off")
            and "_grid_charge" in data.get("entity_id", "")
        ]
        self.assertEqual(len(grid_calls), 6)

    def test_global_tou_entity_is_never_written_for_solarman(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        # Make every charging source differ from the planned disabled state.
        for idx in range(1, 7):
            runtime.hass.states.values[f"select.solarman_program_{idx}_charging"] = FakeState(
                "Grid", {"options": ["Disabled", "Grid", "Generator", "Both"]}
            )
        runtime.hass.states.values["select.solarman_time_of_use"] = FakeState(
            "Disabled", {"options": ["Disabled", "Week"]}
        )
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        self.assertFalse(any(
            data.get("entity_id") == "select.solarman_time_of_use"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))

    def test_global_tou_entity_is_never_written_for_sunsynk(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        # Make every charging source differ from the planned disabled state.
        for idx in range(1, 7):
            runtime.hass.states.values[f"select.sunsynk_prog_{idx}_charge"] = FakeState(
                "Allow Grid", {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]}
            )
        runtime.hass.states.values["switch.sunsynk_use_timer"] = FakeState("off")
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        self.assertFalse(any(
            data.get("entity_id") == "switch.sunsynk_use_timer"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))

    def test_missing_global_tou_does_not_block_setup(self):
        runtime = make_runtime()
        runtime.hass.states.values.pop("switch.deye_inverter_time_of_use", None)
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        runtime.hass.states.values["switch.deye_inverter_time_of_use_1_grid_charge"] = FakeState("on")

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertEqual(runtime.last_error, "")
        self.assertTrue(any(
            domain == "switch" and service in ("turn_on", "turn_off")
            for domain, service, _data, _blocking in runtime.hass.services.calls
        ))

    def test_missing_global_tou_does_not_reduce_provider_capabilities(self):
        runtime = make_runtime()
        capabilities = runtime.provider_capabilities()

        self.assertIn("full_tou", capabilities)
        self.assertNotIn("switch.deye_inverter_time_of_use", capabilities["full_tou"]["missing"])
        self.assertNotIn("tou_enable_entity", capabilities["operations"])

    def test_old_global_tou_key_in_entry_data_is_ignored(self):
        runtime = make_runtime()
        runtime.data["tou_enable_entity"] = "switch.deye_inverter_time_of_use"
        runtime.data["tou_enable_option"] = "Week"
        runtime.data["tou_disable_option"] = "Disabled"

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertNotIn("switch.deye_inverter_time_of_use", [
            data.get("entity_id")
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ])

    def test_old_global_tou_key_in_entry_options_is_ignored(self):
        runtime = make_runtime()
        runtime.data["tou_enable_entity"] = "switch.deye_inverter_time_of_use"
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertFalse(any(
            data.get("entity_id") == "switch.deye_inverter_time_of_use"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))

    def test_global_tou_entity_is_not_in_control_snapshot(self):
        runtime = make_runtime()
        runtime.data[const.CONF_WORK_MODE_SELECT] = const.DEFAULT_WORK_MODE_SELECT
        snapshot, missing = runtime._control_entities_to_write(const.MODE_SELLING_FIRST)

        self.assertFalse(missing)
        self.assertNotIn("switch.deye_inverter_time_of_use", snapshot)

    def test_global_tou_entity_is_not_in_physical_tou_snapshot(self):
        runtime = make_runtime()
        snapshot = runtime._tou_raw_snapshot()

        self.assertNotIn("switch.deye_inverter_time_of_use", snapshot)
        for idx in range(1, 7):
            self.assertIn(f"time.deye_inverter_time_of_use_{idx}_start", snapshot)
            self.assertIn(f"number.deye_inverter_time_of_use_{idx}_soc", snapshot)
            self.assertIn(f"switch.deye_inverter_time_of_use_{idx}_grid_charge", snapshot)

    def test_global_tou_entity_is_not_restored_by_tou_rollback(self):
        runtime = make_runtime()
        before = runtime._tou_raw_snapshot()
        entity_id = "time.deye_inverter_time_of_use_2_start"
        old_value = before[entity_id]
        runtime.hass.states.values[entity_id] = FakeState("12:00:00")

        snapshot: dict[str, str] = {entity_id: old_value}
        item = runtime._make_tou_transaction_item(entity_id, "start", 2, old_value, snapshot)
        snapshot[entity_id] = old_value
        item["previous_logical_value"] = old_value
        item["written"] = True
        asyncio.run(runtime._async_rollback_tou_transaction([item], snapshot))

        restored = set(runtime._tou_raw_snapshot().keys())
        self.assertNotIn("switch.deye_inverter_time_of_use", restored)
        self.assertEqual(len(restored), len(before))
        self.assertEqual(runtime.hass.states.get(entity_id).state, old_value)

    def test_successful_tou_rollback_is_not_reported_as_mismatch(self):
        runtime = make_runtime()
        entity_id = "number.deye_inverter_time_of_use_1_soc"
        snapshot = {entity_id: "20"}
        item = runtime._make_tou_transaction_item(entity_id, "soc", 1, 55, snapshot)
        item["written"] = True
        runtime.hass.states.values[entity_id] = FakeState(
            "55", {"min": 0, "max": 100, "step": 1}
        )

        success, errors = asyncio.run(
            runtime._async_rollback_tou_transaction([item], snapshot)
        )

        self.assertTrue(success)
        self.assertEqual(errors, [])
        self.assertNotEqual(item["status"], "mismatch")

    def test_successful_tou_rollback_marks_restored_items_confirmed(self):
        runtime = make_runtime()
        entity_id = "number.deye_inverter_time_of_use_1_soc"
        snapshot = {entity_id: "20"}
        item = runtime._make_tou_transaction_item(entity_id, "soc", 1, 55, snapshot)
        item["written"] = True
        runtime.hass.states.values[entity_id] = FakeState(
            "55", {"min": 0, "max": 100, "step": 1}
        )

        success, _errors = asyncio.run(
            runtime._async_rollback_tou_transaction([item], snapshot)
        )

        self.assertTrue(success)
        self.assertTrue(item["confirmed"])

    def test_successful_tou_rollback_reports_rolled_back_status(self):
        runtime = make_runtime()
        entity_id = "number.deye_inverter_time_of_use_1_soc"
        snapshot = {entity_id: "20"}
        item = runtime._make_tou_transaction_item(entity_id, "soc", 1, 55, snapshot)
        item["written"] = True
        runtime.hass.states.values[entity_id] = FakeState(
            "55", {"min": 0, "max": 100, "step": 1}
        )

        asyncio.run(runtime._async_rollback_tou_transaction([item], snapshot))

        self.assertEqual(item["status"], "rolled_back")
        self.assertEqual(item["legacy_status"], "rollback_confirmed")

    def test_global_tou_entity_is_not_required_for_tou_mapping(self):
        runtime = make_runtime()
        runtime.hass.states.values.pop("switch.deye_inverter_time_of_use", None)
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        runtime.hass.states.values["switch.deye_inverter_time_of_use_1_grid_charge"] = FakeState("on")

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertTrue(any(
            domain == "switch" and service in ("turn_on", "turn_off")
            for domain, service, _data, _blocking in runtime.hass.services.calls
        ))

    def test_global_tou_entity_is_not_required_for_manual_tou_save(self):
        runtime = make_runtime()
        runtime.hass.states.values.pop("switch.deye_inverter_time_of_use", None)
        self._set_valid_tou_starts(runtime, (0, 2, 6, 10, 16, 20))

        asyncio.run(runtime.async_set_physical_tou_slot(2, "03:00", "04:00", 55, True))

        self.assertEqual(
            runtime.hass.states.get("time.deye_inverter_time_of_use_2_start").state,
            "03:00:00",
        )
        self.assertEqual(
            runtime.hass.states.get("time.deye_inverter_time_of_use_3_start").state,
            "04:00:00",
        )

    def test_six_physical_tou_slots_remain_supported(self):
        runtime = make_runtime()
        entities = runtime._tou_entities()

        self.assertEqual(len(entities), 18)
        for idx in range(1, 7):
            self.assertEqual(runtime._tou_entity(idx, "start"), f"time.deye_inverter_time_of_use_{idx}_start")
            self.assertEqual(runtime._tou_entity(idx, "soc"), f"number.deye_inverter_time_of_use_{idx}_soc")
            self.assertEqual(runtime._tou_entity(idx, "grid"), f"switch.deye_inverter_time_of_use_{idx}_grid_charge")

    def test_custom_provider_does_not_require_global_tou(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_CUSTOM
        runtime.data[const.CONF_WORK_MODE_SELECT] = "select.custom_work_mode"
        runtime.data[const.CONF_WORK_MODE_SELL_OPTION] = "CUSTOM SELL"
        runtime.data[const.CONF_WORK_MODE_ZERO_LOAD_OPTION] = "CUSTOM LOAD"
        runtime.data[const.CONF_WORK_MODE_ZERO_CT_OPTION] = "CUSTOM CT"
        runtime.data[const.CONF_TOU_GRID_ENABLE_OPTION] = "GRID"
        runtime.data[const.CONF_TOU_GRID_DISABLE_OPTION] = "NO GRID"
        runtime.hass.states.values["select.custom_work_mode"] = FakeState(
            "CUSTOM LOAD", {"options": ["CUSTOM SELL", "CUSTOM LOAD", "CUSTOM CT"]}
        )
        for idx in range(1, 7):
            start = f"select.custom_tou_{idx}_time"
            soc = f"number.custom_tou_{idx}_soc"
            grid = f"select.custom_tou_{idx}_grid"
            runtime.data[const.conf_tou_entity(idx, "start")] = start
            runtime.data[const.conf_tou_entity(idx, "soc")] = soc
            runtime.data[const.conf_tou_entity(idx, "grid")] = grid
            runtime.hass.states.values[start] = FakeState("00:00", {"options": [f"{h:02d}:00" for h in range(24)]})
            runtime.hass.states.values[soc] = FakeState("20", {"min": 0, "max": 100, "step": 1})
            runtime.hass.states.values[grid] = FakeState("NO GRID", {"options": ["NO GRID", "GRID"]})

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertFalse(any(
            "tou_enable" in str(data.get("entity_id", ""))
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))

    def test_solarman_disabled_slot_is_not_global_tou_disable(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        for idx in range(1, 7):
            runtime.hass.states.values[f"select.solarman_program_{idx}_charging"] = FakeState(
                "Grid", {"options": ["Disabled", "Grid", "Generator", "Both"]}
            )
        runtime.hass.states.values["select.solarman_time_of_use"] = FakeState(
            "Disabled", {"options": ["Disabled", "Week"]}
        )
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        self.assertFalse(any(
            data.get("entity_id") == "select.solarman_time_of_use"
            for _domain, _service, data, _blocking in runtime.hass.services.calls
        ))
        program_calls = [
            data for _domain, _service, data, _blocking in runtime.hass.services.calls
            if data.get("entity_id", "").startswith("select.solarman_program_") and data.get("entity_id", "").endswith("_charging")
        ]
        self.assertEqual(len(program_calls), 6)
        self.assertTrue(all(
            call["option"] == "Disabled"
            for call in program_calls
        ))

    def test_deye_addon_without_native_tou_fails_closed_before_service_call(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_DEYE_ADDON
        calls_before = list(runtime.hass.services.calls)

        self.assertFalse(asyncio.run(runtime.async_apply_time_of_use_map()))
        self.assertIn("does not expose safe Time Of Use control", runtime.last_error)
        self.assertEqual(runtime.hass.services.calls, calls_before)

    def test_custom_mapping_uses_only_explicit_option_values(self):
        runtime = make_runtime()
        runtime.data.update({
            const.CONF_INVERTER_PROVIDER: const.PROVIDER_CUSTOM,
            const.CONF_WORK_MODE_SELL_OPTION: "CUSTOM SELL",
            const.CONF_WORK_MODE_ZERO_LOAD_OPTION: "CUSTOM LOAD",
            const.CONF_WORK_MODE_ZERO_CT_OPTION: "CUSTOM CT",
        })
        runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState(
            "CUSTOM LOAD", {"options": ["CUSTOM SELL", "CUSTOM LOAD", "CUSTOM CT"]}
        )

        asyncio.run(runtime.async_set_work_mode(const.MODE_SELLING_FIRST))

        self.assertEqual(runtime.hass.services.calls[-1][2]["option"], "CUSTOM SELL")

    def test_custom_provider_normalizes_tou_grid_select(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_CUSTOM
        runtime.data[const.CONF_WORK_MODE_SELECT] = "select.custom_work_mode"
        runtime.data[const.CONF_TOU_GRID_ENABLE_OPTION] = "CUSTOM GRID"
        runtime.data[const.CONF_TOU_GRID_DISABLE_OPTION] = "CUSTOM OFF"
        runtime.hass.states.values["select.custom_work_mode"] = FakeState(
            "CUSTOM LOAD", {"options": ["CUSTOM SELL", "CUSTOM LOAD", "CUSTOM CT"]}
        )
        for idx in range(1, 7):
            start = f"select.custom_tou_{idx}_time"
            soc = f"number.custom_tou_{idx}_soc"
            grid = f"select.custom_tou_{idx}_grid"
            runtime.data[const.conf_tou_entity(idx, "start")] = start
            runtime.data[const.conf_tou_entity(idx, "soc")] = soc
            runtime.data[const.conf_tou_entity(idx, "grid")] = grid
            runtime.hass.states.values[start] = FakeState("00:00", {"options": [f"{h:02d}:00" for h in range(24)]})
            runtime.hass.states.values[soc] = FakeState("20", {"min": 0, "max": 100, "step": 1})
            runtime.hass.states.values[grid] = FakeState(
                "CUSTOM OFF", {"options": ["CUSTOM OFF", "CUSTOM GRID"]}
            )
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        runtime.hass.states.values["select.custom_tou_1_grid"] = FakeState(
            "CUSTOM GRID", {"options": ["CUSTOM OFF", "CUSTOM GRID"]}
        )
        runtime.hass.services.calls.clear()

        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))

        grid_calls = [
            data
            for domain, service, data, _blocking in runtime.hass.services.calls
            if domain == "select" and service == "select_option" and "_grid" in data.get("entity_id", "")
        ]
        self.assertEqual(len(grid_calls), 1)
        self.assertEqual(grid_calls[0]["option"], "CUSTOM OFF")
        self.assertEqual(grid_calls[0]["entity_id"], "select.custom_tou_1_grid")

    def test_unconfirmed_tou_write_is_rolled_back_to_exact_previous_map(self):

        runtime = make_runtime()
        runtime.control_confirmation_timeout = 0.1
        self._force_tou_mapping(runtime, grid_charge=False, soc=20.0)
        for idx in range(1, 7):
            runtime.hass.states.values[f"switch.deye_inverter_time_of_use_{idx}_grid_charge"] = FakeState("on")
        before = {
            entity_id: state.state
            for entity_id, state in runtime.hass.states.values.items()
            if "time_of_use" in entity_id
        }
        runtime.hass.services.fail_once(
            "switch",
            "turn_off",
            entity_id="switch.deye_inverter_time_of_use_1_grid_charge",
        )

        self.assertFalse(asyncio.run(runtime.async_apply_time_of_use_map()))

        after = {
            entity_id: state.state
            for entity_id, state in runtime.hass.states.values.items()
            if "time_of_use" in entity_id
        }
        for entity_id, previous in before.items():
            if entity_id.startswith("number."):
                self.assertAlmostEqual(float(after[entity_id]), float(previous))
            else:
                self.assertEqual(after[entity_id], previous)
        self.assertIn("Previous settings restored", runtime.last_error)
        self.assertEqual(runtime._last_tou_signature, "")

    def test_deye_addon_reports_read_only_control_capabilities(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_DEYE_ADDON

        capabilities = runtime.provider_capabilities()

        self.assertFalse(capabilities["basic_control"]["supported"])
        self.assertFalse(capabilities["selling"]["supported"])
        self.assertFalse(capabilities["charging"]["supported"])
        self.assertFalse(capabilities["full_tou"]["supported"])
        self.assertIn("does not expose", capabilities["provider"]["note"])

    def test_capability_operations_describe_real_home_assistant_services(self):
        runtime = make_runtime()
        operations = runtime.provider_capabilities()["operations"]

        self.assertEqual(operations["work_mode"]["operation"], "select.select_option")
        self.assertEqual(operations["sell_power"]["operation"], "number.set_value")
        self.assertNotIn("tou_enable", operations)
        self.assertEqual(operations["tou_1_start"]["operation"], "time.set_value")


class ProviderProfileValidationTests(unittest.TestCase):
    """Profile saves validate exact raw options exposed by each provider."""

    @staticmethod
    def _lewa_reka_runtime():
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_LEWA_REKA
        runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState(
            const.MODE_ZERO_EXPORT,
            {"options": ["Selling First", const.MODE_ZERO_EXPORT, const.MODE_ZERO_EXPORT_CT]},
        )
        return runtime

    @staticmethod
    def _solarman_runtime():
        runtime = make_runtime()
        ProviderMappingTests._add_solarman_entities(runtime)
        return runtime

    @staticmethod
    def _sunsynk_runtime():
        runtime = make_runtime()
        ProviderMappingTests._add_sunsynk_entities(runtime)
        return runtime

    @staticmethod
    def _custom_runtime(*, load="CUSTOM LOAD", ct="CUSTOM CT", sell="CUSTOM SELL"):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_CUSTOM
        if load is not None:
            runtime.data[const.CONF_WORK_MODE_ZERO_LOAD_OPTION] = load
        if ct is not None:
            runtime.data[const.CONF_WORK_MODE_ZERO_CT_OPTION] = ct
        if sell is not None:
            runtime.data[const.CONF_WORK_MODE_SELL_OPTION] = sell
        runtime.data[const.conf_tou_entity(1, "soc")] = "number.deye_inverter_time_of_use_1_soc"
        options = [item for item in (sell, load, ct) if item is not None]
        runtime.hass.states.values[const.DEFAULT_WORK_MODE_SELECT] = FakeState(
            options[0] if options else "unknown",
            {"options": options},
        )
        return runtime

    @staticmethod
    def _default_values(mode, physical_mode=const.MODE_ZERO_EXPORT):
        return {
            "mode": mode,
            "physical_work_mode": physical_mode,
            "sell_power": 3000,
        }

    @staticmethod
    def _normal_values(physical_mode):
        return {
            "physical_work_mode": physical_mode,
            "sell_power": 3000,
            "tou_soc": 20,
        }

    def test_save_default_settings_normal_operation_lewa_reka_with_real_select_options(self):
        runtime = self._lewa_reka_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_NORMAL_OPERATION)))
        self.assertEqual(runtime.default_work_mode, const.MODE_NORMAL_OPERATION)

    def test_save_default_settings_selling_lewa_reka_with_real_select_options(self):
        runtime = self._lewa_reka_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_SELLING_FIRST)))
        self.assertEqual(runtime.default_work_mode, const.MODE_SELLING_FIRST)

    def test_save_default_settings_normal_operation_solarman_with_real_select_options(self):
        runtime = self._solarman_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_NORMAL_OPERATION)))
        self.assertEqual(runtime.default_physical_work_mode, const.MODE_ZERO_EXPORT)

    def test_save_default_settings_selling_solarman_with_real_select_options(self):
        runtime = self._solarman_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_SELLING_FIRST)))
        self.assertEqual(runtime.default_work_mode, const.MODE_SELLING_FIRST)

    def test_save_default_settings_normal_operation_sunsynk_with_real_select_options(self):
        runtime = self._sunsynk_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_NORMAL_OPERATION)))
        self.assertEqual(runtime.default_physical_work_mode, const.MODE_ZERO_EXPORT)

    def test_save_default_settings_selling_sunsynk_with_real_select_options(self):
        runtime = self._sunsynk_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_SELLING_FIRST)))
        self.assertEqual(runtime.default_work_mode, const.MODE_SELLING_FIRST)

    def test_save_default_settings_normal_operation_custom_with_real_select_options(self):
        runtime = self._custom_runtime()
        asyncio.run(runtime.async_save_default_settings(self._default_values(const.MODE_NORMAL_OPERATION)))
        self.assertEqual(runtime.default_physical_work_mode, const.MODE_ZERO_EXPORT)

    def test_save_normal_profile_lewa_reka_translates_canonical_variant(self):
        runtime = self._lewa_reka_runtime()
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT_CT)))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT_CT)

    def test_save_normal_profile_solarman_translates_canonical_variant(self):
        runtime = self._solarman_runtime()
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT_CT)))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT_CT)

    def test_save_normal_profile_sunsynk_load_maps_to_essentials(self):
        runtime = self._sunsynk_runtime()
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT)))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT)

    def test_save_normal_profile_sunsynk_ct_maps_to_zero_export(self):
        runtime = self._sunsynk_runtime()
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT_CT)))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT_CT)

    def test_save_normal_profile_custom_uses_configured_raw_option(self):
        runtime = self._custom_runtime()
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT_CT)))
        self.assertEqual(runtime.normal_profile_physical_work_mode, const.MODE_ZERO_EXPORT_CT)

    def test_save_normal_profile_rejects_missing_custom_provider_option(self):
        runtime = self._custom_runtime(load=None)
        with self.assertRaisesRegex(ValueError, "No configured option"):
            asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT)))

    def test_normal_profile_validation_checks_translated_provider_option_not_canonical_key(self):
        runtime = self._sunsynk_runtime()
        state = runtime.hass.states.get(runtime.work_mode_select)
        self.assertNotIn(const.MODE_ZERO_EXPORT, state.attributes["options"])
        asyncio.run(runtime.async_save_normal_profile(self._normal_values(const.MODE_ZERO_EXPORT)))

    def test_custom_metadata_exposes_only_configured_normal_variant(self):
        runtime = self._custom_runtime(load="Essentials", ct=None)
        rows = manager.normal_profile_mode_metadata(runtime.data)
        self.assertEqual(
            [row for row in rows if row["available"]],
            [{
                "value": const.MODE_ZERO_EXPORT,
                "label": "Export disabled — Load measurement",
                "available": True,
            }],
        )

    def test_apply_defaults_uses_explicit_physical_variant_not_active_profile(self):
        runtime = self._lewa_reka_runtime()
        runtime.normal_profile_physical_work_mode = const.MODE_ZERO_EXPORT_CT
        runtime.default_physical_work_mode = const.MODE_ZERO_EXPORT
        runtime.default_work_mode = const.MODE_NORMAL_OPERATION

        self.assertTrue(asyncio.run(runtime.async_apply_safe_defaults("Test 5F.1")))

        mode_calls = [
            call for call in runtime.hass.services.calls
            if call[0] == "select" and call[1] == "select_option"
        ]
        self.assertEqual(mode_calls[-1][2]["option"], const.MODE_ZERO_EXPORT)


class ChargeProfilePersistenceTests(unittest.TestCase):
    class MemoryStore:
        def __init__(self, value=None, fail=False):
            self.value = value
            self.fail = fail

        async def async_save(self, value):
            if self.fail:
                raise RuntimeError("storage unavailable")
            self.value = value

        async def async_load(self):
            return self.value

    @staticmethod
    def profile(grid_enabled=True, target_soc=90, **legacy_current_fields):
        return {
            "target_soc": target_soc,
            "grid_charge_enabled": grid_enabled,
        }

    def load_from_store(self, store):
        runtime = make_runtime()
        previous_store = manager.Store
        manager.Store = lambda *_args, **_kwargs: store
        try:
            asyncio.run(runtime.async_load_ai_data())
        finally:
            manager.Store = previous_store
        return runtime

    def test_complete_profile_with_grid_yes_survives_restart(self):
        store = self.MemoryStore()
        runtime = make_runtime()
        runtime._ai_store = store
        asyncio.run(runtime.async_save_charge_profile(self.profile()))

        self.assertEqual(store.value["charge_profile"], {
            "target_soc": 90.0,
            "grid_charge_enabled": True,
        })
        reloaded = self.load_from_store(store)
        self.assertTrue(reloaded._charge_profile_loaded_from_store)
        self.assertTrue(reloaded.charge_profile_grid_enabled)
        self.assertEqual(reloaded.charge_profile_target_soc, 90)
        for field in (
            "charge_profile_charge_current",
            "charge_profile_discharge_current",
            "charge_profile_grid_charge_current",
        ):
            self.assertFalse(hasattr(reloaded, field))

    def test_complete_profile_with_grid_no_and_different_values_survives_restart(self):
        store = self.MemoryStore()
        runtime = make_runtime()
        runtime._ai_store = store
        asyncio.run(runtime.async_save_charge_profile(self.profile(
            grid_enabled=False,
            charge_current=75,
            discharge_current=25,
            grid_charge_current=15,
            target_soc=82,
        )))

        reloaded = self.load_from_store(store)
        self.assertFalse(reloaded.charge_profile_grid_enabled)
        self.assertEqual(reloaded.charge_profile_target_soc, 82)

    def test_invalid_profile_keeps_previous_runtime_and_stored_record(self):
        store = self.MemoryStore()
        runtime = make_runtime()
        runtime._ai_store = store
        asyncio.run(runtime.async_save_charge_profile(self.profile()))
        stored_before = dict(store.value["charge_profile"])

        with self.assertRaises(ValueError):
            asyncio.run(runtime.async_save_charge_profile(self.profile(target_soc=float("nan"))))

        self.assertEqual(store.value["charge_profile"], stored_before)

    def test_failed_durable_write_rolls_back_complete_runtime_profile(self):
        runtime = make_runtime()
        runtime.charge_profile_target_soc = 81
        runtime.charge_profile_grid_enabled = False
        runtime._charge_profile_loaded_from_store = True
        runtime._ai_store = self.MemoryStore(fail=True)

        with self.assertRaisesRegex(RuntimeError, "storage unavailable"):
            asyncio.run(runtime.async_save_charge_profile(self.profile()))

        self.assertEqual(runtime.charge_profile_target_soc, 81)
        self.assertFalse(runtime.charge_profile_grid_enabled)
        self.assertTrue(runtime._charge_profile_loaded_from_store)

    def test_dataclass_defaults_mirror_solar_assistant_configuration(self):
        defaults = manager.DeyeEnergyRuntime.__dataclass_fields__
        self.assertEqual(defaults["default_sell_power"].default, const.MIRRORED_MAX_SELL_POWER_W)
        self.assertEqual(defaults["charge_profile_target_soc"].default, const.MIRRORED_CHARGE_PROFILE_TARGET_SOC)
        self.assertTrue(defaults["charge_profile_grid_enabled"].default)

    def test_legacy_profile_and_missing_default_profile_get_migration_marker(self):
        legacy_profile = {
            "target_soc": 100.0,
            "grid_charge_enabled": False,
        }
        store = self.MemoryStore({"charge_profile": legacy_profile})
        reloaded = self.load_from_store(store)

        self.assertTrue(store.value["sa_defaults_v1"])
        self.assertEqual(store.value["charge_profile"], legacy_profile)
        self.assertEqual(store.value["default_profile"], {
            "sell_power": reloaded.default_sell_power,
        })
        self.assertTrue(reloaded._charge_profile_loaded_from_store)
        self.assertFalse(reloaded._default_profile_loaded_from_store)
        self.assertEqual(reloaded.charge_profile_target_soc, 100.0)
        self.assertFalse(reloaded.charge_profile_grid_enabled)
        self.assertEqual(reloaded.default_sell_power, const.DEFAULT_INVERTER_MAX_POWER_W)

    def test_saved_profiles_are_not_overwritten_by_migration(self):
        charge_profile = {
            "target_soc": 82.0,
            "grid_charge_enabled": False,
        }
        default_profile = {
            "sell_power": 250.0,
        }
        store = self.MemoryStore({
            "charge_profile": charge_profile,
            "default_profile": default_profile,
        })
        reloaded = self.load_from_store(store)

        self.assertTrue(store.value["sa_defaults_v1"])
        self.assertEqual(store.value["charge_profile"], charge_profile)
        self.assertEqual(store.value["default_profile"], default_profile)
        self.assertEqual(reloaded.charge_profile_target_soc, 82)
        self.assertFalse(reloaded.charge_profile_grid_enabled)
        self.assertEqual(reloaded.default_sell_power, 250)

    def test_migration_marker_preserves_legacy_profile_on_next_restart(self):
        legacy_profile = {
            "target_soc": 100.0,
            "grid_charge_enabled": False,
        }
        store = self.MemoryStore({
            "charge_profile": legacy_profile,
            "sa_defaults_v1": True,
        })
        reloaded = self.load_from_store(store)

        self.assertEqual(reloaded.charge_profile_target_soc, 100)
        self.assertFalse(reloaded.charge_profile_grid_enabled)

    def test_default_profile_from_store_survives_restart(self):
        default_profile = {
            "sell_power": 0.0,
        }
        store = self.MemoryStore({
            "default_profile": default_profile,
            "sa_defaults_v1": True,
        })
        reloaded = self.load_from_store(store)

        self.assertTrue(reloaded._default_profile_loaded_from_store)
        self.assertEqual(reloaded.default_sell_power, 0)

    def test_number_entities_have_no_helper_current_range(self):
        source = (PACKAGE / "number.py").read_text(encoding="utf-8")
        self.assertNotIn(', 240, 5, "A")', source)






class StatisticsTests(unittest.TestCase):
    def test_current_day_reports_progress_not_accuracy(self):
        runtime = make_runtime()
        runtime.solcast_tracking = {"date": "2026-07-18", "forecast": 50.0, "actual": 10.0}
        rows = runtime.history_daily_summary()
        today = next(row for row in rows if row["date"] == "2026-07-18")
        self.assertIsNone(today["accuracy_percent"])
        self.assertEqual(today["forecast_progress_percent"], 20.0)
        self.assertFalse(today["day_complete"])



    def test_flow_signs_are_configurable(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_GRID_POWER_SENSOR] = FakeState("500")
        runtime.hass.states.values[const.DEFAULT_BATTERY_POWER_SENSOR] = FakeState("-700")
        runtime.data[const.CONF_GRID_POWER_SENSOR] = const.DEFAULT_GRID_POWER_SENSOR
        runtime.data[const.CONF_BATTERY_POWER_SENSOR] = const.DEFAULT_BATTERY_POWER_SENSOR
        self.assertEqual(runtime.normalized_grid_power(), 500)
        self.assertEqual(runtime.normalized_battery_power(), -700)
        runtime.data[const.CONF_GRID_POSITIVE_IS_IMPORT] = False
        runtime.data[const.CONF_BATTERY_POSITIVE_IS_DISCHARGE] = False
        self.assertEqual(runtime.normalized_grid_power(), -500)
        self.assertEqual(runtime.normalized_battery_power(), 700)




class InverterMaxPowerTests(unittest.IsolatedAsyncioTestCase):
    def test_default_configured_limit(self):
        runtime = make_runtime()
        self.assertEqual(runtime.configured_inverter_max_power_w, const.DEFAULT_INVERTER_MAX_POWER_W)

    def test_configured_limit_is_clamped(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 500
        self.assertEqual(runtime.configured_inverter_max_power_w, 1000)
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 50000
        self.assertEqual(runtime.configured_inverter_max_power_w, const.ABSOLUTE_INVERTER_MAX_POWER_W)

    def test_detected_entity_max_from_number_attributes(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"max": 16000, "unit_of_measurement": "W"}
        )
        self.assertEqual(runtime.detected_entity_max_power_w, 16000)

    def test_detect_entity_max_power_w_helper_is_shared(self):
        """The same validation logic is used by runtime and config flow."""
        inverter_provider = sys.modules["custom_components.deye_energy.inverter_provider"]
        detect = inverter_provider.detect_entity_max_power_w
        good = FakeState("0", attributes={"max": 16000, "unit_of_measurement": "W"})
        self.assertEqual(detect(good), 16000)
        self.assertIsNone(detect(FakeState("0", attributes={"max": 500, "unit_of_measurement": "W"})))
        self.assertIsNone(detect(FakeState("unavailable", attributes={"max": 16000, "unit_of_measurement": "W"})))
        self.assertIsNone(detect(None))
        self.assertEqual(detect(FakeState("0", attributes={"max": 16, "unit_of_measurement": "kW"})), 16000)

    def test_detected_entity_max_converts_kw(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"max": 16, "unit_of_measurement": "kW"}
        )
        self.assertEqual(runtime.detected_entity_max_power_w, 16000)

    def test_effective_limit_uses_configured_when_no_detection(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 15000
        self.assertIsNone(runtime.detected_entity_max_power_w)
        self.assertEqual(runtime.effective_inverter_max_power_w, 15000)

    def test_two_entries_have_independent_effective_limits(self):
        first = make_runtime()
        first.data[const.CONF_INVERTER_MAX_POWER_W] = 9000
        second = make_runtime()
        second.data[const.CONF_INVERTER_MAX_POWER_W] = 15000
        self.assertEqual(first.effective_inverter_max_power_w, 9000)
        self.assertEqual(second.effective_inverter_max_power_w, 15000)
        # The applied sell power ceiling must follow the per-entry limit.
        first.default_sell_power = 12000
        second.default_sell_power = 12000
        self.assertEqual(first.applied_sell_power, 9000)
        self.assertEqual(second.applied_sell_power, 12000)

    def test_options_update_changes_runtime_effective_limit(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 8000
        self.assertEqual(runtime.effective_inverter_max_power_w, 8000)
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 14000
        self.assertEqual(runtime.effective_inverter_max_power_w, 14000)

    def test_physical_sell_power_range_converts_kw_to_w(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12, "step": 0.1, "unit_of_measurement": "kW"}
        )
        physical = runtime.max_sell_power_range
        self.assertEqual(physical.minimum_w, 0)
        self.assertEqual(physical.maximum_w, 12000)
        self.assertEqual(physical.step_w, 100)
        self.assertEqual(physical.native_unit, "kw")

    def test_physical_sell_power_command_converts_w_to_kw(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 10000
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12, "step": 0.1, "unit_of_measurement": "kW"}
        )
        asyncio.run(runtime.async_set_max_sell_power_number(9955))
        written = [
            call for call in runtime.hass.services.calls
            if call[0] == "number" and call[1] == "set_value" and call[2].get("entity_id") == const.DEFAULT_MAX_SELL_POWER
        ]
        self.assertEqual(len(written), 1)
        self.assertEqual(written[0][2]["value"], 9.9)

    def test_physical_sell_power_rejects_kwh_unit(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12, "step": 0.1, "unit_of_measurement": "kWh"}
        )
        physical = runtime.max_sell_power_range
        self.assertIsNone(physical.maximum_w)
        self.assertIsNone(physical.step_w)

    def test_manual_sell_power_rejects_value_above_physical_max(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 15000
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        with self.assertRaisesRegex(ValueError, "physical entity limit"):
            runtime.validate_manual_sell_power_w("Test", 12500)

    def test_manual_sell_power_rejects_value_below_physical_min(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 1000, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        with self.assertRaisesRegex(ValueError, "physical entity minimum"):
            runtime.validate_manual_sell_power_w("Test", 500)

    def test_manual_sell_power_rejects_value_not_matching_step(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        with self.assertRaisesRegex(ValueError, "physical entity step"):
            runtime.validate_manual_sell_power_w("Test", 9955)

    def test_automatic_sell_power_rounds_down_to_physical_step(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 10000
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        self.assertEqual(runtime.normalize_automatic_sell_power_w(9955), 9900)

    def test_automatic_sell_power_never_rounds_up(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_MAX_POWER_W] = 10000
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 0, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        self.assertEqual(runtime.normalize_automatic_sell_power_w(9999), 9900)
        self.assertLessEqual(runtime.normalize_automatic_sell_power_w(9999), 9999)

    def test_zero_sell_power_is_not_raised_to_physical_minimum(self):
        runtime = make_runtime()
        runtime.hass.states.values[const.DEFAULT_MAX_SELL_POWER] = FakeState(
            "0", attributes={"min": 1000, "max": 12000, "step": 100, "unit_of_measurement": "W"}
        )
        self.assertEqual(runtime.normalize_automatic_sell_power_w(0), 0)

    def test_source_audit_leaves_only_guarded_writes_and_weather_read(self):
        source = (PACKAGE / "manager.py").read_text(encoding="utf-8")
        self.assertEqual(source.count("self.hass.services.async_call("), 5)
        self.assertIn("async def _async_physical_service_call", source)
        self.assertIn('"weather",\n                "get_forecasts"', source)
        self.assertIn("async def _async_ensure_install_battery_restart_capacity_default", source)
        install_body = source.split(
            "async def _async_ensure_install_battery_restart_capacity_default", 1
        )[1].split("\n    async def ", 1)[0]
        self.assertIn("self.hass.services.async_call(", install_body)
        self.assertIn("async def async_sync_inverter_datetime", source)
        datetime_body = source.split("async def async_sync_inverter_datetime", 1)[1].split(
            "\n    async def ", 1
        )[0]
        self.assertIn("self.hass.services.async_call(", datetime_body)
        self.assertIn("async def _async_enforce_manual_schedule_battery_charge", source)
        manual_battery_body = source.split(
            "async def _async_enforce_manual_schedule_battery_charge", 1
        )[1].split("\n    async def ", 1)[0]
        self.assertIn("self.hass.services.async_call(", manual_battery_body)
        self.assertIn("_async_append_trigger_log", manual_battery_body)
        for helper in (
            "async_set_work_mode",
            "async_set_number",
            "async_set_switch",
            "async_set_time",
            "async_set_boolean_control",
            "_async_restore_raw_entity",
        ):
            body = source.split(f"async def {helper}", 1)[1].split("\n    def ", 1)[0].split("\n    async def ", 1)[0]
            self.assertNotIn("self.hass.services.async_call(", body)


_ProviderMappingTests = ProviderMappingTests

class TouTransactionTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _add_solarman_entities(runtime):
        return _ProviderMappingTests._add_solarman_entities(runtime)

    @staticmethod
    def _add_sunsynk_entities(runtime):
        return _ProviderMappingTests._add_sunsynk_entities(runtime)

    def assert_safe_defaults(self, runtime, expected_mode=const.MODE_ZERO_EXPORT):
        self.assertEqual(runtime.target_sell_power, runtime.default_sell_power)

    @staticmethod
    def _tou_calls(runtime):
        return [
            call
            for call in runtime.hass.services.calls
            if call[:2] in (
                ("number", "set_value"),
                ("time", "set_value"),
                ("select", "select_option"),
                ("switch", "turn_on"),
                ("switch", "turn_off"),
            )
            and ("time_of_use" in str(call[2].get("entity_id", "")) or "_tou_" in str(call[2].get("entity_id", "")))
        ]

    @staticmethod
    def _set_starts(runtime, starts=(0, 4, 8, 12, 16, 20)):
        for idx, hour in enumerate(starts, start=1):
            entity_id = f"time.deye_inverter_time_of_use_{idx}_start"
            runtime.hass.states.values[entity_id] = FakeState(f"{int(hour):02d}:00:00")

    """Stage 5B: physical Deye TOU write transaction behavior."""

    def _align_physical_tou_starts(self, runtime):
        for idx, segment in enumerate(runtime._tou_mapping.slots, start=1):
            runtime.hass.states.values[f"time.deye_inverter_time_of_use_{idx}_start"] = FakeState(
                f"{int(segment.start) // 60:02d}:{int(segment.start) % 60:02d}:00"
            )

    def test_tou_transaction_write_order_is_start_then_soc_then_grid(self):
        runtime = make_runtime()
        runtime.hass.states.values["time.deye_inverter_time_of_use_1_start"] = FakeState("01:00:00")
        runtime.hass.states.values["number.deye_inverter_time_of_use_1_soc"] = FakeState("50")
        runtime.hass.states.values["switch.deye_inverter_time_of_use_1_grid_charge"] = FakeState("on")
        runtime.hass.services.calls.clear()
        self.assertTrue(asyncio.run(runtime.async_apply_time_of_use_map()))
        written = [data.get("entity_id") for _d, _s, data, _b in runtime.hass.services.calls]
        if "time.deye_inverter_time_of_use_1_start" in written:
            start_idx = written.index("time.deye_inverter_time_of_use_1_start")
            soc_idx = written.index("number.deye_inverter_time_of_use_1_soc")
            grid_idx = written.index("switch.deye_inverter_time_of_use_1_grid_charge")
            self.assertLess(start_idx, soc_idx)
            self.assertLess(soc_idx, grid_idx)
        else:
            self.assertEqual(runtime.tou_reconciliation_status, "in_sync")

    def test_tou_capabilities_are_exposed_per_slot(self):
        runtime = make_runtime()
        rows = runtime.diagnostics()["tou_capabilities"]
        self.assertEqual(len(rows), 6)
        self.assertEqual([row["slot_index"] for row in rows], list(range(1, 7)))
        self.assertIn("fields", rows[0])

    def test_tou_capabilities_lewa_reka(self):
        row = make_runtime().tou_slot_capabilities()[0]
        self.assertTrue(row["supports_start"])
        self.assertTrue(row["supports_end_as_next_start"])
        self.assertEqual(row["fields"]["start"]["domain"], "time")
        self.assertEqual(row["fields"]["soc"]["domain"], "number")
        self.assertEqual(row["fields"]["grid_charge"]["domain"], "switch")
        self.assertFalse(row["read_only"])

    def test_tou_capabilities_solarman(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        self._set_starts(runtime)
        row = runtime.tou_slot_capabilities()[0]
        self.assertEqual(row["fields"]["start"]["domain"], "time")
        self.assertEqual(row["fields"]["grid_charge"]["domain"], "select")
        self.assertTrue(row["supports_soc"])

    def test_tou_capabilities_sunsynk(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        self._set_starts(runtime)
        row = runtime.tou_slot_capabilities()[0]
        self.assertEqual(row["fields"]["start"]["domain"], "select")
        self.assertEqual(row["fields"]["grid_charge"]["domain"], "select")
        self.assertFalse(row["read_only"])

    def test_tou_capabilities_custom_partial_mapping(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_CUSTOM
        for idx in range(1, 7):
            for kind in ("start", "soc", "grid"):
                runtime.data.pop(const.conf_tou_entity(idx, kind), None)
        entity_id = "number.custom_tou_1_soc"
        runtime.data[const.conf_tou_entity(1, "soc")] = entity_id
        runtime.hass.states.values[entity_id] = FakeState("20", {"min": 0, "max": 100, "step": 1})
        row = runtime.tou_slot_capabilities()[0]
        self.assertTrue(row["supports_soc"])
        self.assertFalse(row["supports_start"])
        self.assertFalse(row["supports_grid_charge"])

    def test_tou_capabilities_read_only_provider(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_DEYE_ADDON
        row = runtime.tou_slot_capabilities()[0]
        self.assertTrue(row["read_only"])
        self.assertFalse(row["control_writable"])
        self.assertFalse(any(field["writable"] for field in row["fields"].values()))

    def test_tou_capabilities_do_not_depend_on_card_provider_name_guessing(self):
        runtime = make_runtime()
        capabilities = runtime.provider_capabilities()["physical_tou_slots"]
        self.assertEqual(capabilities[0]["provider"], const.PROVIDER_LEWA_REKA)
        self.assertIn("read_only", capabilities[0])
        self.assertIn("control_writable", capabilities[0])

    async def test_set_tou_slot_accepts_start_only(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, start="05:00")
        calls = self._tou_calls(runtime)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2]["entity_id"], "time.deye_inverter_time_of_use_2_start")

    async def test_set_tou_slot_accepts_end_only(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, end="09:00")
        self.assertEqual(
            self._tou_calls(runtime)[0][2]["entity_id"],
            "time.deye_inverter_time_of_use_3_start",
        )

    async def test_set_tou_slot_accepts_soc_only(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, soc=55)
        self.assertEqual(len(self._tou_calls(runtime)), 1)
        self.assertEqual(float(runtime.hass.states.get("number.deye_inverter_time_of_use_2_soc").state), 55)

    async def test_set_tou_slot_accepts_grid_charge_only(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, grid_charge=True)
        self.assertEqual(len(self._tou_calls(runtime)), 1)
        self.assertEqual(runtime.hass.states.get("switch.deye_inverter_time_of_use_2_grid_charge").state, "on")

    async def test_set_tou_slot_does_not_write_omitted_fields(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, soc=55)
        written = [call[2]["entity_id"] for call in self._tou_calls(runtime)]
        self.assertEqual(written, ["number.deye_inverter_time_of_use_2_soc"])

    async def test_custom_partial_tou_payload_does_not_require_missing_fields(self):
        runtime = make_runtime()
        runtime.data[const.CONF_INVERTER_PROVIDER] = const.PROVIDER_CUSTOM
        starts = (0, 4, 8, 12, 16, 20)
        for idx, hour in enumerate(starts, start=1):
            start_entity = f"time.custom_tou_{idx}_start"
            soc_entity = f"number.custom_tou_{idx}_soc"
            grid_entity = f"switch.custom_tou_{idx}_grid"
            runtime.data[const.conf_tou_entity(idx, "start")] = start_entity
            runtime.data[const.conf_tou_entity(idx, "soc")] = soc_entity
            runtime.data[const.conf_tou_entity(idx, "grid")] = grid_entity
            runtime.hass.states.values[start_entity] = FakeState(f"{hour:02d}:00:00")
            runtime.hass.states.values[soc_entity] = FakeState(
                str(idx * 10), {"min": 0, "max": 100, "step": 1}
            )
            runtime.hass.states.values[grid_entity] = FakeState("on" if idx % 2 else "off")
        entity_id = "number.custom_tou_1_soc"
        await runtime.async_set_physical_tou_slot(1, soc=60)
        self.assertEqual(float(runtime.hass.states.get(entity_id).state), 60)
        written = [call[2]["entity_id"] for call in self._tou_calls(runtime)]
        self.assertEqual(written, [entity_id])

    async def test_manual_tou_end_writes_next_slot_start(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, end="09:00")
        self.assertEqual(runtime.hass.states.get("time.deye_inverter_time_of_use_3_start").state, "09:00:00")

    async def test_manual_tou_last_end_writes_first_slot_start(self):
        runtime = make_runtime()
        self._set_starts(runtime, (1, 4, 8, 12, 16, 20))
        await runtime.async_set_physical_tou_slot(6, end="00:00")
        self.assertEqual(runtime.hass.states.get("time.deye_inverter_time_of_use_1_start").state, "00:00:00")

    async def test_tou_transaction_log_marks_end_as_end(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, end="09:00")
        self.assertEqual(runtime.tou_transaction_log[0]["field"], "end")
        self.assertEqual(runtime.tou_transaction_log[0]["slot_index"], 2)

    async def test_manual_tou_start_and_end_are_confirmed_atomically(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        captured = []
        original = runtime._async_wait_for_tou_confirmation

        async def inspect(items, operation_name, expected_value_key="expected_logical_value", **kwargs):
            captured.append([(item["field"], item["status"]) for item in items])
            return await original(items, operation_name, expected_value_key, **kwargs)

        runtime._async_wait_for_tou_confirmation = inspect
        await runtime.async_set_physical_tou_slot(2, start="05:00", end="09:00")
        self.assertEqual({field for field, _status in captured[0]}, {"start", "end"})
        self.assertTrue(all(item["confirmed"] for item in runtime.tou_transaction_log))

    async def test_manual_tou_end_failure_rolls_back_both_boundaries(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        first = "time.deye_inverter_time_of_use_2_start"
        second = "time.deye_inverter_time_of_use_3_start"
        before = (runtime.hass.states.get(first).state, runtime.hass.states.get(second).state)
        runtime.control_confirmation_timeout = 0.01
        runtime.hass.services.ignore_once("time", "set_value", entity_id=second)
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(2, start="05:00", end="09:00")
        self.assertEqual((runtime.hass.states.get(first).state, runtime.hass.states.get(second).state), before)

    async def test_tou_accepts_arbitrary_minute_boundary(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(2, start="06:15")
        state = runtime.hass.states.get("time.deye_inverter_time_of_use_2_start")
        self.assertIsNotNone(state)
        self.assertTrue(str(state.state).startswith("06:15"))

    async def test_tou_rejects_identical_start_and_end(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        with self.assertRaisesRegex(ValueError, "same hour"):
            await runtime.async_set_physical_tou_slot(2, start="06:00", end="06:00")

    async def test_tou_rejects_duplicate_starts(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        with self.assertRaisesRegex(ValueError, "must be unique"):
            await runtime.async_set_physical_tou_slot(2, start="08:00")

    async def test_tou_rejects_invalid_slot_order(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        with self.assertRaisesRegex(ValueError, "strict slot order"):
            await runtime.async_set_physical_tou_slot(2, start="10:00")

    def test_tou_accepts_single_midnight_wrap(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        self.assertEqual(runtime._validated_tou_start_vector(2), ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"])

    async def test_tou_rejects_overlapping_ranges(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        with self.assertRaisesRegex(ValueError, "strict slot order"):
            await runtime.async_set_physical_tou_slot(4, end="11:00")

    def test_tou_validates_full_24h_coverage(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        starts = runtime._validated_tou_start_vector(1)
        lengths = [
            ((int(starts[(idx + 1) % 6][:2]) - int(starts[idx][:2])) % 24)
            for idx in range(6)
        ]
        self.assertEqual(sum(lengths), 24)

    async def test_sunsynk_soc_only_write_preserves_allow_gen(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        self._set_starts(runtime)
        entity = "select.sunsynk_prog_2_charge"
        runtime.hass.states.values[entity] = FakeState("Allow Gen", {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]})
        await runtime.async_set_physical_tou_slot(2, soc=55)
        self.assertEqual(runtime.hass.states.get(entity).state, "Allow Gen")

    async def test_sunsynk_soc_only_write_preserves_allow_grid_and_gen(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        self._set_starts(runtime)
        entity = "select.sunsynk_prog_2_charge"
        runtime.hass.states.values[entity] = FakeState("Allow Grid & Gen", {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]})
        await runtime.async_set_physical_tou_slot(2, soc=55)
        self.assertEqual(runtime.hass.states.get(entity).state, "Allow Grid & Gen")

    async def test_solarman_soc_only_write_preserves_disabled_alias(self):
        runtime = make_runtime()
        self._add_solarman_entities(runtime)
        self._set_starts(runtime)
        entity = "select.solarman_program_2_charging"
        runtime.hass.states.values[entity] = FakeState("Disable", {"options": ["Disable", "Grid", "Generator", "Both"]})
        await runtime.async_set_physical_tou_slot(2, soc=55)
        self.assertEqual(runtime.hass.states.get(entity).state, "Disable")

    async def test_tou_rollback_restores_exact_provider_grid_option(self):
        runtime = make_runtime()
        self._add_sunsynk_entities(runtime)
        entity = "select.sunsynk_prog_2_charge"
        runtime.hass.states.values[entity] = FakeState("Allow Gen", {"options": ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]})
        original = runtime._async_wait_for_tou_confirmation
        calls = 0

        async def fail_first(items, operation_name, expected_value_key="expected_logical_value", **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return [item for item in items if item.get("written")]
            return await original(items, operation_name, expected_value_key, **kwargs)

        runtime._async_wait_for_tou_confirmation = fail_first
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(2, grid_charge=True)
        self.assertEqual(runtime.hass.states.get(entity).state, "Allow Gen")

    async def test_second_tou_write_is_rejected_before_operation_lock_wait(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime._operation_lock.acquire()
        first = asyncio.create_task(runtime.async_set_physical_tou_slot(1, soc=55))
        while not runtime.tou_write_pending:
            await asyncio.sleep(0)
        with self.assertRaisesRegex(ValueError, "write in progress"):
            await runtime.async_set_physical_tou_slot(2, soc=60)
        runtime._operation_lock.release()
        await first

    async def test_tou_pending_reservation_is_race_safe(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime._operation_lock.acquire()
        first = asyncio.create_task(runtime.async_set_physical_tou_slot(1, soc=55))
        while not runtime.tou_write_pending:
            await asyncio.sleep(0)
        second = asyncio.create_task(runtime.async_set_physical_tou_slot(2, soc=60))
        await asyncio.sleep(0)
        runtime._operation_lock.release()
        results = await asyncio.gather(first, second, return_exceptions=True)
        self.assertEqual(sum(isinstance(result, ValueError) for result in results), 1)

    async def test_tou_pending_is_cleared_after_validation_error(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        # Duplicating slot 2's start is a genuine layout validation error and
        # must still release the pending reservation.  (Arbitrary whole-minute
        # boundaries such as 01:30 are now valid.)
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(1, start="04:00")
        self.assertFalse(runtime.tou_write_pending)

    async def test_tou_pending_is_cleared_after_success(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertFalse(runtime.tou_write_pending)

    async def test_tou_pending_is_cleared_after_timeout(self):
        runtime = make_runtime()
        entity = "number.deye_inverter_time_of_use_1_soc"
        runtime.control_confirmation_timeout = 0.01
        runtime.hass.services.ignore_once("number", "set_value", entity_id=entity)
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertFalse(runtime.tou_write_pending)

    async def test_tou_pending_is_cleared_after_cancellation(self):
        runtime = make_runtime()
        waiting = asyncio.Event()
        release = asyncio.Event()
        original = runtime._async_wait_for_tou_confirmation

        async def wait(items, operation_name, expected_value_key="expected_logical_value", **kwargs):
            if expected_value_key == "previous_logical_value":
                return await original(items, operation_name, expected_value_key, **kwargs)
            waiting.set()
            await release.wait()
            return []

        runtime._async_wait_for_tou_confirmation = wait
        task = asyncio.create_task(runtime.async_set_physical_tou_slot(1, soc=55))
        await waiting.wait()
        task.cancel()
        release.set()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertFalse(runtime.tou_write_pending)

    async def test_tou_transaction_field_status_waiting(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        captured = []
        original = runtime._async_wait_for_tou_confirmation

        async def inspect(items, operation_name, expected_value_key="expected_logical_value", **kwargs):
            captured.extend(item["status"] for item in items if item["changed"])
            self.assertEqual(runtime.tou_contract_status, "waiting")
            return await original(items, operation_name, expected_value_key, **kwargs)

        runtime._async_wait_for_tou_confirmation = inspect
        await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(captured, ["waiting"])

    async def test_tou_transaction_field_status_confirmed(self):
        runtime = make_runtime()
        self._set_starts(runtime)
        await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(runtime.tou_transaction_log[0]["status"], "confirmed")
        self.assertEqual(runtime.tou_contract_status, "confirmed")

    async def test_tou_transaction_field_status_rolled_back_after_confirmed_restore(self):
        runtime = make_runtime()
        entity = "number.deye_inverter_time_of_use_1_soc"
        runtime.control_confirmation_timeout = 0.01
        runtime.hass.services.ignore_once("number", "set_value", entity_id=entity)
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(runtime.tou_transaction_log[0]["status"], "rolled_back")
        self.assertTrue(runtime.tou_transaction_log[0]["confirmed"])

    async def test_tou_transaction_field_status_unavailable(self):
        runtime = make_runtime()
        entity = "number.deye_inverter_time_of_use_1_soc"
        runtime.hass.states.values[entity] = FakeState("unavailable")
        snapshot = {}
        item = runtime._make_tou_transaction_item(entity, "soc", 1, 55, snapshot)
        item["written"] = True
        runtime.control_confirmation_timeout = 0
        await runtime._async_wait_for_tou_confirmation([item], "test")
        self.assertEqual(item["status"], "unavailable")

    def test_tou_diagnostics_expose_actual_expected_and_capability(self):
        runtime = make_runtime()
        row = runtime.physical_tou_snapshot()[0]
        for field in ("start", "end", "soc", "grid_charge"):
            self.assertIn("actual", row["fields"][field])
            self.assertIn("expected", row["fields"][field])
            self.assertIn("capability", row["fields"][field])

    async def test_tou_operation_status_reports_rollback(self):
        runtime = make_runtime()
        entity = "number.deye_inverter_time_of_use_1_soc"
        runtime.control_confirmation_timeout = 0.01
        runtime.hass.services.ignore_once("number", "set_value", entity_id=entity)
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(runtime.tou_contract_status, "rollback")

    async def test_tou_operation_status_reports_rollback_failed(self):
        runtime = make_runtime()
        entity = "number.deye_inverter_time_of_use_1_soc"
        runtime.control_confirmation_timeout = 0.01
        runtime.hass.services.ignore_once("number", "set_value", entity_id=entity)

        async def fail_rollback(_items, _snapshot):
            return False, ["test"]

        runtime._async_rollback_tou_transaction = fail_rollback
        with self.assertRaises(ValueError):
            await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(runtime.tou_contract_status, "rollback_failed")

    async def test_tou_write_is_blocked_by_master_control(self):
        runtime = make_runtime()
        runtime.control_enabled = False
        runtime.control_status = "Disabled"
        with self.assertRaisesRegex(manager.ControlDisabledError, "Deye control is disabled"):
            await runtime.async_set_physical_tou_slot(1, soc=55)
        self.assertEqual(self._tou_calls(runtime), [])

    def test_explicit_empty_four_fields_survive_runtime_reload_without_provider_fallback(self):
        runtime = make_runtime()
        for key in (
            const.CONF_PRICE_SENSOR,
            const.CONF_SELL_PRICE_TOMORROW_SENSOR,
            const.CONF_BUY_PRICE_TODAY_SENSOR,
            const.CONF_BUY_PRICE_TOMORROW_SENSOR,
        ):
            runtime.data[key] = ""
        runtime.hass.states.values.update({
            "sensor.octopus_import_current_rate": FakeState("0.20"),
            "sensor.octopus_import_next_day_rates": FakeState("0.21"),
            "sensor.octopus_export_current_rate": FakeState("0.80"),
            "sensor.octopus_export_next_day_rates": FakeState("0.81"),
        })
        self.assertIsNone(runtime.buy_price_today_sensor)
        self.assertIsNone(runtime.buy_price_tomorrow_sensor)
        self.assertIsNone(runtime.price_sensor)
        self.assertIsNone(runtime.sell_price_tomorrow_sensor)
        canonical = runtime.canonical_price_context(manager.ha_now(), [])
        self.assertEqual(canonical["buy"]["rows"], [])
        self.assertEqual(canonical["sell"]["rows"], [])
        self.assertEqual(canonical["buy"]["diagnostics"]["status"], "price_source_not_configured")
        self.assertEqual(canonical["sell"]["diagnostics"]["status"], "price_source_not_configured")
        reloaded = manager.DeyeEnergyRuntime(runtime.hass, "reload", dict(runtime.data))
        self.assertIsNone(reloaded.buy_price_today_sensor)
        self.assertIsNone(reloaded.price_sensor)
        self.assertEqual(reloaded.price_contract("buy")["today_entity"], "")
        self.assertEqual(reloaded.price_contract("sell")["today_entity"], "")

    def test_tariff_editor_save_persists_explicit_empty_over_previous_defaults(self):
        runtime = make_runtime()
        runtime.data.update({
            const.CONF_BUY_PRICE_TODAY_SENSOR: "",
            const.CONF_BUY_PRICE_TOMORROW_SENSOR: "",
            const.CONF_PRICE_SENSOR: "",
            const.CONF_SELL_PRICE_TOMORROW_SENSOR: "",
        })
        runtime._tariff_catalog_manager = types.SimpleNamespace(catalog={
            "providers": {
                const.DEFAULT_DSO_PROVIDER: {
                    "tariffs": {const.DEFAULT_TARIFF_PLAN: {}},
                },
            },
        })
        normalized = runtime.validate_tariff_settings({
            const.CONF_BUY_PRICE_CONTRACT: {
                "source_adapter": "octopus_energy", "today_entity": "sensor.stale_buy", "tomorrow_entity": "sensor.stale_buy_tomorrow",
            },
            const.CONF_SELL_PRICE_CONTRACT: {
                "source_adapter": "octopus_energy", "today_entity": "sensor.stale_sell", "tomorrow_entity": "sensor.stale_sell_tomorrow",
            },
        })
        self.assertEqual(normalized[const.CONF_BUY_PRICE_TODAY_SENSOR], "")
        self.assertEqual(normalized[const.CONF_BUY_PRICE_TOMORROW_SENSOR], "")
        self.assertEqual(normalized[const.CONF_PRICE_SENSOR], "")
        self.assertEqual(normalized[const.CONF_SELL_PRICE_TOMORROW_SENSOR], "")
        runtime.data.update(normalized)
        self.assertIsNone(runtime.buy_price_today_sensor)
        self.assertIsNone(runtime.price_sensor)
        self.assertEqual(runtime.price_contract("buy")["stable_identity_today_status"], "unmapped")
        self.assertEqual(runtime.price_contract("sell")["stable_identity_today_reason"], "user_unmapped")


    def test_mixed_buy_octopus_energy_and_sell_empty_keeps_directions_independent(self):
        runtime = make_runtime()
        now = manager.ha_now()
        buy_today = "sensor.buy_today_selected"
        buy_tomorrow = "sensor.buy_tomorrow_selected"
        runtime.data.update({
            const.CONF_PRICE_SENSOR: "",
            const.CONF_SELL_PRICE_TOMORROW_SENSOR: "",
            const.CONF_BUY_PRICE_TODAY_SENSOR: buy_today,
            const.CONF_BUY_PRICE_TOMORROW_SENSOR: buy_tomorrow,
            const.CONF_BUY_PRICE_CONTRACT: {
                "source_adapter": "octopus_energy", "today_entity": buy_today, "tomorrow_entity": buy_tomorrow,
            },
        })
        runtime.hass.states.values[buy_today] = FakeState("unknown", {"rates": [
            {"start": now.replace(hour=hour).isoformat(), "end": (now.replace(hour=hour) + timedelta(hours=1)).isoformat(), "price": 0.3}
            for hour in range(24)
        ]}, buy_today)
        tomorrow = now + timedelta(days=1)
        runtime.hass.states.values[buy_tomorrow] = FakeState("unknown", {"rates": [
            {"start": tomorrow.replace(hour=hour).isoformat(), "end": (tomorrow.replace(hour=hour) + timedelta(hours=1)).isoformat(), "price": 0.4}
            for hour in range(24)
        ]}, buy_tomorrow)
        canonical = runtime.canonical_price_context(now, [])
        self.assertEqual(len(canonical["buy"]["rows"]), 48)
        self.assertEqual(canonical["sell"]["rows"], [])
        self.assertEqual(canonical["sell"]["diagnostics"]["status"], "price_source_not_configured")

    def test_user_mapping_is_absolute_and_missing_mapping_never_falls_back_to_provider_default(self):
        runtime = make_runtime()
        runtime.data[const.CONF_BUY_PRICE_TODAY_SENSOR] = "sensor.user_selected_missing"
        runtime.hass.states.values["sensor.octopus_import_current_rate"] = FakeState(
            "unknown",
            {"rates": [
                {"start": manager.ha_now().replace(hour=hour).isoformat(),
                 "end": (manager.ha_now().replace(hour=hour) + timedelta(hours=1)).isoformat(),
                 "price": 0.11}
                for hour in range(24)
            ]},
            "sensor.octopus_import_current_rate",
        )
        contract = runtime.price_contract("buy")
        self.assertEqual(contract["today_entity"], "sensor.user_selected_missing")
        self.assertEqual(contract["stable_identity_today_status"], "mapped_entity_missing")
        canonical = runtime.canonical_price_context(manager.ha_now(), [])
        self.assertEqual(canonical["buy"]["rows"], [])
        self.assertEqual(
            canonical["buy"]["diagnostics"]["resolver"]["today"]["status"],
            "mapped_entity_missing",
        )

    def test_stable_registry_identity_survives_rename_without_switching_entity(self):
        runtime = make_runtime()
        old_entity = "sensor.old_price_name"
        new_entity = "sensor.moja_cena"
        now = manager.ha_now()
        runtime.hass.states.values[new_entity] = FakeState(
            "unknown",
            {"rates": [
                {"start": now.replace(hour=hour).isoformat(),
                 "end": (now.replace(hour=hour) + timedelta(hours=1)).isoformat(),
                 "price": 0.44}
                for hour in range(24)
            ]},
            new_entity,
        )
        registry_entry = types.SimpleNamespace(
            id="stable-entry", entity_id=new_entity, platform="octopus_energy",
            config_entry_id="octopus_energy-config", unique_id="stable-price", device_id="device-1",
        )
        registry = types.SimpleNamespace(entities={new_entity: registry_entry}, async_get=lambda entity_id: registry.entities.get(entity_id))
        runtime.data[const.CONF_BUY_PRICE_TODAY_SENSOR] = old_entity
        runtime.data[const.CONF_BUY_PRICE_CONTRACT] = {
            "source_adapter": "octopus_energy",
            "today_entity": old_entity,
            "today_binding": {
                "entity_id": old_entity, "registry_entry_id": "stable-entry",
                "platform": "octopus_energy", "config_entry_id": "octopus_energy-config",
                "unique_id": "stable-price", "device_id": "device-1",
            },
        }
        entity_registry = sys.modules["homeassistant.helpers.entity_registry"]
        with mock.patch.object(entity_registry, "async_get", return_value=registry):
            contract = runtime.price_contract("buy")
            self.assertEqual(contract["resolved_today_entity"], new_entity)
            self.assertEqual(contract["stable_identity_today_status"], "renamed_resolved")
            self.assertEqual(contract["source_adapter"], "octopus_energy")
            canonical = runtime.canonical_price_context(now, [])
        self.assertEqual(len(canonical["buy"]["rows"]), 24)
        self.assertEqual(canonical["buy"]["diagnostics"]["resolver"]["today"]["mapped_entity"], old_entity)
        self.assertEqual(canonical["buy"]["diagnostics"]["resolver"]["today"]["resolved_entity"], new_entity)

    def test_reused_old_entity_id_cannot_override_saved_stable_identity(self):
        runtime = make_runtime()
        old_entity = "sensor.old_price_name"
        new_entity = "sensor.same_source_after_rename"
        runtime.hass.states.values[old_entity] = FakeState("unknown", {"rates": []}, old_entity)
        runtime.hass.states.values[new_entity] = FakeState("unknown", {"rates": []}, new_entity)
        wrong_entry = types.SimpleNamespace(id="other-entry", entity_id=old_entity, platform="other", config_entry_id="other", unique_id="other", device_id="other")
        right_entry = types.SimpleNamespace(id="stable-entry", entity_id=new_entity, platform="octopus_energy", config_entry_id="octopus_energy", unique_id="price", device_id="device")
        registry = types.SimpleNamespace(
            entities={old_entity: wrong_entry, new_entity: right_entry},
            async_get=lambda entity_id: registry.entities.get(entity_id),
        )
        binding = {"entity_id": old_entity, "registry_entry_id": "stable-entry", "platform": "octopus_energy", "config_entry_id": "octopus_energy", "unique_id": "price"}
        entity_registry = sys.modules["homeassistant.helpers.entity_registry"]
        with mock.patch.object(entity_registry, "async_get", return_value=registry):
            resolved, status, _reason = runtime.resolve_price_binding(old_entity, binding)
        self.assertEqual(resolved, new_entity)
        self.assertEqual(status, "renamed_resolved")

    def test_strict_contract_validation_rejects_unsupported_mapped_series(self):
        runtime = make_runtime()
        entity_id = "sensor.unsupported_price_series"
        runtime.hass.states.values[entity_id] = FakeState("0.50", {"not_prices": [{"foo": "bar"}]}, entity_id)
        contract = {
            "source_adapter": "generic", "direction": "buy",
            "today_entity": entity_id, "tomorrow_entity": "",
            "semantic_scope": "energy_only", "includes_distribution_variable": False,
            "price_basis": "gross", "unit": "GBP/kWh",
        }
        with self.assertRaisesRegex(ValueError, "unsupported_price_schema"):
            runtime.validate_and_bind_price_contract(contract, strict=True)

    def test_manager_builds_one_shared_octopus_energy_price_truth_without_double_dso(self):
        runtime = make_runtime()
        today = manager.ha_now()
        tomorrow = today + timedelta(days=1)
        runtime.data.update({
            const.CONF_BUY_PRICE_TODAY_SENSOR: "sensor.octopus_import_current_rate",
            const.CONF_BUY_PRICE_TOMORROW_SENSOR: "sensor.octopus_import_next_day_rates",
            const.CONF_BUY_PRICE_CONTRACT: {
                "source_adapter": "octopus_energy",
                "today_entity": "sensor.octopus_import_current_rate",
                "tomorrow_entity": "sensor.octopus_import_next_day_rates",
            },
        })
        runtime.hass.states.values["sensor.octopus_import_current_rate"] = FakeState(
            "0.23",
            {"rates": [
                {"start": today.replace(hour=hour).isoformat(),
                 "end": (today.replace(hour=hour) + timedelta(hours=1)).isoformat(),
                 "price": 0.23}
                for hour in range(24)
            ]},
            "sensor.octopus_import_current_rate",
        )
        runtime.hass.states.values["sensor.octopus_import_next_day_rates"] = FakeState(
            "unknown",
            {"rates": [
                {"start": tomorrow.replace(hour=hour).isoformat(),
                 "end": (tomorrow.replace(hour=hour) + timedelta(hours=1)).isoformat(),
                 "price": 0.24}
                for hour in range(24)
            ]},
            "sensor.octopus_import_next_day_rates",
        )
        tariff_rows = [
            {"date": (today + timedelta(days=day)).date().isoformat(), "hour": hour,
             "available": True, "total_distribution_rate": 0.16}
            for day in (0, 1) for hour in range(24)
        ]
        canonical = runtime.canonical_price_context(today, tariff_rows)
        self.assertEqual(48, len(canonical["buy"]["rows"]))
        self.assertTrue(all(row["final_price_gbp_kwh"] in (0.23, 0.24) for row in canonical["buy"]["rows"]))
        self.assertTrue(all(row["added_distribution"] == 0 for row in canonical["buy"]["rows"]))
        self.assertEqual(canonical, runtime._canonical_price_snapshot)



    def test_stale_persisted_buy_row_is_removed_without_touching_sell(self):
        runtime = make_runtime()
        runtime.data.update({
            const.CONF_BUY_PRICE_TODAY_SENSOR: "",
            const.CONF_BUY_PRICE_TOMORROW_SENSOR: "",
            const.CONF_BUY_PRICE_CONTRACT: {
                "source_adapter": "octopus_energy",
                "today_entity": "sensor.old_octopus_energy_buy",
                "tomorrow_entity": "sensor.old_octopus_energy_buy_tomorrow",
                "semantic_scope": "all_in_variable",
                "includes_distribution_variable": True,
            },
            const.CONF_PRICE_SOURCE: "octopus_energy",
        })
        sell_contract = runtime.price_contract("sell")
        sell_adapter = sell_contract.get("resolved_adapter_today") or sell_contract.get("source_adapter")
        sell_semantic = manager.effective_contract_for_day(sell_contract, 0).get("semantic_scope")
        stale_buy_row = {
            "day": "tomorrow", "hour": 23, "quality": "ready",
            "source_adapter": "octopus_energy", "source_semantic_scope": "all_in_variable",
            "final_price_gbp_kwh": 1.16,
        }
        valid_sell_row = {
            "day": "today", "hour": 12, "quality": "ready",
            "source_adapter": sell_adapter, "source_semantic_scope": sell_semantic,
            "final_price_gbp_kwh": 0.8,
        }
        runtime._canonical_price_snapshot = {
            "schema_version": 1,
            "buy": {
                "contract": dict(runtime.data[const.CONF_BUY_PRICE_CONTRACT]),
                "rows": [stale_buy_row],
                "diagnostics": {"coverage_today": 0, "coverage_tomorrow": 1},
            },
            "sell": {
                "contract": sell_contract,
                "rows": [valid_sell_row],
                "diagnostics": {"coverage_today": 1, "coverage_tomorrow": 0},
            },
        }

        self.assertTrue(runtime._sanitize_cached_price_plans())
        canonical = runtime._canonical_price_snapshot
        self.assertEqual(canonical["buy"]["rows"], [])
        self.assertEqual(canonical["buy"]["diagnostics"]["coverage_tomorrow"], 0)
        self.assertEqual(canonical["buy"]["diagnostics"]["resolver"]["tomorrow"]["mapped_entity"], "")
        self.assertEqual(canonical["buy"]["contract"]["adapter_summary"], "unmapped")
        self.assertNotIn("semantic_scope", canonical["buy"]["contract"])
        self.assertEqual(canonical["sell"]["rows"], [valid_sell_row])


def manual_row(**overrides):
    row = {
        "from": "00:00",
        "to": "00:00",
        "enabled": True,
        "mode": const.MODE_NORMAL_OPERATION,
        "sell_power": 0,
        "minimum_sell_soc": 0,
        "charge_enabled": False,
        "battery_charge_enabled": False,
    }
    row.update(overrides)
    return row


def manual_slot_signature(slot):
    return (
        slot.enabled,
        slot.mode,
        slot.physical_work_mode,
        slot.sell_power,
        slot.charge_enabled,
        slot.minimum_sell_soc,
        slot.tou_soc,
        slot.min_sell_price,
    )


class ManualScheduleTests(unittest.IsolatedAsyncioTestCase):
    def test_validation_accepts_contiguous_full_day_and_last_midnight(self):
        runtime = make_runtime()
        rows = runtime._validate_manual_schedule_rows([
            manual_row(to="07:15"),
            manual_row(
                **{
                    "from": "07:15",
                    "to": "19:45",
                    "mode": const.MODE_SELLING_FIRST,
                    "sell_power": 5000,
                    "tou_soc": 30,
                }
            ),
            manual_row(
                **{
                    "from": "19:45",
                    "to": "00:00",
                    "mode": const.MODE_CHARGE,
                    "charge_enabled": True,
                    "tou_soc": 90,
                }
            ),
        ])
        self.assertEqual([row["from"] for row in rows], ["00:00", "07:15", "19:45"])
        self.assertEqual(rows[-1]["to"], "00:00")
        removed = {
            "physical_work_mode", "discharge_current", "charge_current",
            "grid_charge_current", "min_sell_price",
        }
        self.assertTrue(all(removed.isdisjoint(row) for row in rows))

    def test_validation_rejects_invalid_boundaries_and_coverage(self):
        runtime = make_runtime()
        cases = [
            (
                [manual_row(**{"from": "00:01"})],
                "must start at 00:00",
            ),
            (
                [manual_row(to="12:00"), manual_row(**{"from": "12:00", "to": "13:00"})],
                "must end at 00:00",
            ),
            (
                [manual_row(to="12:00"), manual_row(**{"from": "13:00"})],
                "without gaps",
            ),
            (
                [manual_row(to="13:00"), manual_row(**{"from": "12:00"})],
                "must not overlap",
            ),
            (
                [
                    manual_row(to="10:00"),
                    manual_row(**{"from": "10:00", "to": "10:00"}),
                    manual_row(**{"from": "10:00"}),
                ],
                "at least 1 minute",
            ),
            (
                [manual_row(to="00:00"), manual_row()],
                "at least 1 minute",
            ),
        ]
        for rows, message in cases:
            with self.subTest(message=message):
                with self.assertRaisesRegex(ValueError, message):
                    runtime._validate_manual_schedule_rows(rows)

    def test_validation_rejects_unknown_fields_modes_and_ranges(self):
        runtime = make_runtime()
        with self.assertRaisesRegex(ValueError, "Unsupported manual schedule fields"):
            runtime._validate_manual_schedule_rows([manual_row(to="00:00", unexpected=1)])
        with self.assertRaisesRegex(ValueError, "Unsupported manual schedule mode"):
            runtime._validate_manual_schedule_rows([manual_row(to="00:00", mode="Nope")])
        with self.assertRaisesRegex(ValueError, "must be between"):
            runtime._validate_manual_schedule_rows([manual_row(to="00:00", sell_power=-1)])

    def test_validation_ignores_removed_legacy_fields(self):
        runtime = make_runtime()
        rows = runtime._validate_manual_schedule_rows([manual_row(
            to="00:00",
            physical_work_mode=const.MODE_ZERO_EXPORT,
            discharge_current=999,
            charge_current=999,
            grid_charge_current=999,
            min_sell_price=999,
            tou_soc=999,
        )])
        removed = {
            "physical_work_mode", "discharge_current", "charge_current",
            "grid_charge_current", "min_sell_price", "tou_soc",
        }
        self.assertTrue(all(removed.isdisjoint(row) for row in rows))

    def test_load_state_drops_invalid_rows_and_requires_a_snapshot_when_active(self):
        runtime = make_runtime()
        loaded = runtime._load_manual_schedule_state({
            "active": True,
            "rows": [
                manual_row(to="12:00"),
                manual_row(**{"from": "12:00"}),
                {"from": "bad", "to": "00:00"},
                "not-a-row",
            ],
        })
        self.assertFalse(loaded["active"])
        self.assertEqual(len(loaded["rows"]), 2)
        self.assertIsNone(loaded["activation_snapshot"])


class MappingMinuteResolutionTests(unittest.TestCase):
    def test_manual_schedule_active_uses_half_open_minute_interval(self):
        runtime = make_runtime()
        runtime.manual_schedule = {
            "schema_version": 1,
            "active": True,
            "rows": [
                {"from": "00:00", "to": "00:10", "enabled": True, "mode": const.MODE_NORMAL_OPERATION, "sell_power": 0, "minimum_sell_soc": 20, "tou_soc": 100, "charge_enabled": False, "battery_charge_enabled": False},
                {"from": "00:10", "to": "00:00", "enabled": True, "mode": const.MODE_SELLING_FIRST, "sell_power": 500, "minimum_sell_soc": 20, "tou_soc": 100, "charge_enabled": False, "battery_charge_enabled": False},
            ],
            "activation_snapshot": {"schema_version": 2},
        }
        self.assertEqual(runtime.active_decision_at_minute(0).mode, const.MODE_NORMAL_OPERATION)
        self.assertEqual(runtime.active_decision_at_minute(9).mode, const.MODE_NORMAL_OPERATION)
        self.assertEqual(runtime.active_decision_at_minute(10).mode, const.MODE_SELLING_FIRST)

    def test_manual_schedule_last_row_ending_0000_wraps_to_1440(self):
        runtime = make_runtime()
        runtime.manual_schedule = {
            "schema_version": 1,
            "active": True,
            "rows": [
                {"from": "00:00", "to": "23:50", "enabled": True, "mode": const.MODE_NORMAL_OPERATION, "sell_power": 0, "minimum_sell_soc": 20, "tou_soc": 100, "charge_enabled": False, "battery_charge_enabled": False},
                {"from": "23:50", "to": "00:00", "enabled": True, "mode": const.MODE_CHARGE, "sell_power": 0, "minimum_sell_soc": 20, "tou_soc": 90, "charge_enabled": True, "battery_charge_enabled": True},
            ],
            "activation_snapshot": {"schema_version": 2},
        }
        self.assertEqual(runtime.active_decision_at_minute(23 * 60 + 49).mode, const.MODE_NORMAL_OPERATION)
        self.assertEqual(runtime.active_decision_at_minute(23 * 60 + 50).mode, const.MODE_CHARGE)
        self.assertEqual(runtime.active_decision_at_minute(23 * 60 + 59).mode, const.MODE_CHARGE)

    def test_inactive_manual_schedule_uses_physical_tou_baseline(self):
        runtime = make_runtime()
        runtime.manual_schedule = {"schema_version": 1, "active": False, "rows": [], "activation_snapshot": None}
        runtime.hass.states.values["time.deye_inverter_time_of_use_1_start"] = FakeState("00:00:00")
        runtime.hass.states.values["time.deye_inverter_time_of_use_2_start"] = FakeState("06:00:00")
        runtime.hass.states.values["number.deye_inverter_time_of_use_1_soc"] = FakeState("55")
        runtime.hass.states.values["switch.deye_inverter_time_of_use_1_grid_charge"] = FakeState("on")
        decision = runtime.active_decision_at_minute(5 * 60)
        self.assertEqual(decision.source, "Time Of Use")
        self.assertEqual(decision.tou_soc, 55.0)
        self.assertTrue(decision.charge_enabled)

    def test_manual_schedule_allows_many_rows_without_tou_compression(self):
        runtime = make_runtime()
        runtime.manual_schedule = {"schema_version": 1, "active": True, "rows": [], "activation_snapshot": {"schema_version": 2}}
        rows = []
        for i in range(48):
            start = i * 30
            end = 1440 if i == 47 else (i + 1) * 30
            rows.append({
                "from": runtime._minutes_to_hhmm(start),
                "to": "00:00" if end == 1440 else runtime._minutes_to_hhmm(end),
                "enabled": True,
                "mode": const.MODE_NORMAL_OPERATION if i % 2 == 0 else const.MODE_SELLING_FIRST,
                "sell_power": 500,
                "minimum_sell_soc": 20,
                "charge_enabled": i % 3 == 0,
                "battery_charge_enabled": False,
            })
        validated = runtime._validate_manual_schedule_rows(rows)
        self.assertEqual(len(validated), 48)
        runtime.manual_schedule["rows"] = validated
        self.assertEqual(runtime.active_decision_at_minute(0).mode, const.MODE_NORMAL_OPERATION)
        self.assertEqual(runtime.active_decision_at_minute(30).mode, const.MODE_SELLING_FIRST)

    def test_tou_baseline_uses_global_logical_soc_and_physical_tou_fields(self):
        runtime = make_runtime()
        runtime.manual_schedule = {"schema_version": 1, "active": False, "rows": [], "activation_snapshot": None}
        runtime.min_sell_soc = 33.0
        for idx, start in enumerate(["00:00:00", "04:00:00", "08:00:00", "12:00:00", "16:00:00", "20:00:00"], start=1):
            runtime.hass.states.values[f"time.deye_inverter_time_of_use_{idx}_start"] = FakeState(start)
        runtime.hass.states.values["number.deye_inverter_time_of_use_1_soc"] = FakeState("77")
        runtime.hass.states.values["switch.deye_inverter_time_of_use_1_grid_charge"] = FakeState("on")
        decision = runtime.active_decision_at_minute(10)
        self.assertEqual(decision.minimum_sell_soc, 33.0)
        self.assertEqual(decision.tou_soc, 77.0)
        self.assertTrue(decision.charge_enabled)

if __name__ == "__main__":
    unittest.main()
