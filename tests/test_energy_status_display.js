const fs = require("fs");
const path = require("path");

global.window = {
  setTimeout: (fn, ms) => (ms >= 1000 ? 1 : setTimeout(fn, ms)),
  clearTimeout: (id) => { if (id && id !== 1) clearTimeout(id); },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;
global.document = { scrollingElement: {}, documentElement: {}, body: {} };
class HTMLElement {}
global.HTMLElement = HTMLElement;
global.customElements = { define: () => {} };

const componentCard = path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js");
const rootCard = path.join(__dirname, "..", "www", "deye-energy-card.js");
eval(fs.readFileSync(componentCard, "utf8") + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

let failures = 0;
function assertTrue(value, message) {
  if (!value) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const ROLES = [
  { key: "pv_power", label: "PV power", group: "PV" },
  { key: "pv1_power", label: "PV1 power", group: "PV" },
  { key: "grid_power", label: "Grid power", group: "Grid" },
  { key: "battery_soc", label: "Battery SOC", group: "Battery" },
];

function makeCard(options = {}) {
  const calls = [];
  const errors = [];
  let response = options.response;
  const display = {
    schema_version: 1,
    mappings: options.mappings || {},
    visibility: options.visibility || {},
    roles: options.roles === undefined ? ROLES : options.roles,
  };
  const card = new DeyeEnergyCard();
  card.setConfig(options.config || {});
  const stateAttrs = { energy_status_display: display };
  if (options.noDisplay) delete stateAttrs.energy_status_display;
  card._hass = {
    states: {
      "sensor.deye_energy_ai_state": { state: "ok", attributes: stateAttrs },
    },
    services: {
      deye_energy: {
        save_energy_status_display: options.noService ? undefined : true,
      },
    },
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      if (typeof response === "function") return response(domain, service, data);
      return response;
    },
  };
  card.querySelector = () => null;
  card.querySelectorAll = () => [];
  card.render = () => {};
  card.renderDialogOnly = () => {};
  card.beginSave = () => { errors.push("begin"); };
  card.finishSave = () => { errors.push("finish"); };
  card.failSave = () => { errors.push("fail"); };
  return { card, calls, errors, display };
}

function serviceCalls(calls, service) {
  return calls.filter((call) => call.domain === "deye_energy" && call.service === service);
}

function test_display_defaults_to_empty_without_attribute() {
  const { card } = makeCard({ noDisplay: true });
  assertEqual(card.energyStatusDisplay(), {}, "missing attribute must yield an empty object");
  assertTrue(card.energyStatusVisible("pv_power"), "missing visibility must default to visible");
}

function test_display_is_read_from_ai_state_attributes() {
  const { card, display } = makeCard({
    mappings: { pv_power: "sensor.custom_pv" },
    visibility: { grid_power: false },
  });
  assertEqual(card.energyStatusDisplay(), display, "display must come from ai_state attributes");
}

function test_visibility_defaults_true_and_respects_overrides() {
  const { card } = makeCard({ visibility: { grid_power: false, battery_soc: true } });
  assertTrue(card.energyStatusVisible("pv_power"), "unlisted role must be visible");
  assertTrue(card.energyStatusVisible("battery_soc"), "explicit true must be visible");
  assertTrue(!card.energyStatusVisible("grid_power"), "explicit false must be hidden");
}

function test_entity_mapping_override_then_fallback() {
  const { card } = makeCard({
    config: { entities: { pv1_power: "sensor.configured_pv1" } },
    mappings: { pv_power: "sensor.custom_pv" },
  });
  assertEqual(card.energyStatusEntity("pv_power"), "sensor.custom_pv", "mapping override must win");
  assertEqual(card.energyStatusEntity("pv1_power"), "sensor.configured_pv1", "configured entity must be the fallback");
  assertEqual(card.energyStatusEntity("grid_power"), "sensor.deye_energy_grid_power", "unmapped role must use the default entity");
}

function test_tab_shows_hint_without_roles() {
  const { card } = makeCard({ roles: [] });
  const html = card.renderEnergyStatusTab();
  assertTrue(html.includes("Energy status sensors"), "tab must have a title");
  assertTrue(html.includes("Install the update and restart Home Assistant"), "tab must explain missing backend support");
  assertTrue(!html.includes("data-save-energy-status"), "save must be hidden without roles");
}

function test_tab_renders_grouped_rows_and_controls() {
  const { card } = makeCard({
    mappings: { pv_power: "sensor.custom_pv" },
    visibility: { grid_power: false },
  });
  const html = card.renderEnergyStatusTab();
  assertTrue(html.includes("data-save-energy-status=\"1\""), "save button must be rendered");
  assertTrue(html.includes("data-energy-role-field=\"mapping\" data-energy-role=\"pv_power\""), "mapping input must be rendered");
  assertTrue(html.includes("value=\"sensor.custom_pv\""), "existing mapping must be shown");
  assertTrue(html.includes("data-energy-role-field=\"visible\" data-energy-role=\"grid_power\""), "visibility checkbox must be rendered");
  const gridCheckbox = html.split("data-energy-role-field=\"visible\" data-energy-role=\"grid_power\"")[1].slice(0, 80);
  assertTrue(!gridCheckbox.includes("checked"), "hidden role checkbox must be unchecked");
  const pvCheckbox = html.split("data-energy-role-field=\"visible\" data-energy-role=\"pv_power\"")[1].slice(0, 80);
  assertTrue(pvCheckbox.includes("checked"), "visible role checkbox must be checked");
  assertTrue(html.indexOf("&gt;PV&lt;") === -1, "labels must be escaped cleanly");
  assertTrue(html.includes("<h3>PV</h3>"), "group heading must be rendered");
  assertTrue(html.indexOf("<h3>PV</h3>") < html.indexOf("<h3>Grid</h3>"), "groups must be rendered from the backend catalog");
}

function test_collect_draft_reads_mapping_and_visibility_from_dom() {
  const { card } = makeCard();
  const values = {
    "mapping|pv_power": "sensor.new_pv",
    "visible|pv_power": true,
    "visible|grid_power": false,
  };
  card.querySelector = (selector) => {
    if (selector.includes("[data-energy-role-field='mapping'][data-energy-role=\"pv_power\"]")) {
      return { value: "  sensor.new_pv  " };
    }
    if (selector.includes("[data-energy-role-field='visible'][data-energy-role=\"pv_power\"]")) {
      return { checked: values["visible|pv_power"] };
    }
    if (selector.includes("[data-energy-role-field='visible'][data-energy-role=\"grid_power\"]")) {
      return { checked: values["visible|grid_power"] };
    }
    return null;
  };
  const draft = card.collectEnergyStatusDraft();
  assertEqual(draft.mappings, { pv_power: "sensor.new_pv" }, "only non-empty mappings must be collected");
  assertEqual(draft.visibility, { pv_power: true, pv1_power: true, grid_power: false, battery_soc: true }, "every role must get a visibility value");
  assertEqual(card._energyStatusDraft, draft, "draft must be stored for re-render");
}

function test_save_calls_service_with_correct_payload() {
  const { card, calls, errors } = makeCard();
  card.collectEnergyStatusDraft = () => ({ mappings: { pv_power: "sensor.new_pv" }, visibility: { grid_power: false } });
  return card.saveEnergyStatusDisplay().then((saved) => {
    assertTrue(saved, "save must succeed");
    const saveCalls = serviceCalls(calls, "save_energy_status_display");
    assertEqual(saveCalls.length, 1, "save must call the service once");
    const payload = JSON.parse(saveCalls[0].data.data);
    assertEqual(payload.mappings, { pv_power: "sensor.new_pv" }, "payload must carry mappings");
    assertEqual(payload.visibility, { grid_power: false }, "payload must carry visibility");
    assertEqual(card._energyStatusDraft, null, "draft must be cleared after save");
    assertEqual(errors, ["begin", "finish"], "save indicator must begin then finish");
  });
}

function test_save_reports_unavailable_service() {
  const { card, calls } = makeCard({ noService: true });
  return card.saveEnergyStatusDisplay().then((saved) => {
    assertTrue(!saved, "save must fail without the service");
    assertEqual(serviceCalls(calls, "save_energy_status_display").length, 0, "no service call must be made");
    assertTrue(card._energyStatusMessage.includes("unavailable"), "message must explain the missing service");
  });
}

function test_save_handles_service_error() {
  const { card, calls, errors } = makeCard({ response: () => { throw new Error("boom"); } });
  card.collectEnergyStatusDraft = () => ({ mappings: {}, visibility: {} });
  return card.saveEnergyStatusDisplay().then((saved) => {
    assertTrue(!saved, "save must not succeed on error");
    assertEqual(serviceCalls(calls, "save_energy_status_display").length, 1, "service must be attempted once");
    assertTrue(card._energyStatusMessage.includes("boom"), "message must include the error");
    assertTrue(errors.includes("fail"), "save indicator must report failure");
  });
}

function test_both_card_copies_remain_identical() {
  assertTrue(fs.readFileSync(componentCard).equals(fs.readFileSync(rootCard)), "both card copies must remain identical");
}

const tests = [
  test_display_defaults_to_empty_without_attribute,
  test_display_is_read_from_ai_state_attributes,
  test_visibility_defaults_true_and_respects_overrides,
  test_entity_mapping_override_then_fallback,
  test_tab_shows_hint_without_roles,
  test_tab_renders_grouped_rows_and_controls,
  test_collect_draft_reads_mapping_and_visibility_from_dom,
  test_save_calls_service_with_correct_payload,
  test_save_reports_unavailable_service,
  test_save_handles_service_error,
  test_both_card_copies_remain_identical,
];

(async () => {
  for (const test of tests) {
    try { await test(); } catch (error) {
      failures += 1;
      console.error(`FAIL: ${test.name}\n  ${error?.stack || error}`);
    }
  }
  if (failures) process.exit(1);
  console.log(`All energy status display tests passed (${tests.length})`);
})();
