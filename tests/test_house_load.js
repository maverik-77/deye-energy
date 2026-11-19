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
      "sensor.deye_energy_pv_power": makeState("4000"),
      "sensor.deye_energy_grid_power": makeState("-1500"),
      "sensor.deye_energy_battery_power": makeState("-1000"),
      "sensor.deye_energy_load_power": makeState("9999"),
      "sensor.deye_energy_load_l1_power": makeState("0"),
      "sensor.deye_grid_voltage": makeState("230"),
      "sensor.deye_inverter_voltage": makeState("231"),
      "sensor.deye_energy_manager_status": makeState("Idle"),
      "sensor.deye_energy_battery_soc": makeState("67"),
      "switch.deye_energy_control": makeState("off"),
      "select.deye_energy_control_mode": makeState("Schedule"),
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

// 1. The formula uses PV plus imports/discharges minus exports/charges.
{
  const card = makeCard(390);
  const calc = (pv, grid, battery) => card.calculatedHouseLoad(pv, grid, battery);
  assert.strictEqual(calc(3000, 0, 0), 3000, "PV generation only");
  assert.strictEqual(calc(1000, 500, 0), 1500, "grid import adds to house load");
  assert.strictEqual(calc(3000, -1000, 0), 2000, "grid export subtracts from house load");
  assert.strictEqual(calc(0, 0, 1200), 1200, "battery discharge adds to house load");
  assert.strictEqual(calc(2000, 0, -800), 1200, "battery charge subtracts from house load");
  assert.strictEqual(calc(4000, -1500, -1000), 1500, "export and charge both subtract");
  assert.strictEqual(calc(0, 700, 500), 1200, "import and discharge both add");
  assert.strictEqual(calc("1200", "300.5", "-200.5"), 1300, "string sensor values");
  assert.strictEqual(calc(null, undefined, Number.NaN), 0, "missing values count as zero");
}

// 2. Both rendered House tiles use the calculated value, not the raw load sensor.
{
  const card = makeCard(390);
  const mobile = card.energyFlowPanel();
  assert.match(mobile, /data-live="load-main">1\.50 kW/, "mobile tile uses calculated load");
  assert.doesNotMatch(mobile, /data-live="load-main">9\.99 kW/, "raw load sensor is ignored");

  const desktopCard = makeCard(1366);
  const desktop = desktopCard.energyFlowPanel();
  assert.match(desktop, /data-live="load-main">1\.50 kW/, "desktop tile uses calculated load");
}

// 3. Single-phase shows only the grid AC voltage and the inverter output AC voltage.
{
  const card = makeCard(390);
  const html = card.energyFlowPanel();
  assert.match(html, /data-live="grid-ac-voltage">230\.0<\/span> V/);
  assert.match(html, /data-live="inverter-ac-voltage">231\.0<\/span> V/);
  assert.doesNotMatch(html, /data-live="grid-l1-power"/);
  assert.doesNotMatch(html, /data-live="load-l1-power"/);
  assert.doesNotMatch(html, /L1/);
}

// 4. Live updates publish the calculated value to the main tile and the L1 fallback.
{
  const card = makeCard(390);
  const written = {};
  card.setText = (selector, value) => {
    written[selector] = value;
  };
  card.querySelectorAll = () => [];
  card._isRendered = true;
  card.updateDynamicValues();
  assert.strictEqual(written["[data-live='load-main']"], "1.50 kW");
  assert.strictEqual(written["[data-live='grid-ac-voltage']"], "230.0");
  assert.strictEqual(written["[data-live='inverter-ac-voltage']"], "231.0");
}

console.log("test_house_load: all assertions passed");
