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
      "sensor.deye_energy_grid_power": makeState("-350"),
      "sensor.deye_energy_load_power": makeState("2800"),
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

function panelAt(width) {
  global.window.innerWidth = width;
  const card = new global.DeyeEnergyCard();
  card.clientWidth = width;
  card.setConfig({});
  card._hass = makeHass();
  return card.energyFlowPanel();
}

function test_mobile_status_uses_compact_layout() {
  const html = panelAt(390);
  assert.match(html, /class="panel status-panel mobile-status-panel"/);
  assert.match(html, /ms-body/);
  assert.match(html, /class="ms-flow-wrapper"/);
  assert.match(html, /class="ms-flow-scaler"/);
  assert.match(html, /class="ms-flow-board"/);
  assert.match(html, /class="ms-flow-svg"/);
  assert.match(html, /@keyframes mfFlowDash/);
  for (const key of ["pv", "grid", "battery", "home"]) {
    assert.ok(html.includes(`data-flow-line="${key}"`), `${key} animated flow path must survive mobile layout`);
  }
  assert.doesNotMatch(html, /class="energy-flow-panel"/);
  assert.doesNotMatch(html, /class="flow-svg"/);
  assert.doesNotMatch(html, /class="flow-scaler"/);
  assert.doesNotMatch(html, /width:\s*1328px/);
  assert.doesNotMatch(html, /height:\s*768px/);
}

function test_mobile_status_keeps_live_data_hooks_and_content() {
  const html = panelAt(390);
  for (const key of [
    "pv-main",
    "grid-main",
    "battery-soc-value",
    "battery-direction",
    "load-main",
    "inverter-temp",
    "sold-today-line",
    "control-status",
    "manager-mode",
    "active-slot",
    "pv-daily",
    "grid-bought",
    "grid-sold",
    "load-daily",
  ]) {
    assert.ok(html.includes(`data-live="${key}"`), `${key} live hook must survive mobile layout`);
  }
  assert.match(html, /Plan testowy/);
  assert.match(html, /Executed test/);
  assert.match(html, /Deye control/);
  assert.match(html, /Deye inverter/);
}

function test_mobile_flow_tiles_are_in_expected_order() {
  const html = panelAt(390);
  const order = ["ms-flow-pv", "ms-flow-grid", "ms-flow-battery", "ms-flow-home"].map((name) =>
    html.indexOf(`ms-flow-tile ${name}`),
  );
  assert.ok(order.every((index) => index >= 0), "all four mobile flow tiles must render");
  assert.deepStrictEqual(
    order,
    [...order].sort((a, b) => a - b),
    "mobile flow tiles must be ordered PV -> Grid -> Battery -> House",
  );
  for (const title of ["PV details", "Grid details", "Battery details", "House details"]) {
    assert.ok(html.includes(title), `${title} widget must render below the flow canvas`);
  }
}

function test_desktop_status_keeps_the_flow_canvas() {
  const html = panelAt(1366);
  assert.match(html, /class="energy-flow-panel"/);
  assert.match(html, /class="flow-svg"/);
  assert.match(html, /class="flow-scaler"/);
  assert.doesNotMatch(html, /mobile-status-panel/);
}

function test_mobile_flow_panel_is_scaled_by_common_logic() {
  const method = source.slice(
    source.indexOf("  scaleFlowPanel() {"),
    source.indexOf("  updateFlowLines() {"),
  );
  assert.match(method, /const isMobile = !!this\.querySelector\("\.mobile-status-panel"\)/);
  assert.match(method, /this\.querySelector\(isMobile \? "\.ms-flow-wrapper" : "\.flow-wrapper"\)/);
  assert.match(method, /this\.querySelector\(isMobile \? "\.ms-flow-scaler" : "\.flow-scaler"\)/);
  assert.match(method, /isMobile \? 422 : 1328/);
  assert.match(method, /isMobile \? 320 : 768/);
}

test_mobile_status_uses_compact_layout();
test_mobile_status_keeps_live_data_hooks_and_content();
test_mobile_flow_tiles_are_in_expected_order();
test_desktop_status_keeps_the_flow_canvas();
test_mobile_flow_panel_is_scaled_by_common_logic();
console.log("mobile status layout tests passed");
