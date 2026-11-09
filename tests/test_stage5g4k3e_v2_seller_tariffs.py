from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import types

import pytest


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "custom_components" / "deye_energy" / "tariffs.py"
SPEC = importlib.util.spec_from_file_location("stage5g4k3e_v2_tariffs", MODULE_PATH)
assert SPEC and SPEC.loader
tariffs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tariffs)

NOW = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)

EXPECTED_GROUPS = {
    "octopus": {"intelligent_go", "agile", "flexible"},
    "other": {"custom"},
}

SUPPORTED = {
    "octopus": {"intelligent_go"},
}


def catalog():
    return tariffs.load_bundled_catalog()


def distribution_profile(cat, provider="octopus", plan="intelligent_go", value=None):
    if value is not None:
        return {
            ((NOW + timedelta(days=offset)).date(), hour): value
            for offset in (0, 1)
            for hour in range(24)
        }
    profile = tariffs.catalog_hourly_profile(NOW, cat, provider, plan, 48)
    return {
        (date.fromisoformat(row["date"]), row["hour"]): row["total_distribution_rate"]
        for row in profile
    }


def test_every_dso_tariff_has_an_explicit_seller_support_classification():
    cat = catalog()
    actual = {
        provider: set(payload["tariffs"])
        for provider, payload in cat["providers"].items()
    }
    matrix = {provider: set(rows) for provider, rows in cat["seller_support_matrix"].items()}
    assert actual == EXPECTED_GROUPS
    assert matrix == actual
    assert sum(len(groups) for provider, groups in actual.items() if provider != "other") == 3


def test_only_the_1_audited_ordinary_contracts_are_supported():
    cat = catalog()
    for provider, groups in EXPECTED_GROUPS.items():
        for group in groups:
            row = tariffs.seller_support_entry(cat, provider, group)
            if group in SUPPORTED.get(provider, set()):
                assert row["status"] == "SUPPORTED_TARIFF_BUY"
                assert row["seller_tariff_id"]
            else:
                assert row["status"] != "SUPPORTED_TARIFF_BUY"
                assert not row.get("seller_tariff_id")
    assert sum(len(seller["tariffs"]) for seller in cat["seller_tariffs"].values()) == 1


def test_intelligent_go_generates_complete_canonical_buy_and_counts_components_once():
    cat = catalog()
    result = tariffs.seller_catalog_canonical_buy(
        NOW, cat, "octopus", "", "octopus", "intelligent_go", distribution_profile(cat)
    )
    assert result["diagnostics"]["status"] == "ready"
    assert result["diagnostics"]["coverage_today"] == 24
    assert result["diagnostics"]["coverage_tomorrow"] == 24
    assert len(result["rows"]) == 48
    for row in result["rows"]:
        assert row["added_vat"] == 0
        assert row["added_other_variable"] == 0
        assert row["source_basis"] == "gross"
        assert row["final_price_gbp_kwh"] == pytest.approx(
            row["source_price_gbp_kwh"] + row["added_distribution"]
        )


def test_explicit_seller_is_required_and_unsupported_special_is_fail_closed():
    cat = catalog()
    no_seller = tariffs.seller_catalog_canonical_buy(
        NOW, cat, "", "", "octopus", "intelligent_go", distribution_profile(cat)
    )
    special = tariffs.seller_catalog_canonical_buy(
        NOW, cat, "octopus", "", "octopus", "flexible", distribution_profile(cat, "octopus", "flexible")
    )
    assert no_seller["rows"] == []
    assert no_seller["diagnostics"]["status"] == "seller_not_selected"
    assert special["rows"] == []
    assert special["diagnostics"]["status"] == "no_valid_standard_tariff"


def test_missing_distribution_slot_is_fail_closed_instead_of_assuming_zero():
    cat = catalog()
    distribution = distribution_profile(cat)
    distribution.pop(next(iter(distribution)))
    result = tariffs.seller_catalog_canonical_buy(
        NOW, cat, "octopus", "", "octopus", "intelligent_go", distribution
    )
    assert result["rows"] == []
    assert result["diagnostics"]["status"] == "distribution_slot_unavailable"


