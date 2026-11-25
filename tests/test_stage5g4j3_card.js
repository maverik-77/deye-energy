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
  "aiPlannedSlotPower(",
  "aiRowUpdate(",
  "aiReadableKeyFactor(",
  "renderAiProposalView(",
  "Price for this hour:",
  "SOC at start:",
  "best_later_price=",
]) {
  check(!source.includes(marker), `AI proposal formatting helper must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.3 AI proposal formatting removal checks passed");
