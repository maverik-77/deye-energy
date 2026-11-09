DOMAIN = "deye_energy"
PLATFORMS = ["switch", "select", "number", "sensor", "binary_sensor", "button"]

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
    if kind not in ("start", "soc", "grid") or not 1 <= int(index) <= 6:
        raise ValueError("Invalid TOU config key")
    return f"tou_{int(index)}_{kind}_entity"

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

DEFAULT_WORK_MODE_SELECT = "select.deye_load_limit"
DEFAULT_MAX_SELL_POWER = "number.deye_max_sell_power"
DEFAULT_DISCHARGE_CURRENT = "number.deye_battery_max_discharge_current"
DEFAULT_CHARGE_CURRENT = "number.deye_battery_max_charge_current"
DEFAULT_GRID_CHARGE_CURRENT = "number.deye_grid_charge_battery_current"
DEFAULT_BATTERY_SOC = "sensor.deye_battery_soc"
DEFAULT_PRICE_SENSOR = "sensor.octopus_energy_electricity_17m0034926_1470001581693_export_current_rate"
DEFAULT_SELL_PRICE_TOMORROW_SENSOR = ""
DEFAULT_BUY_PRICE_TODAY_SENSOR = "sensor.electricity_17m0034926_1415291530000_current_rate"
DEFAULT_BUY_PRICE_TOMORROW_SENSOR = ""
DEFAULT_GRID_POWER_SENSOR = "sensor.deye_grid_power"
DEFAULT_PV_POWER_SENSOR = "sensor.deye_pv_power"
DEFAULT_LOAD_POWER_SENSOR = "sensor.deye_load_power"
DEFAULT_BATTERY_POWER_SENSOR = "sensor.deye_battery_power"
DEFAULT_SOLCAST_CURRENT_POWER_SENSOR = "sensor.solcast_pv_forecast_power_now"
DEFAULT_SOLCAST_FORECAST_TODAY_SENSOR = "sensor.solcast_pv_forecast_forecast_today"
DEFAULT_SOLCAST_FORECAST_TOMORROW_SENSOR = "sensor.solcast_pv_forecast_forecast_tomorrow"
DEFAULT_SOLCAST_FORECAST_DAY_3_SENSOR = "sensor.solcast_pv_forecast_forecast_day_3"
DEFAULT_SOLCAST_FORECAST_DAY_4_SENSOR = "sensor.solcast_pv_forecast_forecast_day_4"
DEFAULT_SOLCAST_FORECAST_DAY_5_SENSOR = "sensor.solcast_pv_forecast_forecast_day_5"
DEFAULT_SOLCAST_FORECAST_DAY_6_SENSOR = "sensor.solcast_pv_forecast_forecast_day_6"
DEFAULT_SOLCAST_FORECAST_DAY_7_SENSOR = "sensor.solcast_pv_forecast_forecast_day_7"
DEFAULT_SOLCAST_REMAINING_TODAY_SENSOR = "sensor.solcast_pv_forecast_forecast_remaining_today"
DEFAULT_SOLCAST_PEAK_POWER_TODAY_SENSOR = "sensor.solcast_pv_forecast_peak_forecast_today"
DEFAULT_SOLCAST_PEAK_TIME_TODAY_SENSOR = "sensor.solcast_pv_forecast_peak_time_today"
DEFAULT_DAILY_PV_PRODUCTION_SENSOR = "sensor.deye_day_pv_energy"
DEFAULT_WEATHER_ENTITY = "weather.home"
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
DEFAULT_MAPPING_MODE = "automatic"

