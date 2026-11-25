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
  "aiDefaults(",
  "renderAiGeneralSettings(",
  "aiUiText(",
  "Minimum automatic sell power",
  "Price difference considered close",
  "higher_value_slot_reserved",
  "near_equal_price_group",
  "residual_below_minimum",
]) {
  check(!source.includes(marker), `AI settings and reason labels must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.10A v2 AI settings removal checks passed");
