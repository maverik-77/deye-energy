from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "custom_components" / "deye_energy" / "price_sources.py"
SPEC = importlib.util.spec_from_file_location("stage5g4k3b2_price_sources", MODULE_PATH)
assert SPEC and SPEC.loader
price_sources = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = price_sources
SPEC.loader.exec_module(price_sources)

NOW = datetime(2026, 8, 26, 0, 0, tzinfo=timezone(timedelta(hours=2)))


@dataclass
class State:
    entity_id: str
    attributes: dict
    state: str = "unknown"


def octopus_rows(day: datetime, price: float = 0.8) -> list[dict]:
    rows = []
    for index in range(96):
        start = day + timedelta(minutes=index * 15)
        end = day + timedelta(minutes=(index + 1) * 15)
        rows.append({
            "period": f"{start:%H:%M} - {'24:00' if index == 95 else end.strftime('%H:%M')}",
            "dtime": end.strftime("%Y-%m-%d %H:%M:%S"),
            "business_date": day.date().isoformat(),
            "value_inc_vat": price,
        })
    return rows


def test_explicit_empty_ignores_stale_states_and_has_zero_rows_for_both_days() -> None:
    stale = {
        "source_adapter": "octopus_energy",
        "today_entity": "sensor.old_octopus_energy_today",
        "tomorrow_entity": "sensor.old_octopus_energy_tomorrow",
        "semantic_scope": "all_in_variable",
        "includes_distribution_variable": True,
        "includes_excise": True,
        "includes_service_margin": True,
        "resolved_schema_tomorrow": {"schema_id": "octopus_rates_v1"},
    }
    contract = price_sources.rebuild_price_contract(stale, "buy", "", "", "generic", "generic")
    stale_today = State("sensor.old_octopus_energy_today", {"rates": [{
        "start": NOW.isoformat(), "end": (NOW + timedelta(hours=1)).isoformat(), "price": 0.9,
    }]})
    stale_tomorrow = State("sensor.old_octopus_energy_tomorrow", {"rates": [{
        "start": (NOW + timedelta(days=1, hours=23)).isoformat(),
        "end": (NOW + timedelta(days=2)).isoformat(), "price": 1.16,
    }]})

    result = price_sources.build_canonical_direction(contract, stale_today, stale_tomorrow, NOW, {})

    assert result["rows"] == []
    assert result["diagnostics"]["coverage_today"] == 0
    assert result["diagnostics"]["coverage_tomorrow"] == 0
    assert result["diagnostics"]["resolver"]["tomorrow"]["status"] == "unmapped"
    assert result["contract"]["adapter_summary"] == "unmapped"
    for forbidden in (
        "source_adapter", "semantic_scope", "includes_distribution_variable",
        "includes_excise", "includes_service_margin", "list_attribute", "value_field",
    ):
        assert forbidden not in result["contract"]




