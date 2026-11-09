from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "custom_components" / "deye_energy" / "price_sources.py"
SPEC = importlib.util.spec_from_file_location("stage5g4k3d_price_sources", MODULE_PATH)
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


def octopus_energy_rows(day: datetime, price: float) -> list[dict]:
    return [
        {
            "start": (day + timedelta(hours=hour)).isoformat(),
            "end": (day + timedelta(hours=hour + 1)).isoformat(),
            "price": price,
        }
        for hour in range(24)
    ]


def octopus_rows(day: datetime, price: float) -> list[dict]:
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


def distribution(value: float = 0.25) -> dict:
    return {
        ((NOW + timedelta(days=day)).date(), hour): value
        for day in (0, 1)
        for hour in range(24)
    }


def build_known(direction: str, adapter: str) -> dict:
    contract = price_sources.rebuild_price_contract(
        {}, direction, f"sensor.{adapter}_{direction}_today",
        f"sensor.{adapter}_{direction}_tomorrow", adapter, adapter,
    )
    if adapter == "octopus_energy":
        today = State(contract["today_entity"], {"rates": octopus_energy_rows(NOW, 0.7)})
        tomorrow = State(contract["tomorrow_entity"], {"rates": octopus_energy_rows(NOW + timedelta(days=1), 0.8)})
    else:
        today = State(contract["today_entity"], {"prices": octopus_rows(NOW, 0.7)})
        tomorrow = State(contract["tomorrow_entity"], {"prices": octopus_rows(NOW + timedelta(days=1), 0.8)})
    return price_sources.build_canonical_direction(contract, today, tomorrow, NOW, distribution())


def test_octopus_energy_roles_are_directional_and_buy_never_double_adds_dso() -> None:
    buy = build_known("buy", "octopus_energy")
    sell = build_known("sell", "octopus_energy")

    assert len(buy["rows"]) == 48
    assert {row["source_economic_role"] for row in buy["rows"]} == {"retail_buy_all_in"}
    assert {row["added_distribution"] for row in buy["rows"]} == {0.0}
    assert {row["source_economic_role"] for row in sell["rows"]} == {"prosumer_sell"}
    assert {row["added_distribution"] for row in sell["rows"]} == {0.0}




def custom_contract(role: str) -> dict:
    return price_sources.normalize_price_contract(
        {
            "source_adapter": "custom",
            "economic_role": role,
            "semantic_scope": "energy_only",
            "includes_distribution_variable": False,
            "includes_excise": False,
            "includes_service_margin": False,
            "price_basis": "gross",
            "unit": "GBP/kWh",
            "granularity": "60m",
            "list_attribute": "prices",
            "value_field": "price",
            "start_field": "start",
            "end_field": "end",
            "today_entity": "sensor.custom_today",
            "tomorrow_entity": "",
        },
        "buy", "custom", "sensor.custom_today", "",
    )


def test_custom_requires_explicit_valid_economic_role() -> None:
    state = State("sensor.custom_today", {"prices": octopus_energy_rows(NOW, 0.5)})
    valid = price_sources.build_canonical_direction(
        custom_contract("energy_only"), state, None, NOW, distribution(0.2)
    )
    missing = price_sources.build_canonical_direction(
        custom_contract(""), state, None, NOW, distribution(0.2)
    )

    assert len(valid["rows"]) == 24
    assert {row["source_economic_role"] for row in valid["rows"]} == {"energy_only"}
    assert {row["added_distribution"] for row in valid["rows"]} == {0.2}
    assert missing["rows"] == []
    assert missing["diagnostics"]["status"] == "unknown_economic_role"


def test_runtime_source_authority_has_no_legacy_fallbacks() -> None:
    manager = (ROOT / "custom_components" / "deye_energy" / "manager.py").read_text(encoding="utf-8")
    price_contract = manager.split("def price_contract(self, direction: str)", 1)[1].split("\n    @property", 1)[0]
    tariff_context = manager.split("def tariff_context(self, moment:", 1)[1].split("def validate_and_bind_price_contract", 1)[0]

    assert "self.price_source" not in manager
    assert "DEFAULT_BUY_PRICE" not in price_contract
    assert "DEFAULT_SELL_PRICE" not in price_contract
    assert "DEFAULT_PRICE_SENSOR" not in price_contract
    assert "price_source" not in tariff_context
    for key in (
        "CONF_BUY_PRICE_TODAY_SENSOR", "CONF_BUY_PRICE_TOMORROW_SENSOR",
        "CONF_PRICE_SENSOR", "CONF_SELL_PRICE_TOMORROW_SENSOR",
    ):
        assert key in price_contract


def test_migration_defaults_are_presence_aware_and_custom_role_is_not_guessed() -> None:
    absent = price_sources.migrate_legacy_price_contracts({"price_source": "octopus_energy"})
    explicit_empty = price_sources.migrate_legacy_price_contracts({
        "price_source": "octopus_energy",
        "buy_price_today_sensor": "",
        "buy_price_tomorrow_sensor": None,
        "price_sensor": "",
        "sell_price_tomorrow_sensor": None,
    })
    custom = price_sources.normalize_price_contract(
        {"source_adapter": "custom", "economic_role": ""},
        "sell", "custom", "sensor.custom_sell", "",
    )

    assert absent["buy_price_today_sensor"] == ""
    assert explicit_empty["buy_price_today_sensor"] == ""
    assert explicit_empty["buy_price_tomorrow_sensor"] == ""
    assert explicit_empty["price_sensor"] == ""
    assert explicit_empty["sell_price_tomorrow_sensor"] == ""
    assert custom["economic_role"] == ""
