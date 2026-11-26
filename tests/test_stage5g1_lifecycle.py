"""Stage 5G.1 startup, single-flight and lifecycle regression tests."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from pathlib import Path

from test_manager_logic import FakeHass, make_runtime, manager


ROOT = Path(__file__).resolve().parents[1]
MANAGER_SOURCE = (ROOT / "custom_components/deye_energy/manager.py").read_text(encoding="utf-8")
SENSOR_SOURCE = (ROOT / "custom_components/deye_energy/sensor.py").read_text(encoding="utf-8")
TARIFFS_SOURCE = (ROOT / "custom_components/deye_energy/tariffs.py").read_text(encoding="utf-8")
CATALOG_SOURCE = (ROOT / "custom_components/deye_energy/tariff_catalog.py").read_text(encoding="utf-8")
INIT_SOURCE = (ROOT / "custom_components/deye_energy/__init__.py").read_text(encoding="utf-8")


class TaskHass(FakeHass):
    def __init__(self, states):
        super().__init__(states)
        self.created_tasks = []
        self.executor_calls = 0

    def async_create_task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.created_tasks.append(task)
        return task

    async def async_add_executor_job(self, function, *args):
        self.executor_calls += 1
        return await asyncio.to_thread(function, *args)


class DelayedStore:
    def __init__(self):
        self.release = asyncio.Event()
        self.started = asyncio.Event()
        self.calls = []
        self.active = 0
        self.max_active = 0

    async def async_save(self, value):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.started.set()
        try:
            await self.release.wait()
            self.calls.append(deepcopy(value))
        finally:
            self.active -= 1


def task_runtime():
    runtime = make_runtime()
    runtime.hass = TaskHass(runtime.hass.states.values)
    return runtime












def test_identical_state_does_not_trigger_duplicate_store_save():
    async def scenario():
        runtime = task_runtime()
        store = DelayedStore()
        store.release.set()
        runtime._ai_store = store
        await runtime.async_save_ai_data()
        await runtime.async_save_ai_data()
        assert len(store.calls) == 1

    asyncio.run(scenario())








def test_async_setup_entry_does_not_wait_for_background_store_saves():
    assert "await runtime.async_start()" in INIT_SOURCE
    start = MANAGER_SOURCE.index("    async def async_start(")
    end = MANAGER_SOURCE.index("    async def async_unload(", start)
    method = MANAGER_SOURCE[start:end]
    assert "self.request_ai_save()" in method
    assert "self.request_energy_save()" in method
    assert "await self.async_save_ai_data()" not in method
    assert "await self.async_save_energy_history()" not in method


def test_runtime_start_does_not_spawn_unbounded_save_tasks():
    async def scenario():
        runtime = task_runtime()
        runtime._ai_store = DelayedStore()
        runtime._samples_store = DelayedStore()
        runtime._startup_in_progress = True
        for _ in range(50):
            runtime.request_ai_save()
            runtime.request_energy_save()
        assert runtime.hass.created_tasks == []

    asyncio.run(scenario())


def test_startup_finishes_with_ai_and_energy_enabled():
    async def scenario():
        runtime = task_runtime()
        runtime._ai_store = DelayedStore()
        runtime._samples_store = DelayedStore()
        runtime._ai_save_dirty = True
        runtime._energy_save_dirty = True
        runtime.request_sensor_snapshot_refresh = lambda: None

        async def no_op():
            return None

        for name in (
            "async_load_sales_stats", "async_load_trigger_log", "async_load_ai_data", "async_load_solcast_history",
            "async_update_solcast_history", "async_load_energy_history",
            "async_update_energy_sample", "async_update_weather_forecast",
            "_async_ensure_install_battery_restart_capacity_default",
        ):
            setattr(runtime, name, no_op)

        class Catalog:
            def __init__(self, *_args):
                self.catalog = {}

            async def async_load(self):
                return None

            def refresh_due(self):
                return False

        previous = manager.TariffCatalogManager
        manager.TariffCatalogManager = Catalog
        try:
            await runtime.async_start()
        finally:
            manager.TariffCatalogManager = previous
        assert runtime._startup_in_progress is False
        assert len(runtime.hass.created_tasks) == 2
        for task in runtime.hass.created_tasks:
            task.cancel()
        await asyncio.gather(*runtime.hass.created_tasks, return_exceptions=True)

    asyncio.run(scenario())


def test_sensor_getter_does_not_run_optimizer():
    start = SENSOR_SOURCE.index("def ai_state_attrs(")
    end = SENSOR_SOURCE.index("def diagnostics_attrs", start)
    getter = SENSOR_SOURCE[start:end]
    assert "_ai_state_snapshot" in getter
    assert "ai_plan_48h" not in getter
    assert "build_plan_bundle" not in getter


def test_sensor_getter_does_not_save_store():
    getters = SENSOR_SOURCE[SENSOR_SOURCE.index("class DeyeManagerSensor"):]
    assert "async_save_ai_data" not in getters
    assert "async_save_learning_history" not in getters
    assert ".async_save(" not in getters


def test_diagnostics_sensor_uses_cached_snapshot():
    start = SENSOR_SOURCE.index("def diagnostics_attrs(")
    end = SENSOR_SOURCE.index("def tariff_attrs", start)
    getter = SENSOR_SOURCE[start:end]
    assert "diagnostics_public_snapshot" in getter
    assert "runtime.diagnostics()" not in getter


def test_tariff_catalog_load_is_not_blocking_in_async_startup():
    assert "_BUNDLED: dict[str, Any] | None = None" in TARIFFS_SOURCE
    module_prefix = TARIFFS_SOURCE[:TARIFFS_SOURCE.index("def bundled_catalog_cached")]
    assert "_BUNDLED = load_bundled_catalog()" not in module_prefix
    assert "async_add_executor_job" in CATALOG_SOURCE
    assert "await asyncio.to_thread(load_bundled_catalog)" in CATALOG_SOURCE
    init = CATALOG_SOURCE[CATALOG_SOURCE.index("    def __init__"):CATALOG_SOURCE.index("    @staticmethod")]
    assert "load_bundled_catalog()" not in init


async def _unloaded_runtime(field):
    runtime = task_runtime()
    task = asyncio.create_task(asyncio.sleep(60))
    setattr(runtime, field, task)
    await runtime.async_unload()
    assert task.cancelled()
    return runtime


def test_unload_cancels_optimizer_debounce_task():
    async def scenario():
        runtime = task_runtime()
        cancelled = []
        runtime.unsub_input_listener = lambda: cancelled.append("input")
        runtime.unsub_timer = lambda: cancelled.append("timer")
        await runtime.async_unload()
        assert cancelled == ["input", "timer"]
        assert runtime.unsub_input_listener is None
        assert runtime.unsub_timer is None

    asyncio.run(scenario())


def test_unload_cleans_ai_save_task():
    runtime = asyncio.run(_unloaded_runtime("_ai_save_task"))
    assert runtime._ai_save_task is None




def test_unload_leaves_no_runtime_background_tasks():
    async def scenario():
        runtime = task_runtime()
        tasks = []
        for field in (
            "_sensor_snapshot_task", "_ai_save_task",
            "_energy_save_task", "_tariff_refresh_task",
        ):
            task = asyncio.create_task(asyncio.sleep(60))
            tasks.append(task)
            setattr(runtime, field, task)
        await runtime.async_unload()
        assert all(task.cancelled() for task in tasks)
        assert all(getattr(runtime, field) is None for field in (
            "_sensor_snapshot_task", "_ai_save_task",
            "_energy_save_task", "_tariff_refresh_task",
        ))

    asyncio.run(scenario())
