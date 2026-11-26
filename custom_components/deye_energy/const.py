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

MODE_SELLING_FIRST = "Selling"
MODE_ZERO_EXPORT = "Zero Export To Load"
MODE_ZERO_EXPORT_CT = "Zero Export To CT"
MODE_CHARGE = "Charging"
MODE_NORMAL_OPERATION = "Normal Operation"

# Canonical logical modes exposed by Deye Energy to the user.
MANAGER_MODES = (MODE_NORMAL_OPERATION, MODE_CHARGE, MODE_SELLING_FIRST)

# Physical Deye work modes remain separate from the logical Normal Operation
# mode and must never be written to the inverter as the literal
# ``Normal Operation`` value.
PHYSICAL_NORMAL_MODES = (MODE_ZERO_EXPORT, MODE_ZERO_EXPORT_CT)

CONTROL_MODES = ["Schedule", "Manual Sell", "Stop Sell", "Protect Battery", "Charge Battery"]

# Default work mode is a logical fallback for the inverter, not a slot mode.
# ``Charging`` is realised through physical TOU Grid Charge, not through the
# global work mode select entity.
WORK_MODES = [MODE_NORMAL_OPERATION, MODE_SELLING_FIRST]

# Legacy values accepted from stored manual rows and external service calls.
# They are normalised to the canonical manager mode values at runtime.
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

# Canonical and historical names accepted for manager row modes.
ACCEPTED_MANAGER_MODES = [*MANAGER_MODES, *list(LEGACY_MANAGER_MODE_MAP.keys())]


# Service schemas accept the canonical work-mode names and every historical
# alias that still normalises to one of them.
WORK_MODE_SERVICE_VALUES = [
    *WORK_MODES,
    *[key for key, value in LEGACY_MANAGER_MODE_MAP.items() if value in WORK_MODES],
]


def normalize_manager_mode(value: str) -> str:
    """Return the canonical manager mode for legacy or current input."""
    return LEGACY_MANAGER_MODE_MAP.get(str(value).strip(), str(value).strip())


MINUTES_PER_DAY = 1440
