from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]

def _read_all_card_sources():
    root = Path(__file__).resolve().parents[1]
    files = [
        "custom_components/deye_energy/www/deye-energy-card.js",
        "custom_components/deye_energy/www/deye-energy-main-card.js",
        "custom_components/deye_energy/www/deye-energy-inverter-config-card.js",
        "custom_components/deye_energy/www/deye-energy-trigger-logs-card.js",
        "custom_components/deye_energy/www/deye-energy-graphs-card.js",
        "custom_components/deye_energy/www/deye-energy-power-flow-card.js",
    ]
    return "\n".join((root / f).read_text(encoding="utf-8") for f in files)

NUMBER_SOURCE = (ROOT / "custom_components" / "deye_energy" / "number.py").read_text(encoding="utf-8")
SWITCH_SOURCE = (ROOT / "custom_components" / "deye_energy" / "switch.py").read_text(encoding="utf-8")
SENSOR_SOURCE = (ROOT / "custom_components" / "deye_energy" / "sensor.py").read_text(encoding="utf-8")
SELECT_SOURCE = (ROOT / "custom_components" / "deye_energy" / "select.py").read_text(encoding="utf-8")
PROVIDER_SOURCE = (ROOT / "custom_components" / "deye_energy" / "inverter_provider.py").read_text(encoding="utf-8")
INIT_SOURCE = (ROOT / "custom_components" / "deye_energy" / "__init__.py").read_text(encoding="utf-8")
ENTITY_SOURCE = (ROOT / "custom_components" / "deye_energy" / "entity.py").read_text(encoding="utf-8")


