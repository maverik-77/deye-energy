// Focused checks for the standalone Inverter configuration card.
// Verifies live loading, sub-tabs, read-only labeling, live metadata validation,
// confirmation overlay with previous/current values, and apply behavior.
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
  global.HTMLElement = class HTMLElement {
    connectedCallback() {}
    disconnectedCallback() {}
  };
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.customElements = global.window.customElements;
  global.CSSStyleSheet = function () {};
  global.ShadowRoot = function () {};
  window.customCards = [];
}

function evalCard() {
  installDom();
  eval(CARD + "\n" +
    "global.DeyeEnergyCard = typeof DeyeEnergyCard !== 'undefined' ? DeyeEnergyCard : undefined;\n" +
    "global.DeyeEnergyInverterConfigCard = typeof DeyeEnergyInverterConfigCard !== 'undefined' ? DeyeEnergyInverterConfigCard : undefined;\n" +
    "global.DeyeEnergyTriggerLogsCard = typeof DeyeEnergyTriggerLogsCard !== 'undefined' ? DeyeEnergyTriggerLogsCard : undefined;");
}

function makeMainCard() {
  evalCard();
  const card = new global.DeyeEnergyCard();
  card.setConfig({ type: "custom:deye-energy-card" });
  card.querySelectorAll = () => [];
  card.querySelector = () => null;
  card._hass = { states: {}, services: { deye_energy: {} }, callService: async () => null };
  return card;
}

function makeCard() {
  evalCard();
  const card = new global.DeyeEnergyInverterConfigCard();
  card.isConnected = true;
  card.setConfig({ type: "custom:deye-energy-inverter-config-card" });
  card._serviceCalls = [];
  card._hass = {
    states: {},
    services: {
      deye_energy: {
        get_inverter_configuration: {},
        apply_inverter_configuration_group: {},
        sync_inverter_datetime: {},
      },
    },
    callService: async (...args) => {
      card._serviceCalls.push(args);
      return null;
    },
  };
  // Avoid real DOM dependency in unit tests; render to innerHTML string
  card.querySelectorAll = (sel) => {
    // Minimal support for collectInverterConfigDrafts in tests: no DOM inputs, use drafts
    return [];
  };
  card.querySelector = () => null;
  return card;
}

function renderHtml(card) {
  card._render();
  return card.innerHTML || "";
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

function configurationResponse(groups, datetimeStatus = null) {
  return { groups, datetime_status: datetimeStatus };
}

function writableGroup() {
  return {
    key: "battery_charging",
    label: "Battery charging",
    writable: true,
    fields: [
      { key: "charge_current", label: "Charge current", value: "20", display_value: "20", unit: "A", domain: "number", writable: true, min: 0, max: 500, step: 0.5 },
      { key: "grid_charge_current", label: "Grid charge current", value: "10", display_value: "10", unit: "A", domain: "number", writable: true, min: 0, max: 500, step: 0.5 },
      { key: "charging_mode", label: "Charging mode", value: "Auto", display_value: "Auto", domain: "select", writable: true, options: ["Auto", "Manual"] },
      { key: "duration", label: "Duration", value: "12h", display_value: "Not mapped", writable: false, read_only_reason: "Not mapped" },
    ],
  };
}

function readOnlyGroup() {
  return {
    key: "specification",
    label: "Specification",
    writable: false,
    fields: [
      { key: "rated_power", label: "Rated power", value: "5000", unit: "W", display_value: "Not mapped", writable: false, read_only_reason: "Not mapped" },
      { key: "serial_number", label: "Serial", display_value: "Unavailable", writable: false, read_only_reason: "Unavailable" },
    ],
  };
}

function fillDraft(card, values) {
  card._inverterConfigDrafts ||= {};
  Object.assign(card._inverterConfigDrafts, values);
}

function getResponse(card) {
  const calls = card._serviceCalls.filter((args) => args[0] === "deye_energy" && args[1] === "get_inverter_configuration");
  assert.ok(calls.length >= 1, "expected a get_inverter_configuration call");
  return calls[calls.length - 1];
}

function getMutation(card) {
  const calls = card._serviceCalls.filter((args) => args[0] === "deye_energy" && args[1] === "apply_inverter_configuration_group");
  assert.ok(calls.length >= 1, "expected an apply_inverter_configuration_group call");
  return calls[calls.length - 1][2];
}

function mutationCount(card) {
  return card._serviceCalls.filter((args) => args[0] === "deye_energy" && args[1] === "apply_inverter_configuration_group").length;
}

function testStandaloneCardRegistered() {
  evalCard();
  assert.ok(global.DeyeEnergyInverterConfigCard, "DeyeEnergyInverterConfigCard must be defined");
  const types = (window.customCards || []).map((c) => c.type);
  assert.ok(types.includes("deye-energy-inverter-config-card"), "customCards should include deye-energy-inverter-config-card");
}

function testWorkScheduleHeaderHasNoRemovedCurrentColumns() {
  const card = makeMainCard();
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

async function testLoadInverterConfigurationStoresAllGroupsWithReturnResponse() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse(ALL_GROUPS.map((key) => ({ key, label: key, fields: [] }))),
  });
  const ok = await card._loadLive(true);
  assert.equal(ok, true, `load failed: ${card._inverterConfigError}`);
  getResponse(card);
  assert.deepEqual((card.inverterConfigGroups() || []).map((group) => group.key), ALL_GROUPS);
}

