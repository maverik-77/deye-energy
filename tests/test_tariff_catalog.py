from __future__ import annotations

from datetime import date, datetime
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "custom_components" / "deye_energy" / "tariffs.py"
SPEC = importlib.util.spec_from_file_location("dem_tariffs_catalog_tests", MODULE_PATH)
tariffs = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(tariffs)


class TariffCatalogTests(unittest.TestCase):
    def setUp(self):
        self.catalog = tariffs.load_bundled_catalog()

    def test_octopus_provider_and_plans_are_present(self):
        self.assertIn("octopus", self.catalog["providers"])
        plans = self.catalog["providers"]["octopus"]["tariffs"]
        self.assertEqual({"intelligent_go", "agile", "flexible"}, set(plans))

    def test_intelligent_go_off_peak_window_is_overnight(self):
        night = tariffs.catalog_tariff_row(datetime(2026, 11, 10, 2), self.catalog, "octopus", "intelligent_go")
        late = tariffs.catalog_tariff_row(datetime(2026, 11, 10, 23), self.catalog, "octopus", "intelligent_go")
        day = tariffs.catalog_tariff_row(datetime(2026, 11, 10, 12), self.catalog, "octopus", "intelligent_go")
        self.assertEqual("offpeak", night["zone"])
        self.assertEqual("offpeak", late["zone"])
        self.assertEqual("peak", day["zone"])

    def test_seller_rates_match_the_account_tariff(self):
        entry = self.catalog["seller_tariffs"]["octopus"]["tariffs"]["intelligent_go_2026"]
        self.assertEqual({"peak": 0.3281, "offpeak": 0.066}, entry["rates"])
        self.assertEqual("GBP/kWh", entry["unit"])

    def test_profile_contains_today_and_tomorrow(self):
        profile = tariffs.catalog_hourly_profile(datetime(2026, 11, 10, 8), self.catalog, "octopus", "intelligent_go", 48)
        self.assertEqual(48, len(profile))
        self.assertEqual("2026-11-10", profile[0]["date"])
        self.assertEqual("2026-11-11", profile[-1]["date"])
        self.assertTrue(all(row["total_distribution_rate"] >= row["rate"] for row in profile))

    def test_invalid_remote_catalog_is_rejected(self):
        with self.assertRaises(ValueError):
            tariffs.validate_catalog({"schema_version": 1, "catalog_version": "x", "providers": {}})

    def test_dynamic_plan_is_listed_but_not_used_without_signal(self):
        plans = {row["id"]: row for row in tariffs.available_tariffs(self.catalog, "octopus")}
        self.assertIn("agile", plans)
        self.assertFalse(plans["agile"]["available"])
        self.assertIn("signal", plans["agile"]["unavailable_reason"])

    def test_future_plan_is_not_activated_early(self):
        available, reason = tariffs.tariff_availability({"effective_from": "2099-01-01"}, date(2026, 11, 9))
        self.assertFalse(available)
        self.assertIn("2099-01-01", reason)

    def test_manual_profile_honors_custom_windows(self):
        profile = tariffs.hourly_tariff_profile(
            datetime(2026, 7, 20, 0), "custom", 0.55, 0.10, "09:00-11:00", "other"
        )
        self.assertEqual("offpeak", profile[9]["zone"])
        self.assertEqual(0.10, profile[9]["rate"])
        self.assertEqual("peak", profile[12]["zone"])


if __name__ == "__main__":
    unittest.main()
