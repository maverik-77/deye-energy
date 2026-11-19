"""Test-only adapter: let hourly schedule keys address both half-hour slots.

The schedule is stored in 30-minute slots.  Many regression tests were written
for one-hour slots (``runtime.slots["05_06"]``).  With this adapter an hourly
key returns a proxy that reads the first half-hour slot and writes to both, so
those tests keep checking the same behaviour.  Production code never uses it.
"""

from __future__ import annotations

from typing import Any


class HourProxy:
    def __init__(self, slots: list[Any]) -> None:
        object.__setattr__(self, "_slots", slots)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._slots[0], name)

    def __setattr__(self, name: str, value: Any) -> None:
        for slot in self._slots:
            setattr(slot, name, value)


class SlotDict(dict):
    def __init__(self, value: Any, const: Any) -> None:
        super().__init__(value)
        self._const = const

    def _halves(self, key: Any) -> list[str]:
        keys = self._const.slots_for_key(str(key))
        return [k for k in keys if dict.__contains__(self, k)]

    def __getitem__(self, key: Any) -> Any:
        if dict.__contains__(self, key):
            return dict.__getitem__(self, key)
        halves = self._halves(key)
        if len(halves) > 1:
            return HourProxy([dict.__getitem__(self, k) for k in halves])
        raise KeyError(key)

    def hourly(self) -> list[Any]:
        """One proxy per local hour (index == hour), reading/writing both halves."""
        return [self[key] for key in self._const.HOUR_SLOT_KEYS]

    def get(self, key: Any, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default


def install(manager: Any, const: Any) -> None:
    def getter(self: Any) -> Any:
        return self.__dict__.get("_slots_store", SlotDict({}, const))

    def setter(self: Any, value: Any) -> None:
        self.__dict__["_slots_store"] = SlotDict(value, const)

    manager.DeyeEnergyRuntime.slots = property(getter, setter)
