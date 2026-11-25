"""Integration constants.

Home Assistant entity identifiers are *not* defined here.  They live in the
shared ``mqtt_entity_map.json`` catalogue and are exposed through
``entity_map``; the ``DEFAULT_*`` names below remain as aliases so existing
imports keep working.
"""

from . import entity_map

DOMAIN = "deye_energy"
PLATFORMS = ["switch", "select", "number", "sensor", "binary_sensor", "button"]

# Optional user override file in the Home Assistant configuration directory.
CONF_ENTITY_MAP_OVERRIDE_FILE = entity_map.bundled_document().get(
    "override_file", "deye_energy_entity_map.json"
)

CONF_WORK_MODE_SELECT = "work_mode_select"
CONF_MAX_SELL_POWER_NUMBER = "max_sell_power_number"
CONF_DISCHARGE_CURRENT_NUMBER = "discharge_current_number"
CONF_CHARGE_CURRENT_NUMBER = "charge_current_number"
CONF_GRID_CHARGE_CURRENT_NUMBER = "grid_charge_current_number"
CONF_BATTERY_SOC_SENSOR = "battery_soc_sensor"
CONF_PRICE_SENSOR = "price_sensor"
CONF_SELL_PRICE_TOMORROW_SENSOR = "sell_price_tomorrow_sensor"
CONF_BUY_PRICE_TODAY_SENSOR = "buy_price_today_sensor"
CONF_BUY_PRICE_TOMORROW_SENSOR = "buy_price_tomorrow_sensor"
CONF_GRID_POWER_SENSOR = "grid_power_sensor"
CONF_PV_POWER_SENSOR = "pv_power_sensor"
CONF_LOAD_POWER_SENSOR = "load_power_sensor"
CONF_BATTERY_POWER_SENSOR = "battery_power_sensor"
CONF_SOLCAST_CURRENT_POWER_SENSOR = "solcast_current_power_sensor"
CONF_SOLCAST_FORECAST_TODAY_SENSOR = "solcast_forecast_today_sensor"
CONF_SOLCAST_FORECAST_TOMORROW_SENSOR = "solcast_forecast_tomorrow_sensor"
CONF_SOLCAST_FORECAST_DAY_3_SENSOR = "solcast_forecast_day_3_sensor"
CONF_SOLCAST_FORECAST_DAY_4_SENSOR = "solcast_forecast_day_4_sensor"
CONF_SOLCAST_FORECAST_DAY_5_SENSOR = "solcast_forecast_day_5_sensor"
CONF_SOLCAST_FORECAST_DAY_6_SENSOR = "solcast_forecast_day_6_sensor"
CONF_SOLCAST_FORECAST_DAY_7_SENSOR = "solcast_forecast_day_7_sensor"
CONF_SOLCAST_REMAINING_TODAY_SENSOR = "solcast_remaining_today_sensor"
CONF_SOLCAST_PEAK_POWER_TODAY_SENSOR = "solcast_peak_power_today_sensor"
CONF_SOLCAST_PEAK_TIME_TODAY_SENSOR = "solcast_peak_time_today_sensor"
CONF_DAILY_PV_PRODUCTION_SENSOR = "daily_pv_production_sensor"
CONF_WEATHER_ENTITY = "weather_entity"
CONF_PRICE_SOURCE = "price_source"
CONF_DSO_PROVIDER = "dso_provider"
CONF_TARIFF_PLAN = "tariff_plan"
CONF_DISTRIBUTION_PEAK_RATE = "distribution_peak_rate"
CONF_DISTRIBUTION_OFFPEAK_RATE = "distribution_offpeak_rate"
CONF_CUSTOM_OFFPEAK_WINDOWS = "custom_offpeak_windows"
CONF_TARIFF_MODE = "tariff_mode"
CONF_PRICE_INCLUDES_DISTRIBUTION = "price_includes_distribution"
CONF_BUY_PRICE_CONTRACT = "buy_price_contract"
CONF_SELL_PRICE_CONTRACT = "sell_price_contract"
CONF_TARIFF_CATALOG_URL = "tariff_catalog_url"
CONF_BUY_SELLER_ID = "buy_seller_id"
CONF_BUY_SELLER_TARIFF_ID = "buy_seller_tariff_id"
CONF_GRID_POSITIVE_IS_IMPORT = "grid_positive_is_import"
CONF_BATTERY_POSITIVE_IS_DISCHARGE = "battery_positive_is_discharge"
CONF_INVERTER_MAX_POWER_W = "inverter_max_power_w"
CONF_MAPPING_MODE = "mapping_mode"
CONF_INVERTER_PROVIDER = "inverter_provider"
CONF_INVERTER_DEVICE_ID = "inverter_device_id"
CONF_INVERTER_DATETIME_ENTITY = "inverter_datetime_entity"
CONF_WORK_MODE_AUX_ENTITY = "work_mode_aux_entity"
CONF_WORK_MODE_SELL_OPTION = "work_mode_sell_option"
CONF_WORK_MODE_ZERO_LOAD_OPTION = "work_mode_zero_load_option"
CONF_WORK_MODE_ZERO_CT_OPTION = "work_mode_zero_ct_option"
CONF_TOU_GRID_ENABLE_OPTION = "tou_grid_enable_option"
CONF_TOU_GRID_DISABLE_OPTION = "tou_grid_disable_option"
CONF_TOU_GRID_GENERATOR_OPTION = "tou_grid_generator_option"
CONF_TOU_GRID_BOTH_OPTION = "tou_grid_both_option"

