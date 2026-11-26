"""Current limits are direct inverter-configuration fields only."""

from __future__ import annotations

import inspect
import unittest

from test_manager_logic import FakeState, PACKAGE, const, make_runtime, manager

CURRENT_FIELDS = ("max_discharge_current", "max_charge_current", "max_grid_charge_current")
CURRENT_ENTITY_KEYS = {
    "max_discharge_current": const.DEFAULT_DISCHARGE_CURRENT,
    "max_charge_current": const.DEFAULT_CHARGE_CURRENT,
    "max_grid_charge_current": const.DEFAULT_GRID_CHARGE_CURRENT,
}


class MemoryStore:
    def __init__(self):
        self.value = None

    async def async_save(self, value):
        self.value = value

    async def async_load(self):
        return self.value


class DirectCurrentLimitTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _add_live_current_entities(runtime, *, minimum=0, maximum=200, step=4):
        attributes = {
            "min": minimum,
            "max": maximum,
            "step": step,
            "unit_of_measurement": "A",
        }
        for entity_id in CURRENT_ENTITY_KEYS.values():
            runtime.hass.states.values[entity_id] = FakeState("80", attributes)

    @staticmethod
    def _battery_charging_fields(report):
        group = next(
            item for item in report["groups"] if item["key"] == "battery_charging"
        )
        return {field["key"]: field for field in group["fields"]}

    def test_manager_runtime_methods_have_no_current_parameters(self):
        for name in (
            "async_apply_settings",
            "async_manual_sell",
            "async_charge_now",
            "async_save_charge_profile",
            "async_save_normal_profile",
            "async_save_default_settings",
        ):
            with self.subTest(method=name):
                parameters = inspect.signature(getattr(manager.DeyeEnergyRuntime, name)).parameters
                self.assertFalse(any("current" in name for name in parameters))

    def test_manager_state_has_no_current_limit_attributes(self):
        runtime = make_runtime()
        for name in (
            "charge_current_number",
            "discharge_current_number",
            "grid_charge_current_number",
            "default_charge_current",
            "default_discharge_current",
            "default_grid_charge_current",
            "charge_profile_charge_current",
            "charge_profile_discharge_current",
            "charge_profile_grid_charge_current",
        ):
            with self.subTest(attribute=name):
                self.assertFalse(hasattr(runtime, name))

    def test_direct_configuration_services_are_registered(self):
        source = (PACKAGE / "__init__.py").read_text(encoding="utf-8")
        self.assertIn('"get_inverter_configuration"', source)
        self.assertIn('"apply_inverter_configuration_group"', source)
        self.assertIn("return _active_runtime().read_inverter_configuration()", source)
        self.assertIn(
            "return await _active_runtime().async_apply_inverter_configuration_group(",
            source,
        )

    async def test_read_uses_live_number_range_for_direct_current_fields(self):
        runtime = make_runtime()
        self._add_live_current_entities(runtime)
        fields = self._battery_charging_fields(runtime.read_inverter_configuration())

        for key in CURRENT_FIELDS:
            with self.subTest(field=key):
                descriptor = fields[key]
                self.assertEqual(descriptor["entity_id"], CURRENT_ENTITY_KEYS[key])
                self.assertEqual(descriptor["domain"], "number")
                self.assertEqual(descriptor["value"], 80.0)
                self.assertEqual(descriptor["unit"], "A")
                self.assertEqual(descriptor["min"], 0.0)
                self.assertEqual(descriptor["max"], 200.0)
                self.assertEqual(descriptor["step"], 4.0)
                self.assertTrue(descriptor["writable"])

    async def test_apply_uses_live_number_range_for_direct_current_field(self):
        runtime = make_runtime()
        self._add_live_current_entities(runtime)
        result = await runtime.async_apply_inverter_configuration_group(
            "battery_charging", {"max_charge_current": 88}
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["results"],
            [{
                "key": "max_charge_current",
                "entity_id": const.DEFAULT_CHARGE_CURRENT,
                "value": 88.0,
                "status": "ok",
            }],
        )
        calls = [
            call for call in runtime.hass.services.calls
            if call[:2] == ("number", "set_value")
        ]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2], {"entity_id": const.DEFAULT_CHARGE_CURRENT, "value": 88.0})
        self.assertEqual(runtime.hass.states.get(const.DEFAULT_CHARGE_CURRENT).state, "88.0")

    async def test_apply_rejects_values_outside_live_range_or_step_before_writing(self):
        for value, reason in ((201, "between"), (81, "step")):
            with self.subTest(value=value):
                runtime = make_runtime()
                self._add_live_current_entities(runtime)
                with self.assertRaisesRegex(ValueError, reason):
                    await runtime.async_apply_inverter_configuration_group(
                        "battery_charging", {"max_grid_charge_current": value}
                    )
                self.assertEqual(runtime.hass.services.calls, [])

    async def test_direct_mapping_can_be_overridden_by_integration_configuration(self):
        runtime = make_runtime()
        configured_entity = "number.custom_charge_current"
        runtime.data[const.CONF_CHARGE_CURRENT_NUMBER] = configured_entity
        runtime.hass.states.values[configured_entity] = FakeState(
            "40", {"min": 0, "max": 100, "step": 10, "unit_of_measurement": "A"}
        )
        self._add_live_current_entities(runtime)

        fields = self._battery_charging_fields(runtime.read_inverter_configuration())
        self.assertEqual(fields["max_charge_current"]["entity_id"], configured_entity)

        result = await runtime.async_apply_inverter_configuration_group(
            "battery_charging", {"max_charge_current": 70}
        )
        self.assertEqual(result["status"], "ok")
        calls = [
            call for call in runtime.hass.services.calls
            if call[:2] == ("number", "set_value")
        ]
        self.assertEqual([call[2]["entity_id"] for call in calls], [configured_entity])
        self.assertNotIn(
            const.DEFAULT_CHARGE_CURRENT,
            [call[2]["entity_id"] for call in calls],
        )

    async def test_profile_saves_ignore_legacy_current_fields(self):
        runtime = make_runtime()
        store = MemoryStore()
        runtime._ai_store = store

        await runtime.async_save_charge_profile({
            "target_soc": 90,
            "grid_charge_enabled": True,
            "charge_current": 1,
            "grid_charge_current": 2,
        })
        self.assertEqual(store.value["charge_profile"], {
            "target_soc": 90.0,
            "grid_charge_enabled": True,
        })

        runtime.hass.states.values[const.DEFAULT_BATTERY_SOC] = FakeState("50")
        await runtime.async_save_default_settings({
            "mode": const.MODE_NORMAL_OPERATION,
            "physical_work_mode": const.MODE_ZERO_EXPORT,
            "sell_power": 0,
            "discharge_current": 3,
            "charge_current": 4,
        })
        self.assertEqual(store.value["default_profile"], {"sell_power": 0.0})
