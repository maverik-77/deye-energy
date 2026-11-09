from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import random
import sys

import pytest

MODULE_PATH = Path(__file__).parents[1] / "custom_components" / "deye_energy" / "price_sources.py"
SPEC = importlib.util.spec_from_file_location("stage5g4k3_price_sources", MODULE_PATH)
assert SPEC and SPEC.loader
price_sources = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = price_sources
SPEC.loader.exec_module(price_sources)
PriceInterval = price_sources.PriceInterval
aggregate_hourly = price_sources.aggregate_hourly
build_canonical_direction = price_sources.build_canonical_direction
default_price_contract = price_sources.default_price_contract
detect_source_adapter = price_sources.detect_source_adapter
migrate_legacy_price_contracts = price_sources.migrate_legacy_price_contracts
normalize_price_contract = price_sources.normalize_price_contract


@dataclass
class State:
    entity_id: str
    state: str = "unknown"
    attributes: dict | None = None

    def __post_init__(self) -> None:
        self.attributes = self.attributes or {}


NOW = datetime(2026, 8, 23, 12, 0, tzinfo=timezone(timedelta(hours=2)))


def octopus_rows(day: str, base: float = 0.4) -> list[dict]:
    rows = []
    for quarter in range(96):
        start_minute = quarter * 15
        end_minute = start_minute + 15
        sh, sm = divmod(start_minute, 60)
        eh, em = divmod(end_minute, 60)
        period_end = "24:00" if eh == 24 else f"{eh:02d}:{em:02d}"
        dtime_day = datetime.fromisoformat(day) + timedelta(minutes=end_minute)
        rows.append({
            "dtime": dtime_day.strftime("%Y-%m-%d %H:%M:%S"),
            "period": f"{sh:02d}:{sm:02d} - {period_end}",
            "value_inc_vat": base + quarter / 1000,
            "business_date": day,
        })
    return rows


def octopus_contract(direction: str = "buy", **overrides) -> dict:
    value = {
        "source_adapter": "octopus_energy",
        "price_basis": "gross",
        "unit": "GBP/kWh",
        "list_attribute": "value_json",
        **overrides,
    }
    return normalize_price_contract(value, direction, "octopus_energy", "sensor.octopus_today", "sensor.octopus_tomorrow")


def test_adapter_detection_prefers_metadata_and_explicit_override() -> None:
    assert detect_source_adapter("sensor.renamed", platform="octopus_energy") == "octopus_energy"
    assert detect_source_adapter("sensor.renamed", config_entry_domain="octopus_energy") == "octopus_energy"
    assert detect_source_adapter("sensor.renamed", device_metadata="Octopus Energy energy service") == "octopus_energy"
    assert detect_source_adapter("sensor.octopus_energy_name", explicit="custom") == "custom"
    assert detect_source_adapter("sensor.unknown") == "generic"


def test_octopus_energy_contract_is_forced_all_in_gross_and_never_adds_dso() -> None:
    contract = normalize_price_contract(
        {"source_adapter": "octopus_energy", "price_basis": "net", "includes_distribution_variable": False},
        "buy", "octopus_energy", "sensor.octopus_energy_buy", "sensor.octopus_energy_buy_tomorrow",
    )
    assert contract["semantic_scope"] == "all_in_variable"
    assert contract["price_basis"] == "gross"
    assert contract["unit"] == "GBP/kWh"
    assert contract["includes_distribution_variable"] is True
    state = State("sensor.octopus_energy_buy", attributes={"prices": [
        {"datetime": f"2026-08-23T{hour:02d}:00:00+02:00", "price_gross": 0.23}
        for hour in range(24)
    ]})
    result = build_canonical_direction(contract, state, None, NOW, {(NOW.date(), hour): 0.55 for hour in range(24)})
    assert len(result["rows"]) == 24
    assert all(row["added_distribution"] == 0 for row in result["rows"])
    assert all(row["final_price_gbp_kwh"] == pytest.approx(0.23) for row in result["rows"])






def test_partial_and_overlap_hours_fail_closed() -> None:
    base = NOW.replace(hour=0)
    complete, diag = aggregate_hourly([
        PriceInterval(base, base + timedelta(minutes=45), 1.0, "x", 0),
    ])
    assert complete == {}
    assert diag["partial_hours"]
    complete, diag = aggregate_hourly([
        PriceInterval(base, base + timedelta(minutes=40), 1.0, "x", 0),
        PriceInterval(base + timedelta(minutes=30), base + timedelta(hours=1), 2.0, "x", 1),
    ])
    assert complete == {}
    assert diag["invalid_hours"]


