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
  "applyAiDayPlan(",
  "aiPlannerData(",
  "aiSuggestions(",
  "saveAiAnalysis(",
  "renderAiProposalView(",
  "replace_day",
  "data-apply-ai-day",
  "All remaining hours will be set to Normal Operation",
  "Apply selected for today",
]) {
  check(!source.includes(marker), `AI full-day apply UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.4 AI full-day apply UI removal checks passed");
