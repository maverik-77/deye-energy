from __future__ import annotations

from pathlib import Path
import importlib.util
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "custom_components" / "deye_energy" / "history.py"
SPEC = importlib.util.spec_from_file_location("deye_history_test", MODULE)
history = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = history
assert SPEC.loader is not None
SPEC.loader.exec_module(history)


class HistoryMigrationTests(unittest.TestCase):
    def test_energy_migration_preserves_every_existing_row(self):
        raw = {
            "samples": [{"timestamp": "2026-07-28T12:00:00+02:00", "load_power": 420}],
            "daily": [{"date": "2026-07-27", "load_kwh": 8.2}],
            "monthly": [{"month": "2026-06", "load_kwh": 240}],
            "last_sample": "2026-07-28T12:00:00+02:00",
            "learning_checkpoint": {"hour": "2026-07-28T11:00:00+02:00"},
        }
        migrated, changed = history.migrate_energy_payload(raw)
        self.assertTrue(changed)
        self.assertEqual(migrated["schema_version"], history.HISTORY_SCHEMA_VERSION)
        self.assertEqual(migrated["samples"], raw["samples"])
        self.assertEqual(migrated["daily"], raw["daily"])
        self.assertEqual(migrated["monthly"], raw["monthly"])
        self.assertEqual(migrated["counter_state"], {})
        self.assertNotIn("learning_checkpoint", migrated)
        self.assertNotIn("schema_version", raw)


    def test_solcast_migration_marks_legacy_forecast_as_initial_and_latest(self):
        raw = {"history": [{"date": "2026-07-27", "forecast_kwh": 22.5}]}
        migrated, _changed = history.migrate_solcast_payload(raw)
        row = migrated["history"][0]
        self.assertEqual(row["initial_forecast_kwh"], 22.5)
        self.assertEqual(row["latest_forecast_kwh"], 22.5)
        self.assertEqual(row["forecast_snapshots"], [])

    def test_issue_8_solcast_migration_keeps_empty_tracking_truly_empty(self):
        raw = {
            "schema_version": history.HISTORY_SCHEMA_VERSION,
            "history": [],
            "tracking": {},
        }

        migrated, changed = history.migrate_solcast_payload(raw)

        self.assertFalse(changed)
        self.assertEqual(migrated["tracking"], {})



class CounterTests(unittest.TestCase):
    def test_daily_midnight_reset_never_creates_negative_energy(self):
        previous = {"value_kwh": 12.0, "day": "2026-07-28"}
        result = history.update_energy_counter(
            previous,
            value_kwh=0.4,
            day="2026-07-29",
            timestamp="2026-07-29T00:05:00+02:00",
            total_increasing=False,
        )
        self.assertTrue(result.reset_detected)
        self.assertEqual(result.delta_kwh, 0.4)

    def test_restart_uses_persisted_counter_value(self):
        previous = {"value_kwh": 4.2, "day": "2026-07-29"}
        result = history.update_energy_counter(
            previous,
            value_kwh=4.7,
            day="2026-07-29",
            timestamp="2026-07-29T12:05:00+02:00",
            total_increasing=False,
        )
        self.assertFalse(result.reset_detected)
        self.assertAlmostEqual(result.delta_kwh, 0.5)

    def test_first_total_increasing_sample_does_not_import_lifetime_energy(self):
        result = history.update_energy_counter(
            None,
            value_kwh=12345.0,
            day="2026-07-29",
            timestamp="2026-07-29T12:05:00+02:00",
            total_increasing=True,
        )
        self.assertTrue(result.first_sample)
        self.assertEqual(result.delta_kwh, 0)

    def test_units_are_normalized_and_invalid_units_rejected(self):
        self.assertEqual(history.power_w("1.25", "kW"), 1250)
        self.assertEqual(history.energy_kwh("2500", "Wh"), 2.5)
        self.assertIsNone(history.power_w("5", "A"))
        self.assertIsNone(history.energy_kwh("5", "W"))


if __name__ == "__main__":
    unittest.main()