def dated_catalog(old_end: str, new_start: str, new_end: str):
    cat = deepcopy(catalog())
    original = deepcopy(cat["seller_tariffs"]["octopus"]["tariffs"]["intelligent_go_2026"])
    old = deepcopy(original)
    old.update({"valid_from": "2026-09-28", "valid_to": old_end, "rates": {"peak": 0.61, "offpeak": 0.05}})
    new = deepcopy(original)
    new.update({"valid_from": new_start, "valid_to": new_end, "rates": {"peak": 0.71, "offpeak": 0.06}, "revision": "test-new"})
    seller_tariffs = cat["seller_tariffs"]["octopus"]["tariffs"]
    del seller_tariffs["intelligent_go_2026"]
    seller_tariffs.update({"intelligent_go_old": old, "intelligent_go_new": new})
    cat["seller_support_matrix"]["octopus"]["intelligent_go"]["seller_tariff_id"] = "intelligent_go_old"
    cat["valid_to"] = max("2027-09-27", new_end)
    return cat


@pytest.mark.parametrize(
    ("old_end", "new_start", "new_end", "target"),
    [
        ("2026-11-30", "2026-12-01", "2027-09-27", date(2026, 12, 1)),
        ("2026-12-31", "2027-01-01", "2027-09-27", date(2027, 1, 1)),
    ],
)
def test_validity_first_transitions_mid_year_and_new_year(old_end, new_start, new_end, target):
    cat = dated_catalog(old_end, new_start, new_end)
    tariffs.validate_catalog(cat)
    tariff_id, entry, status = tariffs.resolve_seller_tariff(
        cat, "octopus", "intelligent_go_old", "octopus", "intelligent_go", target
    )
    assert tariff_id == "intelligent_go_new"
    assert entry["rates"]["peak"] == 0.71
    assert status == "validity_transition"


def test_expired_price_is_never_used_as_fallback():
    cat = dated_catalog("2026-11-30", "2026-12-01", "2027-09-27")
    del cat["seller_tariffs"]["octopus"]["tariffs"]["intelligent_go_new"]
    tariff_id, entry, status = tariffs.resolve_seller_tariff(
        cat, "octopus", "intelligent_go_old", "octopus", "intelligent_go", date(2026, 12, 1)
    )
    assert tariff_id == ""
    assert entry is None
    assert status == "selected_tariff_expired"


def test_catalog_validator_rejects_overlap_unit_basis_and_missing_matrix():
    overlapping = dated_catalog("2026-12-01", "2026-12-01", "2027-09-27")
    with pytest.raises(ValueError, match="Overlapping"):
        tariffs.validate_catalog(overlapping)
    for field, value, message in (
        ("unit", "GBP/MWh", "unit"),
        ("price_basis", "net", "gross"),
        ("includes_distribution", True, "energy-only"),
    ):
        malformed = deepcopy(catalog())
        malformed["seller_tariffs"]["octopus"]["tariffs"]["intelligent_go_2026"][field] = value
        with pytest.raises(ValueError, match=message):
            tariffs.validate_catalog(malformed)
    incomplete = deepcopy(catalog())
    del incomplete["seller_support_matrix"]["octopus"]["flexible"]
    with pytest.raises(ValueError, match="incomplete"):
        tariffs.validate_catalog(incomplete)


