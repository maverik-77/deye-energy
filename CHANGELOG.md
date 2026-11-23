# Changelog

All notable changes to Deye Energy. Versions before 0.8.0 are the history of the
upstream Deye Energy Manager project and are not repeated here. Attribution is
recorded at the bottom of README.md.

## [Unreleased]

## [0.8.0.84] - 2026-11-23

### Added

- **Power flow display editor**: the Inverter configuration card can edit node
  entities, ordered detail rows and chip rows, including removing and reordering
  built-in detail rows. Saved settings persist through the backend override.

### Changed

- **Power flow node surrounds**: PV, Grid and Home outer surrounds now match
  Battery at 255 px while their inner cards stay 174 px wide. Flow endpoints and
  the 1200 × 1081 canvas were recalculated to preserve the 44 px margin.

## [0.8.0.81] - 2026-11-23

### Added

- **Shared MQTT entity map**: `mqtt_entity_map.json` and `entity_map.py` provide
  one catalogue of MQTT-discovered entity IDs with profiles named after the
  inverter providers (`sunsynk`, `solarman`, `deye_addon`, `lewa_reka`,
  `custom`). An optional `/homeassistant/deye_energy_entity_map.json` override
  is deep-merged over the bundled defaults; config-entry mappings still win and
  an invalid or unreadable override fails closed to the bundled map. Setup,
  config flow, settings fields and the manager now all read from this map.

### Changed

- **Power flow Grid activation**: the Grid node, its link and the
  Importing/Exporting labels activate at any non-zero power and stay idle only
  at exactly 0 W (0 kWh in energy periods). Active links pass a
  guaranteed-active value to the flow renderer so sub-10 W flows still animate.
- **Power flow geometry**: the Inverter ring is a further 20% smaller (151 → 121
  radius, 11 → 9 stroke) and the Battery card is 90% of its previous width
  (248 → 223). Visible gaps to the Inverter are now 70% for Grid and Home, 80%
  for PV and 230% for Battery, on a taller 1200 × 980 canvas. Temperature and
  Status are centred inside the Inverter ring.
- **Docs/tests**: README, INSTALL and release notes describe the shared entity
  map and the new Power Flow behaviour; tests cover the map profiles and
  override precedence, Grid activation at 0.5 W, and the new geometry; bumped
  the card resource revision and versioned docs.

## [0.8.0.80] - 2026-11-23

### Changed

- **Power flow node sizing**: PV and Home cards are now 174×132 (70% × 60% of
  the original 248×220), Grid is 174×154 (70% × 70%), and Battery is unchanged.
  Node halos and link endpoints were recalculated to keep links meeting each
  card's outer edge. The Inverter ring shrank by 10% in both radius (168 → 151)
  and stroke width (12 → 11).
- **Power flow details**: removed the Grid Frequency row and tightened the
  label/value gap in every detail row (`space-between; gap:10px` →
  `flex-start; gap:5px`).
- **Docs/tests**: README describes the new card proportions, ring and detail
  spacing; power-flow tests cover the new sizes, link/halo coordinates, ring
  dimensions, removed Frequency row and detail-row style; bumped the card
  resource revision and versioned docs.

### Fixed

- Restored visible flow lines and glow on the straight Power Flow links by
  giving `#pf-line-glow` an explicit `userSpaceOnUse` region and putting an
  explicit `stroke-width="4"` back on the path markup. The old object-bounding-
  box filter collapsed to zero area on axis-aligned links.

## [0.8.0.79] - 2026-11-23

### Changed

- **Power flow animation**: replaced the discrete SMIL glow balls with the
  Energy Status card's animated stroke-dash dots. Active links now carry a
  scrolling `1 22` dot pattern along the whole path at a speed controlled by
  the `flow_animation_speed` config option (default 6, clamped 1–20), with a
  tighter `1 18` variant on small screens. Each link keeps a persistent
  background path; at idle the dots and arrowhead disappear while the link
  remains. The arrowhead still follows the flow direction, which is carried by
  the path geometry.
