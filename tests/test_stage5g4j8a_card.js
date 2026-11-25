const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js"),
  "utf8",
);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

for (const marker of [
  "renderAiExplanation(",
  "aiProfiles(",
  "applyAiDayPlan(",
  "save_future_plan",
  "slot_validations",
  "unresolved_daily_constraint",
  "profile.day_summaries?.[day]",
  "Additional optimizer suggestions",
]) {
  check(!source.includes(marker), `AI explanation/day-target UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.8A AI daily-target UI removal checks passed");
