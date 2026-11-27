const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = {
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1280,
  confirm: () => true,
  alert() {},
  customCards: [],
};
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = {
  activeElement: null,
  scrollingElement: { scrollTop: 0 },
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
};
global.ResizeObserver = class { observe() {} disconnect() {} };
global.HTMLElement = class {
  constructor() {
    this.innerHTML = "";
    this.clientWidth = 1280;
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
};
global.customElements = { define() {} };

eval(`${loadDeyeCardClass("DeyeEnergyCard")}\nglobal.DeyeEnergyCard = DeyeEnergyCard;`);

function makeCard(value, present = true) {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  const states = {};
  if (present) {
    states["sensor.deye_energy_battery_soc"] = {
      state: value,
      attributes: {},
    };
  }
  card._hass = { states, services: {}, locale: { language: "pl" } };
  return card;
}

function dynamicSoc(card) {
  const written = {};
  card.setText = (selector, value) => {
    written[selector] = String(value);
  };
  card.querySelectorAll = () => [];
  card._isRendered = true;
  card.updateDynamicValues();
  const selector = "[data-live='battery-soc-value']";
  assert.ok(
    Object.prototype.hasOwnProperty.call(written, selector),
    "live SOC output must be written",
  );
  return written[selector];
}

function renderedSoc(value, present = true) {
  return dynamicSoc(makeCard(value, present));
}

const parser = makeCard("80");
assert.strictEqual(parser.optionalSocNumber(0), 0);
assert.strictEqual(parser.optionalSocNumber("0"), 0);
assert.strictEqual(parser.optionalSocNumber("80"), 80);
assert.strictEqual(parser.optionalSocNumber("80,5"), 80.5);
for (const value of [null, undefined, "", "unknown", "unavailable", "none", "NaN", "invalid 80"]) {
  assert.strictEqual(parser.optionalSocNumber(value), null, `${String(value)} must stay missing`);
}

assert.strictEqual(renderedSoc("0"), "0", "real zero SOC must render as 0%");
assert.strictEqual(renderedSoc("80"), "80", "valid SOC must render normally");
assert.strictEqual(renderedSoc("unavailable"), "—");
assert.strictEqual(renderedSoc("unknown"), "—");
assert.strictEqual(renderedSoc(""), "—");
assert.strictEqual(renderedSoc(null), "—");
assert.strictEqual(renderedSoc("80", false), "—");

const staleCard = makeCard("unavailable");

function loadDeyeCardSource(file = "deye-energy-card.js") {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", file), "utf8");
  if (file === "deye-energy-card.js" && src.includes("import {")) {
    return src.replace(/import \{ (\w+) \} from "\.\/(.*?)\?v=[^"]+";/g, (_, cls, mod) => {
      return fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", mod), "utf8").replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
    });
  }
  if (/^deye-energy-.*-card\.js$/.test(file)) {
    return src.replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
  }
  return src;
}
function loadDeyeCardClass(className) {
  const map = {
    DeyeEnergyCard: "deye-energy-main-card.js",
    DeyeEnergyInverterConfigCard: "deye-energy-inverter-config-card.js",
    DeyeEnergyTriggerLogsCard: "deye-energy-trigger-logs-card.js",
    DeyeEnergyGraphsCard: "deye-energy-graphs-card.js",
    DeyeEnergyPowerFlowCard: "deye-energy-power-flow-card.js",
  };
  const src = loadDeyeCardSource(map[className] || "deye-energy-card.js").replace(/^export class /m, "class ");
  return src;
}

staleCard._hass.states["sensor.deye_energy_ai_state"] = {
  state: "ready",
  attributes: {
    planner_48h: {
      data_quality: { soc: { status: "stale", normalized_value: null } },
    },
  },
};
assert.strictEqual(
  dynamicSoc(staleCard),
  "—",
  "stale diagnostics must never become a false 0%",
);

console.log("Stage 5G.4F SOC card tests passed");