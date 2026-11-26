from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN
from .entity import DeyeEnergyEntity


class DeyeControlSwitch(DeyeEnergyEntity, SwitchEntity):
    """The single master switch for the physical Deye execution layer."""

    def __init__(self, runtime):
        super().__init__(runtime, "control", "Deye control")
        # Home Assistant treats an entity_id assigned before registration as a
        # suggestion.  The stable unique_id still wins for an existing or
        # user-renamed registry entry.
        self.entity_id = "switch.deye_energy_control"

    async def async_added_to_hass(self):
        """Publish the registry-resolved entity_id to the manager contract."""
        self.runtime.control_entity_id = self.entity_id
        self.runtime.notify_update()

    async def async_will_remove_from_hass(self):
        """Drop only this entity's resolved id during unload/reload."""
        if self.runtime.control_entity_id == self.entity_id:
            self.runtime.control_entity_id = None
            self.runtime.notify_update()

    @property
    def is_on(self):
        return bool(self.runtime.control_enabled)

    async def async_turn_on(self, **kwargs: Any):
        await self.runtime.async_enable_control()

    async def async_turn_off(self, **kwargs: Any):
        await self.runtime.async_disable_control()


class DeyeManagerSwitch(DeyeEnergyEntity, SwitchEntity, RestoreEntity):
    def __init__(self, runtime, key, name, attr):
        super().__init__(runtime, key, name)
        self.attr = attr

    @property
    def is_on(self):
        return bool(getattr(self.runtime, self.attr))

    async def async_added_to_hass(self):
        if self.attr == "charge_profile_grid_enabled" and self.runtime._charge_profile_loaded_from_store:
            return
        if (last_state := await self.async_get_last_state()) is not None:
            setattr(self.runtime, self.attr, last_state.state == "on")

    async def async_turn_on(self, **kwargs: Any):
        if self.attr == "emergency_stop":
            await self.runtime.async_emergency_stop()
            return
        if self.attr == "charge_profile_grid_enabled":
            await self.runtime.async_save_charge_profile({
                "target_soc": self.runtime.charge_profile_target_soc,
                "grid_charge_enabled": True,
            })
            return
        setattr(self.runtime, self.attr, True)
        self.runtime.mark_config_saved()
        self.runtime.notify_update()
        await self.runtime.async_tick()

    async def async_turn_off(self, **kwargs: Any):
        if self.attr == "charge_profile_grid_enabled":
            await self.runtime.async_save_charge_profile({
                "target_soc": self.runtime.charge_profile_target_soc,
                "grid_charge_enabled": False,
            })
            return
        setattr(self.runtime, self.attr, False)
        self.runtime.mark_config_saved()
        self.runtime.notify_update()
        await self.runtime.async_tick()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback):
    runtime = hass.data[DOMAIN][entry.entry_id]
    entities = [
        DeyeControlSwitch(runtime),
        DeyeManagerSwitch(runtime, "scheduler_enabled", "Scheduler", "scheduler_enabled"),
        DeyeManagerSwitch(runtime, "soc_guard_enabled", "SOC guard", "soc_guard_enabled"),
        DeyeManagerSwitch(runtime, "price_guard_enabled", "Price guard", "price_guard_enabled"),
        DeyeManagerSwitch(runtime, "emergency_stop", "Emergency stop", "emergency_stop"),
        DeyeManagerSwitch(runtime, "charge_profile_grid_enabled", "Charge profile grid charge", "charge_profile_grid_enabled"),
    ]
    async_add_entities(entities)