def test_units_net_vat_negative_prices_and_unknown_contracts() -> None:
    contract = normalize_price_contract({
        "source_adapter": "custom", "economic_role": "energy_only", "semantic_scope": "energy_only",
        "includes_distribution_variable": False, "price_basis": "net", "vat_rate": 0.23,
        "unit": "GBP/MWh", "list_attribute": "rows", "value_field": "amount",
        "timestamp_field": "start", "granularity": "60m",
    }, "buy", "custom", "sensor.custom", "")
    state = State("sensor.custom", attributes={"rows": [
        {"start": f"2026-08-23T{hour:02d}:00:00+02:00", "amount": -100 if hour == 0 else 100}
        for hour in range(24)
    ]})
    result = build_canonical_direction(contract, state, None, NOW, {(NOW.date(), hour): 0.2 for hour in range(24)})
    assert result["rows"][0]["source_price_gbp_kwh"] == pytest.approx(-0.1)
    assert result["rows"][0]["added_vat"] == pytest.approx(-0.023)
    assert result["rows"][0]["final_price_gbp_kwh"] == pytest.approx(0.077)
    unknown = default_price_contract("buy", "custom", "sensor.x", "")
    assert build_canonical_direction(unknown, state, None, NOW)["diagnostics"]["status"] == "unknown_price_basis"




def test_legacy_migration_preserves_entities_and_separates_directions() -> None:
    legacy = {
        "price_source": "octopus_energy", "price_includes_distribution": False,
        "price_sensor": "sensor.renamed_sell", "buy_price_today_sensor": "sensor.renamed_buy",
    }
    migrated = migrate_legacy_price_contracts(legacy)
    assert migrated["price_sensor"] == "sensor.renamed_sell"
    assert migrated["buy_price_contract"]["today_entity"] == "sensor.renamed_buy"
    assert migrated["sell_price_contract"]["today_entity"] == "sensor.renamed_sell"
    assert migrated["buy_price_contract"] is not migrated["sell_price_contract"]


LONDON_NOON = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)


def test_octopus_rates_event_half_hours_average_into_hours() -> None:
    midnight = datetime(2026, 11, 9, tzinfo=timezone.utc)
    rows = []
    for slot in range(48):
        start = midnight + timedelta(minutes=30 * slot)
        rows.append({
            "start": start.isoformat(),
            "end": (start + timedelta(minutes=30)).isoformat(),
            "value_inc_vat": 0.066 if slot < 11 else 0.3281,
        })
    contract = normalize_price_contract(
        {"source_adapter": "octopus_energy"}, "buy", "octopus_energy", "event.import_today_rates", ""
    )
    result = build_canonical_direction(
        contract, State("event.import_today_rates", "unknown", {"rates": rows}), None, LONDON_NOON, {}
    )
    hours = {row["hour"]: row for row in result["rows"] if row["day"] == "today"}
    assert len(hours) == 24
    assert hours[2]["final_price_gbp_kwh"] == pytest.approx(0.066)
    assert hours[5]["final_price_gbp_kwh"] == pytest.approx((0.066 + 0.3281) / 2)
    assert hours[12]["final_price_gbp_kwh"] == pytest.approx(0.3281)
    assert result["contract"]["economic_role"] == "retail_buy_all_in"
    assert all(row["added_distribution"] == 0 for row in result["rows"])


def test_octopus_export_rate_sensor_window_covers_today_and_tomorrow() -> None:
    attributes = {
        "start": datetime(2026, 11, 8, tzinfo=timezone.utc).isoformat(),
        "end": datetime(2026, 11, 11, tzinfo=timezone.utc).isoformat(),
        "unit_of_measurement": "GBP/kWh",
    }
    contract = normalize_price_contract(
        {"source_adapter": "octopus_energy"}, "sell", "octopus_energy", "sensor.export_current_rate", ""
    )
    result = build_canonical_direction(
        contract, State("sensor.export_current_rate", "0.12", attributes), None, LONDON_NOON, {}
    )
    assert len(result["rows"]) == 48
    assert all(row["final_price_gbp_kwh"] == pytest.approx(0.12) for row in result["rows"])
    assert result["contract"]["economic_role"] == "prosumer_sell"
    assert result["contract"]["resolved_schema_today"]["schema_id"] == "octopus_rate_window_v1"


def test_octopus_adapter_is_detected_from_the_integration_domain() -> None:
    assert detect_source_adapter("sensor.any_name", config_entry_domain="octopus_energy") == "octopus_energy"
    assert detect_source_adapter("sensor.octopus_energy_lookalike") == "generic"
