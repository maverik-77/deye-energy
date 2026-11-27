const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = loadDeyeCardClass("DeyeEnergyCard");
const sandbox = { console, HTMLElement: class {}, customElements: { _defs:{}, get(n){return this._defs[n];}, define(n,c){this._defs[n]=c;} }, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) { if (!condition) throw new Error(message); }
const rows = (direction, todayValue, tomorrowValue) => Array.from({ length: 48 }, (_, index) => ({
  day: index < 24 ? "today" : "tomorrow",
  hour: index % 24,
  direction,
  quality: "ready",
  final_price_gbp_kwh: index < 24 ? todayValue : tomorrowValue,
}));
const resolver = (mapped, resolved, adapter, schema, listAttribute) => ({
  mapped_entity: mapped,
  resolved_entity: resolved,
  stable_identity_status: mapped === resolved ? "mapped_entity" : "renamed_resolved",
  detected_adapter: adapter,
  resolved_schema: schema,
  list_attribute: listAttribute,
  value_field: adapter === "octopus_energy" ? "value_inc_vat" : "price",
  unit: "GBP/kWh",
  semantic_scope: adapter === "octopus_energy" ? "all_in_variable" : "energy_only",
  coverage_hours: 24,
  status: "ready",
  reason: mapped === resolved ? "" : "resolved_by_stable_identity",
});

const canonical = {
  schema_version: 1,
  buy: {
    contract: { source_adapter: "octopus_energy", semantic_scope: "all_in_variable", unit: "GBP/kWh", price_basis: "gross", granularity: "60m" },
    rows: rows("buy", 0.31, 0.32),
    diagnostics: {
      status: "ready", coverage_today: 24, coverage_tomorrow: 24,
      resolver: {
        today: resolver("sensor.old_buy", "sensor.moja_cena", "octopus_energy", "octopus_rates_v1", "rates"),
        tomorrow: resolver("sensor.buy_tomorrow", "sensor.buy_tomorrow", "octopus_energy", "octopus_rates_v1", "rates"),
      },
    },
  },
  sell: {
    contract: { source_adapter: "octopus_energy", semantic_scope: "energy_only", unit: "GBP/kWh", price_basis: "gross", granularity: "15m" },
    rows: rows("sell", 0.81, 0.82),
    diagnostics: {
      status: "ready", coverage_today: 24, coverage_tomorrow: 24,
      resolver: {
        today: resolver("sensor.sell_today", "sensor.sell_today", "octopus_energy", "octopus_rates_v1", "prices"),
        tomorrow: resolver("sensor.sell_tomorrow", "sensor.sell_tomorrow", "octopus_energy", "octopus_rates_v1", "prices"),
      },
    },
  },
};

const card = new sandbox.Card();
card._config = {};
card._hass = { states: {
  "sensor.deye_energy_tariff_status": { attributes: { price_diagnostics: canonical } },
} };

const buy = card.canonicalPriceMaps("buy");
const sell = card.canonicalPriceMaps("sell");
check(buy[0].size === 24 && buy[1].size === 24, "Octopus Energy canonical Today/Tomorrow must render 24/24");
check(sell[0].size === 24 && sell[1].size === 24, "Octopus canonical Today/Tomorrow must render 24/24");
check(buy[0].get(7) === 0.31 && buy[1].get(7) === 0.32, "BUY days must remain independent");
check(sell[0].get(7) === 0.81 && sell[1].get(7) === 0.82, "SELL must remain independent from BUY");

const html = card.renderPriceDiagnostics({ price_diagnostics: canonical, price_contracts: {} });

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

check(html.includes("Resolver for mapped entities"), "resolver diagnostics heading missing");
check(html.includes("sensor.old_buy") && html.includes("sensor.moja_cena"), "mapped/resolved rename status must be visible");
check(html.includes("octopus_rates_v1") && html.includes("octopus_rates_v1"), "resolved schemas must be visible");
check(html.includes("rates") && html.includes("rates"), "Octopus Energy list attributes must be visible");
check(html.includes("24/24"), "coverage must be visible");
check(!html.includes("stable-entry") && !html.includes("config_entry_id"), "technical registry IDs must stay hidden");
check(source.includes("The frontend does not read or guess the schema"), "backend-only parsing contract missing");
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(fs.readFileSync(path.join(__dirname,"..","custom_components","deye_energy","www","deye-energy-main-card.js"),"utf8")), "resource revision header missing/invalid");
console.log("stage5g4k3a card contract OK");