class ProfileHelperEntityContractTests(unittest.TestCase):
    """Ensure profile helper entities are created, enabled and publish runtime values."""

    def test_charge_profile_has_no_battery_current_helper_number(self):
        for helper in (
            "charge_profile_charge_current",
            "charge_profile_discharge_current",
            "charge_profile_grid_charge_current",
            "CURRENT_HELPER_MAX_A",
        ):
            self.assertNotIn(helper, NUMBER_SOURCE)

    def test_missing_normal_profile_tou_soc_number_is_created(self):
        self.assertIn(
            'DeyeManagerNumber(runtime, "normal_profile_tou_soc", "Normal profile Deye TOU SOC", "normal_profile_tou_soc", 0, 100, 1, "%")',
            NUMBER_SOURCE,
        )

    def test_missing_grid_enabled_switch_is_created(self):
        self.assertIn(
            'DeyeManagerSwitch(runtime, "charge_profile_grid_enabled", "Charge profile grid charge", "charge_profile_grid_enabled")',
            SWITCH_SOURCE,
        )

    def test_single_master_control_switch_is_exposed(self):
        self.assertEqual(SWITCH_SOURCE.count("DeyeControlSwitch(runtime)"), 1)
        body = SWITCH_SOURCE.split("class DeyeControlSwitch", 1)[1].split("class DeyeManagerSwitch", 1)[0]
        self.assertIn('super().__init__(runtime, "control", "Deye control")', body)
        self.assertIn("await self.runtime.async_enable_control()", body)
        self.assertIn("await self.runtime.async_disable_control()", body)
        self.assertNotIn("async_tick", body)

    def test_switch_platform_is_forwarded_by_integration_setup(self):
        self.assertIn('PLATFORMS = ["switch",', (ROOT / "custom_components" / "deye_energy" / "const.py").read_text(encoding="utf-8"))
        self.assertIn("async_forward_entry_setups(entry, PLATFORMS)", INIT_SOURCE)
        self.assertIn("async_unload_platforms(entry, PLATFORMS)", INIT_SOURCE)

    def test_planned_and_executed_sensors_have_english_names(self):
        self.assertIn('"planned_manager_action",\n                "Planned Manager decision"', SENSOR_SOURCE)
        self.assertIn('"executed_manager_action",\n                "Executed Manager decision"', SENSOR_SOURCE)

    def test_manager_status_exposes_canonical_decision_snapshot(self):
        self.assertIn('"active_decision": runtime.active_decision.key', SENSOR_SOURCE)
        self.assertIn('"next_active_decision": runtime.next_active_decision_label', SENSOR_SOURCE)
        self.assertIn('"active_decision": runtime.active_decision.key', SENSOR_SOURCE)

    def test_manager_status_exposes_control_entity_contract(self):
        self.assertIn('"control": {', SENSOR_SOURCE)
        self.assertIn('"entity_id": runtime.control_entity_id', SENSOR_SOURCE)
        self.assertIn('"enabled": bool(runtime.control_enabled)', SENSOR_SOURCE)
        self.assertIn('"status": runtime.control_status', SENSOR_SOURCE)

    def test_missing_normal_profile_mode_select_is_created(self):
        self.assertIn(
            'DeyeNormalProfileModeSelect(runtime)',
            SELECT_SOURCE,
        )
        self.assertIn('"normal_profile_mode"', SELECT_SOURCE)

    def test_base_entity_does_not_force_registry_enabled_default(self):
        # Setting this in the base class would affect every entity and is not
        # needed; the HA default is already True for newly registered entities.
        self.assertNotIn("_attr_entity_registry_enabled_default", ENTITY_SOURCE)

    def test_unique_id_is_stable_entry_id_based(self):
        self.assertIn('self._attr_unique_id = f"{runtime.entry_id}_{key}"', ENTITY_SOURCE)

    def test_integration_does_not_auto_enable_entities(self):
        # Automatic re-enabling would override user/system choices.
        self.assertNotIn("_ensure_profile_entities_enabled", INIT_SOURCE)
        self.assertNotIn("disabled_by", INIT_SOURCE)
        self.assertIn("async def async_migrate_entry", INIT_SOURCE)
        migration = INIT_SOURCE.split("async def async_migrate_entry")[1].split("def _parse_json_payload")[0]
        self.assertNotIn("data[CONF_PRICE_SENSOR]", migration)
        self.assertIn("registry_entry_id", migration)
        self.assertNotIn("async_update_entity", migration)

    def test_charge_entities_publish_runtime_values(self):
        self.assertIn('"charge_profile_target_soc"', NUMBER_SOURCE)
        for attr in (
            "charge_profile_charge_current",
            "charge_profile_discharge_current",
            "charge_profile_grid_charge_current",
        ):
            self.assertNotIn(f'"{attr}"', NUMBER_SOURCE)
        self.assertIn("value = getattr(self.runtime, self.attr)", NUMBER_SOURCE)
        self.assertIn("return value", NUMBER_SOURCE)

    def test_sell_power_numbers_use_effective_inverter_limit(self):
        self.assertIn("self.runtime.effective_inverter_max_power_w", NUMBER_SOURCE)
        self.assertIn("self.attr.endswith(\"sell_power\")", NUMBER_SOURCE)
        self.assertIn("if not self.native_min_value <= value <= self.native_max_value:", NUMBER_SOURCE)

    def test_sell_power_numbers_reject_values_above_effective_limit(self):
        self.assertIn("raise ValueError(", NUMBER_SOURCE)
        self.assertIn("outside allowed range", NUMBER_SOURCE)
        self.assertIn("native_max_value", NUMBER_SOURCE.split("async def async_set_native_value")[1])

    def test_sell_power_number_constructors_use_default_constant(self):
        self.assertIn("DEFAULT_INVERTER_MAX_POWER_W", NUMBER_SOURCE)
        self.assertIn('"default_sell_power", "Default sell power", "default_sell_power", 0, DEFAULT_INVERTER_MAX_POWER_W, 100, "W"', NUMBER_SOURCE)
        self.assertIn('"normal_profile_sell_power", "Normal profile sell power", "normal_profile_sell_power", 0, DEFAULT_INVERTER_MAX_POWER_W, 100, "W"', NUMBER_SOURCE)

    def test_normal_profile_entities_publish_runtime_values(self):
        for attr in (
            "normal_profile_sell_power",
            "normal_profile_tou_soc",
        ):
            self.assertIn(f'"{attr}"', NUMBER_SOURCE)
        for attr in (
            "normal_profile_discharge_current",
            "normal_profile_charge_current",
            "normal_profile_grid_charge_current",
        ):
            self.assertNotIn(f'"{attr}"', NUMBER_SOURCE)
        self.assertIn("value = getattr(self.runtime, self.attr)", NUMBER_SOURCE)
        self.assertIn("return value", NUMBER_SOURCE)

    def test_normal_profile_mode_select_publishes_runtime_mode(self):
        self.assertIn("def current_option(self):", SELECT_SOURCE)
        body = SELECT_SOURCE.split("class DeyeNormalProfileModeSelect")[1].split("class DeyeSlotModeSelect")[0]
        self.assertIn("current_option", body)
        self.assertIn("normal_profile_mode_metadata", body)
        self.assertIn('row["available"]', body)
        self.assertNotIn("return self.runtime.normal_profile_physical_work_mode", body)

    def test_grid_enabled_switch_publishes_runtime_flag(self):
        self.assertIn('return bool(getattr(self.runtime, self.attr))', SWITCH_SOURCE)

    def test_normal_profile_number_edit_calls_save_normal_profile(self):
        self.assertIn("await self.runtime.async_save_normal_profile(values)", NUMBER_SOURCE)

    def test_normal_profile_select_options_use_english_labels(self):
        body = SELECT_SOURCE.split("class DeyeNormalProfileModeSelect")[1].split("class DeyeSlotModeSelect")[0]
        self.assertIn("normal_profile_mode_options", body)
        self.assertNotIn("return list(PHYSICAL_NORMAL_MODES)", body)
        self.assertIn("Export disabled — Load measurement", PROVIDER_SOURCE)
        self.assertIn("Export disabled — CT measurement", PROVIDER_SOURCE)
        self.assertIn("Essential loads supply", PROVIDER_SOURCE)
        self.assertIn("Export disabled", PROVIDER_SOURCE)
        self.assertIn("self.attr.startswith(\"normal_profile_\")", NUMBER_SOURCE)

    def test_normal_profile_partial_update_keeps_other_fields(self):
        # The number helper builds a full profile dict from current runtime values
        # and only replaces the edited field.
        self.assertIn("field_map[self.attr]: value", NUMBER_SOURCE)
        for key in ("sell_power", "tou_soc"):
            self.assertIn(f'"{key}": self.runtime.normal_profile_{key}', NUMBER_SOURCE)
        for key in ("discharge_current", "charge_current", "grid_charge_current"):
            self.assertNotIn(f'"{key}": self.runtime.normal_profile_{key}', NUMBER_SOURCE)

    def test_charge_profile_number_edit_calls_save_charge_profile(self):
        self.assertIn("await self.runtime.async_save_charge_profile({", NUMBER_SOURCE)

    def test_services_use_dedicated_profile_savers(self):
        self.assertIn("await _active_runtime().async_save_charge_profile(dict(call.data))", INIT_SOURCE)
        self.assertIn("await _active_runtime().async_save_normal_profile(dict(call.data))", INIT_SOURCE)

    def test_card_js_copy_matches_www_root(self):
        """The Lovelace card must be byte-identical in both delivery locations."""
        for f in ["deye-energy-card.js","deye-energy-main-card.js","deye-energy-inverter-config-card.js","deye-energy-trigger-logs-card.js","deye-energy-graphs-card.js","deye-energy-power-flow-card.js"]:
            component_copy = ROOT / "custom_components" / "deye_energy" / "www" / f
            root_copy = ROOT / "www" / f
            self.assertEqual(component_copy.read_bytes(), root_copy.read_bytes(), f)
        self.assertIn("inverter_max_power_w", _read_all_card_sources())


if __name__ == "__main__":
    unittest.main()
