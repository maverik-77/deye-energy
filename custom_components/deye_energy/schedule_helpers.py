"""Neutral deterministic helpers retained after the AI/optimizer removal."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _optional(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def quantize_power_w(
    value_w: Any,
    *,
    step_w: Any,
    minimum_w: Any = 0.0,
    maximum_w: Any = None,
) -> float:
    """Floor automatic power to one physical number-entity lattice."""
    value = _optional(value_w)
    step = _optional(step_w)
    minimum = _optional(minimum_w)
    maximum = _optional(maximum_w)
    if value is None or value <= 0:
        return 0.0
    minimum = max(0.0, minimum if minimum is not None else 0.0)
    if maximum is not None:
        maximum = max(0.0, maximum)
        value = min(value, maximum)
    if value < minimum:
        return 0.0
    if step is None or step <= 0:
        return value
    units = math.floor((value - minimum) / step + 1e-12)
    quantized = minimum + units * step
    if maximum is not None and quantized > maximum:
        units = math.floor((maximum - minimum) / step + 1e-12)
        quantized = minimum + max(0, units) * step
    result = round(max(0.0, quantized), 9)
    return int(round(result)) if math.isclose(result, round(result), abs_tol=1e-9) else result


def _canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _canonical(item) for key, item in sorted(value.items(), key=lambda row: str(row[0]))}
    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]
    if isinstance(value, float):
        return round(value, 8) if math.isfinite(value) else None
    if isinstance(value, (str, int, bool)) or value is None:
        return value
    return str(value)


def snapshot_id(inputs: dict[str, Any]) -> str:
    """Return a stable id for all values that can change a scheduled snapshot."""
    ignored = {"generation_reason", "generated_at", "previous_plan_id"}
    payload = {key: value for key, value in inputs.items() if key not in ignored}
    raw = json.dumps(_canonical(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
