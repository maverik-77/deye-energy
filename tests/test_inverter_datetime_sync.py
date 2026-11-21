"""Inverter datetime status, manual sync, and 6-hour drift sync."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from test_manager_logic import FakeState, PACKAGE, make_runtime, manager


class InverterDatetimeSyncTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._orig_ha_now = manager.ha_now

    def tearDown(self):
        manager.ha_now = self._orig_ha_now

    @staticmethod
    def _set_time(y=2026, m=11, d=21, hh=10, mm=0, ss=10):
        manager.ha_now = lambda: datetime(y, m, d, hh, mm, ss, tzinfo=timezone.utc)

    @staticmethod
    def _add_datetime_entity(runtime, value="2026-11-21 10:00:10", entity_id="text.deye_date_time"):
        runtime.hass.states.values[entity_id] = FakeState(value, {})

    def test_read_inverter_configuration_includes_datetime_status(self):
        self._set_time()
        runtime = make_runtime()
        self._add_datetime_entity(runtime, "2026-11-21 10:00:10")
        report = runtime.read_inverter_configuration()
        self.assertIn("groups", report)
        status = report["datetime_status"]
        self.assertEqual(status["entity_id"], "text.deye_date_time")
        self.assertEqual(status["ha_time"], "2026-11-21 10:00:10")
        self.assertEqual(status["inverter_time"], "2026-11-21 10:00:10")
        self.assertTrue(status["in_sync"])
        self.assertEqual(status["deviation_seconds"], 0)

    async def test_manual_sync_writes_ha_time_to_datetime_entity(self):
        self._set_time(hh=10, mm=5, ss=7)
        runtime = make_runtime()
        self._add_datetime_entity(runtime, "2026-11-21 09:00:00")
        result = await runtime.async_sync_inverter_datetime(reason="manual")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ha_time"], "2026-11-21 10:05:07")
        calls = runtime.hass.services.calls
        self.assertTrue(any(
            c[0] == "text" and c[1] == "set_value"
            and c[2].get("entity_id") == "text.deye_date_time"
            and c[2].get("value") == "2026-11-21 10:05:07"
            for c in calls
        ))

    async def test_six_hour_check_skips_when_not_due(self):
        self._set_time()
        runtime = make_runtime()
        self._add_datetime_entity(runtime, "2026-11-21 10:00:10")
        runtime._inverter_datetime_last_check = manager.ha_now() - timedelta(hours=5, minutes=59)
        result = await runtime.async_check_inverter_datetime_sync()
        self.assertEqual(result["status"], "skipped")
        self.assertFalse(any(c[1] == "set_value" for c in runtime.hass.services.calls))

    async def test_six_hour_check_syncs_on_any_deviation(self):
        self._set_time(hh=10, mm=0, ss=10)
        runtime = make_runtime()
        self._add_datetime_entity(runtime, "2026-11-21 10:00:09")  # 1 second deviation
        runtime._inverter_datetime_last_check = manager.ha_now() - timedelta(hours=6, minutes=1)
        result = await runtime.async_check_inverter_datetime_sync()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(any(
            c[0] == "text" and c[1] == "set_value"
            and c[2].get("value") == "2026-11-21 10:00:10"
            for c in runtime.hass.services.calls
        ))

    async def test_sync_fails_when_entity_unavailable(self):
        self._set_time()
        runtime = make_runtime()
        self._add_datetime_entity(runtime, "unavailable")
        result = await runtime.async_sync_inverter_datetime(reason="manual")
        self.assertEqual(result["status"], "failed")
        self.assertIn("unavailable", result["error"].lower())

    async def test_sync_fails_when_entity_missing(self):
        self._set_time()
        runtime = make_runtime()
        result = await runtime.async_sync_inverter_datetime(reason="manual")
        self.assertEqual(result["status"], "failed")
        self.assertIn("not found", result["error"].lower())