- **Docs/tests**: README now describes the CSS-dash animation and its config
  option; power-flow card tests cover the dash classes, timing formulas,
  mobile variant and idle links; bumped the card resource revision and
  versioned docs.

## [0.8.0.78] - 2026-11-23

### Added

- **Power flow summary row**: four new widgets above the PV/Grid/Battery/Home
  chips — Overall grid (green import and export power), Electricity (blue import
  energy today and red cost today), Gas (blue import today and red cost today)
  and Export (blue export energy today and green income today). Both values in
  each widget share the same font format. The eight source entities are exposed
  as config-overridable defaults.

### Changed

- **Power flow animation**: glow balls now travel the full length of each link
  instead of stopping partway, keep a tight constant spatial gap, and move at a
  speed scaled to the power magnitude (faster at high flow, slow at low flow).
- **Flow direction**: direction is carried by the link path, so the arrowhead
  flips and the glow balls follow it when grid or battery power reverses. At
  idle the link stays visible while the arrowhead and balls disappear.
- **Docs/tests**: README now describes the summary widgets and flow behaviour;
  extended power-flow card tests for spacing, speed, full-path travel, direction
  reversal and idle links; bumped the card resource revision and versioned docs.

## [0.8.0.77] - 2026-11-23

### Changed

- **Power flow links**: links now run from the outer edge of one node to the
  next, with thinner strokes and a narrower glow. Arrow markers have a proper
  viewBox so arrowheads render whole instead of being clipped.
- **Power flow layout**: the inverter image is centred inside its pink ring and
  the ring encloses the node without crossing it. Added thin coloured rounded
  squares around the PV, Grid, Home and Battery nodes on a taller diagram, with
  links and flow balls updated to travel between the shapes.
- **Node clicks**: removed a duplicate click listener that opened the Home
  Assistant more-info dialog twice for every node and consumer.
- **Tests/docs**: extended the power-flow card tests for the new geometry,
  halos and click handling; bumped the card resource revision and documentation
  versions.

### Fixed

- Clicking any of the five power-flow nodes no longer reopens the linked entity
  dataset after the dialog is closed.

## [0.8.0.76] - 2026-11-23

### Changed

- **Power flow node images**: enlarged the node icon tiles and images, tightened
  the active glow to hug each image, and removed the oversized pulsing ring.
- **Node image assets**: replaced the five light and five dark node images with
  the updated square PNG references, deleted the old JPEG assets, and restored
  full-image alignment with the Battery SOC bar at the bottom of the icon.
- **Integration/brand icons**: all icon and branding assets now use the new
  Integration image as their base; light and dark assets are identical.
- **Banner**: updated the integration icon in `docs/banner.svg` to the same image.
- **Tests/docs**: updated power-flow card tests for the new image paths and
  alignment; bumped the card resource revision and documentation versions.

## [0.8.0.75] - 2026-11-23

### Changed

- **Power flow node images**: replaced the PV, Grid, Inverter, Home and Battery
  emoji with theme-aware raster icons; dark variants follow Home Assistant dark
  mode. Active nodes now get a coloured glow and a stronger pulsing ring.
- **Battery SOC bar**: the Battery node shows a proportional SOC bar with colour
  by charge level: red below 20%, amber from 20% to 49%, green at 50% and above,
  and an empty grey track when SOC is unavailable.
- **Integration/brand icons**: the Hybrid inverter image is now used for the
  integration and HACS brand icons at 256/256 and 512/512, with its dark variant
  for the dark assets and both `icon.svg` files embedding the same image.
- **Tests/docs**: extended power-flow card tests for node images, dark-mode
  switching, active glow and SOC bar colours; updated README and install docs.

## [0.8.0.74] - 2026-11-23

### Changed

- **Integration icon**: replaced the integration/brand icon assets with a new
  Deye-based icon.
