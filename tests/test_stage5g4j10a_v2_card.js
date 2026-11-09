const fs = require("fs");
const path = require("path");

global.window = { setTimeout, clearTimeout };
global.document = {};
global.HTMLElement = class HTMLElement {};
global.customElements = { define: () => {} };

const cardPath = path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js");
const source = fs.readFileSync(cardPath, "utf8");
eval(source + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

let failures = 0;
const check = (condition, message) => {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
};

const card = new global.DeyeEnergyCard();
card.setConfig({});
const defaults = card.aiDefaults();
const settingsHtml = card.renderAiGeneralSettings();

check(defaults.minimumAutoSellPowerW === 1000, "minimum automatic Sell defaults to 1000 W");
check(defaults.priceEquivalenceBand === 0.05, "price equivalence band defaults to 0.05 GBP/kWh");
check(settingsHtml.includes("Minimum automatic sell power"), "minimum setting is visible");
check(settingsHtml.includes("Price difference considered close"), "price band setting is visible");
check(settingsHtml.includes("does not restrict manual control"), "minimum description preserves manual control");
check(card.aiUiText("higher_value_slot_reserved").includes("more expensive hour"), "future reserve reason is localized");
check(card.aiUiText("near_equal_price_group").includes("similar prices"), "equivalence reason is localized");
check(card.aiUiText("residual_below_minimum").includes("below the minimum"), "minimum residual reason is localized");

if (failures) process.exit(1);
console.log("Stage 5G.4J.10A v2 card tests passed");
