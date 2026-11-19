# Changelog

All notable changes to Deye Energy. Versions before 0.8.0 are the history of the
upstream project
[pasierbrg/deye-energy-manager](https://github.com/pasierbrg/deye-energy-manager)
and are not repeated here.

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

### Changed

- The work schedule uses 48 half-hour slots (keys such as `0530_0600`); hourly plan keys such as `05_06` still work and apply to both halves. Deye TOU ranges may start and end on :00 or :30.

- Integration domain `deye_energy`, card `deye-energy-card`, resource revision
  `v=0.8.0.49`.
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
