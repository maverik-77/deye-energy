const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
  "custom_components/deye_energy/www/deye-energy-card.js",
  "utf8",
);
const sandbox = {
  console,
  HTMLElement: class {
    constructor() { this._inner = ""; this._listeners = {}; this._children = []; }
    set innerHTML(v) { this._inner = v; this._children = []; }
    get innerHTML() { return this._inner; }
    querySelector(sel) {
      if (sel === ".graphs-root") return this._inner.includes('graphs-root') ? {} : null;
      if (sel === ".g-apply") return this._applyBtn || null;
      return null;
    }
    querySelectorAll(sel) {
      if (sel === "[data-range]") return this._rangeBtns || [];
      if (sel === "[data-group]") return this._groupBtns || [];
      return [];
    }
  },
  customElements: { define() {} },
  setTimeout: (fn) => 1,
  clearTimeout: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${loadDeyeCardClass("DeyeEnergyGraphsCard")}\nthis.GraphsCard = DeyeEnergyGraphsCard;`, sandbox);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const card = new sandbox.GraphsCard();
card._hass = { states: {}, connected: true, callApi: async () => [] };

// Ranges
const ranges = card._ranges();
check(ranges.some(r => r[0] === "1h"), "missing 1h range");
check(ranges.some(r => r[0] === "6h"), "missing 6h range");
check(ranges.some(r => r[0] === "24h"), "missing 24h range");
check(ranges.some(r => r[0] === "7d"), "missing 7d range");
check(ranges.some(r => r[0] === "30d"), "missing 30d range");
check(ranges.some(r => r[0] === "1y"), "missing 1y range");

// Group defs / sub-tabs
const groups = card._groupDefs();
const keys = groups.map(g => g.key);
for (const k of ["power_flow", "inverter", "grid", "load", "battery"]) {
  check(keys.includes(k), `missing group ${k}`);
}

// Custom range state
check(card._customRange === false, "customRange default should be false");
check(typeof card._customFrom === "string", "customFrom should be string");
check(typeof card._customTo === "string", "customTo should be string");

// Render contract
const now = Date.now();
card._history = {
  "sensor.deye_grid_power": [[now - 60000, 100], [now, 120]],
  "sensor.deye_load_power": [[now - 60000, 200], [now, 220]],
  "sensor.deye_battery_power": [[now - 60000, 50], [now, 60]],
  "sensor.deye_inverter_power": [[now - 60000, 300], [now, 320]],
};
card._lastSig = "";
card._render();
const html = card.innerHTML;
check(html.includes('data-group="power_flow"'), "missing power flow tab");
check(html.includes('data-group="inverter"'), "missing inverter tab");
check(html.includes('data-group="grid"'), "missing grid tab");
check(html.includes('data-group="load"'), "missing load tab");
check(html.includes('data-group="battery"'), "missing battery tab");
check(html.includes('grid-template-columns:1fr'), "charts should be full width");
check(html.includes('type="datetime-local"'), "missing datetime-local inputs");
check(html.includes('g-apply'), "missing apply range button");
check(html.includes('Apply range'), "missing Apply range label");
check(html.includes('g-clear'), "missing clear button");
card._loading = true;
card._lastSig = '';
card._render();
const loadingHtml = card.innerHTML;

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

check(loadingHtml.includes('Loading data…') || loadingHtml.includes('Loading history…'), "missing loading state");
check(html.includes('g-hover-x'), "missing hover X line");
check(html.includes('g-hover-y'), "missing hover Y line");
check(html.includes('g-hover-readout'), "missing hover readout");
check(html.includes('g-capture'), "missing hover capture area");
check(html.includes('g-chart-wrap'), "missing chart wrap");

// History parsing: minimal_response entity_id only on first item
card._hass = {
  states: { "sensor.deye_battery_soc": { last_updated: "2026-11-21T16:00:00Z" } },
  connected: true,
  callApi: async () => [[
    { entity_id: "sensor.deye_battery_soc", state: "64", last_changed: "2026-11-21T15:00:00Z" },
    { state: "63", last_changed: "2026-11-21T15:05:00Z" },
  ]],
};
card._config = { entities: { battery_soc: "sensor.deye_battery_soc" } };
card._group = "battery";
card._loading = false;
card._history = {};
(async () => {
  card._lastFetch = 0;
  await card._fetchHistory();
  const pts = card._history["sensor.deye_battery_soc"] || [];
  check(pts.length === 2, `expected 2 parsed points, got ${pts.length}`);
  check(pts[0][1] === 64, "first point value mismatch");
  check(pts[1][1] === 63, "second point value mismatch");

  check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
  console.log("Graphs card tests passed");
})().catch(e => { console.error(e); process.exit(1); });