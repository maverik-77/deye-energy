# Deye Energy for Home Assistant

![Deye Energy](docs/banner.svg)

[![version](https://img.shields.io/badge/version-0.8.0.88-blue.svg)](CHANGELOG.md)
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](#quick-start)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.6%2B-18BCF2.svg)](#requirements)

Deye Energy is a custom Home Assistant integration for planning and safely
controlling a Deye hybrid inverter. It combines a 24-hour schedule, the physical
Deye Time Of Use (TOU) slots, energy prices, Solcast forecasts and statistics in
a single Lovelace card. It is adapted to a Deye inverter exposed through MQTT
(the Sunsynk / Deye add-on profile) and to a UK-style tariff.

## Key features

- **Schedule slots** of 48 half-hour slots with three logical modes:
  **Normal Operation**, **Charging** and **Selling**.
- **Independent manual schedule** with variable-length rows covering the full
  24 hours, stored separately from the stored schedule slots. Enabling it makes
  the scheduler, TOU mapping, diagnostics and sensor snapshots follow the manual
  rows; disabling it returns them to the stored schedule slots.
- **Exact source switching**: the Manual schedule toggle selects between the
  manual rows and the stored schedule slots. The master **Deye control** switch
  remains a separate hardware gate.
- **Six physical Deye TOU ranges** mapped from the full-day schedule, with
  boundaries on `:00` or `:30`, editable inline in the **Deye Time Of Use**
  table. Save validates the whole day; Rollback restores the inverter values.
- **Single-phase inverters** are supported by default; set
  `layout.phase_count: 3` where separate L1/L2/L3 readings are needed.
- **Power readouts** in watts below 10 kW and kilowatts at or above it. Card
  readouts use two decimal places for kW; backend decision text uses one.
- **Prices** from Octopus Energy or any mapped entity, an Octopus tariff
  catalogue and a fully manual tariff mode.
- **Solcast forecast analysis** with history.
- **Transaction-safe physical writes**: diff-only writes, confirmation and
  rollback, with all writes blocked when Deye control is off.
- **Automatically managed Lovelace resource** in the default UI/storage mode.
- **Diagnostics** for providers, entity mapping, data quality and the active
  schedule source.
- **Trigger logs** card (`custom:deye-energy-trigger-logs-card`) recording every
  physical inverter write with timestamp, target/value and success/failure
  status. Full-height layout with sticky header, scrollable content, 20-entry
  pagination, time filters and 30-day retention; addable to any dashboard.
- **Graphs** card (`custom:deye-energy-graphs-card`) with 1h/6h/24h/7d/30d/1y
  history graphs and a custom From/To date+time range, in sub-tabs for Power
  flow, Inverter, Grid, Load, and Battery. Charts render full-width within the
  selected tab; default entity mappings are overridable in card config; addable
  to any dashboard.
- **Power flow** card (`custom:deye-energy-power-flow-card`) showing live
  animated power flow between PV, Grid, Inverter, Battery, and Home, with straight
  glowing links, directional arrows, glowing node widgets, richer per-node
  details (daily energy, voltage/frequency/current/temperature/SOC), optional
  consumers (including `rest` untracked load), energy period switching
  (`power/today/24h/week/month`), battery sign convention in power mode
  (positive = discharging, negative = charging; display flipped), W/kW
  formatting (`<10000 W` in watts, `>=10000 W` in kW), power-mode home load
  calculated from PV, grid and battery power, theme-aware node images with
  coloured active glow, an SOC bar on the Battery node coloured by charge level,
  and per-node click to open Home Assistant more-info. A summary row above the
  four main nodes shows Overall grid (import/export power), Electricity (import
  energy and cost today), Gas (import and cost today) and Export (export energy
  and income today), with both values in each widget sharing the same font
  format. The period selector is pinned to the top-right corner inside the
  diagram outline; the header shows only the title and live timestamp. Energy
  period values keep the kWh unit on the same row. Flow links use a fixed
  1px-dot/22px-gap stream that scrolls along the whole link at a speed
  set by the `flow_animation_speed` config option (default 6), with a tighter
  `1 18` variant on small screens. The direction is taken from the flow itself
  so the arrowhead and dot movement always agree, and both disappear at idle
  while the link remains. The PV and Home cards are sized 70% × 60% and the Grid
  card 70% × 70% of the original node card; the Battery card is 90% of the
  original width (223 × 220). PV, Grid and Home outer surrounds are now the
  same 255 px width as Battery, while their inner cards stay 174 px wide and
  start at Battery's 16 px left inset. The ring around the Inverter is a further
  20% smaller in both radius (151 → 121)
  and stroke (11 → 9), and node halos and link endpoints follow the surrounds.
  The visible gaps to the Inverter are 88.5 px for Grid and Home, 70 px for PV
  and 100 px for Battery, on a 1200 × 1081 canvas; the Inverter's Temperature
  and Status rows are centred inside its ring. Grid
  is active at any non-zero power (importing or exporting) and idle only at 0,
  so sub-watt flows still animate. Grid no longer shows the frequency detail
  row, and label/value gaps in all detail rows are tighter. Entity mappings are
  config-overridable and the card is addable to any dashboard.

## Requirements

- Home Assistant 2026.6 or newer;
- a Deye inverter whose entities are available in Home Assistant;
- **[Sunsynk / Deye Inverter Add-on (multi)](https://github.com/kbialek/deye-inverter-mqtt) by kbialek** — required to publish Deye inverter data/control entities over MQTT for this integration to use;
- optional: the Solcast PV Forecast integration, a weather entity, an energy
  price entity.

## Supported inverter connections

| Profile | How the inverter reaches Home Assistant |
|---|---|
| **Sunsynk / Deye MQTT** (default) | Uses MQTT discovery entities published by the **[Sunsynk / Deye Inverter Add-on (multi)](https://github.com/kbialek/deye-inverter-mqtt)**. Full control of work mode, sell power and the six TOU slots; battery current limits are set separately in **Inverter configuration**. |
| Deye add-on (read-only) | `kbialek/deye-inverter-mqtt` readings only; control is refused (fail closed). |
| Custom | Map any entities and give the exact option values yourself. |

### Deye over MQTT

With the Sunsynk profile the default entity mapping already matches the usual
MQTT discovery names (`select.deye_load_limit`, `number.deye_max_sell_power`,
`number.deye_battery_max_charge_current`, `select.deye_prog1_time` …,
`sensor.deye_battery_soc`, `sensor.deye_grid_power` and so on). TOU time
options are exposed as `H:MM` (for example `0:00`, `23:30`) and the integration
accepts that format. Physical battery current number entities can be mapped in
the configuration wizard; the **Inverter configuration** settings tab validates
each value against the live entity's own range. Anything that does not match can
be re-mapped in the configuration wizard.

The wizard performs a **read-only capability test** before anything is saved
and lists which features (selling, charging and full TOU) are available for the
selected entities.

### Mirrored charge defaults

A fresh install uses safe defaults: 0 W sell power, grid charging enabled and a
100% charge target. Existing installations receive a one-time `sa_defaults_v1`
migration that replaces only the original grid-charge-disabled template; a
profile you have edited since is kept as-is. Battery charge, discharge and
grid-charge currents are no longer part of any profile or schedule. Set them
directly in the **Inverter configuration** card, which calls
`deye_energy.apply_inverter_configuration_group` and writes only the three
configured physical number entities. A positive grid-charge current is only a
limit; Grid Charge permission remains a separate TOU setting.

### Inverter configuration

The **Inverter configuration** card (`custom:deye-energy-inverter-config-card`)
is a standalone card, separate from the main Energy Manager settings. The
`deye-energy` dashboard includes it on its own **Inverter config** tab; you can
also add it manually to any dashboard.

The card groups inverter configuration in sub-tabs/groups: Inverter, Grid,
Battery settings in inverter, Battery settings, Mode & control, Specification,
Voltages, Power, Battery, and Energy. Live values are loaded from
the inverter every time the page is accessed (and can be refreshed manually). A
field whose entity is missing, unavailable or has no usable metadata is shown as
**Not mapped** or **Unavailable** and stays read-only; the backend refuses to
write it.

Each editable group has its own **Apply** button. All values in the group are
prevalidated against the live entity's own `min`, `max`, `step` or `options`
before anything is written. Before upload, the card shows a confirmation overlay
with **Field | Previous (live) | New** values; upload happens only after explicit
confirmation. Writes then run sequentially and stop at the first failure (there
is no rollback). After a successful apply, the card refreshes live values. Two
response-only services expose the same behaviour:
`deye_energy.get_inverter_configuration` and
`deye_energy.apply_inverter_configuration_group` (fields `group` and `values`).

The three battery/grid current limits live in **Battery settings in inverter**
and are the only direct write path for those entities. Schedule slots, profiles,
defaults, manual sell/charge and automatic reconciliation never write them.

**Inverter time sync**: The Inverter configuration card shows inverter and Home
Assistant time. Use **Sync now** to write the current Home Assistant time to the
configured inverter datetime entity. The backend also runs a periodic 6-hour
drift check and force-syncs the inverter clock when any hour, minute, or second
deviation is detected.

## Quick start

1. Install through HACS (custom repository) or copy
   `custom_components/deye_energy` into your `custom_components` folder.
2. Restart Home Assistant.
3. **Settings → Devices & services → Add integration → Deye Energy**.
4. Choose the inverter communication type (for MQTT choose **Sunsynk**), select
   the inverter device, review the mapped entities and confirm.
5. Add the card to a dashboard:

   ```yaml
   type: custom:deye-energy-card
   ```

In the default **UI/storage mode** the integration automatically registers its
bundled card resource. In **YAML mode** add the resource manually:

```yaml
lovelace:
  resources:
    - url: /deye_energy/deye-energy-card.js?v=0.8.0.88
      type: module
```

See [INSTALL.md](INSTALL.md) for the full procedure.

## Stored slots and manual schedules

The stored schedule uses 48 half-hour slots (keys such as `0530_0600`). Legacy
hourly keys such as `05_06` still work and apply to both halves of the hour. All
slot times are half-hour aligned.

The **Manual schedule** tab is the first schedule tab and is the default when
no active source has been chosen. Its rows can start and end at any whole
minute, cover the complete 24 hours and are stored independently of the slot
schedule. When activated:

- manual values are applied as an overlay and the stored slots are not changed;
- manual rows do not overwrite physical work-mode or minimum sell-price fields;
- battery charge, discharge and grid-charge currents are not part of any
  schedule and are changed only through **Inverter configuration**;
- disabling manual mode returns the scheduler to the stored schedule slots.

The manual table columns are **From**, **To**, **Mode**, **Sell power**,
**Grid charging**, **Stop selling at SOC**, **Active** and **Action**. Rows are
read-only by default; use the edit icon to change a row, and **Save** to leave
edit mode. Enable/Disable saves internally without clearing edit mode, new rows
start read-only, and removing a row asks for confirmation. The row covering the
current time has a slow blue pulse so the active window is easy to spot. The
manual header also contains the shared Settings gear and Deye control button.

Manual rows no longer carry a separate `tou_soc` value. **Stop selling at SOC**
is the `minimum_sell_soc` field and is unchanged; any legacy `tou_soc` value is
ignored when older data is loaded or saved.

## Deye Time Of Use

The **Deye Time Of Use** tab on the schedule page maps the full
day onto six physical Deye ranges. All six rows are edited directly in the
table — there is no separate overlay or second mapping tab. From and To times,
Mode, Charge, Sell, Power, Voltage and SOC are inline controls; the first From
and last To are fixed at `00:00`, and each To follows the next row's From.

- **Save** validates the entire day before writing: it must start at `00:00`,
  end at `00:00`, and have no gaps or overlaps between rows. SOC must be between
  0 and 100%. Any error is shown in the table with the specific offending row.
- **Rollback** force-refreshes the TOU entities from the inverter, discards all
  local edits, rebuilds every row from the live values and reports the result.
- Both buttons sit at the bottom of the table. Save is disabled for read-only
  providers, while a save is pending or while Deye control is not Active;
  Rollback is disabled while a save is pending.
- The tab keeps the operation status and schedule-synchronisation summary, so
  confirmed writes and reverse-sync changes remain visible.

## Octopus Energy, tariff and currency

Prices are shown in pounds (£). The integration is set up for **Octopus Energy**
through the Octopus Energy Home Assistant integration:

| Item | Default |
|---|---|
| Tariff | Intelligent Octopus Go (`intelligent_go`) |
| Peak rate | 32.81 p/kWh (`0.3281`, the price-capped rate shown by the integration) |
| Off-peak rate | 6.60 p/kWh (`0.066`), 23:30–05:30 |
| Import price entity | `sensor.electricity_<serial>_<mpan>_current_rate` |
| Export price entity | `sensor.octopus_energy_electricity_<serial>_<mpan>_export_current_rate` |

The **Octopus Energy** price adapter understands two kinds of entity:

- the Octopus Energy `current_day_rates` / `next_day_rates` event entities, whose
  `rates` list holds half-hourly `value_inc_vat` prices (averaged into hours,
  so Agile works when those events are enabled);
- the `current_rate` sensors, whose `start`/`end` attributes define a validity
  window (a flat export rate such as Outgoing covers today and tomorrow).

The bundled `tariff_catalog.json` lists Octopus Energy products. Intelligent
Octopus Go carries your account's rates; Agile needs the rates events, and
Flexible needs your own unit rate (enter it in manual mode). Change the plan or
enter your own values in the card under **Settings → Tariff and distribution**.

### Known limitations of the tariff engine

- the daily **standing charge** (56.61 p/day) is not modelled;
- the schedule and the physical TOU ranges use half-hour slots, but the price
  rows and the manual tariff engine still work in whole hours, so the 23:30 and
  05:30 edges of the off-peak window are priced as 23:00–05:00 (the TOU ranges
  themselves can start at 23:30 and 05:30);
- there is no manual flat export rate (for example a fixed 12 p/kWh): export
  value comes from the export price entity you map;
- Intelligent Octopus Go dispatch slots are not used for pricing.

## Safety

- Schedule decisions are made locally from the active slot rows and live sensor
  readings.
- This software **does not replace hardware protection** of the inverter or
  the battery; keep the limits configured on the inverter itself.
- Missing SOC, price or readback data always fails closed: no write happens.
- The master **Deye control** switch blocks every physical write.

## Development

```bash
python3 -m pytest -q                    # full Python suite
for file in tests/*.js; do node "$file"; done  # all frontend suites
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues:
<https://github.com/maverik-77/deye-energy/issues>.

## Upstream project

This English edition is adapted from the original
[deye-energy-manager](https://github.com/pasierbrg/deye-energy-manager) project.
The original copyright notice is kept in [LICENSE](LICENSE).
