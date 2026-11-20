// Focused checks for the Inverter configuration settings tab: it must be a
// navigation entry in Settings, must not reintroduce the removed current
// columns in the work schedule, and must use live register metadata for
// display, editing and validation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const CARD = fs.readFileSync(
  path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js"),
  "utf8"
);

const ALL_GROUPS = [
  "specification",
  "grid",
  "auxiliary",
  "battery_type",
  "battery_charging",
  "work_mode",
  "work_mode_detail",
];

function installDom() {
  global.window = {
    customElements: { define: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
  global.document = {
    createElement: () => ({ children: [], appendChild() {}, setAttribute() {}, addEventListener() {} }),
    createTextNode: (text) => ({ textContent: text }),
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    body: {},
    scrollingElement: {},
    documentElement: {},
  };
  global.HTMLElement = class HTMLElement {};
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.customElements = global.window.customElements;
  global.CSSStyleSheet = function () {};
  global.ShadowRoot = function () {};
  window.customCards = [];
}

function makeCard() {
  installDom();
  eval(CARD + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");
  const card = new global.DeyeEnergyCard();
  card.setConfig({ type: "custom:deye-energy-card" });
  card.querySelectorAll = () => [];
  card.querySelector = () => null;
  card._serviceCalls = [];
  card._hass = {
    states: {},
    services: {
      deye_energy: {
        get_inverter_configuration: {},
        apply_inverter_configuration_group: {},
      },
    },
    callService: async (...args) => {
      card._serviceCalls.push(args);
      return null;
    },
  };
  return card;
}

function settingsHtml(card, tab = "defaults") {
  card._dialog = { type: "settings" };
  card._settingsTab = tab;
  return card.renderDialog([], []);
}

function getResponse(card) {
  const calls = card._serviceCalls.filter(
    (args) => args[0] === "deye_energy" && args[1] === "get_inverter_configuration"
  );
  assert.ok(calls.length >= 1, "expected a get_inverter_configuration call");
  const args = calls[calls.length - 1];
  assert.equal(args[5], true, "get_inverter_configuration must request return_response");
  return args[4] || {};
}

function getMutation(card) {
  const calls = card._serviceCalls.filter(
    (args) => args[0] === "deye_energy" && args[1] === "apply_inverter_configuration_group"
  );
  assert.ok(calls.length >= 1, "expected an apply_inverter_configuration_group call");
  return calls[calls.length - 1][2];
}

function mutationCount(card) {
  return card._serviceCalls.filter(
    (args) => args[0] === "deye_energy" && args[1] === "apply_inverter_configuration_group"
  ).length;
}

function setServiceResponses(card, responses) {
  card._hass.callService = async (...args) => {
    card._serviceCalls.push(args);
    const suffix = String(args[1]).split(".").pop();
    if (Object.prototype.hasOwnProperty.call(responses, suffix)) {
      const response = responses[suffix];
      return typeof response === "function" ? response(args) : response;
    }
    return null;
  };
}

function configurationResponse(groups) {
  return { groups };
}

function writableGroup() {
  return {
    key: "battery_charging",
    label: "Battery charging",
    writable: true,
    fields: [
      {
        key: "charge_current",
        label: "Charge current",
        value: "20",
        unit: "A",
        domain: "number",
        writable: true,
        min: 0,
        max: 500,
        step: 0.5,
      },
      {
        key: "grid_charge_current",
        label: "Grid charge current",
        value: "10",
        unit: "A",
        domain: "number",
        writable: true,
        min: 0,
        max: 500,
        step: 0.5,
      },
      {
        key: "charging_mode",
        label: "Charging mode",
        value: "Auto",
        domain: "select",
        writable: true,
        options: ["Auto", "Manual"],
      },
      {
        key: "duration",
        label: "Duration",
        value: "12h",
        writable: false,
        read_only_reason: "Not mapped",
      },
    ],
  };
}

function readOnlyGroup() {
  return {
    key: "specification",
    label: "Specification",
    writable: false,
    fields: [
      {
        key: "rated_power",
        label: "Rated power",
        value: "5000",
        unit: "W",
        writable: false,
        read_only_reason: "Not mapped",
      },
      {
        key: "serial_number",
        label: "Serial",
        display_value: "Unavailable",
        writable: false,
        read_only_reason: "Unavailable",
      },
    ],
  };
}

function fillDraft(card, groupKey, values) {
  card._inverterConfigDrafts ||= {};
  Object.assign(card._inverterConfigDrafts, values);
}

// --- Settings navigation / removed columns -----------------------------------
function testSettingsNavHasInverterConfigTab() {
  const card = makeCard();
  const html = settingsHtml(card);
  assert.match(
    html,
    /data-settings-tab="inverter-config"[^>]*>Inverter configuration</,
    "Settings must expose an Inverter configuration tab"
  );
}

function testWorkScheduleHeaderHasNoRemovedCurrentColumns() {
  const card = makeCard();
  card.renderV073();
  const html = card.innerHTML || "";
  assert.match(
    html,
    /<thead><tr><th class="check-col"><\/th><th class="time-col">Hour<\/th><th>Mode<\/th><th>Power<\/th><th>Grid charging<\/th><th>SOC<\/th><th>Price min\.<\/th><th>Active<\/th><th>Action<\/th><\/tr><\/thead>/,
    "unexpected work-schedule header (current columns may have returned)"
  );
  assert.ok(!html.includes("Grid charge current"), "work schedule must not show Grid charge current");
  assert.ok(!html.includes("<th>Disch.</th>"), "work schedule must not show a Disch. column");
  assert.ok(!html.includes("<th>Chg.</th>"), "work schedule must not show a Chg. column");
}

// --- Loading and display ------------------------------------------------------
async function testLoadInverterConfigurationStoresAllGroupsWithReturnResponse() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse(
      ALL_GROUPS.map((key) => ({ key, label: key, fields: [] }))
    ),
  });
  const ok = await card.loadInverterConfiguration(true);
  assert.equal(ok, true, `load failed: ${card._inverterConfigError}`);
  getResponse(card);
  assert.deepEqual(
    (card.inverterConfigGroups() || []).map((group) => group.key),
    ALL_GROUPS
  );
}