def test_manager_precedence_has_no_dso_to_seller_or_sell_to_buy_guess():
    source = (ROOT / "custom_components" / "deye_energy" / "manager.py").read_text(encoding="utf-8")
    canonical = source.split("def canonical_price_context(", 1)[1].split("def _weather_factors_48h", 1)[0]
    migration = (ROOT / "custom_components" / "deye_energy" / "__init__.py").read_text(encoding="utf-8")
    assert 'direction == "buy"' in canonical
    assert 'not str(contract.get("today_entity") or "")' in canonical
    assert 'not str(contract.get("tomorrow_entity") or "")' in canonical
    assert "self.buy_seller_id" in canonical
    assert "seller_catalog_canonical_buy" in canonical
    assert "CONF_BUY_SELLER_ID" in migration
    assert "DEFAULT_BUY_SELLER_ID" in migration
    assert "suggested_seller_id" not in migration
    assert "minor_version=24" in migration


def test_shared_updater_is_rare_atomic_and_reports_full_status():
    source = (ROOT / "custom_components" / "deye_energy" / "tariff_catalog.py").read_text(encoding="utf-8")
    assert "REFRESH_INTERVAL = timedelta(days=90)" in source
    assert source.index("validate_catalog(candidate)") < source.index("self.catalog = candidate")
    for field in (
        "catalog_local_version", "catalog_remote_version", "catalog_last_checked",
        "catalog_update_result", "catalog_current_validity", "catalog_valid_to",
    ):
        assert field in source
    assert "error_last_known_good" in source


def load_catalog_manager_class():
    package_name = "stage5g4k3e_catalog_package"
    package = types.ModuleType(package_name)
    package.__path__ = [str(ROOT / "custom_components" / "deye_energy")]
    sys.modules[package_name] = package
    sys.modules[f"{package_name}.tariffs"] = tariffs

    const_spec = importlib.util.spec_from_file_location(
        f"{package_name}.const", ROOT / "custom_components" / "deye_energy" / "const.py"
    )
    assert const_spec and const_spec.loader
    const_module = importlib.util.module_from_spec(const_spec)
    sys.modules[const_spec.name] = const_module
    const_spec.loader.exec_module(const_module)

    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = object
    helpers = types.ModuleType("homeassistant.helpers")
    homeassistant = types.ModuleType("homeassistant")
    sys.modules.setdefault("homeassistant", homeassistant)
    sys.modules.setdefault("homeassistant.helpers", helpers)
    sys.modules["homeassistant.helpers.storage"] = storage

    module_spec = importlib.util.spec_from_file_location(
        f"{package_name}.tariff_catalog",
        ROOT / "custom_components" / "deye_energy" / "tariff_catalog.py",
    )
    assert module_spec and module_spec.loader
    module = importlib.util.module_from_spec(module_spec)
    sys.modules[module_spec.name] = module
    module_spec.loader.exec_module(module)
    return module.TariffCatalogManager


def test_updater_activation_is_atomic_and_keeps_last_known_good():
    manager_class = load_catalog_manager_class()
    manager = object.__new__(manager_class)
    active = catalog()
    manager.catalog = active
    manager.source = "bundled"

    invalid = deepcopy(active)
    invalid["catalog_version"] = "2026.11.09.2"
    invalid["seller_tariffs"]["octopus"]["tariffs"]["intelligent_go_2026"]["unit"] = "GBP/MWh"
    with pytest.raises(ValueError):
        manager._activate_if_newer(invalid, "online")
    assert manager.catalog is active
    assert manager.source == "bundled"

    valid = deepcopy(active)
    valid["catalog_version"] = "2026.11.09.2"
    assert manager._activate_if_newer(valid, "online") is True
    assert manager.catalog is valid
    assert manager.source == "online"

    obsolete = {"schema_version": 1, "catalog_version": "2025.1"}
    assert manager._activate_if_newer(obsolete, "online") is False
    assert manager.catalog is valid


def test_updater_due_check_uses_90_day_interval():
    manager_class = load_catalog_manager_class()
    manager = object.__new__(manager_class)
    manager.last_checked = "2026-01-01T00:00:00+00:00"
    assert manager.refresh_due(datetime(2026, 3, 31, tzinfo=timezone.utc)) is False
    assert manager.refresh_due(datetime(2026, 4, 1, tzinfo=timezone.utc)) is True
