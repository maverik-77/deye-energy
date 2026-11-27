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

const known = (adapter) => ({
  source_adapter: adapter, adapter_summary: adapter,
  resolved_adapter_today: adapter, resolved_adapter_tomorrow: adapter,
  today_entity: `sensor.${adapter}_today`, tomorrow_entity: `sensor.${adapter}_tomorrow`,
  resolved_source_today: {
    semantic_scope: adapter === "octopus_energy" ? "energy_only" : "all_in_variable",
    includes_distribution_variable: adapter !== "octopus_energy",
    includes_excise: adapter !== "octopus_energy",
    includes_service_margin: adapter !== "octopus_energy",
  },
  resolved_source_tomorrow: {
    semantic_scope: adapter === "octopus_energy" ? "energy_only" : "all_in_variable",
    includes_distribution_variable: adapter !== "octopus_energy",
    includes_excise: adapter !== "octopus_energy",
    includes_service_margin: adapter !== "octopus_energy",
  },
});

for (const adapter of ["octopus_energy"]) {
  const html = card.renderPriceContract("buy", known(adapter));
  check(html.includes("automatic / read-only"), `${adapter} must be explicitly read-only`);
  check(html.includes("automatic contract"), `${adapter} must render diagnostics as text`);
  check(!html.includes("data-price-contract"), `${adapter} must expose no editable contract control`);
}

const custom = card.renderPriceContract("buy", {
  source_adapter: "custom", adapter_summary: "custom", resolved_adapter_today: "custom",
  today_entity: "sensor.custom", tomorrow_entity: "", semantic_scope: "energy_only",
  includes_distribution_variable: false, price_basis: "gross", unit: "GBP/kWh",
});
check(custom.includes('data-price-contract="buy"'), "Custom fields must remain editable");

const empty = {
  adapter_summary: "unmapped", resolved_adapter_today: "unmapped", resolved_adapter_tomorrow: "unmapped",
  today_entity: "", tomorrow_entity: "",
};
const staleSnapshot = {
  buy: {
    contract: known("octopus_energy"),
    rows: [{ day: "tomorrow", hour: 23, quality: "ready", final_price_gbp_kwh: 1.16 }],
    diagnostics: { resolver: {
      today: { mapped_entity: "sensor.old_octopus_energy_today", resolved_entity: "sensor.old_octopus_energy_today" },
      tomorrow: { mapped_entity: "sensor.old_octopus_energy_tomorrow", resolved_entity: "sensor.old_octopus_energy_tomorrow" },
    } },
  },
};
const diagnostics = card.renderPriceDiagnostics({
  price_contracts: { buy: empty, sell: empty }, price_diagnostics: staleSnapshot,
});
check(!diagnostics.includes("sensor.old_octopus_energy"), "empty diagnostics must not render stale entity names");
check(diagnostics.includes("not configured"), "empty diagnostics must show unconfigured status");

card.tariffData = () => ({
  mode: "automatic", provider: "octopus", plan: "intelligent_go", providers: [], tariffs: [], hourly_profile: [],
  price_source: "octopus_energy", price_contracts: { buy: known("octopus_energy"), sell: empty },
});
const tariff = card.renderTariffTab();

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

check(!tariff.includes('data-tariff-field="price_source"'), "legacy source must not be an active dropdown");
check(tariff.includes("Detected source: octopus_energy"), "derived source must be rendered as read-only text");
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("stage5g4k3b2 real HA cleanup card OK");