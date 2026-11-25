"""Stage 5G.3B.2 behavior-preserving runtime performance regressions."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from test_manager_logic import manager
from test_stage5g1_lifecycle import task_runtime

from custom_components.deye_energy.history import (
    ENERGY_COMPACT_FORMAT_VERSION,
    migrate_energy_payload,
)


def _raw_energy_sample(index: int) -> dict:
    return {
        "schema_version": 4,
        "timestamp": f"2026-08-10T12:{index % 60:02d}:00+00:00",
        "interval_seconds": 60,
        "pv_power": 1000 + index,
        "load_power": 500,
        "grid_power": -250,
        "battery_power": 250,
        "soc": 50,
        "sell_price": 0.5,
        "buy_price": 0.7,
        "readings": {"pv": {"value": 1000 + index, "status": "ok"}},
        "source_quality": {"score": 100},
        "weather": {"condition": "sunny"},
    }


def test_energy_migration_compacts_archive_and_preserves_public_recent_details():
    raw = {
        "schema_version": 4,
        "samples": [_raw_energy_sample(index) for index in range(400)],
        "daily": [{"date": "2026-08-09", "pv_kwh": 10}],
        "monthly": [{"month": "2026-08", "pv_kwh": 10}],
        "counter_state": {"daily_pv": {"value_kwh": 10}},
        "last_sample": "2026-08-10T12:39:00+00:00",
    }

    migrated, changed = migrate_energy_payload(raw)
    again, changed_again = migrate_energy_payload(migrated)

    assert changed is True
    assert changed_again is False
    assert migrated == again
    assert migrated["energy_format_version"] == ENERGY_COMPACT_FORMAT_VERSION
    assert len(migrated["samples"]) == 400
    assert len(migrated["recent_details"]) == 288
    assert "readings" not in migrated["samples"][0]
    assert migrated["recent_details"] == raw["samples"][-288:]
    assert migrated["daily"] == raw["daily"]
    assert migrated["monthly"] == raw["monthly"]
    assert migrated["counter_state"] == raw["counter_state"]


def test_energy_store_singleflight_latest_revision_wins_and_releases_legacy_backup():
    async def scenario():
        runtime = task_runtime()
        first_started = asyncio.Event()
        release_first = asyncio.Event()

        class Store:
            def __init__(self):
                self.payloads = []

            async def async_save(self, payload):
                self.payloads.append(payload)
                if len(self.payloads) == 1:
                    first_started.set()
                    await release_first.wait()

        store = Store()
        runtime._samples_store = store
        runtime._energy_legacy_payload_backup = {"samples": [_raw_energy_sample(0)]}
        runtime.energy_samples = [{"timestamp": "one", "pv_power": 1}]
        runtime._energy_revision = 1
        first = runtime.request_energy_save()
        await first_started.wait()

        runtime.energy_samples.append({"timestamp": "two", "pv_power": 2})
        runtime._energy_revision = 2
        runtime.request_energy_save()
        release_first.set()
        await first

        assert len(store.payloads) == 2
        assert store.payloads[0]["samples"] == [{"timestamp": "one", "pv_power": 1}]
        assert store.payloads[1]["samples"][-1]["timestamp"] == "two"
        assert runtime._energy_saved_revision == 2
        assert runtime._energy_legacy_payload_backup is None

    asyncio.run(scenario())






def test_repeated_full_publish_skips_unchanged_public_state_but_granular_forces_it():
    runtime = task_runtime()
    runtime.request_sensor_snapshot_refresh = lambda *_args, **_kwargs: None

    class Entity:
        hass = object()
        available = True
        extra_state_attributes = {"stable": True}

        def __init__(self):
            self._deye_manager_key = "manager_status"
            self._value = "idle"
            self.writes = 0

        @property
        def native_value(self):
            return self._value

        def async_write_ha_state(self):
            self.writes += 1

    entity = Entity()
    runtime.entities = [entity]
    runtime.notify_update()
    runtime.notify_update()
    assert entity.writes == 1

    entity._value = "changed"
    runtime.notify_update()
    assert entity.writes == 2

    runtime._notify_entities_from_cache({"manager_status"})
    assert entity.writes == 3
