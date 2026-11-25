"""Behavior-preserving performance regressions for Stage 5G.3B.1."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import importlib.util
from pathlib import Path
import sys
import types

import pytest

from test_manager_logic import FakeState, const, make_runtime, manager
from test_stage5g1_lifecycle import task_runtime


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "deye_energy"


def _load_sensor_module():
    """Load the real sensor helpers on top of the lightweight HA test stubs."""
    sensor_component = types.ModuleType("homeassistant.components.sensor")
    sensor_component.SensorEntity = type("SensorEntity", (), {})
    sensor_component.SensorDeviceClass = types.SimpleNamespace(
        BATTERY="battery",
        POWER="power",
        ENERGY="energy",
        CURRENT="current",
        VOLTAGE="voltage",
        TEMPERATURE="temperature",
        FREQUENCY="frequency",
    )
    ha_const = types.ModuleType("homeassistant.const")
    ha_const.MATCH_ALL = "*"
    previous_sensor = sys.modules.get("homeassistant.components.sensor")
    previous_const = sys.modules.get("homeassistant.const")
    module_name = "custom_components.deye_energy.sensor_stage5g3b1"
    try:
        sys.modules["homeassistant.components.sensor"] = sensor_component
        sys.modules["homeassistant.const"] = ha_const
        spec = importlib.util.spec_from_file_location(module_name, PACKAGE / "sensor.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module
    finally:
        if previous_sensor is None:
            sys.modules.pop("homeassistant.components.sensor", None)
        else:
            sys.modules["homeassistant.components.sensor"] = previous_sensor
        if previous_const is None:
            sys.modules.pop("homeassistant.const", None)
        else:
            sys.modules["homeassistant.const"] = previous_const


sensor_module = _load_sensor_module()
















def test_stage5g3b1_does_not_change_full_publish_contract():
    runtime = make_runtime()

    class Entity:
        def __init__(self, key):
            self._deye_manager_key = key
            self.hass = object()
            self.writes = 0

        def async_write_ha_state(self):
            self.writes += 1

    runtime.request_sensor_snapshot_refresh = lambda *_args, **_kwargs: None
    runtime.entities = [Entity("manager_status"), Entity("ai_state"), Entity("diagnostics")]

    runtime.notify_update()

    assert [entity.writes for entity in runtime.entities] == [1, 1, 1]
