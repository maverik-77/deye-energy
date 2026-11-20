from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
NUMBER_SOURCE = (ROOT / "custom_components" / "deye_energy" / "number.py").read_text(encoding="utf-8")
INIT_SOURCE = (ROOT / "custom_components" / "deye_energy" / "__init__.py").read_text(encoding="utf-8")
CONST_SOURCE = (ROOT / "custom_components" / "deye_energy" / "const.py").read_text(encoding="utf-8")


class ChargeProfileEntityContractTests(unittest.TestCase):
    def test_charge_profile_has_no_battery_current_helper_entities(self):
        for helper in (
            "charge_profile_charge_current",
            "charge_profile_discharge_current",
            "charge_profile_grid_charge_current",
            "CURRENT_HELPER_MAX_A",
        ):
            self.assertNotIn(helper, NUMBER_SOURCE)
            self.assertNotIn(helper, CONST_SOURCE)

    def test_profile_helpers_remain_for_target_soc_and_grid_permission(self):
        self.assertIn('"charge_profile_target_soc"', NUMBER_SOURCE)
        self.assertIn('"target_soc"', NUMBER_SOURCE)

        switch_source = (ROOT / "custom_components" / "deye_energy" / "switch.py").read_text(
            encoding="utf-8"
        )
        manager_source = (ROOT / "custom_components" / "deye_energy" / "manager.py").read_text(
            encoding="utf-8"
        )
        self.assertIn('"charge_profile_grid_enabled"', switch_source)
        self.assertIn('"grid_charge_enabled"', switch_source)
        self.assertIn('"grid_charge_enabled"', manager_source)

    def test_backend_service_schema_uses_direct_only_charge_fields(self):
        for required in (
            'vol.Required("target_soc")',
            'vol.Required("grid_charge_enabled")',
            "await runtime.async_save_charge_profile(dict(call.data))",
        ):
            self.assertIn(required, INIT_SOURCE)
        for forbidden in (
            'vol.Required("charge_current")',
            'vol.Required("discharge_current")',
            'vol.Required("grid_charge_current")',
        ):
            self.assertNotIn(forbidden, INIT_SOURCE)


if __name__ == "__main__":
    unittest.main()