function testUnmappedAndUnavailableFieldsAreReadOnlyAndLabelled() {
  const card = makeCard();
  card._inverterConfig = { groups: [readOnlyGroup()] };
  card._inverterConfigLoaded = true;
  card._inverterConfigSubTab = "specification";
  const html = renderHtml(card);
  assert.match(html, /Inverter configuration/);
  assert.match(html, /data-inverter-config-subtab="specification"/);
  assert.match(html, /data-inverter-config-display="rated_power">Not mapped</);
  assert.match(html, /data-inverter-config-display="serial_number">Unavailable</);
  assert.ok(!html.includes("data-inverter-config-field="), "read-only fields must not expose editable inputs");
  assert.match(html, /data-apply-inverter-config="specification"[^>]*disabled/, "Apply must be disabled when the group has no writable fields");
}

function testWritableFieldsUseLiveLimitsAndOptions() {
  const card = makeCard();
  card._inverterConfig = { groups: [writableGroup()] };
  card._inverterConfigLoaded = true;
  card._inverterConfigSubTab = "battery_inverter";
  const html = renderHtml(card);
  assert.match(html, /data-inverter-config-subtab="battery_inverter"/);
  assert.match(
    html,
    /data-inverter-config-field="charge_current"[^>]*min="0"[^>]*max="500"[^>]*step="0\.5"/,
    "number limits must come from the service, not hard-coded current limits"
  );
  assert.ok(!/min="240"|max="290"|max="300"|max="320"/.test(html), "hard-coded current limits returned");
  assert.match(html, /data-inverter-config-field="charging_mode"[\s\S]*<option value="Auto"/);
  assert.match(html, /<option value="Manual"/);
}

async function testApplyShowsConfirmationThenSendsOnConfirm() {
  const card = makeCard();
  let reads = 0;
  setServiceResponses(card, {
    get_inverter_configuration: () => {
      reads += 1;
      return configurationResponse([writableGroup(), readOnlyGroup()]);
    },
    apply_inverter_configuration_group: () => ({ group: "battery_charging", status: "ok", results: [] }),
  });
  await card._loadLive(true);
  assert.equal(reads, 1);
  fillDraft(card, { charge_current: "25.5", grid_charge_current: "12,5", charging_mode: "Manual" });

  card.requestApplyInverterConfigGroup("battery_charging");
  assert.ok(card._pendingApply, "confirmation overlay should be shown");
  assert.equal(card._pendingApply.groupKey, "battery_charging");
  assert.equal(mutationCount(card), 0, "no apply call before confirmation");
  const confirmHtml = renderHtml(card);
  assert.match(confirmHtml, /Confirm upload to inverter/);
  assert.match(confirmHtml, /Charge current/);
  assert.match(confirmHtml, />20 A</); // previous
  assert.match(confirmHtml, />25\.5 A</); // new

  await card.confirmPendingApply();
  assert.equal(mutationCount(card), 1);
  assert.deepEqual(getMutation(card), {
    group: "battery_charging",
    values: { charge_current: 25.5, grid_charge_current: 12.5, charging_mode: "Manual" },
  });
  assert.equal(reads, 2, "apply must re-read configuration after a successful write");
}

