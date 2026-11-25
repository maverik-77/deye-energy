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
  "aiRepresentativeProposal(",
  "aiSlotEconomics(",
  "renderAiOverview(",
  "renderAiProposalView(",
  "ai-proposals-view",
  "ai-metric-card ai-best-decision",
  "ai-decision-grid",
  "ai-action-footer",
  "Example proposed change",
  "Modelled slot result",
  "Whole-plan benefit versus baseline",
]) {
  check(!source.includes(marker), `AI net-result presentation UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4K.1 net-result UI removal checks passed");