function testUnmappedAndUnavailableFieldsAreReadOnlyAndLabelled() {
  const card = makeCard();
  card._inverterConfig = { groups: [readOnlyGroup()] };
  const html = settingsHtml(card, "inverter-config");
  assert.match(html, /Inverter configuration/);
  assert.match(html, /data-inverter-config-display="rated_power">Not mapped</);
  assert.match(html, /data-inverter-config-display="serial_number">Unavailable</);
  assert.ok(
    !html.includes("data-inverter-config-field="),
    "read-only fields must not expose editable inputs"
  );
  assert.match(
    html,
    /data-apply-inverter-config="specification"[^>]*disabled/,
    "Apply must be disabled when the group has no writable fields"
  );
}

// --- Live metadata, parsing, validation and apply ----------------------------
function testWritableFieldsUseLiveLimitsAndOptions() {
  const card = makeCard();
  card._inverterConfig = { groups: [writableGroup()] };
  const html = settingsHtml(card, "inverter-config");
  assert.match(
    html,
    /data-inverter-config-field="charge_current"[^>]*min="0"[^>]*max="500"[^>]*step="0\.5"/,
    "number limits must come from the service, not hard-coded current limits"
  );
  assert.ok(!/min="240"|max="290"|max="300"|max="320"/.test(html), "hard-coded current limits returned");
  assert.match(html, /data-inverter-config-field="charging_mode"[^>]*>[\s\S]*<option value="Auto"/);
  assert.match(html, /<option value="Manual"/);
}

async function testApplySendsOnlyWritableParsedValuesThenRereads() {
  const card = makeCard();
  let reads = 0;
  setServiceResponses(card, {
    get_inverter_configuration: () => {
      reads += 1;
      return configurationResponse([writableGroup(), readOnlyGroup()]);
    },
    apply_inverter_configuration_group: () => ({
      group: "battery_charging",
      status: "ok",
      results: [],
    }),
  });
  await card.loadInverterConfiguration(true);
  assert.equal(reads, 1);
  fillDraft(card, "battery_charging", {
    charge_current: "25.5",
    grid_charge_current: "12,5",
    charging_mode: "Manual",
    duration: "99h",
  });
  const ok = await card.applyInverterConfigGroup("battery_charging");
  assert.equal(ok, true, `apply failed unexpectedly: ${JSON.stringify(card._inverterConfigMessages)}`);
  assert.deepEqual(getMutation(card), {
    group: "battery_charging",
    values: {
      charge_current: 25.5,
      grid_charge_current: 12.5,
      charging_mode: "Manual",
    },
  });
  assert.equal(reads, 2, "apply must re-read configuration after a successful write");
}

async function testApplyErrorIsReportedWithoutThrowing() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse([writableGroup()]),
    apply_inverter_configuration_group: () => ({
      group: "battery_charging",
      status: "failed",
      results: [],
      error: "register write failed",
    }),
  });
  await card.loadInverterConfiguration(true);
  fillDraft(card, "battery_charging", { charge_current: "21" });
  const ok = await card.applyInverterConfigGroup("battery_charging");
  assert.equal(ok, false);
  assert.match(
    String(card._inverterConfigMessages.battery_charging?.text),
    /register write failed/
  );
}

async function testApplyRejectsOutOfRangeInputWithoutCallingService() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse([writableGroup()]),
    apply_inverter_configuration_group: () => ({ status: "ok" }),
  });
  await card.loadInverterConfiguration(true);
  fillDraft(card, "battery_charging", { charge_current: "9999" });
  const ok = await card.applyInverterConfigGroup("battery_charging");
  assert.equal(ok, false, "out-of-range value must be rejected");
  assert.match(
    String(card._inverterConfigMessages.battery_charging?.text),
    /Charge current.*between 0 and 500/
  );
  assert.equal(mutationCount(card), 0, "no apply service call should be made for invalid input");
}

module.exports = async function run() {
  testSettingsNavHasInverterConfigTab();
  testWorkScheduleHeaderHasNoRemovedCurrentColumns();
  await testLoadInverterConfigurationStoresAllGroupsWithReturnResponse();
  testUnmappedAndUnavailableFieldsAreReadOnlyAndLabelled();
  testWritableFieldsUseLiveLimitsAndOptions();
  await testApplySendsOnlyWritableParsedValuesThenRereads();
  await testApplyErrorIsReportedWithoutThrowing();
  await testApplyRejectsOutOfRangeInputWithoutCallingService();
  console.log("inverter config card: 8 checks passed");
};

if (require.main === module) module.exports().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
