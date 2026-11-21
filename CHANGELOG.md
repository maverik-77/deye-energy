# Changelog

All notable changes to Deye Energy. Versions before 0.8.0 are the history of the
upstream Deye Energy Manager project and are not repeated here. Attribution is
recorded at the bottom of README.md.

## [Unreleased]

## [0.8.0.62] - 2026-11-21

### Changed

- **Inverter configuration card**: Added a render-signature guard to avoid
  unnecessary full DOM rebuilds on every Home Assistant state update, improving
  tab responsiveness.
- **Deye Time Of Use settings**: Added robust fallbacks to capability/diagnostics
  actual values for TOU fields (including Mode/Charge/Sell/Power/Voltage) and
  refresh the diagnostics entity when opening/refreshing the TOU tab, reducing
  cases where table data appears unavailable.
- **Card styling**: Aligned Trigger logs and Inverter configuration card
  backgrounds/border/text vars with the main Deye Energy dark blue card theme.

## [0.8.0.61] - 2026-11-21

### Changed

- **Inverter configuration**: Moved from the main Energy Manager settings tab to
  a standalone card (`custom:deye-energy-inverter-config-card`) with its own
  **Inverter config** tab on the `deye-energy` dashboard. The card keeps the
  existing editable groups and read-only monitor sections, uses a responsive
  layout without a fixed height, and loads live inverter values on every page
  access (with manual refresh).
- **Inverter configuration apply confirmation**: Before uploading an editable
  group, the card shows a confirmation overlay with **Field | Previous (live) |
  New** values; upload happens only after explicit confirmation, then live values
  are refreshed.
- **README**: Documented the standalone inverter configuration card/dashboard
  tab, live-load-on-access behavior, and confirmation-before-upload flow.

## [0.8.0.60] - 2026-11-21

### Changed

- **README**: Documented inverter time sync in Inverter configuration (inverter/
  Home Assistant time display, **Sync now**, and periodic 6-hour drift-check
  scheduler with force-sync on any hour/minute/second deviation).

## [0.8.0.59] - 2026-11-21

### Added

- **Deye Time Of Use settings**: slots 1–6 now expose editable `Mode`,
  `Charge`, `Sell`, `Power`, `Voltage` and `SOC` fields in the TOU table.
  `Mode` uses live entity options with fallback
  `None, General, Backup, Charge`.
- **Inverter datetime sync**: Inverter configuration shows inverter/HA time and
  a **Sync now** action; backend reports datetime status and performs a 6-hour
  drift check that force-syncs on any hour/minute/second deviation.

### Changed

- **Trigger logs card** (`custom:deye-energy-trigger-logs-card`): full-height
  flex layout fills available card space, table header is sticky with only rows
  scrolling, hass-update rerenders preserve scroll position (fixing mobile
  scroll jump), and logs are paginated at 20 entries per page with Prev/Next
  controls.
- **Manual schedule**: current active row highlight now uses text-only glow
  (no row background/box shadow) with a 4s ease-in-out pulse ramping from 0 to
  full intensity.
- **Inverter configuration catalog**: expanded direct-MQTT inverter
  configuration mappings/catalog coverage.

### Fixed

- **`deye_energy.set_tou_slot`**: accepts optional `mode`, `charge`, `sell`,
  `power` and `voltage` fields with validation/capability checks; legacy
  `grid_charge` remains backward-compatible and ambiguous `grid_charge`+`charge`
  payloads are rejected.

## [0.8.0.58] - 2026-11-20

### Added

- **Trigger logs**: `sensor.*_trigger_logs` and dashboard card
  `custom:deye-energy-trigger-logs-card` (addable to any dashboard) logging
  every individual physical inverter write with timestamp, target entity,
  service/value, success/failure status and error/source context.
- Trigger log time filter (Past hour, Past 2 hours, Day, Past 24 hours, Past
  week, Past 30 days) with 30-day retention and bounded persistent storage
  (safety cap). **Day** shows entries since local midnight; other ranges are
  rolling windows.

## [0.8.0.57] - 2026-11-20

### Added

- **Energy status**: an independent **Save PV** button in the PV generation row
  saves only `pv_enabled` through the existing
  `deye_energy.save_energy_status_display` service, preserving unsaved
  mapping/visibility draft edits. **Save sensor display** continues to save the
  full payload.

### Changed

- On first integration install/setup/start, `number.deye_battery_restart_capacity`
  (**Start battery discharge**) is set to **10% once** as a best-effort
  initialization. If the entity is missing, unknown/unavailable or the write
  fails, a warning is logged and initialization is retried on the next start;
  if it is already ~10% it is marked done without a write, and once recorded it
  is never changed automatically again.
- Manual schedule: the current active row glow/highlight is more pronounced
  (stronger amber text glow with a subtle row background/outline) for clearer
  visibility.

### Fixed

- **TOU mapping**: time validation/normalization now accepts and canonicalizes
  `H:MM`/`HH:MM` mapping start/end values to `HH:MM` without changing
  range/contiguity/SOC logic.
- **Energy status flow (PV disabled)**: Grid tile and grid↔inverter
  connection/flow remain at the bottom position and port in desktop and mobile
  layouts when PV generation is disabled (PV slot left empty), so the
  grid↔inverter line stays in the standard location.

## [0.8.0.56] - 2026-11-20

### Changed

- **Inverter configuration** now targets the direct-MQTT Deye device mappings
  for the fields provided: `start_battery_discharge_capacity` →
  `number.deye_battery_restart_capacity`, `stop_battery_discharge_capacity` →
  `number.deye_battery_shutdown_capacity`, and grid voltage/frequency are shown
  as live read-only sensors from `sensor.deye_grid_voltage` /
  `sensor.deye_grid_frequency` (replacing writable grid V/f limit fields).
