const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cardPath = path.join(
  root,
  "custom_components",
  "deye_energy",
  "www",
  "deye-energy-card.js",
);

global.window = {
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: (handle) => clearTimeout(handle),
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 390,
  confirm: () => true,
  alert() {},
  customCards: [],
};
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
global.document = {
  activeElement: null,
  scrollingElement: { scrollTop: 0 },
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
};
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
global.HTMLElement = class {
  constructor() {
    this.innerHTML = "";
    this.clientWidth = 390;
    this.ownerDocument = {
      activeElement: null,
      addEventListener() {},
      removeEventListener() {},
    };
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  contains() {
    return false;
  }
  getBoundingClientRect() {
    return { width: 390, height: 800, top: 0, left: 0 };
  }
  addEventListener() {}
  removeEventListener() {}
  setText() {}
  setClass() {}
};
global.customElements = { define() {} };

const source = fs.readFileSync(cardPath, "utf8");
eval(`${source}\nglobal.DeyeEnergyCard = DeyeEnergyCard;`);

function makeState(state, attributes = {}) {
  return { state, attributes };
}

function makeHass() {
  return {
    states: {
      "switch.manually_renamed_deye_control": makeState("on", {
        friendly_name: "Manually renamed Deye control",
      }),
      "sensor.deye_energy_pv_power": makeState("4200"),
      "sensor.deye_energy_grid_power": makeState("3500"),
      "sensor.deye_energy_grid_l1_power": makeState("0"),
      "sensor.deye_energy_grid_l1_voltage": makeState("230"),
      "sensor.deye_grid_voltage": makeState("230"),
      "sensor.deye_inverter_voltage": makeState("231"),
      "sensor.deye_energy_grid_l2_power": makeState("0"),
      "sensor.deye_energy_grid_l2_voltage": makeState("0"),
      "sensor.deye_energy_grid_l3_power": makeState("0"),
      "sensor.deye_energy_grid_l3_voltage": makeState("0"),
      "sensor.deye_energy_load_power": makeState("2800"),
      "sensor.deye_energy_load_l1_power": makeState("0"),
      "sensor.deye_energy_load_l2_power": makeState("0"),
      "sensor.deye_energy_load_l3_power": makeState("0"),
      "sensor.deye_energy_battery_power": makeState("1050"),
      "sensor.deye_energy_battery_soc": makeState("67"),
      "sensor.deye_energy_manager_status": makeState("Aktywny", {
        control: {
          entity_id: "switch.manually_renamed_deye_control",
          enabled: true,
          status: "Active",
        },
        planned_manager_action: "Plan testowy",
        executed_manager_action: "Executed test",
      }),
    },
    services: {},
    locale: { language: "en" },
    callService: async () => {},
  };
}

function makeCard(width, config) {
  global.window.innerWidth = width;
  const card = new global.DeyeEnergyCard();
  card.clientWidth = width;
  card.setConfig(config || {});
  card._hass = makeHass();
  return card;
}

function panel(width, config) {
  return makeCard(width, config).energyFlowPanel();
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function test_phase_count_defaults_to_single_phase() {
  assert.strictEqual(makeCard(390, {}).layoutConfig().phase_count, 1);
  assert.strictEqual(makeCard(390, { layout: { phase_count: 3 } }).layoutConfig().phase_count, 3);
  assert.strictEqual(makeCard(390, { layout: { phase_count: 2 } }).layoutConfig().phase_count, 1);
}

function test_single_phase_value_uses_total_when_phase_missing_or_zero() {
  const card = makeCard(390);
  assert.strictEqual(card.singlePhaseValue(0, 3500), 3500);
  assert.strictEqual(card.singlePhaseValue(null, 3500), 3500);
  assert.strictEqual(card.singlePhaseValue(undefined, 3500), 3500);
  assert.strictEqual(card.singlePhaseValue(Number.NaN, 3500), 3500);
  assert.strictEqual(card.singlePhaseValue(1200, 3500), 1200);
}

function test_mobile_single_phase_shows_ac_voltages_without_l1() {
  const html = panel(390);
  assert.match(html, /ms-detail-grid single-phase/);
  assert.match(html, /data-live="grid-ac-voltage">230\.0<\/span> V/);
  assert.match(html, /data-live="inverter-ac-voltage">231\.0<\/span> V/);
  assert.doesNotMatch(html, /data-live="grid-l1-power"/);
  assert.doesNotMatch(html, /data-live="load-l1-power"/);
  assert.doesNotMatch(html, /data-live="grid-l2-power"/);
  assert.doesNotMatch(html, /data-live="grid-l3-power"/);
  assert.doesNotMatch(html, /data-live="load-l2-power"/);
  assert.doesNotMatch(html, /data-live="load-l3-power"/);
  assert.strictEqual(countOccurrences(html, 'class="ms-phase-label">L1<'), 0);
  assert.strictEqual(countOccurrences(html, 'class="ms-phase-label">L2<'), 0);
  assert.strictEqual(countOccurrences(html, 'class="ms-phase-label">L3<'), 0);
}

function test_desktop_single_phase_uses_one_column() {
  const html = panel(1366);
  assert.strictEqual(countOccurrences(html, 'class="flow-detail-row one-col"'), 2);
  assert.strictEqual(countOccurrences(html, 'class="flow-detail-row three-cols"'), 1);
  assert.match(html, /data-live="grid-ac-voltage">230\.0<\/span> V/);
  assert.match(html, /data-live="inverter-ac-voltage">231\.0<\/span> V/);
  assert.doesNotMatch(html, /data-live="grid-l1-power"/);
  assert.doesNotMatch(html, /data-live="load-l1-power"/);
  assert.doesNotMatch(html, /data-live="grid-l2-power"/);
  assert.doesNotMatch(html, /data-live="grid-l3-power"/);
  assert.doesNotMatch(html, /data-live="load-l2-power"/);
  assert.doesNotMatch(html, /data-live="load-l3-power"/);
}

function test_three_phase_opt_in_still_renders_all_phases() {
  const config = { layout: { phase_count: 3 } };
  const mobileHtml = panel(390, config);
  assert.doesNotMatch(mobileHtml, /ms-detail-grid single-phase/);
  for (const key of [
    "grid-l1-power",
    "grid-l2-power",
    "grid-l3-power",
    "load-l1-power",
    "load-l2-power",
    "load-l3-power",
  ]) {
    assert.ok(mobileHtml.includes(`data-live="${key}"`), `${key} must render in three-phase mode`);
  }
  assert.strictEqual(countOccurrences(mobileHtml, 'class="ms-phase-label">L1<'), 2);
  assert.strictEqual(countOccurrences(mobileHtml, 'class="ms-phase-label">L2<'), 2);
  assert.strictEqual(countOccurrences(mobileHtml, 'class="ms-phase-label">L3<'), 2);

  const desktopHtml = panel(1366, config);
  assert.strictEqual(countOccurrences(desktopHtml, 'class="flow-detail-row three-cols"'), 3);
  assert.strictEqual(countOccurrences(desktopHtml, 'class="flow-detail-row one-col"'), 0);
}

function test_calculated_house_load_and_voltage_in_single_phase() {
  const config = {
    entities: {
      load_power: "sensor.totals_grid_power",
      load_l1_power: "sensor.totals_grid_power",
    },
  };
  const card = makeCard(390, config);
  card._hass.states["sensor.totals_grid_power"] = makeState("-1250");
  card._hass.states["sensor.deye_energy_pv_power"] = makeState("0");
  card._hass.states["sensor.deye_energy_grid_power"] = makeState("-1250");
  card._hass.states["sensor.deye_energy_battery_power"] = makeState("0");
  const html = card.energyFlowPanel();
  assert.match(html, /data-live="load-main">-1\.25 kW/);
  assert.match(html, /data-live="inverter-ac-voltage">231\.0<\/span> V/);
  assert.doesNotMatch(html, /data-live="load-main">8\.75 kW/);
  assert.doesNotMatch(html, /data-live="load-l1-power"/);
}

function test_battery_icon_shows_soc_level_and_color() {
  const card = makeCard(390);
  card._hass.states["sensor.deye_energy_battery_soc"] = makeState("15");
  const low = card.energyFlowPanel();
  assert.match(low, /data-live-html="battery-icon"/);
  assert.match(low, /aria-label="Battery 15 percent"/);
  assert.match(low, /hsl\(0, 85%, 55%\)/);
  card._hass.states["sensor.deye_energy_battery_soc"] = makeState("90");
  const high = card.energyFlowPanel();
  assert.match(high, /aria-label="Battery 90 percent"/);
  assert.match(high, /hsl\(120, 85%, 55%\)/);
  card._hass.states["sensor.deye_energy_battery_soc"] = makeState("40");
  assert.match(card.energyFlowPanel(), /hsl\(60, 85%, 55%\)/);
}

test_phase_count_defaults_to_single_phase();
test_single_phase_value_uses_total_when_phase_missing_or_zero();
test_mobile_single_phase_shows_ac_voltages_without_l1();
test_desktop_single_phase_uses_one_column();
test_three_phase_opt_in_still_renders_all_phases();
test_calculated_house_load_and_voltage_in_single_phase();
test_battery_icon_shows_soc_level_and_color();
console.log("single phase status tests passed");
