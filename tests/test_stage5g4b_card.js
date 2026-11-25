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
  "aiIsApplicableProposal(",
  "aiPlannedSlotPower(",
  "aiRowUpdate(",
  "action_contract",
  "deployment_ready",
  "schedule_update",
  "planned_power_w",
]) {
  check(!source.includes(marker), `AI Core action-contract helper must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4B AI CoreActionContract UI removal checks passed");
