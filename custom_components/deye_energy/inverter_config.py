"""Field catalogue for the inverter configuration settings tab.

The catalog mirrors the grouping and labels shown by the Solar Assistant
configuration page.  Most fields are backed directly by Home Assistant
``number``, ``select`` or ``switch`` entities published by an inverter
integration.  Fields without a reliable entity remain visible but read-only;
the service layer refuses to write them.

Battery current limits are owned exclusively by this module.  The scheduler,
profiles, optimizer and manual control paths must not use these entity IDs as
write targets.
"""

from __future__ import annotations

from dataclasses import dataclass

from .const import (
    CONF_CHARGE_CURRENT_NUMBER,
    CONF_DISCHARGE_CURRENT_NUMBER,
    CONF_GRID_CHARGE_CURRENT_NUMBER,
    CONF_MAX_SELL_POWER_NUMBER,
    CONF_WORK_MODE_SELECT,
    DEFAULT_CHARGE_CURRENT,
    DEFAULT_DISCHARGE_CURRENT,
    DEFAULT_GRID_CHARGE_CURRENT,
    DEFAULT_MAX_SELL_POWER,
    DEFAULT_WORK_MODE_SELECT,
)

INVERTER_CONFIG_GROUPS: tuple[tuple[str, str], ...] = (
    ("specification", "Specification"),
    ("grid", "Grid"),
    ("battery_charging", "Battery charging"),
    ("work_mode", "Work mode"),
    ("work_mode_detail", "Work mode detail"),
)

INVERTER_CONFIG_GROUP_KEYS: tuple[str, ...] = tuple(
    key for key, _label in INVERTER_CONFIG_GROUPS
)


@dataclass(frozen=True)
class InverterConfigField:
    """A single field shown in the inverter configuration tab."""

    key: str
    label: str
    group: str
    entity_id: str | None = None
    config_key: str | None = None
    writable: bool = True
    unit: str | None = None
    kind: str = "auto"
    static_value: str | None = None


INVERTER_CONFIG_FIELDS: tuple[InverterConfigField, ...] = (
    # Specification is informational in Solar Assistant as well.
    InverterConfigField(
        "driver", "Driver", "specification", writable=False,
        kind="static", static_value="Deye/SunSynk/Sol-Ark",
    ),
    InverterConfigField("serial_number", "Serial number", "specification", writable=False, kind="static"),
    InverterConfigField("protocol_version", "Protocol version", "specification", writable=False, kind="static"),
    InverterConfigField("mcu_version", "MCU version", "specification", writable=False, kind="static"),
    InverterConfigField("comm_version", "COMM version", "specification", writable=False, kind="static"),
    InverterConfigField(
        "max_ac_output_power", "Max AC output power", "specification",
        entity_id="sensor.deye_rated_power", writable=False, unit="W", kind="sensor",
    ),
    InverterConfigField("mppt_connections", "MPPT connections", "specification", writable=False, kind="static"),
    InverterConfigField("parallel", "Parallel", "specification", writable=False, kind="static"),
    InverterConfigField("modbus_number", "Modbus number", "specification", writable=False, kind="static"),
    # Grid.
    InverterConfigField("grid_type", "Grid type", "grid", writable=False),
    InverterConfigField(
        "grid_voltage", "Grid voltage", "grid",
        entity_id="sensor.deye_grid_voltage", writable=False, unit="V", kind="sensor",
    ),
    InverterConfigField(
        "grid_frequency", "Grid frequency", "grid",
        entity_id="sensor.deye_grid_frequency", writable=False, unit="Hz", kind="sensor",
    ),
    InverterConfigField(
        "grid_peak_shaving_power", "Grid peak shaving power", "grid",
        entity_id="number.deye_grid_peak_shaving_power", unit="W",
    ),
    # Battery charging.  The three direct-only current fields are here.
    InverterConfigField(
        "max_discharge_current", "Max discharge current", "battery_charging",
        entity_id=DEFAULT_DISCHARGE_CURRENT, config_key=CONF_DISCHARGE_CURRENT_NUMBER, unit="A",
    ),
    InverterConfigField(
        "max_charge_current", "Max charge current", "battery_charging",
        entity_id=DEFAULT_CHARGE_CURRENT, config_key=CONF_CHARGE_CURRENT_NUMBER, unit="A",
    ),
    InverterConfigField(
        "max_grid_charge_current", "Max grid charge current", "battery_charging",
        entity_id=DEFAULT_GRID_CHARGE_CURRENT, config_key=CONF_GRID_CHARGE_CURRENT_NUMBER, unit="A",
    ),
    # Work mode.
    InverterConfigField(
        "stop_battery_discharge_capacity", "Stop battery discharge capacity", "work_mode",
        entity_id="number.deye_battery_shutdown_capacity", unit="%",
    ),
    InverterConfigField(
        "start_battery_discharge_capacity", "Start battery discharge capacity", "work_mode",
        entity_id="number.deye_battery_restart_capacity", unit="%",
    ),
    # Work mode detail.
    InverterConfigField(
        "work_mode", "Work mode", "work_mode_detail",
        entity_id=DEFAULT_WORK_MODE_SELECT, config_key=CONF_WORK_MODE_SELECT,
    ),
    InverterConfigField(
        "max_sell_power", "Max sell power", "work_mode_detail",
        entity_id=DEFAULT_MAX_SELL_POWER, config_key=CONF_MAX_SELL_POWER_NUMBER, unit="W",
    ),
    InverterConfigField(
        "max_solar_power", "Max solar power", "work_mode_detail",
        entity_id="number.deye_max_solar_power", unit="W",
    ),
    InverterConfigField(
        "grid_trickle_feed", "Grid trickle feed", "work_mode_detail",
        entity_id="number.deye_grid_trickle_feed_power", unit="W",
    ),
)

FIELDS_BY_KEY: dict[str, InverterConfigField] = {
    field.key: field for field in INVERTER_CONFIG_FIELDS
}


def resolve_entity_id(field: InverterConfigField, data: dict) -> str | None:
    """Return the mapped entity for a field, preferring integration config."""
    if field.config_key:
        configured = data.get(field.config_key)
        if isinstance(configured, str) and configured.strip():
            return configured.strip()
    return field.entity_id


def fields_for_group(group: str) -> tuple[InverterConfigField, ...]:
    return tuple(field for field in INVERTER_CONFIG_FIELDS if field.group == group)


def group_label(group: str) -> str:
    for key, label in INVERTER_CONFIG_GROUPS:
        if key == group:
            return label
    raise KeyError(group)