PROVIDER_LEWA_REKA = "lewa_reka"
PROVIDER_SOLARMAN = "solarman"
PROVIDER_SUNSYNK = "sunsynk"
PROVIDER_DEYE_ADDON = "deye_addon"
PROVIDER_CUSTOM = "custom"
INVERTER_PROVIDERS = [
    PROVIDER_LEWA_REKA,
    PROVIDER_SOLARMAN,
    PROVIDER_SUNSYNK,
    PROVIDER_DEYE_ADDON,
    PROVIDER_CUSTOM,
]
DEFAULT_INVERTER_PROVIDER = PROVIDER_SUNSYNK


def conf_tou_entity(index: int, kind: str) -> str:
    """Return a stable config key for one physical TOU field."""
    return entity_map.tou_key(index, kind)

# Status panel detailed entity mapping
CONF_PV1_POWER_SENSOR = "pv1_power_sensor"
CONF_PV1_VOLTAGE_SENSOR = "pv1_voltage_sensor"
CONF_PV1_CURRENT_SENSOR = "pv1_current_sensor"
CONF_PV2_POWER_SENSOR = "pv2_power_sensor"
CONF_PV2_VOLTAGE_SENSOR = "pv2_voltage_sensor"
CONF_PV2_CURRENT_SENSOR = "pv2_current_sensor"
CONF_PV3_POWER_SENSOR = "pv3_power_sensor"
CONF_BATTERY_BMS_VOLTAGE_SENSOR = "battery_bms_voltage_sensor"
CONF_BATTERY_CURRENT_SENSOR = "battery_current_sensor"
CONF_BATTERY_TEMPERATURE_SENSOR = "battery_temperature_sensor"
CONF_BATTERY_SOH_SENSOR = "battery_soh_sensor"
CONF_DAILY_BATTERY_CHARGE_SENSOR = "daily_battery_charge_sensor"
CONF_DAILY_BATTERY_DISCHARGE_SENSOR = "daily_battery_discharge_sensor"
CONF_DAILY_ENERGY_BOUGHT_SENSOR = "daily_energy_bought_sensor"
CONF_DAILY_ENERGY_SOLD_SENSOR = "daily_energy_sold_sensor"
CONF_GRID_L1_POWER_SENSOR = "grid_l1_power_sensor"
CONF_GRID_L2_POWER_SENSOR = "grid_l2_power_sensor"
CONF_GRID_L3_POWER_SENSOR = "grid_l3_power_sensor"
CONF_GRID_L1_VOLTAGE_SENSOR = "grid_l1_voltage_sensor"
CONF_GRID_L2_VOLTAGE_SENSOR = "grid_l2_voltage_sensor"
CONF_GRID_L3_VOLTAGE_SENSOR = "grid_l3_voltage_sensor"
CONF_LOAD_FREQUENCY_SENSOR = "load_frequency_sensor"
CONF_DAILY_LOAD_CONSUMPTION_SENSOR = "daily_load_consumption_sensor"
CONF_LOAD_L1_POWER_SENSOR = "load_l1_power_sensor"
CONF_LOAD_L2_POWER_SENSOR = "load_l2_power_sensor"
CONF_LOAD_L3_POWER_SENSOR = "load_l3_power_sensor"
CONF_INVERTER_AC_TEMPERATURE_SENSOR = "inverter_ac_temperature_sensor"