- Removed inverter-configuration fields/groups with no direct-MQTT mapping from
  the UI (including `inverters_1_*`-backed auxiliary, battery-type, battery
  charge-voltage, remote/off-grid/grid-charge/output-shutdown/start-grid-charge,
  solar-export-when-full and energy-pattern fields), dropping now-empty
  Auxiliary and Battery type groups.

### Fixed

- Energy status PV-flow re-render: when PV generation is toggled, the card now
  detects Energy status display changes and reschedules a render so
  grid↔inverter flow/glow and layout rebuild correctly when PV is disabled.

## [0.8.0.55] - 2026-11-20

### Added

- **Inverter configuration** settings tab mirroring the Solar Assistant
  configuration page: Specification, Grid, Auxiliary, Battery type, Battery
  charging, Work mode and Work mode detail. Live values are loaded on page load,
  on tab open and after each group apply. Unmapped, unavailable or
  metadata-less fields display as **Not mapped** / **Unavailable** and are
  read-only.
- Response-only services `deye_energy.get_inverter_configuration` and
  `deye_energy.apply_inverter_configuration_group`. A group apply prevalidates
  every supplied value against the live entity's `min`, `max`, `step` or
  `options`, then writes sequentially and stops at the first failure without
  rollback.
- **PV generation** toggle in **Settings → Energy status sensors**
  (`pv_enabled`, default `true`). PV sensor mappings/visibility rows remain
  configurable but are ignored while PV generation is disabled.

### Changed

- Battery charge, discharge and grid-charge currents are now owned exclusively
  by the Inverter configuration tab and are no longer managed by Work Schedule,
  profiles, defaults, manual sell/charge, optimizer plans or automatic
  reconciliation. Grid charge current is only a limit; Grid Charge permission
  remains a separate TOU setting.
- When PV generation is disabled, PV is removed from the Energy status
  desktop/mobile layouts and treated as unavailable/zero in Energy status flows,
  telemetry, optimizer/planner inputs, forecasts, simulations and AI/plan
  analysis/state. When PV generation is enabled, existing behavior and layout
  are unchanged.

### Fixed

- Card lifecycle/connect-disconnect handling: prevented duplicate interaction
  listeners on reconnect and cleared pending interaction/save timers on
  disconnect.
- PV-disabled Solcast/learning/AI analysis surfaces: current-day metrics,
  forecast readings, daily/learning summaries and AI snapshot Solcast context no
  longer leak active PV/forecast analysis when PV generation is disabled.

### Removed

- Current helper number entities, per-slot current fields, and the superseded
  `set_current_limits` design.
- Unused Energy status role-group helper code in the card.

## [0.8.0]

### Added

- English-language integration, card, services and tests.
- Sunsynk (MQTT) inverter profile as the default, with pre-filled entity names.
- Octopus Energy price adapter and tariff catalogue (Intelligent Octopus Go, Agile, Flexible); defaults match an Intelligent Octopus Go account with Outgoing export.
- `GBP/kWh` and `GBP/MWh` accepted as price units.
- Editable 24 h Deye Time Of Use mapping in Settings and diagnostics, with a
  forced inverter refresh on open and save-only full-day validation.
- Manual schedule tab with editable variable-length rows covering the full 24 h.
  The rows are stored separately from the work schedule; activating snapshots the
  work schedule, maps the rows onto the 48 slots by slot start time and blocks
  AI, optimizer and future-plan applies until deactivated.
- Energy status sensor editor backed by a versioned role catalog: per-role
  source-entity overrides and visibility choices are validated and persisted by
  the integration.
- Manual schedule current-row highlight, explicit row editing workflow and
  confirmation before removing a row.
- Deye TOU slot editor with **Apply to Inverter** only for changed drafts and
  **Rollback** that reloads the values currently reported by the inverter.

### Changed

- The work schedule uses 48 half-hour slots (keys such as `0530_0600`); hourly plan keys such as `05_06` still work and apply to both halves. Deye TOU ranges may start and end on :00 or :30.
- Energy status power readouts use W below 10 kW and kW at or above it; the Sold today tile uses a pound icon.
- Manual schedule rows no longer store a separate `tou_soc` value; legacy values are ignored.
- Fresh installs and a one-time `sa_defaults_v1` migration use the mirrored Solar Assistant profile: 290 A battery charge, grid-charge and discharge current, 0 W sell power and grid charging enabled. Editable current helpers are capped at 300 A.
- The README documents all current functionality, upstream attribution is consolidated at its end, and the banner no longer duplicates the badges shown below it.

- Integration domain `deye_energy`, card `deye-energy-card`, resource revision
  `v=0.8.0.54`.
- Existing `deye_addon` config entries migrate to the writable `sunsynk` provider.
- Currency, number and date display use pounds and the `en-GB` locale.
- Deye Time Of Use options in `H:MM` format are parsed; the battery current cap is
  raised from 240 A to 320 A.
- Canonical manager modes are `Selling`, `Charging` and `Normal Operation`.
- Weekdays use `mon` … `sun`; legacy values are still accepted.

### Removed

- previous-language documentation, screenshots and the previous translation file.

### Known limitations

- No standing charge, hourly-only tariff resolution, no manual flat export rate, no dispatch-slot pricing.
- Octopus unit rates in the catalogue were read from the account on 2026-11-09 and must be kept current by the user.
