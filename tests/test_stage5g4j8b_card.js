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
  "renderAiProposalView(",
  "applyAiDayPlan(",
  "save_future_plan",
  "replace_day",
  "data-apply-ai-day",
  "only special actions in the complete dated plan for tomorrow",
  "executed tomorrow JIT",
  "Select at least one hour",
]) {
  check(!source.includes(marker), `AI authoritative FuturePlan UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.8B AI FuturePlan UI removal checks passed");
