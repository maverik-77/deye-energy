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
  "renderAiOverview(",
  "aiSlotEconomics(",
  "marginalDecisionBenefit",
  "Najlepsza decyzja",
  "gwarantowany zysk",
  "partial result — missing prices",
]) {
  check(!source.includes(marker), `AI net-result semantics UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4K.1 v2 net-result UI removal checks passed");