# Sensor roles rendered by the card's Energy status page.  The backend owns the
# catalog so the card can render its mapping/visibility editor without
# duplicating role definitions.  Only per-entry overrides are persisted.
ENERGY_STATUS_ROLES: tuple[tuple[str, str, str], ...] = (
    ("pv_power", "PV power", "PV"),
    ("daily_pv_production", "PV produced today", "PV"),
    ("pv1_power", "PV1 power", "PV"),
    ("pv1_voltage", "PV1 voltage", "PV"),
    ("pv1_current", "PV1 current", "PV"),
    ("pv2_power", "PV2 power", "PV"),
    ("pv2_voltage", "PV2 voltage", "PV"),
    ("pv2_current", "PV2 current", "PV"),
    ("grid_power", "Grid power", "Grid"),
    ("grid_l1_power", "Grid L1 power", "Grid"),
    ("grid_l1_voltage", "Grid L1 voltage", "Grid"),
    ("grid_l2_power", "Grid L2 power", "Grid"),
    ("grid_l2_voltage", "Grid L2 voltage", "Grid"),
    ("grid_l3_power", "Grid L3 power", "Grid"),
    ("grid_l3_voltage", "Grid L3 voltage", "Grid"),
    ("daily_energy_bought", "Energy bought today", "Grid"),
    ("daily_energy_sold", "Energy sold today", "Grid"),
    ("load_frequency", "Grid frequency", "Grid"),
    ("battery_power", "Battery power", "Battery"),
    ("battery_soc", "Battery SOC", "Battery"),
    ("battery_bms_voltage", "Battery voltage", "Battery"),
    ("battery_current", "Battery current", "Battery"),
    ("battery_temperature", "Battery temperature", "Battery"),
    ("daily_battery_charge", "Battery charged today", "Battery"),
    ("daily_battery_discharge", "Battery discharged today", "Battery"),
    ("daily_load_consumption", "Load consumed today", "Home"),
    ("load_l1_power", "Load L1 power", "Home"),
    ("load_l2_power", "Load L2 power", "Home"),
    ("load_l3_power", "Load L3 power", "Home"),
    ("inverter_ac_temperature", "Inverter temperature", "Inverter"),
    ("sold_energy_today", "Exported today", "Values"),
    ("sold_value_today", "Export value today", "Values"),
)
ENERGY_STATUS_ROLE_KEYS = frozenset(role for role, _, _ in ENERGY_STATUS_ROLES)
ENERGY_STATUS_DISPLAY_SCHEMA_VERSION = 1

