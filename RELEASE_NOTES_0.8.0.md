# Deye Energy 0.8.0

Card resource revision: `v=0.8.0.77`.
Repository: <https://github.com/maverik-77/deye-energy>.

Deye Energy 0.8.0 is the English-language edition of the original
deye-energy-manager 0.8.0 release candidate, adapted to a Deye inverter
integrated through MQTT. Attribution is recorded at the bottom of README.md.

## Revision history

- `v=0.8.0.77` — Fixed power-flow links so they connect the outer edges of the
  node shapes: thinner lines and glow, and arrowheads with a proper marker
  viewBox so they are no longer clipped. Centred the inverter image inside its
  pink ring and resized the ring to enclose the node. Added thin coloured
  rounded-square halos around the PV, Grid, Home and Battery nodes on a taller
  diagram, with links and flow balls adjusted to travel between the shapes.
  Removed the duplicate click listener that opened the Home Assistant more-info
  dialog twice for every node and consumer. Updated tests and versioned docs.
- `v=0.8.0.76` — Enlarged the power-flow node icons, tightened the active glow
  around each image and removed the oversized pulsing ring. Replaced all five
  light and five dark node images with the updated square PNG references,
  deleted the old JPEG assets, and restored full-image alignment with the
  Battery SOC bar at the bottom of the icon. Rebased every integration/brand
  icon on the new Integration image and updated the icon in `docs/banner.svg`;
  refreshed tests and versioned documentation.
- `v=0.8.0.75` — Replaced the five power-flow node emoji with theme-aware
  images (dark variants follow Home Assistant dark mode), added a coloured glow
  and stronger pulsing ring to active nodes, and added a proportional Battery
  SOC bar coloured by charge level (red below 20%, amber 20–49%, green at 50%+,
  grey when unavailable). Reused the Hybrid inverter image and its dark variant
  for all integration/brand icons at 256/256 and 512/512, with both `icon.svg`
  files embedding the same image; extended card tests and updated docs.
- `v=0.8.0.74` — Replaced integration/brand icon assets with a new Deye-based
  icon and cleaned up documentation: removed Solarman, Solar Assistant and
  ESPHome Deye Inverter references from the README, and documented the kbialek
  Sunsynk / Deye Inverter Add-on (multi) as required for MQTT data.
- `v=0.8.0.73` — Added Manual schedule **Battery charge** column associated with
  `switch.deye_grid_charge_enabled`, persisted in manual schedule rows, enforced
  per active manual schedule, and logged in trigger logs when toggled. Fixed
  `custom:deye-energy-power-flow-card`: straight edge-anchored flow geometry,
  larger viewBox/min-heights/full-width styling, battery sign convention
  (positive = discharging, negative = charging; display flipped), W/kW
  formatting threshold at `10000 W`, power-mode home load calculated like Energy
  Status “House (Loads)”, robust 24h/week/month statistics parsing, and
  period-selection race-guard responsiveness; updated power-flow contract tests.
- `v=0.8.0.71` — Added optional consumers (including `rest` untracked load) and
  energy period switching (`power/today/24h/week/month`) to
  `custom:deye-energy-power-flow-card`, with live consumer power, click-to-more-info,
  and period-aware energy/statistics display where configured; updated tests/docs.
- `v=0.8.0.70` — Enhanced `custom:deye-energy-power-flow-card` with richer
  integration-style node details (daily PV/grid/battery/home energy, grid
  voltage/frequency, battery SOC/voltage/current/temp, inverter temperature)
  while keeping curved animated flows, glowing widgets, responsive scaling, and
  per-node more-info; updated tests/docs.
- `v=0.8.0.69` — Overhauled `custom:deye-energy-power-flow-card` with a larger
  page-fitting responsive layout, curved Bezier flows with directional arrows and
  glowing animated balls, glowing/pulsing node widgets, and updated contract
  tests/docs.
- `v=0.8.0.68` — Redesigned `custom:deye-energy-power-flow-card` with larger
  layout, animated glow balls, directional arrows, stronger visual styling,
  summary strip, and per-node click to open Home Assistant more-info; updated
  contract tests and docs.
- `v=0.8.0.67` — Added `custom:deye-energy-power-flow-card` showing live PV, Grid,
  Inverter, Battery, and Home power flow with animated flow lines, SOC/status
  labels, and config-overridable entity mappings; added Power flow dashboard tab.
  Improved graphs hover with crosshair dotted lines, bottom time/value readout,
  and all-series values at nearest X; added power-flow/graphs contract tests and
  documentation updates.
- `v=0.8.0.66` — Added 7d/30d/1y graph presets and custom From/To date+time
  range selection to `custom:deye-energy-graphs-card`; added graphs card
  contract tests and updated README/changelog.
