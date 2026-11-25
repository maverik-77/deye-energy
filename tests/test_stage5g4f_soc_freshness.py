"""Stage 5G.4F SAFE: SOC report freshness, recovery and storm guardrails."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from test_manager_logic import (
    configure_selling_slot,
    control_number_calls,
    make_runtime,
    manager,
)


@contextmanager
def at(moment: datetime):
    previous = manager.ha_now
    manager.ha_now = lambda: moment
    try:
        yield
    finally:
        manager.ha_now = previous


def _timestamped_soc(runtime, moment: datetime, value: str = "80"):
    state = runtime.hass.states.get(runtime.battery_soc_sensor)
    state.state = value
    state.last_changed = moment
    state.last_updated = moment
    state.last_reported = moment
    return state


async def _noop(*_args, **_kwargs):
    return None




def test_soc_becomes_stale_only_after_no_report_for_more_than_900_seconds():
    runtime = make_runtime(soc="80")
    started = datetime(2026, 8, 14, 5, 0, tzinfo=timezone.utc)
    _timestamped_soc(runtime, started)

    with at(started + timedelta(seconds=900)):
        assert runtime.current_soc_or_none() == 80
        assert runtime.soc_diagnostics()["status"] == "valid"

    with at(started + timedelta(seconds=901)):
        diagnostics = runtime.soc_diagnostics()
        assert diagnostics["status"] == "stale"
        assert diagnostics["normalized_value"] is None
        assert diagnostics["age_seconds"] == 901.0
        assert runtime.current_soc_or_none() is None


def test_real_event_is_compatibility_observation_when_last_reported_is_missing():
    runtime = make_runtime(soc="80")
    started = datetime(2026, 8, 14, 5, 0, tzinfo=timezone.utc)
    state = runtime.hass.states.get(runtime.battery_soc_sensor)
    state.last_updated = started
    runtime._soc_quality_signature = runtime._soc_semantic_signature(
        runtime.soc_diagnostics()
    )

    observed = started + timedelta(minutes=10)
    with at(observed):
        material = runtime._observe_soc_source_event({
            "entity_id": runtime.battery_soc_sensor,
            "new_state": state,
        })
        diagnostics = runtime.soc_diagnostics()

    assert material is False
    assert diagnostics["status"] == "valid"
    assert diagnostics["freshness_source"] == "event_observed_at"
    assert diagnostics["observed_at"] == observed.isoformat()
    assert diagnostics["age_seconds"] == 0.0


def test_reload_does_not_make_an_unreported_source_fresh():
    started = datetime(2026, 8, 14, 5, 0, tzinfo=timezone.utc)
    reloaded = make_runtime(soc="80")
    _timestamped_soc(reloaded, started)

    with at(started + timedelta(seconds=901)):
        diagnostics = reloaded.soc_diagnostics()
        current_soc = reloaded.current_soc_or_none()

    assert diagnostics["status"] == "stale"
    assert diagnostics["reported_at"] == started.isoformat()
    assert diagnostics["observed_at"] is None
    assert current_soc is None


def test_stale_to_valid_same_value_revalidates_and_releases_failure_latch():
    runtime = make_runtime(soc="80", price="1.00")
    started = datetime(2026, 8, 14, 5, 0, tzinfo=timezone.utc)
    state = _timestamped_soc(runtime, started)

    with at(started):
        slot = configure_selling_slot(runtime)
        slot.minimum_sell_soc = 10
        # The test runs across the half-hour boundary; sell in both halves.
        for field_name in ("enabled", "mode", "sell_power", "tou_soc", "minimum_sell_soc", "charge_enabled"):
            setattr(runtime.slots["0530_0600"], field_name, getattr(slot, field_name))
        runtime._soc_quality_signature = runtime._soc_semantic_signature(
            runtime.soc_diagnostics()
        )

    stale_at = started + timedelta(seconds=901)
    with at(stale_at):
        assert runtime._refresh_soc_quality_signature() is True
        assert runtime.soc_diagnostics()["status"] == "stale"
        assert asyncio.run(runtime.async_apply_targets()) is False
        stale_fingerprint = runtime._last_slot_failure_signature
        first_defaults = len(control_number_calls(runtime))
        runtime.hass.services.calls.clear()
        assert asyncio.run(runtime.async_apply_targets()) is False
        assert control_number_calls(runtime) == []

    assert stale_fingerprint
    assert first_defaults > 0

    recovered_at = stale_at + timedelta(seconds=1)
    state.last_reported = recovered_at
    with at(recovered_at):
        valid_fingerprint = runtime._slot_failure_fingerprint("")
        assert valid_fingerprint != stale_fingerprint
        assert runtime._refresh_soc_quality_signature() is True
        assert runtime.current_soc_or_none() == 80
        assert asyncio.run(runtime.async_apply_targets()) is True

    assert runtime._last_slot_failure_signature == ""

    with at(recovered_at + timedelta(seconds=901)):
        assert runtime._refresh_soc_quality_signature() is True
        assert runtime.soc_diagnostics()["status"] == "stale"
        assert asyncio.run(runtime.async_apply_targets()) is False
        assert runtime._last_slot_failure_signature
