"""Regression coverage for the Energy status sensor display editor."""

from __future__ import annotations

from pathlib import Path
import unittest

import yaml

from test_manager_logic import const, make_runtime, manager

ROOT = Path(__file__).resolve().parents[1]
INIT_SOURCE = (ROOT / "custom_components/deye_energy/__init__.py").read_text(encoding="utf-8")
MANAGER_SOURCE = (ROOT / "custom_components/deye_energy/manager.py").read_text(encoding="utf-8")
SERVICES = yaml.safe_load(
    (ROOT / "custom_components/deye_energy/services.yaml").read_text(encoding="utf-8")
)


class MemoryStore:
    def __init__(self, value=None):
        self.value = value

    async def async_save(self, value):
        self.value = value

    async def async_load(self):
        return self.value


class EnergyStatusDisplayTests(unittest.IsolatedAsyncioTestCase):
    def test_defaults_and_role_catalog(self):
        runtime = make_runtime()
        state = runtime.energy_status_display_state()
        self.assertEqual(state["schema_version"], 1)
        self.assertTrue(state["pv_enabled"])
        self.assertEqual(state["mappings"], {})
        self.assertEqual(state["visibility"], {})
        keys = [role["key"] for role in state["roles"]]
        self.assertIn("pv_power", keys)
        self.assertIn("grid_power", keys)
        self.assertIn("battery_soc", keys)
        self.assertIn("sold_value_today", keys)
        self.assertEqual(len(keys), len(set(keys)))
        for role in state["roles"]:
            self.assertEqual(set(role), {"key", "label", "group"})
        self.assertEqual(set(keys), set(const.ENERGY_STATUS_ROLE_KEYS))

    def test_normalize_filters_unknown_roles_and_empty_values(self):
        normalized = manager.DeyeEnergyRuntime._normalize_energy_status_display(
            {
                "mappings": {
                    "pv_power": "  sensor.custom_pv  ",
                    "unknown_role": "sensor.unknown",
                    "grid_power": "   ",
                },
                "visibility": {
                    "grid_power": True,
                    "battery_soc": False,
                    "unknown_role": True,
                },
            }
        )
        self.assertEqual(normalized["schema_version"], 1)
        self.assertTrue(normalized["pv_enabled"])
        self.assertEqual(normalized["mappings"], {"pv_power": "sensor.custom_pv"})
        self.assertEqual(
            normalized["visibility"], {"grid_power": True, "battery_soc": False}
        )

    def test_normalize_handles_non_dict_input_and_pv_flag(self):
        empty = {"schema_version": 1, "pv_enabled": True, "mappings": {}, "visibility": {}}
        self.assertEqual(
            manager.DeyeEnergyRuntime._normalize_energy_status_display(None), empty
        )
        self.assertEqual(
            manager.DeyeEnergyRuntime._normalize_energy_status_display([]), empty
        )
        normalized = manager.DeyeEnergyRuntime._normalize_energy_status_display(
            {"mappings": [], "visibility": "no", "pv_enabled": False}
        )
        self.assertFalse(normalized["pv_enabled"])
        self.assertEqual(normalized["mappings"], {})
        self.assertEqual(normalized["visibility"], {})

    def test_validate_accepts_valid_payload(self):
        result = manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
            {
                "mappings": {"pv_power": "sensor.custom_pv"},
                "visibility": {"grid_power": False},
                "pv_enabled": False,
            }
        )
        self.assertFalse(result["pv_enabled"])
        self.assertEqual(result["mappings"], {"pv_power": "sensor.custom_pv"})
        self.assertEqual(result["visibility"], {"grid_power": False})

    def test_validate_defaults_pv_enabled_true(self):
        result = manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
            {"mappings": {}, "visibility": {}}
        )
        self.assertTrue(result["pv_enabled"])

    def test_validate_rejects_unknown_fields(self):
        with self.assertRaisesRegex(ValueError, "Unsupported energy status fields"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"bogus": 1}
            )

    def test_validate_rejects_unknown_roles(self):
        with self.assertRaisesRegex(ValueError, "Unknown energy status sensor role"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"mappings": {"nope": "sensor.x"}}
            )
        with self.assertRaisesRegex(ValueError, "Unknown energy status sensor role"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"visibility": {"nope": True}}
            )

    def test_validate_rejects_bad_shapes_and_entity_ids(self):
        with self.assertRaisesRegex(ValueError, "mappings must be an object"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"mappings": []}
            )
        with self.assertRaisesRegex(ValueError, "visibility must be an object"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"visibility": "no"}
            )
        with self.assertRaisesRegex(ValueError, "Invalid entity id"):
            manager.DeyeEnergyRuntime._validate_energy_status_display_payload(
                {"mappings": {"pv_power": "not-an-entity"}}
            )

    async def test_save_persists_and_appears_in_snapshot(self):
        runtime = make_runtime()
        store = MemoryStore()
        runtime._ai_store = store
        result = await runtime.async_save_energy_status_display(
            {
                "mappings": {"pv_power": "sensor.custom_pv"},
                "visibility": {"grid_power": False},
                "pv_enabled": False,
            }
        )
        self.assertEqual(result["mappings"], {"pv_power": "sensor.custom_pv"})
        self.assertEqual(result["visibility"], {"grid_power": False})
        self.assertFalse(result["pv_enabled"])
        self.assertEqual(
            store.value["energy_status_display"]["mappings"],
            {"pv_power": "sensor.custom_pv"},
        )
        self.assertFalse(store.value["energy_status_display"]["pv_enabled"])
        snapshot = runtime.build_ai_state_snapshot()
        self.assertEqual(
            snapshot["energy_status_display"]["mappings"],
            {"pv_power": "sensor.custom_pv"},
        )
        self.assertEqual(
            snapshot["energy_status_display"]["visibility"], {"grid_power": False}
        )
        self.assertFalse(snapshot["energy_status_display"]["pv_enabled"])

    async def test_fingerprint_changes_when_display_changes(self):
        runtime = make_runtime()
        before = runtime._ai_store_fingerprint_payload()
        await runtime.async_save_energy_status_display(
            {"mappings": {}, "visibility": {"pv_power": False}, "pv_enabled": False}
        )
        after = runtime._ai_store_fingerprint_payload()
        self.assertNotEqual(before["energy_status_display"], after["energy_status_display"])

    async def test_load_from_store(self):
        runtime = make_runtime()
        store = MemoryStore(
            {
                "energy_status_display": {
                    "pv_enabled": False,
                    "mappings": {"battery_soc": "sensor.custom_soc"},
                    "visibility": {"pv_power": False, "unknown_role": True},
                }
            }
        )
        previous_store = manager.Store
        manager.Store = lambda *_args, **_kwargs: store
        try:
            await runtime.async_load_ai_data()
        finally:
            manager.Store = previous_store
        self.assertFalse(runtime.energy_status_display["pv_enabled"])
        self.assertEqual(
            runtime.energy_status_display["mappings"],
            {"battery_soc": "sensor.custom_soc"},
        )
        self.assertEqual(
            runtime.energy_status_display["visibility"], {"pv_power": False}
        )

    async def test_pv_generation_enabled_property(self):
        runtime = make_runtime()
        self.assertTrue(runtime.pv_generation_enabled)
        runtime.energy_status_display = {
            "schema_version": 1,
            "pv_enabled": False,
            "mappings": {},
            "visibility": {},
        }
        self.assertFalse(runtime.pv_generation_enabled)


class EnergyStatusServiceWiringTests(unittest.TestCase):
    def test_service_is_declared_registered_and_documented(self):
        self.assertIn('    "save_energy_status_display",', INIT_SOURCE)
        self.assertIn('        "save_energy_status_display",\n        handle_save_energy_status_display,', INIT_SOURCE)
        self.assertIn("ENERGY_STATUS_DISPLAY_DATA_SCHEMA", INIT_SOURCE)
        self.assertIn("handle_save_energy_status_display", INIT_SOURCE)
        self.assertIn("save_energy_status_display", SERVICES)
        field = SERVICES["save_energy_status_display"]["fields"]["data"]
        self.assertTrue(field["required"])
        self.assertIn("selector", field)
        self.assertIn("pv_enabled", SERVICES["save_energy_status_display"].get("description", ""))

    def test_store_payload_and_fingerprint_include_display(self):
        self.assertEqual(MANAGER_SOURCE.count('"energy_status_display": self._normalize_energy_status_display('), 2)


if __name__ == "__main__":
    unittest.main()
