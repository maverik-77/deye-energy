# Deye Energy 0.8.0 — installation and upgrade

This guide covers a first installation and an upgrade of Deye Energy 0.8.0.
Repository: <https://github.com/maverik-77/deye-energy>.

## 1. Before you start

- Home Assistant 2026.6 or newer.
- Your Deye inverter must already be available in Home Assistant. For MQTT,
  install the Sunsynk / Deye add-on and the MQTT integration first and check that
  `sensor.deye_battery_soc` and the `select.deye_prog*` entities exist.
- Make a Home Assistant backup.

## 2. Install the integration

### HACS (custom repository)

1. HACS → Integrations → ⋮ → **Custom repositories**.
2. Add `https://github.com/maverik-77/deye-energy` as type **Integration**.
3. Install **Deye Energy** and restart Home Assistant.

### Manual

Copy `custom_components/deye_energy` to `<config>/custom_components/deye_energy`
and restart Home Assistant.

## 3. Add the integration

1. **Settings → Devices & services → Add integration → Deye Energy**.
2. **Inverter communication type** — choose **Sunsynk** for MQTT.
3. Select the inverter's Home Assistant device. Automatic mapping then uses only
   entities that belong to this device.
4. Review each step (inverter, prices, Solcast, weather, TOU ranges). Every field
   is optional; a missing entity only limits the related capability.
5. Read the capability test, set the inverter's maximum AC power and confirm.

## 4. Lovelace card

**Mode UI/storage — automatic resource.** In the default dashboard mode the
integration registers the bundled card resource by itself; nothing to add.

**Mode YAML — manual configuration.** Add the resource yourself:

```yaml
lovelace:
  resources:
    - url: /deye_energy/deye-energy-card.js?v=0.8.0.44
      type: module
```

Then add the card:

```yaml
type: custom:deye-energy-card
```

A sample dashboard is in `dashboard/energy_manager.yaml` (card revision
`v=0.8.0.44`). After an upgrade, hard-refresh the browser (or clear the app
cache) so that the new card revision is loaded.

## 5. First-run checklist

1. Open the card and check that **Deye control** is **off** until you have
   reviewed the schedule.
2. Check the mapped physical TOU ranges in **Settings → Deye mapping**.
3. Enter your tariff under **Tariff and distribution**.
4. Switch **Deye control** on and watch the first slot change confirm in the
   status panel.

## 6. Upgrade

1. Back up Home Assistant.
2. Update through HACS (or replace the folder) and restart.
3. Hard-refresh the browser. The resource revision is updated automatically in
   UI/storage mode; in YAML mode change `v=` to `0.8.0.44`.

## 7. Uninstall

Remove the integration in **Devices & services**, delete the card from your
dashboards and remove `custom_components/deye_energy`.
