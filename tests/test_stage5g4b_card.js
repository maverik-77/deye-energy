const fs = require("fs");
const path = require("path");

global.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.document = { scrollingElement: {}, documentElement: {}, body: {} };
class HTMLElement {}
global.HTMLElement = HTMLElement;
global.customElements = { define: () => {} };

const cardPath = path.join(
  __dirname,
  "..",
  "custom_components",
  "deye_energy",
  "www",
  "deye-energy-card.js"
);
eval(fs.readFileSync(cardPath, "utf8") + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

let failures = 0;
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL: ${message}\n expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(actual)}`);
  }
}
function assertTrue(value, message) {
  if (!value) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

const card = new DeyeEnergyCard();
card.setConfig({});
// Core contracts no longer carry the three current limits.  They live in the
// separate "Inverter configuration" settings tab, not in work schedule slots.
const exact = {
  slot_key: "02_03",
  enabled: true,
  mode: "Charging",
  minimum_sell_soc: 35,
  tou_soc: 50,
  charge_enabled: true,
};
const row = {
  hour: 2,
  proposed: true,
  action: "charge",
  profile_id: "charging",
  planned_energy_kwh: 1,
  planned_power_w: 1000,
  action_contract: {
    deployment_ready: true,
    schedule_update: exact,
  },
};

assertTrue(card.aiIsApplicableProposal(row), "deployable Core row must be applicable");
assertEqual(card.aiPlannedSlotPower(row), 1000, "charge preview must use final Core power");
assertEqual(card.aiRowUpdate(row), exact, "UI must forward the exact Core schedule contract");
const forwarded = card.aiRowUpdate(row);
["charge_current", "discharge_current", "grid_charge_current"].forEach((field) => {
  assertTrue(!(field in forwarded), `Core contract must not forward ${field}`);
});
assertTrue(forwarded.charge_enabled === true, "Grid Charge permission must stay in the Core contract");

const blocked = JSON.parse(JSON.stringify(row));
blocked.action_contract.deployment_ready = false;
assertTrue(!card.aiIsApplicableProposal(blocked), "row without deterministic physical conversion must stay preview-only");

const legacy = JSON.parse(JSON.stringify(row));
delete legacy.action_contract;
card.chargeProfileStoredValues = () => ({
  target_soc: 80,
  grid_charge_enabled: true,
});
const legacyUpdate = card.aiRowUpdate(legacy);
assertEqual(legacyUpdate.tou_soc, 80, "legacy charge rows must keep the SOC fallback");
assertEqual(legacyUpdate.charge_enabled, true, "legacy charge rows must keep the Grid Charge permission");
["charge_current", "discharge_current", "grid_charge_current"].forEach((field) => {
  assertTrue(!(field in legacyUpdate), `legacy fallback must not reintroduce ${field}`);
});

if (failures) process.exit(1);
console.log("Stage 5G.4B CoreActionContract card tests passed");