- `v=0.8.0.65` — Fixed graphs card history parsing for HA `minimal_response`
  history payloads, added Power flow/Inverter/Grid/Load/Battery sub-tabs, made
  graphs full-width within tabs, and removed brittle hardcoded release-version
  pins from tests/dashboard comments.
- `v=0.8.0.64` — Added `custom:deye-energy-graphs-card` with 1h/6h/24h history
  graphs grouped by Power flow/Inverter/Grid/Load/Battery, added a Graphs view
  to the dev dashboard, and refined manual schedule active-row glow to a
  text/icon-only pulse.
- `v=0.8.0.63` — Auto-fill missing Sunsynk TOU mode/charge/sell/power/voltage
  entity mappings on setup when matching default `deye_prog{n}_*` entities
  exist (without overwriting user mappings), fixing Unavailable TOU fields for
  existing Sunsynk entries.
- `v=0.8.0.62` — Inverter configuration tab responsiveness improved (render
  signature guard), TOU table data fallbacks/diagnostics refresh added for
  unavailable fields, and Trigger logs/Inverter configuration card styling
  aligned with the main Deye Energy blue theme.
- `v=0.8.0.61` — Inverter configuration moved from main settings tab to a
  standalone card (`custom:deye-energy-inverter-config-card`) with its own
  dashboard tab, live-load-on-access refresh, and confirmation overlay with
  Field/Previous (live)/New before upload.
- `v=0.8.0.60` — README documents inverter time sync (inverter/Home Assistant
  time display, Sync now) and the periodic 6-hour drift-check scheduler.
- `v=0.8.0.59` — Trigger Logs card UI fixes (full-height flex layout, sticky
  header, scroll-jump fix on hass updates, 20-row pagination). Expanded TOU
  settings with editable Mode/Charge/Sell/Power/Voltage fields and updated
  `set_tou_slot` service/schema support; legacy `grid_charge` remains
  backward-compatible. Manual schedule current-row glow refined to a 4s
  text-only pulse. Inverter datetime sync and inverter configuration catalog
  expansion included in dev tree.
- `v=0.8.0.58` — Added **Trigger logs** (`sensor.*_trigger_logs` and
  `custom:deye-energy-trigger-logs-card`) recording every individual physical
  inverter write with timestamp, target/service/value, success/failure status
  and error/source context, plus time filters (Past hour, Past 2 hours, Day,
  Past 24 hours, Past week, Past 30 days) with 30-day retention and bounded
  persistent storage.
- `v=0.8.0.57` — Added an independent **Save PV** button in Energy status,
  set `number.deye_battery_restart_capacity` to 10% once on first
  install/setup/start (best-effort), fixed TOU `H:MM`/`HH:MM` normalization,
  kept grid↔inverter flow at the bottom when PV is disabled, and made the
  manual-schedule active-row glow more pronounced.
- `v=0.8.0.56` — Mapped inverter configuration start/stop battery discharge
  capacities and grid voltage/frequency to direct-MQTT Deye entities (with grid
  V/f shown as live read-only sensors), removed unmapped Sunsynk/`inverters_1`
  inverter-config fields and empty Auxiliary/Battery type groups from the UI,
  and fixed Energy status PV-toggle flow re-render when PV is disabled.
- `v=0.8.0.55` — Added the **Inverter configuration** tab and response-only
  services to own direct inverter fields (including battery/grid current
  limits) separately from schedules/profiles/defaults/optimizer paths. Added a
  **PV generation** toggle in Energy status sensors (`pv_enabled`) with
  PV-disabled Energy status/layout/flow behavior and exclusion of PV/forecasts
  from optimizer/planner/AI analysis/state where applicable. Fixed card
  connect/disconnect lifecycle handling (duplicate interaction listeners and
  pending timer cleanup) and corrected PV-disabled Solcast/learning/AI analysis
  leakage.
- `v=0.8.0.54` — Fresh installs and a one-time `sa_defaults_v1` migration now mirror the working Solar Assistant profile: 290 A battery charge, grid-charge and discharge current, 0 W sell power and grid charging enabled. Current helpers accept up to 300 A, restored charge-profile helpers no longer overwrite the persisted profile after a restart, and the README documents the new defaults.
- `v=0.8.0.53` — README now documents the Energy status sensor editor, source
  captions, W/kW power formatting, manual schedule editing and current-row
  pulse, TOU Apply/Rollback and the £ Sold-today icon. The banner no longer
  duplicates the HACS, licence, donation and version badges shown below it.
  Upstream attribution is consolidated in one note at the bottom of README.md.
