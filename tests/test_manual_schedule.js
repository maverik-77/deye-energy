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

function manualRow(overrides = {}) {
  return {
    from: "00:00",
    to: "00:00",
    enabled: true,
    mode: "Normal Operation",
    physical_work_mode: "Zero Export To Load",
    sell_power: 0,
    discharge_current: 120,
    charge_current: 120,
    grid_charge_current: 60,
    minimum_sell_soc: 0,
    tou_soc: 20,
    min_sell_price: 0,
    charge_enabled: false,
    ...overrides,
  };
}

function makeCard(options = {}) {
  const manual = options.manual || {
    schema_version: 1,
    active: false,
    rows: [
      manualRow({ to: "12:00" }),
      manualRow({ from: "12:00", mode: "Selling", sell_power: 4000, tou_soc: 30 }),
    ],
    has_activation_snapshot: false,
    valid: true,
    validation_error: "",
  };
  const calls = [];
  let response = options.response;
  const card = new DeyeEnergyCard();
  card.setConfig({});
  card._hass = {
    states: {
      "sensor.deye_energy_ai_state": { state: "ok", attributes: { manual_schedule: manual } },
    },
    services: {
      deye_energy: {
        save_manual_schedule: true,
        init_manual_schedule_from_tou: true,
        activate_manual_schedule: true,
        deactivate_manual_schedule: true,
      },
    },
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      if (typeof response === "function") return response(domain, service, data);
      return response;
    },
  };
  card.normalProfileStoredValues = () => ({
    physical_work_mode: "Zero Export To Load",
    sell_power: 3000,
    discharge_current: 80,
    charge_current: 25,
    grid_charge_current: 35,
    tou_soc: 45,
  });
  card.normalProfileModeOptions = () => [
    ["Zero Export To Load", "Zero Export To Load"],
    ["Zero Export To CT", "Zero Export To CT"],
  ];
  card.defaultPhysicalWorkMode = () => "Zero Export To Load";
  card.querySelector = () => null;
  card.querySelectorAll = () => [];
  card.render = () => {};
  card.renderDialogOnly = () => {};
  card.beginSave = () => {};
  card.finishSave = () => {};
  card.failSave = () => {};
  return { card, calls, manual };
}

function serviceCalls(calls, service) {
  return calls.filter((call) => call.domain === "deye_energy" && call.service === service);
}

function test_manual_backend_state_populates_draft() {
  const { card } = makeCard();
  const rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 2, "backend rows must populate the draft");
  assertEqual(rows[0].to, "12:00", "first row end must be kept");
  assertEqual(rows[1].mode, "Selling", "row mode must be kept");
  assertEqual(rows[1].tou_soc, 30, "row TOU SOC must be kept");
  assertTrue(!card.manualScheduleDirty(), "fresh draft must not be dirty");
}

function test_manual_default_draft_covers_the_full_day() {
  const { card } = makeCard({ manual: { rows: [] } });
  const rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 1, "empty backend must start with one row");
  assertEqual([rows[0].from, rows[0].to], ["00:00", "00:00"], "single row must cover the full day");
  assertEqual(card.validateManualScheduleRows(rows), "", "single full-day row must be valid");
}

function test_manual_validation_rejects_gaps_overlaps_and_boundaries() {
  const { card } = makeCard();
  const cases = [
    [[manualRow({ from: "00:01" })], "must start at 00:00"],
    [[manualRow({ to: "12:00" }), manualRow({ from: "12:00", to: "13:00" })], "must end at 00:00"],
    [[manualRow({ to: "12:00" }), manualRow({ from: "13:00" })], "without gaps"],
    [[manualRow({ to: "13:00" }), manualRow({ from: "12:00" })], "must not overlap"],
    [[manualRow({ to: "10:00" }), manualRow({ from: "10:00", to: "10:00" }), manualRow({ from: "10:00" })], "at least 1 minute"],
  ];
  cases.forEach(([rows, expected]) => {
    const error = card.validateManualScheduleRows(rows);
    assertTrue(error.includes(expected), `validation must report "${expected}", got "${error}"`);
  });
}

