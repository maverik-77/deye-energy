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

const known = {
  source_adapter: "octopus_energy", adapter_summary: "octopus_energy",
  resolved_adapter_today: "octopus_energy", resolved_adapter_tomorrow: "octopus_energy",
  today_entity: "sensor.octopus_energy_rates", tomorrow_entity: "sensor.octopus_energy_rates_tomorrow",
  semantic_scope: "energy_only", includes_distribution_variable: false,
  price_basis: "gross", unit: "GBP/kWh",
};
const knownEditor = card.renderPriceContract("buy", known);
check(knownEditor.includes("automatic / read-only"), "known adapter must be read-only");
check(knownEditor.includes("sensor.octopus_energy_rates"), "current central mapping must be displayed");
check(!knownEditor.includes("data-price-contract"), "known adapter must not submit technical contract fields");
check(!knownEditor.includes('data-contract-field="today_entity"'), "tariff editor must never edit mapped entities");

const custom = {
  source_adapter: "custom", adapter_summary: "custom",
  resolved_adapter_today: "custom", resolved_adapter_tomorrow: "unmapped",
  today_entity: "sensor.my_custom_prices", tomorrow_entity: "",
  semantic_scope: "energy_only", includes_distribution_variable: false,
  price_basis: "gross", unit: "GBP/kWh", list_attribute: "hourly", value_field: "amount",
};
const customEditor = card.renderPriceContract("buy", custom);
check(customEditor.includes("Advanced / Custom"), "custom advanced editor must remain available");
check(customEditor.includes('data-contract-field="value_field"'), "custom schema must remain editable");
check(!customEditor.includes('data-contract-field="today_entity"'), "custom mapping still belongs to Options Flow");

card.tariffData = () => ({
  mode: "automatic", provider: "octopus", plan: "intelligent_go", providers: [], tariffs: [],
  price_source: "octopus_energy", price_contracts: { buy: known, sell: known }, hourly_profile: [],
});
const tariffHtml = card.renderTariffTab();

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

check(!tariffHtml.includes('data-tariff-field="price_source"'), "legacy price source selector must not be runtime authority");
check(tariffHtml.includes("Detected source:"), "UI must present a derived source instead of a selector");
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("stage5g4k3b1 v2 source authority card OK");