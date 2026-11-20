"""Stage 5G.4J.6 regressions for the current-free Core Sell contract."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

import pytest

from test_manager_logic import FakeState, const, make_runtime, manager, select_module
from test_stage5g4b_safe import _flat_market, _sale_profile, optimizer


TODAY = manager.ha_now().date().isoformat()
CURRENT_FIELDS = ("charge_current", "discharge_current", "grid_charge_current")


def _sell_contract(power_w: float) -> dict:
    start = datetime(2026, 8, 21, 18, tzinfo=timezone.utc)
    return optimizer._core_action_contract(
        {
            "baseline_schedule": [
                {
                    "minimum_sell_soc": 20,
                    "tou_soc": 15,
                }
                for _ in range(48)
            ],
        },
        index=18,
        day=date(2026, 8, 21),
        hour_start=start,
        hour_end=start.replace(hour=19),
        action="sell",
        action_spec={"action": "sell", "profile_id": "evening_sale"},
        planned_energy_kwh=power_w / 1000,
        planned_power_w=power_w,
        effective_min_soc=20,
        target_soc=100,
        confidence=90,
        net_result=1.0,
        reason_code="profile",
        reason_summary="test",
        physical_limits={"battery_discharge_limit_w": 6240},
    )


@pytest.mark.parametrize("power_w", [4000, 130])
def test_sell_contract_is_power_only_and_contains_no_current_fields(power_w):
    contract = _sell_contract(power_w)

    assert contract["schedule_update"] == {
        "slot_key": "18_19",
        "enabled": True,
        "mode": const.MODE_SELLING_FIRST,
        "sell_power": power_w,
    }
    assert contract["deployment_ready"] is True
    assert all(field not in contract for field in CURRENT_FIELDS)
    assert all(field not in contract["schedule_update"] for field in CURRENT_FIELDS)
    assert all(field not in contract["constraints"] for field in CURRENT_FIELDS)


def _apply_legacy_ai_sell(runtime, power_w: float) -> None:
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [
                {
                    "slot_key": runtime.active_slot_key(),
                    "enabled": True,
                    "mode": const.MODE_SELLING_FIRST,
                    "sell_power": power_w,
                    "discharge_current": 76.9,
                    "charge_current": 2,
                    "grid_charge_current": 2,
                    "minimum_sell_soc": 99,
                    "tou_soc": 99,
                    "charge_enabled": True,
                }
            ],
            replace_day=True,
            date=TODAY,
        )
    )


@pytest.mark.parametrize("power_w", [4000, 130])
def test_apply_today_ignores_legacy_current_fields(power_w):
    runtime = make_runtime()
    active = runtime.active_slot
    old_minimum = active.minimum_sell_soc
    old_tou = active.tou_soc
    old_charge = active.charge_enabled

    _apply_legacy_ai_sell(runtime, power_w)

    active = runtime.active_slot
    assert active.mode == const.MODE_SELLING_FIRST
    assert active.sell_power == power_w
    assert active.ai_sell_power_only is True
    assert active.minimum_sell_soc == old_minimum
    assert active.tou_soc == old_tou
    assert active.charge_enabled == old_charge


def test_regular_schedule_patch_rejects_current_fields():
    runtime = make_runtime()
    with pytest.raises(ValueError, match="Unsupported schedule fields"):
        asyncio.run(
            runtime.async_apply_schedule_patch(
                [
                    {
                        "slot_key": runtime.active_slot_key(),
                        "mode": const.MODE_SELLING_FIRST,
                        "sell_power": 4000,
                        "discharge_current": 90,
                    }
                ]
            )
        )


def test_future_plan_validation_rejects_current_fields():
    runtime = make_runtime()
    legacy = {
        "slot_key": runtime.active_slot_key(),
        "enabled": True,
        "mode": const.MODE_SELLING_FIRST,
        "sell_power": 130,
        "discharge_current": 2.5,
        "charge_current": 2.5,
        "grid_charge_current": 2.5,
    }
    with pytest.raises(ValueError, match="Unsupported plan fields"):
        runtime._validate_future_plan_updates([legacy])


def test_ai_sell_contract_executes_as_mode_and_power_only():
    runtime = make_runtime()
    slot_key = runtime.active_slot_key()
    active = runtime.active_slot
    old_minimum = active.minimum_sell_soc
    old_tou = active.tou_soc
    old_charge = active.charge_enabled
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [
                {
                    "slot_key": slot_key,
                    "enabled": True,
                    "mode": const.MODE_SELLING_FIRST,
                    "sell_power": 4000,
                    "minimum_sell_soc": 99,
                    "tou_soc": 99,
                    "charge_enabled": True,
                }
            ],
            replace_day=True,
            date=TODAY,
        )
    )

    active = runtime.active_slot
    assert active.mode == const.MODE_SELLING_FIRST
    assert active.sell_power == 4000
    assert active.minimum_sell_soc == old_minimum
    assert active.tou_soc == old_tou
    assert active.charge_enabled == old_charge
    assert active.ai_sell_power_only is True


def test_normal_cycle_clears_ai_sell_power_only_marker():
    runtime = make_runtime()
    slot_key = runtime.active_slot_key()
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [
                {
                    "slot_key": slot_key,
                    "enabled": True,
                    "mode": const.MODE_SELLING_FIRST,
                    "sell_power": 4000,
                }
            ],
            replace_day=True,
            date=TODAY,
        )
    )
    assert runtime.active_slot.ai_sell_power_only is True

    asyncio.run(
        runtime.async_apply_schedule_patch(
            [{"slot_key": slot_key, "mode": const.MODE_NORMAL_OPERATION}]
        )
    )
    assert runtime.active_slot.ai_sell_power_only is False


def test_direct_battery_power_limit_remains_the_only_feasibility_input():
    values = _flat_market()
    values.update(
        soc=100,
        battery_discharge_limit_w=60 * 52,
        effective_power_limit_w=10000,
        grid_export_limit_w=10000,
        inverter_ac_limit_w=10000,
    )
    values["load_profile_48h"] = [2.0] * 48
    values["sell_prices"][0][18] = 2.0
    profile = _sale_profile(start="18:00", end="19:00", priority="high", target=10)
    profile["preferred_power_w"] = 10000
    values["user_profiles"] = {
        "schema_version": 2,
        "profiles": {"evening_sale": profile},
    }

    row = optimizer.build_energy_plan(values, "balanced")["rows"][18]

    assert row["battery_to_home_kwh"] + row["battery_to_grid_kwh"] <= 3.12 + 1e-6
    assert row["planned_power_w"] <= 3120
    assert all(field not in row["action_contract"]["schedule_update"] for field in CURRENT_FIELDS)


@pytest.mark.parametrize(
    "provider",
    [
        const.PROVIDER_LEWA_REKA,
        const.PROVIDER_SOLARMAN,
        const.PROVIDER_SUNSYNK,
        const.PROVIDER_CUSTOM,
    ],
)
def test_writable_providers_share_power_only_ai_sell_contract(provider):
    runtime = make_runtime()
    runtime.data[const.CONF_INVERTER_PROVIDER] = provider
    contract = _sell_contract(4000)
    asyncio.run(
        runtime.async_apply_schedule_patch(
            [{**contract["schedule_update"], "slot_key": runtime.active_slot_key()}],
            ai_source=True,
        )
    )

    active = runtime.active_slot
    assert active.ai_sell_power_only is True
    assert active.mode == const.MODE_SELLING_FIRST
    assert active.sell_power == 4000


def test_control_paths_never_write_direct_current_entities():
    runtime = make_runtime()
    runtime.control_enabled = True
    runtime.control_status = "Active"
    runtime.hass.states.values[const.DEFAULT_DISCHARGE_CURRENT] = FakeState("120")
    runtime.hass.states.values[const.DEFAULT_CHARGE_CURRENT] = FakeState("120")
    runtime.hass.states.values[const.DEFAULT_GRID_CHARGE_CURRENT] = FakeState("60")
    runtime.hass.services.calls.clear()

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


def test_ai_sell_power_only_marker_survives_slot_mode_restore():
    runtime = make_runtime()
    slot_key = runtime.active_slot_key()
    entity = select_module.DeyeSlotModeSelect(
        runtime,
        slot_key,
        runtime.slots[slot_key].label,
    )

    async def restored_state():
        return FakeState(
            const.MODE_SELLING_FIRST,
            {"ai_sell_power_only": True},
        )

    entity.async_get_last_state = restored_state
    asyncio.run(entity.async_added_to_hass())

    assert runtime.slots[slot_key].mode == const.MODE_SELLING_FIRST
    assert runtime.slots[slot_key].ai_sell_power_only is True
    assert entity.extra_state_attributes == {"ai_sell_power_only": True}
