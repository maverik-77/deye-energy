const fs = require("fs");
const path = require("path");

global.window = {
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: clearTimeout,
  addEventListener: () => {},
  removeEventListener: () => {},
};
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.document = { scrollingElement: {}, documentElement: {}, body: {} };
global.HTMLElement = class {};
global.customElements = { define: () => {} };

const cardPath = path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js");
eval(fs.readFileSync(cardPath, "utf8") + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

const LEWA_OPTIONS = [
  { value: "Zero Export To Load", label: "Export disabled — Load measurement", available: true },
  { value: "Zero Export To CT", label: "Export disabled — CT measurement", available: true },
];
const SUNSYNK_OPTIONS = [
  { value: "Zero Export To Load", label: "Essential loads supply", available: true },
  { value: "Zero Export To CT", label: "Export disabled", available: true },
];

let failures = 0;
function assertTrue(value, message) {
  if (!value) { failures += 1; console.error(`FAIL: ${message}`); }
}
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function makeCard(options = LEWA_OPTIONS) {
  const attrs = {};
  if (options !== null) attrs.normal_profile_options = options;
  const card = new DeyeEnergyCard();
  card.setConfig({});
  card._hass = {
    states: {
      "sensor.deye_energy_manager_status": { state: "idle", attributes: attrs },
    },
  };
  return card;
}

function test_default_settings_normal_profile_uses_backend_provider_options() {
  assertEqual(makeCard(SUNSYNK_OPTIONS).normalProfileModeOptions(), SUNSYNK_OPTIONS.map((row) => [row.value, row.label]), "card must use backend metadata");
}
function test_default_settings_normal_profile_lewa_reka_uses_load_ct_labels() {
  assertEqual(makeCard(LEWA_OPTIONS).normalProfileModeOptions().map((row) => row[1]), ["Export disabled — Load measurement", "Export disabled — CT measurement"], "Lewa-Reka labels must be localized");
}
function test_default_settings_normal_profile_sunsynk_uses_essentials_zero_export_labels() {
  assertEqual(makeCard(SUNSYNK_OPTIONS).normalProfileModeOptions().map((row) => row[1]), ["Essential loads supply", "Export disabled"], "Sunsynk labels must reflect provider semantics");
}
function test_default_settings_normal_profile_custom_shows_only_configured_variants() {
  const custom = [
    { value: "Zero Export To Load", label: "Export disabled — Load measurement", available: true },
    { value: "Zero Export To CT", label: "Export disabled — CT measurement", available: false },
  ];
  assertEqual(makeCard(custom).normalProfileModeOptions(), [["Zero Export To Load", "Export disabled — Load measurement"]], "Custom must hide missing variants");
}
function test_default_settings_normal_profile_does_not_guess_provider_labels() {
  assertEqual(makeCard(null).normalProfileModeOptions(), [], "card must not guess without backend metadata");
}

const tests = [
  test_default_settings_normal_profile_uses_backend_provider_options,
  test_default_settings_normal_profile_lewa_reka_uses_load_ct_labels,
  test_default_settings_normal_profile_sunsynk_uses_essentials_zero_export_labels,
  test_default_settings_normal_profile_custom_shows_only_configured_variants,
  test_default_settings_normal_profile_does_not_guess_provider_labels,
];

(async () => {
  for (const test of tests) await test();
  if (failures) process.exit(1);
  console.log("All provider profile card tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
