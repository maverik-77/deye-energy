const fs = require("fs");
const vm = require("vm");

const source = loadDeyeCardSource("deye-energy-card.js");
const sandbox = { console, HTMLElement: class {}, customElements: { _defs:{}, get(n){return this._defs[n];}, define(n,c){this._defs[n]=c;} }, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) { if (!condition) throw new Error(message); }
const card = new sandbox.Card();
card._config = {};
card._hass = { states: {} };

const emptyContract = {
  source_adapter: "octopus_energy",
  today_entity: "",
  tomorrow_entity: "",
  semantic_scope: "all_in_variable",
  price_basis: "gross",
  unit: "GBP/kWh",
};
const editor = card.renderPriceContract("buy", emptyContract);
check(editor.includes("Today — authoritative mapping") && editor.includes("missing"), "BUY Today must render empty read-only mapping");
check(!editor.includes('data-contract-field="today_entity"'), "tariff editor must not edit BUY Today mapping");
check(!editor.includes('data-contract-field="tomorrow_entity"'), "tariff editor must not edit BUY Tomorrow mapping");
check(!editor.includes("sensor.octopus_energy_aio_"), "editor must not inject a Octopus Energy entity default");

const unmapped = (day) => ({
  mapped_entity: "",
  resolved_entity: "",
  stable_identity_status: "unmapped",
  detected_adapter: "octopus_energy",
  resolved_schema: "unknown",
  list_attribute: "",
  value_field: "",
  unit: "GBP/kWh",
  semantic_scope: "all_in_variable",
  coverage_hours: 0,
  status: "unmapped",
  reason: "user_unmapped",
  day,
});
const rceRows = Array.from({ length: 48 }, (_, index) => ({
  day: index < 24 ? "today" : "tomorrow",
  hour: index % 24,
  quality: "ready",
  final_price_gbp_kwh: 0.8,
}));
const canonical = {
  schema_version: 1,
  buy: {
    contract: emptyContract,
    rows: [],
    diagnostics: {
      status: "price_source_not_configured", coverage_today: 0, coverage_tomorrow: 0,
      resolver: { today: unmapped("today"), tomorrow: unmapped("tomorrow") },
    },
  },
  sell: {
    contract: { source_adapter: "octopus_energy", semantic_scope: "energy_only", price_basis: "gross", unit: "GBP/kWh", granularity: "15m" },
    rows: rceRows,
    diagnostics: {
      status: "ready", coverage_today: 24, coverage_tomorrow: 24,
      resolver: { today: {}, tomorrow: {} },
    },
  },
};
card._hass = { states: {
  "sensor.deye_energy_tariff_status": { attributes: { price_diagnostics: canonical } },
} };
check(card.canonicalPriceMaps("buy")[0].size === 0, "unmapped BUY must have no canonical rows");
check(card.canonicalPriceMaps("sell")[0].size === 24, "independent Octopus SELL Today must remain available");
check(card.canonicalPriceMaps("sell")[1].size === 24, "independent Octopus SELL Tomorrow must remain available");
const diagnostics = card.renderPriceDiagnostics({ price_diagnostics: canonical, price_contracts: { buy: emptyContract } });

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

check(diagnostics.includes("price source not configured"), "missing direction status must be readable");
check(diagnostics.includes("not configured") && diagnostics.includes("removed in mapping"), "explicit empty reason must be readable");
check(diagnostics.includes("missing"), "empty mapped entity must be displayed as missing");
check(!diagnostics.includes("sensor.octopus_energy_aio_"), "diagnostics must not display a provider fallback");
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("stage5g4k3b explicit-empty card contract OK");