DEFAULT_WORK_MODE_SELECT = entity_map.entity_default("work_mode_select")
DEFAULT_MAX_SELL_POWER = entity_map.entity_default("max_sell_power_number")
DEFAULT_INVERTER_DATETIME_ENTITY = entity_map.special_entity("inverter_datetime")
DEFAULT_DISCHARGE_CURRENT = entity_map.entity_default("discharge_current_number")
DEFAULT_CHARGE_CURRENT = entity_map.entity_default("charge_current_number")
DEFAULT_GRID_CHARGE_CURRENT = entity_map.entity_default("grid_charge_current_number")
DEFAULT_BATTERY_SOC = entity_map.entity_default("battery_soc_sensor")
DEFAULT_PRICE_SENSOR = entity_map.entity_default("price_sensor")
DEFAULT_SELL_PRICE_TOMORROW_SENSOR = entity_map.entity_default("sell_price_tomorrow_sensor")
DEFAULT_BUY_PRICE_TODAY_SENSOR = entity_map.entity_default("buy_price_today_sensor")
DEFAULT_BUY_PRICE_TOMORROW_SENSOR = entity_map.entity_default("buy_price_tomorrow_sensor")
DEFAULT_GRID_POWER_SENSOR = entity_map.entity_default("grid_power_sensor")
DEFAULT_PV_POWER_SENSOR = entity_map.entity_default("pv_power_sensor")
DEFAULT_LOAD_POWER_SENSOR = entity_map.entity_default("load_power_sensor")
DEFAULT_BATTERY_POWER_SENSOR = entity_map.entity_default("battery_power_sensor")
DEFAULT_SOLCAST_CURRENT_POWER_SENSOR = entity_map.entity_default("solcast_current_power_sensor")
DEFAULT_SOLCAST_FORECAST_TODAY_SENSOR = entity_map.entity_default("solcast_forecast_today_sensor")
DEFAULT_SOLCAST_FORECAST_TOMORROW_SENSOR = entity_map.entity_default("solcast_forecast_tomorrow_sensor")
DEFAULT_SOLCAST_FORECAST_DAY_3_SENSOR = entity_map.entity_default("solcast_forecast_day_3_sensor")
DEFAULT_SOLCAST_FORECAST_DAY_4_SENSOR = entity_map.entity_default("solcast_forecast_day_4_sensor")
DEFAULT_SOLCAST_FORECAST_DAY_5_SENSOR = entity_map.entity_default("solcast_forecast_day_5_sensor")
DEFAULT_SOLCAST_FORECAST_DAY_6_SENSOR = entity_map.entity_default("solcast_forecast_day_6_sensor")
DEFAULT_SOLCAST_FORECAST_DAY_7_SENSOR = entity_map.entity_default("solcast_forecast_day_7_sensor")
DEFAULT_SOLCAST_REMAINING_TODAY_SENSOR = entity_map.entity_default("solcast_remaining_today_sensor")
DEFAULT_SOLCAST_PEAK_POWER_TODAY_SENSOR = entity_map.entity_default("solcast_peak_power_today_sensor")
DEFAULT_SOLCAST_PEAK_TIME_TODAY_SENSOR = entity_map.entity_default("solcast_peak_time_today_sensor")
DEFAULT_DAILY_PV_PRODUCTION_SENSOR = entity_map.entity_default("daily_pv_production_sensor")
DEFAULT_WEATHER_ENTITY = entity_map.entity_default("weather_entity")
DEFAULT_PRICE_SOURCE = "octopus_energy"
DEFAULT_DSO_PROVIDER = "octopus"
DEFAULT_TARIFF_PLAN = "intelligent_go"
DEFAULT_DISTRIBUTION_PEAK_RATE = 0.3281
DEFAULT_DISTRIBUTION_OFFPEAK_RATE = 0.066
DEFAULT_CUSTOM_OFFPEAK_WINDOWS = "23:00-05:00"
DEFAULT_TARIFF_MODE = "automatic"
DEFAULT_PRICE_INCLUDES_DISTRIBUTION = False
DEFAULT_TARIFF_CATALOG_URL = "https://raw.githubusercontent.com/maverik-77/deye-energy/main/custom_components/deye_energy/tariff_catalog.json"
DEFAULT_BUY_SELLER_ID = ""
DEFAULT_BUY_SELLER_TARIFF_ID = ""
DEFAULT_GRID_POSITIVE_IS_IMPORT = True
DEFAULT_BATTERY_POSITIVE_IS_DISCHARGE = True
DEFAULT_INVERTER_MAX_POWER_W = 16000
ABSOLUTE_INVERTER_MAX_POWER_W = 30000

# Mirrored from the working Solar Assistant configuration.  These seed a fresh
# install and the one-time migration of an existing installation.
MIRRORED_MAX_SELL_POWER_W = 0.0
MIRRORED_CHARGE_PROFILE_TARGET_SOC = 100.0
MIRRORED_CHARGE_PROFILE_GRID_ENABLED = True
DEFAULT_MAPPING_MODE = "automatic"

