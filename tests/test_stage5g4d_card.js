const fs = require("fs");
const path = require("path");

global.window = { setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
global.document = { scrollingElement: {}, documentElement: {}, body: {} };
global.HTMLElement = class HTMLElement {};
global.customElements = { define: () => {} };

const cardPath = path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js");
eval(fs.readFileSync(cardPath, "utf8") + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

let failures = 0;
const check = (condition, message) => { if (!condition) { failures += 1; console.error(`FAIL: ${message}`); } };
const card = new DeyeEnergyCard();
card.setConfig({});
card._hass = { states: {} };
card.tariffData = () => ({});
card.aiApiPresentation = () => ({ status: "lokalny", message: "" });

const previewRow = {
  day: "today", hour: 6, action: "none", proposed: false,
  candidate_action: "sell", candidate_energy_kwh: 1, candidate_power_w: 1000,
  actual_confidence: 35, required_confidence: 50,
  proposal_block_reason: "confidence_below_profile_minimum",
};
const previewPlanner = {
  rows: [previewRow],
  execution_readiness: { status: "preview", label: "Preview", by_day: { today: { status: "preview" } } },
  recommended_write_by_day: { today: { allowed: false } },
};
check(card.aiIsPreviewCandidate(previewRow), "blocked candidate must stay visible as preview");
check(!card.aiCanSelectProposal(previewPlanner, previewRow, "today"), "preview candidate must not expose a checkbox");
const previewHtml = card.renderAiProposalView([], previewPlanner);
check(previewHtml.includes("Confidence 35% · required 50%"), "preview must show actual and required confidence");
check(previewHtml.includes("Candidates — preview only"), "preview must have a separate group");

const readyRow = {
  ...previewRow, action: "sell", proposed: true, candidate_action: "sell",
  proposal_block_reason: null, profile_id: "morning_sale", planned_energy_kwh: 1, planned_power_w: 1000,
  action_contract: { deployment_ready: true },
};
const readyPlanner = {
  rows: [readyRow],
  execution_readiness: { by_day: { today: { status: "confirmable" } } },
  recommended_write_by_day: { today: { allowed: true } },
};
check(card.aiCanSelectProposal(readyPlanner, readyRow, "today"), "confirmable row must remain manually selectable");

const qualityHtml = card.renderAiQualityCard({
  rows: [],
  data_quality: { score: 92, soc: { entity_id: "sensor.battery_soc", raw_value: "63.8", normalized_value: 63.8, age_seconds: 4, status: "valid" } },
  learning_maturity: { score: 71, status: "stable", label: "Stable profile" },
  plan_confidence: 78,
  execution_readiness: { status: "preview", label: "Preview" },
});
check(qualityHtml.includes("Data quality"), "data quality must be a separate metric");
check(qualityHtml.includes("Profile maturity"), "maturity must be a separate metric");
check(qualityHtml.includes("Plan confidence"), "plan confidence must be a separate metric");
check(qualityHtml.includes("Execution readiness"), "execution readiness must be a separate metric");
check(qualityHtml.includes("sensor.battery_soc") && qualityHtml.includes("63.8"), "frontend must read authoritative data_quality.soc");

if (failures) process.exit(1);
console.log("Stage 5G.4D card behavior tests passed");