async function testApplyErrorIsReportedWithoutThrowing() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse([writableGroup()]),
    apply_inverter_configuration_group: () => ({ group: "battery_charging", status: "failed", results: [], error: "register write failed" }),
  });
  await card._loadLive(true);
  fillDraft(card, { charge_current: "21" });
  card.requestApplyInverterConfigGroup("battery_charging");
  await card.confirmPendingApply();
  assert.match(String(card._inverterConfigMessages.battery_charging?.text), /register write failed/);
}

async function testApplyRejectsOutOfRangeInputWithoutCallingService() {
  const card = makeCard();
  setServiceResponses(card, {
    get_inverter_configuration: configurationResponse([writableGroup()]),
    apply_inverter_configuration_group: () => ({ status: "ok" }),
  });
  await card._loadLive(true);
  fillDraft(card, { charge_current: "9999" });
  card.requestApplyInverterConfigGroup("battery_charging");
  assert.equal(card._pendingApply, null, "invalid input must not open confirmation");
  assert.match(String(card._inverterConfigMessages.battery_charging?.text), /Charge current.*between 0 and 500/);
  assert.equal(mutationCount(card), 0, "no apply service call should be made for invalid input");
}

async function testNoChangeDoesNotOpenConfirmation() {
  const card = makeCard();
  setServiceResponses(card, { get_inverter_configuration: configurationResponse([writableGroup()]) });
  await card._loadLive(true);
  fillDraft(card, { charge_current: "20", grid_charge_current: "10", charging_mode: "Auto" });
  card.requestApplyInverterConfigGroup("battery_charging");
  assert.equal(card._pendingApply, null);
  assert.match(String(card._inverterConfigMessages.battery_charging?.text), /No changes to upload/);
  assert.equal(mutationCount(card), 0);
}

async function testInverterDatetimeSectionRendersAndSyncs() {
  const card = makeCard();
  let reads = 0;
  setServiceResponses(card, {
    get_inverter_configuration: () => {
      reads += 1;
      return configurationResponse([writableGroup()], {
        entity_id: "text.deye_date_time",
        inverter_time: reads === 1 ? "2026-11-21 10:00:05" : "2026-11-21 10:00:10",
        ha_time: "2026-11-21 10:00:10",
        in_sync: reads !== 1,
        deviation_seconds: reads === 1 ? 5 : 0,
        last_check_at: "2026-11-21T10:00:00+00:00",
        last_sync_at: reads === 1 ? null : "2026-11-21T10:00:10+00:00",
        last_error: "",
      });
    },
    sync_inverter_datetime: () => ({ status: "ok", ha_time: "2026-11-21 10:00:10" }),
  });
  await card._loadLive(true);
  const html = renderHtml(card);
  assert.match(html, /Inverter time/);
  assert.match(html, /Home Assistant server time/);
  assert.match(html, /2026-11-21 10:00:05/);
  assert.match(html, /2026-11-21 10:00:10/);
  assert.match(html, /data-sync-inverter-datetime="1"/);
  assert.match(html, /Out of sync/);

  const ok = await card.syncInverterDatetime();
  assert.equal(ok, true);
  const syncCalls = card._serviceCalls.filter((args) => args[0] === "deye_energy" && args[1] === "sync_inverter_datetime");
  assert.equal(syncCalls.length, 1);
  assert.equal(reads, 2, "sync should refresh inverter configuration");
  const htmlAfter = renderHtml(card);
  assert.match(htmlAfter, /In sync/);
}

async function testLoadsLiveOnConnectedCallback() {
  const card = makeCard();
  let reads = 0;
  setServiceResponses(card, { get_inverter_configuration: () => { reads++; return configurationResponse([writableGroup()]); } });
  card.connectedCallback();
  // allow async load
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(reads >= 1, "should load live values on connect");
}

module.exports = async function run() {
  testStandaloneCardRegistered();
  testWorkScheduleHeaderHasNoRemovedCurrentColumns();
  await testLoadInverterConfigurationStoresAllGroupsWithReturnResponse();
  testUnmappedAndUnavailableFieldsAreReadOnlyAndLabelled();
  testWritableFieldsUseLiveLimitsAndOptions();
  await testApplyShowsConfirmationThenSendsOnConfirm();
  await testApplyErrorIsReportedWithoutThrowing();
  await testApplyRejectsOutOfRangeInputWithoutCallingService();
  await testNoChangeDoesNotOpenConfirmation();
  await testInverterDatetimeSectionRendersAndSyncs();
  await testLoadsLiveOnConnectedCallback();
  console.log("inverter config card: 11 checks passed");
};

if (require.main === module) module.exports().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
