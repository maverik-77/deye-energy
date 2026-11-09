"""Half-hour schedule slots: model, active slot, TOU mapping and fan-out."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from test_manager_logic import FakeState, make_runtime, manager, const


def at(hour: int, minute: int = 0):
    return datetime(2026, 7, 18, hour, minute, tzinfo=timezone.utc)


def test_the_day_has_48_unique_half_hour_slots():
    assert const.SLOTS_PER_DAY == 48
    assert len(const.SLOTS) == 48
    assert len({row[0] for row in const.SLOTS}) == 48
    first, second, last = const.SLOTS[0], const.SLOTS[1], const.SLOTS[-1]
    assert first[:2] == ("0000_0030", "00:00-00:30")
    assert second[:2] == ("0030_0100", "00:30-01:00")
    assert last[:2] == ("2330_0000", "23:30-00:00")
    assert last[3] == 1440


def test_hourly_keys_fan_out_to_two_slots():
    assert const.slots_for_key("05_06") == ["0500_0530", "0530_0600"]
    assert const.slots_for_key("23_00") == ["2300_2330", "2330_0000"]
    assert const.slots_for_key("0530_0600") == ["0530_0600"]
    assert const.slots_for_key("nonsense") == []
    assert const.hour_key(5) == "05_06"


@pytest.mark.parametrize(
    ("hour", "minute", "expected"),
    [(5, 0, "0500_0530"), (5, 29, "0500_0530"), (5, 30, "0530_0600"), (23, 59, "2330_0000"), (0, 0, "0000_0030")],
)
def test_active_slot_changes_on_the_half_hour(monkeypatch, hour, minute, expected):
    runtime = make_runtime()
    monkeypatch.setattr(manager, "ha_now", lambda: at(hour, minute))
    assert runtime.active_slot_key() == expected


def _half_hour_runtime():
    runtime = make_runtime()
    for slot in runtime.slots.values():
        slot.enabled = True
        slot.mode = const.MODE_NORMAL_OPERATION
        slot.tou_soc = 10
        slot.charge_enabled = False
    return runtime


def test_mapping_boundary_can_sit_on_a_half_hour():
    runtime = _half_hour_runtime()
    # 05:30-06:00 and 06:00-06:30 need their own physical range.
    for key in ("0530_0600", "0600_0630"):
        runtime.slots[key].tou_soc = 60
    mapping = runtime._tou_mapping
    assert len(mapping.slots) == 6
    rows = [(item.start, item.end, item.soc) for item in mapping.slots]
    assert (330, 390, 60.0) in rows
    snapshot = runtime.schedule_mapping_snapshot()
    target = next(item for item in snapshot if item["start"] == 330)
    assert (target["start_time"], target["end_time"]) == ("05:30", "06:30")


def test_mapping_covers_the_whole_day_without_gaps():
    runtime = _half_hour_runtime()
    for index, key in enumerate(const.SLOT_KEYS):
        runtime.slots[key].tou_soc = 10 + (index // 8) * 10
    mapping = runtime._tou_mapping
    covered = sorted(index for item in mapping.slots for index in item.source_slots)
    assert covered == list(range(48))
    assert mapping.slots[-1].end == 0


def test_more_than_six_ranges_is_reported_not_written():
    runtime = _half_hour_runtime()
    for index, key in enumerate(const.SLOT_KEYS):
        runtime.slots[key].tou_soc = 10 + (index % 2) * 5
    assert len(runtime._tou_mapping.slots) > 6
    assert asyncio.run(runtime.async_apply_time_of_use_map()) is False


def test_half_hour_boundary_is_written_to_the_inverter():
    runtime = _half_hour_runtime()
    for key in ("0530_0600", "0600_0630"):
        runtime.slots[key].tou_soc = 60
    runtime.scheduler_enabled = True
    runtime.hass.services.calls.clear()
    assert asyncio.run(runtime.async_apply_time_of_use_map()) is True
    written = {
        data.get("entity_id"): data
        for _domain, _service, data, _blocking in runtime.hass.services.calls
        if "time_of_use" in str(data.get("entity_id", ""))
    }
    starts = [
        str(data.get("time") or data.get("option") or data.get("value"))
        for entity, data in written.items()
        if str(entity).endswith("_start")
    ]
    assert any(value.startswith("05:30") for value in starts), starts


@pytest.mark.parametrize(("value", "ok"), [("05:00", True), ("05:30", True), ("05:15", False), ("05:45:00", False)])
def test_tou_boundary_accepts_only_slot_edges(value, ok):
    if ok:
        assert manager.DeyeEnergyRuntime._tou_boundary(value, "Start") == value[:5]
    else:
        with pytest.raises(ValueError, match="30-minute boundary"):
            manager.DeyeEnergyRuntime._tou_boundary(value, "Start")


def test_reverse_sync_reads_a_range_that_starts_on_the_half_hour():
    runtime = _half_hour_runtime()
    starts = ("00:00", "05:30", "09:00", "13:30", "18:00", "22:00")
    socs = (11, 22, 33, 44, 55, 66)
    for idx, (start, soc) in enumerate(zip(starts, socs), start=1):
        runtime.hass.states.values[f"time.deye_inverter_time_of_use_{idx}_start"] = FakeState(f"{start}:00")
        runtime.hass.states.values[f"number.deye_inverter_time_of_use_{idx}_soc"] = FakeState(
            str(soc), {"min": 0, "max": 100, "step": 1}
        )
        runtime.hass.states.values[f"switch.deye_inverter_time_of_use_{idx}_grid_charge"] = FakeState("off")
    patch = runtime.tou_mapping_to_schedule_patch(runtime.read_physical_tou_mapping())
    values = {row["slot_key"]: row["tou_soc"] for row in patch}
    assert len(values) == 48
    assert values["0500_0530"] == 11
    assert values["0530_0600"] == 22
    assert values["1300_1330"] == 33
    assert values["1330_1400"] == 44
    assert values["2330_0000"] == 66


def test_hourly_patch_updates_both_half_hour_slots():
    runtime = make_runtime()
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [{"slot_key": "09_10", "enabled": True, "mode": const.MODE_NORMAL_OPERATION, "tou_soc": 42}]
        )
    )
    assert runtime.slots["0900_0930"].tou_soc == 42
    assert runtime.slots["0930_1000"].tou_soc == 42
    assert runtime.slots["1000_1030"].tou_soc != 42


def test_half_hour_patch_changes_one_slot_only():
    runtime = make_runtime()
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [{"slot_key": "0930_1000", "enabled": True, "mode": const.MODE_NORMAL_OPERATION, "tou_soc": 37}]
        )
    )
    assert runtime.slots["0930_1000"].tou_soc == 37
    assert runtime.slots["0900_0930"].tou_soc != 37


def test_future_plan_hourly_selection_expands_and_fills_the_day():
    updates = manager.DeyeEnergyRuntime._expand_slot_updates(
        [{"slot_key": "18_19", "enabled": True, "mode": const.MODE_SELLING_FIRST, "sell_power": 3000}]
    )
    assert [item["slot_key"] for item in updates] == ["1800_1830", "1830_1900"]
    runtime = make_runtime()
    target, selected = runtime._build_authoritative_future_plan_updates(
        [{"slot_key": "18_19", "enabled": True, "mode": const.MODE_SELLING_FIRST, "sell_power": 3000}]
    )
    assert len(target) == 48
    assert selected == ["1800_1830", "1830_1900"]
