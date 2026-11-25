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
  'physical_pending: "Waiting for the inverter"',
  'entry.status === "confirmed"',
  'row.deployment_status === "confirmed"',
  'manual_override: "Changed manually"',
  'missed: "Skipped"',
]) {
  check(!source.includes(marker), `AI deployment lifecycle label must be removed: ${marker}`);
}
check(
  /^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source),
  "resource revision header missing/invalid",
);

console.log("Stage 5G.4J.8C AI deployment lifecycle UI removal checks passed");