# Default status panel detail sources
DEFAULT_PV1_POWER_SENSOR = entity_map.entity_default("pv1_power_sensor")
DEFAULT_PV1_VOLTAGE_SENSOR = entity_map.entity_default("pv1_voltage_sensor")
DEFAULT_PV1_CURRENT_SENSOR = entity_map.entity_default("pv1_current_sensor")
DEFAULT_PV2_POWER_SENSOR = entity_map.entity_default("pv2_power_sensor")
DEFAULT_PV2_VOLTAGE_SENSOR = entity_map.entity_default("pv2_voltage_sensor")
DEFAULT_PV2_CURRENT_SENSOR = entity_map.entity_default("pv2_current_sensor")
DEFAULT_PV3_POWER_SENSOR = entity_map.entity_default("pv3_power_sensor")
DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR = entity_map.entity_default("battery_bms_voltage_sensor")
DEFAULT_BATTERY_CURRENT_SENSOR = entity_map.entity_default("battery_current_sensor")
DEFAULT_BATTERY_TEMPERATURE_SENSOR = entity_map.entity_default("battery_temperature_sensor")
DEFAULT_BATTERY_SOH_SENSOR = entity_map.entity_default("battery_soh_sensor")
DEFAULT_DAILY_BATTERY_CHARGE_SENSOR = entity_map.entity_default("daily_battery_charge_sensor")
DEFAULT_DAILY_BATTERY_DISCHARGE_SENSOR = entity_map.entity_default("daily_battery_discharge_sensor")
DEFAULT_DAILY_ENERGY_BOUGHT_SENSOR = entity_map.entity_default("daily_energy_bought_sensor")
DEFAULT_DAILY_ENERGY_SOLD_SENSOR = entity_map.entity_default("daily_energy_sold_sensor")
DEFAULT_GRID_L1_POWER_SENSOR = entity_map.entity_default("grid_l1_power_sensor")
DEFAULT_GRID_L2_POWER_SENSOR = entity_map.entity_default("grid_l2_power_sensor")
DEFAULT_GRID_L3_POWER_SENSOR = entity_map.entity_default("grid_l3_power_sensor")
DEFAULT_GRID_L1_VOLTAGE_SENSOR = entity_map.entity_default("grid_l1_voltage_sensor")
DEFAULT_GRID_L2_VOLTAGE_SENSOR = entity_map.entity_default("grid_l2_voltage_sensor")
DEFAULT_GRID_L3_VOLTAGE_SENSOR = entity_map.entity_default("grid_l3_voltage_sensor")
DEFAULT_LOAD_FREQUENCY_SENSOR = entity_map.entity_default("load_frequency_sensor")
DEFAULT_DAILY_LOAD_CONSUMPTION_SENSOR = entity_map.entity_default("daily_load_consumption_sensor")
DEFAULT_LOAD_L1_POWER_SENSOR = entity_map.entity_default("load_l1_power_sensor")
DEFAULT_LOAD_L2_POWER_SENSOR = entity_map.entity_default("load_l2_power_sensor")
DEFAULT_LOAD_L3_POWER_SENSOR = entity_map.entity_default("load_l3_power_sensor")
DEFAULT_INVERTER_AC_TEMPERATURE_SENSOR = entity_map.entity_default("inverter_ac_temperature_sensor")

PRICE_SOURCES = ["octopus_energy", "other", "none"]
DSO_PROVIDERS = ["octopus", "other"]
TARIFF_PLANS = ["intelligent_go", "agile", "flexible", "custom"]

MODE_SELLING_FIRST = "Selling"
MODE_ZERO_EXPORT = "Zero Export To Load"
MODE_ZERO_EXPORT_CT = "Zero Export To CT"
MODE_CHARGE = "Charging"
MODE_NORMAL_OPERATION = "Normal Operation"

# Canonical logical modes exposed by Deye Energy to the user.
MANAGER_MODES = (MODE_NORMAL_OPERATION, MODE_CHARGE, MODE_SELLING_FIRST)

# Stable schedule schema.  Physical Deye work modes remain separate from the
# logical Normal Operation mode and must never be written to the inverter as
# the literal ``Normal Operation`` value.
SCHEDULE_SCHEMA_VERSION = 1
PHYSICAL_NORMAL_MODES = (MODE_ZERO_EXPORT, MODE_ZERO_EXPORT_CT)

CONTROL_MODES = ["Schedule", "Manual Sell", "Stop Sell", "Protect Battery", "Charge Battery"]

# Default work mode is a logical fallback for the inverter, not a slot mode.
# ``Charging`` is realised through physical TOU Grid Charge, not through the
# global work mode select entity.
WORK_MODES = [MODE_NORMAL_OPERATION, MODE_SELLING_FIRST]

SLOT_MODES = list(MANAGER_MODES)

# Legacy values accepted during restore and external service calls.  They are
# normalised to the canonical manager mode values at runtime.
LEGACY_MANAGER_MODE_MAP: dict[str, str] = {
    "Selling First": MODE_SELLING_FIRST,
    "Sell": MODE_SELLING_FIRST,
    "Selling": MODE_SELLING_FIRST,
    "Charge": MODE_CHARGE,
    "Charging": MODE_CHARGE,
    "normal": MODE_NORMAL_OPERATION,
    "Normal Operation": MODE_NORMAL_OPERATION,
    "Zero Export To Load": MODE_NORMAL_OPERATION,
    "Zero Export To CT": MODE_NORMAL_OPERATION,
    "Zero Export": MODE_NORMAL_OPERATION,
    "Essentials": MODE_NORMAL_OPERATION,
}