- **Documentation**: removed Solarman, Solar Assistant and ESPHome Deye Inverter
  references from the README; the kbialek **Sunsynk / Deye Inverter Add-on
  (multi)** is now shown as required for MQTT data in this integration.

## [0.8.0.73] - 2026-11-22

### Changed

- **Manual schedule battery charge**: added a **Battery charge** column to the
  Manual schedule, stored as `battery_charge_enabled` in manual schedule rows.
- **Schedule enforcement**: when Manual schedule is active, the current row’s
  `battery_charge_enabled` is enforced on `switch.deye_grid_charge_enabled`
  during ticks and immediately on activate/save/init-from-TOU.
- **Trigger logging**: battery charge switch toggles triggered by the Manual
  schedule are recorded in trigger logs, including failures.
- **Power flow geometry**: replaced bent Bezier flow paths with straight
  edge-anchored paths so arrows and glow reach node edges cleanly; increased
  power-flow viewBox/spacing for clearer layout.
- **Power flow sizing**: increased power-flow card/SVG min-heights and added
  full-width card styling so the card fills its dashboard container; updated
  power-flow contract tests.
- **Power flow battery sign**: in power mode, battery sensor is treated as
  positive = discharging/releasing, negative = charging; displayed battery power
  is flipped accordingly (`-battP`), and charge/discharge flow/labels follow
  that convention.
- **Power flow power formatting**: values below `10000 W` display in watts;
  `10000 W` and above display in kW with one decimal.
- **Power flow home consumption**: in power mode, home load is calculated as
  `max(0, pv + gridImport + battDischarge - (gridExport + battCharge))`, the
  same formula as Energy Status “House (Loads)”; energy-period mode still uses
  configured load energy entities/stats.
- **Power flow period stats**: 24h/week/month statistics fetch now accepts
  wrapped `statistics` responses and `change/sum/state` numeric values, clears
  stale period stats on new fetch, and logs fetch failures to console.
- **Power flow period responsiveness**: period selection uses a fetch race guard
  so newer period clicks override in-flight requests and stale responses are
  ignored.

## [0.8.0.71] - 2026-11-21

### Changed

- **Power flow consumers**: added optional `consumers` config to
  `custom:deye-energy-power-flow-card`, rendering named consumer cards with live
  power, icons, active state, click-to-more-info, and optional `type: rest`
  untracked-load calculation.
- **Energy period switching**: added `view.energy_periods` selector
  (`power/today/24h/week/month`) with live power mode and energy-period display
  using configured daily/statistics energy entities where available.
- **Tests/docs**: extended power flow contract tests and updated documentation.

## [0.8.0.70] - 2026-11-21

### Changed

- **Power flow data density**: enhanced `custom:deye-energy-power-flow-card`
  with richer per-node details while keeping curved/glowing animated flows.
- **Node details**: added daily PV, grid import/export/voltage/frequency, inverter
  temperature, home daily consumption, and battery SOC/voltage/current/temperature
  plus daily charge/discharge details.
- **Layout/interaction**: kept responsive page-fitting SVG layout, glowing node
  widgets, and per-node click to open Home Assistant more-info.
- **Tests/docs**: extended power flow contract tests and updated documentation.

## [0.8.0.69] - 2026-11-21

### Changed

- **Power flow card visual overhaul**: redesigned `custom:deye-energy-power-flow-card`
  for a larger, page-fitting, responsive layout (`100%` width/height, scalable SVG
  with `preserveAspectRatio`).
- **Curved animated flows**: replaced straight lines with curved Bezier flow paths,
  directional arrows, and glowing animated balls/particles proportional to power.
- **Glowing node widgets**: added glowing icon halos, active pulse rings, glass
  node cards, ambient background glow, and stronger status/value typography.
- **Power flow tests**: updated contract tests for curved paths, responsive
  scaling, glow/icon filters, and click/more-info behavior.

## [0.8.0.68] - 2026-11-21

### Changed

