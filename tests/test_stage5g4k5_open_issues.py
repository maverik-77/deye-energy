"""Stage 5G.4K.5 regressions for the audited open issues."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from test_manager_logic import FakeState, const, make_runtime, manager


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("prefix", ("deye3fm2lr", "garden_inverter"))
def test_issue_5_tou_runtime_uses_only_explicit_arbitrary_prefix_mapping(prefix):
    runtime = make_runtime()
    for idx in range(1, 7):
        for kind, domain, suffix in (
            ("start", "time", "start"),
            ("soc", "number", "soc"),
            ("grid", "switch", "grid_charge"),
        ):
            entity_id = f"{domain}.{prefix}_tou_{idx}_{suffix}"
            runtime.data[const.conf_tou_entity(idx, kind)] = entity_id
            state = (
                FakeState(f"{(idx - 1) * 4:02d}:00:00")
                if kind == "start"
                else FakeState("20", {"min": 0, "max": 100, "step": 1})
                if kind == "soc"
                else FakeState("off")
            )
            runtime.hass.states.values[entity_id] = state
            assert runtime._tou_entity(idx, kind) == entity_id
    assert len(runtime._tou_entities()) == 18
    assert all(
        row["supports_start"] and row["supports_soc"] and row["supports_grid_charge"]
        for row in runtime.tou_slot_capabilities()
    )


def test_issue_5_active_runtime_contains_no_hardcoded_tou_entity_prefix():
    source = (ROOT / "custom_components" / "deye_energy" / "manager.py").read_text(
        encoding="utf-8"
    )
    method = source[source.index("    def _tou_entity("):source.index("    @staticmethod", source.index("    def _tou_entity("))]
    assert "deye_inverter_time_of_use" not in method


def test_issue_5_tou_runtime_fails_closed_without_mapping_instead_of_guessing_prefix():
    runtime = make_runtime()
    for idx in range(1, 7):
        for kind in ("start", "soc", "grid"):
            runtime.data.pop(const.conf_tou_entity(idx, kind), None)
            assert runtime._tou_entity(idx, kind) == ""


def test_issue_7_manager_has_no_slot_or_target_current_contract():
    runtime = make_runtime()
    runtime.active_slot.enabled = True
    runtime.active_slot.mode = const.MODE_NORMAL_OPERATION

    for attr in (
        "target_discharge_current",
        "user_schedule_discharge_current",
        "_effective_slot_discharge_current",
        "default_discharge_current",
        "normal_profile_discharge_current",
        "discharge_current_number",
    ):
        assert not hasattr(runtime, attr)
    for attr in ("charge_current", "discharge_current", "grid_charge_current"):
        assert not hasattr(runtime.active_slot, attr)


def test_issue_7_current_fields_are_rejected_by_schedule_contract():
    runtime = make_runtime()
    slot_key = runtime.active_slot_key()
    with pytest.raises(ValueError, match="Unsupported schedule fields"):
        asyncio.run(
            runtime.async_apply_schedule_patch(
                [
                    {
                        "slot_key": slot_key,
                        "mode": const.MODE_NORMAL_OPERATION,
                        "discharge_current": 75,
                    }
                ]
            )
        )


def test_issue_7_apply_targets_never_writes_direct_current_entities():
    runtime = make_runtime()
    runtime.active_slot.enabled = True
    runtime.active_slot.mode = const.MODE_NORMAL_OPERATION
    runtime.control_enabled = True
    runtime.control_status = "Active"
    runtime.hass.states.values[const.DEFAULT_DISCHARGE_CURRENT] = FakeState("80")
    runtime.hass.states.values[const.DEFAULT_CHARGE_CURRENT] = FakeState("80")
    runtime.hass.states.values[const.DEFAULT_GRID_CHARGE_CURRENT] = FakeState("60")

    async def _tou_ok():
        return True

    runtime.async_apply_time_of_use_map = _tou_ok
    assert asyncio.run(runtime.async_apply_targets()) is True
    direct_current_entities = {
        const.DEFAULT_DISCHARGE_CURRENT,
        const.DEFAULT_CHARGE_CURRENT,
        const.DEFAULT_GRID_CHARGE_CURRENT,
    }
    assert not [
        call
        for call in runtime.hass.services.calls
        if call[:2] == ("number", "set_value")
        and call[2].get("entity_id") in direct_current_entities
    ]


def _set_solcast_inputs(runtime, *, forecast: float, actual: float) -> None:
    runtime.hass.states.values[runtime.solcast_forecast_today_sensor] = FakeState(str(forecast))
    runtime.hass.states.values[runtime.daily_pv_production_sensor] = FakeState(str(actual))


def test_issue_8_fresh_empty_tracking_initializes_current_local_date(monkeypatch):
    runtime = make_runtime()
    now = datetime(2026, 8, 29, 9, 15, tzinfo=timezone.utc)
    monkeypatch.setattr(manager, "ha_now", lambda: now)
    runtime.solcast_tracking = {}
    _set_solcast_inputs(runtime, forecast=12, actual=2)

    asyncio.run(runtime.async_update_solcast_history())

    assert runtime.solcast_tracking["date"] == "2026-08-29"
    assert runtime.solcast_tracking["actual"] == 2


def test_issue_8_solcast_missing_date_self_heals_and_preserves_snapshots(monkeypatch):
    runtime = make_runtime()
    now = datetime(2026, 8, 29, 12, 15, tzinfo=timezone.utc)
    monkeypatch.setattr(manager, "ha_now", lambda: now)
    snapshot = {"timestamp": "2026-08-29T11:00:00+00:00", "forecast_kwh": 11.0}
    runtime.solcast_tracking = {"forecast_snapshots": [snapshot]}
    runtime.energy_samples = [{"timestamp": "preserve-energy"}]
    runtime.ai_history = [{"event": "preserve-ai"}]
    _set_solcast_inputs(runtime, forecast=12, actual=5)

    asyncio.run(runtime.async_update_solcast_history())

    assert runtime.solcast_tracking["date"] == "2026-08-29"
    assert runtime.solcast_tracking["initial_forecast_kwh"] == 12
    assert runtime.solcast_tracking["latest_forecast_kwh"] == 12
    assert snapshot in runtime.solcast_tracking["forecast_snapshots"]
    assert runtime.solcast_history == []
    assert runtime.energy_samples == [{"timestamp": "preserve-energy"}]
    assert runtime.ai_history == [{"event": "preserve-ai"}]


def test_issue_8_solcast_same_day_restart_keeps_initial_and_updates_latest(monkeypatch):
    runtime = make_runtime()
    now = datetime(2026, 8, 29, 13, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(manager, "ha_now", lambda: now)
    runtime.solcast_tracking = {
        "date": "2026-08-29",
        "forecast": 10.0,
        "initial_forecast_kwh": 10.0,
        "latest_forecast_kwh": 11.0,
        "forecast_snapshots": [],
        "actual": 3.0,
    }
    _set_solcast_inputs(runtime, forecast=12, actual=5)

    asyncio.run(runtime.async_update_solcast_history())

    assert runtime.solcast_tracking["initial_forecast_kwh"] == 10
    assert runtime.solcast_tracking["latest_forecast_kwh"] == 12
    assert runtime.solcast_tracking["actual"] == 5


def test_issue_8_solcast_rollover_closes_valid_day_once(monkeypatch):
    runtime = make_runtime()
    now = datetime(2026, 8, 29, 0, 15, tzinfo=timezone.utc)
    monkeypatch.setattr(manager, "ha_now", lambda: now)
    runtime.solcast_tracking = {
        "date": (now.date() - timedelta(days=1)).isoformat(),
        "forecast": 10.0,
        "initial_forecast_kwh": 10.0,
        "latest_forecast_kwh": 12.0,
        "forecast_snapshots": [],
        "actual": 8.0,
    }
    _set_solcast_inputs(runtime, forecast=9, actual=0.2)

    asyncio.run(runtime.async_update_solcast_history())
    asyncio.run(runtime.async_update_solcast_history())

    assert len(runtime.solcast_history) == 1
    row = runtime.solcast_history[0]
    assert row["date"] == (now.date() - timedelta(days=1)).isoformat()
    assert row["forecast_kwh"] == 10
    assert row["actual_kwh"] == 8
    assert row["day_complete"] is True
    assert row["accuracy_percent"] is not None
    assert runtime.solcast_tracking["date"] == now.date().isoformat()


def test_issue_8_solcast_rollover_does_not_close_day_without_forecast(monkeypatch):
    runtime = make_runtime()
    now = datetime(2026, 8, 29, 0, 15, tzinfo=timezone.utc)
    monkeypatch.setattr(manager, "ha_now", lambda: now)
    runtime.solcast_tracking = {
        "date": (now.date() - timedelta(days=1)).isoformat(),
        "forecast": 0.0,
        "forecast_snapshots": [],
        "actual": 4.0,
    }
    _set_solcast_inputs(runtime, forecast=9, actual=0.2)

    asyncio.run(runtime.async_update_solcast_history())

    assert runtime.solcast_history == []
    assert runtime.solcast_tracking["date"] == now.date().isoformat()


def test_issue_8_solcast_progress_uses_latest_forecast_denominator(monkeypatch):
    runtime = make_runtime()
    monkeypatch.setattr(
        manager,
        "ha_now",
        lambda: datetime(2026, 8, 29, 12, 0, tzinfo=timezone.utc),
    )
    runtime.solcast_tracking = {
        "date": "2026-08-29",
        "forecast": 10.0,
        "initial_forecast_kwh": 10.0,
        "latest_forecast_kwh": 20.0,
        "actual": 5.0,
    }

    today = next(row for row in runtime.history_daily_summary() if row["date"] == "2026-08-29")
    assert today["forecast_kwh"] == 20
    assert today["forecast_progress_percent"] == 25
