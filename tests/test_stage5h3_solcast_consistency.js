const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const source = loadDeyeCardClass("DeyeEnergyCard");
const sandbox = {


  console,
  HTMLElement: class {},
  customElements: { define() {} },
  setTimeout,
  clearTimeout,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(
  source.includes("solcastAccuracyAttrs.realization_today_pct"),
  "main Solcast card must read canonical realization_today_pct",
);
check(
  source.includes("solcastAccuracyAttrs.historical_accuracy_pct"),
  "historical accuracy must be a separate frontend field",
);
check(
  source.includes("solcastAccuracyAttrs.forecast_difference_today_kwh"),
  "difference must come from the canonical backend contract",
);
check(
  !source.includes("dailyPvValue - solcastForecastValue"),
  "frontend must not independently calculate the difference",
);
check(
  !source.includes("solcastAccuracyAttrs.forecast_progress_percent"),
  "main card must not consume the legacy progress alias",
);
check(
  !source.includes("aiState?.attributes?.solcast_current_day"),
  "AI local suggestions must not consume a separate Solcast context",
);
check(!source.includes("filteredAnalyses("), "AI history suggestions filter must be removed");
for (const field of [
  "forecastTodayKwh",
  "productionTodayKwh",
  "remainingForecastKwh",
  "realizationTodayPct",
  "historicalAccuracyPct",
  "forecastTomorrowKwh",
]) {
  check(!source.includes(field), `AI history field must be removed: ${field}`);
}
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(fs.readFileSync(path.join(__dirname,"..","custom_components","deye_energy","www","deye-energy-main-card.js"),"utf8")), "resource revision header missing/invalid");

console.log("Stage 5H.3 Solcast frontend contract checks passed");