function test_manual_validation_accepts_arbitrary_minute_contiguous_rows() {
  const { card } = makeCard();
  const rows = [
    manualRow({ to: "07:15" }),
    manualRow({ from: "07:15", to: "19:45", mode: "Selling", sell_power: 4000 }),
    manualRow({ from: "19:45", mode: "Charging", charge_enabled: true }),
  ];
  assertEqual(card.validateManualScheduleRows(rows), "", "contiguous arbitrary-minute rows must be valid");
}

function test_manual_add_and_remove_rows_keep_the_chain_contiguous() {
  const { card } = makeCard({ manual: { rows: [] } });
  card.ensureManualScheduleDraft();
  card.addManualScheduleRow();
  let rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 2, "add must create a second row");
  assertEqual([rows[0].to, rows[1].from], ["12:00", "12:00"], "split must keep the boundary contiguous");
  assertEqual(rows[1].to, "00:00", "new last row must end at midnight");
  assertEqual(card.validateManualScheduleRows(rows), "", "split rows must cover the full day");

  card.removeManualScheduleRow(0);
  rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 1, "remove must drop the row");
  assertEqual([rows[0].from, rows[0].to], ["00:00", "00:00"], "removing the first row must keep full-day coverage");
}

function test_manual_save_sends_normalized_rows_once() {
  const { card, calls } = makeCard();
  card.ensureManualScheduleDraft()[1].sell_power = 4321;
  return card.saveManualSchedule().then((saved) => {
    assertTrue(saved, "save must succeed");
    const saveCalls = serviceCalls(calls, "save_manual_schedule");
    assertEqual(saveCalls.length, 1, "save must call save_manual_schedule once");
    const payload = JSON.parse(saveCalls[0].data.data);
    assertEqual(payload.length, 2, "payload must contain every row");
    assertEqual(payload[1].sell_power, 4321, "payload must contain the edited value");
    assertEqual(payload[0].from, "00:00", "first row must start at 00:00");
    assertEqual(payload[1].to, "00:00", "last row must end at 00:00");
  });
}

function test_manual_save_rejects_invalid_rows_before_calling_the_service() {
  const { card, calls } = makeCard();
  card.ensureManualScheduleDraft()[0].to = "11:30";
  return card.saveManualSchedule().then((saved) => {
    assertTrue(!saved, "invalid save must not succeed");
    assertEqual(serviceCalls(calls, "save_manual_schedule").length, 0, "invalid save must not call the service");
    assertTrue(card._manualScheduleError.includes("without gaps"), "invalid save must show the validation error");
  });
}

function test_manual_activate_saves_then_activates_and_applies_response() {
  const activated = {
    active: true,
    rows: [manualRow({ to: "12:00" }), manualRow({ from: "12:00", mode: "Selling", sell_power: 4000 })],
    has_activation_snapshot: true,
    valid: true,
    validation_error: "",
  };
  const { card, calls } = makeCard({ response: (domain, service) => service === "activate_manual_schedule" ? activated : undefined });
  return card.activateManualSchedule().then((ok) => {
    assertTrue(ok, "activation must succeed");
    const order = calls.filter((call) => ["save_manual_schedule", "activate_manual_schedule"].includes(call.service)).map((call) => call.service);
    assertEqual(order, ["save_manual_schedule", "activate_manual_schedule"], "activation must save first, then activate");
    assertTrue(card._manualScheduleActive, "service response must mark the schedule active");
  });
}

function test_manual_deactivate_calls_the_service_and_clears_active_state() {
  const { card, calls } = makeCard({
    response: (domain, service) => service === "deactivate_manual_schedule"
      ? { active: false, rows: [manualRow()], has_activation_snapshot: false, valid: true, validation_error: "" }
      : undefined,
  });
  card.applyManualScheduleState({ active: true, rows: [manualRow()] });
  return card.deactivateManualSchedule().then((ok) => {
    assertTrue(ok, "deactivation must succeed");
    assertEqual(serviceCalls(calls, "deactivate_manual_schedule").length, 1, "deactivate service must be called once");
    assertTrue(!card._manualScheduleActive, "service response must clear active state");
  });
}

