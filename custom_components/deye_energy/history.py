"""Versioned history helpers for Deye Energy.

The Home Assistant ``Store`` envelope intentionally stays at version 1 so an
upgrade can always read files written by 0.7.6.  ``schema_version`` below is
the application-level payload version and is migrated without deleting or
renaming historical rows.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import math
from typing import Any

HISTORY_SCHEMA_VERSION = 4
ENERGY_COMPACT_FORMAT_VERSION = 2

ENERGY_COMPACT_FIELDS = (
    "timestamp",
    "interval_seconds",
    "pv_power",
    "load_power",
    "grid_power",
    "battery_power",
    "soc",
    "sell_price",
    "buy_price",
)

UNKNOWN_STATES = {"", "unknown", "unavailable", "none", "nan", "inf", "-inf"}
POWER_UNITS = {"w": 1.0, "kw": 1000.0}
ENERGY_UNITS = {"wh": 0.001, "kwh": 1.0, "mwh": 1000.0}


def finite_float(value: Any) -> float | None:
    """Return a finite number or ``None`` without inventing a zero."""
    if isinstance(value, str) and value.strip().lower() in UNKNOWN_STATES:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def power_w(value: Any, unit: Any) -> float | None:
    """Normalize a power state to watts and reject an incompatible unit."""
    number = finite_float(value)
    factor = POWER_UNITS.get(str(unit or "").strip().lower())
    return number * factor if number is not None and factor is not None else None


def energy_kwh(value: Any, unit: Any) -> float | None:
    """Normalize an energy state to kWh and reject an incompatible unit."""
    number = finite_float(value)
    factor = ENERGY_UNITS.get(str(unit or "").strip().lower())
    return number * factor if number is not None and factor is not None else None


@dataclass(frozen=True)
class CounterUpdate:
    """One monotonic contribution from a daily or total energy counter."""

    delta_kwh: float
    reset_detected: bool
    first_sample: bool
    state: dict[str, Any]


def update_energy_counter(
    previous: dict[str, Any] | None,
    *,
    value_kwh: float,
    day: str,
    timestamp: str,
    total_increasing: bool,
) -> CounterUpdate:
    """Update a counter without turning midnight reset into negative energy.

    For a daily counter, the first valid sample of a new day is a contribution
    since midnight.  For a lifetime ``total_increasing`` counter, a decrease is
    treated as a meter reset and only the new non-negative value contributes.
    """
    current = max(0.0, float(value_kwh))
    old = previous if isinstance(previous, dict) else {}
    old_value = finite_float(old.get("value_kwh"))
    old_day = str(old.get("day") or "")
    first = old_value is None
    reset = False

    if first:
        delta = 0.0 if total_increasing else current
    elif day != old_day and not total_increasing:
        reset = True
        delta = current
    elif current + 1e-9 < old_value:
        reset = True
        delta = current
    else:
        delta = current - old_value

    state = {
        "value_kwh": round(current, 6),
        "day": day,
        "timestamp": timestamp,
        "reset_detected": reset,
        "last_delta_kwh": round(max(0.0, delta), 6),
        "total_increasing": bool(total_increasing),
    }
    return CounterUpdate(max(0.0, delta), reset, first, state)


def migrate_solcast_payload(raw: Any) -> tuple[dict[str, Any], bool]:
    """Add unambiguous forecast snapshot fields to old Solcast rows."""
    data = deepcopy(raw) if isinstance(raw, dict) else {}
    changed = int(finite_float(data.get("schema_version")) or 1) < HISTORY_SCHEMA_VERSION
    history = data.get("history") if isinstance(data.get("history"), list) else []
    migrated: list[dict[str, Any]] = []
    for source in history:
        row = dict(source) if isinstance(source, dict) else {}
        legacy = finite_float(row.get("forecast_kwh"))
        if "initial_forecast_kwh" not in row:
            row["initial_forecast_kwh"] = legacy
            changed = True
        if "latest_forecast_kwh" not in row:
            row["latest_forecast_kwh"] = legacy
            changed = True
        row.setdefault("forecast_snapshots", [])
        migrated.append(row)
    tracking = dict(data.get("tracking")) if isinstance(data.get("tracking"), dict) else {}
    legacy_tracking = finite_float(tracking.get("forecast"))
    if tracking and "initial_forecast_kwh" not in tracking:
        tracking["initial_forecast_kwh"] = legacy_tracking
        changed = True
    if tracking and "latest_forecast_kwh" not in tracking:
        tracking["latest_forecast_kwh"] = legacy_tracking
        changed = True
    if tracking and "forecast_snapshots" not in tracking:
        tracking["forecast_snapshots"] = []
        changed = True
    data.update(
        schema_version=HISTORY_SCHEMA_VERSION,
        history=migrated,
        tracking=tracking,
    )
    return data, changed


def compact_energy_sample(value: Any) -> dict[str, Any]:
    """Return the lossless algorithm/archive subset of a raw energy sample."""
    source = value if isinstance(value, dict) else {}
    return {
        key: source.get(key)
        for key in ENERGY_COMPACT_FIELDS
        if key in source
    }


def migrate_energy_payload(raw: Any) -> tuple[dict[str, Any], bool]:
    """Migrate raw one-minute history to the compact, restart-safe format.

    The last 288 detailed samples remain available separately for the retained
    ai_state sensor. Older details are stored only in the compact archive
    format used by the energy history storage.
    """
    source = raw if isinstance(raw, dict) else {}
    samples = source.get("samples") if isinstance(source.get("samples"), list) else []
    recent_source = (
        source.get("recent_details")
        if isinstance(source.get("recent_details"), list)
        else samples[-288:]
    )
    compact_samples = [
        compact_energy_sample(row)
        for row in samples
        if isinstance(row, dict)
    ]
    recent_details = [
        dict(row)
        for row in recent_source[-288:]
        if isinstance(row, dict)
    ]
    format_version = int(finite_float(source.get("energy_format_version")) or 1)
    changed = (
        int(finite_float(source.get("schema_version")) or 1) < HISTORY_SCHEMA_VERSION
        or format_version < ENERGY_COMPACT_FORMAT_VERSION
        or len(compact_samples) != len(samples)
        or source.get("recent_details") != recent_details
        or source.get("samples") != compact_samples
    )
    return {
        "schema_version": HISTORY_SCHEMA_VERSION,
        "energy_format_version": ENERGY_COMPACT_FORMAT_VERSION,
        "samples": compact_samples,
        "recent_details": recent_details,
        "daily": source.get("daily") if isinstance(source.get("daily"), list) else [],
        "monthly": source.get("monthly") if isinstance(source.get("monthly"), list) else [],
        "counter_state": (
            source.get("counter_state")
            if isinstance(source.get("counter_state"), dict)
            else {}
        ),
        "last_sample": source.get("last_sample"),
    }, changed
