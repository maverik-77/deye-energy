# Deye Energy 0.8.0

Card resource revision: `v=0.8.0.44`.
Repository: <https://github.com/maverik-77/deye-energy>.

Deye Energy 0.8.0 is the English-language edition of the
[deye-energy-manager](https://github.com/pasierbrg/deye-energy-manager)
0.8.0 release candidate, adapted to a Deye inverter integrated through MQTT.

## What is new in this edition

- The whole integration, card, services and tests are in English. Canonical
  manager modes are `Selling`, `Charging` and `Normal Operation`; the former
  Polish values are still accepted as legacy aliases when restoring old data.
- The default inverter profile is **Sunsynk** (MQTT) with the entity names of
  the Sunsynk / Deye add-on pre-filled.
- Deye Time Of Use options in `H:MM` format are supported, and battery current
  limits up to 320 A are accepted.
- Prices and units are shown in pounds (£). The default tariff mode is manual
  with a UK tariff; custom price mappings accept `GBP/kWh` and `GBP/MWh` as well
  as `PLN/kWh` and `PLN/MWh`.
- Numbers and dates use the `en-GB` locale.

## Carried over from the upstream 0.8.0 contract

- Price sources resolve automatically through the `PriceSourceContract`:
  Pstryk and PSE/RCE adapters, plus explicit custom mappings.
- A seller and DSO (OSD) tariff catalogue with an explicit manual mode.
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
- `tariff_catalog.json` is Polish reference data (PLN) and is not used by the
  default manual tariff.
- This edition was verified with unit tests and static checks. It has **not**
  been run against a live inverter: the inverter was disconnected while the
  adaptation was made. Test with **Deye control** switched off first.
