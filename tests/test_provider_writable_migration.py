"""Version 25 migration: read-only Deye MQTT mappings become writable Sunsynk."""

from __future__ import annotations

import ast
import asyncio
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def _load_entity_map():
    """Load the shared entity-map module without importing Home Assistant."""
    path = ROOT / "custom_components" / "deye_energy" / "entity_map.py"
    spec = importlib.util.spec_from_file_location("deye_test_entity_map", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


entity_map = _load_entity_map()
INIT_SOURCE = (ROOT / "custom_components" / "deye_energy" / "__init__.py").read_text(
    encoding="utf-8"
)
CONFIG_FLOW_SOURCE = (
    ROOT / "custom_components" / "deye_energy" / "config_flow.py"
).read_text(encoding="utf-8")

CONF_KEYS = {
    "CONF_INVERTER_PROVIDER": "inverter_provider",
    "CONF_WORK_MODE_SELECT": "work_mode_select",
    "CONF_WORK_MODE_AUX_ENTITY": "work_mode_aux_entity",
    "CONF_MAX_SELL_POWER_NUMBER": "max_sell_power_number",
    "CONF_DISCHARGE_CURRENT_NUMBER": "discharge_current_number",
    "CONF_CHARGE_CURRENT_NUMBER": "charge_current_number",
    "CONF_GRID_CHARGE_CURRENT_NUMBER": "grid_charge_current_number",
}


def _tou_key(index: int, kind: str) -> str:
    return f"tou_{index}_{kind}_entity"


def _load_migration_helpers():
    """Execute the real migration helpers without importing Home Assistant."""
    tree = ast.parse(INIT_SOURCE)
    wanted_names = {
        "_SUNSYNK_ENTITY_FALLBACKS",
        "_entity_exists",
        "_set_migrated_value",
        "_fill_missing_sunsynk_fallbacks",
        "_migrate_24_to_25",
    }
    chunks: list[str] = []
    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and any(
            isinstance(target, ast.Name) and target.id in wanted_names
            for target in (
                node.targets if isinstance(node, ast.Assign) else [node.target]
            )
        ):
            chunks.append(ast.get_source_segment(INIT_SOURCE, node))
        elif isinstance(node, ast.For) and "_SUNSYNK_ENTITY_FALLBACKS" in (
            ast.get_source_segment(INIT_SOURCE, node) or ""
        ):
            # The fallback table is completed by three indexed loops.
            chunks.append(ast.get_source_segment(INIT_SOURCE, node))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in wanted_names:
            chunks.append(ast.get_source_segment(INIT_SOURCE, node))
    namespace = {
        "HomeAssistant": object,
        "ConfigEntry": object,
        "PROVIDER_DEYE_ADDON": "deye_addon",
        "PROVIDER_SUNSYNK": "sunsynk",
        "DEFAULT_INVERTER_PROVIDER": "sunsynk",
        "conf_tou_entity": _tou_key,
        "entity_map": entity_map,
        **CONF_KEYS,
    }
    exec("\n\n".join(chunks), namespace)  # noqa: S102 - local source under test
    return namespace


class FakeStates:
    def __init__(self, present):
        self._present = set(present)

    def get(self, entity_id):
        return object() if entity_id in self._present else None


class FakeConfigEntries:
    def __init__(self):
        self.updates = []

    def async_update_entry(self, entry, **changes):
        self.updates.append(changes)
        for key, value in changes.items():
            setattr(entry, key, value)


class FakeEntry:
    def __init__(self, data=None, options=None, minor_version=24):
        self.data = data or {}
        self.options = options or {}
        self.minor_version = minor_version


class ProviderWritableMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helpers = _load_migration_helpers()

    def _hass(self, present):
        hass = type("Hass", (), {})()
        hass.states = FakeStates(present)
        hass.config_entries = FakeConfigEntries()
        return hass

    def test_fallbacks_cover_all_sunsynk_controls(self):
        fallbacks = self.helpers["_SUNSYNK_ENTITY_FALLBACKS"]
        expected = entity_map.fallback_map("sunsynk")
        self.assertEqual(fallbacks, expected)
        self.assertEqual(fallbacks["work_mode_select"], entity_map.entity_default("work_mode_select"))
        self.assertEqual(
            fallbacks["work_mode_aux_entity"],
            entity_map.bundled_document()["profiles"]["sunsynk"]["fallbacks"]["work_mode_aux_entity"],
        )
        self.assertEqual(
            fallbacks["grid_charge_current_number"],
            entity_map.entity_default("grid_charge_current_number"),
        )

    def test_deye_addon_entry_switches_to_sunsynk_and_maps_tou(self):
        fallbacks = self.helpers["_SUNSYNK_ENTITY_FALLBACKS"]
        hass = self._hass(fallbacks.values())
        entry = FakeEntry(
            data={"inverter_provider": "deye_addon"},
            options={"work_mode_select": entity_map.entity_default("work_mode_select")},
        )
        self.assertTrue(asyncio.run(self.helpers["_migrate_24_to_25"](hass, entry)))
        merged = {**entry.data, **entry.options}
        self.assertEqual(merged["inverter_provider"], "sunsynk")
        for key, entity_id in fallbacks.items():
            self.assertEqual(merged[key], entity_id)
        self.assertEqual(hass.config_entries.updates[-1]["minor_version"], 25)

    def test_existing_mapping_wins_and_missing_entities_are_skipped(self):
        hass = self._hass([])
        entry = FakeEntry(
            options={
                "inverter_provider": "deye_addon",
                _tou_key(1, "start"): "select.my_custom_time",
            }
        )
        self.assertTrue(asyncio.run(self.helpers["_migrate_24_to_25"](hass, entry)))
        merged = {**entry.data, **entry.options}
        self.assertEqual(merged["inverter_provider"], "sunsynk")
        self.assertEqual(merged[_tou_key(1, "start")], "select.my_custom_time")
        self.assertNotIn(_tou_key(2, "start"), merged)

    def test_other_providers_only_get_version_bump(self):
        hass = self._hass([])
        entry = FakeEntry(options={"inverter_provider": "solarman"})
        self.assertTrue(asyncio.run(self.helpers["_migrate_24_to_25"](hass, entry)))
        self.assertEqual(entry.options, {"inverter_provider": "solarman"})
        self.assertEqual(hass.config_entries.updates[-1], {"minor_version": 25})

    def test_fill_missing_sunsynk_fallbacks_maps_tou_fields(self):
        fallbacks = entity_map.fallback_map("sunsynk")
        kinds = ("mode", "charge", "sell", "power", "voltage")
        present = [
            fallbacks[_tou_key(index, kind)]
            for index in range(1, 7)
            for kind in kinds
        ]
        hass = self._hass(present)
        entry = FakeEntry(options={"inverter_provider": "sunsynk"})
        data, options, changed = self.helpers["_fill_missing_sunsynk_fallbacks"](hass, entry)
        self.assertTrue(changed)
        merged = {**data, **options}
        for index in range(1, 7):
            for kind in kinds:
                key = _tou_key(index, kind)
                self.assertEqual(merged[key], fallbacks[key])

    def test_fill_missing_sunsynk_fallbacks_preserves_existing_mappings(self):
        fallbacks = entity_map.fallback_map("sunsynk")
        present = [fallbacks[_tou_key(index, "mode")] for index in range(1, 7)]
        hass = self._hass(present)
        entry = FakeEntry(
            options={
                "inverter_provider": "sunsynk",
                _tou_key(1, "mode"): "select.my_custom_mode",
            }
        )
        data, options, changed = self.helpers["_fill_missing_sunsynk_fallbacks"](hass, entry)
        self.assertTrue(changed)
        merged = {**data, **options}
        self.assertEqual(merged[_tou_key(1, "mode")], "select.my_custom_mode")
        self.assertEqual(merged[_tou_key(2, "mode")], fallbacks[_tou_key(2, "mode")])

    def test_fill_missing_sunsynk_fallbacks_skips_missing_entities_and_other_providers(self):
        hass = self._hass([])
        entry = FakeEntry(options={"inverter_provider": "sunsynk"})
        data, options, changed = self.helpers["_fill_missing_sunsynk_fallbacks"](hass, entry)
        self.assertFalse(changed)
        self.assertEqual(data, {})
        self.assertEqual(options, {"inverter_provider": "sunsynk"})

        hass = self._hass(["select.deye_prog1_mode"])
        entry = FakeEntry(options={"inverter_provider": "solarman"})
        data, options, changed = self.helpers["_fill_missing_sunsynk_fallbacks"](hass, entry)
        self.assertFalse(changed)
        self.assertEqual(options, {"inverter_provider": "solarman"})

    def test_dispatch_and_schema_version_are_present(self):
        self.assertIn("if entry.minor_version == 24:", INIT_SOURCE)
        self.assertIn("return await _migrate_24_to_25(hass, entry)", INIT_SOURCE)
        self.assertIn("MINOR_VERSION = 25", CONFIG_FLOW_SOURCE)


if __name__ == "__main__":
    unittest.main()
