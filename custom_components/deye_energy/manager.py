from __future__ import annotations

import asyncio
import contextvars
from contextlib import asynccontextmanager, contextmanager
from copy import deepcopy
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
import logging
import math
import time
from typing import Any, Callable
import uuid

_LOGGER = logging.getLogger(__name__)

# A daily forecast may legitimately be published only a few times per day.
# Thirty hours also covers the longest local DST day without accepting an
# entity that has not refreshed since the preceding local day.
_SOLCAST_DAILY_FORECAST_STALE_SECONDS = 30 * 60 * 60
_SOLCAST_TRACKING_STALE_SECONDS = 30 * 60

# A dropped inverter connection leaves every mapped Deye control entity
# unavailable. Pause the rule engine only after a short stable outage and resume
# only after a short stable recovery, so a marginal link cannot flap the loop.
# MQTT-discovered number/select/switch entities publish only when their value
# changes, so an unchanged control entity has no fresh last_reported. Freshness
# is therefore checked only on measurement sensors; physical write confirmation
# remains the final safety net for the control entities.
_INVERTER_LINK_STALE_SECONDS = 600
_INVERTER_LINK_UNAVAILABLE_TICKS = 2
_INVERTER_LINK_AVAILABLE_TICKS = 2

TRIGGER_LOG_RETENTION_DAYS = 30
TRIGGER_LOG_MAX_ENTRIES = 5000

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import (
    async_track_point_in_time,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util.dt import now as ha_now

from . import entity_map
from .const import (
    ENERGY_STATUS_DISPLAY_SCHEMA_VERSION,
    ENERGY_STATUS_ROLES,
    ENERGY_STATUS_ROLE_KEYS,
    CONF_BATTERY_BMS_VOLTAGE_SENSOR,
    CONF_BATTERY_CURRENT_SENSOR,
    CONF_BATTERY_SOH_SENSOR,
    CONF_BATTERY_SOC_SENSOR,
    CONF_BATTERY_POSITIVE_IS_DISCHARGE,
    CONF_BATTERY_TEMPERATURE_SENSOR,
    CONF_BUY_PRICE_TODAY_SENSOR,
    CONF_BUY_PRICE_TOMORROW_SENSOR,
    CONF_BUY_SELLER_ID,
    CONF_BUY_SELLER_TARIFF_ID,
    CONF_DAILY_BATTERY_CHARGE_SENSOR,
    CONF_DAILY_BATTERY_DISCHARGE_SENSOR,
    CONF_DAILY_ENERGY_BOUGHT_SENSOR,
    CONF_DAILY_ENERGY_SOLD_SENSOR,
    CONF_DAILY_LOAD_CONSUMPTION_SENSOR,
    CONF_DAILY_PV_PRODUCTION_SENSOR,
    CONF_GRID_L1_POWER_SENSOR,
    CONF_GRID_L1_VOLTAGE_SENSOR,
    CONF_GRID_L2_POWER_SENSOR,
    CONF_GRID_L2_VOLTAGE_SENSOR,
    CONF_GRID_L3_POWER_SENSOR,
    CONF_GRID_L3_VOLTAGE_SENSOR,
    CONF_GRID_POWER_SENSOR,
    CONF_GRID_POSITIVE_IS_IMPORT,
    CONF_INVERTER_AC_TEMPERATURE_SENSOR,
    CONF_INVERTER_DEVICE_ID,
    CONF_INVERTER_DATETIME_ENTITY,
    CONF_INVERTER_MAX_POWER_W,
    CONF_INVERTER_PROVIDER,
    CONF_LOAD_FREQUENCY_SENSOR,
    CONF_LOAD_L1_POWER_SENSOR,
    CONF_LOAD_L2_POWER_SENSOR,
    CONF_LOAD_L3_POWER_SENSOR,
    CONF_LOAD_POWER_SENSOR,
    CONF_BATTERY_POWER_SENSOR,
    CONF_MAX_SELL_POWER_NUMBER,
    CONF_PV1_CURRENT_SENSOR,
    CONF_PV1_POWER_SENSOR,
    CONF_PV1_VOLTAGE_SENSOR,
    CONF_PV2_CURRENT_SENSOR,
    CONF_PV2_POWER_SENSOR,
    CONF_PV2_VOLTAGE_SENSOR,
    CONF_PV3_POWER_SENSOR,
    CONF_PV_POWER_SENSOR,
    CONF_PRICE_SENSOR,
    CONF_SELL_PRICE_TOMORROW_SENSOR,
    CONF_SOLCAST_CURRENT_POWER_SENSOR,
    CONF_SOLCAST_FORECAST_DAY_3_SENSOR,
    CONF_SOLCAST_FORECAST_DAY_4_SENSOR,
    CONF_SOLCAST_FORECAST_DAY_5_SENSOR,
    CONF_SOLCAST_FORECAST_DAY_6_SENSOR,
    CONF_SOLCAST_FORECAST_DAY_7_SENSOR,
    CONF_SOLCAST_FORECAST_TODAY_SENSOR,
    CONF_SOLCAST_FORECAST_TOMORROW_SENSOR,
    CONF_SOLCAST_PEAK_POWER_TODAY_SENSOR,
    CONF_SOLCAST_PEAK_TIME_TODAY_SENSOR,
    CONF_SOLCAST_REMAINING_TODAY_SENSOR,
    CONF_WORK_MODE_SELECT,
    CONF_WORK_MODE_AUX_ENTITY,
    CONF_WEATHER_ENTITY,
    CONF_PRICE_SOURCE,
    CONF_DSO_PROVIDER,
    CONF_TARIFF_PLAN,
    CONF_DISTRIBUTION_PEAK_RATE,
    CONF_DISTRIBUTION_OFFPEAK_RATE,
    CONF_CUSTOM_OFFPEAK_WINDOWS,
    CONF_TARIFF_MODE,
    CONF_PRICE_INCLUDES_DISTRIBUTION,
    CONF_BUY_PRICE_CONTRACT,
    CONF_SELL_PRICE_CONTRACT,
    CONF_TARIFF_CATALOG_URL,
    CONTROL_MODES,
    DOMAIN,
    MANAGER_MODES,
    MIRRORED_CHARGE_PROFILE_GRID_ENABLED,
    MIRRORED_CHARGE_PROFILE_TARGET_SOC,
    MIRRORED_MAX_SELL_POWER_W,
    MODE_SELLING_FIRST,
    MODE_CHARGE,
    MODE_NORMAL_OPERATION,
    MODE_ZERO_EXPORT,
    MODE_ZERO_EXPORT_CT,
    normalize_manager_mode,
    PHYSICAL_NORMAL_MODES,
    SCHEDULE_SCHEMA_VERSION,
    SLOTS,
    HOUR_SLOTS,
    SLOT_INDEX,
    SLOT_KEYS,
    SLOTS_PER_DAY,
    SLOT_MINUTES,
    MINUTES_PER_DAY,
    hour_key,
    hour_of_slot,
    slot_key_at_minute,
    slot_end_minute,
    slot_start_minute,
    slots_for_key,
    SLOT_MODES,
    WORK_MODES,
    DEFAULT_BATTERY_SOC,
    DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR,
    DEFAULT_BATTERY_CURRENT_SENSOR,
    DEFAULT_BATTERY_SOH_SENSOR,
    DEFAULT_BATTERY_TEMPERATURE_SENSOR,
    DEFAULT_DAILY_BATTERY_CHARGE_SENSOR,
    DEFAULT_DAILY_BATTERY_DISCHARGE_SENSOR,
    DEFAULT_DAILY_ENERGY_BOUGHT_SENSOR,
    DEFAULT_DAILY_ENERGY_SOLD_SENSOR,
    DEFAULT_DAILY_LOAD_CONSUMPTION_SENSOR,
    DEFAULT_DAILY_PV_PRODUCTION_SENSOR,
    DEFAULT_GRID_L1_POWER_SENSOR,
    DEFAULT_GRID_L1_VOLTAGE_SENSOR,
    DEFAULT_GRID_L2_POWER_SENSOR,
    DEFAULT_GRID_L2_VOLTAGE_SENSOR,
    DEFAULT_GRID_L3_POWER_SENSOR,
    DEFAULT_GRID_L3_VOLTAGE_SENSOR,
    DEFAULT_GRID_POWER_SENSOR,
    DEFAULT_INVERTER_AC_TEMPERATURE_SENSOR,
    DEFAULT_INVERTER_MAX_POWER_W,
    DEFAULT_INVERTER_PROVIDER,
    DEFAULT_LOAD_FREQUENCY_SENSOR,
    DEFAULT_LOAD_L1_POWER_SENSOR,
    DEFAULT_LOAD_L2_POWER_SENSOR,
    DEFAULT_LOAD_L3_POWER_SENSOR,
    DEFAULT_LOAD_POWER_SENSOR,
    DEFAULT_BATTERY_POWER_SENSOR,
    DEFAULT_PV1_CURRENT_SENSOR,
    DEFAULT_PV1_POWER_SENSOR,
    DEFAULT_PV1_VOLTAGE_SENSOR,
    DEFAULT_PV2_CURRENT_SENSOR,
    DEFAULT_PV2_POWER_SENSOR,
    DEFAULT_PV2_VOLTAGE_SENSOR,
    DEFAULT_PV3_POWER_SENSOR,
    DEFAULT_PV_POWER_SENSOR,
    DEFAULT_PRICE_SENSOR,
    DEFAULT_SOLCAST_CURRENT_POWER_SENSOR,
    DEFAULT_SOLCAST_FORECAST_DAY_3_SENSOR,
    DEFAULT_SOLCAST_FORECAST_DAY_4_SENSOR,
    DEFAULT_SOLCAST_FORECAST_DAY_5_SENSOR,
    DEFAULT_SOLCAST_FORECAST_DAY_6_SENSOR,
    DEFAULT_SOLCAST_FORECAST_DAY_7_SENSOR,
    DEFAULT_SOLCAST_FORECAST_TODAY_SENSOR,
    DEFAULT_SOLCAST_FORECAST_TOMORROW_SENSOR,
    DEFAULT_SOLCAST_PEAK_POWER_TODAY_SENSOR,
    DEFAULT_SOLCAST_PEAK_TIME_TODAY_SENSOR,
    DEFAULT_SOLCAST_REMAINING_TODAY_SENSOR,
    DEFAULT_WEATHER_ENTITY,
    DEFAULT_DSO_PROVIDER,
    DEFAULT_TARIFF_PLAN,
    DEFAULT_DISTRIBUTION_PEAK_RATE,
    DEFAULT_DISTRIBUTION_OFFPEAK_RATE,
    DEFAULT_CUSTOM_OFFPEAK_WINDOWS,
    DEFAULT_TARIFF_MODE,
    DEFAULT_PRICE_INCLUDES_DISTRIBUTION,
    DEFAULT_TARIFF_CATALOG_URL,
    DEFAULT_BUY_SELLER_ID,
    DEFAULT_BUY_SELLER_TARIFF_ID,
    DEFAULT_GRID_POSITIVE_IS_IMPORT,
    DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE,
    DEFAULT_MAX_SELL_POWER,
    DEFAULT_WORK_MODE_SELECT,
    PROVIDER_LEWA_REKA,
    PROVIDER_SOLARMAN,
    PROVIDER_SUNSYNK,
    conf_tou_entity,
)
from .price_sources import (
    SUPPORTED_ECONOMIC_ROLES,
    build_canonical_direction,
    canonical_maps,
    detect_source_adapter,
    effective_contract_for_day,
    price_mapping_fingerprint,
    rebuild_price_contract,
    resolve_contract_schemas,
)
from .inverter_config import (
    FIELDS_BY_KEY,
    INVERTER_CONFIG_GROUPS,
    INVERTER_CONFIG_GROUP_KEYS,
    fields_for_group,
    resolve_entity_id as resolve_inverter_config_entity_id,
)
from .inverter_provider import (
    boolean_state as provider_boolean_state,
    boolean_option as provider_boolean_option,
    convert_w_to_native_unit,
    detect_entity_max_power_w,
    format_time_option,
    logical_mode_matches,
    logical_mode_option,
    normal_profile_mode_metadata,
    number_entity_range,
    NumberEntityRange,
    operation_for_entity,
    profile as provider_profile,
    provider_tou_field_capabilities,
    provider_key,
    resolve_select_option,
    select_option_matches,
    state_matches_boolean,
)
from .tariff_catalog import TariffCatalogManager
from .performance import RuntimePerformanceMonitor
from .schedule_helpers import quantize_power_w, snapshot_id
from .history import (
    ENERGY_COMPACT_FORMAT_VERSION,
    HISTORY_SCHEMA_VERSION,
    compact_energy_sample,
    energy_kwh,
    finite_float,
    migrate_energy_payload,
    migrate_solcast_payload,
    power_w,
    update_energy_counter,
)
from .telemetry import channel_summary, new_channel, record_channel, split_directional_power
from .tariffs import (
    available_tariffs,
    catalog_hourly_profile,
    get_tariff,
    hourly_tariff_profile,
    parse_windows,
    resolve_seller_tariff,
    seller_catalog_canonical_buy,
    seller_catalog_options,
    seller_support_entry,
    seller_tariff_options,
    tariff_availability,
    tariff_zone,
)


_CONTROL_TRANSACTION_ID: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "control_transaction_id", default=None
)

FUTURE_PLAN_INTENT_SCHEMA_VERSION = 2
FUTURE_PLAN_LIFECYCLE_SCHEMA_VERSION = 1


class ControlDisabledError(Exception):
    """Raised when a physical write is attempted while control is disabled."""






@dataclass
class SlotSettings:
    key: str
    label: str
    enabled: bool = False
    mode: str = MODE_NORMAL_OPERATION
    # Physical Deye work mode used only by logical Normal Operation slots.
    # It is intentionally independent from ``mode`` so no UI/logical label can
    # ever be sent to the inverter select entity.
    physical_work_mode: str | None = None
    sell_power: float = 0
    # Per-slot permission for physical Deye TOU Grid Charge.  Current limits are
    # not part of the schedule; they are direct inverter configuration only.
    charge_enabled: bool = False
    # Manager safety threshold that stops Selling First when the battery SOC
    # reaches this value.  It is a logical guard only and must never be written
    # to the physical Deye Time Of Use SOC.
    minimum_sell_soc: float = 0
    # Physical Deye Time Of Use SOC for this logical slot.  It is deliberately
    # unknown until restored from the user's prior configuration or explicitly
    # confirmed by the user.  All logical modes (Normal, Charge, Selling First
    # and disabled) use this value as the physical SOC written to the inverter.
    tou_soc: float | None = None
    min_sell_price: float = 0


@dataclass
class TouMappingSlot:
    """One physical Deye Time Of Use slot.

    The model intentionally holds only the fields the inverter can store per
    range: start/end time, SOC and the hourly Grid Charge permission.  Manager
    logical modes, sell power, prices and physical work mode variants
    are runtime overlays and are never persisted here.
    """

    index: int
    # Minutes after midnight.  ``end`` is 0 for a range that ends at midnight.
    start: int
    end: int
    soc: float
    grid_charge: bool
    # Indices (0..SLOTS_PER_DAY-1) of the schedule slots this range covers.
    source_slots: list[int] = field(default_factory=list)
    provider_fields: dict[str, Any] = field(default_factory=dict)


@dataclass
class TouMapping:
    """A complete 24-hour physical Deye TOU mapping."""

    slots: list[TouMappingSlot] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.slots)


@dataclass
class DeyeEnergyRuntime:
    hass: HomeAssistant
    entry_id: str
    data: dict[str, Any]
    scheduler_enabled: bool = False
    soc_guard_enabled: bool = True
    price_guard_enabled: bool = False
    emergency_stop: bool = False
    control_mode: str = "Schedule"
    min_sell_soc: float = 30
    price_sell_threshold: float = 0
    manual_sell_power: float = 3000
    default_work_mode: str = MODE_NORMAL_OPERATION
    default_physical_work_mode: str | None = None
    default_sell_power: float = MIRRORED_MAX_SELL_POWER_W
    # Separate values used exclusively by planned Charge slots.
    charge_profile_target_soc: float = MIRRORED_CHARGE_PROFILE_TARGET_SOC
    # The only permission to enable Deye Grid Charge for Charge slots.
    charge_profile_grid_enabled: bool = MIRRORED_CHARGE_PROFILE_GRID_ENABLED
    # User-owned Normal Operation template.  The physical mode is mandatory
    # and accepts only the two zero-export variants supported by Deye.
    normal_profile_physical_work_mode: str | None = None
    normal_profile_sell_power: float = 0
    normal_profile_tou_soc: float | None = None
    _normal_profile_loaded_from_store: bool = False
    schedule_schema_version: int = 0
    # UI-only manual schedule: variable time rows kept separate from the
    # 48-slot work schedule.  Activation selects these rows as the scheduler's
    # trigger source without copying them into, or restoring, the work schedule.
    manual_schedule: dict[str, Any] = field(default_factory=dict)
    # Card-controlled mapping/visibility overrides for the Energy status page.
    # Empty means "use the card's existing mapping, show every reading".
    energy_status_display: dict[str, Any] = field(default_factory=dict)
    # Cached per-slot overlay built from the active manual rows.  Work-slot
    # values are read live, so non-manual fields can never go stale.
    _manual_effective_rows: dict[str, dict[str, Any]] = field(default_factory=dict)
    _restored_slot_mode_keys: set[str] = field(default_factory=set)
    # Track which per-slot helper entities have been restored so the 5A.1
    # migration can safely resolve a missing selling slot tou_soc.
    _restored_slot_tou_soc_keys: set[str] = field(default_factory=set)
    _restored_slot_minimum_sell_soc_keys: set[str] = field(default_factory=set)
    _tou_soc_migration_done: bool = False
    _install_init_battery_restart_capacity_done: bool = False
    # Stage 5B: physical Deye Time Of Use transaction state.
    tou_write_pending: bool = False
    tou_operation_status: str = "idle"
    # Stable Stage 5C contract.  ``tou_operation_status`` is retained for
    # compatibility with the Stage 5B diagnostics and tests.
    tou_contract_status: str = "idle"
    tou_operation_started_at: datetime | None = None
    tou_last_error: str = ""
    tou_transaction_log: list[dict[str, Any]] = field(default_factory=list)
    trigger_log: list[dict[str, Any]] = field(default_factory=list)
    reverse_sync_status: str = "idle"
    reverse_sync_last_error: str = ""
    reverse_sync_changed_hours: list[str] = field(default_factory=list)
    reverse_sync_round_trip_ok: bool | None = None
    _inverter_datetime_last_check: datetime | None = None
    _inverter_datetime_last_sync: datetime | None = None
    _inverter_datetime_last_error: str = ""
    _inverter_datetime_last_deviation_seconds: float | None = None
    _tou_transaction_lock_obj: asyncio.Lock | None = None
    _tou_pending_owner: object | None = None
    _tou_confirmation_event_obj: asyncio.Event | None = None
    _tou_confirmation_unsub: Callable[[], None] | None = None
    sold_energy_today: float = 0
    sold_value_today: float = 0
    sold_energy_current_hour: float = 0
    sold_value_current_hour: float = 0
    _energy_last_update: datetime | None = None
    _energy_day: str = ""
    _stats_store: Store | None = None
    _ai_store: Store | None = None
    _trigger_log_store: Store | None = None
    _trigger_log_dirty: bool = False
    _charge_profile_loaded_from_store: bool = False
    _default_profile_loaded_from_store: bool = False
    _solcast_store: Store | None = None
    _ai_save_task: Any = None
    _ai_save_dirty: bool = False
    _ai_last_saved_fingerprint: str = ""
    _energy_save_task: Any = None
    _energy_save_dirty: bool = False
    _energy_revision: int = 0
    _energy_saved_revision: int = -1
    _energy_recent_details: list[dict[str, Any]] = field(default_factory=list)
    _energy_legacy_payload_backup: dict[str, Any] | None = None
    _startup_in_progress: bool = False
    _platform_setup_in_progress: bool = False
    _platform_publish_pending: bool = False
    _unloading: bool = False
    _samples_store: Store | None = None
    _tariff_catalog_manager: TariffCatalogManager | None = None
    _tariff_refresh_task: Any = None
    _price_adapter_cache: dict[str, dict[str, Any]] = field(default_factory=dict)
    _price_resolution_cache: dict[str, dict[str, Any]] = field(default_factory=dict)
    _canonical_price_snapshot: dict[str, Any] = field(default_factory=dict)
    _stats_dirty: bool = False
    sales_stats: dict[str, Any] = field(default_factory=dict)
    _sensor_snapshot_task: Any = None
    _sensor_snapshot_pending: bool = False
    _sensor_snapshot_requested_keys: set[str] = field(default_factory=set)
    _ai_state_snapshot: dict[str, Any] = field(default_factory=dict)
    _diagnostics_snapshot: dict[str, Any] = field(default_factory=dict)
    _ai_state_snapshot_id: str = ""
    _diagnostics_snapshot_id: str = ""
    runtime_metrics: dict[str, Any] = field(default_factory=lambda: {
        "snapshot_publish_count": 0,
        "notify_update_count": 0,
        "self_entity_event_ignored": 0,
        "external_input_event_count": 0,
        "skipped_inverter_unavailable": 0,
        "inverter_unavailable_reason": "",
    })
    # Stage 5G.4J.8C: lightweight, persisted per-slot schedule generation and
    # ownership.  These fields deliberately do not duplicate the schedule.
    schedule_revision: int = 0
    schedule_slot_revisions: dict[str, int] = field(default_factory=dict)
    schedule_slot_ownership: dict[str, dict[str, Any]] = field(default_factory=dict)
    solcast_history: list[dict[str, Any]] = field(default_factory=list)
    solcast_tracking: dict[str, Any] = field(default_factory=dict)
    history_watermark: str = ""
    energy_samples: list[dict[str, Any]] = field(default_factory=list)
    daily_archive: list[dict[str, Any]] = field(default_factory=list)
    monthly_archive: list[dict[str, Any]] = field(default_factory=list)
    energy_counter_state: dict[str, dict[str, Any]] = field(default_factory=dict)
    data_quality: dict[str, Any] = field(default_factory=dict)
    weather_forecast: list[dict[str, Any]] = field(default_factory=list)
    weather_daily_forecast: list[dict[str, Any]] = field(default_factory=list)
    weather_last_updated: str = ""
    weather_last_error: str = ""
    weather_forecast_timeout: float = 5.0
    _last_energy_sample_at: datetime | None = None
    slots: dict[str, SlotSettings] = field(default_factory=dict)
    last_action: str = "Idle"
    last_applied_at: str = ""
    last_saved_at: str = ""
    last_error: str = ""
    last_schedule_attempt: dict[str, Any] = field(default_factory=dict)
    control_confirmation_timeout: float = 30.0
    # Runtime-only inverter-link health. A restart must re-derive availability
    # from live HA state, never from a remembered "was down" verdict.
    _inverter_link_unavailable_ticks: int = 0
    _inverter_link_available_ticks: int = 0
    _inverter_link_gated: bool = False
    _inverter_link_reason: str = ""
    _pending_control_transaction: dict[str, Any] = field(default_factory=dict)
    unsub_confirmation_timer: Any = None
    unsub_confirmation_listener: Any = None
    unsub_confirmation_poll: Any = None
    unsub_input_listener: Any = None
    unsub_input_debounce: Any = None
    unsub_timer: Any = None
    unsub_performance_report: Any = None
    unsub_performance_lag: Any = None
    _performance: RuntimePerformanceMonitor = field(
        default_factory=RuntimePerformanceMonitor,
        repr=False,
    )
    _performance_publish_reason: str | None = None
    _entity_publish_signatures: dict[int, Any] = field(default_factory=dict)
    entities: list[Any] = field(default_factory=list)
    _last_tou_signature: str = ""
    # Stage 5D: the schedule signature remains a cache hint, while the physical
    # signature is rebuilt from normalized, confirmed 6/6 readback every cycle.
    _last_physical_tou_signature: str = ""
    _last_external_tou_mismatch_signature: str = ""
    tou_expected_signature: str = ""
    tou_physical_signature: str = ""
    tou_reconciliation_in_sync: bool = False
    tou_readback_complete: bool = False
    tou_last_external_mismatch_at: str = ""
    tou_mismatched_fields: list[str] = field(default_factory=list)
    tou_reconciliation_status: str = "waiting_readback"
    tou_last_reconciliation_error: str = ""
    # Manual 24 h mapping saved via set_tou_slot is authoritative and independent
    # of the 48-slot work schedule; schedule-driven writes must not overwrite it.
    _manual_tou_mapping: TouMapping | None = None
    # Tracks whether the latest TOU operation crossed the preflight boundary
    # and issued at least one physical Deye service call.  Validation failures
    # must not trigger a second transaction that restores defaults.
    _last_tou_write_started: bool = False
    _last_slot_failure_signature: str = ""
    _last_sell_block_signature: str = ""
    # Lightweight, non-persistent SOC freshness state. ``last_reported`` from
    # HA remains authoritative when available; this event timestamp is only a
    # compatibility fallback for older State/test-double implementations.
    _soc_observed_at: datetime | None = None
    _soc_observed_entity_id: str | None = None
    # Report evidence from verified sibling measurements.  These timestamps are
    # deliberately runtime-only: a restart must reconstruct health from real HA
    # state metadata instead of making an old SOC look fresh.
    _soc_source_observed_at: dict[str, datetime] = field(default_factory=dict)
    _soc_quality_signature: tuple[str, float | None] | None = None
    _operation_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _schedule_reconcile_task: Any = None
    _schedule_reconcile_requested: bool = False
    _rollback_task: Any = None

    # Master control switch state (persistent) and runtime status.
    control_enabled: bool = True
    control_status: str = "Active"
    control_entity_id: str | None = None
    planned_manager_action: str = "Waiting for the first Manager cycle"
    executed_manager_action: str = "Waiting for the first Manager cycle"
    # Monotonic counter incremented only after a guarded physical inverter
    # service call succeeds.  Manager diagnostics use it to distinguish an
    # applied change from an idempotent cycle whose targets already matched.
    _physical_write_count: int = 0

    # Disable/enable lifecycle.
    _disable_generation: int = 0
    _active_control_operations: int = 0
    _control_cleanup_event: asyncio.Event = field(default_factory=asyncio.Event)
    _control_epoch: int = 0
    _active_control_transactions: dict[str, dict[str, Any]] = field(default_factory=dict)
    _disable_waiting_transactions: set[str] = field(default_factory=set)
    _control_disable_error: str = ""

    # Per-transaction guard data for rollback scope.
    _active_control_transaction_id: str | None = None
    _active_control_transaction_snapshot: dict[str, str] = field(default_factory=dict)
    _rollback_scope_transaction_id: str | None = None
    _rollback_scope_snapshot: dict[str, str] = field(default_factory=dict)

    # Cancellation signal for the active TOU transaction.
    _active_tou_cancel_event: asyncio.Event | None = None

    def __post_init__(self) -> None:
        self.slots = {key: SlotSettings(key=key, label=label) for key, label, *_ in SLOTS}
        self.manual_schedule = self._default_manual_schedule()

    def _control_is_active(self) -> bool:
        """Return whether new physical inverter writes may start."""
        return self.control_enabled and self.control_status == "Active"

    def _control_block_message(self) -> str:
        if self.control_status == "Disabling":
            return (
                "Deye control is being disabled. Wait for the "
                "active transaction to finish and try again."
            )
        return (
            "Deye control is disabled. Enable 'Deye Control' to "
            "send commands to the inverter."
        )

    def _ensure_control_active(self) -> None:
        if not self._control_is_active():
            raise ControlDisabledError(self._control_block_message())

    @asynccontextmanager
    async def _control_operation(self, name: str):
        """Register one physical-control operation and bind its task context."""
        existing_id = _CONTROL_TRANSACTION_ID.get()
        existing = self._active_control_transactions.get(existing_id or "")
        if existing is not None:
            yield existing_id
            return

        self._ensure_control_active()
        transaction_id = uuid.uuid4().hex
        meta = {
            "id": transaction_id,
            "name": name,
            "epoch": self._control_epoch,
            "started_at": ha_now().isoformat(timespec="seconds"),
            "snapshot": {},
            "rollback_snapshot": {},
            "rollback": False,
            "stale": False,
        }
        self._active_control_transactions[transaction_id] = meta
        self._active_control_operations = len(self._active_control_transactions)
        self._active_control_transaction_id = transaction_id
        token = _CONTROL_TRANSACTION_ID.set(transaction_id)
        try:
            yield transaction_id
        finally:
            _CONTROL_TRANSACTION_ID.reset(token)
            self._finish_control_operation(transaction_id)

    def _finish_control_operation(self, transaction_id: str) -> None:
        self._active_control_transactions.pop(transaction_id, None)
        self._disable_waiting_transactions.discard(transaction_id)
        self._active_control_operations = len(self._active_control_transactions)
        if self._active_control_transaction_id == transaction_id:
            self._active_control_transaction_id = None
            self._active_control_transaction_snapshot = {}
        if not self._disable_waiting_transactions:
            self._control_cleanup_event.set()

    def _set_control_transaction_snapshot(
        self, transaction_id: str | None, snapshot: dict[str, str]
    ) -> None:
        if not transaction_id:
            return
        meta = self._active_control_transactions.get(transaction_id)
        if meta is None:
            return
        normalized = {str(entity_id): str(value) for entity_id, value in snapshot.items()}
        meta["snapshot"] = normalized
        self._active_control_transaction_snapshot = dict(normalized)

    @contextmanager
    def _control_rollback_scope(
        self,
        transaction_id: str | None,
        snapshot: dict[str, str],
    ):
        """Allow only exact snapshot restoration for one known transaction."""
        if not transaction_id:
            yield
            return
        meta = self._active_control_transactions.get(transaction_id)
        if meta is None:
            raise ControlDisabledError("No active transaction for rollback")
        normalized = {str(entity_id): str(value) for entity_id, value in snapshot.items()}
        meta["rollback"] = True
        meta["rollback_snapshot"] = normalized
        self._rollback_scope_transaction_id = transaction_id
        self._rollback_scope_snapshot = dict(normalized)
        token = _CONTROL_TRANSACTION_ID.set(transaction_id)
        try:
            yield
        finally:
            _CONTROL_TRANSACTION_ID.reset(token)
            meta["rollback"] = False
            meta["rollback_snapshot"] = {}
            if self._rollback_scope_transaction_id == transaction_id:
                self._rollback_scope_transaction_id = None
                self._rollback_scope_snapshot = {}

    def _rollback_value_matches(
        self, entity_id: str, target_value: Any, snapshot_value: str
    ) -> bool:
        domain = entity_id.split(".", 1)[0]
        if domain == "number":
            actual = self.safe_float(target_value, float("nan"))
            expected = self.safe_float(snapshot_value, float("nan"))
            return (
                math.isfinite(actual)
                and math.isfinite(expected)
                and math.isclose(actual, expected, abs_tol=0.1)
            )
        if domain == "time":
            return self._time_to_minutes(target_value) == self._time_to_minutes(snapshot_value)
        if domain == "switch":
            if target_value in (True, "on"):
                normalized = "on"
            elif target_value in (False, "off"):
                normalized = "off"
            else:
                return False
            return normalized == snapshot_value
        if domain == "select":
            return str(target_value) == str(snapshot_value)
        return False

    def _guard_physical_write(self, entity_id: str, target_value: Any) -> None:
        """Enforce master control and inverter-link health at the lowest write layer."""
        if self._inverter_link_gated:
            raise ControlDisabledError(
                "Deye inverter is unavailable; physical writes are blocked."
            )
        transaction_id = _CONTROL_TRANSACTION_ID.get()
        meta = self._active_control_transactions.get(transaction_id or "")

        if self._control_is_active():
            if meta is not None and (
                meta.get("stale") or int(meta.get("epoch", -1)) != self._control_epoch
            ):
                raise ControlDisabledError(
                    "A stale Deye control transaction was blocked."
                )
            return

        if self.control_status == "Disabling" and meta is not None and meta.get("rollback"):
            snapshot = meta.get("rollback_snapshot") or {}
            if (
                entity_id in snapshot
                and self._rollback_value_matches(entity_id, target_value, snapshot[entity_id])
            ):
                return
            raise ControlDisabledError(
                "Deye control rollback goes beyond the transaction snapshot."
            )

        raise ControlDisabledError(self._control_block_message())

    async def _async_physical_service_call(
        self,
        domain: str,
        service: str,
        data: dict[str, Any],
        *,
        target_value: Any,
    ) -> None:
        """Guard and execute one physical Home Assistant inverter service."""
        entity_id = str(data.get("entity_id") or "")
        if not entity_id:
            raise ValueError("No entities for the physical Deye write")
        self._performance.inc("inverter_write_requested")
        timestamp = ha_now().isoformat()
        try:
            self._guard_physical_write(entity_id, target_value)
            await self.hass.services.async_call(domain, service, data, blocking=True)
        except Exception as err:
            await self._async_append_trigger_log(
                timestamp=timestamp,
                entity_id=entity_id,
                domain=domain,
                service=service,
                value=target_value,
                success=False,
                error=str(err),
            )
            raise
        self._performance.inc("inverter_write_executed")
        lowered_entity_id = entity_id.lower()
        if "time_of_use" in lowered_entity_id or "_tou_" in lowered_entity_id:
            self._performance.inc("tou_write_executed")
        self._physical_write_count += 1
        await self._async_append_trigger_log(
            timestamp=timestamp,
            entity_id=entity_id,
            domain=domain,
            service=service,
            value=target_value,
            success=True,
            error="",
        )

    def _control_result_is_current(self, transaction_id: str | None = None) -> bool:
        transaction_id = transaction_id or _CONTROL_TRANSACTION_ID.get()
        if not transaction_id:
            return self._control_is_active()
        meta = self._active_control_transactions.get(transaction_id)
        return bool(
            meta
            and not meta.get("stale")
            and int(meta.get("epoch", -1)) == self._control_epoch
            and self._control_is_active()
        )

    def _control_transaction_is_stale(self, transaction_id: str | None = None) -> bool:
        """Return whether a timed-out/invalidated operation may no longer publish results."""
        transaction_id = transaction_id or _CONTROL_TRANSACTION_ID.get()
        meta = self._active_control_transactions.get(transaction_id or "")
        return bool(meta and meta.get("stale"))

    async def _async_persist_control_enabled(self) -> None:
        await self.async_save_ai_data()

    async def async_disable_control(self) -> None:
        """Disable only the physical execution layer and await bounded cleanup."""
        if self.control_status == "Disabled":
            self.control_enabled = False
            return
        if self.control_status == "Disabling":
            raise ControlDisabledError(self._control_block_message())

        self.control_enabled = False
        self.control_status = "Disabling"
        self._disable_generation += 1
        self._control_epoch += 1
        generation = self._disable_generation
        self._control_cleanup_event = asyncio.Event()
        self._disable_waiting_transactions = {
            transaction_id
            for transaction_id, meta in self._active_control_transactions.items()
            if not meta.get("stale")
        }
        self._control_disable_error = ""
        self._clear_pending_control_transaction()
        self._schedule_reconcile_requested = False
        if self._active_tou_cancel_event is not None:
            self._active_tou_cancel_event.set()
        if not self._disable_waiting_transactions:
            self._control_cleanup_event.set()
        self.planned_manager_action = self._planned_manager_action_text()
        self.executed_manager_action = "Not performed — control disabled"
        self.notify_update()

        await self._async_persist_control_enabled()
        try:
            await asyncio.wait_for(
                self._control_cleanup_event.wait(),
                timeout=self.control_confirmation_timeout,
            )
        except asyncio.TimeoutError:
            waiting = sorted(self._disable_waiting_transactions)
            for transaction_id in waiting:
                meta = self._active_control_transactions.get(transaction_id)
                if meta is not None:
                    meta["stale"] = True
            self._disable_waiting_transactions.clear()
            self._control_disable_error = (
                "Timed out after 30 s waiting for Deye control to finish. "
                "Previous operations were invalidated."
            )
            self.last_error = self._control_disable_error
            self._stop_tou_confirmation_listener()
            self.tou_write_pending = False
            self._clear_pending_control_transaction()
        finally:
            if generation == self._disable_generation and self.control_status == "Disabling":
                self.control_status = "Disabled"
                self.executed_manager_action = "Not performed — control disabled"
                self.notify_update()

    async def async_enable_control(self) -> None:
        """Enable future normal Manager cycles without writing immediately."""
        if self.control_status == "Disabling":
            raise ControlDisabledError(self._control_block_message())
        if self._control_is_active():
            return
        self.control_enabled = True
        self.control_status = "Active"
        self._control_epoch += 1
        self._control_disable_error = ""
        self.planned_manager_action = self._planned_manager_action_text()
        self.executed_manager_action = (
            "Not performed — emergency stop"
            if self.emergency_stop
            else "Waiting for the next Manager cycle"
        )
        await self._async_persist_control_enabled()
        self.notify_update()
        if not self.emergency_stop:
            # Reuse the normal Manager decision path.  The existing scheduler
            # coalesces rapid requests and acquires _operation_lock outside this
            # method, so enabling control cannot deadlock or duplicate writes.
            self._schedule_schedule_reconciliation()

    @staticmethod
    def normalize_schedule_mode(
        mode: Any,
        physical_work_mode: Any = None,
    ) -> tuple[str, str | None, bool]:
        """Normalize one legacy slot without guessing a physical Deye mode."""
        if mode in PHYSICAL_NORMAL_MODES:
            return MODE_NORMAL_OPERATION, str(mode), True
        if mode == MODE_NORMAL_OPERATION:
            physical = str(physical_work_mode) if physical_work_mode in PHYSICAL_NORMAL_MODES else None
            return MODE_NORMAL_OPERATION, physical, False
        if mode in (MODE_SELLING_FIRST, MODE_CHARGE):
            return str(mode), None, False
        raise ValueError(f"Unsupported schedule mode: {mode}")

    async def async_restore_slot_mode(
        self,
        slot_key: str,
        restored_mode: str,
    ) -> None:
        """Restore and idempotently migrate one legacy slot entity state."""
        slot = self.slots[slot_key]
        stored_physical = slot.physical_work_mode
        logical, physical, migrated = self.normalize_schedule_mode(restored_mode, stored_physical)
        slot.mode = logical
        slot.physical_work_mode = physical
        self._restored_slot_mode_keys.add(slot_key)

        # Persist the migration once all RestoreEntity slot states have been
        # observed.  No inverter service call or profile/default substitution
        # is performed here.
        all_restored = len(self._restored_slot_mode_keys) == len(self.slots)
        if migrated or (all_restored and self.schedule_schema_version < SCHEDULE_SCHEMA_VERSION):
            if all_restored:
                self.schedule_schema_version = SCHEDULE_SCHEMA_VERSION
            self.mark_config_saved()

    @property
    def work_mode_select(self) -> str | None:
        return self.data.get(CONF_WORK_MODE_SELECT)

    @property
    def inverter_provider(self) -> str:
        """Return the configured provider; old entries remain Lewa-Reka."""
        return provider_key(self.data)

    @property
    def work_mode_aux_entity(self) -> str | None:
        return self.data.get(CONF_WORK_MODE_AUX_ENTITY)

    @property
    def max_sell_power_number(self) -> str | None:
        return self.data.get(CONF_MAX_SELL_POWER_NUMBER)

    @property
    def configured_inverter_max_power_w(self) -> int:
        """User-configured inverter AC power limit (W)."""
        try:
            value = int(float(self.data.get(CONF_INVERTER_MAX_POWER_W, DEFAULT_INVERTER_MAX_POWER_W)))
        except (TypeError, ValueError):
            value = DEFAULT_INVERTER_MAX_POWER_W
        return max(1000, min(30000, value))

    @property
    def detected_entity_max_power_w(self) -> int | None:
        """Reliable maximum from the mapped Max Sell Power entity, if any."""
        entity_id = self.max_sell_power_number
        if not entity_id:
            return None
        return detect_entity_max_power_w(self.hass.states.get(entity_id))

    @property
    def effective_inverter_max_power_w(self) -> int:
        """Effective sell-power ceiling for this instance.

        The user-configured value is the source of truth. The detected entity
        maximum is only a proposal used to pre-fill the configuration step.
        """
        return self.configured_inverter_max_power_w

    @property
    def max_sell_power_range(self) -> NumberEntityRange:
        """Physical min/max/step of the mapped Max Sell Power number entity."""
        return number_entity_range(self.hass.states.get(self.max_sell_power_number))

    def validate_manual_sell_power_w(self, label: str, value_w: float) -> None:
        """Reject an invalid manual sell-power value before any write.

        Zero watts is always allowed because it represents "no selling" in the
        logical configuration. Physical min/max/step checks apply only to
        positive values that will actually be sent to the inverter.
        """
        if not math.isfinite(value_w) or value_w < 0:
            raise ValueError(f"{label}: sell power must be a non-negative number")
        if value_w > self.effective_inverter_max_power_w:
            raise ValueError(
                f"{label}: sell power {value_w} W exceeds the effective limit "
                f"{self.effective_inverter_max_power_w} W"
            )
        if value_w == 0:
            return
        physical = self.max_sell_power_range
        if physical.maximum_w is not None and value_w > physical.maximum_w:
            raise ValueError(
                f"{label}: sell power {value_w} W exceeds the physical entity limit "
                f"{physical.maximum_w} W"
            )
        if physical.minimum_w is not None and value_w < physical.minimum_w:
            raise ValueError(
                f"{label}: sell power {value_w} W is below the physical entity minimum "
                f"{physical.minimum_w} W"
            )
        if (
            physical.step_w is not None
            and physical.step_w > 0
            and physical.minimum_w is not None
        ):
            steps = (value_w - physical.minimum_w) / physical.step_w
            if not math.isclose(steps, round(steps), abs_tol=1e-6):
                raise ValueError(
                    f"{label}: sell power {value_w} W does not match the physical entity step "
                    f"{physical.step_w} W"
                )

    def normalize_automatic_sell_power_w(self, value_w: float) -> float:
        """Return a sell-power value safe for automatic Deye writes.

        The returned value is:
        - capped to the effective inverter limit,
        - capped to the physical entity maximum,
        - rounded down to the physical entity step,
        - never rounded up.

        A positive value below the physical minimum is reduced to 0 W,
        consistent with the semantics of disabled selling.
        """
        physical = self.max_sell_power_range
        physical_maximum = physical.maximum_w
        maximum = float(self.effective_inverter_max_power_w)
        if physical_maximum is not None:
            maximum = min(maximum, physical_maximum)
        return quantize_power_w(
            value_w,
            step_w=physical.step_w if physical.step_w is not None else 1.0,
            minimum_w=physical.minimum_w if physical.minimum_w is not None else 0.0,
            maximum_w=maximum,
        )

    async def async_set_max_sell_power_number(self, value_w: float) -> float | None:
        """Write a sell-power value in watts, converting to the entity's native unit.

        Returns the native value that was written, or None when the value is 0 W
        and the physical entity does not accept 0 W (min > 0). In that case the
        caller must rely on the work mode to stop selling.
        """
        normalized_w = self.normalize_automatic_sell_power_w(value_w)
        physical = self.max_sell_power_range
        if normalized_w == 0 and physical.minimum_w is not None and physical.minimum_w > 0:
            return None
        native_value = convert_w_to_native_unit(normalized_w, physical.native_unit)
        await self.async_set_number(self.max_sell_power_number, native_value)
        return native_value

    async def async_set_max_sell_power_number_if_needed(
        self, value_w: float
    ) -> float | None:
        """Apply automatic sell power only when its native readback differs."""
        normalized_w = self.normalize_automatic_sell_power_w(value_w)
        physical = self.max_sell_power_range
        if normalized_w == 0 and physical.minimum_w is not None and physical.minimum_w > 0:
            return None
        native_value = convert_w_to_native_unit(normalized_w, physical.native_unit)
        state = self.hass.states.get(self.max_sell_power_number)
        current = None if state is None else self.safe_float(state.state, float("nan"))
        if current is not None and math.isfinite(current) and math.isclose(
            current, native_value, abs_tol=0.1
        ):
            self._performance.inc("inverter_write_skipped_same_value")
            return native_value
        return await self.async_set_max_sell_power_number(value_w)

    @property
    def grid_power_sensor(self) -> str | None:
        configured = self.data.get(CONF_GRID_POWER_SENSOR)
        if configured and self.hass.states.get(configured) is not None:
            return configured
        if self.inverter_provider != PROVIDER_LEWA_REKA:
            return configured
        if self.hass.states.get(DEFAULT_GRID_POWER_SENSOR) is not None:
            return DEFAULT_GRID_POWER_SENSOR
        return configured

    @property
    def pv_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV_POWER_SENSOR, DEFAULT_PV_POWER_SENSOR)

    @property
    def load_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_LOAD_POWER_SENSOR, DEFAULT_LOAD_POWER_SENSOR)

    @property
    def battery_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_BATTERY_POWER_SENSOR, DEFAULT_BATTERY_POWER_SENSOR)

    @property
    def battery_soc_sensor(self) -> str | None:
        configured = self.data.get(CONF_BATTERY_SOC_SENSOR)
        if configured and self.hass.states.get(configured) is not None:
            return configured
        if self.inverter_provider != PROVIDER_LEWA_REKA:
            return configured
        if self.hass.states.get(DEFAULT_BATTERY_SOC) is not None:
            return DEFAULT_BATTERY_SOC
        return configured

    def configured_sensor(self, key: str, default_entity: str) -> str | None:
        configured = self.data.get(key)
        if configured and self.hass.states.get(configured) is not None:
            return configured
        if self.inverter_provider != PROVIDER_LEWA_REKA:
            return configured
        if self.hass.states.get(default_entity) is not None:
            return default_entity
        return configured or default_entity

    @property
    def price_sensor(self) -> str | None:
        return str(self.data.get(CONF_PRICE_SENSOR) or "") or None

    @property
    def sell_price_tomorrow_sensor(self) -> str | None:
        return str(self.data.get(CONF_SELL_PRICE_TOMORROW_SENSOR) or "") or None

    @property
    def buy_price_today_sensor(self) -> str | None:
        return str(self.data.get(CONF_BUY_PRICE_TODAY_SENSOR) or "") or None

    @property
    def buy_price_tomorrow_sensor(self) -> str | None:
        return str(self.data.get(CONF_BUY_PRICE_TOMORROW_SENSOR) or "") or None

    @property
    def buy_seller_id(self) -> str:
        return str(self.data.get(CONF_BUY_SELLER_ID, DEFAULT_BUY_SELLER_ID) or "")

    @property
    def buy_seller_tariff_id(self) -> str:
        return str(self.data.get(CONF_BUY_SELLER_TARIFF_ID, DEFAULT_BUY_SELLER_TARIFF_ID) or "")

    def _price_registry_entry(self, entity_id: str | None) -> Any:
        if not entity_id:
            return None
        try:
            from homeassistant.helpers import entity_registry as er

            registry = er.async_get(self.hass)
            if registry is None:
                return None
            return registry.async_get(entity_id) if hasattr(registry, "async_get") else getattr(registry, "entities", {}).get(entity_id)
        except (AttributeError, ImportError, KeyError, TypeError):
            return None

    def capture_price_binding(self, entity_id: str | None) -> dict[str, Any]:
        """Capture stable registry identity without selecting any other entity."""
        mapped = str(entity_id or "")
        entry = self._price_registry_entry(mapped)
        binding: dict[str, Any] = {"entity_id": mapped}
        if entry is None:
            return binding
        binding.update({
            "registry_entry_id": str(getattr(entry, "id", "") or ""),
            "platform": str(getattr(entry, "platform", "") or ""),
            "config_entry_id": str(getattr(entry, "config_entry_id", "") or ""),
            "unique_id": str(getattr(entry, "unique_id", "") or ""),
            "device_id": str(getattr(entry, "device_id", "") or ""),
        })
        return binding

    def resolve_price_binding(
        self,
        mapped_entity: str | None,
        binding: dict[str, Any] | None,
    ) -> tuple[str, str, str]:
        """Resolve a rename by stable identity, never by provider defaults."""
        mapped = str(mapped_entity or "")
        saved = dict(binding or {}) if isinstance(binding, dict) else {}
        if not mapped:
            return "", "unmapped", "user_unmapped"
        saved_registry_id = str(saved.get("registry_entry_id") or "")
        cache_key = repr((mapped, sorted(saved.items())))
        cached = self._price_resolution_cache.get(cache_key)
        if cached and self.hass.states.get(str(cached.get("resolved") or "")) is not None:
            cached_entry = self._price_registry_entry(str(cached.get("resolved") or ""))
            if (
                not saved_registry_id
                or cached_entry is None
                or str(getattr(cached_entry, "id", "") or "") == saved_registry_id
            ):
                return str(cached["resolved"]), str(cached["status"]), str(cached.get("reason") or "")
        if mapped and self.hass.states.get(mapped) is not None:
            mapped_entry = self._price_registry_entry(mapped)
            if (
                not saved_registry_id
                or (
                    mapped_entry is not None
                    and str(getattr(mapped_entry, "id", "") or "") == saved_registry_id
                )
            ):
                result = (mapped, "mapped_entity", "")
                self._price_resolution_cache[cache_key] = {"resolved": result[0], "status": result[1], "reason": result[2]}
                return result
        candidates: list[Any] = []
        try:
            from homeassistant.helpers import entity_registry as er

            registry = er.async_get(self.hass)
            entries = list(getattr(registry, "entities", {}).values()) if registry is not None else []
            if saved_registry_id:
                candidates = [entry for entry in entries if str(getattr(entry, "id", "") or "") == saved_registry_id]
            if not candidates and saved.get("unique_id") and saved.get("platform"):
                candidates = [
                    entry for entry in entries
                    if str(getattr(entry, "unique_id", "") or "") == str(saved.get("unique_id"))
                    and str(getattr(entry, "platform", "") or "") == str(saved.get("platform"))
                    and (
                        not saved.get("config_entry_id")
                        or str(getattr(entry, "config_entry_id", "") or "") == str(saved.get("config_entry_id"))
                    )
                ]
        except (AttributeError, ImportError, KeyError, TypeError):
            candidates = []
        if len(candidates) == 1:
            resolved = str(getattr(candidates[0], "entity_id", "") or "")
            if resolved:
                status = "renamed_resolved" if resolved != mapped else "mapped_entity"
                reason = "resolved_by_stable_identity" if status == "renamed_resolved" else ""
                self._price_resolution_cache[cache_key] = {"resolved": resolved, "status": status, "reason": reason}
                return resolved, status, reason
        reason = "ambiguous_stable_identity" if len(candidates) > 1 else "mapped_entity_missing"
        return mapped, "mapped_entity_missing", reason

    def _price_source_metadata(self, entity_id: str | None) -> dict[str, str | None]:
        """Return cached registry/config-entry metadata for adapter detection."""
        key = str(entity_id or "")
        if not key:
            return {"platform": None, "config_entry_domain": None, "device_metadata": None}
        if key in self._price_adapter_cache:
            return self._price_adapter_cache[key]
        platform: str | None = None
        config_entry_domain: str | None = None
        device_metadata: str | None = None
        try:
            from homeassistant.helpers import entity_registry as er

            registry = er.async_get(self.hass)
            entry = registry.async_get(key) if registry is not None and hasattr(registry, "async_get") else None
            if entry is None and registry is not None:
                entry = getattr(registry, "entities", {}).get(key)
            platform = str(getattr(entry, "platform", "") or "") or None
            config_entry_id = getattr(entry, "config_entry_id", None)
            config_entries = getattr(self.hass, "config_entries", None)
            source_entry = (
                config_entries.async_get_entry(config_entry_id)
                if config_entry_id and config_entries is not None and hasattr(config_entries, "async_get_entry")
                else None
            )
            config_entry_domain = str(getattr(source_entry, "domain", "") or "") or None
            device_id = getattr(entry, "device_id", None)
            if device_id:
                from homeassistant.helpers import device_registry as dr

                device_registry = dr.async_get(self.hass)
                device = device_registry.async_get(device_id) if device_registry is not None else None
                if device is not None:
                    identifiers = " ".join(
                        f"{domain} {identifier}"
                        for domain, identifier in (getattr(device, "identifiers", set()) or set())
                    )
                    device_metadata = " ".join(
                        str(value or "")
                        for value in (
                            getattr(device, "manufacturer", None),
                            getattr(device, "model", None),
                            getattr(device, "name", None),
                            identifiers,
                        )
                    ).strip() or None
        except (AttributeError, KeyError, TypeError):
            pass
        metadata = {
            "platform": platform,
            "config_entry_domain": config_entry_domain,
            "device_metadata": device_metadata,
        }
        self._price_adapter_cache[key] = metadata
        return metadata

    def price_contract(self, direction: str) -> dict[str, Any]:
        """Resolve one independent, versioned BUY or SELL source contract."""
        is_sell = direction == "sell"
        legacy_today_key = CONF_PRICE_SENSOR if is_sell else CONF_BUY_PRICE_TODAY_SENSOR
        legacy_tomorrow_key = CONF_SELL_PRICE_TOMORROW_SENSOR if is_sell else CONF_BUY_PRICE_TOMORROW_SENSOR
        key = CONF_SELL_PRICE_CONTRACT if is_sell else CONF_BUY_PRICE_CONTRACT
        explicit_contract = self.data.get(key) if isinstance(self.data.get(key), dict) else {}
        # Minor 23 guarantees presence-aware central mappings. Runtime never
        # consults provider defaults or price_source; those remain migration-only.
        today_entity = str(self.data.get(legacy_today_key) or "")
        tomorrow_entity = str(self.data.get(legacy_tomorrow_key) or "")
        slot_identity_matches: dict[str, bool] = {}
        bindings: dict[str, dict[str, Any]] = {}
        for day_name, entity_id in (("today", today_entity), ("tomorrow", tomorrow_entity)):
            saved_binding = explicit_contract.get(f"{day_name}_binding")
            saved_binding = dict(saved_binding) if isinstance(saved_binding, dict) else {}
            captured = self.capture_price_binding(entity_id) if entity_id else {}
            saved_entity = str(explicit_contract.get(f"{day_name}_entity") or saved_binding.get("entity_id") or "")
            saved_registry_id = str(saved_binding.get("registry_entry_id") or "")
            captured_registry_id = str(captured.get("registry_entry_id") or "")
            same_identity = bool(
                saved_entity == entity_id
                or (
                    entity_id
                    and saved_registry_id
                    and captured_registry_id
                    and saved_registry_id == captured_registry_id
                )
            )
            slot_identity_matches[day_name] = same_identity
            bindings[day_name] = saved_binding if same_identity and saved_binding else captured
        today_binding = bindings["today"]
        tomorrow_binding = bindings["tomorrow"]
        resolved_today, today_status, today_reason = self.resolve_price_binding(today_entity, today_binding)
        resolved_tomorrow, tomorrow_status, tomorrow_reason = self.resolve_price_binding(tomorrow_entity, tomorrow_binding)
        reusable_contract = dict(explicit_contract)
        if all(slot_identity_matches.values()):
            # A registry-backed rename is the same source. Move its fingerprint
            # forward so custom metadata and stable schema may be retained.
            reusable_contract.update({
                "today_entity": today_entity,
                "tomorrow_entity": tomorrow_entity,
                "mapping_fingerprint": price_mapping_fingerprint(today_entity, tomorrow_entity),
            })
        adapters: dict[str, str] = {}
        for day_name, entity_id, resolved in (
            ("today", today_entity, resolved_today),
            ("tomorrow", tomorrow_entity, resolved_tomorrow),
        ):
            metadata = self._price_source_metadata(resolved or entity_id)
            saved_adapter = str(
                explicit_contract.get(f"resolved_adapter_{day_name}")
                or explicit_contract.get("source_adapter")
                or ""
            )
            detected_adapter = detect_source_adapter(
                resolved or entity_id,
                platform=metadata.get("platform"),
                config_entry_domain=metadata.get("config_entry_domain"),
                device_metadata=metadata.get("device_metadata"),
            )
            adapters[day_name] = (
                saved_adapter
                if detected_adapter == "generic"
                and slot_identity_matches[day_name]
                and saved_adapter in ("octopus_energy", "generic", "custom")
                else detected_adapter
            )
        contract = rebuild_price_contract(
            reusable_contract,
            "sell" if is_sell else "buy",
            today_entity,
            tomorrow_entity,
            adapters["today"],
            adapters["tomorrow"],
        )
        contract.update({
            "today_entity": today_entity,
            "tomorrow_entity": tomorrow_entity,
            "resolved_today_entity": resolved_today,
            "resolved_tomorrow_entity": resolved_tomorrow,
            "today_binding": today_binding,
            "tomorrow_binding": tomorrow_binding,
            "stable_identity_today_status": today_status,
            "stable_identity_tomorrow_status": tomorrow_status,
            "stable_identity_today_reason": today_reason,
            "stable_identity_tomorrow_reason": tomorrow_reason,
        })
        if not today_entity:
            contract["today_binding"] = {}
            contract["resolved_schema_today"] = {}
        if not tomorrow_entity:
            contract["tomorrow_binding"] = {}
            contract["resolved_schema_tomorrow"] = {}
        contract, _schema_diagnostics = resolve_contract_schemas(
            contract,
            self.hass.states.get(resolved_today) if resolved_today else None,
            self.hass.states.get(resolved_tomorrow) if resolved_tomorrow else None,
        )
        # Runtime cache is stored on the contract itself. It is persisted on the
        # next settings save and avoids rediscovery during normal operation.
        self.data[key] = contract
        return contract

    @property
    def solcast_current_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_CURRENT_POWER_SENSOR, DEFAULT_SOLCAST_CURRENT_POWER_SENSOR)

    @property
    def solcast_forecast_today_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_TODAY_SENSOR, DEFAULT_SOLCAST_FORECAST_TODAY_SENSOR)

    @property
    def daily_pv_production_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_PV_PRODUCTION_SENSOR, DEFAULT_DAILY_PV_PRODUCTION_SENSOR)

    # Status panel detail sensors
    @property
    def pv1_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV1_POWER_SENSOR, DEFAULT_PV1_POWER_SENSOR)

    @property
    def pv1_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV1_VOLTAGE_SENSOR, DEFAULT_PV1_VOLTAGE_SENSOR)

    @property
    def pv1_current_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV1_CURRENT_SENSOR, DEFAULT_PV1_CURRENT_SENSOR)

    @property
    def pv2_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV2_POWER_SENSOR, DEFAULT_PV2_POWER_SENSOR)

    @property
    def pv2_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV2_VOLTAGE_SENSOR, DEFAULT_PV2_VOLTAGE_SENSOR)

    @property
    def pv2_current_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV2_CURRENT_SENSOR, DEFAULT_PV2_CURRENT_SENSOR)

    @property
    def pv3_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_PV3_POWER_SENSOR, DEFAULT_PV3_POWER_SENSOR)

    @property
    def battery_bms_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_BATTERY_BMS_VOLTAGE_SENSOR, DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR)

    @property
    def battery_current_sensor(self) -> str | None:
        return self.configured_sensor(CONF_BATTERY_CURRENT_SENSOR, DEFAULT_BATTERY_CURRENT_SENSOR)

    @property
    def battery_temperature_sensor(self) -> str | None:
        return self.configured_sensor(CONF_BATTERY_TEMPERATURE_SENSOR, DEFAULT_BATTERY_TEMPERATURE_SENSOR)

    @property
    def battery_soh_sensor(self) -> str | None:
        return self.configured_sensor(CONF_BATTERY_SOH_SENSOR, DEFAULT_BATTERY_SOH_SENSOR)

    @property
    def daily_battery_charge_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_BATTERY_CHARGE_SENSOR, DEFAULT_DAILY_BATTERY_CHARGE_SENSOR)

    @property
    def daily_battery_discharge_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_BATTERY_DISCHARGE_SENSOR, DEFAULT_DAILY_BATTERY_DISCHARGE_SENSOR)

    @property
    def daily_energy_bought_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_ENERGY_BOUGHT_SENSOR, DEFAULT_DAILY_ENERGY_BOUGHT_SENSOR)

    @property
    def daily_energy_sold_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_ENERGY_SOLD_SENSOR, DEFAULT_DAILY_ENERGY_SOLD_SENSOR)

    @property
    def grid_l1_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L1_POWER_SENSOR, DEFAULT_GRID_L1_POWER_SENSOR)

    @property
    def grid_l1_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L1_VOLTAGE_SENSOR, DEFAULT_GRID_L1_VOLTAGE_SENSOR)

    @property
    def grid_l2_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L2_POWER_SENSOR, DEFAULT_GRID_L2_POWER_SENSOR)

    @property
    def grid_l2_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L2_VOLTAGE_SENSOR, DEFAULT_GRID_L2_VOLTAGE_SENSOR)

    @property
    def grid_l3_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L3_POWER_SENSOR, DEFAULT_GRID_L3_POWER_SENSOR)

    @property
    def grid_l3_voltage_sensor(self) -> str | None:
        return self.configured_sensor(CONF_GRID_L3_VOLTAGE_SENSOR, DEFAULT_GRID_L3_VOLTAGE_SENSOR)

    @property
    def load_frequency_sensor(self) -> str | None:
        return self.configured_sensor(CONF_LOAD_FREQUENCY_SENSOR, DEFAULT_LOAD_FREQUENCY_SENSOR)

    @property
    def daily_load_consumption_sensor(self) -> str | None:
        return self.configured_sensor(CONF_DAILY_LOAD_CONSUMPTION_SENSOR, DEFAULT_DAILY_LOAD_CONSUMPTION_SENSOR)

    @property
    def load_l1_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_LOAD_L1_POWER_SENSOR, DEFAULT_LOAD_L1_POWER_SENSOR)

    @property
    def load_l2_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_LOAD_L2_POWER_SENSOR, DEFAULT_LOAD_L2_POWER_SENSOR)

    @property
    def load_l3_power_sensor(self) -> str | None:
        return self.configured_sensor(CONF_LOAD_L3_POWER_SENSOR, DEFAULT_LOAD_L3_POWER_SENSOR)

    @property
    def inverter_ac_temperature_sensor(self) -> str | None:
        return self.configured_sensor(CONF_INVERTER_AC_TEMPERATURE_SENSOR, DEFAULT_INVERTER_AC_TEMPERATURE_SENSOR)

    @property
    def solcast_forecast_tomorrow_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_TOMORROW_SENSOR, DEFAULT_SOLCAST_FORECAST_TOMORROW_SENSOR)

    @property
    def solcast_forecast_day_3_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_DAY_3_SENSOR, DEFAULT_SOLCAST_FORECAST_DAY_3_SENSOR)

    @property
    def solcast_forecast_day_4_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_DAY_4_SENSOR, DEFAULT_SOLCAST_FORECAST_DAY_4_SENSOR)

    @property
    def solcast_forecast_day_5_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_DAY_5_SENSOR, DEFAULT_SOLCAST_FORECAST_DAY_5_SENSOR)

    @property
    def solcast_forecast_day_6_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_DAY_6_SENSOR, DEFAULT_SOLCAST_FORECAST_DAY_6_SENSOR)

    @property
    def solcast_forecast_day_7_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_FORECAST_DAY_7_SENSOR, DEFAULT_SOLCAST_FORECAST_DAY_7_SENSOR)

    @property
    def solcast_remaining_today_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_REMAINING_TODAY_SENSOR, DEFAULT_SOLCAST_REMAINING_TODAY_SENSOR)

    @property
    def solcast_peak_power_today_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_PEAK_POWER_TODAY_SENSOR, DEFAULT_SOLCAST_PEAK_POWER_TODAY_SENSOR)

    @property
    def solcast_peak_time_today_sensor(self) -> str | None:
        return self.configured_sensor(CONF_SOLCAST_PEAK_TIME_TODAY_SENSOR, DEFAULT_SOLCAST_PEAK_TIME_TODAY_SENSOR)

    @property
    def weather_entity(self) -> str | None:
        return self.data.get(CONF_WEATHER_ENTITY) or DEFAULT_WEATHER_ENTITY

    @property
    def dso_provider(self) -> str:
        return str(self.data.get(CONF_DSO_PROVIDER, DEFAULT_DSO_PROVIDER)).lower()

    @property
    def tariff_plan(self) -> str:
        return str(self.data.get(CONF_TARIFF_PLAN, DEFAULT_TARIFF_PLAN)).lower()

    @property
    def distribution_peak_rate(self) -> float:
        return max(0.0, self.safe_float(self.data.get(CONF_DISTRIBUTION_PEAK_RATE), DEFAULT_DISTRIBUTION_PEAK_RATE))

    @property
    def distribution_offpeak_rate(self) -> float:
        return max(0.0, self.safe_float(self.data.get(CONF_DISTRIBUTION_OFFPEAK_RATE), DEFAULT_DISTRIBUTION_OFFPEAK_RATE))

    @property
    def custom_offpeak_windows(self) -> str:
        return str(self.data.get(CONF_CUSTOM_OFFPEAK_WINDOWS, DEFAULT_CUSTOM_OFFPEAK_WINDOWS))

    @property
    def tariff_mode(self) -> str:
        value = str(self.data.get(CONF_TARIFF_MODE, DEFAULT_TARIFF_MODE)).lower()
        return value if value in ("automatic", "manual") else DEFAULT_TARIFF_MODE

    @property
    def price_includes_distribution(self) -> bool:
        return bool(self.data.get(CONF_PRICE_INCLUDES_DISTRIBUTION, DEFAULT_PRICE_INCLUDES_DISTRIBUTION))

    @property
    def tariff_catalog(self) -> dict[str, Any]:
        if self._tariff_catalog_manager is not None:
            return self._tariff_catalog_manager.catalog
        return {}

    def normalized_grid_power(self) -> float:
        value = self.grid_power_reading().get("value")
        return float(value) if value is not None else 0.0

    def normalized_battery_power(self) -> float:
        value = self.battery_power_reading().get("value")
        return float(value) if value is not None else 0.0

    def tariff_context(self, moment: datetime | None = None) -> dict[str, Any]:
        current = moment or ha_now()
        catalog = self.tariff_catalog
        tariff = get_tariff(catalog, self.dso_provider, self.tariff_plan)
        tariff_available, tariff_error = tariff_availability(tariff, current.date()) if tariff else (False, "missing tariff in the catalog")
        automatic = self.tariff_mode == "automatic" and tariff is not None and tariff_available
        if automatic:
            profile = catalog_hourly_profile(current, catalog, self.dso_provider, self.tariff_plan, 48)
        elif self.tariff_mode == "manual":
            today = hourly_tariff_profile(
                current,
                "custom",
                self.distribution_peak_rate,
                self.distribution_offpeak_rate,
                self.custom_offpeak_windows,
                "other",
            )
            tomorrow = hourly_tariff_profile(
                current + timedelta(days=1),
                "custom",
                self.distribution_peak_rate,
                self.distribution_offpeak_rate,
                self.custom_offpeak_windows,
                "other",
            )
            profile = [*today, *tomorrow]
        else:
            profile = []
        current_row = next(
            (row for row in profile if row.get("date") == current.date().isoformat() and row.get("hour") == current.hour),
            profile[current.hour] if len(profile) > current.hour else {},
        )
        catalog_rates = tariff.get("rates", {}) if automatic and tariff else {}
        numeric_rates = [float(value) for value in catalog_rates.values() if isinstance(value, (int, float))]
        display_peak_rate = max(numeric_rates) if numeric_rates else self.distribution_peak_rate
        display_offpeak_rate = min(numeric_rates) if numeric_rates else self.distribution_offpeak_rate
        providers = [
            {
                "id": key,
                "name": str(value.get("name") or key),
                "tariffs": available_tariffs(catalog, key),
            }
            for key, value in catalog.get("providers", {}).items()
        ]
        buy_contract = self.price_contract("buy")
        sell_contract = self.price_contract("sell")
        buy_entities_empty = not str(buy_contract.get("today_entity") or "") and not str(
            buy_contract.get("tomorrow_entity") or ""
        )
        support = seller_support_entry(catalog, self.dso_provider, self.tariff_plan)
        seller_options = seller_catalog_options(catalog)
        selected_seller = self.buy_seller_id
        selected_tariff = self.buy_seller_tariff_id
        compatible_tariffs = (
            seller_tariff_options(
                catalog,
                selected_seller,
                self.dso_provider,
                self.tariff_plan,
                current.date(),
            )
            if selected_seller
            else []
        )
        seller_tariff_options_by_scope: dict[str, list[dict[str, str]]] = {}
        for provider_id, provider_item in catalog.get("providers", {}).items():
            for plan_id in provider_item.get("tariffs", {}):
                for seller_item in seller_options:
                    scope_key = f"{provider_id}/{plan_id}/{seller_item['id']}"
                    scoped_options = seller_tariff_options(
                        catalog,
                        seller_item["id"],
                        provider_id,
                        plan_id,
                        current.date(),
                    )
                    if scoped_options:
                        seller_tariff_options_by_scope[scope_key] = scoped_options
        automatic_tariff_id = compatible_tariffs[0]["id"] if len(compatible_tariffs) == 1 else ""
        if not buy_entities_empty:
            fallback_status = "ignored_explicit_buy_mapping"
            fallback_reason = "An explicit BUY mapping takes precedence over the retailer catalog."
        elif not selected_seller:
            fallback_status = "seller_not_selected"
            fallback_reason = "Select an energy retailer to create standard BUY prices."
        elif compatible_tariffs:
            fallback_status = "ready" if automatic_tariff_id or selected_tariff else "tariff_selection_required"
            fallback_reason = "" if fallback_status == "ready" else "Select the correct retailer tariff."
        else:
            fallback_status = str(support.get("status") or "no_valid_standard_tariff")
            fallback_reason = str(support.get("reason") or "No valid matching retailer tariff.")
        context = {
            "provider": self.dso_provider,
            "provider_name": str(
                catalog.get("providers", {}).get(self.dso_provider, {}).get("name")
                or self.dso_provider
            ),
            "plan": self.tariff_plan,
            "plan_name": str(tariff.get("name")) if tariff else self.tariff_plan.upper(),
            "mode": self.tariff_mode,
            "configured": automatic or self.tariff_mode == "manual",
            "tariff_error": "" if automatic or self.tariff_mode == "manual" else tariff_error,
            "zone": current_row.get("zone"),
            "season": current_row.get("season"),
            "day_type": current_row.get("day_type"),
            "distribution_rate": current_row.get("rate", 0),
            "common_rate": current_row.get("common_rate", 0),
            "total_distribution_rate": current_row.get("total_distribution_rate", current_row.get("rate", 0)),
            "peak_rate": round(display_peak_rate, 5),
            "offpeak_rate": round(display_offpeak_rate, 5),
            "custom_offpeak_windows": self.custom_offpeak_windows,
            "price_includes_distribution": buy_contract.get("includes_distribution_variable") is True,
            "price_contracts": {"buy": buy_contract, "sell": sell_contract},
            "seller_fallback": {
                "show": buy_entities_empty,
                "enabled": buy_entities_empty,
                "selected_seller_id": selected_seller,
                "selected_seller_tariff_id": selected_tariff,
                "automatic_seller_tariff_id": automatic_tariff_id,
                "suggested_seller_id": str(support.get("suggested_seller_id") or ""),
                "support_status": str(support.get("status") or "UNKNOWN_REQUIRES_RESEARCH"),
                "support_reason": str(support.get("reason") or ""),
                "status": fallback_status,
                "reason": fallback_reason,
                "seller_options": seller_options,
                "tariff_options": compatible_tariffs,
                "tariff_options_by_scope": seller_tariff_options_by_scope,
                "support_matrix": deepcopy(catalog.get("seller_support_matrix", {})),
                "tariff_selector_required": len(compatible_tariffs) > 1,
            },
            "price_diagnostics": deepcopy(self._canonical_price_snapshot),
            "grid_positive_is_import": bool(self.data.get(CONF_GRID_POSITIVE_IS_IMPORT, DEFAULT_GRID_POSITIVE_IS_IMPORT)),
            "battery_positive_is_discharge": bool(self.data.get(CONF_BATTERY_POSITIVE_IS_DISCHARGE, DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE)),
            "providers": providers,
            "tariffs": available_tariffs(catalog, self.dso_provider),
            "hourly_profile": profile,
        }
        if self._tariff_catalog_manager is not None:
            context.update(self._tariff_catalog_manager.status())
        return context

    def validate_and_bind_price_contract(
        self,
        contract: dict[str, Any],
        *,
        strict: bool = True,
    ) -> dict[str, Any]:
        """Validate mapped entities/schema and attach stable registry bindings."""
        prepared = dict(contract)
        states: list[Any] = []
        for day_name in ("today", "tomorrow"):
            mapped = str(prepared.get(f"{day_name}_entity") or "")
            saved_binding = prepared.get(f"{day_name}_binding")
            if not isinstance(saved_binding, dict) or str(saved_binding.get("entity_id") or "") != mapped:
                saved_binding = self.capture_price_binding(mapped)
            resolved, status, reason = self.resolve_price_binding(mapped, saved_binding)
            prepared[f"{day_name}_binding"] = saved_binding
            prepared[f"resolved_{day_name}_entity"] = resolved
            prepared[f"stable_identity_{day_name}_status"] = status
            prepared[f"stable_identity_{day_name}_reason"] = reason
            if not mapped:
                prepared[f"{day_name}_binding"] = {}
                prepared[f"resolved_schema_{day_name}"] = {}
            state = self.hass.states.get(resolved) if resolved else None
            states.append(state)
            if strict and mapped and state is None:
                raise ValueError(f"{day_name.upper()}: mapped_entity_missing ({mapped})")
        prepared, schema_diagnostics = resolve_contract_schemas(prepared, states[0], states[1])
        for day_name, state in zip(("today", "tomorrow"), states):
            if state is None:
                continue
            status = str(schema_diagnostics.get(day_name, {}).get("status") or "")
            if strict and status == "unsupported_price_schema":
                raise ValueError(f"{day_name.upper()}: unsupported_price_schema")
        return prepared

    def validate_tariff_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        """Return a safe, normalized tariff configuration from the card."""
        if not isinstance(settings, dict):
            raise ValueError("Tariff settings must be an object")
        mode = str(settings.get(CONF_TARIFF_MODE, self.tariff_mode)).lower()
        if mode not in ("automatic", "manual"):
            raise ValueError("Unknown tariff mode")
        provider = str(settings.get(CONF_DSO_PROVIDER, self.dso_provider)).lower()
        plan = str(settings.get(CONF_TARIFF_PLAN, self.tariff_plan)).lower()
        selected_tariff = get_tariff(self.tariff_catalog, provider, plan)
        if mode == "automatic" and selected_tariff is None:
            raise ValueError("The selected tariff is not in the operator catalog")
        if mode == "automatic" and selected_tariff is not None:
            available, unavailable_reason = tariff_availability(selected_tariff, ha_now().date())
            if not available:
                raise ValueError(f"The selected tariff cannot be used yet: {unavailable_reason}")
        if provider not in self.tariff_catalog.get("providers", {}):
            raise ValueError("Unknown DSO operator")
        peak = self.safe_float(settings.get(CONF_DISTRIBUTION_PEAK_RATE), self.distribution_peak_rate)
        offpeak = self.safe_float(settings.get(CONF_DISTRIBUTION_OFFPEAK_RATE), self.distribution_offpeak_rate)
        if not 0 <= peak <= 10 or not 0 <= offpeak <= 10:
            raise ValueError("The distribution rate must be between 0 and 10 per kWh")
        windows = str(settings.get(CONF_CUSTOM_OFFPEAK_WINDOWS, self.custom_offpeak_windows)).strip()
        if mode == "manual" and not parse_windows(windows):
            raise ValueError("The manual profile requires valid time windows")
        buy_input = settings.get(CONF_BUY_PRICE_CONTRACT)
        sell_input = settings.get(CONF_SELL_PRICE_CONTRACT)
        if buy_input is not None and not isinstance(buy_input, dict):
            raise ValueError("The BUY contract must be an object")
        if sell_input is not None and not isinstance(sell_input, dict):
            raise ValueError("The SELL contract must be an object")
        custom_fields = {
            "source_adapter", "economic_role", "semantic_scope", "includes_distribution_variable",
            "price_basis", "includes_excise", "includes_service_margin", "unit",
            "granularity", "current_price_only", "list_attribute",
            "today_list_attribute", "tomorrow_list_attribute", "value_field",
            "start_field", "end_field", "period_field", "timestamp_field",
            "timestamp_role", "business_date_field", "vat_rate",
        }

        def editable_contract(direction: str, submitted: dict[str, Any] | None) -> dict[str, Any]:
            current = self.price_contract(direction)
            if not isinstance(submitted, dict):
                return current
            current_adapters = {
                str(current.get(f"resolved_adapter_{day_name}") or "unmapped")
                for day_name in ("today", "tomorrow")
                if str(current.get(f"{day_name}_entity") or "")
            }
            requested_adapter = str(submitted.get("source_adapter") or current.get("source_adapter") or "")
            # Known integrations own their schema and semantics.  The tariff
            # editor may only author a Custom contract for generic/custom
            # mappings; mapped entity fields always come from Options Flow.
            if requested_adapter != "custom" or any(
                adapter == "octopus_energy" for adapter in current_adapters
            ):
                return current
            candidate = dict(current)
            for field in custom_fields:
                if field in submitted:
                    candidate[field] = submitted[field]
            candidate.update({
                "source_adapter": "custom",
                "today_entity": str(current.get("today_entity") or ""),
                "tomorrow_entity": str(current.get("tomorrow_entity") or ""),
                "mapping_fingerprint": price_mapping_fingerprint(
                    current.get("today_entity"), current.get("tomorrow_entity")
                ),
            })
            return rebuild_price_contract(
                candidate,
                direction,
                candidate["today_entity"],
                candidate["tomorrow_entity"],
                "custom",
                "custom",
            )

        buy_contract = editable_contract("buy", buy_input)
        sell_contract = editable_contract("sell", sell_input)
        for direction, contract in (("BUY", buy_contract), ("SELL", sell_contract)):
            if (
                contract.get("source_adapter") == "custom"
                and contract.get("economic_role") not in SUPPORTED_ECONOMIC_ROLES
            ):
                raise ValueError(f"{direction}: select the economic role of the custom source")
        buy_contract = self.validate_and_bind_price_contract(
            buy_contract, strict=isinstance(buy_input, dict) and buy_contract.get("source_adapter") == "custom"
        )
        sell_contract = self.validate_and_bind_price_contract(
            sell_contract, strict=isinstance(sell_input, dict) and sell_contract.get("source_adapter") == "custom"
        )
        seller_id = str(settings.get(CONF_BUY_SELLER_ID, self.buy_seller_id) or "")
        seller_tariff_id = str(
            settings.get(CONF_BUY_SELLER_TARIFF_ID, self.buy_seller_tariff_id) or ""
        )
        buy_entities_empty = not str(buy_contract.get("today_entity") or "") and not str(
            buy_contract.get("tomorrow_entity") or ""
        )
        if seller_id and seller_id not in self.tariff_catalog.get("seller_tariffs", {}):
            raise ValueError("Unknown energy seller")
        if buy_entities_empty and seller_tariff_id:
            for target_day in (ha_now().date(), ha_now().date() + timedelta(days=1)):
                _resolved_id, entry, reason = resolve_seller_tariff(
                    self.tariff_catalog,
                    seller_id,
                    seller_tariff_id,
                    provider,
                    plan,
                    target_day,
                )
                if entry is None:
                    raise ValueError(f"The retailer tariff is not valid for {target_day.isoformat()}: {reason}")
        mapped_adapters = {
            str(contract.get(f"resolved_adapter_{day_name}") or "")
            for contract in (buy_contract, sell_contract)
            for day_name in ("today", "tomorrow")
            if str(contract.get(f"{day_name}_entity") or "")
        }
        price_source = (
            "none" if not mapped_adapters
            else "octopus_energy" if mapped_adapters == {"octopus_energy"}
            else "other"
        )
        return {
            CONF_TARIFF_MODE: mode,
            CONF_DSO_PROVIDER: provider,
            CONF_TARIFF_PLAN: plan,
            CONF_DISTRIBUTION_PEAK_RATE: round(peak, 5),
            CONF_DISTRIBUTION_OFFPEAK_RATE: round(offpeak, 5),
            CONF_CUSTOM_OFFPEAK_WINDOWS: windows,
            CONF_PRICE_SOURCE: price_source,
            CONF_PRICE_INCLUDES_DISTRIBUTION: buy_contract.get("includes_distribution_variable") is True,
            CONF_BUY_PRICE_CONTRACT: buy_contract,
            CONF_SELL_PRICE_CONTRACT: sell_contract,
            CONF_BUY_SELLER_ID: seller_id,
            CONF_BUY_SELLER_TARIFF_ID: seller_tariff_id,
            CONF_BUY_PRICE_TODAY_SENSOR: buy_contract.get("today_entity") or "",
            CONF_BUY_PRICE_TOMORROW_SENSOR: buy_contract.get("tomorrow_entity") or "",
            CONF_PRICE_SENSOR: sell_contract.get("today_entity") or "",
            CONF_SELL_PRICE_TOMORROW_SENSOR: sell_contract.get("tomorrow_entity") or "",
            CONF_GRID_POSITIVE_IS_IMPORT: bool(settings.get(CONF_GRID_POSITIVE_IS_IMPORT, self.data.get(CONF_GRID_POSITIVE_IS_IMPORT, DEFAULT_GRID_POSITIVE_IS_IMPORT))),
            CONF_BATTERY_POSITIVE_IS_DISCHARGE: bool(settings.get(CONF_BATTERY_POSITIVE_IS_DISCHARGE, self.data.get(CONF_BATTERY_POSITIVE_IS_DISCHARGE, DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE))),
        }

    async def async_update_tariff_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        normalized = self.validate_tariff_settings(settings)
        self.data.update(normalized)
        self._sanitize_cached_price_plans()
        self.request_sensor_snapshot_refresh({"ai_state", "diagnostics"})
        self.mark_config_saved()
        return normalized

    async def async_refresh_tariff_catalog(self) -> bool:
        if self._tariff_catalog_manager is None:
            return False
        changed = await self._tariff_catalog_manager.async_refresh(force=True)
        self._notify_update_for("tariff")
        return changed

    def weather_context(self) -> dict[str, Any]:
        state = self.hass.states.get(self.weather_entity) if self.weather_entity else None
        attrs = dict(state.attributes) if state is not None else {}
        cloud = self.safe_float(attrs.get("cloud_coverage"), 0)
        precipitation = self.safe_float(attrs.get("precipitation_probability"), 0)
        # Weather is a conservative auxiliary signal. Solcast remains the primary forecast.
        risk_factor = max(0.75, min(1.0, 1.0 - cloud * 0.0015 - precipitation * 0.001))
        return {
            "entity_id": self.weather_entity,
            "available": state is not None and state.state not in ("unknown", "unavailable"),
            "condition": state.state if state is not None else "unavailable",
            "temperature": attrs.get("temperature"),
            "temperature_unit": attrs.get("temperature_unit"),
            "pressure": attrs.get("pressure"),
            "pressure_unit": attrs.get("pressure_unit"),
            "humidity": attrs.get("humidity"),
            "wind_speed": attrs.get("wind_speed"),
            "wind_speed_unit": attrs.get("wind_speed_unit"),
            "wind_bearing": attrs.get("wind_bearing"),
            "wind_gust_speed": attrs.get("wind_gust_speed"),
            "visibility": attrs.get("visibility"),
            "visibility_unit": attrs.get("visibility_unit"),
            "cloud_coverage": attrs.get("cloud_coverage"),
            "precipitation_probability": attrs.get("precipitation_probability"),
            "precipitation_unit": attrs.get("precipitation_unit"),
            "risk_factor": round(risk_factor, 3),
            "forecast": self.weather_forecast[:48],
            "daily_forecast": self.weather_daily_forecast[:7],
            "hourly_count": len(self.weather_forecast[:48]),
            "daily_count": len(self.weather_daily_forecast[:7]),
            "last_updated": self.weather_last_updated,
            "last_error": self.weather_last_error,
        }

    @staticmethod
    def _price_from_object(item: Any) -> float | None:
        if not isinstance(item, dict):
            return None
        for key in (
            "price", "value", "state", "amount", "total", "net_price", "gross_price",
            "energy_price", "unit_price", "price_with_tax", "gbp_kwh", "gbp_per_kwh",
            "sell_price", "buy_price", "gbp", "rate", "rates",
        ):
            if key not in item:
                continue
            try:
                value = float(item[key])
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                return value
        return None

    def _price_slot_from_value(
        self,
        value: Any,
        fallback: int | None = None,
    ) -> tuple[date | None, int | None]:
        """Return local calendar date/hour for a provider price label.

        Offset-aware ISO values are converted to Home Assistant's local
        timezone before either field is read. Naive ISO values retain their
        existing local-wall-time meaning. Plain hourly labels remain undated.
        """
        if isinstance(value, (int, float)) and 0 <= int(value) <= 23:
            return None, int(value)
        text = str(value or "")
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is not None and parsed.utcoffset() is not None:
                local_tz = ha_now().tzinfo
                if local_tz is not None:
                    parsed = parsed.astimezone(local_tz)
            return parsed.date(), parsed.hour
        except (TypeError, ValueError):
            pass
        import re

        match = re.search(r"(?:^|\D)(\d{1,2})(?::\d{2})?", text)
        if match and 0 <= int(match.group(1)) <= 23:
            return None, int(match.group(1))
        return (
            None,
            fallback if fallback is not None and 0 <= fallback <= 23 else None,
        )

    def _hour_from_value(self, value: Any, fallback: int | None = None) -> int | None:
        """Compatibility wrapper returning only the localized hour."""
        return self._price_slot_from_value(value, fallback)[1]

    def _price_entries(
        self,
        entity_id: str | None,
        allow_state_fallback: bool = True,
    ) -> list[tuple[date | None, int, float]]:
        """Read ordered, localized price entries without losing their date."""
        state = self.hass.states.get(entity_id) if entity_id else None
        if state is None:
            return []
        result: list[tuple[date | None, int, float]] = []

        def add(item: Any, fallback: int | None = None) -> None:
            local_date: date | None = None
            hour: int | None = fallback
            value: float | None = None
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                local_date, hour = self._price_slot_from_value(item[0], fallback)
                try:
                    value = float(item[1])
                except (TypeError, ValueError):
                    value = None
            elif isinstance(item, dict):
                for key in (
                    "hour", "start", "from", "time", "date", "datetime", "timestamp",
                    "period", "label", "name", "start_time", "starts_at", "valid_from", "begin", "od",
                ):
                    if key in item:
                        local_date, hour = self._price_slot_from_value(item[key], fallback)
                        break
                value = self._price_from_object(item)
            else:
                try:
                    value = float(item)
                except (TypeError, ValueError):
                    value = None
            if hour is not None and value is not None and math.isfinite(value):
                result.append((local_date, hour, value))

        def parse(source: Any) -> None:
            if isinstance(source, list):
                for index, item in enumerate(source):
                    add(item, index if index < 24 else None)
            elif isinstance(source, dict):
                for index, (key, value) in enumerate(source.items()):
                    if isinstance(value, dict):
                        add({**value, "hour": value.get("hour", key)}, index if index < 24 else None)
                    else:
                        add([key, value], index if index < 24 else None)

        attrs = dict(state.attributes)
        for key in (
            "prices", "price", "today", "tomorrow", "hourly", "hours", "data", "values",
            "items", "entries", "forecast", "raw_today", "raw_tomorrow", "source", "price_list",
            "hourly_prices", "prices_today", "prices_tomorrow", "today_prices", "tomorrow_prices",
            "sell_prices", "buy_prices", "ceny", "ceny_godzinowe", "energy_prices",
        ):
            parse(attrs.get(key))
        if not result and allow_state_fallback:
            for key, value in attrs.items():
                if self._hour_from_value(key) is not None or isinstance(value, (list, dict)):
                    parse({key: value})
        if not result and allow_state_fallback:
            value = self.state_float_or_none(entity_id)
            if value is not None and math.isfinite(value):
                current = ha_now()
                result.append((current.date(), current.hour, value))
        return result

    def price_map(self, entity_id: str | None, allow_state_fallback: bool = True) -> dict[int, float]:
        """Read common hourly-price attribute layouts used by price integrations."""
        result: dict[int, float] = {}
        for _local_date, hour, value in self._price_entries(entity_id, allow_state_fallback):
            result.setdefault(hour, value)
        return result

    def price_maps(
        self,
        today_entity_id: str | None,
        tomorrow_entity_id: str | None,
        *,
        current: datetime | None = None,
    ) -> list[dict[int, float]]:
        """Bucket localized entries into DEM Today/Tomorrow maps."""
        reference = current or ha_now()
        maps: list[dict[int, float]] = [{}, {}]
        for source_day, (entity_id, allow_fallback) in enumerate((
            (today_entity_id, True),
            (tomorrow_entity_id, False),
        )):
            for local_date, hour, value in self._price_entries(entity_id, allow_fallback):
                day_offset = (
                    source_day
                    if local_date is None
                    else (local_date - reference.date()).days
                )
                if day_offset in (0, 1):
                    maps[day_offset].setdefault(hour, value)
        return maps

    @staticmethod
    def _canonical_price_day_signature(contract: dict[str, Any], day_name: str) -> tuple[Any, ...]:
        """Return the source identity and economics owned by one mapping slot."""
        binding = contract.get(f"{day_name}_binding")
        binding = binding if isinstance(binding, dict) else {}
        entity_id = str(contract.get(f"{day_name}_entity") or "")
        identity = str(binding.get("registry_entry_id") or entity_id)
        effective = effective_contract_for_day(contract, 0 if day_name == "today" else 1)
        return (
            identity,
            str(contract.get(f"resolved_adapter_{day_name}") or effective.get("source_adapter") or ""),
            str(effective.get("semantic_scope") or ""),
            str(effective.get("economic_role") or ""),
            effective.get("includes_distribution_variable"),
            effective.get("includes_excise"),
            effective.get("includes_service_margin"),
            str(effective.get("price_basis") or ""),
            str(effective.get("unit") or ""),
            str(effective.get("value_field") or ""),
            str(effective.get("list_attribute") or ""),
            str(effective.get("today_list_attribute") or ""),
            str(effective.get("tomorrow_list_attribute") or ""),
            str(effective.get("granularity") or ""),
        )

    def _sanitize_canonical_price_snapshot(self, snapshot: Any) -> bool:
        """Drop only cached direction/day rows that no longer match mappings.

        Persisted optimizer output is presentation/cache state, never source
        authority. This one-shot guard runs on load or an explicit tariff save;
        it does not add polling, listeners or Core executions.
        """
        if not isinstance(snapshot, dict) or snapshot.get("schema_version") != 1:
            return False
        changed = False
        for direction in ("buy", "sell"):
            current = self.price_contract(direction)
            branch = snapshot.get(direction)
            if not isinstance(branch, dict):
                continue
            cached_contract = branch.get("contract")
            cached_contract = cached_contract if isinstance(cached_contract, dict) else {}
            rows = [row for row in branch.get("rows", []) if isinstance(row, dict)]
            diagnostics = branch.get("diagnostics")
            diagnostics = dict(diagnostics) if isinstance(diagnostics, dict) else {}
            day_status = dict(diagnostics.get("day_status") or {})
            resolver = dict(diagnostics.get("resolver") or {})
            branch_changed = False
            for day_name in ("today", "tomorrow"):
                mapped = str(current.get(f"{day_name}_entity") or "")
                current_signature = self._canonical_price_day_signature(current, day_name)
                cached_signature = self._canonical_price_day_signature(cached_contract, day_name)
                effective = effective_contract_for_day(current, 0 if day_name == "today" else 1)
                current_adapter = str(
                    current.get(f"resolved_adapter_{day_name}")
                    or effective.get("source_adapter")
                    or "unmapped"
                )
                incompatible_row = any(
                    row.get("day") == day_name
                    and (
                        str(row.get("source_adapter") or "") != current_adapter
                        or str(row.get("source_semantic_scope") or "")
                        != str(effective.get("semantic_scope") or "")
                        or str(row.get("source_economic_role") or "")
                        != str(effective.get("economic_role") or "")
                    )
                    for row in rows
                )
                invalidate = not mapped or current_signature != cached_signature or incompatible_row
                if not invalidate:
                    continue
                before = len(rows)
                rows = [row for row in rows if row.get("day") != day_name]
                branch_changed = branch_changed or len(rows) != before or current_signature != cached_signature
                diagnostics[f"coverage_{day_name}"] = 0
                day_status[day_name] = "unmapped" if not mapped else "waiting_data"
                current_resolver = {
                    "mapped_entity": mapped,
                    "resolved_entity": str(current.get(f"resolved_{day_name}_entity") or mapped),
                    "stable_identity_status": str(current.get(f"stable_identity_{day_name}_status") or ("unmapped" if not mapped else "unbound")),
                    "detected_adapter": current_adapter,
                    "resolved_schema": "unknown" if mapped else "missing",
                    "coverage_hours": 0,
                    "status": "waiting_data" if mapped else "unmapped",
                    "reason": "cache_invalidated" if mapped else "user_unmapped",
                }
                if mapped:
                    current_resolver.update({
                        "unit": effective.get("unit"),
                        "economic_role": effective.get("economic_role"),
                        "semantic_scope": effective.get("semantic_scope"),
                    })
                resolver[day_name] = current_resolver
            branch["rows"] = rows
            branch["contract"] = deepcopy(current)
            diagnostics["day_status"] = day_status
            diagnostics["resolver"] = resolver
            if not str(current.get("today_entity") or "") and not str(current.get("tomorrow_entity") or ""):
                diagnostics["status"] = "price_source_not_configured"
            elif branch_changed and not rows:
                diagnostics["status"] = "waiting_data"
            branch["diagnostics"] = diagnostics
            snapshot[direction] = branch
            changed = changed or branch_changed
        return changed

    def _sanitize_cached_price_plans(self) -> bool:
        """Sanitize the live canonical price cache without touching history."""
        return self._sanitize_canonical_price_snapshot(self._canonical_price_snapshot)

    def canonical_price_context(
        self,
        current: datetime,
        tariff_rows: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Build the single backend price truth consumed by Core and the card."""
        distribution_by_slot: dict[tuple[date, int], float] = {}
        for row in tariff_rows:
            if not isinstance(row, dict) or row.get("available", True) is False:
                continue
            try:
                row_date = date.fromisoformat(str(row.get("date") or ""))
                row_hour = int(row.get("hour"))
            except (TypeError, ValueError):
                continue
            if 0 <= row_hour <= 23:
                distribution_by_slot[(row_date, row_hour)] = self.safe_float(
                    row.get("total_distribution_rate", row.get("rate")), 0
                )
        results: dict[str, Any] = {"schema_version": 1}
        for direction in ("buy", "sell"):
            contract = self.price_contract(direction)
            today_entity = str(contract.get("resolved_today_entity") or contract.get("today_entity") or "")
            tomorrow_entity = str(contract.get("resolved_tomorrow_entity") or contract.get("tomorrow_entity") or "")
            today_state = self.hass.states.get(today_entity) if today_entity else None
            tomorrow_state = self.hass.states.get(tomorrow_entity) if tomorrow_entity else None
            use_seller_catalog = (
                direction == "buy"
                and not str(contract.get("today_entity") or "")
                and not str(contract.get("tomorrow_entity") or "")
                and bool(self.buy_seller_id)
            )
            result = (
                seller_catalog_canonical_buy(
                    current,
                    self.tariff_catalog,
                    self.buy_seller_id,
                    self.buy_seller_tariff_id,
                    self.dso_provider,
                    self.tariff_plan,
                    distribution_by_slot,
                )
                if use_seller_catalog
                else build_canonical_direction(
                    contract,
                    today_state,
                    tomorrow_state,
                    current,
                    distribution_by_slot,
                )
            )
            resolver = result.setdefault("diagnostics", {}).setdefault("resolver", {})
            if use_seller_catalog:
                results[direction] = result
                continue
            for day_name in ("today", "tomorrow"):
                mapped = str(contract.get(f"{day_name}_entity") or "")
                resolved = str(contract.get(f"resolved_{day_name}_entity") or mapped)
                stable_status = str(contract.get(f"stable_identity_{day_name}_status") or "unbound")
                stable_reason = str(contract.get(f"stable_identity_{day_name}_reason") or "")
                branch = resolver.setdefault(day_name, {})
                schema = branch.get("resolved_schema") if isinstance(branch.get("resolved_schema"), dict) else {}
                day_contract = effective_contract_for_day(contract, 0 if day_name == "today" else 1)
                branch.update({
                    "mapped_entity": mapped,
                    "resolved_entity": resolved,
                    "stable_identity_status": stable_status,
                    "detected_adapter": contract.get(f"resolved_adapter_{day_name}") or day_contract.get("source_adapter"),
                    "resolved_schema": schema.get("schema_id") or "unknown",
                    "list_attribute": schema.get("list_attribute") or "",
                    "value_field": schema.get("value_field") or "",
                    "unit": day_contract.get("unit"),
                    "economic_role": day_contract.get("economic_role"),
                    "semantic_scope": day_contract.get("semantic_scope"),
                    "coverage_hours": sum(
                        1 for row in result.get("rows", []) if row.get("day") == day_name
                    ),
                    "reason": stable_reason or branch.get("status") or "",
                })
                if stable_status == "mapped_entity_missing":
                    branch["status"] = "mapped_entity_missing"
                elif stable_status == "unmapped":
                    branch["status"] = "unmapped"
                    branch["reason"] = "user_unmapped"
                    result.setdefault("diagnostics", {}).setdefault("day_status", {})[day_name] = "unmapped"
            if all(
                str(contract.get(f"stable_identity_{day_name}_status") or "") == "unmapped"
                for day_name in ("today", "tomorrow")
            ):
                result["diagnostics"]["status"] = "price_source_not_configured"
            results[direction] = result
        self._canonical_price_snapshot = deepcopy(results)
        return results




    def register_entity(self, entity: Any) -> None:
        if entity not in self.entities:
            self.entities.append(entity)

    def unregister_entity(self, entity: Any) -> None:
        if entity in self.entities:
            self.entities.remove(entity)
        self._entity_publish_signatures.pop(id(entity), None)

    def _entity_public_signature(self, entity: Any) -> Any:
        """Build the same public state/attribute signature HA would publish."""
        try:
            if hasattr(type(entity), "is_on"):
                public_state = getattr(entity, "is_on")
            elif hasattr(type(entity), "native_value"):
                public_state = getattr(entity, "native_value")
            elif hasattr(type(entity), "current_option"):
                public_state = getattr(entity, "current_option")
            else:
                public_state = getattr(entity, "state", None)
            attributes_factory = getattr(entity, "_async_generate_attributes", None)
            entity_key = str(getattr(entity, "_deye_manager_key", ""))
            if entity_key == "ai_state":
                return (
                    "ai_state",
                    getattr(entity, "available", True),
                    public_state,
                    self._ai_state_snapshot_id,
                )
            if entity_key == "diagnostics":
                # Diagnostics is already a granular channel. Avoid hashing its
                # growing metrics on every unrelated full publication.
                return None
            attributes = (
                attributes_factory()
                if callable(attributes_factory)
                else getattr(entity, "extra_state_attributes", None)
            )
            try:
                attributes_identity = snapshot_id(attributes)
            except (TypeError, ValueError):
                attributes_identity = repr(attributes)
            return (
                getattr(entity, "available", True),
                public_state,
                attributes_identity,
            )
        except Exception:
            # A custom entity getter must never be allowed to suppress a write.
            return None

    @callback
    def _notify_update_for(self, reason: str) -> None:
        """Tag one legacy no-argument publication without changing its contract."""
        previous = self._performance_publish_reason
        self._performance_publish_reason = reason
        try:
            self.notify_update()
        finally:
            self._performance_publish_reason = previous

    @callback
    def notify_update(self, reason: str | None = None) -> None:
        reason = reason or self._performance_publish_reason or "other"
        self.runtime_metrics["notify_update_count"] += 1
        if self._platform_setup_in_progress:
            self._platform_publish_pending = True
            self._sensor_snapshot_requested_keys.update({"ai_state", "diagnostics"})
            self._sensor_snapshot_pending = True
            return
        self._performance.inc("notify_update_full_calls")
        self._performance.inc_map("notify_update_full_by_reason", reason)
        self.request_sensor_snapshot_refresh()
        publish_started = time.perf_counter()
        self._notify_entities_from_cache(reason=reason)
        self._performance.observe_ms(
            "full_publish",
            (time.perf_counter() - publish_started) * 1000.0,
        )

    @callback
    def _notify_entities_from_cache(
        self,
        entity_keys: set[str] | None = None,
        *,
        reason: str = "granular",
    ) -> int:
        if entity_keys is not None:
            self._performance.inc("notify_granular_calls")
        published = 0
        for entity in list(self.entities):
            if (
                getattr(entity, "hass", None) is not None
                and (
                    entity_keys is None
                    or getattr(entity, "_deye_manager_key", None) in entity_keys
                )
            ):
                identity = id(entity)
                signature = self._entity_public_signature(entity)
                if (
                    entity_keys is None
                    and signature is not None
                    and self._entity_publish_signatures.get(identity) == signature
                ):
                    continue
                self._performance.record_entity_write(
                    getattr(entity, "_deye_manager_key", "unknown"),
                    reason,
                    channel=("proxy" if getattr(entity, "source_fn", None) is not None else None),
                )
                entity.async_write_ha_state()
                if signature is not None:
                    self._entity_publish_signatures[identity] = signature
                published += 1
        return published

    def request_sensor_snapshot_refresh(
        self,
        entity_keys: set[str] | None = None,
    ) -> Any:
        """Coalesce expensive publication snapshot rebuilds outside getters."""
        self._sensor_snapshot_requested_keys.update(
            entity_keys or {"ai_state", "diagnostics"}
        )
        self._sensor_snapshot_pending = True
        task = self._sensor_snapshot_task
        if (
            self._startup_in_progress
            or self._platform_setup_in_progress
            or self._unloading
            or (task is not None and not task.done())
        ):
            return task
        task = self.hass.async_create_task(self.async_refresh_sensor_snapshots())
        self._sensor_snapshot_task = task
        return task

    def build_ai_state_snapshot(self) -> dict[str, Any]:
        """Build the retained ai_state publication payload outside entity getters."""
        return {
            "manual_schedule": self.manual_schedule_state(),
            "energy_status_display": self.energy_status_display_state(),
            "power_flow_display": entity_map.power_flow_display(),
            "weather": self.weather_context(),
            "tariff": self.tariff_context(),
            "daily_summary": self.history_daily_summary(),
            "monthly_summary": self.history_monthly_summary(),
            "solcast_history": (
                self.solcast_history if self.pv_generation_enabled else []
            ),
            "energy_samples": (
                self._energy_recent_details[-288:]
                if self._energy_recent_details
                else self.energy_samples[-288:]
            ),
            "current_hour_partial": self.current_hour_partial_context(),
            "live_state": self.live_state_context(),
        }

    def diagnostics_public_snapshot(self) -> dict[str, Any]:
        """Return the cached heavy diagnostics snapshot."""
        return dict(self._diagnostics_snapshot)

    async def async_refresh_sensor_snapshots(self) -> None:
        """Build ai_state and diagnostics snapshots single-flight, never in a getter."""
        if self._unloading:
            return
        current = asyncio.current_task()
        active = self._sensor_snapshot_task
        if active is not None and active is not current and not active.done():
            self._sensor_snapshot_pending = True
            await asyncio.shield(active)
            return
        if active is None or active.done():
            self._sensor_snapshot_task = current
        follow_up_used = False
        changed_keys: set[str] = set()
        try:
            while True:
                self._sensor_snapshot_pending = False
                requested_keys = set(self._sensor_snapshot_requested_keys)
                self._sensor_snapshot_requested_keys.clear()
                await asyncio.sleep(0)
                if "ai_state" in requested_keys:
                    snapshot_started = time.perf_counter()
                    ai_snapshot = self.build_ai_state_snapshot()
                    self._performance.observe_ms(
                        "ai_snapshot_build",
                        (time.perf_counter() - snapshot_started) * 1000.0,
                    )
                    ai_snapshot_id = snapshot_id(ai_snapshot)
                    if ai_snapshot_id != self._ai_state_snapshot_id:
                        self._ai_state_snapshot = ai_snapshot
                        self._ai_state_snapshot_id = ai_snapshot_id
                        changed_keys.add("ai_state")
                if "diagnostics" in requested_keys:
                    diagnostics_started = time.perf_counter()
                    diagnostics_snapshot = self.diagnostics()
                    self._performance.observe_ms(
                        "diagnostics_build",
                        (time.perf_counter() - diagnostics_started) * 1000.0,
                    )
                    diagnostics_snapshot_id = snapshot_id(diagnostics_snapshot)
                    if diagnostics_snapshot_id != self._diagnostics_snapshot_id:
                        self._diagnostics_snapshot = diagnostics_snapshot
                        self._diagnostics_snapshot_id = diagnostics_snapshot_id
                        changed_keys.add("diagnostics")
                if self._sensor_snapshot_pending and not follow_up_used:
                    follow_up_used = True
                    continue
                break
        finally:
            if self._sensor_snapshot_task is current:
                self._sensor_snapshot_task = None
        if changed_keys:
            self.runtime_metrics["snapshot_publish_count"] += 1
            self._notify_entities_from_cache(
                changed_keys,
                reason="sensor_snapshot",
            )
        if self._sensor_snapshot_pending and not self._unloading:
            self.request_sensor_snapshot_refresh()


        # Do not create an automatic recovery chain after the single controlled
        # follow-up.  A later independent debounce/tick may consume the retained
        # dirty bit and reasons in a fresh bounded cycle.

    def active_slot_key(self) -> str:
        now = ha_now()
        return slot_key_at_minute(now.hour * 60 + now.minute)

    def effective_slots(self) -> dict[str, SlotSettings]:
        """Return all 48 slots as seen by the scheduler's active source."""
        return {key: self.effective_slot_for_key(key) for key, *_rest in SLOTS}

    def effective_slot_for_key(self, slot_key: str) -> SlotSettings:
        """Return the slot that currently drives the scheduler.

        Work Schedule and Manual Schedule are independent sources.  While the
        manual source is active its rows supply the logical trigger fields;
        fields a manual row does not carry are inherited from the work slot.
        The work schedule itself is never modified.
        """
        work_slot = self.slots[slot_key]
        overlay = self._manual_effective_rows.get(slot_key)
        if not self.manual_schedule_active or not overlay:
            return work_slot
        return replace(work_slot, **overlay)

    def effective_slot_at_minute(self, minute_of_day: int) -> SlotSettings:
        """Return the effective slot covering a minute of the day."""
        return self.effective_slot_for_key(slot_key_at_minute(int(minute_of_day)))

    @property
    def active_slot(self) -> SlotSettings:
        return self.effective_slot_for_key(self.active_slot_key())

    def state_float(self, entity_id: str | None, default: float = 0) -> float:
        value = self.state_float_or_none(entity_id)
        return default if value is None else value

    def state_float_or_none(self, entity_id: str | None) -> float | None:
        """Return a finite numeric state or None when the source is not trustworthy."""
        if not entity_id:
            return None
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            return None
        try:
            value = float(state.state)
        except (TypeError, ValueError):
            return None
        return value if math.isfinite(value) else None

    @staticmethod
    def _timestamp_age_seconds(moment: Any) -> float | None:
        """Return a timezone-safe non-negative age for one HA report timestamp."""
        if not isinstance(moment, datetime):
            return None
        try:
            return max(0.0, (ha_now() - moment).total_seconds())
        except TypeError:
            return None

    @staticmethod
    def _source_health_threshold_seconds(state: Any, fallback: int = 900) -> int:
        """Derive a bounded health TTL from provider metadata when it exists."""
        attributes = getattr(state, "attributes", {}) if state is not None else {}
        for key in (
            "update_interval_seconds",
            "scan_interval_seconds",
            "poll_interval_seconds",
            "update_interval",
            "scan_interval",
        ):
            raw = attributes.get(key) if isinstance(attributes, dict) else None
            if isinstance(raw, timedelta):
                interval = raw.total_seconds()
            else:
                interval = finite_float(raw)
            if interval is not None and interval > 0:
                # Four missed reports is a conservative communication boundary;
                # keep it bounded so bad metadata cannot retain SOC indefinitely.
                return int(max(60, min(3600, interval * 4)))
        return int(fallback)

    def _entity_source_identity(self, entity_id: str | None) -> tuple[str, str] | None:
        """Return a registry-backed source identity, never an entity-name guess."""
        if not entity_id:
            return None
        try:
            from homeassistant.helpers import entity_registry as er  # local HA runtime

            entry = er.async_get(self.hass).async_get(entity_id)
        except (ImportError, AttributeError, KeyError, TypeError):
            entry = None
        if entry is None:
            return None
        device_id = getattr(entry, "device_id", None)
        if device_id:
            return ("device", str(device_id))
        config_entry_id = getattr(entry, "config_entry_id", None)
        if config_entry_id:
            return ("config_entry", str(config_entry_id))
        config_entry_ids = getattr(entry, "config_entry_ids", None)
        if config_entry_ids:
            normalized = ",".join(sorted(str(item) for item in config_entry_ids))
            if normalized:
                return ("config_entries", normalized)
        return None

    def _soc_sibling_entity_ids(self) -> tuple[str, ...]:
        """Return the provider-agnostic measurement cohort eligible for health."""
        return tuple(dict.fromkeys(
            entity_id
            for entity_id in (
                self.battery_bms_voltage_sensor,
                self.battery_current_sensor,
                self.battery_power_sensor,
                self.grid_power_sensor,
                self.pv_power_sensor,
                self.load_power_sensor,
            )
            if entity_id and entity_id != self.battery_soc_sensor
        ))

    def _verified_soc_sibling(self, entity_id: str | None) -> bool:
        """Accept health only from the exact SOC device/config-entry identity."""
        soc_identity = self._entity_source_identity(self.battery_soc_sensor)
        sibling_identity = self._entity_source_identity(entity_id)
        return soc_identity is not None and sibling_identity == soc_identity

    def _soc_sibling_health(self) -> dict[str, Any] | None:
        """Return the newest verified sibling report, independent of its value."""
        candidates: list[dict[str, Any]] = []
        for entity_id in self._soc_sibling_entity_ids():
            if not self._verified_soc_sibling(entity_id):
                continue
            state = self.hass.states.get(entity_id)
            if state is None or str(state.state).strip().lower() in {
                "unknown", "unavailable", "none", "",
            }:
                continue
            reported = getattr(state, "last_reported", None)
            observed = self._soc_source_observed_at.get(entity_id)
            updated = getattr(state, "last_updated", None)
            timestamps = [
                item for item in (reported, observed, updated) if isinstance(item, datetime)
            ]
            if not timestamps:
                continue
            moment = max(timestamps)
            candidates.append({
                "entity_id": entity_id,
                "at": moment,
                "age_seconds": self._timestamp_age_seconds(moment),
                "threshold_seconds": self._source_health_threshold_seconds(state),
            })
        return max(candidates, key=lambda item: item["at"]) if candidates else None

    def _observe_soc_sibling_event(self, event: Any) -> bool:
        """Record one verified sibling report and detect a SOC quality transition."""
        event_data = getattr(event, "data", event if isinstance(event, dict) else {})
        entity_id = str(event_data.get("entity_id") or "")
        if not self._verified_soc_sibling(entity_id):
            return False
        state = event_data.get("new_state") or self.hass.states.get(entity_id)
        moment = getattr(state, "last_reported", None) if state is not None else None
        if not isinstance(moment, datetime):
            moment = getattr(event, "time_fired", None)
        if not isinstance(moment, datetime):
            moment = ha_now()
        self._soc_source_observed_at[entity_id] = moment
        return self._refresh_soc_quality_signature()

    def soc_diagnostics(self, stale_after_seconds: int = 900) -> dict[str, Any]:
        """Return SOC value plus independent, provider-agnostic source health."""
        entity_id = self.battery_soc_sensor
        state = self.hass.states.get(entity_id) if entity_id else None
        raw_value = state.state if state is not None else None
        updated = getattr(state, "last_updated", None) if state is not None else None
        reported = getattr(state, "last_reported", None) if state is not None else None
        changed = getattr(state, "last_changed", None) if state is not None else None
        observed = (
            self._soc_observed_at
            if entity_id and self._soc_observed_entity_id == entity_id
            else None
        )
        reported_age = self._timestamp_age_seconds(reported)
        own_threshold = self._source_health_threshold_seconds(state, stale_after_seconds)
        sibling = self._soc_sibling_health()
        compatibility_at = observed if isinstance(observed, datetime) else updated
        compatibility_age = self._timestamp_age_seconds(compatibility_at)

        health_at: datetime | None = None
        health_source = "unavailable"
        freshness_reason = "no_fresh_source_health"
        effective_threshold = own_threshold
        if reported_age is not None and reported_age <= own_threshold:
            health_at = reported
            health_source = "own_soc_report"
            freshness_reason = "own_soc_report"
        elif sibling is not None and sibling.get("age_seconds") is not None and (
            sibling["age_seconds"] <= sibling["threshold_seconds"]
        ):
            health_at = sibling["at"]
            health_source = f"sibling_health:{sibling['entity_id']}"
            freshness_reason = "sibling_health"
            effective_threshold = int(sibling["threshold_seconds"])
        elif compatibility_age is not None and compatibility_age <= stale_after_seconds:
            health_at = compatibility_at
            health_source = (
                "event_observed_at" if isinstance(observed, datetime) else "last_updated_fallback"
            )
            freshness_reason = "compatibility_fallback"
            effective_threshold = int(stale_after_seconds)
        else:
            stale_candidates: list[tuple[datetime, str, int]] = []
            if isinstance(reported, datetime):
                stale_candidates.append((reported, "own_soc_report", own_threshold))
            if sibling is not None and isinstance(sibling.get("at"), datetime):
                stale_candidates.append((
                    sibling["at"],
                    f"sibling_health:{sibling['entity_id']}",
                    int(sibling["threshold_seconds"]),
                ))
            if isinstance(compatibility_at, datetime):
                stale_candidates.append((compatibility_at, "compatibility_fallback", stale_after_seconds))
            if stale_candidates:
                health_at, health_source, effective_threshold = max(
                    stale_candidates, key=lambda item: item[0]
                )

        age_seconds = self._timestamp_age_seconds(health_at)

        normalized: float | None = None
        reason: str | None = None
        if not entity_id:
            status, reason = "not_configured", "SOC entity not configured"
        elif state is None:
            status, reason = "unavailable", "The SOC entity does not exist in the current HA state"
        elif str(raw_value).strip().lower() in {"", "unknown", "unavailable", "none"}:
            status = str(raw_value).strip().lower() or "unknown"
            reason = f"The SOC entity has state {status}"
        else:
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                value = float("nan")
            if not math.isfinite(value):
                status, reason = "invalid", "SOC is not a finite number"
            elif not 0.0 <= value <= 100.0:
                status, reason = "out_of_range", "SOC must be between 0 and 100%"
            elif health_at is None or age_seconds is None or age_seconds > effective_threshold:
                status = "stale"
                reason = (
                    "No fresh, trustworthy SOC source health"
                    if age_seconds is None
                    else f"SOC source health is older than {effective_threshold} s "
                    f"({round(age_seconds)} s)"
                )
            else:
                status = "valid"
                normalized = value

        valid = status == "valid"
        return {
            "source_entity": entity_id,
            "entity_id": entity_id,
            "raw_value": raw_value,
            "normalized_value": normalized,
            "value": normalized,
            "unit": str(state.attributes.get("unit_of_measurement") or "") if state else None,
            "status": status,
            "valid": valid,
            "reason": reason,
            "last_updated": updated.isoformat() if isinstance(updated, datetime) else None,
            "last_reported": reported.isoformat() if isinstance(reported, datetime) else None,
            "reported_at": reported.isoformat() if isinstance(reported, datetime) else None,
            "soc_reported_at": reported.isoformat() if isinstance(reported, datetime) else None,
            "soc_report_age_seconds": round(reported_age, 1) if reported_age is not None else None,
            "observed_at": observed.isoformat() if isinstance(observed, datetime) else None,
            "value_changed_at": (
                changed.isoformat()
                if isinstance(changed, datetime)
                else updated.isoformat() if isinstance(updated, datetime) else None
            ),
            # Preserve the 5G.4F public field while exposing the richer 5G.4I
            # source class separately.
            "freshness_source": (
                "last_reported"
                if freshness_reason == "own_soc_report"
                else "event_observed_at"
                if health_source == "event_observed_at"
                else "last_updated_fallback"
                if health_source == "last_updated_fallback"
                else health_source
            ),
            "source_health_source": health_source,
            "source_health_at": health_at.isoformat() if isinstance(health_at, datetime) else None,
            "source_health_age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
            "effective_soc_freshness_at": health_at.isoformat() if isinstance(health_at, datetime) else None,
            "effective_soc_age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
            "freshness_reason": freshness_reason,
            "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
            "stale_after_seconds": effective_threshold,
            "effective_threshold_seconds": effective_threshold,
            "quality": "good" if valid else "degraded" if status == "stale" else "unavailable",
            "source": "primary" if valid else "unavailable",
        }

    def current_soc_or_none(self) -> float | None:
        """Return a fresh, finite SOC in the physical 0–100% range."""
        return self.soc_diagnostics().get("normalized_value")

    @staticmethod
    def _soc_semantic_signature(diagnostics: dict[str, Any]) -> tuple[str, float | None]:
        """Return only material SOC state, never a report timestamp."""
        value = finite_float(diagnostics.get("normalized_value"))
        return (
            str(diagnostics.get("status") or "unknown"),
            round(value, 6) if value is not None else None,
        )

    def _refresh_soc_quality_signature(self) -> bool:
        """Remember SOC quality and report whether its semantics changed."""
        current = self._soc_semantic_signature(self.soc_diagnostics())
        previous = self._soc_quality_signature
        self._soc_quality_signature = current
        return previous is not None and previous != current

    def _observe_soc_source_event(self, event: Any) -> bool:
        """Record one real SOC source event without making it a Core input."""
        event_data = getattr(event, "data", event if isinstance(event, dict) else {})
        entity_id = str(event_data.get("entity_id") or self.battery_soc_sensor or "")
        state = event_data.get("new_state") or (
            self.hass.states.get(entity_id) if entity_id else None
        )
        event_time = getattr(state, "last_reported", None) if state is not None else None
        if not isinstance(event_time, datetime):
            event_time = getattr(event, "time_fired", None)
        if not isinstance(event_time, datetime):
            # Reaching this callback is itself evidence of a real source event.
            event_time = ha_now()
        self._soc_observed_entity_id = entity_id or None
        self._soc_observed_at = event_time
        return self._refresh_soc_quality_signature()

    @staticmethod
    def _state_event_is_report_only(event_data: dict[str, Any]) -> bool:
        """Return true when a complete HA event carries no value/attribute change."""
        old_state = event_data.get("old_state")
        new_state = event_data.get("new_state")
        return bool(
            old_state is not None
            and new_state is not None
            and getattr(old_state, "state", None) == getattr(new_state, "state", None)
            and getattr(old_state, "attributes", {}) == getattr(new_state, "attributes", {})
        )

    def _measurement(
        self,
        entity_id: str | None,
        *,
        kind: str = "power",
        stale_after_seconds: int = 900,
    ) -> dict[str, Any]:
        """Describe one source, normalized to W or kWh, without a zero fallback."""
        state = self.hass.states.get(entity_id) if entity_id else None
        unit = str(state.attributes.get("unit_of_measurement") or "") if state is not None else ""
        assumed_unit = unit or ("W" if kind == "power" else "kWh" if kind == "energy" else "")
        value = (
            power_w(state.state, assumed_unit)
            if state is not None and kind == "power"
            else energy_kwh(state.state, assumed_unit)
            if state is not None and kind == "energy"
            else finite_float(state.state) if state is not None else None
        )
        updated = getattr(state, "last_updated", None) if state is not None else None
        stale = False
        if isinstance(updated, datetime):
            try:
                stale = (ha_now() - updated).total_seconds() > stale_after_seconds
            except TypeError:
                stale = False
        status = "not_configured" if not entity_id else "missing" if state is None else "invalid_unit" if value is None and state.state not in ("unknown", "unavailable", "none", "") else "unavailable" if value is None else "stale" if stale else "ok"
        return {
            "entity_id": entity_id,
            "value": value,
            "unit": unit or (assumed_unit if state is not None else None),
            "unit_assumed": bool(state is not None and not unit and assumed_unit),
            "last_updated": updated.isoformat() if isinstance(updated, datetime) else None,
            "status": status,
            "quality": "good" if status == "ok" else "unavailable" if status in ("not_configured", "missing", "unavailable") else "degraded",
            "source": "primary",
        }

    def load_power_reading(self) -> dict[str, Any]:
        """Resolve total LOAD once, keeping phase measurements as details only."""
        primary = self._measurement(self.load_power_sensor)
        phases = [
            self._measurement(self.load_l1_power_sensor),
            self._measurement(self.load_l2_power_sensor),
            self._measurement(self.load_l3_power_sensor),
        ]
        phase_values = [item.get("value") for item in phases]
        complete_phases = all(value is not None for value in phase_values)
        phase_sum = sum(float(value) for value in phase_values) if complete_phases else None

        if primary["value"] is not None and primary["status"] != "stale":
            result = dict(primary)
            if phase_sum is not None:
                denominator = max(100.0, abs(float(primary["value"])), abs(phase_sum))
                mismatch = abs(float(primary["value"]) - phase_sum) / denominator
                result["phase_sum_w"] = round(phase_sum, 3)
                result["phase_mismatch_percent"] = round(mismatch * 100, 1)
                if mismatch > 0.15:
                    result.update(status="inconsistent", quality="degraded")
            result["phases"] = phases
            self.data_quality["load_power"] = result
            return result

        if complete_phases:
            result = {
                "entity_id": " + ".join(item.get("entity_id") or "?" for item in phases),
                "value": phase_sum,
                "unit": "W",
                "last_updated": max((item.get("last_updated") or "" for item in phases), default="") or None,
                "status": "fallback",
                "quality": "degraded",
                "source": "load_phases",
                "fallback_reason": f"Load Power: {primary['status']}",
                "phases": phases,
                "phase_sum_w": round(phase_sum, 3),
            }
            self.data_quality["load_power"] = result
            return result

        # Emergency balance uses the same sign conventions as the planner:
        # load = PV + grid import + battery discharge.
        pv = self._pv_generation_reading()
        grid_value = self.normalized_grid_power() if self.entity_available(self.grid_power_sensor) else None
        battery_value = self.battery_power_reading().get("value")
        if pv["value"] is not None and grid_value is not None and battery_value is not None:
            result = {
                "entity_id": None,
                "value": max(0.0, float(pv["value"]) + float(grid_value) + float(battery_value)),
                "unit": "W",
                "last_updated": None,
                "status": "emergency_fallback",
                "quality": "low",
                "source": "energy_balance",
                "fallback_reason": f"Load Power: {primary['status']}; incomplete phases",
                "phases": phases,
            }
            self.data_quality["load_power"] = result
            return result

        result = {
            **primary,
            "value": None,
            "source": "unavailable",
            "quality": "unavailable",
            "phases": phases,
        }
        self.data_quality["load_power"] = result
        return result

    def battery_power_reading(self) -> dict[str, Any]:
        """Prefer direct battery power; use V×A only as a marked fallback."""
        direct = self._measurement(self.battery_power_sensor)
        if direct["value"] is not None and direct["status"] != "stale":
            value = float(direct["value"])
            if not bool(self.data.get(CONF_BATTERY_POSITIVE_IS_DISCHARGE, DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE)):
                value = -value
            result = {**direct, "value": value}
            self.data_quality["battery_power"] = result
            return result
        voltage = self._measurement(self.battery_bms_voltage_sensor, kind="raw")
        current = self._measurement(self.battery_current_sensor, kind="raw")
        if voltage["value"] is not None and current["value"] is not None:
            value = float(voltage["value"]) * float(current["value"])
            if not bool(self.data.get(CONF_BATTERY_POSITIVE_IS_DISCHARGE, DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE)):
                value = -value
            result = {
                "entity_id": f"{self.battery_bms_voltage_sensor} × {self.battery_current_sensor}",
                "value": value,
                "unit": "W",
                "last_updated": None,
                "status": "fallback",
                "quality": "degraded",
                "source": "voltage_times_current",
                "fallback_reason": f"Battery Power: {direct['status']}",
            }
            self.data_quality["battery_power"] = result
            return result
        result = {**direct, "value": None, "source": "unavailable", "quality": "unavailable"}
        self.data_quality["battery_power"] = result
        return result

    def grid_power_reading(self) -> dict[str, Any]:
        """Resolve signed grid power and reject a misleading Solarman total."""
        positive_is_import = bool(
            self.data.get(CONF_GRID_POSITIVE_IS_IMPORT, DEFAULT_GRID_POSITIVE_IS_IMPORT)
        )

        def signed(reading: dict[str, Any]) -> dict[str, Any]:
            result = dict(reading)
            if result.get("value") is not None:
                value = float(result["value"])
                result["value"] = value if positive_is_import else -value
            return result

        primary = signed(self._measurement(self.grid_power_sensor))
        phases = [
            signed(self._measurement(self.grid_l1_power_sensor)),
            signed(self._measurement(self.grid_l2_power_sensor)),
            signed(self._measurement(self.grid_l3_power_sensor)),
        ]
        phase_values = [item.get("value") for item in phases]
        complete_phases = all(value is not None for value in phase_values)
        phase_sum = sum(float(value) for value in phase_values) if complete_phases else None

        if primary.get("value") is not None and primary.get("status") != "stale":
            result = dict(primary)
            result["phases"] = phases
            if phase_sum is not None:
                denominator = max(100.0, abs(float(primary["value"])), abs(phase_sum))
                mismatch = abs(float(primary["value"]) - phase_sum) / denominator
                result["phase_sum_w"] = round(phase_sum, 3)
                result["phase_mismatch_percent"] = round(mismatch * 100, 1)
                if self.inverter_provider == PROVIDER_SOLARMAN and mismatch > 0.15:
                    result.update(
                        value=phase_sum,
                        source="grid_phases",
                        status="fallback",
                        quality="degraded",
                        fallback_reason="Solarman: total grid power does not match the L1-L3 sum",
                    )
                elif mismatch > 0.15:
                    result.update(status="inconsistent", quality="degraded")
            self.data_quality["grid_power"] = result
            return result

        if complete_phases:
            result = {
                "entity_id": " + ".join(item.get("entity_id") or "?" for item in phases),
                "value": phase_sum,
                "unit": "W",
                "last_updated": max((item.get("last_updated") or "" for item in phases), default="") or None,
                "status": "fallback",
                "quality": "degraded",
                "source": "grid_phases",
                "fallback_reason": f"Grid Power: {primary.get('status')}",
                "phases": phases,
                "phase_sum_w": round(float(phase_sum), 3),
            }
            self.data_quality["grid_power"] = result
            return result

        result = {
            **primary,
            "value": None,
            "source": "unavailable",
            "quality": "unavailable",
            "phases": phases,
        }
        self.data_quality["grid_power"] = result
        return result

    def daily_energy_value(self, entity_id: str | None) -> float:
        """Return an energy entity in kWh, including Wh/MWh source units."""
        value = self._measurement(entity_id, kind="energy").get("value")
        return max(0.0, float(value)) if value is not None else 0.0

    def source_quality_context(self) -> dict[str, Any]:
        """Return the exact source/fallback status consumed by the scheduler."""
        load = self.load_power_reading()
        battery = self.battery_power_reading()
        sources = {
            "load_power": load,
            "battery_power": battery,
            "pv_power": self._pv_generation_reading(),
            "grid_power": self.grid_power_reading(),
            "battery_soc": self.soc_diagnostics(),
        }
        score_map = {"good": 100, "degraded": 70, "low": 40, "unavailable": 0}
        quality_values = [score_map.get(str(item.get("quality")), 0) for item in sources.values()]
        return {
            "schema_version": HISTORY_SCHEMA_VERSION,
            "score": round(sum(quality_values) / len(quality_values)) if quality_values else 0,
            "sources": sources,
            "fallback_in_use": any(item.get("source") not in ("primary", "unavailable") for item in sources.values()),
        }

    def _pv_generation_reading(self) -> dict[str, Any]:
        """Return PV power reading, or a zeroed reading when PV is disabled."""
        if not self.pv_generation_enabled:
            return {
                "entity_id": self.pv_power_sensor,
                "value": 0.0,
                "unit": "W",
                "last_updated": None,
                "status": "disabled",
                "quality": "good",
                "source": "disabled",
            }
        return self._measurement(self.pv_power_sensor)

    def _telemetry_readings(self) -> dict[str, dict[str, Any]]:
        """Return independent live channels without replacing missing values by zero."""
        load = self.load_power_reading()
        battery = self.battery_power_reading()
        grid = self.grid_power_reading()
        return {
            "pv": self._pv_generation_reading(),
            "load": load,
            "load_l1": self._measurement(self.load_l1_power_sensor),
            "load_l2": self._measurement(self.load_l2_power_sensor),
            "load_l3": self._measurement(self.load_l3_power_sensor),
            "grid": grid,
            "battery": battery,
            "soc": self.soc_diagnostics(),
            "sell_price": self._measurement(self.price_sensor, kind="raw"),
            "buy_price": self._measurement(self.buy_price_today_sensor, kind="raw"),
        }

    def live_state_context(
        self,
        readings: dict[str, dict[str, Any]] | None = None,
        moment: datetime | None = None,
    ) -> dict[str, Any]:
        """Build the current measured state consumed by Optimizer Core."""
        current = moment or ha_now()
        values = readings or self._telemetry_readings()

        def value(name: str) -> float | None:
            item = values.get(name, {})
            raw = item.get("value") if isinstance(item, dict) else None
            return float(raw) if raw is not None else None

        grid = value("grid")
        battery = value("battery")
        slot = self.active_slot
        return {
            "timestamp": current.isoformat(timespec="seconds"),
            "soc_pct": value("soc"),
            "pv_power_w": value("pv"),
            "home_power_w": value("load"),
            "grid_power_w": grid,
            "grid_direction": (
                "import" if grid is not None and grid > 0
                else "export" if grid is not None and grid < 0
                else "idle" if grid is not None
                else "unknown"
            ),
            "battery_power_w": battery,
            "battery_direction": (
                "discharge" if battery is not None and battery > 0
                else "charge" if battery is not None and battery < 0
                else "idle" if battery is not None
                else "unknown"
            ),
            "sell_price": value("sell_price"),
            "buy_price": value("buy_price"),
            "active_mode": slot.mode if slot.enabled else MODE_NORMAL_OPERATION,
            "active_power_w": max(0.0, float(slot.sell_power or 0.0)),
            "slot_key": slot.key,
            "channels": {
                name: {
                    "status": item.get("status"),
                    "quality": item.get("quality"),
                    "source": item.get("source"),
                    "last_updated": item.get("last_updated"),
                    "usable": item.get("value") is not None,
                }
                for name, item in values.items()
                if isinstance(item, dict)
            },
        }

    def current_hour_partial_context(self) -> dict[str, Any]:
        """Return the current hour's observed energy from retained samples."""
        now = ha_now()
        elapsed_minutes = max(0, min(60, now.minute))
        samples: list[dict[str, Any]] = []
        for source in self._energy_recent_details:
            if not isinstance(source, dict):
                continue
            try:
                stamp = datetime.fromisoformat(str(source.get("timestamp") or ""))
            except ValueError:
                continue
            if stamp.date() == now.date() and stamp.hour == now.hour:
                samples.append(source)

        channel_names = (
            "pv", "load", "grid", "battery", "soc", "sell_price", "buy_price",
        )
        channels = {name: new_channel() for name in channel_names}
        for sample in samples:
            seconds = self.safe_float(sample.get("interval_seconds"), 60.0)
            readings = sample.get("readings")
            if not isinstance(readings, dict):
                continue
            for name, item in readings.items():
                if name not in channels or not isinstance(item, dict):
                    continue
                channels[name] = record_channel(
                    channels[name],
                    value=item.get("value"),
                    elapsed_seconds=seconds,
                    quality=str(item.get("quality") or "unavailable"),
                    status=str(item.get("status") or "unavailable"),
                    source=str(item.get("source") or "unavailable"),
                )
        expected_seconds = max(60.0, elapsed_minutes * 60.0)
        summaries = {
            name: channel_summary(value, expected_seconds=expected_seconds)
            for name, value in channels.items()
        }

        field_map = {
            "pv_kwh": ("pv_power", "pv"),
            "load_kwh": ("load_power", "load"),
            "grid_import_kwh": ("grid_import_power", "grid"),
            "grid_export_kwh": ("grid_export_power", "grid"),
            "battery_charge_kwh": ("battery_charge_power", "battery"),
            "battery_discharge_kwh": ("battery_discharge_power", "battery"),
        }

        def observed(field: str, channel: str) -> float | None:
            if int(summaries.get(channel, {}).get("valid_samples", 0)) <= 0:
                return None
            source_field, _channel = field_map[field]
            total = 0.0
            for sample in samples:
                value = finite_float(sample.get(source_field))
                if value is None:
                    continue
                seconds = self.safe_float(sample.get("interval_seconds"), 60.0)
                total += value * seconds / 3_600_000.0
            return round(total, 5)

        soc_values = [
            value
            for value in (finite_float(sample.get("soc")) for sample in samples)
            if value is not None
        ]
        return {
            "hour": f"{now.hour:02d}",
            "elapsed_minutes": elapsed_minutes,
            "remaining_minutes": max(0, 60 - elapsed_minutes),
            "pv_kwh": observed("pv_kwh", "pv"),
            "load_kwh": observed("load_kwh", "load"),
            "grid_import_kwh": observed("grid_import_kwh", "grid"),
            "grid_export_kwh": observed("grid_export_kwh", "grid"),
            "battery_charge_kwh": observed("battery_charge_kwh", "battery"),
            "battery_discharge_kwh": observed("battery_discharge_kwh", "battery"),
            "soc_start_pct": round(soc_values[0], 1) if soc_values else None,
            "soc_current_pct": round(soc_values[-1], 1) if soc_values else None,
            "channels": summaries,
        }

    def entity_available(self, entity_id: str | None) -> bool:
        if not entity_id:
            return False
        state = self.hass.states.get(entity_id)
        return state is not None and state.state not in ("unknown", "unavailable", "none", "")

    def state_text(self, entity_id: str | None) -> str:
        if not entity_id:
            return "unknown"
        state = self.hass.states.get(entity_id)
        return state.state if state is not None else "unknown"

    @property
    def data_available(self) -> bool:
        """Check only entities required to write a complete Deye control plan.

        SOC and price are conditions of Selling First, not a global data
        interlock.  A Zero Export slot must therefore remain executable when
        price data is absent.
        """
        if not provider_profile(self.data).basic_control:
            return False
        required = [
            self.work_mode_select,
            self.max_sell_power_number,
        ]
        if provider_profile(self.data).needs_aux_export_switch:
            required.append(self.work_mode_aux_entity)
        return all(self.entity_available(entity_id) for entity_id in required)

    @property
    def required_entities_complete(self) -> bool:
        """Check that all entities required for full integration mapping are available.

        Unlike ``data_available`` this includes the battery SOC sensor, which is
        mandatory for complete operation and safe Selling First guards even
        though Zero Export slots can execute without it.
        """
        if not provider_profile(self.data).basic_control:
            return False
        required = [
            self.work_mode_select,
            self.max_sell_power_number,
            self.battery_soc_sensor,
        ]
        if provider_profile(self.data).needs_aux_export_switch:
            required.append(self.work_mode_aux_entity)
        return all(self.entity_available(entity_id) for entity_id in required)

    @property
    def mapping_error(self) -> bool:
        return len(self._tou_mapping) > 6

    @property
    def next_active_slot(self) -> str:
        keys = [key for key, *_rest in SLOTS]
        current_index = keys.index(self.active_slot_key())
        for offset in range(1, len(keys) + 1):
            key, label, *_rest = SLOTS[(current_index + offset) % len(SLOTS)]
            if self.effective_slot_for_key(key).enabled:
                return label
        return "NONE"

    @property
    def decision_reason(self) -> str:
        status = self.manager_status
        if status == "MAPPING ERROR":
            return f"Mapping requires {len(self._tou_mapping)} ranges; Deye supports 6"
        if status == "NO DATA":
            return "Required data or inverter control entities are missing"
        if status == "SELLING BLOCKED":
            issue = self._selling_slot_guard_issue()
            return issue[1] if issue else "Selling suspended by the active slot condition"
        if status == "PRICE TOO LOW":
            price = self.state_float(self.price_sensor, 0)
            return f"Price {price:.2f} per kWh is below the {self.active_min_sell_price:.2f} per kWh threshold"
        if status == "SOC TOO LOW":
            soc = self.state_float(self.battery_soc_sensor, 0)
            return f"SOC {soc:.0f}% reached or fell below the {self.active_min_sell_soc:.0f}% limit"
        reasons = {
            "SLOT DISABLED": "The current slot is disabled; default settings apply",
            "SCHEDULE DISABLED": "The schedule is disabled; manager idle",
            "SELLING SUSPENDED": "Control stopped; default settings apply",
            "EMERGENCY STOPPED": "Emergency stop active",
            "BATTERY PROTECTION": "Battery protection active",
            "MANUAL SELL": "Manual selling mode is active",
            "BATTERY CHARGING": "Manual battery charging is active",
            "GRID CHARGING": "Grid charging per schedule",
            "PV CHARGING": "PV charging per schedule",
            "SELLING ACTIVE": "Selling conditions are met",
            "NORMAL OPERATION (CT)": "Normal Operation active — Deye: Zero Export To CT",
            "NORMAL OPERATION (LOAD)": "Normal Operation active — Deye: Zero Export To Load",
            "WAITING": "Manager is waiting for conditions to change or the next slot",
        }
        return reasons.get(status, status)

    def mark_settings_applied(self) -> None:
        self.last_applied_at = ha_now().isoformat(timespec="seconds")

    def mark_config_saved(self) -> None:
        self.last_saved_at = ha_now().isoformat(timespec="seconds")
        if self._ai_store is not None:
            self.request_ai_save()
        self.notify_update()

    def _tou_entities(self) -> list[tuple[str, str]]:
        entities: list[tuple[str, str]] = []
        for idx in range(1, 7):
            entities.extend([
                (f"TOU {idx} — start", self._tou_entity(idx, "start")),
                (f"TOU {idx} — minimum SOC", self._tou_entity(idx, "soc")),
                (f"TOU {idx} — grid charge", self._tou_entity(idx, "grid")),
            ])
        return entities

    def tou_mapping_diagnostics(self) -> dict[str, Any]:
        entities = [
            {"label": label, "entity_id": entity_id, "ok": self.entity_available(entity_id)}
            for label, entity_id in self._tou_entities()
        ]
        missing = [item["entity_id"] for item in entities if not item["ok"]]
        item = provider_profile(self.data)
        return {
            "ok": bool(item.native_tou and not missing),
            "supported": item.native_tou,
            "provider": self.inverter_provider,
            "provider_label": item.label,
            "native_tou": item.native_tou,
            "note": item.notes,
            "missing": missing,
            "entities": entities,
        }

    def _tou_field_actual_value(self, entity_id: str | None, field_name: str) -> Any:
        """Return a normalized TOU value without losing the raw HA state."""
        if not self.entity_available(entity_id):
            return None
        raw = self.state_text(entity_id)
        if field_name in ("start", "end"):
            minutes = self._time_to_minutes(raw)
            return None if minutes is None else f"{minutes // 60:02d}:{minutes % 60:02d}"
        if field_name == "soc":
            value = self.safe_float(raw, float("nan"))
            return value if math.isfinite(value) else None
        if field_name == "grid_charge":
            return provider_boolean_state(self.data, "grid", raw)
        if field_name in ("mode", "charge"):
            value = str(raw).strip()
            return value or None
        if field_name == "sell":
            return provider_boolean_state(self.data, "sell", raw)
        if field_name in ("power", "voltage"):
            value = self.safe_float(raw, float("nan"))
            return value if math.isfinite(value) else None
        return raw

    def _tou_field_capability(
        self,
        slot_index: int,
        field_name: str,
        entity_id: str | None,
    ) -> dict[str, Any]:
        """Build one runtime capability entry for a physical TOU field."""
        declared = provider_tou_field_capabilities(self.inverter_provider).get(
            field_name, {"supported": False, "domains": (), "per_slot": False}
        )
        domain = str(entity_id or "").split(".", 1)[0] if entity_id else ""
        allowed_domains = tuple(declared.get("domains", ()))
        configured = bool(entity_id)
        domain_supported = bool(domain and domain in allowed_domains)
        state = self.hass.states.get(entity_id) if entity_id else None
        current_available = bool(
            state is not None
            and str(state.state).strip().casefold()
            not in ("unknown", "unavailable", "none", "")
        )
        supported = bool(declared.get("supported") and configured and domain_supported)
        read_only = bool(declared.get("read_only", False))
        readable = bool(supported and current_available)
        writable = bool(supported and current_available and not read_only)
        blocked_by_master = not self._control_is_active()
        blocked_by_pending = bool(self.tou_write_pending)
        return {
            "slot_index": slot_index,
            "field": field_name,
            "entity_id": entity_id or None,
            "domain": domain or None,
            "supported": supported,
            "configured": configured,
            "domain_supported": domain_supported,
            "readable": readable,
            "writable": writable,
            "current_available": current_available,
            "read_only": read_only,
            "service_kind": operation_for_entity(entity_id, field_name),
            "write_method": operation_for_entity(entity_id, field_name),
            "blocked_by_master_control": blocked_by_master,
            "blocked_by_tou_pending": blocked_by_pending,
            "control_writable": bool(
                writable and not blocked_by_master and not blocked_by_pending
            ),
            "actual": self._tou_field_actual_value(entity_id, field_name),
            "raw_actual": None if state is None else str(state.state),
        }

    def tou_slot_capabilities(self) -> list[dict[str, Any]]:
        """Return the authoritative per-slot physical TOU capability matrix."""
        profile = provider_profile(self.data)
        rows: list[dict[str, Any]] = []
        for slot_index in range(1, 7):
            next_slot = 1 if slot_index == 6 else slot_index + 1
            entity_ids = {
                "start": self._tou_entity(slot_index, "start"),
                "end": self._tou_entity(next_slot, "start"),
                "soc": self._tou_entity(slot_index, "soc"),
                "grid_charge": self._tou_entity(slot_index, "grid"),
                "mode": self._tou_entity(slot_index, "mode"),
                "charge": self._tou_entity(slot_index, "charge"),
                "sell": self._tou_entity(slot_index, "sell"),
                "power": self._tou_entity(slot_index, "power"),
                "voltage": self._tou_entity(slot_index, "voltage"),
                "out_power": None,
            }
            fields = {
                field_name: self._tou_field_capability(
                    slot_index, field_name, entity_id
                )
                for field_name, entity_id in entity_ids.items()
            }
            rows.append(
                {
                    "slot_index": slot_index,
                    "provider": self.inverter_provider,
                    "provider_label": profile.label,
                    "read_only": not profile.native_tou,
                    "supports_start": fields["start"]["supported"],
                    "supports_end_as_next_start": fields["end"]["supported"],
                    "supports_soc": fields["soc"]["supported"],
                    "supports_grid_charge": fields["grid_charge"]["supported"],
                    "supports_mode": fields["mode"]["supported"],
                    "supports_charge": fields["charge"]["supported"],
                    "supports_sell": fields["sell"]["supported"],
                    "supports_power": fields["power"]["supported"],
                    "supports_voltage": fields["voltage"]["supported"],
                    "supports_out_power": False,
                    "blocked_by_master_control": not self._control_is_active(),
                    "control_writable": bool(
                        self._control_is_active()
                        and not self.tou_write_pending
                        and any(field["writable"] for field in fields.values())
                    ),
                    "fields": fields,
                }
            )
        return rows

    def provider_capabilities(self) -> dict[str, Any]:
        """Return an explicit, read-only capability matrix for this mapping."""
        item = provider_profile(self.data)
        entities = {
            "work_mode": self.work_mode_select,
            "sell_power": self.max_sell_power_number,
            "soc": self.battery_soc_sensor,
            "grid_power": self.grid_power_sensor,
            "pv_power": self.pv_power_sensor,
            "load_power": self.load_power_sensor,
            "battery_power": self.battery_power_sensor,
            "sell_price": self.price_sensor,
            "solcast_today": self.solcast_forecast_today_sensor,
        }
        for idx in range(1, 7):
            for kind in ("start", "soc", "grid", "mode", "charge", "sell", "power", "voltage"):
                entities[f"tou_{idx}_{kind}"] = self._tou_entity(idx, kind)

        groups: dict[str, tuple[str, ...]] = {
            "readings": ("soc", "grid_power", "pv_power", "load_power", "battery_power"),
            "basic_control": ("work_mode", "sell_power"),
            "selling": ("work_mode", "sell_power", "soc"),
            "charging": ("work_mode", "soc"),
            "full_tou": tuple(
                f"tou_{idx}_{kind}" for idx in range(1, 7) for kind in ("start", "soc", "grid")
            ),
            "schedule_data": ("soc", "grid_power", "pv_power", "load_power", "battery_power", "sell_price", "solcast_today"),
        }
        result: dict[str, Any] = {}
        for name, keys in groups.items():
            supported = item.basic_control if name in ("basic_control", "selling", "charging") else True
            if name == "full_tou":
                supported = item.native_tou
            missing = [key for key in keys if not self.entity_available(entities.get(key))]
            result[name] = {
                "ok": bool(supported and not missing),
                "supported": supported,
                "missing": missing,
            }
        result["provider"] = {
            "key": self.inverter_provider,
            "label": item.label,
            "note": item.notes,
        }
        result["operations"] = {
            key: {
                "entity_id": entity_id or "not_configured",
                "operation": operation_for_entity(entity_id, key),
            }
            for key, entity_id in entities.items()
        }
        result["physical_tou_slots"] = self.tou_slot_capabilities()
        return result

    def control_values_snapshot(self) -> dict[str, str]:
        ids = {
            "System Work Mode": self.work_mode_select,
            "Max Sell Power": self.max_sell_power_number,
        }
        return {label: self.state_text(entity_id) if entity_id else "not configured" for label, entity_id in ids.items()}

    def physical_tou_snapshot(self) -> list[dict[str, Any]]:
        """Describe expected and actually reported values of all six Deye ranges."""
        mapping = self._tou_mapping
        segments = mapping.slots
        rows: list[dict[str, Any]] = []
        capability_rows = self.tou_slot_capabilities()

        def minute_of_day(value: str) -> int | None:
            try:
                hour, minute = str(value)[:5].split(":", 1)
                return int(hour) * 60 + int(minute)
            except (TypeError, ValueError):
                return None

        current_minute = ha_now().hour * 60 + ha_now().minute
        for idx in range(1, 7):
            segment = segments[idx - 1] if idx <= len(segments) else None
            expected_start = (
                self._minutes_to_clock(int(segment.start)) if segment is not None else None
            )
            expected_end = None
            active = False
            if segment is not None:
                end_minute_expected = MINUTES_PER_DAY if int(segment.end) == 0 else int(segment.end)
                expected_end = self._minutes_to_clock(end_minute_expected)
                active = int(segment.start) <= current_minute < end_minute_expected
            capabilities = capability_rows[idx - 1]
            field_caps = capabilities["fields"]
            actual_start = field_caps["start"]["actual"]
            actual_end = field_caps["end"]["actual"]
            start_minute = minute_of_day(actual_start)
            end_minute = minute_of_day(actual_end)
            actual_active = False
            if start_minute is not None and end_minute is not None:
                actual_active = (
                    start_minute <= current_minute < end_minute
                    if start_minute < end_minute
                    else current_minute >= start_minute or current_minute < end_minute
                )
            soc_state = field_caps["soc"]["raw_actual"]
            grid_state = field_caps["grid_charge"]["raw_actual"]
            readable = bool(
                actual_start is not None
                and actual_end is not None
                and field_caps["soc"]["readable"]
                and field_caps["grid_charge"]["readable"]
            )
            expected_values = {
                "start": expected_start,
                "end": expected_end,
                "soc": segment.soc if segment is not None else None,
                "grid_charge": bool(segment and segment.grid_charge),
            }
            fields: dict[str, dict[str, Any]] = {}
            for field_name, expected in expected_values.items():
                capability = field_caps[field_name]
                transaction_field = "grid" if field_name == "grid_charge" else field_name
                transaction_item = next(
                    (
                        item
                        for item in reversed(self.tou_transaction_log)
                        if item.get("slot_index") == idx
                        and item.get("field") == transaction_field
                    ),
                    None,
                )
                operation_expected = (
                    transaction_item.get("expected")
                    if transaction_item is not None
                    else expected
                )
                actual = capability["actual"]
                if transaction_item is not None:
                    status = str(transaction_item.get("status") or "unavailable")
                elif not capability["readable"] or actual is None:
                    status = "unavailable"
                elif operation_expected is None:
                    status = "unchanged"
                else:
                    match_field = "grid" if field_name == "grid_charge" else field_name
                    status = (
                        "confirmed"
                        if self._tou_field_matches(
                            capability["entity_id"], match_field, operation_expected
                        )
                        else "mismatch"
                    )
                fields[field_name] = {
                    "entity_id": capability["entity_id"],
                    "actual": actual,
                    "raw_actual": capability["raw_actual"],
                    "expected": operation_expected,
                    "status": status,
                    "writable": capability["writable"],
                    "capability": capability,
                }
            rows.append({
                "range": idx,
                "active": active,
                "actual_active": actual_active,
                "expected_start": expected_start,
                "expected_end": expected_end,
                "expected_soc": segment.soc if segment is not None else None,
                "actual_start": actual_start,
                "actual_end": actual_end,
                "actual_soc": soc_state if readable else None,
                "expected_grid_charge": bool(segment and segment.grid_charge),
                "actual_grid_charge": grid_state,
                "actual_grid_charge_enabled": field_caps["grid_charge"]["actual"],
                "readable": readable,
                "writable": any(field["writable"] for field in field_caps.values()),
                "read_only": capabilities["read_only"],
                "blocked_by_master_control": capabilities["blocked_by_master_control"],
                "control_writable": capabilities["control_writable"],
                "capabilities": capabilities,
                "fields": fields,
            })
        return rows

    def active_slot_control_diagnostics(self) -> dict[str, Any]:
        """Keep logical sale guards separate from physical TOU/control values."""
        slot = self.active_slot
        effective_soc = self._physical_tou_soc_for_slot(slot)
        physical_tou = self.physical_tou_snapshot()
        active_range = next((row for row in physical_tou if row["active"]), None)
        raw_sell_power = self.target_sell_power
        applied_sell_power = self.applied_sell_power
        manager_status = self.manager_status
        sale_blocked_by_soc = (
            manager_status == "SELLING BLOCKED" and "SOC" in self.decision_reason
        )
        result: dict[str, Any] = {
            "slot": slot.key,
            "mode": slot.mode if slot.enabled else "Disabled",
            "minimum_sell_soc": slot.minimum_sell_soc,
            "tou_soc": slot.tou_soc,
            "charge_profile_target_soc": self.charge_profile_target_soc,
            "effective_tou_soc": effective_soc,
            "physical_range": active_range.get("range") if active_range else None,
            "physical_soc_actual": active_range.get("actual_soc") if active_range else "missing",
            "grid_charge_expected": bool(slot.charge_enabled),
            "grid_charge_actual": active_range.get("actual_grid_charge") if active_range else "missing",
            "sale_blocked_by_soc": sale_blocked_by_soc,
            "power_limits": {
                "configured_inverter_max_power_w": self.configured_inverter_max_power_w,
                "detected_entity_max_power_w": self.detected_entity_max_power_w,
                "effective_inverter_max_power_w": self.effective_inverter_max_power_w,
                "target_sell_power_w": raw_sell_power,
                "applied_sell_power_w": applied_sell_power,
                "capped": applied_sell_power < raw_sell_power,
            },
        }
        return result

    def record_schedule_attempt(self, status: str, stage: str, expected: dict[str, Any], message: str = "") -> None:
        self.last_schedule_attempt = {
            "status": status,
            "at": ha_now().isoformat(timespec="seconds"),
            "slot": self.active_slot_key(),
            "stage": stage,
            "expected": expected,
            "actual": self.control_values_snapshot(),
            "message": message,
        }

    def diagnostics(self) -> dict[str, Any]:
        configured = {
            self.data.get(CONF_WORK_MODE_SELECT): DEFAULT_WORK_MODE_SELECT,
            self.data.get(CONF_MAX_SELL_POWER_NUMBER): DEFAULT_MAX_SELL_POWER,
            self.data.get(CONF_BATTERY_SOC_SENSOR): DEFAULT_BATTERY_SOC,
            self.data.get(CONF_PRICE_SENSOR): DEFAULT_PRICE_SENSOR,
            self.data.get(CONF_GRID_POWER_SENSOR): DEFAULT_GRID_POWER_SENSOR,
            self.data.get(CONF_PV_POWER_SENSOR): DEFAULT_PV_POWER_SENSOR,
            self.data.get(CONF_LOAD_POWER_SENSOR): DEFAULT_LOAD_POWER_SENSOR,
            self.data.get(CONF_BATTERY_POWER_SENSOR): DEFAULT_BATTERY_POWER_SENSOR,
            self.data.get(CONF_WEATHER_ENTITY): DEFAULT_WEATHER_ENTITY,
        }
        entity_ids = [self.work_mode_select, self.max_sell_power_number, self.battery_soc_sensor,
                      self.price_sensor, self.grid_power_sensor, self.pv_power_sensor, self.load_power_sensor,
                      self.battery_power_sensor, self.weather_entity]
        entities = []
        for entity_id in entity_ids:
            state = self.hass.states.get(entity_id) if entity_id else None
            is_configured = entity_id in configured and entity_id != configured.get(entity_id)
            entities.append({
                "entity_id": entity_id or "not_configured",
                "state": state.state if state is not None else "missing",
                "ok": state is not None and state.state not in ("unknown", "unavailable"),
                "configured": is_configured,
                "default": entity_id == configured.get(entity_id) if entity_id else False,
            })
        optional_ids = {
            "load_l1_power": self.load_l1_power_sensor,
            "load_l2_power": self.load_l2_power_sensor,
            "load_l3_power": self.load_l3_power_sensor,
            "pv1_power": self.pv1_power_sensor,
            "pv2_power": self.pv2_power_sensor,
            "pv3_power": self.pv3_power_sensor,
            "battery_voltage": self.battery_bms_voltage_sensor,
            "battery_current": self.battery_current_sensor,
            "battery_temperature": self.battery_temperature_sensor,
            "battery_soh": self.battery_soh_sensor,
            "daily_energy_bought": self.daily_energy_bought_sensor,
            "daily_energy_sold": self.daily_energy_sold_sensor,
            "daily_battery_charge": self.daily_battery_charge_sensor,
            "daily_battery_discharge": self.daily_battery_discharge_sensor,
        }
        optional_entities = [
            {
                "name": name,
                **self._measurement(
                    entity_id,
                    kind="energy" if name.startswith("daily_") else "raw" if name.startswith("battery_") and name != "battery_power" else "power",
                ),
                "optional": True,
            }
            for name, entity_id in optional_ids.items()
        ]
        quality_context = self.source_quality_context()
        tou = self.tou_mapping_diagnostics()
        mapping_status = (
            "ERROR"
            if self.mapping_error
            else "LIMITED"
            if not tou["supported"]
            else "TOU ERROR"
            if not tou["ok"]
            else "OK"
        )
        return {"integration_version": "0.8.0.87", "connected": self.data_available, "required_entities_complete": self.required_entities_complete, "entities": entities,
                "inverter_provider": self.inverter_provider,
                "inverter_device_id": self.data.get(CONF_INVERTER_DEVICE_ID),
                "inverter_provider_label": provider_profile(self.data).label,
                "provider_native_tou": provider_profile(self.data).native_tou,
                "last_saved_at": self.last_saved_at or "never", "last_applied_at": self.last_applied_at or "never",
                 "last_error": self.last_error or "none", "last_schedule_attempt": self.last_schedule_attempt,
                 "manager_status": self.manager_status, "mapping_status": mapping_status,
                 "control": {
                     "entity_id": self.control_entity_id,
                     "enabled": self.control_enabled,
                     "status": self.control_status,
                     "control_enabled": self.control_enabled,
                     "control_status": self.control_status,
                     "control_epoch": self._control_epoch,
                     "disable_generation": self._disable_generation,
                     "active_control_operations": self._active_control_operations,
                     "active_transaction_ids": sorted(self._active_control_transactions),
                     "disable_waiting_transaction_ids": sorted(self._disable_waiting_transactions),
                     "disable_error": self._control_disable_error or "none",
                     "planned_manager_action": self.planned_manager_action,
                     "executed_manager_action": self.executed_manager_action,
                 },
                 "capabilities": self.provider_capabilities(),
                 "mapping_segments": len(self._tou_mapping),
                 "mapping_plan": self.schedule_mapping_snapshot(),
                 "power_limits": {
                     "configured_inverter_max_power_w": self.configured_inverter_max_power_w,
                     "detected_entity_max_power_w": self.detected_entity_max_power_w,
                     "effective_inverter_max_power_w": self.effective_inverter_max_power_w,
                 },
                 "tou": tou,
                "tou_transaction": {
                    "tou_write_pending": self.tou_write_pending,
                    "tou_operation_status": self.tou_operation_status,
                    "operation_status": self.tou_contract_status,
                    "tou_operation_started_at": self.tou_operation_started_at.isoformat() if self.tou_operation_started_at else None,
                    "tou_last_error": self.tou_last_error or "none",
                    "tou_transaction_log": self.tou_transaction_log,
                },
                "tou_reverse_sync": {
                    "reverse_sync_status": self.reverse_sync_status,
                    "reverse_sync_last_error": self.reverse_sync_last_error or "none",
                    "reverse_sync_changed_hours": list(self.reverse_sync_changed_hours),
                    "reverse_sync_round_trip_ok": self.reverse_sync_round_trip_ok,
                },
                "tou_reconciliation": self.tou_reconciliation_diagnostics(),
                "tou_capabilities": self.tou_slot_capabilities(),
                "physical_tou": self.physical_tou_snapshot(),
                "active_slot_control": self.active_slot_control_diagnostics(),
                "soc_semantics": {
                    "minimum_sell_soc": "logical sell-stop threshold for Selling slots; not the physical Deye TOU SOC",
                    "tou_soc": "physical Deye TOU SOC for all modes (Normal Operation, Charging, Selling, Disabled)",
                    "charge_profile_target_soc": "physical Deye TOU SOC for Charging slots",
                },
                "charge_profile": {
                    "grid_charge_enabled": self.charge_profile_grid_enabled,
                    "target_soc": self.charge_profile_target_soc,
                },
                "default_settings": {
                    "mode": self.default_work_mode,
                    "physical_work_mode": self.default_normal_physical_work_mode(),
                    "sell_power": self.default_sell_power,
                },
                "normal_profile_options": normal_profile_mode_metadata(self.data),
                "normal_profile": {
                    "physical_work_mode": self.normal_profile_physical_work_mode,
                    "sell_power": self.normal_profile_sell_power,
                    "tou_soc": self.normal_profile_tou_soc,
                },
                "active_slot": self.active_slot_key(), "next_active_slot": self.next_active_slot,
                "history_schema_version": HISTORY_SCHEMA_VERSION,
                "optional_entities": optional_entities,
                "data_quality": quality_context,
                "energy_counters": self.data_quality.get("energy_counters", {}),
                "energy_samples": len(self.energy_samples), "weather": self.weather_context(), "tariff": self.tariff_context()}

    def empty_hourly_stats(self) -> dict[str, dict[str, float]]:
        return {f"{hour:02d}": {"kwh": 0.0, "value": 0.0} for hour in range(24)}

    def empty_sales_stats(self) -> dict[str, Any]:
        return {
            "current_day": ha_now().date().isoformat(),
            "hourly": self.empty_hourly_stats(),
            "daily": {},
            "last_update": None,
        }

    def normalize_sales_stats(self, raw: dict[str, Any] | None) -> dict[str, Any]:
        stats = self.empty_sales_stats()
        if isinstance(raw, dict):
            stats.update(raw)
        hourly = stats.get("hourly")
        if not isinstance(hourly, dict):
            hourly = {}
        normalized_hourly = self.empty_hourly_stats()
        for hour, values in hourly.items():
            key = f"{int(hour):02d}" if str(hour).isdigit() else str(hour).zfill(2)
            if key not in normalized_hourly or not isinstance(values, dict):
                continue
            normalized_hourly[key]["kwh"] = self.safe_float(values.get("kwh"), 0)
            normalized_hourly[key]["value"] = self.safe_float(values.get("value"), 0)
        stats["hourly"] = normalized_hourly
        daily = stats.get("daily")
        stats["daily"] = daily if isinstance(daily, dict) else {}
        return stats

    async def async_load_sales_stats(self) -> None:
        self._stats_store = Store(self.hass, 1, f"{DOMAIN}_{self.entry_id}_sales_stats")
        self.sales_stats = self.normalize_sales_stats(await self._stats_store.async_load())
        last_update = self.sales_stats.get("last_update")
        if last_update:
            try:
                self._energy_last_update = datetime.fromisoformat(last_update)
            except (TypeError, ValueError):
                self._energy_last_update = None
        self._energy_day = str(self.sales_stats.get("current_day") or ha_now().date().isoformat())
        self.refresh_sales_totals()

    async def async_save_sales_stats(self) -> None:
        if self._stats_store is None or not self._stats_dirty:
            return
        self.sales_stats["last_update"] = self._energy_last_update.isoformat() if self._energy_last_update else None
        await self._stats_store.async_save(self.sales_stats)
        self._stats_dirty = False

    def _prune_trigger_log(self) -> None:
        cutoff = ha_now() - timedelta(days=TRIGGER_LOG_RETENTION_DAYS)
        kept: list[dict[str, Any]] = []
        for entry in self.trigger_log:
            if not isinstance(entry, dict):
                continue
            ts = entry.get("timestamp")
            try:
                dt = datetime.fromisoformat(str(ts))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=cutoff.tzinfo)
            except Exception:
                kept.append(entry)
                continue
            if dt >= cutoff:
                kept.append(entry)
        if len(kept) > TRIGGER_LOG_MAX_ENTRIES:
            kept = kept[-TRIGGER_LOG_MAX_ENTRIES:]
        self.trigger_log = kept

    async def async_load_trigger_log(self) -> None:
        self._trigger_log_store = Store(
            self.hass, 1, f"{DOMAIN}_{self.entry_id}_trigger_log"
        )
        try:
            data = await self._trigger_log_store.async_load()
        except Exception:
            _LOGGER.exception("Failed to load Deye trigger log")
            data = None
        if isinstance(data, dict):
            entries = data.get("entries")
        elif isinstance(data, list):
            entries = data
        else:
            entries = []
        if not isinstance(entries, list):
            entries = []
        self.trigger_log = [e for e in entries if isinstance(e, dict)]
        self._prune_trigger_log()
        self._trigger_log_dirty = False

    async def async_save_trigger_log(self, *, force: bool = False) -> None:
        if self._trigger_log_store is None or (
            not self._trigger_log_dirty and not force
        ):
            return
        self._prune_trigger_log()
        try:
            await self._trigger_log_store.async_save(
                {"entries": self.trigger_log}
            )
            self._trigger_log_dirty = False
        except Exception:  # Persistence must not break inverter control.
            _LOGGER.exception("Failed to save Deye trigger log")

    async def _async_append_trigger_log(
        self,
        *,
        timestamp: str,
        entity_id: str,
        domain: str,
        service: str,
        value: Any,
        success: bool,
        error: str = "",
    ) -> None:
        if not isinstance(value, (str, int, float, bool)) and value is not None:
            value = str(value)
        entry = {
            "timestamp": timestamp,
            "entity_id": entity_id,
            "domain": domain,
            "service": service,
            "value": value,
            "success": bool(success),
            "error": str(error or ""),
            "source": str(getattr(self, "planned_manager_action", "") or ""),
        }
        self.trigger_log.append(entry)
        self._prune_trigger_log()
        self._trigger_log_dirty = True
        await self.async_save_trigger_log()
        self.notify_update("trigger_log")

    async def async_load_ai_data(self) -> None:
        """Restore the shared persistence keys from the existing Store."""
        self._ai_store = Store(self.hass, 1, f"{DOMAIN}_{self.entry_id}_ai_data")
        raw = await self._ai_store.async_load()
        data = dict(raw) if isinstance(raw, dict) else {}
        migrated = int(self.safe_float(data.get("schema_version"), 1)) < HISTORY_SCHEMA_VERSION
        data["schema_version"] = HISTORY_SCHEMA_VERSION
        self.control_enabled = bool(data.get("control_enabled", True))
        self.control_status = "Active" if self.control_enabled else "Disabled"
        if not self.control_enabled:
            self.executed_manager_action = "Not performed — control disabled"
        self.schedule_revision = max(
            0, int(self.safe_float(data.get("schedule_revision"), 0))
        )
        raw_slot_revisions = data.get("schedule_slot_revisions")
        self.schedule_slot_revisions = {
            str(key): max(0, int(self.safe_float(value, 0)))
            for key, value in (
                raw_slot_revisions.items()
                if isinstance(raw_slot_revisions, dict)
                else []
            )
            if str(key) in self.slots
        }
        raw_slot_ownership = data.get("schedule_slot_ownership")
        self.schedule_slot_ownership = {
            str(key): deepcopy(value)
            for key, value in (
                raw_slot_ownership.items()
                if isinstance(raw_slot_ownership, dict)
                else []
            )
            if str(key) in self.slots and isinstance(value, dict)
        }
        self.last_saved_at = str(data.get("last_saved_at") or "")
        self.schedule_schema_version = max(
            0, int(self.safe_float(data.get("schedule_schema_version"), 0))
        )
        stored_default_physical_mode = data.get("default_physical_work_mode")
        if stored_default_physical_mode in PHYSICAL_NORMAL_MODES:
            self.default_physical_work_mode = str(stored_default_physical_mode)

        stored_physical_modes = data.get("slot_physical_modes")
        if isinstance(stored_physical_modes, dict):
            for slot_key, physical_mode in stored_physical_modes.items():
                if slot_key in self.slots and physical_mode in PHYSICAL_NORMAL_MODES:
                    self.slots[slot_key].physical_work_mode = str(physical_mode)

        if not data.get("sa_defaults_v1"):
            data["sa_defaults_v1"] = True
            migrated = True

        raw_profile = data.get("charge_profile")
        if isinstance(raw_profile, dict):
            target_soc = self.safe_float(raw_profile.get("target_soc"), float("nan"))
            grid_enabled = raw_profile.get("grid_charge_enabled")
            soc_ok = math.isfinite(target_soc) and 0 <= target_soc <= 100
            if soc_ok and isinstance(grid_enabled, bool):
                self.charge_profile_target_soc = target_soc
                self.charge_profile_grid_enabled = grid_enabled
                self._charge_profile_loaded_from_store = True
        else:
            self._charge_profile_loaded_from_store = True

        raw_normal_profile = data.get("normal_profile")
        if isinstance(raw_normal_profile, dict):
            physical_mode = raw_normal_profile.get("physical_work_mode")
            sell_power = self.safe_float(raw_normal_profile.get("sell_power"), float("nan"))
            tou_soc = self.safe_float(raw_normal_profile.get("tou_soc"), float("nan"))
            profile_ok = (
                physical_mode in PHYSICAL_NORMAL_MODES
                and math.isfinite(sell_power)
                and 0 <= sell_power <= self.effective_inverter_max_power_w
                and math.isfinite(tou_soc)
                and 0 <= tou_soc <= 100
            )
            if profile_ok:
                self.normal_profile_physical_work_mode = str(physical_mode)
                self.normal_profile_sell_power = sell_power
                self.normal_profile_tou_soc = tou_soc
                self._normal_profile_loaded_from_store = True
        raw_default_profile = data.get("default_profile")
        if isinstance(raw_default_profile, dict):
            sell_power = self.safe_float(raw_default_profile.get("sell_power"), float("nan"))
            if math.isfinite(sell_power) and 0 <= sell_power <= self.effective_inverter_max_power_w:
                self.default_sell_power = sell_power
            self._default_profile_loaded_from_store = True
        self._install_init_battery_restart_capacity_done = bool(
            data.get("install_init_battery_restart_capacity_done", False)
        )

        raw_manual_tou = data.get("manual_tou_mapping")
        if isinstance(raw_manual_tou, (list, dict)):
            restored = self._deserialize_manual_tou_mapping(raw_manual_tou)
            if restored is not None:
                self._manual_tou_mapping = restored
        self.manual_schedule = self._load_manual_schedule_state(data.get("manual_schedule"))
        self.energy_status_display = self._normalize_energy_status_display(
            data.get("energy_status_display")
        )
        self._manual_effective_rows = {}
        if self.manual_schedule_active:
            try:
                self._rebuild_manual_effective_rows()
            except Exception:
                self.manual_schedule["active"] = False
                self.manual_schedule["activation_snapshot"] = None
        if migrated:
            await self.async_save_ai_data()
        else:
            self._ai_last_saved_fingerprint = snapshot_id(
                self._ai_store_fingerprint_payload()
            )

    def _ai_store_payload(self) -> dict[str, Any]:
        """Build the shared Store payload only on a save path."""
        return {
            "schema_version": HISTORY_SCHEMA_VERSION,
            "schedule_revision": self.schedule_revision,
            "schedule_slot_revisions": self.schedule_slot_revisions,
            "schedule_slot_ownership": self.schedule_slot_ownership,
            "manual_tou_mapping": self._serialize_manual_tou_mapping(),
            "manual_schedule": deepcopy(self._ensure_manual_schedule()),
            "energy_status_display": self._normalize_energy_status_display(
                self.energy_status_display
            ),
            "last_saved_at": self.last_saved_at,
            "schedule_schema_version": self.schedule_schema_version,
            "control_enabled": self.control_enabled,
            "default_physical_work_mode": self.default_physical_work_mode,
            "slot_physical_modes": {
                slot_key: slot.physical_work_mode
                for slot_key, slot in self.slots.items()
                if slot.physical_work_mode in PHYSICAL_NORMAL_MODES
            },
            "charge_profile": {
                "target_soc": self.charge_profile_target_soc,
                "grid_charge_enabled": self.charge_profile_grid_enabled,
            },
            "default_profile": {
                "sell_power": self.default_sell_power,
            },
            "install_init_battery_restart_capacity_done": self._install_init_battery_restart_capacity_done,
            "sa_defaults_v1": True,
            "normal_profile": {
                "physical_work_mode": self.normal_profile_physical_work_mode,
                "sell_power": self.normal_profile_sell_power,
                "tou_soc": self.normal_profile_tou_soc,
            },
        }

    def _ai_store_fingerprint_payload(self) -> dict[str, Any]:
        """Return a bounded canonical identity for the shared Store state."""
        return {
            "schedule_revision": self.schedule_revision,
            "schedule_slot_revisions": self.schedule_slot_revisions,
            "schedule_slot_ownership": self.schedule_slot_ownership,
            "manual_tou_mapping": self._serialize_manual_tou_mapping(),
            "manual_schedule": deepcopy(self._ensure_manual_schedule()),
            "energy_status_display": self._normalize_energy_status_display(
                self.energy_status_display
            ),
            "last_saved_at": self.last_saved_at,
            "schedule_schema_version": self.schedule_schema_version,
            "control_enabled": self.control_enabled,
            "default_physical_work_mode": self.default_physical_work_mode,
            "slot_physical_modes": {
                key: slot.physical_work_mode for key, slot in self.slots.items()
            },
            "charge_profile": [
                self.charge_profile_target_soc,
                self.charge_profile_grid_enabled,
            ],
            "default_profile": [
                self.default_sell_power,
            ],
            "install_init_battery_restart_capacity_done": self._install_init_battery_restart_capacity_done,
            "normal_profile": [
                self.normal_profile_physical_work_mode,
                self.normal_profile_sell_power,
                self.normal_profile_tou_soc,
            ],
        }

    def request_ai_save(self) -> Any:
        """Coalesce background AI Store requests into one tracked task."""
        self._ai_save_dirty = True
        task = self._ai_save_task
        if (
            self._ai_store is None
            or self._startup_in_progress
            or self._unloading
            or (task is not None and not task.done())
        ):
            return task
        task = self.hass.async_create_task(self.async_save_ai_data())
        self._ai_save_task = task
        return task

    async def async_save_ai_data(self, *, force: bool = False) -> None:
        """Persist AI state single-flight, with one coalesced latest follow-up."""
        if self._ai_store is None or (self._unloading and not force):
            return
        self._ai_save_dirty = True
        if self._startup_in_progress:
            return
        current = asyncio.current_task()
        active = self._ai_save_task
        if active is not None and active is not current and not active.done():
            await asyncio.shield(active)
            return
        if active is None or active.done():
            self._ai_save_task = current
        follow_up_used = False
        try:
            while True:
                self._ai_save_dirty = False
                prepare_started = time.perf_counter()
                payload = self._ai_store_payload()
                fingerprint = snapshot_id(self._ai_store_fingerprint_payload())
                self._performance.observe_ms(
                    "ai_store_prepare",
                    (time.perf_counter() - prepare_started) * 1000.0,
                )
                if fingerprint != self._ai_last_saved_fingerprint:
                    store_started = time.perf_counter()
                    await self._ai_store.async_save(payload)
                    self._performance.observe_ms(
                        "ai_store_save",
                        (time.perf_counter() - store_started) * 1000.0,
                    )
                    self._ai_last_saved_fingerprint = fingerprint
                if self._ai_save_dirty and not follow_up_used:
                    follow_up_used = True
                    continue
                break
        finally:
            if self._ai_save_task is current:
                self._ai_save_task = None
        if self._ai_save_dirty and not self._unloading:
            self.request_ai_save()


    @staticmethod
    def _expand_slot_updates(updates: Any) -> Any:
        """Fan hourly plan entries out to the half-hour schedule slots they cover.

        The optimizer and the card plan in hours.  An entry addressed to an
        hourly key such as ``05_06`` becomes one identical entry for each
        schedule slot of that hour; schedule slot keys pass through unchanged.
        """
        if not isinstance(updates, list):
            return updates
        expanded: list[Any] = []
        for raw in updates:
            if not isinstance(raw, dict):
                expanded.append(raw)
                continue
            key = str(raw.get("slot_key") or "")
            keys = slots_for_key(key)
            if len(keys) <= 1:
                expanded.append(raw)
                continue
            for slot_key in keys:
                expanded.append({**raw, "slot_key": slot_key})
        return expanded


    def _schedule_slot_fingerprint(self, slot_key: str) -> str:
        """Return the lightweight logical identity of one stored slot."""
        slot = self.slots[slot_key]
        return snapshot_id({
            "enabled": bool(slot.enabled),
            "mode": slot.mode,
            "physical_work_mode": slot.physical_work_mode,
            "sell_power": float(slot.sell_power),
            "charge_enabled": bool(slot.charge_enabled),
            "minimum_sell_soc": float(slot.minimum_sell_soc),
            "tou_soc": None if slot.tou_soc is None else float(slot.tou_soc),
            "min_sell_price": float(slot.min_sell_price),
        })

    def _claim_schedule_slots(
        self,
        slot_keys: list[str],
        source: str,
        context: dict[str, Any] | None = None,
    ) -> int:
        """Advance one schedule generation and record the writer of each slot."""
        keys = [key for key in dict.fromkeys(slot_keys) if key in self.slots]
        if not keys:
            return self.schedule_revision
        self.schedule_revision += 1
        revision = self.schedule_revision
        details = context if isinstance(context, dict) else {}
        for key in keys:
            self.schedule_slot_revisions[key] = revision
            self.schedule_slot_ownership[key] = {
                "source": source,
                "revision": revision,
                "plan_id": str(details.get("plan_id") or ""),
                "target_date": str(details.get("target_date") or ""),
                "slot_key": key,
                "intent_revision": int(self.safe_float(details.get("intent_revision"), 0)),
                "fingerprint": self._schedule_slot_fingerprint(key),
                "changed_at": ha_now().isoformat(timespec="seconds"),
            }
        return revision


    async def async_load_solcast_history(self) -> None:
        self._solcast_store = Store(self.hass, 1, f"{DOMAIN}_{self.entry_id}_solcast_history")
        raw = await self._solcast_store.async_load()
        data, migrated = migrate_solcast_payload(raw)
        history = data.get("history")
        tracking = data.get("tracking")
        self.solcast_history = history[:1825] if isinstance(history, list) else []
        self.solcast_tracking = tracking if isinstance(tracking, dict) else {}
        if migrated:
            await self.async_save_solcast_history()

    async def async_save_solcast_history(self) -> None:
        if self._solcast_store is None:
            return
        await self._solcast_store.async_save({
            "schema_version": HISTORY_SCHEMA_VERSION,
            "history": self.solcast_history[:1825],
            "tracking": self.solcast_tracking,
        })

    async def async_update_solcast_history(self) -> None:
        now = ha_now()
        today = now.date().isoformat()
        if self.pv_generation_enabled:
            forecast_reading = self.solcast_forecast_today_reading()
            forecast = max(0, self.safe_float(forecast_reading.get("value"), 0))
            actual = max(0, self.state_float(self.daily_pv_production_sensor, 0))
        else:
            forecast_reading = {"status": "disabled", "value": 0}
            forecast = 0.0
            actual = 0.0
        tracked_day = str(self.solcast_tracking.get("date") or "")
        try:
            valid_tracked_day = (
                datetime.strptime(tracked_day, "%Y-%m-%d").date().isoformat()
                if tracked_day
                else ""
            )
        except ValueError:
            valid_tracked_day = ""
        if valid_tracked_day > today:
            valid_tracked_day = ""
        missing_day = not valid_tracked_day
        tracked_day = valid_tracked_day
        changed_day = bool(tracked_day and tracked_day != today)
        if changed_day:
            previous_forecast = self.safe_float(
                self.solcast_tracking.get("initial_forecast_kwh", self.solcast_tracking.get("forecast")),
                0,
            )
            previous_latest = self.safe_float(
                self.solcast_tracking.get("latest_forecast_kwh", self.solcast_tracking.get("forecast")),
                previous_forecast,
            )
            previous_actual = self.safe_float(self.solcast_tracking.get("actual"), 0)
            if previous_forecast > 0:
                error = previous_actual - previous_forecast
                error_percent = error / previous_forecast * 100
                accuracy = max(0, 100 - abs(error_percent))
                self.solcast_history = [{
                    "date": tracked_day,
                    "forecast_kwh": round(previous_forecast, 3),
                    "initial_forecast_kwh": round(previous_forecast, 3),
                    "latest_forecast_kwh": round(previous_latest, 3),
                    "forecast_snapshots": list(self.solcast_tracking.get("forecast_snapshots") or []),
                    "actual_kwh": round(previous_actual, 3),
                    "error_kwh": round(error, 3),
                    "error_percent": round(error_percent, 1),
                    "accuracy_percent": round(accuracy, 1),
                    "day_complete": True,
                }, *[row for row in self.solcast_history if row.get("date") != tracked_day]][:1825]
            self.solcast_tracking = {}
        if missing_day or not self.solcast_tracking:
            preserved_snapshots = [
                dict(row)
                for row in (self.solcast_tracking.get("forecast_snapshots") or [])[-72:]
                if isinstance(row, dict)
            ]
            self.solcast_tracking = {
                "date": today,
                "forecast": forecast,
                "initial_forecast_kwh": forecast if forecast > 0 else None,
                "latest_forecast_kwh": forecast if forecast > 0 else None,
                "forecast_snapshots": preserved_snapshots,
                "actual": actual,
                "updated_at": now.isoformat(),
                "forecast_status": forecast_reading.get("status"),
                "forecast_source": forecast_reading.get("entity_id"),
                "forecast_last_updated": forecast_reading.get("last_updated"),
            }
        else:
            if self.safe_float(self.solcast_tracking.get("initial_forecast_kwh"), 0) <= 0 and forecast > 0:
                self.solcast_tracking["initial_forecast_kwh"] = forecast
                self.solcast_tracking["forecast"] = forecast
            if forecast > 0:
                self.solcast_tracking["latest_forecast_kwh"] = forecast
            self.solcast_tracking["actual"] = actual
            self.solcast_tracking["updated_at"] = now.isoformat()
            self.solcast_tracking["forecast_status"] = forecast_reading.get("status")
            self.solcast_tracking["forecast_source"] = forecast_reading.get("entity_id")
            self.solcast_tracking["forecast_last_updated"] = forecast_reading.get("last_updated")
        snapshots = self.solcast_tracking.setdefault("forecast_snapshots", [])
        snapshot_hour = now.replace(minute=0, second=0, microsecond=0).isoformat()
        if forecast > 0 and not any(str(row.get("timestamp")) == snapshot_hour for row in snapshots if isinstance(row, dict)):
            snapshots.append({"timestamp": snapshot_hour, "forecast_kwh": round(forecast, 3)})
            self.solcast_tracking["forecast_snapshots"] = snapshots[-72:]
        if changed_day or missing_day or now.minute % 15 == 0:
            await self.async_save_solcast_history()


    async def async_load_energy_history(self) -> None:
        self._samples_store = Store(self.hass, 1, f"{DOMAIN}_{self.entry_id}_energy_samples")
        raw = await self._samples_store.async_load()
        data, migrated = migrate_energy_payload(raw)
        self.energy_samples = data.get("samples", []) if isinstance(data.get("samples"), list) else []
        self._energy_recent_details = (
            data.get("recent_details", [])[-288:]
            if isinstance(data.get("recent_details"), list)
            else []
        )
        self.daily_archive = data.get("daily", []) if isinstance(data.get("daily"), list) else []
        self.monthly_archive = data.get("monthly", []) if isinstance(data.get("monthly"), list) else []
        self.energy_counter_state = data.get("counter_state") if isinstance(data.get("counter_state"), dict) else {}
        last = data.get("last_sample")
        try:
            self._last_energy_sample_at = datetime.fromisoformat(str(last)) if last else None
        except (TypeError, ValueError):
            self._last_energy_sample_at = None
        self._energy_revision = 1 if migrated else 0
        self._energy_saved_revision = -1 if migrated else 0
        self._energy_legacy_payload_backup = raw if migrated and isinstance(raw, dict) else None
        if migrated:
            await self.async_save_energy_history()

    def _energy_store_payload(self) -> dict[str, Any]:
        """Build a small, stable payload without copying legacy sample details."""
        return {
            "schema_version": HISTORY_SCHEMA_VERSION,
            "energy_format_version": ENERGY_COMPACT_FORMAT_VERSION,
            "samples": list(self.energy_samples),
            "recent_details": list(self._energy_recent_details[-288:]),
            "daily": list(self.daily_archive),
            "monthly": list(self.monthly_archive),
            "counter_state": dict(self.energy_counter_state),
            "last_sample": (
                self._last_energy_sample_at.isoformat()
                if self._last_energy_sample_at
                else None
            ),
        }

    def request_energy_save(self) -> Any:
        """Coalesce energy Store writes; one latest-wins follow-up is enough."""
        self._energy_save_dirty = True
        task = self._energy_save_task
        if (
            self._samples_store is None
            or self._startup_in_progress
            or self._unloading
            or (task is not None and not task.done())
        ):
            return task
        task = self.hass.async_create_task(self.async_save_energy_history())
        self._energy_save_task = task
        return task

    async def async_save_energy_history(self, *, force: bool = False) -> None:
        if self._samples_store is None or (self._unloading and not force):
            return
        self._energy_save_dirty = True
        current = asyncio.current_task()
        active = self._energy_save_task
        if active is not None and active is not current and not active.done():
            await asyncio.shield(active)
            return
        if active is None or active.done():
            self._energy_save_task = current
        follow_up_used = False
        try:
            while True:
                self._energy_save_dirty = False
                revision = self._energy_revision
                if revision != self._energy_saved_revision:
                    prepare_started = time.perf_counter()
                    payload = self._energy_store_payload()
                    self._performance.observe_ms(
                        "energy_store_prepare",
                        (time.perf_counter() - prepare_started) * 1000.0,
                    )
                    store_started = time.perf_counter()
                    await self._samples_store.async_save(payload)
                    self._performance.observe_ms(
                        "energy_store_save",
                        (time.perf_counter() - store_started) * 1000.0,
                    )
                    self._energy_saved_revision = revision
                    self._energy_legacy_payload_backup = None
                if self._energy_save_dirty and not follow_up_used:
                    follow_up_used = True
                    continue
                break
        finally:
            if self._energy_save_task is current:
                self._energy_save_task = None
        if self._energy_save_dirty and not self._unloading:
            self.request_energy_save()

    def _archive_energy_samples(self, now: datetime) -> None:
        cutoff = now - timedelta(days=90)
        old = []
        retained = []
        for sample in self.energy_samples:
            try:
                stamp = datetime.fromisoformat(str(sample.get("timestamp")))
                is_old = stamp < cutoff
            except (TypeError, ValueError):
                continue
            (old if is_old else retained).append(sample)
        self.energy_samples = retained
        if not old:
            return
        grouped: dict[str, list[dict[str, Any]]] = {}
        for sample in old:
            grouped.setdefault(str(sample.get("timestamp"))[:10], []).append(sample)
        existing = {str(row.get("date")): row for row in self.daily_archive}
        for day, samples in grouped.items():
            row: dict[str, Any] = {"date": day, "samples": len(samples)}
            for key in ("pv_power", "load_power", "grid_power", "battery_power", "soc", "sell_price", "buy_price"):
                values = [self.safe_float(item.get(key), 0) for item in samples if item.get(key) is not None]
                row[f"{key}_avg"] = round(sum(values) / len(values), 3) if values else None
            def integrated(key: str, direction: int = 1) -> float | None:
                total = 0.0
                valid = 0
                for item in samples:
                    measurement = finite_float(item.get(key))
                    if measurement is None:
                        continue
                    hours = max(0.0, min(900.0, self.safe_float(item.get("interval_seconds"), 300))) / 3600
                    value = measurement * direction
                    total += max(0.0, value) / 1000 * hours
                    valid += 1
                return round(total, 3) if valid else None

            row["pv_kwh"] = integrated("pv_power")
            row["load_kwh"] = integrated("load_power")
            row["grid_import_kwh"] = integrated("grid_power")
            row["grid_export_kwh"] = integrated("grid_power", -1)
            row["battery_charge_kwh"] = integrated("battery_power", -1)
            row["battery_discharge_kwh"] = integrated("battery_power")
            existing[day] = row
        daily_cutoff = (now - timedelta(days=1825)).date().isoformat()
        expired_daily = [row for day, row in existing.items() if day < daily_cutoff]
        self.daily_archive = sorted(
            (row for day, row in existing.items() if day >= daily_cutoff),
            key=lambda row: str(row.get("date")),
            reverse=True,
        )
        months: dict[str, list[dict[str, Any]]] = {}
        for row in self.daily_archive:
            months.setdefault(str(row.get("date"))[:7], []).append(row)
        energy_keys = ("pv_kwh", "load_kwh", "grid_import_kwh", "grid_export_kwh", "battery_charge_kwh", "battery_discharge_kwh")
        def month_row(month: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
            totals = {}
            for key in energy_keys:
                values = [
                    value
                    for row in rows
                    if (value := finite_float(row.get(key))) is not None
                ]
                totals[key] = round(sum(values), 3) if values else None
            return {
                "month": month,
                "days": len(rows),
                "samples": sum(int(row.get("samples", 0)) for row in rows),
                **totals,
            }
        retained_months = [month_row(month, rows) for month, rows in sorted(months.items(), reverse=True)]
        permanent = {
            str(row.get("month")): row
            for row in self.monthly_archive
            if str(row.get("month")) < daily_cutoff[:7]
        }
        expired_months: dict[str, list[dict[str, Any]]] = {}
        for row in expired_daily:
            expired_months.setdefault(str(row.get("date"))[:7], []).append(row)
        for month, rows in expired_months.items():
            permanent[month] = month_row(month, rows)
        self.monthly_archive = sorted([*retained_months, *permanent.values()], key=lambda row: str(row.get("month")), reverse=True)

    def _energy_counter_measurements(self, now: datetime) -> dict[str, Any]:
        """Read optional energy counters and persist reset-safe deltas."""
        definitions = {
            "daily_pv": self.daily_pv_production_sensor,
            "daily_load": self.daily_load_consumption_sensor,
            "daily_grid_import": self.daily_energy_bought_sensor,
            "daily_grid_export": self.daily_energy_sold_sensor,
            "daily_battery_charge": self.daily_battery_charge_sensor,
            "daily_battery_discharge": self.daily_battery_discharge_sensor,
        }
        timestamp = now.isoformat(timespec="seconds")
        day = now.date().isoformat()
        result: dict[str, Any] = {}
        for key, entity_id in definitions.items():
            state = self.hass.states.get(entity_id) if entity_id else None
            unit = state.attributes.get("unit_of_measurement") if state is not None else None
            value = energy_kwh(state.state, unit) if state is not None else None
            state_class = str(state.attributes.get("state_class") or "") if state is not None else ""
            device_class = str(state.attributes.get("device_class") or "") if state is not None else ""
            total_increasing = state_class == "total_increasing"
            if value is None:
                result[key] = {
                    "entity_id": entity_id,
                    "value_kwh": None,
                    "delta_kwh": None,
                    "status": "invalid_unit" if state is not None and state.state not in ("unknown", "unavailable", "none", "") else "unavailable",
                    "unit": unit,
                    "state_class": state_class or None,
                    "device_class": device_class or None,
                    "used_for_history": False,
                }
                continue
            update = update_energy_counter(
                self.energy_counter_state.get(key),
                value_kwh=value,
                day=day,
                timestamp=timestamp,
                total_increasing=total_increasing,
            )
            self.energy_counter_state[key] = update.state
            result[key] = {
                "entity_id": entity_id,
                "value_kwh": round(value, 6),
                "delta_kwh": round(update.delta_kwh, 6),
                "status": "reset" if update.reset_detected else "ok",
                "reset_detected": update.reset_detected,
                "first_sample": update.first_sample,
                "unit": unit,
                "state_class": state_class or None,
                "device_class": device_class or None,
                "used_for_history": True,
                "preferred_long_term": total_increasing and device_class == "energy",
            }
        self.data_quality["energy_counters"] = result
        return result

    async def async_update_energy_sample(self) -> None:
        now = ha_now()
        if self._last_energy_sample_at:
            try:
                if (now - self._last_energy_sample_at).total_seconds() < 55:
                    return
            except TypeError:
                self._last_energy_sample_at = None
        collect_started = time.perf_counter()
        readings = self._telemetry_readings()
        load = readings["load"]
        battery = readings["battery"]
        fields = {
            "pv_power": readings["pv"].get("value"),
            "load_power": load.get("value"),
            "load_l1_power": readings["load_l1"].get("value"),
            "load_l2_power": readings["load_l2"].get("value"),
            "load_l3_power": readings["load_l3"].get("value"),
            "grid_power": readings["grid"].get("value"),
            "battery_power": battery.get("value"),
            "soc": readings["soc"].get("value"),
            "sell_price": readings["sell_price"].get("value"),
            "buy_price": readings["buy_price"].get("value"),
            "daily_pv": self.state_float_or_none(self.daily_pv_production_sensor),
        }
        fields.update(split_directional_power(
            grid_power_w=fields["grid_power"],
            battery_power_w=fields["battery_power"],
        ))
        interval_seconds = 60.0
        if self._last_energy_sample_at is not None:
            try:
                interval_seconds = max(0.0, min(120.0, (now - self._last_energy_sample_at).total_seconds()))
            except TypeError:
                interval_seconds = 60.0
        tariff = self.tariff_context(now)
        weather = self.weather_context()
        live_state = self.live_state_context(readings, now)
        sample = {
            "schema_version": HISTORY_SCHEMA_VERSION,
            "timestamp": now.replace(microsecond=0).isoformat(),
            "interval_seconds": round(interval_seconds, 1),
            **fields,
            "missing": [key for key, value in fields.items() if value is None],
            "readings": {
                name: {
                    "value": item.get("value"),
                    "status": item.get("status"),
                    "quality": item.get("quality"),
                    "source": item.get("source"),
                    "last_updated": item.get("last_updated"),
                    "usable_for_scheduling": item.get("value") is not None
                    and item.get("quality") != "unavailable",
                }
                for name, item in readings.items()
            },
            "source_quality": self.source_quality_context(),
            "live_state": live_state,
            "control": {
                "mode": live_state.get("active_mode"),
                "power_w": live_state.get("active_power_w"),
                "slot_key": live_state.get("slot_key"),
            },
            "solcast": {
                "current_power_w": self._measurement(self.solcast_current_power_sensor).get("value"),
                "forecast_today_kwh": self.solcast_forecast_today_value(),
                "forecast_remaining_kwh": self.state_float_or_none(self.solcast_remaining_today_sensor),
            },
            "weather": {
                key: weather.get(key)
                for key in (
                    "available", "condition", "temperature", "humidity",
                    "cloud_coverage", "precipitation_probability",
                    "risk_factor", "last_updated",
                )
            },
            "energy_counters": self._energy_counter_measurements(now),
            "tariff": {
                key: tariff.get(key)
                for key in ("provider", "plan", "zone", "season", "day_type", "distribution_rate", "catalog_version")
            },
        }
        self.energy_samples.append(compact_energy_sample(sample))
        self._energy_recent_details = [*self._energy_recent_details[-287:], sample]
        self._last_energy_sample_at = now
        self._archive_energy_samples(now)
        self._energy_revision += 1
        self._performance.observe_ms(
            "energy_collect",
            (time.perf_counter() - collect_started) * 1000.0,
        )
        self._performance.set_value("energy_sample_count", len(self.energy_samples))
        self.request_energy_save()

    async def async_update_weather_forecast(self) -> None:
        entity_id = self.weather_entity
        if not entity_id or not self.entity_available(entity_id):
            self.weather_forecast = []
            self.weather_daily_forecast = []
            self.weather_last_error = "The weather entity is unavailable"
            return

        async def fetch_forecast(kind: str) -> list[dict[str, Any]]:
            response = await self.hass.services.async_call(
                "weather",
                "get_forecasts",
                {"type": kind},
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
            payload = response.get(entity_id, response) if isinstance(response, dict) else {}
            forecast = payload.get("forecast", []) if isinstance(payload, dict) else []
            return [row for row in forecast if isinstance(row, dict)] if isinstance(forecast, list) else []

        previous_hourly = list(self.weather_forecast)
        previous_daily = list(self.weather_daily_forecast)
        errors: list[str] = []
        hourly: list[dict[str, Any]] = []
        daily: list[dict[str, Any]] = []

        async def fetch_optional(kind: str) -> list[dict[str, Any]]:
            try:
                return await asyncio.wait_for(
                    fetch_forecast(kind),
                    timeout=max(0.01, float(self.weather_forecast_timeout)),
                )
            except TimeoutError:
                errors.append(
                    f"{kind}: timeout po {max(0.01, float(self.weather_forecast_timeout)):.2f} s"
                )
            except Exception as err:  # Weather is optional and must never fail DEM startup.
                errors.append(f"{kind}: {err}")
            return []

        hourly, daily = await asyncio.gather(
            fetch_optional("hourly"),
            fetch_optional("daily"),
        )

        # Compatibility fallback for older weather entities exposing forecast as an attribute.
        if not hourly:
            state = self.hass.states.get(entity_id)
            fallback = state.attributes.get("forecast", []) if state is not None else []
            hourly = [row for row in fallback if isinstance(row, dict)] if isinstance(fallback, list) else []
        if errors and not hourly:
            hourly = previous_hourly
        if errors and not daily:
            daily = previous_daily

        # Some providers implement only the hourly endpoint. Build a truthful
        # daily summary from those samples instead of displaying invented zeros.
        if not daily and hourly:
            grouped: dict[str, list[dict[str, Any]]] = {}
            local_now = ha_now()
            for row in hourly:
                raw_time = row.get("datetime", row.get("time"))
                try:
                    stamp = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
                    if local_now.tzinfo is not None and stamp.tzinfo is not None:
                        stamp = stamp.astimezone(local_now.tzinfo)
                    day_key = stamp.date().isoformat()
                except (TypeError, ValueError):
                    continue
                grouped.setdefault(day_key, []).append(row)
            for day_key, rows in sorted(grouped.items())[:7]:
                temperatures = [
                    self.safe_float(row.get("temperature"), float("nan"))
                    for row in rows
                    if row.get("temperature") is not None
                ]
                temperatures = [value for value in temperatures if value == value]
                condition_counts: dict[str, int] = {}
                for row in rows:
                    condition = str(row.get("condition") or "")
                    if condition:
                        condition_counts[condition] = condition_counts.get(condition, 0) + 1
                condition = max(condition_counts, key=condition_counts.get) if condition_counts else None
                probabilities = [
                    self.safe_float(row.get("precipitation_probability"), 0)
                    for row in rows
                    if row.get("precipitation_probability") is not None
                ]
                daily.append({
                    "datetime": day_key,
                    "condition": condition,
                    "temperature": max(temperatures) if temperatures else None,
                    "templow": min(temperatures) if temperatures else None,
                    "precipitation_probability": max(probabilities) if probabilities else None,
                    "derived_from_hourly": True,
                })

        self.weather_forecast = hourly[:48]
        self.weather_daily_forecast = daily[:7]
        self.weather_last_error = "; ".join(errors)
        if hourly or daily:
            self.weather_last_updated = ha_now().isoformat(timespec="seconds")


    def history_daily_summary(self) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for day, values in self.sales_stats.get("daily", {}).items():
            item = grouped.setdefault(day, {"date": day})
            item["sold_kwh"] = self.safe_float(values.get("kwh"), 0)
            item["sold_value"] = self.safe_float(values.get("value"), 0)
        if self.pv_generation_enabled:
            for row in self.solcast_history:
                day = str(row.get("date") or "")
                item = grouped.setdefault(day, {"date": day})
                item.update({
                    "forecast_kwh": self.safe_float(row.get("forecast_kwh"), 0),
                    "actual_kwh": self.safe_float(row.get("actual_kwh"), 0),
                    "accuracy_percent": self.safe_float(row.get("accuracy_percent"), 0),
                })
            tracking_day = str(self.solcast_tracking.get("date") or "")
            if tracking_day:
                metrics = self.solcast_current_day_metrics()
                forecast = metrics.get("forecast_today_kwh")
                actual = metrics.get("production_today_kwh")
                grouped.setdefault(tracking_day, {"date": tracking_day}).update({
                    "forecast_kwh": forecast,
                    "actual_kwh": actual,
                    "accuracy_percent": None,
                    "realization_today_pct": metrics.get("realization_today_pct"),
                    "forecast_progress_percent": metrics.get("realization_today_pct"),
                    "forecast_difference_today_kwh": metrics.get("forecast_difference_today_kwh"),
                    "solcast_data_status": metrics.get("data_status"),
                    "day_complete": False,
                })
        for row in self.daily_archive:
            day = str(row.get("date") or "")
            if day:
                grouped.setdefault(day, dict(row))
        return [
            {key: round(value, 3) if isinstance(value, float) else value for key, value in row.items()}
            for _day, row in sorted(grouped.items(), reverse=True)[:1825]
        ]

    def history_monthly_summary(self) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for row in self.history_daily_summary():
            month = str(row.get("date") or "")[:7]
            if not month:
                continue
            item = grouped.setdefault(month, {"month": month, "days": 0})
            item["days"] += 1
            for key in ("pv_kwh", "load_kwh", "grid_import_kwh", "grid_export_kwh", "battery_charge_kwh", "battery_discharge_kwh", "sold_kwh", "sold_value", "forecast_kwh", "actual_kwh"):
                item[key] = self.safe_float(item.get(key), 0) + self.safe_float(row.get(key), 0)
        for row in self.monthly_archive:
            month = str(row.get("month") or "")
            if month and month not in grouped:
                grouped[month] = dict(row)
        return [
            {key: round(value, 3) if isinstance(value, float) else value for key, value in row.items()}
            for _month, row in sorted(grouped.items(), reverse=True)
        ]

    def safe_float(self, value: Any, default: float = 0) -> float:
        number = finite_float(value)
        return default if number is None else number

    def solcast_forecast_today_reading(self) -> dict[str, Any]:
        """Resolve today's full forecast with source and freshness metadata."""
        if not self.pv_generation_enabled:
            return {
                "entity_id": self.solcast_forecast_today_sensor,
                "value": 0.0,
                "unit": "kWh",
                "last_updated": None,
                "status": "disabled",
                "quality": "unavailable",
                "source": "disabled",
            }
        configured = self._measurement(
            self.solcast_forecast_today_sensor,
            kind="energy",
            stale_after_seconds=_SOLCAST_DAILY_FORECAST_STALE_SECONDS,
        )
        if configured.get("status") == "ok" and self.safe_float(configured.get("value"), 0) > 0:
            return configured

        for state in self.hass.states.async_all("sensor"):
            entity_id = state.entity_id.lower()
            friendly_name = str(state.attributes.get("friendly_name") or "").lower()
            searchable = f"{entity_id} {friendly_name}"
            if "solcast" not in searchable:
                continue
            if not any(token in searchable for token in ("forecast_today", "forecast today")):
                continue
            if any(token in searchable for token in ("remaining", "current_power", "peak")):
                continue
            candidate = self._measurement(
                state.entity_id,
                kind="energy",
                stale_after_seconds=_SOLCAST_DAILY_FORECAST_STALE_SECONDS,
            )
            if candidate.get("status") == "ok" and self.safe_float(candidate.get("value"), 0) > 0:
                candidate["source"] = "discovered_renamed_entity"
                return candidate

        actual = self._measurement(
            self.daily_pv_production_sensor,
            kind="energy",
            stale_after_seconds=_SOLCAST_TRACKING_STALE_SECONDS,
        )
        remaining = self._measurement(
            self.solcast_remaining_today_sensor,
            kind="energy",
            stale_after_seconds=_SOLCAST_TRACKING_STALE_SECONDS,
        )
        remaining_value = self.safe_float(remaining.get("value"), 0)
        if (
            actual.get("status") == "ok"
            and remaining.get("status") == "ok"
            and remaining_value > 0
        ):
            return {
                "entity_id": self.solcast_remaining_today_sensor,
                "value": max(0, self.safe_float(actual.get("value"), 0)) + remaining_value,
                "unit": "kWh",
                "last_updated": remaining.get("last_updated"),
                "status": "derived_actual_plus_remaining",
                "quality": "degraded",
                "source": "actual_plus_remaining",
            }
        if configured.get("status") == "ok":
            configured["status"] = "zero_forecast"
            configured["quality"] = "unavailable"
        return configured

    def solcast_forecast_today_value(self) -> float:
        """Return the fresh full-day forecast value or the compatibility zero."""
        reading = self.solcast_forecast_today_reading()
        if reading.get("status") not in ("ok", "derived_actual_plus_remaining"):
            return 0
        return max(0, self.safe_float(reading.get("value"), 0))

    def solcast_current_day_metrics(
        self,
        *,
        historical_accuracy_pct: Any = None,
    ) -> dict[str, Any]:
        """Return the single O(1) current-day Solcast presentation contract."""
        now = ha_now()
        today = now.date().isoformat()
        tracking = self.solcast_tracking if isinstance(self.solcast_tracking, dict) else {}
        tracking_day = str(tracking.get("date") or "")
        updated_at = tracking.get("updated_at")
        if not self.pv_generation_enabled:
            def rounded(value: Any, digits: int = 3) -> float | None:
                number = finite_float(value)
                return round(number, digits) if number is not None else None

            return {
                "local_day": today,
                "tracking_day": tracking_day or None,
                "forecast_today_kwh": None,
                "production_today_kwh": None,
                "remaining_forecast_kwh": None,
                "realization_today_pct": None,
                "historical_accuracy_pct": rounded(historical_accuracy_pct, 1),
                "forecast_difference_today_kwh": None,
                "forecast_tomorrow_kwh": None,
                "data_status": "disabled",
                "forecast_source": tracking.get("forecast_source") or self.solcast_forecast_today_sensor,
                "forecast_source_status": "disabled",
                "tracking_updated_at": updated_at,
                "initial_forecast_kwh": None,
            }
        forecast = finite_float(
            tracking.get("latest_forecast_kwh", tracking.get("forecast"))
        )
        production = finite_float(tracking.get("actual"))
        status = str(tracking.get("forecast_status") or "legacy_tracking")
        stale_tracking = False
        if updated_at:
            try:
                updated = datetime.fromisoformat(str(updated_at))
                tracking_age = self._timestamp_age_seconds(updated)
                stale_tracking = (
                    tracking_age is not None
                    and tracking_age > _SOLCAST_TRACKING_STALE_SECONDS
                )
            except (TypeError, ValueError):
                stale_tracking = True
        if tracking_day != today:
            status = "stale_local_day"
        elif stale_tracking:
            status = "stale"
        elif (
            status in ("ok", "derived_actual_plus_remaining", "legacy_tracking")
            and (forecast is None or forecast <= 0)
        ):
            status = "zero_forecast"

        forecast_usable = (
            status in ("ok", "derived_actual_plus_remaining", "legacy_tracking")
            and forecast is not None
            and forecast > 0
        )
        production_usable = (
            tracking_day == today
            and production is not None
            and production >= 0
        )
        usable = forecast_usable and production_usable
        canonical_forecast = max(0.0, forecast) if forecast_usable else None
        canonical_production = max(0.0, production) if production_usable else None
        realization = (
            canonical_production / canonical_forecast * 100
            if usable and canonical_forecast is not None and canonical_production is not None
            else None
        )
        difference = (
            canonical_production - canonical_forecast
            if usable and canonical_forecast is not None and canonical_production is not None
            else None
        )
        remaining = self._measurement(
            self.solcast_remaining_today_sensor,
            kind="energy",
            stale_after_seconds=_SOLCAST_TRACKING_STALE_SECONDS,
        )
        tomorrow = self._measurement(
            self.solcast_forecast_tomorrow_sensor,
            kind="energy",
            stale_after_seconds=_SOLCAST_DAILY_FORECAST_STALE_SECONDS,
        )

        def rounded(value: Any, digits: int = 3) -> float | None:
            number = finite_float(value)
            return round(number, digits) if number is not None else None

        return {
            "local_day": today,
            "tracking_day": tracking_day or None,
            "forecast_today_kwh": rounded(canonical_forecast),
            "production_today_kwh": rounded(canonical_production),
            "remaining_forecast_kwh": (
                rounded(max(0.0, self.safe_float(remaining.get("value"), 0)))
                if remaining.get("status") == "ok"
                else None
            ),
            "realization_today_pct": rounded(realization, 1),
            "historical_accuracy_pct": rounded(historical_accuracy_pct, 1),
            "forecast_difference_today_kwh": rounded(difference),
            "forecast_tomorrow_kwh": (
                rounded(max(0.0, self.safe_float(tomorrow.get("value"), 0)))
                if tomorrow.get("status") == "ok"
                else None
            ),
            "data_status": (
                "ok"
                if usable
                else "production_unavailable"
                if forecast_usable and not production_usable
                else status
            ),
            "forecast_source": tracking.get("forecast_source") or self.solcast_forecast_today_sensor,
            "forecast_source_status": status,
            "tracking_updated_at": updated_at,
            "initial_forecast_kwh": rounded(tracking.get("initial_forecast_kwh", tracking.get("forecast"))),
        }

    def ensure_current_day_stats(self, day: str) -> None:
        if not self.sales_stats:
            self.sales_stats = self.empty_sales_stats()
        if self.sales_stats.get("current_day") == day:
            return

        previous_day = str(self.sales_stats.get("current_day") or "")
        if previous_day:
            kwh = sum(self.safe_float(values.get("kwh"), 0) for values in self.sales_stats.get("hourly", {}).values())
            value = sum(self.safe_float(values.get("value"), 0) for values in self.sales_stats.get("hourly", {}).values())
            daily = self.sales_stats.setdefault("daily", {})
            daily[previous_day] = {"kwh": round(kwh, 4), "value": round(value, 4)}
            for old_day in sorted(daily)[:-1825]:
                daily.pop(old_day, None)

        self.sales_stats["current_day"] = day
        self.sales_stats["hourly"] = self.empty_hourly_stats()
        self._stats_dirty = True

    def refresh_sales_totals(self) -> None:
        hourly = self.sales_stats.get("hourly", {}) if self.sales_stats else {}
        current_hour = f"{ha_now().hour:02d}"
        current = hourly.get(current_hour, {})
        integrated_kwh = sum(self.safe_float(values.get("kwh"), 0) for values in hourly.values())
        integrated_value = sum(self.safe_float(values.get("value"), 0) for values in hourly.values())
        counter = self._measurement(self.daily_energy_sold_sensor, kind="energy")
        provider_kwh = counter.get("value")
        self.sold_energy_today = round(float(provider_kwh) if provider_kwh is not None else integrated_kwh, 4)
        # The provider counter has no hourly price breakdown. Keep the monetary
        # result based on the Manager's hourly integration instead of inventing
        # a historical price for the counter difference.
        self.sold_value_today = round(integrated_value, 4)
        self.data_quality["sales_today"] = {
            "energy_source": "daily_export_counter" if provider_kwh is not None else "integrated_grid_power",
            "provider_export_kwh": None if provider_kwh is None else round(float(provider_kwh), 4),
            "integrated_export_kwh": round(integrated_kwh, 4),
            "difference_kwh": None if provider_kwh is None else round(float(provider_kwh) - integrated_kwh, 4),
            "value_source": "integrated_hourly_prices",
        }
        self.sold_energy_current_hour = round(self.safe_float(current.get("kwh"), 0), 4)
        self.sold_value_current_hour = round(self.safe_float(current.get("value"), 0), 4)

    def sales_hourly_today(self) -> list[dict[str, Any]]:
        hourly = self.sales_stats.get("hourly", {}) if self.sales_stats else {}
        data: list[dict[str, Any]] = []
        for hour in range(24):
            key = f"{hour:02d}"
            values = hourly.get(key, {})
            kwh = round(self.safe_float(values.get("kwh"), 0), 4)
            value = round(self.safe_float(values.get("value"), 0), 4)
            data.append(
                {
                    "hour": hour,
                    "label": f"{hour:02d}-{(hour + 1) % 24:02d}",
                    "kwh": kwh,
                    "value": value,
                    "avg_price": round(value / kwh, 4) if kwh > 0 else 0,
                }
            )
        return data

    def sales_daily_rows(self, days: int | None = None, month_only: bool = False) -> list[dict[str, Any]]:
        today = ha_now().date()
        daily = dict(self.sales_stats.get("daily", {}) if self.sales_stats else {})
        daily[today.isoformat()] = {"kwh": self.sold_energy_today, "value": self.sold_value_today}
        rows: list[dict[str, Any]] = []
        for day, values in sorted(daily.items()):
            try:
                date_obj = datetime.fromisoformat(day).date()
            except ValueError:
                continue
            if month_only and (date_obj.year != today.year or date_obj.month != today.month):
                continue
            rows.append(
                {
                    "date": day,
                    "label": date_obj.strftime("%d.%m"),
                    "kwh": round(self.safe_float(values.get("kwh"), 0), 4),
                    "value": round(self.safe_float(values.get("value"), 0), 4),
                }
            )
        if days is not None:
            rows = rows[-days:]
        return rows

    @property
    def sales_week_rows(self) -> list[dict[str, Any]]:
        return self.sales_daily_rows(days=7)

    @property
    def sales_month_rows(self) -> list[dict[str, Any]]:
        return self.sales_daily_rows(month_only=True)

    async def async_update_sold_energy_today(self) -> None:
        current = ha_now()
        current_day = current.date().isoformat()
        self.ensure_current_day_stats(current_day)
        self._energy_day = current_day
        if self._energy_last_update is None:
            self._energy_last_update = current
            self._stats_dirty = True
            self.refresh_sales_totals()
            await self.async_save_sales_stats()
            return
        delta_seconds = max((current - self._energy_last_update).total_seconds(), 0)
        delta_seconds = min(delta_seconds, 300)
        delta_hours = delta_seconds / 3600
        self._energy_last_update = current
        grid_power = self.normalized_grid_power()
        exported_power_w = max(0, -grid_power)
        if exported_power_w > 0 and delta_hours > 0:
            kwh = (exported_power_w / 1000) * delta_hours
            value = kwh * max(self.state_float(self.price_sensor, 0), 0)
            hour_key = f"{current.hour:02d}"
            hourly = self.sales_stats.setdefault("hourly", self.empty_hourly_stats())
            values = hourly.setdefault(hour_key, {"kwh": 0.0, "value": 0.0})
            values["kwh"] = round(self.safe_float(values.get("kwh"), 0) + kwh, 6)
            values["value"] = round(self.safe_float(values.get("value"), 0) + value, 6)
            self._stats_dirty = True
        self.refresh_sales_totals()
        await self.async_save_sales_stats()

    @property
    def active_min_sell_soc(self) -> float:
        if (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self.active_slot.mode == MODE_SELLING_FIRST
            and self.active_slot.minimum_sell_soc > 0
        ):
            return self.active_slot.minimum_sell_soc
        return self.min_sell_soc

    @property
    def active_min_sell_price(self) -> float:
        if self.control_mode == "Schedule" and self.active_slot.enabled and self.active_slot.min_sell_price > 0:
            return self.active_slot.min_sell_price
        return self.price_sell_threshold if self.price_guard_enabled else 0

    @property
    def soc_ok(self) -> bool:
        if not self.soc_guard_enabled or self.active_min_sell_soc <= 0:
            return True
        soc = self.current_soc_or_none()
        return soc is not None and 0 <= soc <= 100 and soc > self.active_min_sell_soc

    @property
    def price_ok(self) -> bool:
        if self.active_min_sell_price <= 0:
            return True
        price = self.state_float_or_none(self.price_sensor)
        return price is not None and price >= self.active_min_sell_price

    @property
    def sell_allowed(self) -> bool:
        return (
            not self.emergency_stop
            and self.data_available
            and self.soc_ok
            and self.price_ok
            and self.control_mode != "Protect Battery"
        )

    def _selling_slot_guard_issue(self) -> tuple[str, str] | None:
        """Classify a Selling First guard as a normal block or a data error.

        A valid SOC or price below the slot threshold is an expected runtime
        condition, not a failed Deye transaction.  An absent or malformed
        source remains an error because the manager cannot make a safe
        selling decision from it.
        """
        if not (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self.active_slot.mode == MODE_SELLING_FIRST
        ):
            return None

        if self.soc_guard_enabled and self.active_min_sell_soc > 0:
            soc = self.current_soc_or_none()
            if soc is None or not 0 <= soc <= 100:
                return ("error", "No valid SOC reading for selling")
            if soc <= self.active_min_sell_soc:
                return (
                    "blocked",
                    f"Selling suspended: SOC {soc:.0f}% reached or fell below the limit "
                    f"{self.active_min_sell_soc:.0f}%",
                )

        if self.active_min_sell_price > 0:
            price = self.state_float_or_none(self.price_sensor)
            if price is None:
                return ("error", "No valid sell price reading")
            if price < self.active_min_sell_price:
                return (
                    "blocked",
                    f"Selling suspended: price {price:.2f} per kWh is below the threshold "
                    f"{self.active_min_sell_price:.2f} per kWh",
                )
        return None

    def _selling_slot_is_blocked(self) -> bool:
        issue = self._selling_slot_guard_issue()
        return issue is not None and issue[0] == "blocked"

    def _sell_block_fingerprint(self, reason: str) -> str:
        """Identify one continuous, normal sale block without repeated writes."""
        return f"{self.active_slot_key()}:{reason.split(':', 1)[0]}"

    @property
    def charge_allowed(self) -> bool:
        """Compatibility status for manual charge controls.

        It never grants grid charging.  That permission belongs exclusively
        to the active Charge slot's explicit ``charge_enabled`` flag.
        """
        return not self.emergency_stop and self.data_available

    @property
    def active_charge_slot(self) -> bool:
        """Whether the current schedule slot uses its copied Charge settings."""
        return (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self.active_slot.mode == MODE_CHARGE
        )

    @property
    def target_mode(self) -> str:
        if self.control_mode == "Manual Sell":
            return MODE_SELLING_FIRST
        if self.control_mode in ("Stop Sell", "Protect Battery", "Charge Battery"):
            # Legacy manager model: these override actions fall back to normal
            # operation.  The physical topology is resolved separately.
            return MODE_NORMAL_OPERATION
        if (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self.active_slot.mode == MODE_SELLING_FIRST
            and self._selling_slot_is_blocked()
        ):
            return self.default_work_mode
        if self.active_charge_slot:
            # Charge is a manager profile, not a fourth Deye work mode.  Keep
            # the user's selected default logical mode (Normal Operation).
            return self.default_work_mode
        if self.active_slot.enabled:
            return self.active_slot.mode
        return self.default_work_mode

    @property
    def target_sell_power(self) -> float:
        if self.control_mode == "Manual Sell":
            return self.manual_sell_power
        if self.control_mode != "Schedule":
            return self.default_sell_power
        if self.active_slot.enabled and self.active_slot.mode == MODE_SELLING_FIRST and self._selling_slot_is_blocked():
            return self.default_sell_power
        if self.active_charge_slot:
            return self.default_sell_power
        return self.active_slot.sell_power if self.active_slot.enabled else self.default_sell_power

    @property
    def applied_sell_power(self) -> float:
        """Sell power normalized for safe automatic Deye writes."""
        return self.normalize_automatic_sell_power_w(self.target_sell_power)

    @staticmethod
    def _format_decision_power(watts: float) -> str:
        """Show a decision power in W below 10 kW and in kW above it."""
        value = max(0.0, float(watts))
        if value < 10000:
            return f"{value:.0f} W"
        return f"{value / 1000:.1f} kW"

    def _planned_manager_action_text(self) -> str:
        """Describe the existing decision path in stable, user-facing English."""

        if self.emergency_stop:
            action = "Emergency stop"
        elif self.control_mode == "Manual Sell":
            power = self._format_decision_power(self.manual_sell_power)
            action = f"Manual selling — {power}"
        elif self.control_mode == "Charge Battery":
            action = "Battery charging"
        elif self.control_mode == "Stop Sell":
            action = "Selling stopped — default settings"
        elif self.control_mode == "Protect Battery":
            action = "Battery protection — default settings"
        elif self.control_mode != "Schedule" or not self.scheduler_enabled:
            action = "Schedule disabled — no action"
        elif not self.active_slot.enabled:
            action = "Slot disabled — default settings"
        elif self.active_slot.mode == MODE_SELLING_FIRST:
            guard_issue = self._selling_slot_guard_issue()
            if guard_issue is not None:
                _kind, reason = guard_issue
                action = reason.replace(":", " —", 1)
            else:
                power = self._format_decision_power(self.applied_sell_power)
                action = f"Selling — {power}"
        elif self.active_slot.mode == MODE_CHARGE:
            source = "from grid" if self.active_slot.charge_enabled else "from PV"
            target_soc = self.safe_float(self.active_slot.tou_soc, 0)
            action = f"Charging {source} — target SOC {target_soc:.0f}%"
        else:
            measurement = (
                "CT"
                if self._active_physical_work_mode() == MODE_ZERO_EXPORT_CT
                else "Load"
            )
            action = f"Normal Operation — measurement {measurement}"

        if not self._control_is_active():
            return f"{action} — monitoring only"
        return action

    def _executed_manager_action_text(
        self,
        *,
        result: bool,
        physical_writes: int,
    ) -> str:
        """Summarize the actual outcome of one completed Manager cycle."""

        if self.emergency_stop:
            return "Not performed — emergency stop"
        if self._pending_control_transaction:
            return f"Waiting for confirmation: {self.planned_manager_action}"
        if self.planned_manager_action.startswith("Selling suspended"):
            return self.planned_manager_action.replace(
                "Selling suspended", "Selling not performed", 1
            )
        if result:
            if physical_writes > 0:
                return f"Applied: {self.planned_manager_action}"
            return "No change — settings match"
        if "Previous settings restored" in self.last_error:
            return "Previous settings restored after an error"
        if self.last_error:
            detail = " ".join(str(self.last_error).split())[:160]
            return f"Execution error — {detail}"
        return f"Not performed: {self.planned_manager_action}"

    @property
    def manager_status(self) -> str:
        if not self._control_is_active():
            return "MONITORING ONLY"
        if self.emergency_stop:
            return "EMERGENCY STOPPED"
        if not self.data_available:
            return "NO DATA"
        if self.mapping_error and self.control_mode == "Schedule":
            return "MAPPING ERROR"
        if self.control_mode == "Protect Battery":
            return "BATTERY PROTECTION"
        if self.control_mode == "Manual Sell":
            return "MANUAL SELL"
        if self.control_mode == "Charge Battery":
            return "BATTERY CHARGING"
        if self.control_mode == "Stop Sell":
            return "SELLING SUSPENDED"
        if self.control_mode == "Schedule":
            if not self.scheduler_enabled:
                return "SCHEDULE DISABLED"
            if not self.active_slot.enabled:
                return "SLOT DISABLED"
            guard_issue = self._selling_slot_guard_issue()
            if guard_issue and guard_issue[0] == "blocked":
                return "SELLING BLOCKED"
            if self.last_schedule_attempt.get("status") == "failed" and self.last_schedule_attempt.get("slot") == self.active_slot_key():
                return "SCHEDULE APPLY ERROR"
            if self.active_slot.mode == MODE_SELLING_FIRST and not self.soc_ok:
                return "SOC TOO LOW"
            if self.active_slot.mode == MODE_SELLING_FIRST and not self.price_ok:
                return "PRICE TOO LOW"
            if self.active_charge_slot:
                return "GRID CHARGING" if self.active_slot.charge_enabled else "PV CHARGING"
            if self.active_slot.mode == MODE_SELLING_FIRST:
                return "SELLING ACTIVE"
            if self.active_slot.mode == MODE_NORMAL_OPERATION:
                physical = self.active_slot.physical_work_mode
                if physical == MODE_ZERO_EXPORT_CT:
                    return "NORMAL OPERATION (CT)"
                return "NORMAL OPERATION (LOAD)"
            return "WAITING"
        return "WAITING"

    def _active_physical_work_mode(self) -> str:
        """Return the physical work mode variant for the current active slot."""
        if self.active_slot and self.active_slot.enabled and self.active_slot.physical_work_mode:
            return self.active_slot.physical_work_mode
        return self.normal_profile_physical_work_mode

    def default_normal_physical_work_mode(self) -> str:
        """Return the explicit default variant or the pre-5F.1 profile fallback."""
        if self.default_physical_work_mode in PHYSICAL_NORMAL_MODES:
            return str(self.default_physical_work_mode)
        if self.normal_profile_physical_work_mode in PHYSICAL_NORMAL_MODES:
            return str(self.normal_profile_physical_work_mode)
        return str(provider_profile(self.data).default_normal_mode)

    def _normalize_work_mode_input(self, mode: str) -> tuple[str, str | None]:
        """Accept either logical manager mode or a physical normal variant."""
        if mode in PHYSICAL_NORMAL_MODES:
            return (MODE_NORMAL_OPERATION, mode)
        normalized = normalize_manager_mode(mode)
        if normalized in MANAGER_MODES:
            return (normalized, None)
        return (mode, None)

    async def async_set_work_mode(self, mode: str) -> None:
        profile = provider_profile(self.data)
        if not profile.basic_control:
            raise ValueError(f"Provider {profile.label} does not support inverter control")
        mode, physical_override = self._normalize_work_mode_input(mode)
        physical = physical_override or (
            self._active_physical_work_mode() if mode == MODE_NORMAL_OPERATION else None
        )
        option = logical_mode_option(self.data, mode, physical)
        if profile.needs_aux_export_switch and mode != MODE_SELLING_FIRST:
            await self.async_set_switch(self.work_mode_aux_entity, False)
        await self._async_physical_service_call(
            "select",
            "select_option",
            {"entity_id": self.work_mode_select, "option": option},
            target_value=option,
        )
        if profile.needs_aux_export_switch and mode == MODE_SELLING_FIRST:
            await self.async_set_switch(self.work_mode_aux_entity, True)

    async def async_set_work_mode_if_needed(self, mode: str) -> bool:
        """Avoid re-sending an unchanged select option during a schedule tick."""
        state = self.hass.states.get(self.work_mode_select)
        aux_ok = True
        profile = provider_profile(self.data)
        mode, physical_override = self._normalize_work_mode_input(mode)
        if profile.needs_aux_export_switch:
            aux_state = self.hass.states.get(self.work_mode_aux_entity)
            aux_ok = aux_state is not None and aux_state.state == ("on" if mode == MODE_SELLING_FIRST else "off")
        physical = physical_override or (
            self._active_physical_work_mode() if mode == MODE_NORMAL_OPERATION else None
        )
        if state is not None and logical_mode_matches(self.data, mode, str(state.state), physical) and aux_ok:
            self._performance.inc("inverter_write_skipped_same_value")
            return False
        await self.async_set_work_mode(mode)
        return True

    async def async_set_number(self, entity_id: str | None, value: float) -> None:
        if entity_id:
            await self._async_physical_service_call(
                "number",
                "set_value",
                {"entity_id": entity_id, "value": value},
                target_value=value,
            )

    async def async_set_select(self, entity_id: str | None, value: str) -> None:
        """Write one select option through the guarded physical write layer."""
        if entity_id:
            await self._async_physical_service_call(
                "select",
                "select_option",
                {"entity_id": entity_id, "option": value},
                target_value=value,
            )

    async def async_set_number_if_needed(self, entity_id: str | None, value: float) -> bool:
        """Write a number only when Deye does not already report that value."""
        state = self.hass.states.get(entity_id) if entity_id else None
        current = None if state is None else self.safe_float(state.state, float("nan"))
        if current is not None and math.isfinite(current) and math.isclose(current, float(value), abs_tol=0.1):
            self._performance.inc("inverter_write_skipped_same_value")
            return False
        await self.async_set_number(entity_id, value)
        return True

    async def async_set_switch(self, entity_id: str | None, value: bool) -> None:
        if entity_id:
            await self._async_physical_service_call(
                "switch",
                "turn_on" if value else "turn_off",
                {"entity_id": entity_id},
                target_value="on" if value else "off",
            )

    async def async_set_switch_if_needed(self, entity_id: str | None, value: bool) -> bool:
        """Write a switch only if its current state differs from the target."""
        state = self.hass.states.get(entity_id) if entity_id else None
        if state is not None and state.state == ("on" if value else "off"):
            self._performance.inc("inverter_write_skipped_same_value")
            return False
        await self.async_set_switch(entity_id, value)
        return True

    async def async_set_time(self, entity_id: str | None, value: str) -> None:
        if entity_id:
            domain = entity_id.split(".", 1)[0]
            if domain == "time":
                time_value = value if len(value) == 8 else f"{value}:00"
                await self._async_physical_service_call(
                    "time",
                    "set_value",
                    {"entity_id": entity_id, "time": time_value},
                    target_value=time_value,
                )
                return
            if domain == "select":
                state = self.hass.states.get(entity_id)
                options = None if state is None else (getattr(state, "attributes", {}) or {}).get("options")
                option = format_time_option(options, value)
                if isinstance(options, (list, tuple)) and option not in options:
                    supported = ", ".join(str(item) for item in options[:12])
                    if len(options) > 12:
                        supported += ", ..."
                    raise ValueError(
                        f"Time {value} is not supported by {entity_id}. Supported options: {supported}"
                    )
                await self._async_physical_service_call(
                    "select",
                    "select_option",
                    {"entity_id": entity_id, "option": option},
                    target_value=option,
                )
                return
            raise ValueError(f"Unsupported time entity domain: {entity_id}")

    async def async_set_boolean_control(self, entity_id: str | None, value: bool, role: str) -> None:
        if not entity_id:
            raise ValueError(f"Missing {role} entity")
        domain = entity_id.split(".", 1)[0]
        if domain == "switch":
            await self.async_set_switch(entity_id, value)
            return
        if domain == "select":
            option = provider_boolean_option(self.data, role, value)
            state = self.hass.states.get(entity_id)
            options = None if state is None else (getattr(state, "attributes", {}) or {}).get("options")
            resolved_option = resolve_select_option(options, option)
            if resolved_option is None:
                raise ValueError(f"Unsupported option for {entity_id}: {option}")
            await self._async_physical_service_call(
                "select",
                "select_option",
                {"entity_id": entity_id, "option": resolved_option},
                target_value=resolved_option,
            )
            return
        raise ValueError(f"Unsupported {role} entity domain: {entity_id}")

    def _validate_number_entity(self, label: str, entity_id: str | None, value: float) -> None:
        """Validate a Number entity and its Home Assistant limits before write."""
        if not entity_id or not entity_id.startswith("number."):
            raise ValueError(f"Missing required Deye number entity: {label}")
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            raise ValueError(f"Unavailable Deye number entity: {label}")
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError(f"Invalid numeric value for {label}")
        attrs = getattr(state, "attributes", {}) or {}
        minimum = self.safe_float(attrs.get("min"), float("-inf"))
        maximum = self.safe_float(attrs.get("max"), float("inf"))
        step = self.safe_float(attrs.get("step"), 0)
        if numeric < minimum or numeric > maximum:
            raise ValueError(f"{label} must be between {minimum:g} and {maximum:g}")
        if step > 0 and math.isfinite(minimum):
            steps = (numeric - minimum) / step
            if not math.isclose(steps, round(steps), abs_tol=1e-6):
                raise ValueError(f"{label} must follow step {step:g}")

    def _validate_select_entity(self, label: str, entity_id: str | None, option: str) -> None:
        if not entity_id or not entity_id.startswith("select."):
            raise ValueError(f"Missing required Deye select entity: {label}")
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            raise ValueError(f"Unavailable Deye select entity: {label}")
        options = (getattr(state, "attributes", {}) or {}).get("options")
        if isinstance(options, (list, tuple)) and option not in options:
            raise ValueError(f"Unsupported option for {label}: {option}")

    def _validate_switch_entity(self, label: str, entity_id: str | None) -> None:
        if not entity_id or not entity_id.startswith("switch."):
            raise ValueError(f"Missing required Deye switch entity: {label}")
        state = self.hass.states.get(entity_id)
        if state is None or state.state not in ("on", "off"):
            raise ValueError(f"Unavailable Deye switch entity: {label}")

    def _validate_time_entity(self, label: str, entity_id: str | None, value: str) -> None:
        allowed = provider_profile(self.data).tou_start_domains
        if not entity_id or entity_id.split(".", 1)[0] not in allowed:
            raise ValueError(f"Missing required Deye time entity: {label}")
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            raise ValueError(f"Unavailable Deye time entity: {label}")
        try:
            hour, minute = (int(part) for part in value.split(":")[:2])
        except (TypeError, ValueError):
            raise ValueError(f"Invalid time for {label}: {value}") from None
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError(f"Invalid time for {label}: {value}")
        if entity_id.startswith("select."):
            options = (getattr(state, "attributes", {}) or {}).get("options")
            option = format_time_option(options, value)
            if isinstance(options, (list, tuple)) and option not in options:
                raise ValueError(f"Unsupported time option for {label}: {value}")

    def _validate_boolean_control_entity(
        self, label: str, entity_id: str | None, value: bool, role: str
    ) -> None:
        item = provider_profile(self.data)
        if role == "grid":
            allowed = item.tou_grid_domains
        elif role == "sell":
            allowed = ("switch", "select", "input_boolean")
        else:
            allowed = ("switch", "select")
        if not entity_id or entity_id.split(".", 1)[0] not in allowed:
            raise ValueError(f"Missing required Deye {role} entity: {label}")
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            raise ValueError(f"Unavailable Deye {role} entity: {label}")
        if entity_id.split(".", 1)[0] in ("switch", "input_boolean"):
            if str(state.state).lower() not in ("on", "off"):
                raise ValueError(f"Unavailable Deye switch entity: {label}")
            return
        option = provider_boolean_option(self.data, role, value)
        options = (getattr(state, "attributes", {}) or {}).get("options")
        if isinstance(options, (list, tuple)) and resolve_select_option(options, option) is None:
            raise ValueError(f"Unsupported option for {label}: {option}")

    def _validate_control_plan(
        self,
        mode: str,
        sell_power: float,
    ) -> None:
        """Reject an invalid control plan before the first write to Deye."""
        profile = provider_profile(self.data)
        if not profile.basic_control:
            raise ValueError(f"Provider {profile.label} does not support inverter control")
        if mode not in WORK_MODES:
            raise ValueError(f"Unsupported Deye work mode: {mode}")
        values = {
            "Max Sell Power": (sell_power, 0.0, float(self.effective_inverter_max_power_w)),
        }
        for label, (raw_value, minimum, maximum) in values.items():
            value = float(raw_value)
            if not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError(f"{label} must be between {minimum:g} and {maximum:g}")
        self._validate_select_entity(
            "System Work Mode",
            self.work_mode_select,
            logical_mode_option(self.data, mode, self._active_physical_work_mode()),
        )
        if profile.needs_aux_export_switch:
            self._validate_switch_entity("Solar Export", self.work_mode_aux_entity)
        # Logical 0 W is always allowed; physical entity range is checked only
        # for positive values that may be written to the inverter.
        if sell_power > 0:
            self._validate_number_entity("Max Sell Power", self.max_sell_power_number, sell_power)

    async def async_verify_control_values(
        self,
        mode: str | None,
        sell_power: float | None,
        physical_work_mode: str | None = None,
    ) -> list[str]:
        """Read the current control state once, without writing it again.

        Some Deye integrations publish the requested values several seconds
        after the service call.  Re-sending a mode during that interval can
        undo a perfectly valid in-flight change, therefore delayed polling is
        handled by the pending transaction instead of this verifier.

        ``sell_power`` may be None when the sell-power number was intentionally
        not written because the active mode does not require selling or the
        physical entity does not accept 0 W.
        """
        self._performance.inc("inverter_readback")
        expected_numbers: dict[str | None, tuple[str, float]] = {}
        if sell_power is not None and self.max_sell_power_number:
            expected_numbers[self.max_sell_power_number] = ("Max Sell Power", float(sell_power))
        unconfirmed: list[str] = []
        if mode is not None:
            mode_state = self.hass.states.get(self.work_mode_select)
            if mode_state is None or not logical_mode_matches(self.data, mode, str(mode_state.state), physical_work_mode):
                actual_mode = "missing" if mode_state is None else str(mode_state.state)
                expected_mode = logical_mode_option(self.data, mode, physical_work_mode)
                unconfirmed.append(f"System Work Mode={actual_mode} (expected {expected_mode})")
            profile = provider_profile(self.data)
            if profile.needs_aux_export_switch:
                aux_state = self.hass.states.get(self.work_mode_aux_entity)
                expected_aux = "on" if mode == MODE_SELLING_FIRST else "off"
                if aux_state is None or aux_state.state != expected_aux:
                    actual_aux = "missing" if aux_state is None else str(aux_state.state)
                    unconfirmed.append(f"Solar Export={actual_aux} (expected {expected_aux})")
        for entity_id, (label, expected) in expected_numbers.items():
            state = self.hass.states.get(entity_id)
            actual = None if state is None else self.safe_float(state.state, float("nan"))
            if actual is None or not math.isfinite(actual) or not math.isclose(actual, expected, abs_tol=0.1):
                actual_label = "missing" if actual is None or not math.isfinite(actual) else f"{actual:g}"
                unconfirmed.append(f"{label}={actual_label} (expected {expected:g})")
        return unconfirmed

    def _pending_control_key(self) -> str:
        """Identify the user-visible target that owns an in-flight write."""
        return (
            f"{self.control_mode}:{self.active_slot_key()}"
            if self.control_mode == "Schedule"
            else self.control_mode
        )

    def _clear_pending_control_transaction(self) -> None:
        self._pending_control_transaction = {}
        if self.unsub_confirmation_timer:
            self.unsub_confirmation_timer()
            self.unsub_confirmation_timer = None
        if self.unsub_confirmation_listener:
            self.unsub_confirmation_listener()
            self.unsub_confirmation_listener = None
        if self.unsub_confirmation_poll:
            self.unsub_confirmation_poll()
            self.unsub_confirmation_poll = None

    def _control_confirmation_entities(self) -> list[str]:
        """Return every Deye entity whose state confirms a control write."""
        return [
            entity_id
            for entity_id in (
                self.work_mode_select,
                self.work_mode_aux_entity,
                self.max_sell_power_number,
            )
            if entity_id
        ]

    def _inverter_link_issue(self) -> str:
        """Return why the inverter link is down, or '' when it looks healthy.

        Only the entities that confirm physical writes are checked: a dropped
        connection makes all of them unavailable at once, so this is sufficient
        and immune to optional sensor mappings. A numerically valid value that
        has not been reported for a long time is also treated as unavailable so
        rules never act on readings left behind by the disconnect.
        """
        entity_ids = self._control_confirmation_entities()
        if not entity_ids:
            return ""
        now = ha_now()
        unavailable: list[str] = []
        stale: list[str] = []
        for entity_id in entity_ids:
            state = self.hass.states.get(entity_id)
            if state is None or str(state.state).strip().lower() in {
                "", "unknown", "unavailable", "none"
            }:
                unavailable.append(entity_id)
                continue
            if entity_id.startswith("sensor."):
                reported = getattr(state, "last_reported", None)
                if not isinstance(reported, datetime):
                    reported = getattr(state, "last_updated", None)
                if isinstance(reported, datetime):
                    try:
                        age = (now - reported).total_seconds()
                    except TypeError:
                        age = 0.0
                    if age > _INVERTER_LINK_STALE_SECONDS:
                        stale.append(entity_id)
        if unavailable:
            return "entities unavailable: " + ", ".join(unavailable)
        if stale:
            return "entities stale: " + ", ".join(stale)
        return ""

    def _update_inverter_link_gate(self) -> bool:
        """Apply hysteresis and return True while inverter rules must be skipped."""
        issue = self._inverter_link_issue()
        if issue:
            self._inverter_link_reason = issue
            self._inverter_link_unavailable_ticks += 1
            self._inverter_link_available_ticks = 0
        else:
            self._inverter_link_available_ticks += 1
            self._inverter_link_unavailable_ticks = 0

        if self._inverter_link_gated:
            if self._inverter_link_available_ticks >= _INVERTER_LINK_AVAILABLE_TICKS:
                self._inverter_link_gated = False
                self._inverter_link_reason = ""
                self._inverter_link_available_ticks = 0
                _LOGGER.info("Deye inverter link recovered; control rules resumed")
        elif self._inverter_link_unavailable_ticks >= _INVERTER_LINK_UNAVAILABLE_TICKS:
            self._inverter_link_gated = True
            _LOGGER.warning(
                "Deye inverter link is unavailable (%s); control rules paused",
                issue,
            )

        if self._inverter_link_gated:
            self.runtime_metrics["skipped_inverter_unavailable"] += 1
            self.runtime_metrics["inverter_unavailable_reason"] = self._inverter_link_reason
        return self._inverter_link_gated

    def _start_schedule_input_listener(self) -> None:
        """Keep sensor snapshots fresh when material live inputs change."""
        if self.unsub_input_listener:
            return
        if self._soc_quality_signature is None:
            self._soc_quality_signature = self._soc_semantic_signature(
                self.soc_diagnostics()
            )
        reason_groups = (
            ("soc", (self.battery_soc_sensor,)),
            ("price_today", (self.price_sensor, self.buy_price_today_sensor)),
            ("price_tomorrow", (self.sell_price_tomorrow_sensor, self.buy_price_tomorrow_sensor)),
            (
                "solcast",
                (
                    self.solcast_forecast_today_sensor,
                    self.solcast_remaining_today_sensor,
                    self.solcast_forecast_tomorrow_sensor,
                ),
            ),
            ("pv", (self.pv_power_sensor,)),
            ("load", (self.load_power_sensor,)),
            ("grid", (self.grid_power_sensor,)),
            ("battery_power", (self.battery_power_sensor,)),
            (
                "soc_health",
                (self.battery_bms_voltage_sensor, self.battery_current_sensor),
            ),
            ("weather", (self.weather_entity,)),
        )
        reason_by_entity: dict[str, str] = {}
        for reason, entity_ids in reason_groups:
            for entity_id in entity_ids:
                if entity_id and not self._is_own_output_entity_id(entity_id):
                    reason_by_entity.setdefault(entity_id, reason)
        entities = list(reason_by_entity)
        if not entities:
            return

        @callback
        def _on_input_change(event: Any) -> None:
            event_data = getattr(event, "data", event if isinstance(event, dict) else {})
            entity_id = str(event_data.get("entity_id") or "")
            if self._is_own_output_entity_id(entity_id):
                self.runtime_metrics["self_entity_event_ignored"] += 1
                return
            reason = reason_by_entity.get(entity_id)
            if reason is None:
                return
            self.runtime_metrics["external_input_event_count"] += 1
            soc_semantics_changed = False
            if reason == "soc":
                soc_semantics_changed = self._observe_soc_source_event(event)
                if "new_state" in event_data and not soc_semantics_changed:
                    self._performance.inc("soc_report_timestamp_only")
                    return
            elif reason in {"pv", "load", "grid", "battery_power", "soc_health"}:
                soc_semantics_changed = self._observe_soc_sibling_event(event)
                if soc_semantics_changed:
                    self._notify_entities_from_cache(
                        {"battery_soc"}, reason="soc_quality_transition"
                    )
                    reason = "soc"
                elif reason == "soc_health" or self._state_event_is_report_only(event_data):
                    self._performance.inc("soc_health_timestamp_only")
                    return
            self.request_sensor_snapshot_refresh({"ai_state", "diagnostics"})

        self.unsub_input_listener = async_track_state_change_event(
            self.hass, entities, _on_input_change
        )

    @staticmethod
    def _is_own_output_entity_id(entity_id: str | None) -> bool:
        """Reject every Deye Manager output even if selected as a Core source."""
        if not entity_id or "." not in entity_id:
            return False
        return entity_id.split(".", 1)[1].startswith("deye_energy_")

    def _schedule_pending_control_poll(self, delay: float | None = None) -> None:
        """Read pending writes quickly without ever sending them again."""
        if not self._pending_control_transaction or self.unsub_confirmation_poll:
            return
        if delay is None:
            # State changes are the preferred confirmation mechanism.  These
            # short read-only checks are a fallback for late Deye updates.
            poll_index = int(self._pending_control_transaction.get("poll_index", 0))
            delay = (0.5, 1.0, 2.0)[min(poll_index, 2)]
            self._pending_control_transaction["poll_index"] = poll_index + 1

        @callback
        def _on_poll(_now: datetime) -> None:
            self.unsub_confirmation_poll = None
            self.hass.async_create_task(self._async_recheck_pending_control())

        self.unsub_confirmation_poll = async_track_point_in_time(
            self.hass,
            _on_poll,
            ha_now() + timedelta(seconds=delay),
        )

    def _start_pending_control_watchers(self) -> None:
        """Confirm from Deye state events first, with a read-only poll fallback."""
        if not self.unsub_confirmation_listener:
            entities = self._control_confirmation_entities()

            @callback
            def _on_state_change(_event: Any) -> None:
                if self._pending_control_transaction:
                    self.hass.async_create_task(self._async_recheck_pending_control())

            self.unsub_confirmation_listener = async_track_state_change_event(
                self.hass, entities, _on_state_change
            )
        self._schedule_pending_control_poll()

    def _schedule_pending_control_timeout(self) -> None:
        """Finish delayed confirmation at the promised deadline, not next tick."""
        if self.unsub_confirmation_timer:
            self.unsub_confirmation_timer()
            self.unsub_confirmation_timer = None

        @callback
        def _on_timeout(_now: datetime) -> None:
            self.unsub_confirmation_timer = None
            self.hass.async_create_task(self._async_finish_pending_control_confirmation())

        self.unsub_confirmation_timer = async_track_point_in_time(
            self.hass,
            _on_timeout,
            ha_now() + timedelta(seconds=self.control_confirmation_timeout),
        )

    async def _async_finish_pending_control_confirmation(self) -> None:
        """Perform one final serialized read when the confirmation window ends."""
        await self._async_recheck_pending_control()

    async def _async_recheck_pending_control(self) -> None:
        """Recheck a pending write under the transaction lock without re-writing."""
        async with self._operation_lock:
            pending = self._pending_control_transaction
            if not pending:
                return
            await self._async_confirm_or_wait_for_control(
                dict(pending.get("expected") or {}),
                str(pending.get("stage") or "inverter confirmation"),
            )
            if self._pending_control_transaction:
                self._schedule_pending_control_poll()

    async def _async_confirm_or_wait_for_control(
        self, expected: dict[str, Any], stage: str, *, started: bool = False, success_message: str = ""
    ) -> bool | None:
        """Confirm an in-flight write, or leave it pending without re-writing."""
        if not self._control_is_active():
            self._clear_pending_control_transaction()
            self.executed_manager_action = "Not performed — control disabled"
            return False
        if started:
            self._performance.inc("inverter_confirmation_started")
        key = self._pending_control_key()
        pending = self._pending_control_transaction
        if not started:
            if not pending:
                return None
            if pending.get("key") != key or pending.get("expected") != expected:
                self._clear_pending_control_transaction()
                return None
        unconfirmed = await self.async_verify_control_values(
            expected.get("System Work Mode"),
            None if expected.get("Max Sell Power") is None else float(expected.get("Max Sell Power", 0)),
            self._active_physical_work_mode(),
        )
        if not unconfirmed:
            self._performance.inc("inverter_confirmation_completed")
            self._clear_pending_control_transaction()
            self.record_schedule_attempt("applied", "confirmation", expected, "Complete slot settings confirmed")
            self._clear_slot_failure_latch()
            self.last_action = f"Applied {self.control_mode}"
            if success_message:
                self.last_action = f"{self.last_action}. {success_message}"
            self.last_error = ""
            self.mark_settings_applied()
            self._notify_update_for("confirmation")
            return True

        now = ha_now().timestamp()
        if started:
            self._pending_control_transaction = {
                "key": key,
                "slot": self.active_slot_key(),
                "expected": dict(expected),
                "stage": stage,
                "started_at": now,
                "poll_index": 0,
            }
            pending = self._pending_control_transaction
            self._schedule_pending_control_timeout()
            self._start_pending_control_watchers()
        elapsed = max(0.0, now - float(pending.get("started_at", now)))
        remaining = max(0, math.ceil(self.control_confirmation_timeout - elapsed))
        if elapsed < self.control_confirmation_timeout:
            message = f"Waiting for inverter confirmation ({remaining} s): {'; '.join(unconfirmed)}"
            self.record_schedule_attempt("pending", "inverter confirmation", expected, message)
            self.last_action = "Waiting for the inverter to confirm the settings"
            self.last_error = ""
            self._notify_update_for("confirmation")
            return True

        self._clear_pending_control_transaction()
        self._performance.inc("inverter_confirmation_timeout")
        reason = f"Unconfirmed settings after {int(self.control_confirmation_timeout)} s: {'; '.join(unconfirmed)}"
        return await self._async_handle_slot_failure(reason, "inverter confirmation", expected)

    async def async_apply_safe_defaults(self, reason: str) -> bool:
        async with self._control_operation("safe_defaults") as transaction_id:
            return await self._async_apply_safe_defaults_impl(reason, transaction_id)

    async def _async_apply_safe_defaults_impl(
        self, reason: str, transaction_id: str | None = None
    ) -> bool:
        """Apply user defaults as the single fail-safe path without forced zeroes."""
        mode = self.default_work_mode
        mode_input = (
            self.default_normal_physical_work_mode()
            if mode == MODE_NORMAL_OPERATION
            else mode
        )
        capped_sell_power = min(self.default_sell_power, self.effective_inverter_max_power_w)
        cap_message = ""
        if capped_sell_power < self.default_sell_power:
            cap_message = f"Default sell power capped from {self.default_sell_power} W do {capped_sell_power} W"
            _LOGGER.warning("%s (effective limit %s W)", cap_message, self.effective_inverter_max_power_w)
        failures: list[str] = []
        try:
            self._validate_control_plan(
                mode,
                capped_sell_power,
            )
        except Exception as err:
            failures.append(str(err))

        operations = (
            ("Max Sell Power", self.async_set_number, (self.max_sell_power_number, capped_sell_power)),
            ("System Work Mode", self.async_set_work_mode, (mode_input,)),
        )
        if not failures:
            for label, writer, args in operations:
                try:
                    await writer(*args)
                except ControlDisabledError:
                    raise
                except Exception as err:
                    failures.append(f"{label}: {err}")

        if not failures:
            failures.extend(
                await self.async_verify_control_values(
                    mode,
                    capped_sell_power,
                    self.default_normal_physical_work_mode(),
                )
            )

        if failures:
            if not self._control_result_is_current(transaction_id):
                raise ControlDisabledError(self._control_block_message())
            try:
                await self.async_set_work_mode(mode_input)
            except ControlDisabledError:
                raise
            except Exception as err:
                failures.append(f"System Work Mode: {err}")
            self.last_action = "Could not fully apply the default settings — check the inverter."
            self.last_error = (
                f"CRITICAL partial write error ({reason}). "
                f"Unconfirmed values: {'; '.join(failures)}"
            )
            self.notify_update()
            return False

        if not self._control_result_is_current(transaction_id):
            raise ControlDisabledError(self._control_block_message())
        self.last_action = f"{reason}. Default settings applied."
        if cap_message:
            self.last_action = f"{self.last_action} {cap_message}"
        self.last_error = self.last_action
        self.notify_update()
        return True

    def _tou_entity(self, idx: int, kind: str) -> str:
        configured = self.data.get(conf_tou_entity(idx, kind))
        return str(configured or "")

    @staticmethod
    def _minutes_to_clock(minutes: int) -> str:
        """Format minutes after midnight as HH:MM (24:00 wraps to 00:00)."""
        value = int(minutes) % MINUTES_PER_DAY
        return f"{value // 60:02d}:{value % 60:02d}"

    @staticmethod
    def _time_to_minutes(value: Any) -> int | None:
        """Return minutes after midnight for an HA time state."""
        text = str(value or "").strip()
        try:
            hour, minute = (int(part) for part in text.split(":", 2)[:2])
        except (TypeError, ValueError):
            return None
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            return None
        return hour * 60 + minute

    @classmethod
    def _tou_boundary(cls, value: Any, label: str) -> str:
        """Validate and normalize a TOU boundary to a whole-minute clock time."""
        text = str(value or "").strip()
        minutes = cls._time_to_minutes(text)
        if minutes is None:
            raise ValueError(f"{label} must use the HH:MM format")
        return f"{minutes // 60:02d}:{minutes % 60:02d}"

    def _validated_tou_start_vector(
        self,
        slot: int,
        *,
        start: str | None = None,
        end: str | None = None,
    ) -> list[str]:
        """Return a valid proposed six-start vector before a boundary write."""
        starts: list[str] = []
        for idx in range(1, 7):
            entity_id = self._tou_entity(idx, "start")
            raw = self.state_text(entity_id)
            try:
                starts.append(self._tou_boundary(raw, f"From slot {idx}"))
            except ValueError as err:
                raise ValueError(
                    f"Cannot verify the complete Deye TOU 6/6 layout: {err}"
                ) from None

        next_slot = 1 if slot == 6 else slot + 1
        normalized_start = (
            self._tou_boundary(start, "Start") if start is not None else None
        )
        normalized_end = (
            self._tou_boundary(end, "End") if end is not None else None
        )
        if normalized_start is not None:
            starts[slot - 1] = normalized_start
        if normalized_end is not None:
            starts[next_slot - 1] = normalized_end
        if normalized_start is not None and normalized_end is not None and normalized_start == normalized_end:
            raise ValueError("The Start and End fields cannot point to the same hour")

        minutes = [self._time_to_minutes(value) for value in starts]
        if any(value is None for value in minutes):
            raise ValueError("Invalid Deye Time Of Use start layout")
        numeric = [int(value) for value in minutes]
        if len(set(numeric)) != 6:
            raise ValueError("Each of the six Deye Time Of Use starts must be unique")
        if any(numeric[idx] >= numeric[idx + 1] for idx in range(5)):
            raise ValueError(
                "Deye Time Of Use starts must follow strict slot order 1–6; "
                "crossing midnight is allowed only between slot 6 and 1"
            )

        wraps = sum(
            1
            for idx in range(6)
            if numeric[(idx + 1) % 6] <= numeric[idx]
        )
        if wraps != 1 or numeric[0] >= numeric[-1]:
            raise ValueError(
                "The Deye Time Of Use layout must contain exactly one midnight "
                "crossing between slot 6 and 1"
            )

        coverage = [0] * MINUTES_PER_DAY
        for idx, start_minute in enumerate(numeric):
            end_minute = numeric[(idx + 1) % 6]
            if idx == 5:
                end_minute += MINUTES_PER_DAY
            if end_minute <= start_minute:
                raise ValueError("A Deye Time Of Use range cannot have zero length")
            for minute in range(start_minute, end_minute):
                coverage[minute % MINUTES_PER_DAY] += 1
        if any(count != 1 for count in coverage):
            raise ValueError(
                "Deye Time Of Use ranges must cover the full day without overlap"
            )
        return starts

    def physical_tou_soc_for_slot(self, slot_key: str) -> float | None:
        """Read the physical Deye TOU SOC covering an hourly schedule slot.

        This is used only to seed a missing new helper.  An existing restored
        slot value, including an intentional zero, always has priority.
        """
        slot_row = next((row for row in SLOTS if row[0] == slot_key), None)
        if slot_row is None:
            return None
        target = int(slot_row[2])
        starts = [
            self._time_to_minutes(self.state_text(self._tou_entity(idx, "start")))
            for idx in range(1, 7)
        ]
        if any(value is None for value in starts):
            return None
        for offset, start in enumerate(starts):
            end = starts[(offset + 1) % 6]
            if start == end:
                continue
            contains = start <= target < end if start < end else target >= start or target < end
            if not contains:
                continue
            value = self.safe_float(
                self.state_text(self._tou_entity(offset + 1, "soc")),
                float("nan"),
            )
            return value if math.isfinite(value) and 0 <= value <= 100 else None
        return None

    def tou_mapping_errors(self) -> list[str]:
        return [item["entity_id"] for item in self.tou_mapping_diagnostics()["entities"] if not item["ok"]]

    @staticmethod
    def _physical_tou_soc_for_slot(slot: SlotSettings) -> float | None:
        """Return the physical Deye Time Of Use SOC for a schedule slot.

        The value is always the user-owned ``tou_soc``; ``minimum_sell_soc`` is
        a logical sale-guard and is never used as the physical SOC.
        """
        return None if slot.tou_soc is None else float(slot.tou_soc)

    def mark_slot_tou_soc_restored(self, slot_key: str) -> None:
        """Signal that the per-slot tou_soc number entity has been added."""
        self._restored_slot_tou_soc_keys.add(slot_key)

    def mark_slot_minimum_sell_soc_restored(self, slot_key: str) -> None:
        """Signal that the per-slot minimum_sell_soc number entity has been added."""
        self._restored_slot_minimum_sell_soc_keys.add(slot_key)

    def _selling_tou_soc_migration_ready(self) -> bool:
        """Return True only after all required per-slot entities are restored."""
        if not self.slots:
            return False
        return (
            len(self._restored_slot_mode_keys) == len(self.slots)
            and len(self._restored_slot_tou_soc_keys) == len(self.slots)
            and len(self._restored_slot_minimum_sell_soc_keys) == len(self.slots)
        )

    def _migrate_selling_tou_soc(self) -> None:
        """Idempotently resolve tou_soc for Selling First slots after restore.

        Order of sources for a Selling First slot with ``tou_soc is None``:
        1. Existing restored ``tou_soc`` (already present, nothing to do).
        2. Physical Deye TOU readback for that hour, when the provider exposes it.
        3. ``minimum_sell_soc`` as a backward-compatibility fallback when the
           provider does not expose a physical readback.
        4. Leave ``None`` and keep the migration incomplete until the next tick
           if a physical readback capability exists but the value is not yet
           readable (e.g. ``unknown`` / ``unavailable``).

        The migration is not driven by ``schedule_schema_version``; it relies on
        the presence of the restored per-slot entities and a valid physical readback.
        """
        if self._tou_soc_migration_done:
            return
        if not self._selling_tou_soc_migration_ready():
            return
        readback_supported = provider_profile(self.data).native_tou
        unresolved: list[str] = []
        for slot in self.slots.values():
            if not (slot.enabled and slot.mode == MODE_SELLING_FIRST):
                continue
            if slot.tou_soc is not None:
                continue
            physical_soc: float | None = None
            if readback_supported:
                try:
                    physical_soc = self.physical_tou_soc_for_slot(slot.key)
                except Exception:
                    physical_soc = None
            if physical_soc is not None:
                slot.tou_soc = float(physical_soc)
                continue
            if readback_supported:
                # Physical readback capability exists but the state is not yet
                # available; wait for the next tick instead of guessing.
                unresolved.append(slot.key)
                continue
            if math.isfinite(slot.minimum_sell_soc):
                slot.tou_soc = float(slot.minimum_sell_soc)
                continue
            unresolved.append(slot.key)
        if not unresolved:
            self._tou_soc_migration_done = True

    def _effective_physical_tou_soc_for_slot(self, slot: SlotSettings) -> float:
        """Return a finite physical TOU SOC for every schedule slot."""
        soc = self._physical_tou_soc_for_slot(slot)
        if soc is not None:
            return float(soc)
        fallback = self.normal_profile_tou_soc
        if fallback is not None and math.isfinite(fallback):
            return float(fallback)
        return 100.0

    def _tou_transaction_lock(self) -> asyncio.Lock:
        """Return the per-TOU-operation lock, creating it lazily."""
        if self._tou_transaction_lock_obj is None:
            self._tou_transaction_lock_obj = asyncio.Lock()
        return self._tou_transaction_lock_obj

    def _reserve_tou_write(self) -> object:
        """Reserve the single TOU writer synchronously, before any lock wait.

        An asyncio task cannot be pre-empted between the pending check and the
        assignment because this helper contains no await.  This makes two
        simultaneous service calls race-safe while retaining the Stage 5B lock
        as a second line of serialization inside the transaction executor.
        """
        if self.tou_write_pending:
            raise ValueError("Deye Time Of Use write in progress")
        owner = object()
        self._tou_pending_owner = owner
        self.tou_write_pending = True
        self.tou_operation_started_at = ha_now()
        self.tou_operation_status = "writing"
        self.tou_contract_status = "writing"
        self.tou_last_error = ""
        self._notify_update_for("tou_reserve")
        return owner

    def _release_tou_write(self, owner: object) -> None:
        """Release only the reservation owned by the finishing operation."""
        if self._tou_pending_owner is not owner:
            return
        self._tou_pending_owner = None
        self.tou_write_pending = False
        self._notify_update_for("tou_release")

    def _tou_confirmation_event(self) -> asyncio.Event:
        """Return the event used to wake the TOU confirmation loop."""
        if self._tou_confirmation_event_obj is None:
            self._tou_confirmation_event_obj = asyncio.Event()
        return self._tou_confirmation_event_obj

    def _tou_field_matches(self, entity_id: str | None, field: str, expected_logical: Any) -> bool:
        """Compare current HA state with the logical expected value using provider normalization."""
        if not entity_id:
            return False
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable", "none", ""):
            return False
        actual = str(state.state)
        if field in ("start", "end"):
            return self._time_to_minutes(actual) == self._time_to_minutes(expected_logical)
        if field == "soc":
            numeric = self.safe_float(actual, float("nan"))
            return math.isfinite(numeric) and math.isclose(numeric, float(expected_logical), abs_tol=0.1)
        if field == "grid":
            return state_matches_boolean(self.data, "grid", bool(expected_logical), actual)
        if field in ("mode", "charge"):
            options = (getattr(state, "attributes", {}) or {}).get("options")
            expected = str(expected_logical).strip()
            if isinstance(options, (list, tuple)):
                resolved = resolve_select_option(options, expected)
                if resolved is not None:
                    return resolve_select_option(options, actual) == resolved or select_option_matches(actual, resolved)
            return " ".join(actual.strip().casefold().split()) == " ".join(expected.casefold().split())
        if field == "sell":
            return state_matches_boolean(self.data, "sell", bool(expected_logical), actual)
        if field in ("power", "voltage"):
            numeric = self.safe_float(actual, float("nan"))
            return math.isfinite(numeric) and math.isclose(numeric, float(expected_logical), abs_tol=0.1)
        return actual == str(expected_logical)

    def _tou_provider_value(self, entity_id: str | None, field: str, logical_value: Any) -> Any:
        """Return the exact provider value that must be written to an entity."""
        if not entity_id:
            return None
        if field in ("start", "end"):
            state = self.hass.states.get(entity_id)
            options = (getattr(state, "attributes", {}) or {}).get("options") if state else None
            option = format_time_option(options, str(logical_value))
            if isinstance(options, (list, tuple)) and option not in options:
                supported = ", ".join(str(item) for item in options[:12])
                if len(options) > 12:
                    supported += ", ..."
                raise ValueError(
                    f"Time {logical_value} is not supported by {entity_id}. Supported options: {supported}"
                )
            return option
        if field in ("soc", "power", "voltage"):
            return float(logical_value)
        if field == "grid":
            option = provider_boolean_option(self.data, "grid", bool(logical_value))
            if entity_id.split(".", 1)[0] == "select":
                state = self.hass.states.get(entity_id)
                options = (getattr(state, "attributes", {}) or {}).get("options") if state else None
                resolved = resolve_select_option(options, option)
                if resolved is not None:
                    return resolved
            return option
        if field in ("mode", "charge"):
            option = str(logical_value).strip()
            state = self.hass.states.get(entity_id)
            options = (getattr(state, "attributes", {}) or {}).get("options") if state else None
            if isinstance(options, (list, tuple)):
                resolved = resolve_select_option(options, option)
                if resolved is None:
                    supported = ", ".join(str(item) for item in options[:12])
                    if len(options) > 12:
                        supported += ", ..."
                    raise ValueError(
                        f"Option {option} is not supported by {entity_id}. Supported options: {supported}"
                    )
                return resolved
            return option
        if field == "sell":
            option = provider_boolean_option(self.data, "sell", bool(logical_value))
            if entity_id.split(".", 1)[0] == "select":
                state = self.hass.states.get(entity_id)
                options = (getattr(state, "attributes", {}) or {}).get("options") if state else None
                resolved = resolve_select_option(options, option)
                if resolved is not None:
                    return resolved
            return option
        return logical_value

    def _make_tou_transaction_item(
        self,
        entity_id: str,
        field: str,
        slot_index: int,
        logical_value: Any,
        snapshot: dict[str, str],
    ) -> dict[str, Any]:
        """Build one entry of the TOU write transaction plan."""
        state = self.hass.states.get(entity_id)
        current_raw = str(state.state) if state is not None else ""
        snapshot[entity_id] = current_raw
        provider_value = self._tou_provider_value(entity_id, field, logical_value)
        changed = not self._tou_field_matches(entity_id, field, logical_value)
        capability_field = "grid_charge" if field == "grid" else field
        capability = self._tou_field_capability(
            slot_index, capability_field, entity_id
        )
        actual = self._tou_field_actual_value(entity_id, capability_field)
        if field in ("start", "end"):
            previous_logical = current_raw
        elif field in ("soc", "power", "voltage"):
            previous_logical = self.safe_float(current_raw, None)
        elif field == "grid":
            previous_logical = state_matches_boolean(self.data, "grid", True, current_raw)
        elif field == "sell":
            previous_logical = state_matches_boolean(self.data, "sell", True, current_raw)
        elif field in ("mode", "charge"):
            previous_logical = str(current_raw).strip()
        else:
            previous_logical = current_raw
        return {
            "entity_id": entity_id,
            "field": field,
            "slot_index": slot_index,
            "current_raw_value": current_raw,
            "previous_logical_value": previous_logical,
            "actual": actual,
            "expected": logical_value,
            "expected_logical_value": logical_value,
            "expected_provider_value": provider_value,
            "changed": changed,
            "written": False,
            "confirmed": not changed,
            "status": "waiting" if changed else "unchanged",
            "writable": capability["writable"],
            "capability": capability,
        }

    def _build_tou_transaction_plan(
        self,
        mapping: TouMapping,
        *,
        end_overrides: dict[int, str] | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, str]]:
        """Create the complete diff plan for a 6-slot physical TOU write.

        Unused physical ranges keep their current start/SOC; only their Grid
        Charge source is forced to disabled.
        """
        snapshot: dict[str, str] = {}
        items: list[dict[str, Any]] = []
        for idx in range(1, 7):
            item = mapping.slots[idx - 1] if idx <= len(mapping.slots) else None
            start_entity = self._tou_entity(idx, "start")
            soc_entity = self._tou_entity(idx, "soc")
            grid_entity = self._tou_entity(idx, "grid")
            end_override = (end_overrides or {}).get(idx)
            if item is None:
                start_state = self.hass.states.get(start_entity)
                soc_state = self.hass.states.get(soc_entity)
                start_logical = str(start_state.state) if start_state is not None else None
                soc_logical = self.safe_float(soc_state.state if soc_state is not None else "", None)
                grid_logical = False
            else:
                start_logical = self._minutes_to_clock(int(item.start))
                soc_logical = float(item.soc)
                grid_logical = bool(item.grid_charge)
            if start_entity:
                items.append(
                    self._make_tou_transaction_item(
                        start_entity, "start", idx, start_logical, snapshot
                    )
                )
            if end_override and start_entity:
                items.append(
                    self._make_tou_transaction_item(
                        start_entity, "end", idx, end_override, snapshot
                    )
                )
            if soc_entity and soc_logical is not None:
                items.append(
                    self._make_tou_transaction_item(
                        soc_entity, "soc", idx, soc_logical, snapshot
                    )
                )
            if grid_entity:
                items.append(
                    self._make_tou_transaction_item(
                        grid_entity, "grid", idx, grid_logical, snapshot
                    )
                )
        return items, snapshot

    def _start_tou_confirmation_listener(self, entity_ids: list[str]) -> None:
        """Start a temporary state-changed listener that only wakes the wait loop."""
        self._stop_tou_confirmation_listener()
        if not entity_ids:
            return
        event = self._tou_confirmation_event()

        @callback
        def _on_state_change(_event: Any) -> None:
            event.set()

        self._tou_confirmation_unsub = async_track_state_change_event(
            self.hass, entity_ids, _on_state_change
        )

    def _stop_tou_confirmation_listener(self) -> None:
        """Detach the temporary TOU confirmation listener."""
        if self._tou_confirmation_unsub is not None:
            self._tou_confirmation_unsub()
            self._tou_confirmation_unsub = None

    async def _async_wait_for_tou_confirmation(
        self,
        items: list[dict[str, Any]],
        operation_name: str,
        expected_value_key: str = "expected_logical_value",
        *,
        allow_control_cancel: bool = True,
    ) -> list[dict[str, Any]]:
        """Wait until every written entity reports the expected value.

        Uses one common deadline of ``control_confirmation_timeout``.  A
        temporary state-changed listener wakes the polling loop, but the event
        itself does not count as confirmation.
        """
        written = [item for item in items if item.get("written")]
        if not written:
            return []
        self._performance.inc("inverter_confirmation_started")
        written_ids = [item["entity_id"] for item in written]
        self._start_tou_confirmation_listener(written_ids)
        event = self._tou_confirmation_event()
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.control_confirmation_timeout
        try:
            while True:
                self._performance.inc("inverter_readback")
                if (
                    allow_control_cancel
                    and self._active_tou_cancel_event is not None
                    and self._active_tou_cancel_event.is_set()
                ):
                    raise ControlDisabledError(
                        "TOU write interrupted by disabling Deye control"
                    )
                unconfirmed = [
                    item
                    for item in written
                    if not self._tou_field_matches(
                        item["entity_id"], item["field"], item[expected_value_key]
                    )
                ]
                for item in written:
                    capability_field = (
                        "grid_charge" if item["field"] == "grid" else item["field"]
                    )
                    item["actual"] = self._tou_field_actual_value(
                        item["entity_id"], capability_field
                    )
                if not unconfirmed:
                    self._performance.inc("inverter_confirmation_completed")
                    for item in written:
                        item["confirmed"] = True
                        item["status"] = "confirmed"
                    return []
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=min(remaining, 0.5))
                except asyncio.TimeoutError:
                    pass
            for item in unconfirmed:
                capability_field = (
                    "grid_charge" if item["field"] == "grid" else item["field"]
                )
                item["actual"] = self._tou_field_actual_value(
                    item["entity_id"], capability_field
                )
                item["status"] = (
                    "unavailable" if item["actual"] is None else "mismatch"
                )
            self._performance.inc("inverter_confirmation_timeout")
            return unconfirmed
        finally:
            self._stop_tou_confirmation_listener()

    async def _async_rollback_tou_transaction(
        self, items: list[dict[str, Any]], snapshot: dict[str, str]
    ) -> tuple[bool, list[str]]:
        """Restore only entities that were actually written.

        Returns success flag and a list of remaining unconfirmed entities.
        """
        written = [item for item in items if item.get("written")]
        if written:
            self._performance.inc("inverter_rollback")
        errors: list[str] = []
        for item in written:
            entity_id = item["entity_id"]
            raw_value = snapshot.get(entity_id)
            if raw_value is None:
                continue
            try:
                await self._async_restore_raw_entity(entity_id, raw_value)
                item["legacy_status"] = "rollback_written"
            except Exception as err:
                item["legacy_status"] = f"rollback_error: {err}"
                item["status"] = "unavailable"
                errors.append(f"{entity_id}: {err}")
        if errors:
            return False, errors
        unconfirmed = await self._async_wait_for_tou_confirmation(
            items,
            "rollback",
            expected_value_key="previous_logical_value",
            allow_control_cancel=False,
        )
        for item in unconfirmed:
            item["legacy_status"] = "rollback_unconfirmed"
            item["status"] = (
                "unavailable" if item.get("actual") is None else "mismatch"
            )
        for item in written:
            capability_field = "grid_charge" if item["field"] == "grid" else item["field"]
            item["actual"] = self._tou_field_actual_value(item["entity_id"], capability_field)
            if item not in unconfirmed:
                item["legacy_status"] = "rollback_confirmed"
                item["status"] = "rolled_back"
                item["confirmed"] = True
        return not unconfirmed, [item["entity_id"] for item in unconfirmed]

    async def _async_execute_tou_transaction(
        self,
        operation_name: str,
        items: list[dict[str, Any]],
        snapshot: dict[str, str],
        *,
        finalize_contract: bool = True,
    ) -> tuple[bool, list[dict[str, Any]], str]:
        """Write only changed TOU entities, confirm, and rollback on failure.

        Returns ``(success, items, message)``.  The public operation owns and
        clears the synchronous pending reservation.
        """
        if not items:
            self.tou_operation_status = "success" if finalize_contract else "confirming"
            self.tou_contract_status = "confirmed" if finalize_contract else "waiting"
            return True, [], ""
        changed_items = [item for item in items if item.get("changed")]
        self._performance.inc(
            "inverter_write_skipped_same_value",
            len(items) - len(changed_items),
        )
        if not changed_items:
            self.tou_operation_status = "success" if finalize_contract else "confirming"
            self.tou_contract_status = "confirmed" if finalize_contract else "waiting"
            self.tou_transaction_log = list(items)
            return True, items, ""

        async with self._tou_transaction_lock():
            transaction_id = _CONTROL_TRANSACTION_ID.get()
            self._set_control_transaction_snapshot(transaction_id, snapshot)
            cancel_event = asyncio.Event()
            self._active_tou_cancel_event = cancel_event
            self.tou_operation_status = "writing"
            self.tou_contract_status = "writing"
            self.tou_last_error = ""
            self.tou_transaction_log = list(items)
            self._notify_update_for("tou_write")

            try:
                # Validate every changed entity before writing.
                for item in changed_items:
                    idx = item["slot_index"]
                    field = item["field"]
                    entity_id = item["entity_id"]
                    value = item["expected_logical_value"]
                    if field in ("start", "end"):
                        self._validate_time_entity(f"TOU {idx} {field}", entity_id, value)
                    elif field == "soc":
                        self._validate_number_entity(f"TOU {idx} SOC", entity_id, value)
                    elif field == "grid":
                        self._validate_boolean_control_entity(
                            f"TOU {idx} Grid Charge", entity_id, bool(value), "grid"
                        )
                    elif field in ("mode", "charge"):
                        self._validate_select_entity(
                            f"TOU {idx} {field.title()}", entity_id, str(value)
                        )
                    elif field == "sell":
                        self._validate_boolean_control_entity(
                            f"TOU {idx} Sell", entity_id, bool(value), "sell"
                        )
                    elif field in ("power", "voltage"):
                        self._validate_number_entity(
                            f"TOU {idx} {field.title()}", entity_id, float(value)
                        )

                self._last_tou_write_started = True

                # Deterministic write order.
                write_order = {
                    "start": 0,
                    "end": 0,
                    "mode": 1,
                    "charge": 2,
                    "sell": 3,
                    "power": 4,
                    "voltage": 5,
                    "soc": 6,
                    "grid": 7,
                }
                changed_items.sort(key=lambda item: (write_order.get(item["field"], 99), item["slot_index"]))

                for item in changed_items:
                    if cancel_event.is_set():
                        raise ControlDisabledError(
                            "TOU write interrupted by disabling Deye control"
                        )
                    field = item["field"]
                    entity_id = item["entity_id"]
                    provider_value = item["expected_provider_value"]
                    if field in ("start", "end"):
                        await self.async_set_time(entity_id, provider_value)
                    elif field == "soc":
                        await self.async_set_number(entity_id, float(provider_value))
                    elif field == "grid":
                        await self.async_set_boolean_control(entity_id, bool(item["expected_logical_value"]), "grid")
                    elif field in ("mode", "charge"):
                        await self.async_set_select(entity_id, str(provider_value))
                    elif field == "sell":
                        await self.async_set_boolean_control(entity_id, bool(item["expected_logical_value"]), "sell")
                    elif field in ("power", "voltage"):
                        await self.async_set_number(entity_id, float(provider_value))
                    else:
                        raise ValueError(f"Unsupported TOU field write: {field}")
                    item["written"] = True
                    item["status"] = "waiting"

                self.tou_operation_status = "confirming"
                self.tou_contract_status = "waiting"
                self._notify_update_for("tou_confirmation")
                unconfirmed = await self._async_wait_for_tou_confirmation(items, operation_name)
                if unconfirmed:
                    raise RuntimeError(
                        "missing entity confirmation: " + ", ".join(
                            f"{item['entity_id']} ({item['field']})" for item in unconfirmed
                        )
                    )
                if self._control_result_is_current(transaction_id):
                    self.tou_operation_status = "success" if finalize_contract else "confirming"
                    self.tou_contract_status = "confirmed" if finalize_contract else "waiting"
                return True, items, ""
            except ControlDisabledError as err:
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_operation_status = "rollback"
                    self.tou_contract_status = "rollback"
                rollback_snapshot = {
                    item["entity_id"]: snapshot[item["entity_id"]]
                    for item in items
                    if item.get("written") and item.get("entity_id") in snapshot
                }
                try:
                    with self._control_rollback_scope(transaction_id, rollback_snapshot):
                        rollback_ok, rollback_errors = await self._async_rollback_tou_transaction(
                            items, snapshot
                        )
                except Exception as rollback_err:
                    rollback_ok = False
                    rollback_errors = [str(rollback_err)]
                message = str(err)
                if rollback_errors:
                    message += ". Rollback: " + ", ".join(rollback_errors)
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_operation_status = "cancelled" if rollback_ok else "critical"
                    self.tou_contract_status = "rollback" if rollback_ok else "rollback_failed"
                    self.tou_last_error = message
                return False, items, message
            except asyncio.CancelledError:
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_operation_status = "rollback"
                    self.tou_contract_status = "rollback"
                try:
                    rollback_snapshot = {
                        item["entity_id"]: snapshot[item["entity_id"]]
                        for item in items
                        if item.get("written") and item.get("entity_id") in snapshot
                    }
                    with self._control_rollback_scope(transaction_id, rollback_snapshot):
                        rollback_ok, _rollback_errors = await self._async_rollback_tou_transaction(items, snapshot)
                except Exception as rollback_err:
                    rollback_ok = False
                    _LOGGER.warning("TOU rollback after cancellation failed: %s", rollback_err)
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_contract_status = "rollback" if rollback_ok else "rollback_failed"
                    self.tou_last_error = f"{operation_name} anulowane"
                raise
            except Exception as err:
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_operation_status = "rollback"
                    self.tou_contract_status = "rollback"
                rollback_snapshot = {
                    item["entity_id"]: snapshot[item["entity_id"]]
                    for item in items
                    if item.get("written") and item.get("entity_id") in snapshot
                }
                with self._control_rollback_scope(transaction_id, rollback_snapshot):
                    rollback_ok, rollback_errors = await self._async_rollback_tou_transaction(
                        items, snapshot
                    )
                if rollback_ok:
                    message = f"Error {operation_name}: {err}. Previous settings restored."
                else:
                    message = (
                        f"CRITICAL error {operation_name}: {err}. "
                        f"Full restore was not confirmed: {', '.join(rollback_errors)}"
                    )
                if not self._control_transaction_is_stale(transaction_id):
                    self.tou_operation_status = "error" if rollback_ok else "critical"
                    self.tou_contract_status = "rollback" if rollback_ok else "rollback_failed"
                    self.tou_last_error = message
                return False, items, message
            finally:
                self.tou_transaction_log = list(items)
                if self._active_tou_cancel_event is cancel_event:
                    self._active_tou_cancel_event = None
                self.notify_update()

    def schedule_to_tou_mapping(
        self, slot_source: dict[str, SlotSettings] | None = None
    ) -> TouMapping:
        """Build the physical Deye TOU mapping from the active trigger source.

        The mapping compresses the schedule into ranges where the physical key
        (effective Deye TOU SOC, hourly Grid Charge flag) is identical.  Logical
        manager modes and other runtime overlays are not part of the key.
        ``slot_source`` allows validating a candidate manual row set before it
        becomes active.
        """
        source = slot_source if slot_source is not None else self.effective_slots()
        raw: list[tuple[int, float, bool]] = []
        for index, (slot_key, _label, _start, _end) in enumerate(SLOTS):
            slot = source[slot_key]
            soc = self._effective_physical_tou_soc_for_slot(slot)
            # ``charge_enabled`` is the physical Grid Charge flag of the slot.
            grid_charge = bool(slot.charge_enabled)
            raw.append((index, round(float(soc), 1), grid_charge))

        if len(raw) != SLOTS_PER_DAY:
            raise ValueError(f"Schedule must cover exactly {SLOTS_PER_DAY} slots, got {len(raw)}")

        compressed: list[TouMappingSlot] = []
        for index, soc, grid_charge in raw:
            if compressed:
                last = compressed[-1]
                if round(last.soc, 1) == soc and last.grid_charge == grid_charge:
                    last.end = (index + 1) * SLOT_MINUTES
                    last.source_slots.append(index)
                    continue
            compressed.append(
                TouMappingSlot(
                    index=len(compressed) + 1,
                    start=index * SLOT_MINUTES,
                    end=(index + 1) * SLOT_MINUTES,
                    soc=soc,
                    grid_charge=grid_charge,
                    source_slots=[index],
                    provider_fields={},
                )
            )

        # Wrap the day: a range ending at midnight is represented as 0.
        for slot in compressed:
            if slot.end == MINUTES_PER_DAY:
                slot.end = 0

        # Deye exposes exactly six physical TOU ranges.  If the natural schedule
        # still needs more, we fail before writing anything.
        if len(compressed) > 6:
            return TouMapping(slots=compressed)

        # If fewer than six ranges are needed, deterministically split the
        # longest range (on a slot boundary) until we have six slots.
        while len(compressed) < 6:
            split_index = -1
            longest = 0
            for index, segment in enumerate(compressed):
                segment_end = MINUTES_PER_DAY if segment.end == 0 else int(segment.end)
                duration = segment_end - int(segment.start)
                if duration > longest and duration > SLOT_MINUTES:
                    longest = duration
                    split_index = index
            if split_index < 0:
                break
            segment = compressed[split_index]
            segment_end = MINUTES_PER_DAY if segment.end == 0 else int(segment.end)
            slot_count = (segment_end - int(segment.start)) // SLOT_MINUTES
            middle = int(segment.start) + (slot_count // 2) * SLOT_MINUTES
            first = TouMappingSlot(
                index=segment.index,
                start=segment.start,
                end=middle,
                soc=segment.soc,
                grid_charge=segment.grid_charge,
                source_slots=[h for h in segment.source_slots if h * SLOT_MINUTES < middle],
                provider_fields=segment.provider_fields,
            )
            second = TouMappingSlot(
                index=segment.index + 1,
                start=middle,
                end=segment.end,
                soc=segment.soc,
                grid_charge=segment.grid_charge,
                source_slots=[h for h in segment.source_slots if h * SLOT_MINUTES >= middle],
                provider_fields=segment.provider_fields,
            )
            compressed[split_index : split_index + 1] = [first, second]
            # Reindex after a split.
            for idx, item in enumerate(compressed, start=1):
                item.index = idx

        return TouMapping(slots=compressed)

    @property
    def _tou_mapping(self) -> TouMapping:
        manual = getattr(self, "_manual_tou_mapping", None)
        if manual is not None and len(manual.slots) == 6:
            return manual
        return self.schedule_to_tou_mapping()

    def schedule_mapping_snapshot(self) -> list[dict[str, Any]]:
        """Expose the single backend 24 h -> Deye TOU mapping used for writes."""
        mapping = self._tou_mapping
        return [
            {
                "range": item.index,
                "start": int(item.start),
                "end": int(item.end),
                "start_time": self._minutes_to_clock(int(item.start)),
                "end_time": self._minutes_to_clock(int(item.end)),
                "tou_soc": item.soc,
                "grid_charge": bool(item.grid_charge),
            }
            for item in mapping.slots
        ]

    def read_physical_tou_mapping(self) -> TouMapping:
        """Read the current six physical Deye TOU ranges from the inverter."""
        starts_minutes: list[int | None] = []
        for idx in range(1, 7):
            text = self.state_text(self._tou_entity(idx, "start"))
            minutes = self._time_to_minutes(text)
            starts_minutes.append(minutes)
        if any(value is None for value in starts_minutes):
            raise ValueError("Cannot read all Deye Time Of Use starts")
        soc_values: list[float] = []
        for idx in range(1, 7):
            value = self.safe_float(self.state_text(self._tou_entity(idx, "soc")), float("nan"))
            if not math.isfinite(value) or not 0 <= value <= 100:
                raise ValueError(f"Invalid Deye Time Of Use SOC for slot {idx}: {value}")
            soc_values.append(value)
        grid_values: list[bool] = []
        for idx in range(1, 7):
            state = self.state_text(self._tou_entity(idx, "grid"))
            logical = provider_boolean_state(self.data, "grid", state)
            if logical is None:
                raise ValueError(
                    f"Invalid Deye Time Of Use charge source for slot {idx}: {state}"
                )
            grid_values.append(logical)

        slots: list[TouMappingSlot] = []
        numeric_starts = [int(value) for value in starts_minutes]
        for idx in range(6):
            start_minute = numeric_starts[idx]
            end_minute = numeric_starts[(idx + 1) % 6]
            effective_end = end_minute
            if idx == 5:
                effective_end = MINUTES_PER_DAY if end_minute == 0 else end_minute + MINUTES_PER_DAY
            elif end_minute <= start_minute:
                raise ValueError(
                    f"Deye Time Of Use slots {idx + 1} and {idx + 2} overlap or are out of order"
                )
            if effective_end <= start_minute:
                raise ValueError(
                    f"Deye Time Of Use slot {idx + 1} cannot have zero length"
                )
            source_slots: list[int] = []
            for slot_index, (_key, _label, slot_start, _slot_end) in enumerate(SLOTS):
                minute = int(slot_start)
                if idx == 5:
                    if minute >= start_minute or minute < end_minute:
                        source_slots.append(slot_index)
                elif start_minute <= minute < end_minute:
                    source_slots.append(slot_index)
            slots.append(
                TouMappingSlot(
                    index=idx + 1,
                    start=start_minute % MINUTES_PER_DAY,
                    end=end_minute % MINUTES_PER_DAY,
                    soc=round(float(soc_values[idx]), 1),
                    grid_charge=bool(grid_values[idx]),
                    source_slots=source_slots,
                    provider_fields={},
                )
            )
        return TouMapping(slots=slots)

    def tou_mapping_to_schedule_patch(self, mapping: TouMapping | None = None) -> list[dict[str, Any]]:
        """Build a schedule patch that reflects only the physical TOU SOC/Grid Charge.

        Manager logical modes, sell power, charge/discharge/grid charge currents,
        minimum sell price and the logical sale guard ``minimum_sell_soc`` are
        preserved.  Only ``tou_soc`` and the hourly ``charge_enabled`` flag are
        updated.
        """
        if mapping is None:
            mapping = self.read_physical_tou_mapping()
        slot_to_physical: dict[int, tuple[float, bool]] = {}
        for slot in mapping.slots:
            for slot_index in slot.source_slots:
                if 0 <= int(slot_index) < SLOTS_PER_DAY:
                    slot_to_physical[int(slot_index)] = (slot.soc, slot.grid_charge)
        if len(slot_to_physical) != SLOTS_PER_DAY:
            # Arbitrary-minute physical boundaries may not align with 30-minute
            # schedule slots. Assign each schedule slot by its start minute.
            slot_to_physical = {}
            for slot_index, (_key, _label, slot_start, _slot_end) in enumerate(SLOTS):
                minute = int(slot_start) % MINUTES_PER_DAY
                for slot in mapping.slots:
                    start = int(slot.start) % MINUTES_PER_DAY
                    end = int(slot.end) % MINUTES_PER_DAY
                    if slot.index == 6 or end == 0:
                        in_range = minute >= start or minute < (end or 0)
                    else:
                        in_range = start <= minute < end
                    if in_range:
                        slot_to_physical[slot_index] = (slot.soc, slot.grid_charge)
                        break
        if len(slot_to_physical) != SLOTS_PER_DAY:
            raise ValueError(
                f"The physical TOU map covers {len(slot_to_physical)} slots, required {SLOTS_PER_DAY}"
            )

        patch: list[dict[str, Any]] = []
        for slot_index, (_key, _label, _start, _end) in enumerate(SLOTS):
            if slot_index not in slot_to_physical:
                continue
            start_soc, start_grid = slot_to_physical[slot_index]
            update: dict[str, Any] = {"slot_key": _key, "charge_enabled": start_grid}
            # In 5A.1 physical TOU SOC is independent of the logical mode.  The
            # logical sale guard ``minimum_sell_soc`` is never overwritten here.
            update["tou_soc"] = start_soc
            patch.append(update)
        return patch

    def _serialize_manual_tou_mapping(self) -> dict[str, Any] | None:
        """Persist a manually saved 24 h TOU map, independent of the work schedule."""
        mapping = getattr(self, "_manual_tou_mapping", None)
        if mapping is None or len(mapping.slots) != 6:
            return None
        return {
            "slots": [
                {
                    "index": int(slot.index),
                    "start": int(slot.start) % MINUTES_PER_DAY,
                    "end": int(slot.end) % MINUTES_PER_DAY,
                    "soc": round(float(slot.soc), 1),
                    "grid_charge": bool(slot.grid_charge),
                }
                for slot in sorted(mapping.slots, key=lambda item: int(item.index))
            ]
        }

    def _deserialize_manual_tou_mapping(self, raw: Any) -> TouMapping | None:
        """Restore a stored manual 24 h TOU map; invalid data is ignored."""
        if isinstance(raw, dict):
            items = raw.get("slots")
        elif isinstance(raw, list):
            items = raw
        else:
            return None
        if not isinstance(items, list) or len(items) != 6:
            return None
        slots: list[TouMappingSlot] = []
        try:
            for fallback_index, item in enumerate(items, start=1):
                if not isinstance(item, dict):
                    return None
                index = int(self.safe_float(item.get("index"), fallback_index))
                start = int(self.safe_float(item.get("start"), float("nan")))
                end = int(self.safe_float(item.get("end"), float("nan")))
                soc = float(self.safe_float(item.get("soc"), float("nan")))
                if not math.isfinite(soc):
                    return None
                grid_charge = item.get("grid_charge")
                if not isinstance(grid_charge, bool) or not 0 <= start < MINUTES_PER_DAY or not 0 <= end < MINUTES_PER_DAY or not 0 <= soc <= 100:
                    return None
                slots.append(
                    TouMappingSlot(
                        index=index,
                        start=start,
                        end=end,
                        soc=round(soc, 1),
                        grid_charge=grid_charge,
                        source_slots=[],
                    )
                )
            mapping = TouMapping(slots=slots)
            # Recompute source slots and validate full-day coverage/order.
            self.read_physical_tou_mapping  # keep method referenced in context
            starts = [slot.start for slot in mapping.slots]
            if sorted([slot.index for slot in mapping.slots]) != [1, 2, 3, 4, 5, 6]:
                return None
            numeric = [int(value) for value in starts]
            if len(set(numeric)) != 6 or any(numeric[idx] >= numeric[idx + 1] for idx in range(5)):
                return None
            coverage = [0] * MINUTES_PER_DAY
            for idx, start_minute in enumerate(numeric):
                end_minute = numeric[(idx + 1) % 6]
                if idx == 5:
                    end_minute += MINUTES_PER_DAY
                if end_minute <= start_minute:
                    return None
                for minute in range(start_minute, end_minute):
                    coverage[minute % MINUTES_PER_DAY] += 1
            if any(count != 1 for count in coverage):
                return None
            for slot_index, (_key, _label, slot_start, _slot_end) in enumerate(SLOTS):
                minute = int(slot_start)
                for slot in mapping.slots:
                    start = int(slot.start)
                    end = int(slot.end)
                    if slot.index == 6:
                        in_range = minute >= start or minute < end
                    else:
                        in_range = start <= minute < end
                    if in_range:
                        slot.source_slots.append(slot_index)
                        break
            return mapping
        except Exception:
            return None

    @staticmethod
    def _tou_mapping_rows(mapping: TouMapping) -> list[tuple[int, int, float, bool]]:
        """Return the physical fields used by the strict 5C.2 round-trip check."""
        return [
            (
                int(slot.start) % MINUTES_PER_DAY,
                int(slot.end) % MINUTES_PER_DAY,
                round(float(slot.soc), 1),
                bool(slot.grid_charge),
            )
            for slot in mapping.slots
        ]

    @classmethod
    def _tou_mappings_match(cls, actual: TouMapping, expected: TouMapping) -> bool:
        """Compare exact six-slot physical boundaries, SOC and Grid Charge."""
        return len(actual.slots) == 6 and len(expected.slots) == 6 and cls._tou_mapping_rows(actual) == cls._tou_mapping_rows(expected)

    @staticmethod
    def _tou_signature(rows: list[tuple[int, int, float, bool]]) -> str:
        """Return a deterministic logical signature for normalized TOU rows."""
        return "|".join(
            f"{start:04d}-{end:04d}:{round(float(soc), 1):.1f}:{int(bool(grid))}"
            for start, end, soc, grid in rows
        )

    @staticmethod
    def _expected_tou_readback_rows(
        mapping: TouMapping,
    ) -> list[tuple[int, int, float, bool]]:
        """Represent the expected schedule map in physical readback units."""
        return [
            (
                int(slot.start) % MINUTES_PER_DAY,
                int(slot.end) % MINUTES_PER_DAY,
                round(float(slot.soc), 1),
                bool(slot.grid_charge),
            )
            for slot in mapping.slots
        ]

    def _physical_tou_readback_rows(self) -> list[tuple[int, int, float, bool]]:
        """Read and normalize the complete physical 6/6 TOU state.

        Time/select values are normalized to minutes after midnight, SOC to one
        decimal place and provider-specific Grid/source options to a logical
        boolean.  Unknown, unavailable or partially configured readback fails
        closed and never produces a signature.
        """
        starts: list[int] = []
        socs: list[float] = []
        grids: list[bool] = []
        for idx in range(1, 7):
            start_entity = self._tou_entity(idx, "start")
            soc_entity = self._tou_entity(idx, "soc")
            grid_entity = self._tou_entity(idx, "grid")
            start_state = self.hass.states.get(start_entity) if start_entity else None
            soc_state = self.hass.states.get(soc_entity) if soc_entity else None
            grid_state = self.hass.states.get(grid_entity) if grid_entity else None
            start = self._time_to_minutes(start_state.state if start_state is not None else None)
            soc = self.safe_float(soc_state.state if soc_state is not None else None, float("nan"))
            grid = provider_boolean_state(
                self.data, "grid", grid_state.state if grid_state is not None else None
            )
            if start is None:
                raise ValueError(f"Cannot confirm the Deye Time Of Use start for slot {idx}")
            if not math.isfinite(soc) or not 0 <= soc <= 100:
                raise ValueError(f"Cannot confirm the Deye Time Of Use SOC for slot {idx}")
            if grid is None:
                raise ValueError(
                    f"Cannot confirm Deye Time Of Use Grid Charge for slot {idx}"
                )
            starts.append(start)
            socs.append(round(float(soc), 1))
            grids.append(bool(grid))
        return [
            (starts[idx], starts[(idx + 1) % 6], socs[idx], grids[idx])
            for idx in range(6)
        ]

    @staticmethod
    def _tou_mismatched_fields(
        expected: list[tuple[int, int, float, bool]],
        physical: list[tuple[int, int, float, bool]],
    ) -> list[str]:
        """List exact normalized physical fields that differ from the plan."""
        names = ("start", "end", "soc", "grid_charge")
        mismatched: list[str] = []
        for index, (expected_row, physical_row) in enumerate(
            zip(expected, physical, strict=False), start=1
        ):
            for field_index, name in enumerate(names):
                if expected_row[field_index] != physical_row[field_index]:
                    mismatched.append(f"slot_{index}.{name}")
        if len(expected) != len(physical):
            mismatched.append("slot_count")
        return mismatched

    def _refresh_tou_reconciliation_state(
        self, mapping: TouMapping | None = None
    ) -> bool:
        """Compare the expected map with confirmed physical readback.

        This method is read-only with respect to HA entities.  It is used by the
        normal polling cycle and immediately before deciding whether a cached
        TOU write can be skipped.
        """
        profile = provider_profile(self.data)
        try:
            expected_mapping = mapping if mapping is not None else self._tou_mapping
            if len(expected_mapping.slots) != 6:
                raise ValueError(
                    f"The expected Deye Time Of Use map has {len(expected_mapping.slots)} slots instead of 6"
                )
            expected_rows = self._expected_tou_readback_rows(expected_mapping)
            self.tou_expected_signature = self._tou_signature(expected_rows)
        except Exception as err:
            self.tou_expected_signature = ""
            self.tou_physical_signature = ""
            self.tou_readback_complete = False
            self.tou_reconciliation_in_sync = False
            self.tou_mismatched_fields = []
            self.tou_reconciliation_status = "error"
            self.tou_last_reconciliation_error = str(err)
            return False

        try:
            if profile.native_tou:
                capability_rows = self.tou_slot_capabilities()
                if not all(
                    row["fields"][field]["supported"]
                    and row["fields"][field]["readable"]
                    for row in capability_rows
                    for field in ("start", "soc", "grid_charge")
                ):
                    raise ValueError("the 6/6 readback is incomplete or unavailable")
            physical_rows = self._physical_tou_readback_rows()
        except Exception as err:
            self.tou_physical_signature = ""
            self.tou_readback_complete = False
            self.tou_reconciliation_in_sync = False
            self.tou_mismatched_fields = []
            self.tou_reconciliation_status = (
                "read_only" if not profile.native_tou else "waiting_readback"
            )
            self.tou_last_reconciliation_error = (
                "Cannot confirm the physical Deye Time Of Use: " + str(err)
            )
            return False

        physical_signature = self._tou_signature(physical_rows)
        mismatched = self._tou_mismatched_fields(expected_rows, physical_rows)
        self.tou_physical_signature = physical_signature
        self.tou_readback_complete = True
        self.tou_mismatched_fields = mismatched
        self.tou_reconciliation_in_sync = not mismatched
        self.tou_last_reconciliation_error = ""
        if not mismatched:
            self.tou_reconciliation_status = "in_sync"
            self._last_physical_tou_signature = physical_signature
            self._last_external_tou_mismatch_signature = ""
            return True

        mismatch_signature = f"{self.tou_expected_signature}>{physical_signature}"
        if mismatch_signature != self._last_external_tou_mismatch_signature:
            self.tou_last_external_mismatch_at = ha_now().isoformat(timespec="seconds")
            self._last_external_tou_mismatch_signature = mismatch_signature
        if not profile.native_tou:
            self.tou_reconciliation_status = "read_only"
        elif self.emergency_stop:
            self.tou_reconciliation_status = "blocked_emergency_stop"
        elif not self._control_is_active():
            self.tou_reconciliation_status = "blocked_control_disabled"
        else:
            self.tou_reconciliation_status = "mismatch"
        return False

    def tou_reconciliation_diagnostics(self) -> dict[str, Any]:
        """Expose Stage 5D reconciliation state without changing the schedule."""
        return {
            "expected_signature": self.tou_expected_signature or None,
            "physical_signature": self.tou_physical_signature or None,
            "in_sync": self.tou_reconciliation_in_sync,
            "readback_complete": self.tou_readback_complete,
            "last_external_mismatch_at": self.tou_last_external_mismatch_at or None,
            "mismatched_fields": list(self.tou_mismatched_fields),
            "reconciliation_status": self.tou_reconciliation_status,
            "last_reconciliation_error": self.tou_last_reconciliation_error or None,
        }

    def _apply_reverse_sync_patch_locked(
        self, updates: list[dict[str, Any]]
    ) -> list[int]:
        """Apply only physical hourly fields while ``_operation_lock`` is held.

        This deliberately does not call ``async_apply_schedule_patch`` and does
        not schedule reconciliation.  The confirmed physical readback is the
        source of truth for this local mutation.
        """
        if not updates:
            raise ValueError("The Deye TOU reverse sync contains no hours")
        changed_hours: list[str] = []
        seen: set[str] = set()
        slot_times = {key: self._minutes_to_clock(int(start)) for key, _label, start, _end in SLOTS}
        for update in updates:
            if not isinstance(update, dict):
                raise ValueError("Invalid Deye TOU reverse sync entry")
            if set(update) != {"slot_key", "tou_soc", "charge_enabled"}:
                raise ValueError(
                    "Deye TOU reverse sync may only change tou_soc and charge_enabled"
                )
            slot_key = str(update["slot_key"])
            if slot_key not in self.slots or slot_key in seen:
                raise ValueError(f"Invalid reverse sync slot: {slot_key}")
            seen.add(slot_key)
            soc = float(update["tou_soc"])
            if not math.isfinite(soc) or not 0 <= soc <= 100:
                raise ValueError(f"Invalid reverse sync SOC for {slot_key}: {soc}")
            grid = bool(update["charge_enabled"])
            target = self.slots[slot_key]
            if target.tou_soc != soc or target.charge_enabled != grid:
                changed_hours.append(slot_times[slot_key])
            target.tou_soc = soc
            target.charge_enabled = grid
        if len(seen) != SLOTS_PER_DAY:
            raise ValueError(
                f"Reverse sync Deye TOU covered {len(seen)} slots, {SLOTS_PER_DAY} required"
            )
        return sorted(changed_hours)

    def _tou_raw_snapshot(self) -> dict[str, str]:
        """Capture every physical value that can be touched by a TOU write."""
        entity_ids = [entity_id for _label, entity_id in self._tou_entities() if entity_id]
        snapshot: dict[str, str] = {}
        for entity_id in dict.fromkeys(entity_ids):
            state = self.hass.states.get(entity_id)
            if state is None or state.state in ("unknown", "unavailable", "none", ""):
                raise ValueError(f"Cannot read the value before writing: {entity_id}")
            snapshot[entity_id] = str(state.state)
        return snapshot

    async def _async_restore_raw_entity(self, entity_id: str, raw_value: str) -> None:

        """Restore an exact HA state, preserving Generator/Both select options."""
        domain = entity_id.split(".", 1)[0]
        current = self.hass.states.get(entity_id)
        if current is not None:
            if domain == "number":
                actual_number = self.safe_float(current.state, float("nan"))
                target_number = self.safe_float(raw_value, float("nan"))
                if math.isfinite(actual_number) and math.isfinite(target_number) and math.isclose(
                    actual_number, target_number, abs_tol=0.1
                ):
                    return
            elif domain == "time":
                if self._time_to_minutes(current.state) == self._time_to_minutes(raw_value):
                    return
            elif str(current.state) == str(raw_value):
                return
        if domain == "select":
            await self._async_physical_service_call(
                "select",
                "select_option",
                {"entity_id": entity_id, "option": raw_value},
                target_value=raw_value,
            )
            return
        if domain == "switch":
            await self.async_set_switch(entity_id, raw_value == "on")
            return
        if domain == "time":
            await self.async_set_time(entity_id, raw_value)
            return
        if domain == "number":
            await self.async_set_number(entity_id, float(raw_value))
            return
        raise ValueError(f"Unsupported restore entity: {entity_id}")


    async def async_apply_time_of_use_map(self) -> bool:
        self._ensure_control_active()
        reservation = self._reserve_tou_write()
        try:
            async with self._control_operation("apply_tou_map") as transaction_id:
                return await self._async_apply_time_of_use_map_impl(transaction_id)
        finally:
            self._release_tou_write(reservation)

    async def _async_apply_time_of_use_map_impl(
        self, transaction_id: str | None = None
    ) -> bool:

        self._last_tou_write_started = False
        profile = provider_profile(self.data)
        mapping = self._tou_mapping
        if self.emergency_stop:
            if self._refresh_tou_reconciliation_state(mapping):
                return True
            self.tou_reconciliation_status = "blocked_emergency_stop"
            self.last_error = (
                "A Deye Time Of Use mismatch was detected, but an emergency stop is active."
            )
            self.notify_update()
            return False
        if len(mapping) > 6:
            self._refresh_tou_reconciliation_state(mapping)
            self.last_action = f"Time Of Use map skipped: {len(mapping)} segments"
            self.last_error = f"Mapping requires {len(mapping)} ranges; Deye supports at most 6"
            self.notify_update()
            return False
        if not profile.native_tou:
            self._refresh_tou_reconciliation_state(mapping)
            self.last_error = (
                f"{profile.label} does not expose safe Time Of Use control in Home Assistant. "
                "The schedule was not saved."
            )
            self.notify_update()
            return False
        effective_slots = self.effective_slots()
        missing_soc = [
            effective_slots[key].label
            for key, _label, _start, _end in SLOTS
            if self._physical_tou_soc_for_slot(effective_slots[key]) is None
        ]
        if missing_soc:
            self.tou_reconciliation_status = "waiting_readback"
            self.tou_reconciliation_in_sync = False
            self.tou_last_reconciliation_error = (
                "Cannot confirm the physical Deye Time Of Use: no tou_soc in the schedule"
            )
            self.last_error = (
                "Deye battery SOC (TOU) requires confirmation for slots: "
                + ", ".join(missing_soc)
            )
            self.notify_update()
            return False
        readback_matches = self._refresh_tou_reconciliation_state(mapping)
        missing = self.tou_mapping_errors()
        if missing:
            self._last_tou_signature = ""
            self.last_error = "Required Deye Time Of Use entities missing: " + ", ".join(missing)
            self.notify_update()
            return False

        signature = self.tou_expected_signature
        if readback_matches:
            self._last_tou_signature = signature
            self._last_physical_tou_signature = self.tou_physical_signature
            return True

        if not self.tou_readback_complete:
            self._last_tou_signature = ""
            self.last_error = (
                self.tou_last_reconciliation_error
                or "Cannot confirm the physical Deye Time Of Use"
            )
            self.notify_update()
            return False

        self.tou_reconciliation_status = "reconciling"
        self.tou_last_reconciliation_error = ""
        self.notify_update()
        items, snapshot = self._build_tou_transaction_plan(mapping)
        success, _items, message = await self._async_execute_tou_transaction(
            "uzgadniania Deye Time Of Use", items, snapshot
        )
        if not success:
            if not self._control_transaction_is_stale(transaction_id):
                self._last_tou_signature = ""
                self.tou_reconciliation_status = "error"
                self.tou_last_reconciliation_error = message
                self.last_error = message
                self.notify_update()
            return False

        if self._control_result_is_current(transaction_id):
            confirmed = self._refresh_tou_reconciliation_state(mapping)
            if not confirmed:
                self._last_tou_signature = ""
                self.tou_reconciliation_status = "error"
                self.tou_last_reconciliation_error = (
                    self.tou_last_reconciliation_error
                    or "Cannot confirm the physical Deye Time Of Use after reconciliation"
                )
                self.last_error = self.tou_last_reconciliation_error
                self.notify_update()
                return False
            self._last_tou_signature = signature
            self._last_physical_tou_signature = self.tou_physical_signature
        return True

    async def _async_reverse_sync_after_manual_tou_locked(
        self,
        transaction_id: str | None,
        items: list[dict[str, Any]],
        physical_snapshot: dict[str, str],
        schedule_snapshot: dict[str, SlotSettings],
    ) -> None:
        """Apply confirmed physical TOU readback locally and verify round-trip."""
        self.tou_contract_status = "waiting"
        self.reverse_sync_status = "applying"
        self.reverse_sync_last_error = ""
        self.reverse_sync_changed_hours = []
        self.reverse_sync_round_trip_ok = None
        self.notify_update()
        if self.manual_schedule_active:
            # Manual rows are the authoritative trigger source.  A confirmed
            # physical TOU write must never be copied into the independent
            # work slots while that source is selected.
            self.reverse_sync_status = "skipped_manual_schedule"
            self.reverse_sync_round_trip_ok = True
            self.tou_contract_status = "confirmed"
            self.tou_operation_status = "success"
            self.notify_update()
            return
        try:
            if not self._control_result_is_current(transaction_id) or not self._control_is_active():
                raise ControlDisabledError(self._control_block_message())

            capability_rows = self.tou_slot_capabilities()
            full_readback = all(
                row["fields"][field]["readable"]
                for row in capability_rows
                for field in ("start", "soc", "grid_charge")
            )
            if not full_readback:
                raise ValueError(
                    "Reverse sync requires a complete confirmed readback "
                    "Deye Time Of Use 6/6."
                )

            # Read and validate every physical field again.  The request payload
            # is intentionally not used as the reverse-sync source of truth.
            self._validated_tou_start_vector(1)
            confirmed_mapping = self.read_physical_tou_mapping()
            patch = self.tou_mapping_to_schedule_patch(confirmed_mapping)
            changed_hours = self._apply_reverse_sync_patch_locked(patch)
            round_trip = self.schedule_to_tou_mapping()
            round_trip_ok = self._tou_mappings_match(confirmed_mapping, round_trip)
            if not round_trip_ok:
                # A manual 24 h mapping is authoritative and may use arbitrary
                # minute boundaries that the 48-slot work schedule cannot express.
                # Keep the confirmed physical map and avoid rolling back a
                # verified inverter write.
                self._manual_tou_mapping = confirmed_mapping
                self.reverse_sync_changed_hours = changed_hours
                self.reverse_sync_round_trip_ok = True
                self.reverse_sync_status = "confirmed_manual"
                self.reverse_sync_last_error = ""
                self.tou_contract_status = "confirmed"
                self.tou_operation_status = "success"
                return

            self._manual_tou_mapping = None
            self.reverse_sync_changed_hours = changed_hours
            self.reverse_sync_round_trip_ok = True
            self.reverse_sync_status = "confirmed"
            self.reverse_sync_last_error = ""
            self.tou_contract_status = "confirmed"
            self.tou_operation_status = "success"
        except (Exception, asyncio.CancelledError) as err:
            self.slots = {key: replace(slot) for key, slot in schedule_snapshot.items()}
            self.reverse_sync_status = "rollback"
            self.reverse_sync_round_trip_ok = False
            rollback_snapshot = {
                item["entity_id"]: physical_snapshot[item["entity_id"]]
                for item in items
                if item.get("written") and item.get("entity_id") in physical_snapshot
            }
            try:
                with self._control_rollback_scope(transaction_id, rollback_snapshot):
                    rollback_ok, rollback_errors = await self._async_rollback_tou_transaction(
                        items, physical_snapshot
                    )
            except Exception as rollback_err:
                rollback_ok = False
                rollback_errors = [str(rollback_err)]

            base_error = str(err) or err.__class__.__name__
            if rollback_ok:
                message = (
                    f"Deye Time Of Use reverse sync error: {base_error}. "
                    "The schedule and previous physical settings were restored."
                )
                self.reverse_sync_status = "rollback"
                self.tou_contract_status = "rollback"
                self.tou_operation_status = "error"
            else:
                message = (
                    f"CRITICAL Deye Time Of Use reverse sync error: {base_error}. "
                    "Full restore of the physical settings was not confirmed: "
                    + ", ".join(rollback_errors)
                )
                self.reverse_sync_status = "rollback_failed"
                self.tou_contract_status = "rollback_failed"
                self.tou_operation_status = "critical"
            self.reverse_sync_last_error = message
            self.tou_last_error = message
            self.last_error = message
            self.tou_transaction_log = list(items)
            self.notify_update()
            if isinstance(err, asyncio.CancelledError):
                raise
            if isinstance(err, ControlDisabledError):
                raise ControlDisabledError(message) from err
            raise ValueError(message) from err

    async def async_set_physical_tou_slot(
        self,
        slot: int,
        start: str | None = None,
        end: str | None = None,
        soc: float | None = None,
        grid_charge: bool | None = None,
        mode: str | None = None,
        charge: str | None = None,
        sell: bool | None = None,
        power: float | None = None,
        voltage: float | None = None,
    ) -> None:
        """Write only supplied physical TOU fields through the provider adapter."""
        if self._inverter_link_gated:
            self.last_action = "Not performed — inverter unavailable"
            self.executed_manager_action = "Not performed — inverter unavailable"
            self.notify_update()
            raise ControlDisabledError(
                "Deye inverter is unavailable; physical writes are blocked."
            )
        profile = provider_profile(self.data)
        if not profile.native_tou:
            raise ValueError(
                f"{profile.label} does not expose safe Deye Time Of Use editing"
            )
        if slot < 1 or slot > 6:
            raise ValueError("The Deye Time Of Use slot number must be between 1 and 6")
        supplied = {
            "start": start is not None,
            "end": end is not None,
            "soc": soc is not None,
            "grid_charge": grid_charge is not None,
            "mode": mode is not None,
            "charge": charge is not None,
            "sell": sell is not None,
            "power": power is not None,
            "voltage": voltage is not None,
        }
        if not any(supplied.values()):
            raise ValueError("Provide at least one Deye Time Of Use field to change")
        if supplied["grid_charge"] and supplied["charge"]:
            raise ValueError("Provide either grid_charge or charge, not both")
        self._ensure_control_active()

        normalized_start: str | None = None
        normalized_end: str | None = None
        if supplied["start"] or supplied["end"]:
            proposed = self._validated_tou_start_vector(
                slot, start=start, end=end
            )
            normalized_start = proposed[slot - 1] if supplied["start"] else None
            next_slot = 1 if slot == 6 else slot + 1
            normalized_end = proposed[next_slot - 1] if supplied["end"] else None
        if supplied["soc"]:
            numeric_soc = float(soc)
            if not math.isfinite(numeric_soc) or not 0 <= numeric_soc <= 100:
                raise ValueError("Deye Time Of Use SOC must be between 0 and 100%")
        if supplied["grid_charge"] and not isinstance(grid_charge, bool):
            raise ValueError("Grid charge must be true or false")
        if supplied["sell"] and not isinstance(sell, bool):
            raise ValueError("Sell must be true or false")
        for field_name, value in (("mode", mode), ("charge", charge)):
            if supplied[field_name]:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"{field_name.title()} must be a non-empty string")
        for field_name, value in (("power", power), ("voltage", voltage)):
            if supplied[field_name]:
                numeric = float(value)
                if not math.isfinite(numeric) or numeric < 0:
                    raise ValueError(f"{field_name.title()} must be a non-negative number")

        next_slot = 1 if slot == 6 else slot + 1
        capability_row = self.tou_slot_capabilities()[slot - 1]
        capabilities = capability_row["fields"]
        for field_name, present in supplied.items():
            if not present:
                continue
            capability = capabilities.get(field_name)
            if not capability:
                raise ValueError(f"Unknown Deye Time Of Use field: {field_name}")
            if not capability["supported"]:
                raise ValueError(
                    f"Provider {profile.label} does not support the {field_name} field "
                    f"for the Deye Time Of Use slot {slot}"
                )
            if not capability["writable"]:
                raise ValueError(
                    f"Field {field_name} of Deye Time Of Use slot {slot} is not currently writable"
                )

        reservation = self._reserve_tou_write()
        try:
            async with self._operation_lock:
                async with self._control_operation("manual_tou") as transaction_id:
                    schedule_snapshot = {
                        key: replace(value) for key, value in self.slots.items()
                    }
                    start_entity = self._tou_entity(slot, "start")
                    end_entity = self._tou_entity(next_slot, "start")
                    soc_entity = self._tou_entity(slot, "soc")
                    grid_entity = self._tou_entity(slot, "grid")
                    mode_entity = self._tou_entity(slot, "mode")
                    charge_entity = self._tou_entity(slot, "charge")
                    sell_entity = self._tou_entity(slot, "sell")
                    power_entity = self._tou_entity(slot, "power")
                    voltage_entity = self._tou_entity(slot, "voltage")
                    snapshot: dict[str, str] = {}
                    items: list[dict[str, Any]] = []
                    if normalized_start is not None:
                        items.append(
                            self._make_tou_transaction_item(
                                start_entity, "start", slot, normalized_start, snapshot
                            )
                        )
                    if normalized_end is not None:
                        items.append(
                            self._make_tou_transaction_item(
                                end_entity, "end", slot, normalized_end, snapshot
                            )
                        )
                    if supplied["soc"]:
                        items.append(
                            self._make_tou_transaction_item(
                                soc_entity, "soc", slot, float(soc), snapshot
                            )
                        )
                    if supplied["grid_charge"]:
                        items.append(
                            self._make_tou_transaction_item(
                                grid_entity, "grid", slot, bool(grid_charge), snapshot
                            )
                        )
                    if supplied["mode"]:
                        items.append(
                            self._make_tou_transaction_item(
                                mode_entity, "mode", slot, str(mode).strip(), snapshot
                            )
                        )
                    if supplied["charge"]:
                        items.append(
                            self._make_tou_transaction_item(
                                charge_entity, "charge", slot, str(charge).strip(), snapshot
                            )
                        )
                    if supplied["sell"]:
                        items.append(
                            self._make_tou_transaction_item(
                                sell_entity, "sell", slot, bool(sell), snapshot
                            )
                        )
                    if supplied["power"]:
                        items.append(
                            self._make_tou_transaction_item(
                                power_entity, "power", slot, float(power), snapshot
                            )
                        )
                    if supplied["voltage"]:
                        items.append(
                            self._make_tou_transaction_item(
                                voltage_entity, "voltage", slot, float(voltage), snapshot
                            )
                        )

                    success, _items, message = await self._async_execute_tou_transaction(
                        "manual Deye Time Of Use writes",
                        items,
                        snapshot,
                        finalize_contract=False,
                    )
                    if not success:
                        if self._control_transaction_is_stale():
                            raise ControlDisabledError(self._control_block_message())
                        self.last_error = message
                        self.notify_update()
                        raise ValueError(message)

                    await self._async_reverse_sync_after_manual_tou_locked(
                        transaction_id,
                        items,
                        snapshot,
                        schedule_snapshot,
                    )
                    # Reverse sync adopts only a Manager-owned, confirmed manual
                    # edit.  Refresh the physical signature from readback so the
                    # next tick sees agreement and cannot create a write loop.
                    try:
                        self._manual_tou_mapping = self.read_physical_tou_mapping()
                    except Exception:
                        pass
                    self._last_tou_signature = ""
                    self._refresh_tou_reconciliation_state()
                    self.last_error = ""
                    self.last_action = f"Deye Time Of Use written manually — slot {slot}"
                    self.mark_config_saved()
        finally:
            self._release_tou_write(reservation)


    async def async_apply_slot_grid_charge(self, slot_key: str) -> bool:
        """Apply the schedule after a physical TOU Grid Charge change for one hour."""
        if slot_key not in self.slots:
            raise ValueError(f"Unknown schedule slot: {slot_key}")
        self._last_tou_signature = ""
        self._clear_slot_failure_latch()
        self.mark_config_saved()
        self.notify_update()
        if not self._control_is_active():
            self.last_action = (
                "Changes were saved in the schedule. Deye control is disabled — "
                "they were not sent to the inverter."
            )
            self.executed_manager_action = "Not performed — control disabled"
            self.notify_update()
            return True
        return bool(await self.async_tick())

    # ------------------------------------------------------------------
    # Manual schedule (UI/service-only, separate from work schedule)
    # ------------------------------------------------------------------

    @staticmethod
    def _manual_time_to_minutes(value: Any, label: str) -> int:
        if not isinstance(value, str):
            raise ValueError(f"{label} must be a whole-minute HH:MM time")
        text = value.strip()
        parts = text.split(":")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise ValueError(f"{label} must be a whole-minute HH:MM time")
        hour = int(parts[0])
        minute = int(parts[1])
        if hour == 24 and minute == 0:
            return 24 * 60
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError(f"{label} must be a whole-minute HH:MM time")
        return hour * 60 + minute

    @staticmethod
    def _minutes_to_hhmm(minutes: int) -> str:
        minutes = max(0, min(24 * 60, int(minutes)))
        if minutes == 24 * 60:
            return "00:00"
        return f"{minutes // 60:02d}:{minutes % 60:02d}"

    def _default_manual_schedule(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "active": False,
            "rows": [],
            "activation_snapshot": None,
        }

    def _ensure_manual_schedule(self) -> dict[str, Any]:
        if not isinstance(getattr(self, "manual_schedule", None), dict):
            self.manual_schedule = self._default_manual_schedule()
        manual = self.manual_schedule
        manual.setdefault("schema_version", 1)
        manual.setdefault("active", False)
        if not isinstance(manual.get("rows"), list):
            manual["rows"] = []
        if "activation_snapshot" not in manual:
            manual["activation_snapshot"] = None
        manual["active"] = bool(manual.get("active"))
        return manual

    @property
    def manual_schedule_active(self) -> bool:
        manual = getattr(self, "manual_schedule", None)
        return bool(isinstance(manual, dict) and manual.get("active"))

    def _manual_row_defaults(self) -> dict[str, Any]:
        return {
            "enabled": True,
            "mode": MODE_NORMAL_OPERATION,
            "sell_power": float(self.normal_profile_sell_power if self.normal_profile_sell_power >= 0 else self.default_sell_power),
            "minimum_sell_soc": 0.0,
            "charge_enabled": False,
            "battery_charge_enabled": False,
        }

    def _normalize_manual_row(self, raw: Any, index: int) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError(f"Manual schedule row {index + 1} must be an object")
        defaults = self._manual_row_defaults()
        # These fields used to live on manual rows.  They are no longer
        # controlled by the manual schedule; ignore them so rows saved by an
        # older version still load without rejecting the whole schedule.
        obsolete = {
            "physical_work_mode", "discharge_current", "charge_current",
            "grid_charge_current", "min_sell_price", "tou_soc",
        }
        unknown = set(raw) - {
            "from", "to", "enabled", "mode", "sell_power",
            "charge_enabled", "minimum_sell_soc", "battery_charge_enabled",
        } - obsolete
        if unknown:
            raise ValueError(
                f"Unsupported manual schedule fields in row {index + 1}: "
                + ", ".join(sorted(unknown))
            )
        start = self._manual_time_to_minutes(raw.get("from"), f"Row {index + 1} start time")
        end = self._manual_time_to_minutes(raw.get("to"), f"Row {index + 1} end time")
        row: dict[str, Any] = {
            "from": self._minutes_to_hhmm(start),
            "to": self._minutes_to_hhmm(end),
            "enabled": bool(raw.get("enabled", defaults["enabled"])),
            "mode": str(raw.get("mode", defaults["mode"])),
            "charge_enabled": bool(raw.get("charge_enabled", defaults["charge_enabled"])),
            "sell_power": self.safe_float(raw.get("sell_power", defaults["sell_power"]), 0),
            "minimum_sell_soc": self.safe_float(raw.get("minimum_sell_soc", defaults["minimum_sell_soc"]), 0),
            "battery_charge_enabled": bool(raw.get("battery_charge_enabled", defaults["battery_charge_enabled"])),
        }
        if row["mode"] not in SLOT_MODES:
            raise ValueError(f"Unsupported manual schedule mode in row {index + 1}: {row['mode']}")
        numeric_limits = {
            "sell_power": (0.0, float(self.effective_inverter_max_power_w)),
            "minimum_sell_soc": (0.0, 100.0),
        }
        for field_name, (minimum, maximum) in numeric_limits.items():
            value = float(row[field_name])
            if not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError(
                    f"{field_name} for manual schedule row {index + 1} must be between {minimum:g} and {maximum:g}"
                )
            row[field_name] = value
        if row["mode"] == MODE_SELLING_FIRST and row["sell_power"] > 0:
            self.validate_manual_sell_power_w(f"sell_power for manual schedule row {index + 1}", row["sell_power"])
        return row

    def _validate_manual_schedule_rows(self, rows: Any) -> list[dict[str, Any]]:
        if not isinstance(rows, list) or not rows:
            raise ValueError("Manual schedule must contain at least one row")
        normalized = [self._normalize_manual_row(row, index) for index, row in enumerate(rows)]
        first_start = self._manual_time_to_minutes(normalized[0]["from"], "First row start time")
        last_end = self._manual_time_to_minutes(normalized[-1]["to"], "Last row end time")
        if first_start != 0:
            raise ValueError("Manual schedule must start at 00:00")
        if last_end == 0:
            last_end = 24 * 60
        if last_end != 24 * 60:
            raise ValueError("Manual schedule must end at 00:00")
        previous_end: int | None = None
        for index, row in enumerate(normalized):
            start = self._manual_time_to_minutes(row["from"], f"Row {index + 1} start time")
            end = self._manual_time_to_minutes(row["to"], f"Row {index + 1} end time")
            if index == len(normalized) - 1 and end == 0:
                end = 24 * 60
            if index < len(normalized) - 1 and end == 24 * 60:
                raise ValueError("Only the last manual schedule row may end at 00:00")
            if end <= start:
                raise ValueError(f"Manual schedule row {index + 1} must be at least 1 minute long")
            if previous_end is not None and start != previous_end:
                if start < previous_end:
                    raise ValueError("Manual schedule rows must not overlap")
                raise ValueError("Manual schedule must cover the full 24 hours without gaps")
            previous_end = end
        if previous_end != 24 * 60:
            raise ValueError("Manual schedule must cover the full 24 hours without gaps")
        return normalized

    @staticmethod
    def _normalize_energy_status_display(raw: Any) -> dict[str, Any]:
        """Coerce stored or submitted Energy status display data into shape."""
        source = raw if isinstance(raw, dict) else {}
        mappings_in = source.get("mappings")
        visibility_in = source.get("visibility")
        mappings: dict[str, str] = {}
        visibility: dict[str, bool] = {}
        if isinstance(mappings_in, dict):
            for key, value in mappings_in.items():
                if key not in ENERGY_STATUS_ROLE_KEYS:
                    continue
                entity_id = str(value or "").strip()
                if entity_id:
                    mappings[str(key)] = entity_id
        if isinstance(visibility_in, dict):
            for key, value in visibility_in.items():
                if key not in ENERGY_STATUS_ROLE_KEYS:
                    continue
                visibility[str(key)] = bool(value)
        pv_enabled = source.get("pv_enabled")
        return {
            "schema_version": ENERGY_STATUS_DISPLAY_SCHEMA_VERSION,
            "pv_enabled": True if pv_enabled is None else bool(pv_enabled),
            "mappings": mappings,
            "visibility": visibility,
        }

    @staticmethod
    def _validate_energy_status_display_payload(payload: Any) -> dict[str, Any]:
        """Strictly validate a service submission, rejecting unknown roles."""
        if not isinstance(payload, dict):
            raise ValueError("Energy status display must be an object")
        unknown = set(payload) - {"schema_version", "mappings", "visibility", "pv_enabled"}
        if unknown:
            raise ValueError("Unsupported energy status fields: " + ", ".join(sorted(unknown)))
        normalized: dict[str, Any] = {}
        for field_name in ("mappings", "visibility"):
            value = payload.get(field_name)
            if value is not None and not isinstance(value, dict):
                raise ValueError(f"Energy status {field_name} must be an object")
            normalized[field_name] = value or {}
        for field_name, value in normalized.items():
            for key in value:
                if key not in ENERGY_STATUS_ROLE_KEYS:
                    raise ValueError(f"Unknown energy status sensor role: {key}")
        mappings: dict[str, str] = {}
        for key, value in normalized["mappings"].items():
            entity_id = str(value or "").strip()
            if not entity_id:
                continue
            domain, _, object_id = entity_id.partition(".")
            if not domain or not object_id:
                raise ValueError(f"Invalid entity id for {key}: {entity_id}")
            mappings[str(key)] = entity_id
        visibility = {
            str(key): bool(value)
            for key, value in normalized["visibility"].items()
        }
        pv_enabled = payload.get("pv_enabled")
        return {
            "schema_version": ENERGY_STATUS_DISPLAY_SCHEMA_VERSION,
            "pv_enabled": True if pv_enabled is None else bool(pv_enabled),
            "mappings": mappings,
            "visibility": visibility,
        }

    @property
    def pv_generation_enabled(self) -> bool:
        """Return whether PV generation is enabled for display and planning."""
        return bool(
            self._normalize_energy_status_display(self.energy_status_display).get(
                "pv_enabled", True
            )
        )

    def energy_status_display_state(self) -> dict[str, Any]:
        """Public view consumed by the card, including the role catalog."""
        return {
            **self._normalize_energy_status_display(self.energy_status_display),
            "roles": [
                {"key": key, "label": label, "group": group}
                for key, label, group in ENERGY_STATUS_ROLES
            ],
        }

    async def async_save_energy_status_display(self, payload: Any) -> dict[str, Any]:
        """Persist card Energy status mapping/visibility overrides."""
        self.energy_status_display = self._validate_energy_status_display_payload(payload)
        self.mark_config_saved()
        await self.async_save_ai_data()
        self.notify_update()
        return self.energy_status_display_state()

    @staticmethod
    def _inverter_config_float(value: Any) -> float | None:
        """Return a finite float without treating booleans as numbers."""
        if isinstance(value, bool):
            return None
        try:
            result = float(value)
        except (TypeError, ValueError):
            return None
        return result if math.isfinite(result) else None

    def _inverter_config_field_descriptor(
        self, field: Any, entity_id: str | None
    ) -> dict[str, Any]:
        """Describe one live inverter-configuration field for the card."""
        descriptor: dict[str, Any] = {
            "key": field.key,
            "label": field.label,
            "group": field.group,
            "entity_id": entity_id,
            "domain": None,
            "value": None,
            "display_value": "Not mapped",
            "writable": False,
            "min": None,
            "max": None,
            "step": None,
            "options": [],
            "unit": field.unit,
            "state": None,
            "read_only_reason": "Not mapped",
        }
        if field.kind == "static":
            descriptor["value"] = field.static_value
            descriptor["display_value"] = field.static_value or "Not mapped"
            descriptor["read_only_reason"] = (
                "" if field.static_value else "No entity mapping"
            )
            return descriptor
        if not entity_id:
            return descriptor
        domain, _, object_id = entity_id.partition(".")
        if not domain or not object_id:
            descriptor["read_only_reason"] = "Invalid entity mapping"
            return descriptor
        descriptor["domain"] = domain
        state = self.hass.states.get(entity_id)
        raw_state = None if state is None else str(state.state)
        descriptor["state"] = raw_state
        attributes = getattr(state, "attributes", {}) or {}
        unit = attributes.get("unit_of_measurement")
        if isinstance(unit, str) and unit.strip():
            descriptor["unit"] = unit
        unavailable = state is None or raw_state.lower() in {
            "",
            "unknown",
            "unavailable",
            "none",
        }
        if unavailable:
            descriptor["display_value"] = "Unavailable"
            descriptor["read_only_reason"] = "Entity unavailable"
            return descriptor
        if domain == "number":
            minimum = self._inverter_config_float(attributes.get("min"))
            maximum = self._inverter_config_float(attributes.get("max"))
            step = self._inverter_config_float(attributes.get("step"))
            value = self.state_float_or_none(entity_id)
            descriptor.update(
                {
                    "value": value,
                    "display_value": "Unavailable" if value is None else f"{value:g}",
                    "min": minimum,
                    "max": maximum,
                    "step": step,
                    "writable": bool(
                        field.writable
                        and minimum is not None
                        and maximum is not None
                        and step is not None
                        and step > 0
                    ),
                    "read_only_reason": (
                        ""
                        if minimum is not None
                        and maximum is not None
                        and step is not None
                        and step > 0
                        else "Live number range is unavailable"
                    ),
                }
            )
            return descriptor
        if domain == "select":
            options = attributes.get("options")
            options = [str(option) for option in options] if isinstance(options, (list, tuple)) else []
            descriptor.update(
                {
                    "value": raw_state,
                    "display_value": raw_state,
                    "options": options,
                    "writable": bool(field.writable and options),
                    "read_only_reason": "" if options else "Live select options are unavailable",
                }
            )
            return descriptor
        if domain == "switch":
            value = raw_state.lower() == "on"
            descriptor.update(
                {
                    "value": value,
                    "display_value": "On" if value else "Off",
                    "writable": bool(field.writable and raw_state.lower() in {"on", "off"}),
                    "read_only_reason": (
                        "" if raw_state.lower() in {"on", "off"} else "Unsupported switch state"
                    ),
                }
            )
            return descriptor
        descriptor.update(
            {
                "value": raw_state,
                "display_value": raw_state,
                "read_only_reason": "Read-only entity domain",
            }
        )
        return descriptor

    def _resolve_inverter_datetime_entity_id(self) -> str:
        """Return configured inverter datetime entity, falling back to the Deye default."""
        entity_id = str(self.data.get(CONF_INVERTER_DATETIME_ENTITY) or "").strip()
        return entity_id or entity_map.special_entity("inverter_datetime")

    @staticmethod
    def _parse_inverter_datetime(value: Any) -> datetime | None:
        """Parse inverter datetime text in the format written by sync."""
        if value is None:
            return None
        text = str(value).strip()
        if not text or text.lower() in {"unknown", "unavailable", "none"}:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                parsed = datetime.strptime(text, fmt)
                return parsed.replace(tzinfo=ha_now().tzinfo)
            except ValueError:
                continue
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=ha_now().tzinfo)
        return parsed.astimezone(ha_now().tzinfo)

    def read_inverter_datetime_status(self) -> dict[str, Any]:
        """Return inverter and HA server time comparison for the settings UI."""
        entity_id = self._resolve_inverter_datetime_entity_id()
        ha_time = ha_now().replace(microsecond=0)
        state = self.hass.states.get(entity_id) if entity_id else None
        raw_state = None if state is None else str(state.state)
        inverter_dt = self._parse_inverter_datetime(raw_state)
        ha_naive = ha_time.replace(tzinfo=None)
        deviation_seconds: float | None = None
        in_sync: bool | None = None
        if inverter_dt is not None:
            deviation_seconds = abs((inverter_dt.replace(tzinfo=None) - ha_naive).total_seconds())
            in_sync = deviation_seconds < 1
        available = state is not None and str(state.state).lower() not in {
            "unknown",
            "unavailable",
            "none",
            "",
        }
        return {
            "entity_id": entity_id,
            "ha_time": ha_time.strftime("%Y-%m-%d %H:%M:%S"),
            "inverter_time": (
                inverter_dt.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
                if inverter_dt is not None
                else (str(raw_state) if raw_state is not None else "Not mapped")
            ),
            "available": available,
            "in_sync": in_sync,
            "deviation_seconds": deviation_seconds,
            "last_check_at": (
                self._inverter_datetime_last_check.isoformat(timespec="seconds")
                if self._inverter_datetime_last_check
                else None
            ),
            "last_sync_at": (
                self._inverter_datetime_last_sync.isoformat(timespec="seconds")
                if self._inverter_datetime_last_sync
                else None
            ),
            "last_error": self._inverter_datetime_last_error or "",
        }

    async def async_sync_inverter_datetime(self, *, reason: str = "manual") -> dict[str, Any]:
        """Force-sync HA server time to the inverter datetime entity."""
        entity_id = self._resolve_inverter_datetime_entity_id()
        ha_time = ha_now().replace(microsecond=0)
        value = ha_time.strftime("%Y-%m-%d %H:%M:%S")
        if not entity_id:
            self._inverter_datetime_last_error = "Inverter datetime entity is not configured"
            self._notify_update_for("inverter_datetime_sync")
            return {
                "status": "failed",
                "error": self._inverter_datetime_last_error,
                "entity_id": "",
                "ha_time": value,
            }
        state = self.hass.states.get(entity_id)
        if state is None:
            self._inverter_datetime_last_error = f"Inverter datetime entity not found: {entity_id}"
            self._notify_update_for("inverter_datetime_sync")
            return {
                "status": "failed",
                "error": self._inverter_datetime_last_error,
                "entity_id": entity_id,
                "ha_time": value,
            }
        if str(state.state).lower() in {"unknown", "unavailable", "none", ""}:
            self._inverter_datetime_last_error = (
                f"Inverter datetime entity unavailable: {entity_id}"
            )
            self._notify_update_for("inverter_datetime_sync")
            return {
                "status": "failed",
                "error": self._inverter_datetime_last_error,
                "entity_id": entity_id,
                "ha_time": value,
            }
        try:
            await self.hass.services.async_call(
                "text",
                "set_value",
                {"entity_id": entity_id, "value": value},
                blocking=True,
            )
        except Exception as err:  # noqa: BLE001 - surface service failures
            self._inverter_datetime_last_error = str(err)
            self._notify_update_for("inverter_datetime_sync")
            return {
                "status": "failed",
                "error": self._inverter_datetime_last_error,
                "entity_id": entity_id,
                "ha_time": value,
            }
        self._inverter_datetime_last_sync = ha_time
        self._inverter_datetime_last_check = ha_time
        self._inverter_datetime_last_error = ""
        self._inverter_datetime_last_deviation_seconds = 0.0
        self.last_action = f"Inverter datetime synced ({reason})"
        self._notify_update_for("inverter_datetime_sync")
        return {
            "status": "ok",
            "error": "",
            "entity_id": entity_id,
            "ha_time": value,
            "synced_value": value,
            "reason": reason,
        }

    async def async_check_inverter_datetime_sync(self, *, force: bool = False) -> dict[str, Any]:
        """Check inverter datetime every 6 hours and sync on any deviation."""
        now = ha_now().replace(microsecond=0)
        last_check = self._inverter_datetime_last_check
        if (
            not force
            and last_check is not None
            and (now - last_check).total_seconds() < 6 * 3600
        ):
            return {"status": "skipped", "reason": "interval_not_elapsed"}
        status = self.read_inverter_datetime_status()
        self._inverter_datetime_last_check = now
        deviation = status.get("deviation_seconds")
        self._inverter_datetime_last_deviation_seconds = (
            float(deviation) if isinstance(deviation, (int, float)) else None
        )
        if not status.get("available"):
            self._inverter_datetime_last_error = status.get("inverter_time") or "Unavailable"
            return {"status": "unavailable", "datetime_status": status}
        if status.get("in_sync") is True:
            self._inverter_datetime_last_error = ""
            return {"status": "ok", "datetime_status": status}
        sync_result = await self.async_sync_inverter_datetime(reason="6h_drift_check")
        sync_result["datetime_status"] = self.read_inverter_datetime_status()
        return sync_result

    def read_inverter_configuration(self) -> dict[str, Any]:
        """Read every configured inverter field from live Home Assistant state."""
        groups = []
        for group_key, group_label in INVERTER_CONFIG_GROUPS:
            fields = []
            for field in fields_for_group(group_key):
                entity_id = resolve_inverter_config_entity_id(field, self.data)
                fields.append(self._inverter_config_field_descriptor(field, entity_id))
            groups.append(
                {
                    "key": group_key,
                    "label": group_label,
                    "writable": any(field["writable"] for field in fields),
                    "fields": fields,
                }
            )
        return {
            "groups": groups,
            "datetime_status": self.read_inverter_datetime_status(),
        }

    def _validate_inverter_config_write(
        self, field: Any, entity_id: str | None, raw_value: Any
    ) -> Any:
        """Validate one value against its live entity metadata before any write."""
        descriptor = self._inverter_config_field_descriptor(field, entity_id)
        if not descriptor["writable"]:
            reason = descriptor.get("read_only_reason") or "Field is read-only"
            raise ValueError(f"{field.label}: {reason}")
        domain = descriptor["domain"]
        if domain == "number":
            value = self._inverter_config_float(raw_value)
            if value is None:
                raise ValueError(f"{field.label} must be a finite number")
            minimum = descriptor["min"]
            maximum = descriptor["max"]
            step = descriptor["step"]
            if value < minimum or value > maximum:
                raise ValueError(
                    f"{field.label} must be between {minimum:g} and {maximum:g}"
                )
            steps = (value - minimum) / step
            if not math.isclose(steps, round(steps), abs_tol=1e-6):
                raise ValueError(f"{field.label} must follow step {step:g}")
            return value
        if domain == "select":
            option = str(raw_value)
            if option not in descriptor["options"]:
                raise ValueError(f"Unsupported option for {field.label}: {option}")
            return option
        if domain == "switch":
            if not isinstance(raw_value, bool):
                raise ValueError(f"{field.label} must be true or false")
            return raw_value
        raise ValueError(f"{field.label} is not writable")

    async def async_apply_inverter_configuration_group(
        self, group: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        """Apply one validated inverter-configuration group, stopping on failure."""
        if group not in INVERTER_CONFIG_GROUP_KEYS:
            raise ValueError(f"Unknown inverter configuration group: {group}")
        if not isinstance(values, dict) or not values:
            raise ValueError("Inverter configuration values must be a non-empty object")
        known = {field.key for field in fields_for_group(group)}
        unknown = sorted(str(key) for key in values if key not in known)
        if unknown:
            raise ValueError(
                f"Fields do not belong to group {group}: {', '.join(unknown)}"
            )
        plans: list[tuple[Any, str, Any]] = []
        for field in fields_for_group(group):
            if field.key not in values:
                continue
            entity_id = resolve_inverter_config_entity_id(field, self.data)
            normalized = self._validate_inverter_config_write(
                field, entity_id, values[field.key]
            )
            plans.append((field, str(entity_id), normalized))
        if not plans:
            raise ValueError("No writable inverter configuration fields were supplied")
        results: list[dict[str, Any]] = []
        async with self._operation_lock:
            async with self._control_operation("apply_inverter_configuration_group"):
                for field, entity_id, value in plans:
                    try:
                        domain = entity_id.split(".", 1)[0]
                        if domain == "number":
                            await self.async_set_number(entity_id, value)
                        elif domain == "select":
                            await self.async_set_select(entity_id, value)
                        elif domain == "switch":
                            await self.async_set_switch(entity_id, value)
                        else:
                            raise ValueError(f"Unsupported domain: {domain}")
                    except Exception as err:
                        results.append(
                            {
                                "key": field.key,
                                "entity_id": entity_id,
                                "value": value,
                                "status": "failed",
                                "error": str(err),
                            }
                        )
                        self.last_error = f"{field.label}: {err}"
                        self.notify_update()
                        return {
                            "group": group,
                            "status": "failed",
                            "results": results,
                            "error": f"{field.label}: {err}",
                        }
                    results.append(
                        {
                            "key": field.key,
                            "entity_id": entity_id,
                            "value": value,
                            "status": "ok",
                        }
                    )
        self.last_error = ""
        self.last_action = "Inverter configuration group applied"
        self.notify_update()
        return {"group": group, "status": "ok", "results": results, "error": ""}

    def manual_schedule_state(self) -> dict[str, Any]:
        manual = self._ensure_manual_schedule()
        rows = []
        for row in manual.get("rows", []):
            if isinstance(row, dict):
                try:
                    rows.append(self._normalize_manual_row(row, len(rows)))
                except Exception:
                    continue
        valid = False
        validation_error = ""
        try:
            if rows:
                rows = self._validate_manual_schedule_rows(rows)
            valid = bool(rows)
        except Exception as err:
            validation_error = str(err)
            valid = False
        return {
            "schema_version": int(manual.get("schema_version", 1)),
            "active": bool(manual.get("active")),
            "rows": rows,
            "has_activation_snapshot": isinstance(manual.get("activation_snapshot"), dict),
            "valid": valid,
            "validation_error": validation_error,
        }

    def _manual_schedule_activation_snapshot(self) -> dict[str, Any]:
        """Legacy snapshot shape kept for stored-state compatibility.

        Manual Schedule is an independent trigger source and the other source
        is always selected on deactivation, so the saved scheduler flag is no
        longer restored.  Existing snapshots remain valid and load normally.
        """
        return {
            "schema_version": 2,
            "saved_at": ha_now().isoformat(timespec="seconds"),
            "scheduler_enabled": bool(self.scheduler_enabled),
        }

    def _manual_row_for_slot_start(self, rows: list[dict[str, Any]], slot_start_minute: int) -> dict[str, Any]:
        minute = int(slot_start_minute) % (24 * 60)
        for index, row in enumerate(rows):
            start = self._manual_time_to_minutes(row["from"], f"Row {index + 1} start time")
            end = self._manual_time_to_minutes(row["to"], f"Row {index + 1} end time")
            end_cmp = 24 * 60 if index == len(rows) - 1 and end == 0 else end
            if start <= minute < end_cmp:
                return row
        raise ValueError(f"Manual schedule does not cover slot starting at {self._minutes_to_hhmm(minute)}")

    def _manual_schedule_to_slot_updates(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        updates: list[dict[str, Any]] = []
        for slot_key, _label, start, _end in SLOTS:
            row = self._manual_row_for_slot_start(rows, int(start))
            # Only the fields still present on a manual row are written.  The
            # physical Deye mode, discharge/charge currents and sell-from price
            # stay at their work-schedule values.
            update = {
                "slot_key": slot_key,
                "enabled": bool(row.get("enabled", True)),
                "mode": str(row.get("mode", MODE_NORMAL_OPERATION)),
                "sell_power": float(row.get("sell_power", 0)),
                "charge_enabled": bool(row.get("charge_enabled", False)),
                "minimum_sell_soc": float(row.get("minimum_sell_soc", 0)),
            }
            updates.append(update)
        return updates

    def _manual_schedule_effective_rows(
        self, rows: list[dict[str, Any]]
    ) -> dict[str, dict[str, Any]]:
        """Build the per-slot manual overlay without touching the work slots."""
        return {
            str(update["slot_key"]): {
                field: value for field, value in update.items() if field != "slot_key"
            }
            for update in self._manual_schedule_to_slot_updates(rows)
        }

    def _rebuild_manual_effective_rows(
        self, rows: list[dict[str, Any]] | None = None
    ) -> dict[str, dict[str, Any]]:
        """Validate manual rows and refresh the cached scheduler overlay."""
        source = rows if rows is not None else self._ensure_manual_schedule().get("rows", [])
        validated = self._validate_manual_schedule_rows(source)
        self._manual_effective_rows = self._manual_schedule_effective_rows(validated)
        return self._manual_effective_rows

    def _effective_slots_for_rows(
        self, rows: list[dict[str, Any]]
    ) -> dict[str, SlotSettings]:
        """Build effective slots for a candidate row set (TOU preflight)."""
        overlay = self._manual_schedule_effective_rows(
            self._validate_manual_schedule_rows(rows)
        )
        return {
            key: replace(self.slots[key], **fields)
            for key, fields in overlay.items()
        }

    def _validate_manual_tou_range_count(
        self, rows: list[dict[str, Any]]
    ) -> None:
        """Reject manual rows that cannot fit the inverter's six TOU ranges."""
        mapping = self.schedule_to_tou_mapping(self._effective_slots_for_rows(rows))
        if len(mapping) > 6:
            raise ValueError(
                f"Manual schedule requires {len(mapping)} Deye Time Of Use ranges; "
                "Deye supports at most 6"
            )

    def _request_manual_schedule_reconciliation(self) -> None:
        """Apply the newly selected trigger source immediately when possible."""
        if self._control_is_active() and not self.emergency_stop:
            self._schedule_schedule_reconciliation()

    def _manual_schedule_row_for_minute(self, rows: list[dict[str, Any]], minute: int) -> dict[str, Any] | None:
        minute = int(minute) % (24 * 60)
        for index, row in enumerate(rows):
            try:
                start = self._manual_time_to_minutes(row.get("from"), f"Row {index + 1} start time")
                end = self._manual_time_to_minutes(row.get("to"), f"Row {index + 1} end time")
            except Exception:
                continue
            end_cmp = 24 * 60 if index == len(rows) - 1 and end == 0 else end
            if start <= minute < end_cmp:
                return row
        return None

    async def _async_enforce_manual_schedule_battery_charge(self, now: datetime | None = None) -> None:
        """Apply the active manual schedule row's Battery charge switch."""
        if not self.manual_schedule_active:
            return
        manual = self._ensure_manual_schedule()
        try:
            rows = self._validate_manual_schedule_rows(manual.get("rows", []))
        except Exception:
            return
        current = now or ha_now()
        minute = int(current.hour) * 60 + int(current.minute)
        row = self._manual_schedule_row_for_minute(rows, minute)
        if row is None:
            return
        desired = bool(row.get("battery_charge_enabled", False))
        entity_id = entity_map.special_entity("grid_charge_enable")
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable"):
            return
        current_on = str(state.state).lower() == "on"
        if current_on == desired:
            return
        domain, service = ("switch", "turn_on" if desired else "turn_off")
        timestamp = ha_now().isoformat(timespec="seconds")
        try:
            await self.hass.services.async_call(
                domain,
                service,
                {"entity_id": entity_id},
                blocking=True,
            )
            await self._async_append_trigger_log(
                timestamp=timestamp,
                entity_id=entity_id,
                domain=domain,
                service=service,
                value=desired,
                success=True,
                error="Manual schedule battery charge",
            )
            self._notify_update_for("manual_schedule_battery_charge")
        except Exception as err:  # noqa: BLE001 - schedule enforcement must not break tick
            await self._async_append_trigger_log(
                timestamp=timestamp,
                entity_id=entity_id,
                domain=domain,
                service=service,
                value=desired,
                success=False,
                error=f"Manual schedule battery charge: {err}",
            )
            _LOGGER.warning(
                "Manual schedule failed to set %s to %s: %s",
                entity_id,
                desired,
                err,
            )

    def _load_manual_schedule_state(self, raw: Any) -> dict[str, Any]:
        state = self._default_manual_schedule()
        if not isinstance(raw, dict):
            return state
        state["schema_version"] = int(self.safe_float(raw.get("schema_version"), 1))
        state["active"] = bool(raw.get("active", False))
        rows = raw.get("rows")
        if isinstance(rows, list):
            normalized_rows: list[dict[str, Any]] = []
            for index, row in enumerate(rows):
                if not isinstance(row, dict):
                    continue
                try:
                    normalized_rows.append(self._normalize_manual_row(row, len(normalized_rows)))
                except Exception:
                    continue
            state["rows"] = normalized_rows
        snapshot = raw.get("activation_snapshot")
        if isinstance(snapshot, dict):
            state["activation_snapshot"] = deepcopy(snapshot)
        if state["active"] and not isinstance(state.get("activation_snapshot"), dict):
            state["active"] = False
        return state

    async def async_init_manual_schedule_from_tou(self) -> dict[str, Any]:
        """Initialize manual schedule rows from the current inverter 6-row TOU map."""
        try:
            mapping = self.read_physical_tou_mapping()
        except Exception:
            mapping = self._manual_tou_mapping
        if mapping is None or len(getattr(mapping, "slots", [])) != 6:
            raise ValueError("Cannot read the inverter 6-row Time Of Use mapping")
        defaults = self._manual_row_defaults()
        rows: list[dict[str, Any]] = []
        ordered = sorted(mapping.slots, key=lambda item: int(item.index))
        for idx, slot in enumerate(ordered):
            start = int(slot.start) % (24 * 60)
            end = int(slot.end) % (24 * 60)
            if idx == len(ordered) - 1 and end == 0:
                end = 24 * 60
            rows.append({
                **defaults,
                "from": self._minutes_to_hhmm(start),
                "to": self._minutes_to_hhmm(end),
                "charge_enabled": bool(slot.grid_charge),
            })
        manual = self._ensure_manual_schedule()
        previous_rows = deepcopy(manual.get("rows", []))
        validated_rows = self._validate_manual_schedule_rows(rows)
        manual["rows"] = validated_rows
        try:
            if manual.get("active"):
                self._validate_manual_tou_range_count(validated_rows)
                self._rebuild_manual_effective_rows(validated_rows)
                self.scheduler_enabled = True
                self._request_manual_schedule_reconciliation()
                await self._async_enforce_manual_schedule_battery_charge()
        except Exception:
            manual["rows"] = previous_rows
            try:
                self._rebuild_manual_effective_rows(previous_rows)
            except Exception:
                self._manual_effective_rows = {}
            self.mark_config_saved()
            await self.async_save_ai_data()
            self.notify_update()
            raise
        self.mark_config_saved()
        await self.async_save_ai_data()
        self.notify_update()
        return self.manual_schedule_state()

    async def async_save_manual_schedule(self, rows: Any) -> dict[str, Any]:
        manual = self._ensure_manual_schedule()
        previous_rows = deepcopy(manual.get("rows", []))
        validated_rows = self._validate_manual_schedule_rows(rows)
        manual["rows"] = validated_rows
        try:
            if manual.get("active"):
                self._validate_manual_tou_range_count(validated_rows)
                self._rebuild_manual_effective_rows(validated_rows)
                self.scheduler_enabled = True
                self._request_manual_schedule_reconciliation()
                await self._async_enforce_manual_schedule_battery_charge()
        except Exception:
            manual["rows"] = previous_rows
            try:
                self._rebuild_manual_effective_rows(previous_rows)
            except Exception:
                self._manual_effective_rows = {}
            self.mark_config_saved()
            await self.async_save_ai_data()
            self.notify_update()
            raise
        self.mark_config_saved()
        await self.async_save_ai_data()
        self.notify_update()
        return self.manual_schedule_state()

    async def async_activate_manual_schedule(self) -> dict[str, Any]:
        manual = self._ensure_manual_schedule()
        rows = self._validate_manual_schedule_rows(manual.get("rows", []))
        self._validate_manual_tou_range_count(rows)
        previous_active = bool(manual.get("active"))
        previous_snapshot = deepcopy(manual.get("activation_snapshot"))
        previous_overlay = deepcopy(self._manual_effective_rows)
        previous_scheduler = self.scheduler_enabled
        try:
            if not previous_active:
                manual["activation_snapshot"] = self._manual_schedule_activation_snapshot()
            manual["active"] = True
            self._rebuild_manual_effective_rows(rows)
            self.scheduler_enabled = True
            self.mark_config_saved()
            await self.async_save_ai_data()
            self._request_manual_schedule_reconciliation()
            await self._async_enforce_manual_schedule_battery_charge()
        except Exception:
            manual["active"] = previous_active
            manual["activation_snapshot"] = previous_snapshot
            self._manual_effective_rows = previous_overlay
            self.scheduler_enabled = previous_scheduler
            self.mark_config_saved()
            await self.async_save_ai_data()
            self.notify_update()
            raise
        self.notify_update()
        return self.manual_schedule_state()

    async def async_deactivate_manual_schedule(self) -> dict[str, Any]:
        manual = self._ensure_manual_schedule()
        if not manual.get("active"):
            manual["active"] = False
            manual["activation_snapshot"] = None
            self._manual_effective_rows = {}
            self.scheduler_enabled = True
            self.mark_config_saved()
            await self.async_save_ai_data()
            self._request_manual_schedule_reconciliation()
            self.notify_update()
            return self.manual_schedule_state()
        manual["active"] = False
        manual["activation_snapshot"] = None
        self._manual_effective_rows = {}
        self.scheduler_enabled = True
        self.mark_config_saved()
        await self.async_save_ai_data()
        self._request_manual_schedule_reconciliation()
        self.notify_update()
        return self.manual_schedule_state()

    def _ensure_manual_schedule_allows_apply(self) -> None:
        if self.manual_schedule_active:
            raise ValueError(
                "Manual schedule is active. Deactivate it before editing the work schedule."
            )


    async def async_apply_schedule_patch(
        self,
        updates: list[dict[str, Any]],
    ) -> None:
        """Validate and save a list-based logical slot patch, then reconcile."""
        if not isinstance(updates, list) or not updates:
            raise ValueError("Schedule patch must contain at least one slot")
        updates = self._expand_slot_updates(updates)

        numeric_limits = {
            "sell_power": (0.0, float(self.effective_inverter_max_power_w)),
            "minimum_sell_soc": (0.0, 100.0),
            "tou_soc": (0.0, 100.0),
            "min_sell_price": (0.0, 5.0),
        }
        allowed_fields = {
            "enabled",
            "mode",
            "physical_work_mode",
            "charge_enabled",
            "force_copy_normal_profile",
            "force_copy_charge_profile",
            *numeric_limits,
        }

        async with self._operation_lock:
            self._ensure_manual_schedule_allows_apply()
            previous_schedule_revision = self.schedule_revision
            previous_slot_revisions = deepcopy(self.schedule_slot_revisions)
            previous_slot_ownership = deepcopy(self.schedule_slot_ownership)
            changed_keys = [
                str(update.get("slot_key") or "")
                for update in updates
                if isinstance(update, dict)
            ]
            previous_slots = {key: replace(slot) for key, slot in self.slots.items()}
            previous_scheduler = self.scheduler_enabled
            try:
                for update in updates:
                    update = dict(update) if isinstance(update, dict) else update
                    if not isinstance(update, dict):
                        raise ValueError("Each schedule update must be an object")
                    slot_key = str(update.get("slot_key") or "")
                    if slot_key not in self.slots:
                        raise ValueError(f"Unknown schedule slot: {slot_key}")
                    if "min_soc" in update:
                        update.setdefault("minimum_sell_soc", update.pop("min_soc"))
                    unknown = set(update) - allowed_fields - {"slot_key"}
                    if unknown:
                        raise ValueError(f"Unsupported schedule fields: {', '.join(sorted(unknown))}")
                    slot = self.slots[slot_key]
                    if "enabled" in update:
                        slot.enabled = bool(update["enabled"])
                    previous_mode = slot.mode
                    force_copy = bool(update.get("force_copy_normal_profile"))
                    force_copy_charge = bool(update.get("force_copy_charge_profile"))
                    if "mode" in update:
                        mode = str(update["mode"])
                        if mode not in SLOT_MODES:
                            raise ValueError(f"Unsupported slot mode: {mode}")
                        slot.mode = mode
                        if mode == MODE_NORMAL_OPERATION and (previous_mode != MODE_NORMAL_OPERATION or force_copy):
                            slot.enabled = True
                            if self.normal_profile_physical_work_mode in PHYSICAL_NORMAL_MODES:
                                slot.physical_work_mode = self.normal_profile_physical_work_mode
                            if self.normal_profile_sell_power >= 0:
                                slot.sell_power = self.normal_profile_sell_power
                            if self.normal_profile_tou_soc is not None and self.normal_profile_tou_soc >= 0:
                                slot.tou_soc = self.normal_profile_tou_soc
                        elif mode == MODE_CHARGE:
                            slot.enabled = True
                            if previous_mode != MODE_CHARGE or force_copy_charge:
                                slot.tou_soc = self.charge_profile_target_soc
                                slot.charge_enabled = self.charge_profile_grid_enabled
                        elif previous_mode == MODE_NORMAL_OPERATION:
                            slot.physical_work_mode = None
                    if "physical_work_mode" in update:
                        physical_mode = str(update["physical_work_mode"] or "")
                        if slot.mode != MODE_NORMAL_OPERATION:
                            raise ValueError(
                                "physical_work_mode is only allowed for Normal Operation"
                            )
                        if physical_mode not in PHYSICAL_NORMAL_MODES:
                            raise ValueError(
                                f"Unsupported physical work mode: {physical_mode}"
                            )
                        slot.physical_work_mode = physical_mode
                    if "charge_enabled" in update:
                        slot.charge_enabled = bool(update["charge_enabled"])
                    for field_name, (minimum, maximum) in numeric_limits.items():
                        if field_name not in update:
                            continue
                        value = float(update[field_name])
                        if not math.isfinite(value) or not minimum <= value <= maximum:
                            raise ValueError(
                                f"{field_name} for {slot_key} must be between {minimum:g} and {maximum:g}"
                            )
                        if field_name == "sell_power":
                            self.validate_manual_sell_power_w(
                                f"sell_power for {slot_key}", value
                            )
                        setattr(slot, field_name, value)

                if any(slot.enabled for slot in self.slots.values()):
                    self.scheduler_enabled = True
                logical_changed = (
                    self.scheduler_enabled != previous_scheduler
                    or any(
                        self.slots[key] != previous_slots[key] for key in self.slots
                    )
                )
                if not logical_changed:
                    self._claim_schedule_slots(changed_keys, "manual")
                    self.last_action = "The schedule already matches — nothing to save"
                    self.mark_config_saved()
                    self.notify_update()
                    return
                self._clear_pending_control_transaction()
                self._last_slot_failure_signature = ""
                if self.mapping_error:
                    raise ValueError(
                        f"Mapping requires {len(self._tou_mapping)} ranges; "
                        "Deye supports at most 6"
                    )
                self._claim_schedule_slots(changed_keys, "manual")
                self.mark_config_saved()
                if self._control_is_active() and not self.emergency_stop:
                    self._schedule_schedule_reconciliation()
                else:
                    self._schedule_reconcile_requested = False
                    blocked_reason = (
                        "an emergency stop is active"
                        if self.emergency_stop
                        else "Deye control is disabled"
                    )
                    self.last_action = (
                        f"Changes saved in the Schedule. {blocked_reason} — "
                        "they were not sent to the inverter."
                    )
                    self.executed_manager_action = f"Not performed — {blocked_reason.lower()}"
                    self.notify_update()
            except Exception:
                self.slots = previous_slots
                self.scheduler_enabled = previous_scheduler
                self.schedule_revision = previous_schedule_revision
                self.schedule_slot_revisions = previous_slot_revisions
                self.schedule_slot_ownership = previous_slot_ownership
                self.notify_update()
                raise

    def _schedule_schedule_reconciliation(self) -> None:
        """Coalesce schedule edits and apply their physical effects asynchronously."""
        if not self._control_is_active():
            self._schedule_reconcile_requested = False
            return
        self._schedule_reconcile_requested = True
        task = self._schedule_reconcile_task
        if task is not None and not task.done():
            return
        self._schedule_reconcile_task = self.hass.async_create_task(
            self._async_reconcile_schedule_changes()
        )

    async def _async_reconcile_schedule_changes(self) -> None:
        """Apply the newest saved schedule without blocking the UI service call."""
        try:
            await asyncio.sleep(0.25)
            while self._schedule_reconcile_requested:
                self._schedule_reconcile_requested = False
                async with self._operation_lock:
                    try:
                        await self._async_tick_impl()
                    except asyncio.CancelledError:
                        raise
                    except ControlDisabledError as err:
                        self.last_action = str(err)
                        self.executed_manager_action = "Not performed — control disabled"
                        self.notify_update()
                        return
                    except Exception as err:
                        await self.async_apply_safe_defaults(
                            "Failed to synchronise the saved schedule: "
                            f"{type(err).__name__}: {err}"
                        )
                if self._schedule_reconcile_requested:
                    await asyncio.sleep(0.25)
        finally:
            self._schedule_reconcile_task = None

    def _control_entities_to_write(
        self, mode: str
    ) -> tuple[dict[str, tuple[str, str]], list[str]]:
        """Return a snapshot of control entities that will be changed.

        The snapshot maps entity_id to (label, raw_state). Missing or unreadable
        entities are reported separately so the caller can abort before the
        first write.
        """
        profile = provider_profile(self.data)
        entities: list[tuple[str | None, str]] = [
            (self.work_mode_select, "System Work Mode"),
            (self.max_sell_power_number, "Max Sell Power"),
        ]
        if profile.needs_aux_export_switch:
            entities.append((self.work_mode_aux_entity, "Solar Export"))
        snapshot: dict[str, tuple[str, str]] = {}
        missing: list[str] = []
        for entity_id, label in entities:
            if not entity_id:
                missing.append(label)
                continue
            state = self.hass.states.get(entity_id)
            if state is None or state.state in ("unknown", "unavailable", "none", ""):
                missing.append(label)
                continue
            domain = entity_id.split(".", 1)[0]
            if domain == "number":
                try:
                    value = float(state.state)
                    if not math.isfinite(value):
                        missing.append(label)
                        continue
                except (TypeError, ValueError):
                    missing.append(label)
                    continue
            elif domain == "switch":
                if state.state not in ("on", "off"):
                    missing.append(label)
                    continue
            snapshot[entity_id] = (label, str(state.state))
        return snapshot, missing

    def _logical_mode_from_raw(self, raw_mode: str) -> str | None:
        """Map a provider-specific raw mode option back to a logical work mode."""
        if logical_mode_matches(self.data, MODE_SELLING_FIRST, raw_mode):
            return MODE_SELLING_FIRST
        for physical_mode in PHYSICAL_NORMAL_MODES:
            if logical_mode_matches(
                self.data,
                MODE_NORMAL_OPERATION,
                raw_mode,
                physical_mode,
            ):
                return MODE_NORMAL_OPERATION
        return None

    def _physical_mode_from_raw(self, raw_mode: str) -> str | None:
        for physical_mode in PHYSICAL_NORMAL_MODES:
            if logical_mode_matches(
                self.data,
                MODE_NORMAL_OPERATION,
                raw_mode,
                physical_mode,
            ):
                return physical_mode
        return None

    async def _async_restore_work_mode_and_aux(self, snapshot: dict[str, tuple[str, str]]) -> None:
        """Restore work mode and optional aux switch using provider-safe order."""
        mode_entity = self.work_mode_select
        if not mode_entity:
            raise ValueError("Missing work mode entity")
        raw_mode = snapshot[mode_entity][1]
        profile = provider_profile(self.data)
        aux_entity = self.work_mode_aux_entity if profile.needs_aux_export_switch else None
        is_selling = logical_mode_matches(self.data, MODE_SELLING_FIRST, raw_mode)
        if is_selling and aux_entity:
            # Prepare aux before entering selling mode.
            await self._async_restore_raw_entity(aux_entity, "on")
        await self._async_restore_raw_entity(mode_entity, raw_mode)
        if not is_selling and aux_entity:
            await self._async_restore_raw_entity(aux_entity, "off")

    async def _async_rollback_control_values(
        self, snapshot: dict[str, tuple[str, str]]
    ) -> tuple[bool, str]:
        """Restore control entities from snapshot and confirm the readback.

        Returns ``(True, "")`` when every entity was restored and the readback
        matches the snapshot within the bounded confirmation window.  Otherwise
        returns ``(False, reason)`` so the caller can report the failing entity.
        """
        self._performance.inc("inverter_rollback")
        numbers: dict[str, tuple[str, float]] = {}
        mode_raw: str | None = None
        for entity_id, (label, raw_value) in snapshot.items():
            domain = entity_id.split(".", 1)[0]
            if domain == "number":
                try:
                    numbers[entity_id] = (label, float(raw_value))
                except (TypeError, ValueError):
                    return False, f"{label}: invalid snapshot value"
            elif entity_id == self.work_mode_select:
                mode_raw = raw_value

        if mode_raw is None:
            return False, "System Work Mode: missing w snapshotcie"

        try:
            # Restore numbers first, then work mode with aux as one unit.
            for entity_id, (label, value) in numbers.items():
                await self._async_restore_raw_entity(entity_id, str(value))
            await self._async_restore_work_mode_and_aux(snapshot)
        except Exception as exc:
            return False, f"{label}: {exc}"

        logical_mode = self._logical_mode_from_raw(mode_raw)
        if logical_mode is None:
            return False, "System Work Mode: unknown mode after rollback"
        rollback_physical_mode = self._physical_mode_from_raw(mode_raw)
        expected = {
            "System Work Mode": logical_mode,
            "Max Sell Power": numbers.get(self.max_sell_power_number, ("", 0.0))[1],
        }
        deadline = asyncio.get_running_loop().time() + self.control_confirmation_timeout
        while True:
            unconfirmed = await self.async_verify_control_values(
                expected["System Work Mode"],
                expected["Max Sell Power"],
                rollback_physical_mode or self._active_physical_work_mode(),
            )
            if not unconfirmed:
                return True, ""
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                return False, f"niepotwierdzony rollback: {', '.join(unconfirmed)}"
            await asyncio.sleep(min(0.5, remaining))

    async def _async_wait_for_control_confirmation(
        self,
        mode: str,
        sell_power: float,
    ) -> bool:
        """Wait for Deye to publish the requested control values.

        Returns True when confirmed, False on timeout or when emergency_stop
        is set. Uses a monotonic clock.
        """
        deadline = asyncio.get_running_loop().time() + self.control_confirmation_timeout
        while True:
            if self.emergency_stop:
                return False
            if not self._control_is_active():
                return False
            unconfirmed = await self.async_verify_control_values(
                mode, sell_power, self._active_physical_work_mode()
            )
            if not unconfirmed:
                return True
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                return False
            await asyncio.sleep(min(0.5, remaining))

    async def _async_rollback_with_shield(
        self, snapshot: dict[str, tuple[str, str]]
    ) -> None:
        """Attempt rollback during cancellation without blocking unload.

        The rollback itself may use ``control_confirmation_timeout`` to wait for
        readback confirmation. The 5-second limit here is only the outer safety
        cap for the cleanup phase; the rollback task is explicitly tracked and
        cancelled/awaited so it can never outlive the manager.
        """
        if self._rollback_task is not None and not self._rollback_task.done():
            self._rollback_task.cancel()
            try:
                await self._rollback_task
            except asyncio.CancelledError:
                pass
        self._rollback_task = asyncio.get_running_loop().create_task(
            self._async_rollback_control_values(snapshot)
        )
        try:
            await asyncio.wait_for(
                asyncio.shield(self._rollback_task),
                timeout=5.0,
            )
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        except Exception:
            pass
        finally:
            if not self._rollback_task.done():
                self._rollback_task.cancel()
            if not self._rollback_task.done():
                try:
                    await self._rollback_task
                except asyncio.CancelledError:
                    pass
            # Swallow any stored exception; the cancellation path only needs to
            # ensure the task is not left running.
            elif self._rollback_task.exception() is not None:
                pass
            self._rollback_task = None

    async def async_apply_settings(
        self,
        mode: str,
        sell_power: float,
    ) -> None:
        """Apply direct inverter settings using a safe, serialized write order."""
        if self._inverter_link_gated:
            self.last_action = "Not performed — inverter unavailable"
            self.executed_manager_action = "Not performed — inverter unavailable"
            self.notify_update()
            raise ControlDisabledError(
                "Deye inverter is unavailable; physical writes are blocked."
            )
        self.validate_manual_sell_power_w("Sell power", sell_power)
        physical_sell_power = self.normalize_automatic_sell_power_w(sell_power)
        async with self._operation_lock:
            async with self._control_operation("apply_settings") as transaction_id:
                if self.emergency_stop:
                    raise RuntimeError("Interrupted by emergency stop")
                if mode == MODE_SELLING_FIRST and not self.sell_allowed:
                    if self.emergency_stop:
                        raise RuntimeError("Interrupted by emergency stop")
                    await self.async_apply_safe_defaults("Selling blocked by SOC or price protection")
                    raise ValueError(self.decision_reason)
                try:
                    self._validate_control_plan(
                        mode,
                        sell_power,
                    )
                except Exception as err:
                    if self.emergency_stop:
                        raise RuntimeError("Interrupted by emergency stop") from err
                    await self.async_apply_safe_defaults(f"Invalid settings plan: {err}")
                    raise
                snapshot, missing = self._control_entities_to_write(mode)
                if missing:
                    raise RuntimeError(f"No readable entities for the snapshot: {', '.join(missing)}")
                raw_snapshot = {
                    entity_id: raw_value
                    for entity_id, (_label, raw_value) in snapshot.items()
                }
                self._set_control_transaction_snapshot(transaction_id, raw_snapshot)
                try:
                    applied_sell_power_native = await self.async_set_max_sell_power_number(physical_sell_power)
                    await self.async_set_work_mode(mode)
                    confirmed = await self._async_wait_for_control_confirmation(
                        mode,
                        applied_sell_power_native,
                    )
                    if not confirmed:
                        if self.emergency_stop:
                            raise RuntimeError("Interrupted by emergency stop")
                        if not self._control_is_active():
                            raise ControlDisabledError(self._control_block_message())
                        raise RuntimeError("Unconfirmed settings after the wait time")
                except ControlDisabledError:
                    with self._control_rollback_scope(transaction_id, raw_snapshot):
                        await self._async_rollback_control_values(snapshot)
                    raise
                except asyncio.CancelledError:
                    with self._control_rollback_scope(transaction_id, raw_snapshot):
                        await self._async_rollback_with_shield(snapshot)
                    raise
                except Exception as err:
                    if self.emergency_stop:
                        raise RuntimeError("Interrupted by emergency stop") from err
                    with self._control_rollback_scope(transaction_id, raw_snapshot):
                        rollback_ok, rollback_reason = await self._async_rollback_control_values(snapshot)
                    if rollback_ok:
                        self.last_action = "Changes rolled back after an apply_settings error"
                        self.last_error = str(err)
                    else:
                        await self.async_apply_safe_defaults(
                            f"Direct settings write error: {err}. Rollback: {rollback_reason}"
                        )
                    raise
                if self._control_result_is_current(transaction_id):
                    self.last_action = "Direct settings applied"
                    self.last_error = ""
                    self.executed_manager_action = "Performed: direct settings"

    def _slot_failure_fingerprint(self, reason: str) -> str:
        """Return a stable signature of an active-slot fault.

        This prevents the minute timer from restoring the same defaults over
        and over.  It changes when the slot, schedule, relevant source state
        or TOU mapping availability changes.
        """
        slot = self.active_slot
        control_entities = [
            self.work_mode_select,
            self.max_sell_power_number,
            *self.tou_mapping_errors(),
        ]
        # Control values are deliberately represented only by availability:
        # applying defaults changes their values and must not defeat the
        # failure latch on the next minute tick.
        availability = [
            f"{entity_id}:{self.entity_available(entity_id)}" for entity_id in control_entities if entity_id
        ]
        sensor_states = [
            f"{entity_id}:{self.state_text(entity_id)}"
            for entity_id in (
                self.battery_soc_sensor if slot.mode == MODE_SELLING_FIRST else None,
                self.price_sensor if slot.mode == MODE_SELLING_FIRST and slot.min_sell_price > 0 else None,
            )
            if entity_id
        ]
        soc_quality = (
            str(self.soc_diagnostics().get("status") or "unknown")
            if slot.mode == MODE_SELLING_FIRST
            else "not_required"
        )
        slot_data = (
            slot.key, slot.enabled, slot.mode, slot.sell_power,
            slot.minimum_sell_soc, slot.tou_soc, slot.min_sell_price,
            slot.charge_enabled,
        )
        return repr((
            self.control_mode,
            slot_data,
            tuple(availability),
            tuple(sensor_states),
            soc_quality,
            self.mapping_error,
        ))

    def _clear_slot_failure_latch(self) -> None:
        self._last_slot_failure_signature = ""

    async def _async_handle_slot_failure(
        self, reason: str, stage: str, expected: dict[str, Any]
    ) -> bool:
        self._clear_pending_control_transaction()
        signature = self._slot_failure_fingerprint(stage)
        if signature == self._last_slot_failure_signature:
            message = f"{reason}. Default settings were already applied for the same error."
            self.record_schedule_attempt("failed", stage, expected, message)
            self.last_error = message
            self.notify_update()
            return False
        self._last_slot_failure_signature = signature
        self.record_schedule_attempt("failed", stage, expected, reason)
        await self.async_apply_safe_defaults(reason)
        return False

    def _report_tou_preflight_failure(self) -> bool:
        """Report an oversized TOU map without touching the inverter."""
        required = len(self._tou_mapping)
        reason = (
            f"Mapping error: required {required} ranges, "
            "Deye supports at most 6"
        )
        self._clear_pending_control_transaction()
        self.record_schedule_attempt("failed", "TOU mapping", {}, reason)
        self.last_action = "Deye Time Of Use mapping was not applied"
        self.last_error = reason
        self.notify_update()
        return False

    async def async_apply_targets(self) -> bool:
        async with self._control_operation("apply_targets") as transaction_id:
            return await self._async_apply_targets_impl(transaction_id)

    async def _async_apply_targets_impl(
        self, transaction_id: str | None = None
    ) -> bool:
        if self.control_mode == "Schedule" and self.mapping_error:
            return self._report_tou_preflight_failure()
        if not self.data_available:
            return await self._async_handle_slot_failure(
                "A required Deye control entity is missing", "entity validation", {}
            )
        if (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self._last_slot_failure_signature
            and self._last_slot_failure_signature == self._slot_failure_fingerprint("")
        ):
            message = "The current slot remains blocked after the previous error; default settings were already applied."
            self.record_schedule_attempt("failed", "blocked after error", {}, message)
            self.last_error = message
            self.notify_update()
            return False
        sell_requested = self.control_mode == "Manual Sell" or (
            self.control_mode == "Schedule"
            and self.active_slot.enabled
            and self.active_slot.mode == MODE_SELLING_FIRST
        )
        sell_block_reason = ""
        if sell_requested:
            guard_issue = self._selling_slot_guard_issue()
            if guard_issue and guard_issue[0] == "error":
                return await self._async_handle_slot_failure(
                    guard_issue[1], "selling conditions", {}
                )
            if guard_issue and guard_issue[0] == "blocked":
                sell_block_reason = guard_issue[1]
            elif not self.sell_allowed:
                reason = "Price error" if not self.price_ok else "SOC error or missing reading"
                return await self._async_handle_slot_failure(reason, "selling conditions", {})
        target_mode = self.target_mode
        target_sell_power = self.target_sell_power
        applied_sell_power = self.applied_sell_power
        expected = {"System Work Mode": target_mode, "Max Sell Power": applied_sell_power}
        pending_result = await self._async_confirm_or_wait_for_control(expected, "inverter confirmation")
        if pending_result is not None:
            return pending_result
        if sell_block_reason:
            block_signature = self._sell_block_fingerprint(sell_block_reason)
            if block_signature == self._last_sell_block_signature:
                unconfirmed = await self.async_verify_control_values(
                    expected["System Work Mode"],
                    None if expected["Max Sell Power"] is None else float(expected["Max Sell Power"]),
                    self._active_physical_work_mode(),
                )
                if not unconfirmed:
                    self.record_schedule_attempt(
                        "blocked", "selling conditions", expected, sell_block_reason
                    )
                    self.last_action = sell_block_reason
                    self.last_error = ""
                    self.notify_update()
                    return True
            self._last_sell_block_signature = block_signature
        else:
            self._last_sell_block_signature = ""
        stage = "plan validation"
        cap_message = ""
        if applied_sell_power < target_sell_power:
            cap_message = (
                f"Power limited from {int(target_sell_power)} W to "
                f"{int(applied_sell_power)} W by the inverter maximum power."
            )
        self.record_schedule_attempt("pending", stage, expected, cap_message)
        try:
            self._validate_control_plan(target_mode, applied_sell_power)
            stage = "Deye Time Of Use mapping"
            if self.control_mode == "Schedule" and not await self.async_apply_time_of_use_map():
                if not self._control_is_active():
                    raise ControlDisabledError(self._control_block_message())
                message = f"Control transaction failed ({stage}): {self.last_error}"
                self.record_schedule_attempt("failed", stage, expected, message)
                self.last_action = "Deye Time Of Use mapping was not applied"
                self.last_error = message
                self.notify_update()
                return False
            stage = "numeric values"
            applied_sell_power_native = await self.async_set_max_sell_power_number_if_needed(target_sell_power)
            expected["Max Sell Power"] = applied_sell_power_native
            stage = "work mode"
            await self.async_set_work_mode_if_needed(target_mode)
        except ControlDisabledError as err:
            self._clear_pending_control_transaction()
            if not self._control_transaction_is_stale(transaction_id):
                self.record_schedule_attempt(
                    "cancelled",
                    stage,
                    expected,
                    "Interrupted by disabling Deye control",
                )
                self.last_action = str(err)
                self.executed_manager_action = "Not performed — control disabled"
                self.notify_update()
            return False
        except Exception as err:
            message = f"Control transaction failed ({stage}): {err}"
            if stage == "Deye Time Of Use mapping" and not self._last_tou_write_started:
                # The complete TOU map was rejected before the first physical
                # call.  Report it without starting a defaults transaction;
                # the inverter remains exactly as it was.
                self.record_schedule_attempt("failed", stage, expected, message)
                self.last_action = "Deye Time Of Use mapping was not applied"
                self.last_error = message
                self.notify_update()
                return False
            if self.control_mode == "Schedule" and self.active_slot.enabled:
                return await self._async_handle_slot_failure(message, stage, expected)
            self.record_schedule_attempt("failed", stage, expected, message)
            await self.async_apply_safe_defaults(message)
            return False
        return bool(await self._async_confirm_or_wait_for_control(expected, stage, started=True, success_message=cap_message))

    async def async_apply_default_values(self, reason: str = "Defaults applied") -> None:
        async with self._control_operation("apply_default_values") as transaction_id:
            await self._async_apply_default_values_impl(reason, transaction_id)

    async def _async_apply_default_values_impl(
        self,
        reason: str = "Defaults applied",
        transaction_id: str | None = None,
    ) -> None:
        capped_sell_power_w = self.normalize_automatic_sell_power_w(self.default_sell_power)
        mode_input = (
            self.default_normal_physical_work_mode()
            if self.default_work_mode == MODE_NORMAL_OPERATION
            else self.default_work_mode
        )
        cap_message = ""
        if capped_sell_power_w < self.default_sell_power:
            cap_message = f"Default sell power capped from {self.default_sell_power} W do {capped_sell_power_w} W"
            _LOGGER.warning("%s (effective limit %s W)", cap_message, self.effective_inverter_max_power_w)
        self._validate_control_plan(
            self.default_work_mode,
            capped_sell_power_w,
        )
        try:
            capped_sell_power_native = await self.async_set_max_sell_power_number(self.default_sell_power)
            unconfirmed = await self.async_verify_control_values(
                None,
                capped_sell_power_native,
            )
            if unconfirmed:
                raise RuntimeError(f"Unconfirmed default settings: {'; '.join(unconfirmed)}")
            await self.async_set_work_mode(mode_input)
            unconfirmed = await self.async_verify_control_values(
                self.default_work_mode,
                capped_sell_power_native,
                self.default_normal_physical_work_mode(),
            )
            if unconfirmed:
                raise RuntimeError(f"Unconfirmed final settings: {'; '.join(unconfirmed)}")
        except ControlDisabledError:
            raise
        except Exception as err:
            await self.async_apply_safe_defaults(f"Manual settings restore error: {err}")
            raise
        if not self._control_result_is_current(transaction_id):
            raise ControlDisabledError(self._control_block_message())
        self.last_action = reason
        if cap_message:
            self.last_action = f"{self.last_action}. {cap_message}"
        self.last_error = ""
        self.mark_settings_applied()
        self.notify_update()

    async def async_save_charge_profile(self, values: dict[str, Any]) -> None:
        """Atomically save the user-owned profile used by Charge slots."""
        profile_values = {
            "charge_profile_target_soc": self.safe_float(values.get("target_soc"), float("nan")),
        }
        grid_enabled = values.get("grid_charge_enabled")
        if not isinstance(grid_enabled, bool):
            raise ValueError("Grid Charge must be YES or NO")
        profile_entities = {
            # Every Deye TOU SOC input has the same physical range. Validate
            # the profile before persisting it or starting a schedule write.
            "charge_profile_target_soc": ("Deye Time Of Use SOC", self._tou_entity(1, "soc")),
        }
        for key, value in profile_values.items():
            self._validate_number_entity(*profile_entities[key], value)
        previous = {
            key: getattr(self, key)
            for key in profile_values
        }
        previous_grid = self.charge_profile_grid_enabled
        previous_loaded = self._charge_profile_loaded_from_store
        previous_saved_at = self.last_saved_at
        for key, value in profile_values.items():
            setattr(self, key, value)
        self.charge_profile_grid_enabled = grid_enabled
        self._charge_profile_loaded_from_store = True
        self.last_saved_at = ha_now().isoformat(timespec="seconds")
        try:
            # Await the durable write before reporting success to the card.
            # This avoids a close/reopen race with the independent helpers.
            await self.async_save_ai_data()
        except Exception:
            for key, value in previous.items():
                setattr(self, key, value)
            self.charge_profile_grid_enabled = previous_grid
            self._charge_profile_loaded_from_store = previous_loaded
            self.last_saved_at = previous_saved_at
            self.notify_update()
            raise
        self.last_error = ""
        self.last_action = "Charging settings template saved"
        self.notify_update()
        # This is a template for future transitions into Charge.  Existing
        # Charge slots, including manual overrides, are deliberately untouched.

    async def async_save_normal_profile(self, values: dict[str, Any]) -> None:
        """Atomically save the user-owned Normal Operation template.

        The template is copied once into a slot when Normal Operation is
        selected.  Later changes to this template never overwrite existing
        slots.  No inverter entity is written here.
        """
        physical_mode = str(values.get("physical_work_mode") or "")
        if physical_mode not in PHYSICAL_NORMAL_MODES:
            raise ValueError(
                "The physical Deye mode must be Zero Export To Load or Zero Export To CT"
            )
        profile_entities = {
            "normal_profile_sell_power": ("sell_power", "Max Sell Power", self.max_sell_power_number),
            "normal_profile_tou_soc": ("tou_soc", "Deye Time Of Use SOC", self._tou_entity(1, "soc")),
        }
        numeric = {}
        for runtime_key, (input_key, label, entity_id) in profile_entities.items():
            if input_key in values:
                value = self.safe_float(values.get(input_key), float("nan"))
                self._validate_number_entity(label, entity_id, value)
                numeric[runtime_key] = value
        if "sell_power" in values and math.isfinite(numeric.get("normal_profile_sell_power", float("nan"))):
            self.validate_manual_sell_power_w(
                "Normal profile sell power",
                numeric["normal_profile_sell_power"],
            )
        raw_option = logical_mode_option(
            self.data,
            MODE_NORMAL_OPERATION,
            physical_mode,
        )
        self._validate_select_entity("System Work Mode", self.work_mode_select, raw_option)
        all_keys = ("normal_profile_physical_work_mode", *profile_entities)
        previous = {key: getattr(self, key) for key in all_keys}
        previous_loaded = self._normal_profile_loaded_from_store
        previous_saved_at = self.last_saved_at
        self.normal_profile_physical_work_mode = physical_mode
        for key, value in numeric.items():
            setattr(self, key, value)
        self._normal_profile_loaded_from_store = True
        self.last_saved_at = ha_now().isoformat(timespec="seconds")
        try:
            await self.async_save_ai_data()
        except Exception:
            self.normal_profile_physical_work_mode = previous["normal_profile_physical_work_mode"]
            for key in profile_entities:
                setattr(self, key, previous[key])
            self._normal_profile_loaded_from_store = previous_loaded
            self.last_saved_at = previous_saved_at
            self.notify_update()
            raise
        self.last_error = ""
        self.last_action = "Normal Operation settings saved"
        self.notify_update()
        # This is a template for future Normal Operation transitions.  Existing
        # Normal Operation slots, including manual overrides, are untouched.

    async def async_save_default_settings(self, values: dict[str, Any]) -> None:
        """Save the user-owned recovery profile without writing to Deye now."""
        mode = str(values.get("mode") or "")
        if mode not in WORK_MODES:
            raise ValueError("The default inverter mode is invalid")
        physical_mode = str(
            values.get("physical_work_mode") or self.default_normal_physical_work_mode()
        )
        if physical_mode not in PHYSICAL_NORMAL_MODES:
            raise ValueError("The Normal Operation variant is invalid")
        raw_option = logical_mode_option(
            self.data,
            mode,
            physical_mode if mode == MODE_NORMAL_OPERATION else None,
        )
        fields = {
            "default_sell_power": self.safe_float(values.get("sell_power"), float("nan")),
        }
        if math.isfinite(fields["default_sell_power"]):
            self.validate_manual_sell_power_w("Default sell power", fields["default_sell_power"])
        default_entities = {
            "default_sell_power": ("Max Sell Power", self.max_sell_power_number),
        }
        self._validate_select_entity("System Work Mode", self.work_mode_select, raw_option)
        for key, value in fields.items():
            self._validate_number_entity(*default_entities[key], value)
        previous = {
            "default_work_mode": self.default_work_mode,
            "default_physical_work_mode": self.default_physical_work_mode,
            **{key: getattr(self, key) for key in fields},
        }
        previous_saved_at = self.last_saved_at
        self.default_work_mode = mode
        self.default_physical_work_mode = physical_mode
        for key, value in fields.items():
            setattr(self, key, value)
        self.last_saved_at = ha_now().isoformat(timespec="seconds")
        try:
            await self.async_save_ai_data()
        except Exception:
            for key, value in previous.items():
                setattr(self, key, value)
            self.last_saved_at = previous_saved_at
            self.notify_update()
            raise
        self.last_error = ""
        self.last_action = "Default settings saved"
        self.notify_update()

    async def async_manual_sell(self) -> None:
        self.control_mode = "Manual Sell"
        await self.async_tick()

    async def async_charge_now(self) -> None:
        self.control_mode = "Charge Battery"
        await self.async_tick()

    async def async_stop_selling(self, reason: str = "Stopped") -> None:
        await self.async_apply_safe_defaults(reason)

    async def async_request_stop(self) -> None:
        async with self._operation_lock:
            self._clear_pending_control_transaction()
            self.control_mode = "Stop Sell"
            self.planned_manager_action = "Default settings"
            if not self._control_is_active():
                self.executed_manager_action = "Not performed — control disabled"
                self.last_action = "Stopped logically. Deye control is disabled."
                self.notify_update()
                return
            await self.async_apply_safe_defaults("Selling stopped")

    async def async_restore_defaults(self) -> None:
        async with self._operation_lock:
            self._clear_pending_control_transaction()
            applied = await self.async_apply_safe_defaults(
                "Manual application of default settings"
            )
            if not applied:
                raise RuntimeError(
                    self.last_error
                    or "Could not confirm the complete set of default settings"
                )
            self.emergency_stop = False
            self.control_mode = "Schedule"
            self.scheduler_enabled = False
            self._clear_slot_failure_latch()
            self.last_action = "Default settings applied"
            self.last_error = ""
            self.mark_settings_applied()
            self.notify_update()

    async def async_resume_manager(self) -> None:
        """Consciously re-enable Schedule after Stop Sell or an emergency stop."""
        async with self._operation_lock:
            self._clear_pending_control_transaction()
            self.emergency_stop = False
            self.control_mode = "Schedule"
            self.scheduler_enabled = True
            self._clear_slot_failure_latch()
            if not self._control_is_active():
                self.last_action = (
                    "Manager and schedule enabled logically. Deye control is disabled."
                )
                self.executed_manager_action = "Not performed — control disabled"
                self.mark_config_saved()
                self.notify_update()
                return
            applied = await self._async_tick_impl()
            if not applied:
                raise RuntimeError(self.last_error or "Could not apply the current schedule slot")
            self.last_action = "Manager and schedule enabled"
            self.last_error = ""
            self.mark_config_saved()
            self.notify_update()

    async def async_emergency_stop(self) -> None:
        # Set the flag before taking the lock so any in-flight async_apply_settings
        # waiting for confirmation sees the abort signal immediately.
        self.emergency_stop = True
        self.planned_manager_action = self._planned_manager_action_text()
        async with self._operation_lock:
            self._clear_pending_control_transaction()
            self.control_mode = "Stop Sell"
            if not self._control_is_active():
                self.executed_manager_action = "Not performed — emergency stop"
                self.last_action = (
                    "Emergency stop set logically. Deye control is disabled."
                )
                self.notify_update()
                return
            await self.async_apply_safe_defaults("Emergency stop")

    async def _async_tick_impl(self, *_args: Any) -> bool:
        inverter_unavailable = self._update_inverter_link_gate()
        await self.async_update_sold_energy_today()
        await self.async_update_solcast_history()
        await self.async_update_energy_sample()
        if not self.weather_last_updated or ha_now().minute == 0:
            await self.async_update_weather_forecast()

        self._refresh_tou_reconciliation_state()
        self.planned_manager_action = self._planned_manager_action_text()
        if self.manual_schedule_active and not self.emergency_stop:
            await self._async_enforce_manual_schedule_battery_charge()
        if not self._control_is_active():
            self.executed_manager_action = (
                "Not performed — emergency stop"
                if self.emergency_stop
                else "Not performed — control disabled"
            )
            self.notify_update()
            return True

        profile = provider_profile(self.data)
        if not profile.basic_control:
            self.executed_manager_action = (
                "Not performed — emergency stop"
                if self.emergency_stop
                else f"Not performed — provider {profile.label} is read-only"
            )
            self.notify_update()
            return True

        if inverter_unavailable:
            self.executed_manager_action = "Not performed — inverter unavailable"
            self.notify_update()
            return True

        async with self._control_operation("manager_tick") as transaction_id:
            writes_before = self._physical_write_count
            self.executed_manager_action = (
                f"Waiting for confirmation: {self.planned_manager_action}"
            )
            result = True
            if self.emergency_stop:
                result = await self.async_apply_safe_defaults("Emergency stop")
            elif self.control_mode == "Schedule" and self.mapping_error:
                result = self._report_tou_preflight_failure()
            elif self.control_mode in ("Manual Sell", "Charge Battery"):
                result = await self.async_apply_targets()
            elif self.control_mode in ("Stop Sell", "Protect Battery"):
                result = await self.async_apply_safe_defaults(
                    "Selling stopped" if self.control_mode == "Stop Sell" else "Battery protection active"
                )
            elif self.scheduler_enabled:
                if self.active_slot.enabled:
                    result = await self.async_apply_targets()
                else:
                    await self.async_apply_default_values("Default settings")

            if self._control_result_is_current(transaction_id):
                self.executed_manager_action = self._executed_manager_action_text(
                    result=result,
                    physical_writes=self._physical_write_count - writes_before,
                )

        self._notify_update_for("tick_final")
        return result

    async def async_tick(self, *_args: Any) -> None:
        if self._tariff_catalog_manager is not None and self._tariff_catalog_manager.refresh_due():
            await self._tariff_catalog_manager.async_refresh()
            self._notify_update_for("tariff")
        try:
            await self.async_check_inverter_datetime_sync()
        except Exception as err:  # noqa: BLE001 - datetime sync must not break tick
            self._inverter_datetime_last_error = str(err)
        self._migrate_selling_tou_soc()
        async with self._operation_lock:
            try:
                await self._async_tick_impl(*_args)
            except ControlDisabledError as err:
                self._clear_pending_control_transaction()
                self.last_action = str(err)
                self.executed_manager_action = "Not performed — control disabled"
                self._notify_update_for("tick_control_disabled")
            except Exception as err:
                await self.async_apply_safe_defaults(f"Control transaction failed: {type(err).__name__}: {err}")
                raise

    @callback
    def _performance_lag_tick(self, *_args: Any) -> None:
        self._performance.record_lag_tick()

    @callback
    def _performance_report_tick(self, *_args: Any) -> None:
        self._performance.emit_report(self)

    def _start_performance_instrumentation(self) -> None:
        """Keep the Stage 5G.3C profiler dormant in production.

        The diagnostic implementation remains available for isolated tests, but
        normal runtime registers no one-second lag probe, no payload traversal
        and no periodic aggregate log task.
        """
        return

    def _stop_performance_instrumentation(self) -> None:
        """Detach the only two Stage 5G.3C timers and clear private counters."""
        if self.unsub_performance_lag is not None:
            self.unsub_performance_lag()
            self.unsub_performance_lag = None
        if self.unsub_performance_report is not None:
            self.unsub_performance_report()
            self.unsub_performance_report = None
        self._performance.stop()




    async def _async_ensure_install_battery_restart_capacity_default(self) -> None:
        """One-time install setup: set Start battery discharge capacity to 10%."""
        if self._install_init_battery_restart_capacity_done:
            return
        entity_id = entity_map.special_entity("battery_restart_capacity")
        target = 10.0
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable"):
            _LOGGER.warning(
                "Install default: %s is unavailable; leaving Start battery discharge capacity unchanged and will retry on next start",
                entity_id,
            )
            return
        current = self.safe_float(state.state, float("nan"))
        if math.isfinite(current) and math.isclose(current, target, abs_tol=0.01):
            self._install_init_battery_restart_capacity_done = True
            await self.async_save_ai_data()
            return
        try:
            await self.hass.services.async_call(
                "number",
                "set_value",
                {"entity_id": entity_id, "value": target},
                blocking=True,
            )
        except Exception as err:  # noqa: BLE001 - startup best-effort
            _LOGGER.warning(
                "Install default: failed to set %s to %s%%: %s; will retry on next start",
                entity_id,
                target,
                err,
            )
            return
        self._install_init_battery_restart_capacity_done = True
        await self.async_save_ai_data()

    async def async_start(self) -> None:
        self._startup_in_progress = True
        self._unloading = False
        started = False
        try:
            self._tariff_catalog_manager = TariffCatalogManager(
                self.hass,
                self.entry_id,
                str(self.data.get(CONF_TARIFF_CATALOG_URL, DEFAULT_TARIFF_CATALOG_URL)),
            )
            await self._tariff_catalog_manager.async_load()
            await self.async_load_sales_stats()
            await self.async_load_trigger_log()
            await self.async_load_ai_data()
            await self.async_load_solcast_history()
            await self.async_update_solcast_history()
            await self.async_load_energy_history()
            await self.async_update_energy_sample()
            await self.async_update_weather_forecast()
            self._soc_quality_signature = self._soc_semantic_signature(
                self.soc_diagnostics()
            )
            self._start_schedule_input_listener()
            self.unsub_timer = async_track_time_interval(
                self.hass, self.async_tick, timedelta(minutes=1)
            )
            if self._tariff_catalog_manager.refresh_due():
                self._tariff_refresh_task = self.hass.async_create_task(
                    self.async_refresh_tariff_catalog()
                )
            started = True
        finally:
            self._startup_in_progress = False
        if started:
            if self._ai_save_dirty:
                self.request_ai_save()
            if self._energy_save_dirty:
                self.request_energy_save()
            await self._async_ensure_install_battery_restart_capacity_default()
            self.request_sensor_snapshot_refresh()

    @callback
    def finish_platform_setup(self) -> None:
        """Release restore-time gates and publish one coherent initial state."""
        if not self._platform_setup_in_progress:
            return
        self._platform_setup_in_progress = False
        requested_keys = set(self._sensor_snapshot_requested_keys) or {"ai_state", "diagnostics"}
        self._sensor_snapshot_pending = True
        self._sensor_snapshot_requested_keys.update(requested_keys)
        if self._platform_publish_pending:
            self._platform_publish_pending = False
            self._notify_entities_from_cache(reason="startup")
        self._start_performance_instrumentation()

    async def async_unload(self) -> None:
        self._unloading = True
        self._stop_performance_instrumentation()
        if self._active_tou_cancel_event is not None:
            self._active_tou_cancel_event.set()
        for meta in self._active_control_transactions.values():
            meta["stale"] = True
        self._stop_tou_confirmation_listener()
        self.tou_write_pending = False
        self._clear_pending_control_transaction()
        if self._schedule_reconcile_task is not None and not self._schedule_reconcile_task.done():
            self._schedule_reconcile_task.cancel()
        self._schedule_reconcile_task = None
        self._schedule_reconcile_requested = False
        background_tasks = [
            task
            for task in (
                self._sensor_snapshot_task,
                self._ai_save_task,
                self._energy_save_task,
                self._tariff_refresh_task,
            )
            if task is not None and not task.done()
        ]
        for task in background_tasks:
            task.cancel()
        if self.unsub_input_listener:
            self.unsub_input_listener()
            self.unsub_input_listener = None
        if self.unsub_input_debounce:
            self.unsub_input_debounce()
            self.unsub_input_debounce = None
        if self.unsub_timer:
            self.unsub_timer()
            self.unsub_timer = None
        if background_tasks:
            await asyncio.gather(*background_tasks, return_exceptions=True)
        self._sensor_snapshot_task = None
        self._sensor_snapshot_pending = False
        self._sensor_snapshot_requested_keys.clear()
        self._ai_save_task = None
        self._energy_save_task = None
        self._tariff_refresh_task = None
        await self.async_save_ai_data(force=True)
        if self._energy_revision != self._energy_saved_revision:
            await self.async_save_energy_history(force=True)
        await self.async_save_sales_stats()
        await self.async_save_solcast_history()

    def set_control_mode(self, mode: str) -> None:
        if mode in CONTROL_MODES and mode != self.control_mode:
            self.control_mode = mode
            self.notify_update()

    def set_work_mode_for_slot(self, slot_key: str, mode: str) -> None:
        if mode in SLOT_MODES:
            slot = self.slots[slot_key]
            previous_mode = slot.mode
            slot.mode = mode
            if mode == MODE_NORMAL_OPERATION and previous_mode != MODE_NORMAL_OPERATION:
                slot.enabled = True
                self.scheduler_enabled = True
                if self.normal_profile_physical_work_mode in PHYSICAL_NORMAL_MODES:
                    slot.physical_work_mode = self.normal_profile_physical_work_mode
                if math.isfinite(self.normal_profile_sell_power) and 0 <= self.normal_profile_sell_power <= self.effective_inverter_max_power_w:
                    slot.sell_power = self.normal_profile_sell_power
                if self.normal_profile_tou_soc is not None and math.isfinite(self.normal_profile_tou_soc) and 0 <= self.normal_profile_tou_soc <= 100:
                    slot.tou_soc = self.normal_profile_tou_soc
            elif mode == MODE_CHARGE:
                slot.enabled = True
                self.scheduler_enabled = True
                if previous_mode != MODE_CHARGE:
                    slot.tou_soc = self.charge_profile_target_soc
                    slot.charge_enabled = self.charge_profile_grid_enabled
            elif previous_mode == MODE_NORMAL_OPERATION:
                slot.physical_work_mode = None
            self._clear_slot_failure_latch()
            self.notify_update()

    def set_default_work_mode(self, mode: str) -> None:
        normalized = normalize_manager_mode(mode)
        if normalized in WORK_MODES and normalized != self.default_work_mode:
            self.default_work_mode = normalized
            self.notify_update()
