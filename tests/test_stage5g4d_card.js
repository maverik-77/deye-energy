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
  "aiIsPreviewCandidate(",
  "aiCanSelectProposal(",
  "renderAiProposalView(",
  "renderAiQualityCard(",
  "Candidates — preview only",
  "Data quality",
  "Profile maturity",
  "Plan confidence",
  "Execution readiness",
]) {
  check(!source.includes(marker), `AI preview/quality UI must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4D AI preview/quality UI removal checks passed");
