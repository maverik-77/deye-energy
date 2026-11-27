const fs = require("fs");
const path = require("path");

function loadDeyeCardSource(file = "deye-energy-card.js") {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", file), "utf8");
  if (file === "deye-energy-card.js" && src.includes("import {")) {
    return src.replace(/import \{ (\w+) \} from "\.\/(.*?)\?v=[^"]+";/g, (_, cls, mod) => {
      return fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", mod), "utf8").replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
    });
  }
  if (/^deye-energy-.*-card\.js$/.test(file)) {
    return src.replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
  }
  return src;
}
function loadDeyeCardClass(className) {
  const map = {
    DeyeEnergyCard: "deye-energy-main-card.js",
    DeyeEnergyInverterConfigCard: "deye-energy-inverter-config-card.js",
    DeyeEnergyTriggerLogsCard: "deye-energy-trigger-logs-card.js",
    DeyeEnergyGraphsCard: "deye-energy-graphs-card.js",
    DeyeEnergyPowerFlowCard: "deye-energy-power-flow-card.js",
  };
  const src = loadDeyeCardSource(map[className] || "deye-energy-card.js").replace(/^export class /m, "class ");
  return src;
}

const source = loadDeyeCardSource("deye-energy-card.js");

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