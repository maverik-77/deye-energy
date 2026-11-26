"""Stage 5G.4F SAFE: SOC report freshness, recovery and storm guardrails."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from test_manager_logic import (
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