function test_manual_init_from_tou_calls_the_service() {
  const { card, calls } = makeCard({
    response: (domain, service) => service === "init_manual_schedule_from_tou"
      ? { active: false, rows: [manualRow()], has_activation_snapshot: false, valid: true, validation_error: "" }
      : undefined,
  });
  return card.initManualScheduleFromTou().then((ok) => {
    assertTrue(ok, "initialize must succeed");
    assertEqual(serviceCalls(calls, "init_manual_schedule_from_tou").length, 1, "initialize service must be called once");
    assertEqual(card.ensureManualScheduleDraft().length, 1, "service response must replace the draft");
  });
}

function test_manual_tab_renders_rows_controls_and_active_status() {
  const { card } = makeCard();
  const inactive = card.renderManualScheduleTab();
  assertTrue(inactive.includes("Manual schedule: Inactive"), "inactive status must be shown");
  assertTrue(inactive.includes('data-manual-activate="1"'), "activate control must be present");
  assertTrue(inactive.includes('data-manual-add="1"'), "add row control must be present");
  assertTrue(inactive.includes('data-manual-init="1"'), "initialize control must be present");
  assertTrue(inactive.includes('data-manual-save="1"'), "save control must be present");
  assertTrue(inactive.includes('data-manual-field="from" data-manual-index="1"'), "middle From must be editable");
  assertTrue(inactive.includes('data-manual-field="to" data-manual-index="0"'), "middle To must be editable");
  assertTrue(!inactive.includes('data-manual-field="from" data-manual-index="0"'), "first From must be fixed");
  assertTrue(!inactive.includes('data-manual-field="to" data-manual-index="1"'), "last To must be fixed");

  card.applyManualScheduleState({ active: true, rows: [manualRow()] });
  const active = card.renderManualScheduleTab();
  assertTrue(active.includes("Manual schedule: Active"), "active status must be shown");
  assertTrue(active.includes('data-manual-deactivate="1"'), "deactivate control must be present");
  assertTrue(active.includes("AI, optimizer and future-plan applies are blocked"), "active blocking must be explained");
}

function test_manual_tab_exposes_fixed_last_midnight_boundary() {
  const { card } = makeCard();
  card.applyManualScheduleState({ active: false, rows: [manualRow(), manualRow({ from: "12:00" })] });
  const html = card.renderManualScheduleTab();
  assertTrue(!html.includes('data-manual-field="to" data-manual-index="1"'), "last To must be fixed at 00:00");
  assertTrue(html.includes('data-manual-field="to" data-manual-index="0"'), "middle To must be editable");
}

function test_both_card_copies_remain_identical() {
  assertTrue(fs.readFileSync(componentCard).equals(fs.readFileSync(rootCard)), "both card copies must remain identical");
}

const tests = [
  test_manual_backend_state_populates_draft,
  test_manual_default_draft_covers_the_full_day,
  test_manual_validation_rejects_gaps_overlaps_and_boundaries,
  test_manual_validation_accepts_arbitrary_minute_contiguous_rows,
  test_manual_add_and_remove_rows_keep_the_chain_contiguous,
  test_manual_save_sends_normalized_rows_once,
  test_manual_save_rejects_invalid_rows_before_calling_the_service,
  test_manual_activate_saves_then_activates_and_applies_response,
  test_manual_deactivate_calls_the_service_and_clears_active_state,
  test_manual_init_from_tou_calls_the_service,
  test_manual_tab_renders_rows_controls_and_active_status,
  test_manual_tab_exposes_fixed_last_midnight_boundary,
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
  console.log(`All manual schedule tests passed (${tests.length})`);
})();