- **Power flow card redesign**: redesigned `custom:deye-energy-power-flow-card`
  with a larger canvas, glass/gradient styling, stronger node cards, animated
  glow balls along active flows, directional arrows, power-proportional motion,
  summary strip, and improved active/inactive visuals.
- **Power flow details**: clicking any node opens Home Assistant more-info for
  the node's configured entity.
- **Power flow tests**: extended contract tests for larger layout, glow/arrow
  markup, click hooks, and more-info dispatch.

## [0.8.0.67] - 2026-11-21

### Added

- **Power flow card** (`custom:deye-energy-power-flow-card`): new live power
  flow card showing PV, Grid, Inverter, Battery, and Home nodes with animated
  directional flow lines, active/inactive styling, SOC/status labels, missing
  entity warnings, and config-overridable entity mappings.
- **Power flow dashboard tab**: added a dedicated Power flow view to the Deye
  Energy dashboard containing the power-flow card.
- **Power flow contract tests**: added `tests/test_power_flow_card.js` covering
  card registration, defaults, entity mapping, flow rendering, and status labels.

### Changed

- **Graphs hover interaction**: graphs now show dotted crosshair lines to bottom
  (time/X) and left (value/Y) on hover, with a bottom readout showing hovered
  time and all series values at the nearest X position.
- **Graphs tests**: extended `tests/test_graphs_card.js` to cover hover markup
  and interaction hooks.

## [0.8.0.66] - 2026-11-21

### Added

- **Graphs card range options**: Added `7d`, `30d`, and `1y` preset ranges plus
  a custom From/To date+time range selector in `custom:deye-energy-graphs-card`.
- **Graphs card tests**: Added `tests/test_graphs_card.js` covering range
  presets, group sub-tabs, full-width layout, custom range controls, and
  minimal_response history parsing.

### Changed

- **Graphs documentation**: Updated README and release notes to document the
  expanded graph range controls and custom date+time selection.

## [0.8.0.65] - 2026-11-21

### Fixed

- **Graphs card history parsing**: Fixed empty graphs when Home Assistant history
  is fetched with `minimal_response`/`no_attributes`, where `entity_id` is only
  present on the first item of each entity history array.

### Changed

- **Graphs card layout**: Added sub-tabs for `Power flow`, `Inverter`, `Grid`,
  `Load`, and `Battery`, and render charts full-width within the selected tab.
- **Release/test maintenance**: Removed brittle hardcoded release-version pins
  from tests and dashboard comments; kept version metadata in manifest, frontend,
  manager diagnostics, card JS, README, INSTALL, release notes, and changelog.

## [0.8.0.64] - 2026-11-21

### Added

- **Graphs card** (`custom:deye-energy-graphs-card`): new history graph card for
  inverter, grid, load, and battery metrics. Includes 1h/6h/24h range selector,
  responsive SVG charts, and grouped sections for Power flow, Inverter, Grid,
  Load, and Battery. Default entity mappings are overridable via card config.
- **Graphs dashboard view**: added a `Graphs` view to
  `dashboard/energy_manager.yaml` containing only the graphs card, avoiding
  duplicate charts across existing views.

### Changed

- **Manual schedule active row**: replaced the large row glow with a tighter
  text/icon-only pulse (2.4s) so the current row is more visible without
  highlighting the whole row background.

## [0.8.0.63] - 2026-11-21

### Fixed

- **Sunsynk TOU entity mappings**: On setup, Deye Energy now auto-fills missing
  Sunsynk Time Of Use entity mappings for `mode`, `charge`, `sell`, `power`, and
  `voltage` (slots 1-6) when the matching default Home Assistant entities exist
  (`select.deye_prog{n}_mode`, `select.deye_prog{n}_charge`,
  `switch.deye_prog{n}_sell`, `number.deye_prog{n}_power`,
  `number.deye_prog{n}_voltage`). Existing user mappings are never overwritten.
  This fixes Mode/Charge/Sell/Power/Voltage showing as Unavailable in the Deye
  Time Of Use table for existing Sunsynk entries where these mappings were not
  populated.

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