# Default status panel detail sources
DEFAULT_PV1_POWER_SENSOR = "sensor.deye_pv1_power"
DEFAULT_PV1_VOLTAGE_SENSOR = "sensor.deye_pv1_voltage"
DEFAULT_PV1_CURRENT_SENSOR = "sensor.deye_pv1_current"
DEFAULT_PV2_POWER_SENSOR = "sensor.deye_pv2_power"
DEFAULT_PV2_VOLTAGE_SENSOR = "sensor.deye_pv2_voltage"
DEFAULT_PV2_CURRENT_SENSOR = "sensor.deye_pv2_current"
DEFAULT_PV3_POWER_SENSOR = "sensor.deye_pv3_power"
DEFAULT_BATTERY_BMS_VOLTAGE_SENSOR = "sensor.deye_battery_voltage"
DEFAULT_BATTERY_CURRENT_SENSOR = "sensor.deye_battery_current"
DEFAULT_BATTERY_TEMPERATURE_SENSOR = "sensor.deye_battery_temperature"
DEFAULT_BATTERY_SOH_SENSOR = ""
DEFAULT_DAILY_BATTERY_CHARGE_SENSOR = "sensor.deye_day_battery_charge"
DEFAULT_DAILY_BATTERY_DISCHARGE_SENSOR = "sensor.deye_day_battery_discharge"
DEFAULT_DAILY_ENERGY_BOUGHT_SENSOR = "sensor.deye_day_grid_import"
DEFAULT_DAILY_ENERGY_SOLD_SENSOR = "sensor.deye_day_grid_export"
DEFAULT_GRID_L1_POWER_SENSOR = "sensor.deye_inverter_grid_l1_power"
DEFAULT_GRID_L2_POWER_SENSOR = "sensor.deye_inverter_grid_l2_power"
DEFAULT_GRID_L3_POWER_SENSOR = "sensor.deye_inverter_grid_l3_power"
DEFAULT_GRID_L1_VOLTAGE_SENSOR = "sensor.deye_inverter_grid_l1_voltage"
DEFAULT_GRID_L2_VOLTAGE_SENSOR = "sensor.deye_inverter_grid_l2_voltage"
DEFAULT_GRID_L3_VOLTAGE_SENSOR = "sensor.deye_inverter_grid_l3_voltage"
DEFAULT_LOAD_FREQUENCY_SENSOR = "sensor.deye_load_frequency"
DEFAULT_DAILY_LOAD_CONSUMPTION_SENSOR = "sensor.deye_day_load_energy"
DEFAULT_LOAD_L1_POWER_SENSOR = "sensor.deye_load_l1_power"
DEFAULT_LOAD_L2_POWER_SENSOR = "sensor.deye_load_l2_power"
DEFAULT_LOAD_L3_POWER_SENSOR = "sensor.deye_inverter_load_l3_power"
DEFAULT_INVERTER_AC_TEMPERATURE_SENSOR = "sensor.deye_inverter_ac_temperature"

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

SLOTS = [
    ("00_01", "00:00-01:00", 0, 1),
    ("01_02", "01:00-02:00", 1, 2),
    ("02_03", "02:00-03:00", 2, 3),
    ("03_04", "03:00-04:00", 3, 4),
    ("04_05", "04:00-05:00", 4, 5),
    ("05_06", "05:00-06:00", 5, 6),
    ("06_07", "06:00-07:00", 6, 7),
    ("07_08", "07:00-08:00", 7, 8),
    ("08_09", "08:00-09:00", 8, 9),
    ("09_10", "09:00-10:00", 9, 10),
    ("10_11", "10:00-11:00", 10, 11),
    ("11_12", "11:00-12:00", 11, 12),
    ("12_13", "12:00-13:00", 12, 13),
    ("13_14", "13:00-14:00", 13, 14),
    ("14_15", "14:00-15:00", 14, 15),
    ("15_16", "15:00-16:00", 15, 16),
    ("16_17", "16:00-17:00", 16, 17),
    ("17_18", "17:00-18:00", 17, 18),
    ("18_19", "18:00-19:00", 18, 19),
    ("19_20", "19:00-20:00", 19, 20),
    ("20_21", "20:00-21:00", 20, 21),
    ("21_22", "21:00-22:00", 21, 22),
    ("22_23", "22:00-23:00", 22, 23),
    ("23_00", "23:00-00:00", 23, 24),
]
