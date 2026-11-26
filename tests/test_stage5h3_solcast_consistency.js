const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
  "custom_components/deye_energy/www/deye-energy-card.js",
  "utf8",
);
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
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");

console.log("Stage 5H.3 Solcast frontend contract checks passed");
