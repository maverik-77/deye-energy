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
  "aiUiText(",
  "aiExecutionStatus(",
  "higher_priority_profile_reserve",
  "material_live_input_changed:",
  "socDiagnostics.source_health_source",
  "no_proposals",
  "Energy preserved for a higher-priority profile",
  "Recalculated after a significant",
]) {
  check(!source.includes(marker), `AI reason-translation UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4K.4 AI reason-translation UI removal checks passed");