- `v=0.8.0.52` — Manual Schedule now uses independent storage: saving, activating and deactivating manual rows never overwrite the work schedule, and the scheduler, TOU mapping, diagnostics and sensor snapshots follow the active source. The Work Schedule and Manual Schedule page toggles are now an exact switch — disabling one selects the other, with Deye control remaining a separate hardware master gate. Manual Schedule is the first schedule tab and the default. Removed the Manual Schedule "Initialize from Deye Time Of Use" button; empty manual rows are auto-loaded once through the existing service instead. Added regression tests across the manager, card, versioning and release files.
- `v=0.8.0.51` — Fixed the Work/Manual schedule tabs: clicking **Manual schedule** now switches the page (its click handlers were attached to the settings dialog instead of the dashboard, so all manual-schedule controls were inert). The Work-schedule **Deye control** toggle is now disabled while the Manual schedule is active, and the Manual schedule **Activate** button is disabled while Deye control is Active. This is a UI-only guard; it does not change either state automatically.
- `v=0.8.0.50` — Manual schedule rows no longer write physical work-mode, charge/discharge current, grid-charge current or minimum sell-price fields, so work-schedule values are preserved while manual is active. House load is derived from PV, grid and battery power; single-phase voltage tiles show only volts using the grid and inverter voltage sensors; Work and Manual schedules are page-level tabs. Test expectations updated to match the shipped card and backend.
- `v=0.8.0.49` — New Manual schedule tab in Settings and diagnostics. Rows are
  stored separately from the work schedule, cover the full 24 hours and support
  arbitrary whole-minute boundaries. Activating stores a snapshot of the work
  schedule, maps the rows onto the 48 slots by slot start time and blocks AI,
  optimizer and future-plan applies until deactivated; deactivating restores the
  snapshot. Rows can be initialized from the inverter's six Deye Time Of Use
  ranges.
- `v=0.8.0.48` — The Settings and diagnostics 24 h mapping is now editable and
  is refreshed from the inverter every time it is opened. From, To, grid charging
  and SOC can be changed where the provider allows it; Save validates the full
  six-range day (00:00 to 00:00, no gaps or overruns) before writing all six
  physical Deye Time Of Use slots. Read-only providers show values without a
  save action. Existing `deye_addon` config entries migrate to the writable
  `sunsynk` provider so TOU writes are available.
- `v=0.8.0.47` — Energy status now supports single-phase inverters by default.
  The Grid and House tiles show one L1 row; when the L1 power sensor is 0 or
  unavailable, the row uses the `grid_power` / `load_power` total instead. Set
  `layout.phase_count: 3` on the card to keep the previous L1/L2/L3 rows. Both
  the desktop flow panel and the compact mobile panel follow this setting. The
  30-minute work schedule and the TOU half-hour editor are unchanged.
- `v=0.8.0.46` — dedicated full-width mobile Status layout.

## What is new in this edition

- The whole integration, card, services and tests are in English. Canonical
  manager modes are `Selling`, `Charging` and `Normal Operation`; the former
  English values are still accepted as legacy aliases when restoring old data.
- The default inverter profile is **Sunsynk** (MQTT) with the entity names of
  the Sunsynk / Deye add-on pre-filled.
- Deye Time Of Use options in `H:MM` format are supported, and battery current
  limits up to 320 A are accepted.
- Prices and units are shown in pounds (£). The default tariff is Intelligent
  Octopus Go with Octopus Energy price entities; price mappings use `GBP/kWh` and
  `GBP/MWh`.
- Numbers and dates use the `en-GB` locale.
- The work schedule has 48 half-hour slots and the Deye TOU ranges can start and
  end on :00 or :30. The optimizer, the AI proposals and prices remain hourly and
  apply to both half-hour slots of an hour.

## Carried over from the upstream 0.8.0 contract

- Price sources resolve automatically through the `PriceSourceContract`:
  Octopus Energy adapter (rates events and current-rate sensors), plus explicit
  custom mappings.
- A seller and DSO tariff catalogue with an explicit manual mode.
- The Optimizer Core produces a FuturePlan for today and tomorrow. Tomorrow's
  plan is executed just-in-time (JIT), only for the current slot.
- Writes never use a 0 A shortcut: legacy zero is treated as an unset value.
- Solcast analysis with history and consistent day boundaries.
- All calculations are deterministic and local. The optional AI assistant is
  advisory only and never writes to the inverter or the schedule.
- The software does not replace hardware protection of the inverter or battery.
- Upstream issues #1, #2, #3, #5, #6, #7 and #9 are addressed; Issue #8 remains
  open upstream.

## Known limitations

- The tariff engine does not model the daily standing charge, works on hourly
  slots and has no manual flat export rate.
- `tariff_catalog.json` contains Octopus Energy products; only Intelligent Octopus
  Go carries rates (read from the account on 2026-11-09).
- This edition was verified with unit tests and static checks. It has **not**
  been run against a live inverter: the inverter was disconnected while the
  adaptation was made. Test with **Deye control** switched off first.
