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

const cardPath = path.join(
  __dirname,
  "..",
  "custom_components",
  "deye_energy",
  "www",
  "deye-energy-card.js",
);
const source = fs.readFileSync(cardPath, "utf8");
eval(`${source}\nglobal.DeyeEnergyCard = DeyeEnergyCard;`);

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
