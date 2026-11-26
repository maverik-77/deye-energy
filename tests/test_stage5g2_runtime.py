"""Stage 5G.2 runtime feedback-loop and event-loop guardrails."""

from __future__ import annotations

import asyncio
from pathlib import Path

from test_manager_logic import manager
from test_stage5g1_lifecycle import task_runtime


def _capture_input_listener(runtime):
    captured = {"registrations": 0, "timers": 0, "active": 0}
    original_state = manager.async_track_state_change_event
    original_point = manager.async_track_point_in_time

    def track_state(_hass, entities, callback):
        captured["registrations"] += 1
        captured["active"] += 1
        captured["entities"] = tuple(entities)
        captured["callback"] = callback

        def unsubscribe():
            captured["active"] -= 1

        return unsubscribe

    def track_point(_hass, callback, _when):
        captured["timers"] += 1
        captured["timer_callback"] = callback
        return lambda: None

    manager.async_track_state_change_event = track_state
    manager.async_track_point_in_time = track_point

    def restore():
        manager.async_track_state_change_event = original_state
        manager.async_track_point_in_time = original_point

    return captured, restore


















def test_snapshot_refresh_does_not_write_all_manager_entities():
    async def scenario():
        runtime = task_runtime()

        class Entity:
            def __init__(self, key):
                self._deye_manager_key = key
                self.hass = object()
                self.writes = 0

            def async_write_ha_state(self):
                self.writes += 1

        entities = [Entity("ai_state"), Entity("diagnostics"), Entity("manager_status"), Entity("target_mode")]
        runtime.entities = entities
        runtime.build_ai_state_snapshot = lambda: {"schema_version": 1}
        runtime.diagnostics = lambda: {"connected": True}
        await runtime.request_sensor_snapshot_refresh()
        assert [entity.writes for entity in entities] == [1, 1, 0, 0]
        await runtime.request_sensor_snapshot_refresh()
        assert [entity.writes for entity in entities] == [1, 1, 0, 0]

    asyncio.run(scenario())


def test_reload_does_not_duplicate_schedule_listeners():
    runtime = task_runtime()
    captured, restore = _capture_input_listener(runtime)
    try:
        runtime._start_schedule_input_listener()
        runtime._start_schedule_input_listener()
        assert captured["registrations"] == 1
        assert captured["active"] == 1
        assert len(captured["entities"]) == len(set(captured["entities"]))
    finally:
        if runtime.unsub_input_listener:
            runtime.unsub_input_listener()
        restore()


def test_disable_enable_does_not_duplicate_state_listeners():
    async def scenario():
        runtime = task_runtime()
        captured, restore = _capture_input_listener(runtime)
        try:
            runtime._start_schedule_input_listener()
            assert captured["active"] == 1
            await runtime.async_unload()
            assert captured["active"] == 0
            replacement = task_runtime()
            replacement._start_schedule_input_listener()
            assert replacement is not runtime
            assert captured["registrations"] == 2
            assert captured["active"] == 1
            await replacement.async_unload()
            assert captured["active"] == 0
        finally:
            restore()

    asyncio.run(scenario())














def test_async_setup_entry_gates_restore_entities_until_platforms_finish():
    source = (
        Path(__file__).resolve().parents[1]
        / "custom_components/deye_energy/__init__.py"
    ).read_text(encoding="utf-8")
    start = source.index("async def async_setup_entry(")
    end = source.index("async def async_unload_entry", start)
    setup = source[start:end]
    gate = setup.index("runtime._platform_setup_in_progress = True")
    forward = setup.index("async_forward_entry_setups")
    finish = setup.index("runtime.finish_platform_setup()")
    assert gate < forward < finish
