# Contributing to Deye Energy

Thank you for helping to improve the project.

## Bug reports

Please include:

- the Home Assistant and Deye Energy versions;
- the inverter model and the connection type (for example Sunsynk over MQTT);
- the state of the integration's diagnostic sensor;
- the expected and the actual behaviour;
- logs with secrets removed;
- whether the issue concerns Selling, Charging, the Schedule or Deye Time Of Use.

## Code changes

1. Create a separate branch.
2. Do not add `__pycache__`, `.pyc` files or data from your own Home Assistant
   installation. Tests must use local fixtures/mocks and must not need a live
   Home Assistant, its API/WebSocket, an existing session or real secrets.
3. Keep fail-closed behaviour for missing SOC, price and physical readback data.
4. No physical Deye write path may bypass the central **Deye control** guard.
5. TOU writes must stay diff-only, with snapshot, confirmation and rollback of
   only the changed entities.
6. Reverse sync may update only the physical Schedule fields; it must not
   overwrite mode, enabled, power, currents or logical thresholds.
7. `minimum_sell_soc` and `tou_soc` must stay separate: the first is the logical
   Selling threshold, the second the physical Deye TOU SOC.
8. All user-visible text is English.

## Tests

```bash
python3 -m unittest discover -s tests
python3 -m pytest tests
for f in tests/test_*.js; do node "$f"; done
```
