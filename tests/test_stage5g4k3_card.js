const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = loadDeyeCardClass("DeyeEnergyCard");
const sandbox = { console, HTMLElement: class {}, customElements: { _defs:{}, get(n){return this._defs[n];}, define(n,c){this._defs[n]=c;} }, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);
const card = new sandbox.Card();
card._config = {};
card._hass = { states: {
  "sensor.deye_energy_tariff_status": { attributes: { price_diagnostics: {
    schema_version: 1,
    buy: { rows: [
      { day: "today", hour: 3, quality: "ready", final_price_gbp_kwh: 0.23, source_price_gbp_kwh: 0.23, source_semantic_scope: "all_in_variable" },
      { day: "tomorrow", hour: 4, quality: "ready", final_price_gbp_kwh: -0.10 },
    ] },
    sell: { rows: [{ day: "today", hour: 5, quality: "ready", final_price_gbp_kwh: 1.25 }] },
  } } },
} };

function check(condition, message) { if (!condition) throw new Error(message); }
const buy = card.canonicalPriceMaps("buy");

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

check(buy[0].get(3) === 0.23, "today BUY must come from canonical backend row");
check(buy[1].get(4) === -0.10, "negative tomorrow BUY must be retained");
check(card.canonicalPriceMaps("sell")[0].get(5) === 1.25, "SELL must use its independent contract rows");
check(source.includes('this.canonicalPriceMaps(scrollKey.startsWith("buy") ? "buy" : "sell")'), "price tables must use backend canonical rows");
check(!source.includes("price + distributionCost(todayKey, hour)"), "browser must not add DSO to a canonical BUY price");
check(!source.includes("Full source"), "AI all-in source breakdown must be removed");
check(/\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?/.test(fs.readFileSync(path.join(__dirname,"..","custom_components","deye_energy","www","deye-energy-main-card.js"),"utf8")), "resource revision header missing/invalid");
console.log("stage5g4k3 card contract OK");