# Service schemas accept the canonical work-mode names and every historical
# alias that still normalises to one of them.
WORK_MODE_SERVICE_VALUES = [
    *WORK_MODES,
    *[key for key, value in LEGACY_MANAGER_MODE_MAP.items() if value in WORK_MODES],
]


def normalize_manager_mode(value: str) -> str:
    """Return the canonical manager mode for legacy or current input."""
    return LEGACY_MANAGER_MODE_MAP.get(str(value).strip(), str(value).strip())


ACCEPTED_SLOT_MODES = [*SLOT_MODES, *list(LEGACY_MANAGER_MODE_MAP.keys())]

SLOT_MINUTES = 30
MINUTES_PER_DAY = 1440
SLOTS_PER_DAY = MINUTES_PER_DAY // SLOT_MINUTES


def _clock_digits(minute: int) -> str:
    hour, rest = divmod(minute % MINUTES_PER_DAY, 60)
    return f"{hour:02d}{rest:02d}"


def _clock_label(minute: int) -> str:
    hour, rest = divmod(minute % MINUTES_PER_DAY, 60)
    return f"{hour:02d}:{rest:02d}"


# Schedule slots: (key, label, start_minute, end_minute).  The last slot ends at
# 1440 (midnight).  Keys look like ``0530_0600``.
SLOTS = [
    (
        f"{_clock_digits(start)}_{_clock_digits(start + SLOT_MINUTES)}",
        f"{_clock_label(start)}-{_clock_label(start + SLOT_MINUTES)}",
        start,
        start + SLOT_MINUTES,
    )
    for start in range(0, MINUTES_PER_DAY, SLOT_MINUTES)
]

# Legacy hourly keys stay supported.  An hourly key such as ``05_06`` fans out
# to the schedule slots it covers.
HOUR_SLOTS = [
    (f"{hour:02d}_{(hour + 1) % 24:02d}", f"{hour:02d}:00-{(hour + 1) % 24:02d}:00", hour, hour + 1)
    for hour in range(24)
]
HOUR_SLOT_KEYS = [row[0] for row in HOUR_SLOTS]
SLOT_KEYS = [row[0] for row in SLOTS]
SLOT_INDEX = {key: index for index, key in enumerate(SLOT_KEYS)}
_HOUR_KEY_TO_SLOTS = {
    HOUR_SLOTS[hour][0]: [
        SLOTS[hour * (60 // SLOT_MINUTES) + offset][0] for offset in range(60 // SLOT_MINUTES)
    ]
    for hour in range(24)
}


def slot_key_at_minute(minute_of_day: int) -> str:
    """Return the schedule slot covering a minute of the day."""
    return SLOTS[(int(minute_of_day) % MINUTES_PER_DAY) // SLOT_MINUTES][0]


def hour_key(hour: int) -> str:
    """Return the hourly plan key for a local hour."""
    return HOUR_SLOTS[int(hour) % 24][0]


def slots_for_key(key: str) -> list[str]:
    """Resolve a schedule slot key or an hourly plan key to schedule slot keys."""
    text = str(key or "")
    if text in SLOT_INDEX:
        return [text]
    return list(_HOUR_KEY_TO_SLOTS.get(text, []))


def hour_of_slot(key: str) -> int:
    """Local start hour of a schedule slot or hourly plan key."""
    text = str(key or "")
    return int(text[:2]) if len(text) >= 2 and text[:2].isdigit() else 0


def slot_start_minute(key: str) -> int:
    """Start minute of the day for a schedule slot key (or an hourly plan key)."""
    text = str(key or "")
    if text in SLOT_INDEX:
        return SLOTS[SLOT_INDEX[text]][2]
    return hour_of_slot(text) * 60


def slot_end_minute(key: str) -> int:
    """End minute (exclusive) for a schedule slot key or an hourly plan key."""
    text = str(key or "")
    if text in SLOT_INDEX:
        return SLOTS[SLOT_INDEX[text]][3]
    return (hour_of_slot(text) + 1) * 60
