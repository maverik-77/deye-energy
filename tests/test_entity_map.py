"""The shared mqtt_entity_map.json catalogue is the single source of truth.

These tests make sure the Python consumers and the config defaults stay
derived from that catalogue instead of accumulating their own entity id
literals again.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "deye_energy"
MAP_PATH = PACKAGE / "mqtt_entity_map.json"


def _load_entity_map():
    spec = importlib.util.spec_from_file_location(
        "deye_test_entity_map_standalone", PACKAGE / "entity_map.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


entity_map = _load_entity_map()
BUNDLED = json.loads(MAP_PATH.read_text(encoding="utf-8"))


def _load_const():
    """Load const.py with a minimal package exposing entity_map."""
    pkg = types.ModuleType("deye_test_entity_map_pkg")
    pkg.__path__ = [str(PACKAGE)]
    pkg.entity_map = entity_map
    sys.modules[pkg.__name__] = pkg
    spec = importlib.util.spec_from_file_location(
        f"{pkg.__name__}.const", PACKAGE / "const.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class EntityMapCatalogueTests(unittest.TestCase):
    def tearDown(self):
        entity_map.reset()

    def test_bundled_schema_and_profiles(self):
        self.assertEqual(BUNDLED["version"], 1)
        self.assertEqual(BUNDLED["default_profile"], "sunsynk")
        for name in ("sunsynk", "solarman", "deye_addon", "lewa_reka", "custom"):
            self.assertIn(name, BUNDLED["profiles"])
        for key, value in BUNDLED["common"]["entities"].items():
            if value:
                self.assertIn(".", value)
                self.assertRegex(value, r"^[a-z_]+\.[a-z0-9_]+$")

    # const.py alias name -> catalogue key.  These are historical short names
    # that must keep resolving to the same catalogue entry.
    CONST_ALIASES = {
        "DEFAULT_WORK_MODE_SELECT": "work_mode_select",
        "DEFAULT_MAX_SELL_POWER": "max_sell_power_number",
        "DEFAULT_DISCHARGE_CURRENT": "discharge_current_number",
        "DEFAULT_CHARGE_CURRENT": "charge_current_number",
        "DEFAULT_GRID_CHARGE_CURRENT": "grid_charge_current_number",
        "DEFAULT_BATTERY_SOC": "battery_soc_sensor",
        "DEFAULT_PRICE_SENSOR": "price_sensor",
        "DEFAULT_SELL_PRICE_TOMORROW_SENSOR": "sell_price_tomorrow_sensor",
        "DEFAULT_BUY_PRICE_TODAY_SENSOR": "buy_price_today_sensor",
        "DEFAULT_BUY_PRICE_TOMORROW_SENSOR": "buy_price_tomorrow_sensor",
        "DEFAULT_GRID_POWER_SENSOR": "grid_power_sensor",
        "DEFAULT_PV_POWER_SENSOR": "pv_power_sensor",
        "DEFAULT_LOAD_POWER_SENSOR": "load_power_sensor",
        "DEFAULT_BATTERY_POWER_SENSOR": "battery_power_sensor",
        "DEFAULT_SOLCAST_CURRENT_POWER_SENSOR": "solcast_current_power_sensor",
        "DEFAULT_SOLCAST_FORECAST_TODAY_SENSOR": "solcast_forecast_today_sensor",
        "DEFAULT_SOLCAST_FORECAST_TOMORROW_SENSOR": "solcast_forecast_tomorrow_sensor",
        "DEFAULT_SOLCAST_FORECAST_DAY_3_SENSOR": "solcast_forecast_day_3_sensor",
        "DEFAULT_SOLCAST_FORECAST_DAY_4_SENSOR": "solcast_forecast_day_4_sensor",
        "DEFAULT_SOLCAST_FORECAST_DAY_5_SENSOR": "solcast_forecast_day_5_sensor",
        "DEFAULT_SOLCAST_FORECAST_DAY_6_SENSOR": "solcast_forecast_day_6_sensor",
        "DEFAULT_SOLCAST_FORECAST_DAY_7_SENSOR": "solcast_forecast_day_7_sensor",
        "DEFAULT_SOLCAST_REMAINING_TODAY_SENSOR": "solcast_remaining_today_sensor",
        "DEFAULT_SOLCAST_PEAK_POWER_TODAY_SENSOR": "solcast_peak_power_today_sensor",
        "DEFAULT_SOLCAST_PEAK_TIME_TODAY_SENSOR": "solcast_peak_time_today_sensor",
        "DEFAULT_DAILY_PV_PRODUCTION_SENSOR": "daily_pv_production_sensor",
        "DEFAULT_WEATHER_ENTITY": "weather_entity",
        "DEFAULT_PV1_POWER_SENSOR": "pv1_power_sensor",
        "DEFAULT_PV1_VOLTAGE_SENSOR": "pv1_voltage_sensor",
        "DEFAULT_PV1_CURRENT_SENSOR": "pv1_current_sensor",
        "DEFAULT_PV2_POWER_SENSOR": "pv2_power_sensor",
        "DEFAULT_PV2_VOLTAGE_SENSOR": "pv2_voltage_sensor",
        "DEFAULT_PV2_CURRENT_SENSOR": "pv2_current_sensor",
        "DEFAULT_PV3_POWER_SENSOR": "pv3_power_sensor",
        "DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR": "battery_bms_voltage_sensor",
        "DEFAULT_BATTERY_CURRENT_SENSOR": "battery_current_sensor",
        "DEFAULT_BATTERY_TEMPERATURE_SENSOR": "battery_temperature_sensor",
        "DEFAULT_BATTERY_SOH_SENSOR": "battery_soh_sensor",
        "DEFAULT_DAILY_BATTERY_CHARGE_SENSOR": "daily_battery_charge_sensor",
        "DEFAULT_DAILY_BATTERY_DISCHARGE_SENSOR": "daily_battery_discharge_sensor",
        "DEFAULT_DAILY_ENERGY_BOUGHT_SENSOR": "daily_energy_bought_sensor",
        "DEFAULT_DAILY_ENERGY_SOLD_SENSOR": "daily_energy_sold_sensor",
        "DEFAULT_GRID_L1_POWER_SENSOR": "grid_l1_power_sensor",
        "DEFAULT_GRID_L2_POWER_SENSOR": "grid_l2_power_sensor",
        "DEFAULT_GRID_L3_POWER_SENSOR": "grid_l3_power_sensor",
        "DEFAULT_GRID_L1_VOLTAGE_SENSOR": "grid_l1_voltage_sensor",
        "DEFAULT_GRID_L2_VOLTAGE_SENSOR": "grid_l2_voltage_sensor",
        "DEFAULT_GRID_L3_VOLTAGE_SENSOR": "grid_l3_voltage_sensor",
        "DEFAULT_LOAD_FREQUENCY_SENSOR": "load_frequency_sensor",
        "DEFAULT_DAILY_LOAD_CONSUMPTION_SENSOR": "daily_load_consumption_sensor",
        "DEFAULT_LOAD_L1_POWER_SENSOR": "load_l1_power_sensor",
        "DEFAULT_LOAD_L2_POWER_SENSOR": "load_l2_power_sensor",
        "DEFAULT_LOAD_L3_POWER_SENSOR": "load_l3_power_sensor",
        "DEFAULT_INVERTER_AC_TEMPERATURE_SENSOR": "inverter_ac_temperature_sensor",
    }

    def test_entity_defaults_match_const_aliases(self):
        const = _load_const()
        for const_name, key in self.CONST_ALIASES.items():
            self.assertEqual(
                getattr(const, const_name),
                entity_map.entity_default(key),
                const_name,
            )
        self.assertEqual(
            const.DEFAULT_INVERTER_DATETIME_ENTITY,
            entity_map.special_entity("inverter_datetime"),
        )

    def test_const_catalog_alignment(self):
        const = _load_const()
        for const_name, key in self.CONST_ALIASES.items():
            self.assertTrue(hasattr(const, const_name), const_name)
            self.assertEqual(
                getattr(const, const_name),
                BUNDLED["common"]["entities"][key],
                const_name,
            )
        self.assertEqual(
            const.DEFAULT_INVERTER_DATETIME_ENTITY,
            BUNDLED["common"]["special"]["inverter_datetime"],
        )
        # work_mode_aux_entity has no DEFAULT_* alias: it is a profile-only
        # mapping (empty common default, Sunsynk fallback).
        self.assertEqual(
            set(BUNDLED["common"]["entities"]) - set(self.CONST_ALIASES.values()),
            {"work_mode_aux_entity"},
        )

    def test_profiles_tou_templates_and_tokens(self):
        self.assertEqual(
            entity_map.tou_fallback_templates("sunsynk")["start"],
            "select.deye_prog{index}_time",
        )
        fallbacks = entity_map.fallback_map("sunsynk")
        self.assertEqual(fallbacks["tou_1_start_entity"], "select.deye_prog1_time")
        self.assertEqual(fallbacks["tou_6_voltage_entity"], "number.deye_prog6_voltage")
        self.assertEqual(entity_map.fallback_map("solarman"), {})
        self.assertEqual(
            entity_map.tou_match_tokens(3, "start", "solarman"),
            ("program 3 time",),
        )
        self.assertEqual(
            entity_map.tou_match_tokens(2, "grid", "sunsynk"),
            ("prog2 charge", "prog 2 charge"),
        )
        self.assertEqual(
            entity_map.match_tokens("grid_power_sensor", "deye_addon"),
            ("grid power", "external ct power"),
        )

    def test_special_and_config_field_entities(self):
        self.assertEqual(
            entity_map.special_entity("grid_charge_enable"),
            "switch.deye_grid_charge_enabled",
        )
        self.assertEqual(
            entity_map.special_entity("battery_restart_capacity"),
            "number.deye_battery_restart_capacity",
        )
        self.assertEqual(
            entity_map.config_field_entity("grid_voltage"),
            "sensor.deye_grid_voltage",
        )
        self.assertIsNone(entity_map.config_field_entity("not_a_field"))

    def test_override_deep_merges_and_defaults_fail_closed(self):
        with tempfile.TemporaryDirectory(
            dir="/data/v2/cache/opencode", prefix="deye_entity_map_"
        ) as tmp:
            path = Path(tmp) / BUNDLED["override_file"]
            path.write_text(
                json.dumps(
                    {
                        "default_profile": "sunsynk",
                        "common": {"entities": {"battery_soc_sensor": "sensor.my_battery_soc"}},
                        "profiles": {
                            "sunsynk": {
                                "fallbacks": {"work_mode_select": "select.my_work_mode"}
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            self.assertTrue(entity_map.configure(tmp))
            self.assertEqual(
                entity_map.entity_default("battery_soc_sensor"), "sensor.my_battery_soc"
            )
            # Untouched entries remain from the bundled catalogue.
            self.assertEqual(
                entity_map.entity_default("grid_power_sensor"), "sensor.deye_grid_power"
            )
            self.assertEqual(
                entity_map.fallback_map("sunsynk")["work_mode_select"], "select.my_work_mode"
            )
            self.assertEqual(
                entity_map.fallback_map("sunsynk")["tou_1_start_entity"],
                "select.deye_prog1_time",
            )

            path.write_text("{not json", encoding="utf-8")
            self.assertFalse(entity_map.configure(tmp))
            self.assertTrue(entity_map.override_errors())
            self.assertEqual(
                entity_map.entity_default("battery_soc_sensor"), "sensor.deye_battery_soc"
            )
            self.assertEqual(
                entity_map.fallback_map("sunsynk")["work_mode_select"],
                "select.deye_load_limit",
            )

    def test_consumers_derive_from_map(self):
        sources = {
            name: (PACKAGE / name).read_text(encoding="utf-8")
            for name in ("const.py", "config_flow.py", "inverter_config.py", "manager.py")
        }
        self.assertIn("entity_map.entity_default", sources["const.py"])
        self.assertIn("entity_map.fallback_map", (PACKAGE / "__init__.py").read_text(encoding="utf-8"))
        self.assertIn("entity_map.spec", sources["config_flow.py"])
        self.assertIn("entity_map.match_tokens", sources["config_flow.py"])
        self.assertIn("entity_map.config_field_entity", sources["inverter_config.py"])
        self.assertIn("entity_map.special_entity", sources["manager.py"])
        # Known point-of-use literals now come from the catalogue.
        self.assertNotIn('"switch.deye_grid_charge_enabled"', sources["manager.py"])
        self.assertNotIn('"number.deye_battery_restart_capacity"', sources["manager.py"])
        for literal in (
            '"select.deye_load_limit"',
            '"sensor.deye_battery_soc"',
            '"sensor.deye_grid_power"',
        ):
            self.assertNotIn(literal, sources["const.py"])


if __name__ == "__main__":
    unittest.main()
