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

function methodBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  const opening = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function manualRow(overrides = {}) {
  return {
    from: "00:00",
    to: "00:00",
    enabled: true,
    mode: "Normal Operation",
    sell_power: 0,
    minimum_sell_soc: 0,
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
      manualRow({ from: "12:00", mode: "Selling", sell_power: 4000 }),
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
  assertTrue(!card.manualScheduleDirty(), "fresh draft must not be dirty");
}

function test_manual_empty_backend_starts_with_no_rows() {
  const { card } = makeCard({ manual: { rows: [] } });
  const rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 0, "empty backend must not invent a row");
  assertTrue(card.validateManualScheduleRows(rows).includes("at least one"), "empty draft must ask the user to add a row");
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
  let rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 0, "empty backend must start empty");
  card.addManualScheduleRow();
  rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 1, "first add must create a full-day row");
  assertEqual([rows[0].from, rows[0].to], ["00:00", "00:00"], "new row must cover the full day");
  card.addManualScheduleRow();
  rows = card.ensureManualScheduleDraft();
  assertEqual(rows.length, 2, "second add must split the full-day row");
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

function test_manual_rows_and_payload_exclude_removed_fields() {
  const removed = [
    "physical_work_mode", "discharge_current", "charge_current",
    "grid_charge_current", "min_sell_price", "tou_soc",
  ];
  const { card } = makeCard({
    manual: {
      active: false,
      rows: [manualRow({
        physical_work_mode: "Zero Export To CT",
        discharge_current: 120,
        charge_current: 120,
        grid_charge_current: 60,
        min_sell_price: 1.5,
        tou_soc: 99,
      })],
    },
  });
  const rows = card.ensureManualScheduleDraft();
  const payload = card.manualSchedulePayloadRows(rows);
  removed.forEach((field) => {
    assertTrue(!(field in rows[0]), `legacy ${field} must be dropped from the draft`);
    assertTrue(!(field in payload[0]), `${field} must not be sent to the backend`);
  });
  assertEqual(payload[0].sell_power, 0, "Sell power must remain a row field");
  assertEqual(payload[0].charge_enabled, false, "Grid charging must remain a row field");
}

function test_manual_tab_hides_removed_controls() {
  const { card } = makeCard();
  card.toggleManualScheduleRowEdit(0);
  const html = card.renderManualScheduleTab();
  [
    'data-manual-field="physical_work_mode"',
    'data-manual-field="discharge_current"',
    'data-manual-field="charge_current"',
    'data-manual-field="grid_charge_current"',
    'data-manual-field="min_sell_price"',
    'data-manual-field="tou_soc"',
  ].forEach((marker) => assertTrue(!html.includes(marker), `removed control must be absent: ${marker}`));
  assertTrue(html.includes('data-manual-field="sell_power"'), "Sell power must stay editable");
  assertTrue(html.includes('data-manual-field="charge_enabled"'), "Grid charging must stay editable");
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

function test_manual_empty_backend_auto_loads_tou_rows_once() {
  const touRows = [manualRow({ to: "12:00" }), manualRow({ from: "12:00" })];
  const { card, calls } = makeCard({
    manual: { rows: [], active: false },
    response: (domain, service) => service === "init_manual_schedule_from_tou"
      ? { active: false, rows: touRows, has_activation_snapshot: false, valid: true, validation_error: "" }
      : undefined,
  });
  return card.maybeAutoLoadManualScheduleFromTou().then((loaded) => {
    assertTrue(loaded, "auto-load must succeed");
    return card.maybeAutoLoadManualScheduleFromTou().then((loadedAgain) => {
      assertTrue(!loadedAgain, "empty backend must not call the service twice");
      assertEqual(serviceCalls(calls, "init_manual_schedule_from_tou").length, 1, "TOU service must be called once");
      assertEqual(card.ensureManualScheduleDraft().length, 2, "service response must populate the draft");
    });
  });
}

function test_manual_existing_row_does_not_auto_load_tou_rows() {
  const { card, calls } = makeCard({ manual: { rows: [manualRow()], active: false } });
  return card.maybeAutoLoadManualScheduleFromTou().then((loaded) => {
    assertTrue(!loaded, "a saved row must prevent auto-load");
    assertEqual(serviceCalls(calls, "init_manual_schedule_from_tou").length, 0, "TOU service must not be called when a row exists");
    assertEqual(card.ensureManualScheduleDraft().length, 1, "the existing row must be kept untouched");
  });
}

function test_manual_tou_init_button_and_handler_are_removed_from_the_card() {
  const source = fs.readFileSync(componentCard, "utf8");
  assertTrue(!source.includes("initManualScheduleFromTou"), "manual init handler must be removed");
  assertTrue(!source.includes("data-manual-init"), "manual init button binding must be removed");
  assertTrue(!source.includes("Initialize from Deye Time Of Use"), "manual init button must be removed");
  assertTrue(source.includes("maybeAutoLoadManualScheduleFromTou"), "empty-state auto-load must remain");
}

function test_manual_tab_renders_rows_controls_and_active_status() {
  const { card } = makeCard();
  const inactive = card.renderManualScheduleTab();
  assertTrue(inactive.includes("Manual schedule — Enable"), "Enable label must be shown");
  assertTrue(inactive.includes('class="tool-btn" data-manual-activate="1"'), "Enable control must use the work-schedule tool button styling");
  assertTrue(inactive.includes('data-manual-add="1"'), "add row control must be present");
  assertTrue(!inactive.includes('data-manual-init="1"'), "initialize control must be absent");
  assertTrue(!inactive.includes("Initialize from Deye Time Of Use"), "initialize label must be absent");
  assertTrue(inactive.includes('data-manual-save="1"'), "save control must be present");
  assertTrue(!inactive.includes("data-manual-field="), "rows must be read-only by default");
  assertTrue(inactive.includes('data-manual-edit="0"'), "edit icon must be present on each row");
  assertTrue(inactive.includes('data-manual-remove="0"'), "remove icon must be present on each row");
  card.toggleManualScheduleRowEdit(0);
  card.toggleManualScheduleRowEdit(1);
  const editing = card.renderManualScheduleTab();
  assertTrue(editing.includes('data-manual-field="from" data-manual-index="1"'), "middle From must be editable");
  assertTrue(editing.includes('data-manual-field="to" data-manual-index="0"'), "middle To must be editable");
  assertTrue(!editing.includes('data-manual-field="from" data-manual-index="0"'), "first From must be fixed");
  assertTrue(!editing.includes('data-manual-field="to" data-manual-index="1"'), "last To must be fixed");

  card.applyManualScheduleState({ active: true, rows: [manualRow()] });
  const active = card.renderManualScheduleTab();
  assertTrue(active.includes("Manual schedule — Disable"), "Disable label must be shown");
  assertTrue(active.includes('class="tool-btn active" data-manual-deactivate="1"'), "Disable control must use the active work-schedule tool button styling");
  assertTrue(active.includes('<div class="schedule-tools">'), "toggle must live in the header tools row");
}

function test_manual_tab_drops_stale_slot_mapping_copy() {
  const { card } = makeCard();
  const html = card.renderManualScheduleTab();
  assertTrue(!html.includes("48 work schedule slots"), "48-slot mapping message must be removed");
  assertTrue(!html.includes("mapped onto the work schedule"), "stale mapping subheading must be removed");
  assertTrue(!html.includes("manual-schedule-status"), "separate status bar must be removed");
}

function test_manual_tab_exposes_fixed_last_midnight_boundary() {
  const { card } = makeCard();
  card.applyManualScheduleState({ active: false, rows: [manualRow(), manualRow({ from: "12:00" })] });
  card.toggleManualScheduleRowEdit(0);
  card.toggleManualScheduleRowEdit(1);
  const html = card.renderManualScheduleTab();
  assertTrue(!html.includes('data-manual-field="to" data-manual-index="1"'), "last To must be fixed at 00:00");
  assertTrue(html.includes('data-manual-field="to" data-manual-index="0"'), "middle To must be editable");
}

function test_manual_tab_shares_settings_and_control_buttons() {
  const { card } = makeCard();
  const html = card.renderManualScheduleTab();
  assertTrue(html.includes('data-control-toggle="1"'), "Deye control button must be available from Manual schedule");
  assertTrue(html.includes("Deye control — "), "Deye control button must keep the same label");
  assertTrue(html.includes('class="tool-btn '), "Deye control button must use tool button styling");
  assertTrue(html.includes('data-open-settings="1"'), "Settings and diagnostics button must be available from Manual schedule");
  assertTrue(html.includes('class="gear-btn"'), "Settings button must use the same gear styling");
}

function test_manual_tab_uses_work_schedule_table_styling() {
  const { card } = makeCard();
  const html = card.renderManualScheduleTab();
  assertTrue(html.includes('<div class="schedule-table-card">'), "manual rows must use the work schedule table card");
  assertTrue(html.includes('<table class="schedule-table manual-schedule-table">'), "manual rows must use the work schedule table styling");
  assertTrue(html.includes('<thead><tr><th class="time-col">From</th><th class="time-col">To</th><th>Mode</th><th>Sell power</th><th>Grid charging</th><th>Stop selling at SOC</th><th>Active</th><th>Action</th></tr></thead>'), "manual table headers must describe the manual fields");
  assertTrue(html.indexOf('<td data-label="Active">') < html.indexOf('<td data-label="Action">'), "Active must sit immediately before the Action icons");
  assertTrue(html.includes('data-manual-edit="0"'), "edit icon must be in the Action column");
  assertTrue(html.includes('data-manual-remove="0"'), "remove icon must be in the Action column");
  assertTrue(!html.includes('class="manual-row"'), "old manual row cards must be gone");
}

function test_manual_editing_lifecycle_clears_only_on_save() {
  const { card } = makeCard();
  card.toggleManualScheduleRowEdit(1);
  assertTrue(card.renderManualScheduleTab().includes('data-manual-field="mode" data-manual-index="1"'), "edit mode must show the row inputs");
  card.addManualScheduleRow();
  assertTrue(!card.renderManualScheduleTab().includes('data-manual-field="mode" data-manual-index="2"'), "newly added rows must start read-only");
  return card.activateManualSchedule().then((ok) => {
    assertTrue(ok, "activate must succeed");
    assertTrue(card.renderManualScheduleTab().includes('data-manual-field="mode" data-manual-index="1"'), "activate must not clear edit mode");
    return card.saveManualSchedule();
  }).then((ok) => {
    assertTrue(ok, "save must succeed");
    assertTrue(!card.renderManualScheduleTab().includes("data-manual-field="), "save must clear edit mode for every row");
  });
}

function test_manual_remove_asks_for_confirmation() {
  const { card } = makeCard();
  const originalConfirm = window.confirm;
  let message = "";
  let accept = false;
  window.confirm = (text) => { message = text; return accept; };
  let removeHandler = null;
  let editHandler = null;
  card.querySelectorAll = (selector) => {
    if (selector === "[data-manual-remove]") return [{ dataset: { manualRemove: "0" }, addEventListener: (_type, fn) => { removeHandler = fn; } }];
    if (selector === "[data-manual-edit]") return [{ dataset: { manualEdit: "1" }, addEventListener: (_type, fn) => { editHandler = fn; } }];
    return [];
  };
  try {
    card.bindDashboardControls(card.ensureManualScheduleDraft());
    assertTrue(typeof removeHandler === "function", "remove icon must be bound");
    assertTrue(typeof editHandler === "function", "edit icon must be bound");

    card.toggleManualScheduleRowEdit(1);
    card.removeManualScheduleRow(0);
    assertTrue(card._manualScheduleEditing.has(0), "editing index must shift down after a row is removed");
    card.applyManualScheduleState({ active: false, rows: [manualRow({ to: "12:00" }), manualRow({ from: "12:00" })] });
    card.clearManualScheduleRowEdits();

    removeHandler();
    assertEqual(card.ensureManualScheduleDraft().length, 2, "cancelling confirmation must keep the row");
    assertTrue(message.includes("row 1"), "confirmation must name the row being removed");
    accept = true;
    removeHandler();
    assertEqual(card.ensureManualScheduleDraft().length, 1, "accepting confirmation must remove the row");
  } finally {
    window.confirm = originalConfirm;
  }
}

function test_schedule_tabs_default_to_manual_and_switch_to_work() {
  const { card } = makeCard();
  assertEqual(card._scheduleTab, "manual", "Manual schedule must be the default page tab");
  const manual = card.renderScheduleTabs("<div>work panel</div>", "<div>manual panel</div>");
  assertTrue(manual.indexOf('data-schedule-tab="manual"') < manual.indexOf('data-schedule-tab="work"'), "Manual tab must be first");
  assertTrue(manual.includes('data-schedule-tab="work"'), "Work tab button must be present");
  assertTrue(manual.includes('class="active" data-schedule-tab="manual"'), "Manual tab must be active by default");
  assertTrue(manual.includes('data-schedule-panel="manual"'), "Manual panel must be present");
  assertTrue(manual.indexOf('data-schedule-panel="manual"') < manual.indexOf('data-schedule-panel="work"'), "Manual panel must come first");
  assertTrue(manual.includes('data-schedule-panel="work" hidden'), "Work panel must be hidden by default");
  assertEqual((manual.match(/class="active"/g) || []).length, 1, "Exactly one tab must be active");

  card._scheduleTab = "work";
  const work = card.renderScheduleTabs("<div>work panel</div>", "<div>manual panel</div>");
  assertTrue(work.includes('class="active" data-schedule-tab="work"'), "Work tab must become active");
  assertTrue(work.includes('data-schedule-panel="manual" hidden'), "Manual panel must be hidden when Work is active");
  assertTrue(!work.includes('data-schedule-panel="work" hidden'), "Work panel must be visible when active");
  assertEqual((work.match(/class="active"/g) || []).length, 1, "Exactly one tab must stay active");
}

function test_schedule_tabs_show_active_source_banner() {
  const { card } = makeCard();
  let html = card.renderScheduleTabs("<div>work panel</div>", "<div>manual panel</div>");
  assertTrue(!html.includes("data-schedule-source-banner"), "No source banner while the work schedule is active");

  card.applyManualScheduleState({ active: true, rows: [] });
  html = card.renderScheduleTabs("<div>work panel</div>", "<div>manual panel</div>");
  assertTrue(html.includes("data-schedule-source-banner"), "Source banner must appear while manual schedule is active");
  assertTrue(html.includes("scheduler is following the manual rows"), "Banner must name the active trigger source");
}

function test_manual_tab_uses_the_work_schedule_page_styling() {
  const { card } = makeCard();
  const html = card.renderManualScheduleTab();
  assertTrue(html.includes('class="schedule-head manual-panel-head"'), "Manual tab must use the page schedule head");
  assertTrue(html.includes("<h2>Manual schedule</h2>"), "Manual tab must have a page-style title");
  assertTrue(html.includes('<div class="schedule-tools">'), "Toggle must be in the page header tools row");
  assertTrue(html.includes('class="foot-actions manual-save-actions"'), "Save action must use page footer styling");
  assertTrue(html.includes('class="primary" data-manual-save="1"'), "Save action must be the primary page button");
  assertTrue(!html.includes('class="dialog-actions"'), "Manual tab must not use dialog-only styling");
}

function test_manual_schedule_is_removed_from_the_settings_overlay() {
  const source = fs.readFileSync(componentCard, "utf8");
  assertTrue(!source.includes('tabButton("manual"'), "Manual schedule must not be a settings nav item");
  assertTrue(!source.includes('else if (tab === "manual")'), "Manual schedule must not be a settings dialog branch");
  assertTrue(!source.includes('data-open-settings="manual"'), "Manual schedule must not be opened from the page toolbar");
  assertTrue(source.includes('this.renderScheduleTabs(workSchedulePanel, this.renderManualScheduleTab())'), "Both schedules must render as page tabs");
}

function test_page_schedule_controls_are_bound_in_the_dashboard_binder() {
  const source = fs.readFileSync(componentCard, "utf8");
  const dashboard = methodBody(source, "bindDashboardControls(slots) {");
  const dialog = methodBody(source, "bindDialogControls(slots) {");
  assertTrue(dashboard.length > 0 && dialog.length > 0, "both bind methods must be present");
  for (const selector of [
    "[data-schedule-tab]", "[data-manual-field]", "[data-manual-add]",
    "[data-manual-edit]", "[data-manual-remove]", "[data-manual-save]",
    "[data-manual-activate]", "[data-manual-deactivate]",
  ]) {
    assertTrue(dashboard.includes(selector), `${selector} must be bound on the page`);
    assertTrue(!dialog.includes(selector), `${selector} must not be bound inside the dialog host`);
  }
  assertTrue(dashboard.includes("[data-control-toggle]"), "shared Deye control button must be bound on the page");
  assertTrue(dashboard.includes("this.toggleControl()"), "shared Deye control must keep its handler");
  assertTrue(dashboard.includes("[data-open-settings]"), "shared settings button must be bound on the page");
  assertTrue(!dashboard.includes("[data-manual-init]"), "manual init binding must be gone");
  assertTrue(!dialog.includes("[data-manual-init]"), "manual init binding must not exist in the dialog");
}

function test_manual_activation_is_independent_of_deye_control() {
  const { card, calls } = makeCard();
  card._hass.states["sensor.deye_energy_manager_status"] = {
    state: "ok",
    attributes: { control: { entity_id: "switch.deye_energy_control", enabled: true, status: "Active" } },
  };
  const html = card.renderManualScheduleTab();
  assertTrue(!html.includes('data-manual-activate="1" disabled'), "Activate must not be disabled while Deye control is Active");
  return card.activateManualSchedule().then((ok) => {
    assertTrue(ok, "activation must be allowed while Deye control is Active");
    assertEqual(serviceCalls(calls, "activate_manual_schedule").length, 1, "activation service must be called while Deye control is Active");
  });
}

function test_deye_control_toggle_is_independent_of_manual_schedule() {
  const { card, calls } = makeCard();
  card._hass.states["sensor.deye_energy_manager_status"] = {
    state: "ok",
    attributes: { control: { entity_id: "switch.deye_energy_control", enabled: false, status: "Disabled" } },
  };
  card._hass.states["switch.deye_energy_control"] = { state: "off", attributes: {} };
  const button = { textContent: "", disabled: false, classList: { toggle: () => {} } };
  card.querySelectorAll = (selector) => (selector === "[data-control-toggle]" ? [button] : []);
  card.querySelector = () => null;
  card.applyManualScheduleState({ active: true, rows: [manualRow()] });
  card.updateControlUi();
  assertTrue(!button.disabled, "Deye control toggle must remain available while manual schedule is active");
  return card.toggleControl().then((ok) => {
    assertTrue(ok, "Deye control must toggle while manual schedule is active");
    assertEqual(calls.filter((call) => call.domain === "switch").length, 1, "switch service call must be made while manual schedule is active");
  });
}

function test_work_schedule_toggle_is_rendered_and_bound_on_the_page() {
  const source = fs.readFileSync(componentCard, "utf8");
  assertTrue(source.includes('data-work-schedule-toggle="1"'), "work schedule toggle must be rendered");
  assertTrue(source.includes("Work schedule — ${workScheduleEnabled"), "work toggle label must reflect the active source");
  const dashboard = methodBody(source, "bindDashboardControls(slots) {");
  assertTrue(dashboard.includes("[data-work-schedule-toggle]"), "work toggle must be bound on the page");
}

function test_work_schedule_toggle_switches_to_the_opposite_source() {
  const { card, calls } = makeCard();
  return card.toggleWorkSchedule().then((ok) => {
    assertTrue(ok, "work disable must call a source service");
    assertEqual(serviceCalls(calls, "activate_manual_schedule").length, 1, "disabling work must activate manual");
    assertEqual(serviceCalls(calls, "deactivate_manual_schedule").length, 0, "disabling work must not deactivate manual");
  }).then(() => {
    card.applyManualScheduleState({ active: true, rows: [manualRow()] });
    return card.toggleWorkSchedule();
  }).then((ok) => {
    assertTrue(ok, "work enable must call a source service");
    assertEqual(serviceCalls(calls, "deactivate_manual_schedule").length, 1, "enabling work must deactivate manual");
  });
}

function withFixedDate(iso, fn) {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [iso])); }
  };
  try { return fn(); } finally { global.Date = RealDate; }
}

function test_manual_current_row_index_follows_the_local_clock() {
  const { card } = makeCard();
  card._hass.config = { time_zone: "UTC" };
  const rows = [
    manualRow({ to: "12:00" }),
    manualRow({ from: "12:00", mode: "Selling", sell_power: 4000 }),
  ];
  const at = (iso) => card.manualScheduleCurrentRowIndex(rows, new Date(iso));
  assertEqual(at("2026-11-19T00:00:00Z"), 0, "midnight must select the first row");
  assertEqual(at("2026-11-19T06:30:00Z"), 0, "a time inside the first window must select row 0");
  assertEqual(at("2026-11-19T11:59:00Z"), 0, "the minute before the boundary must stay on row 0");
  assertEqual(at("2026-11-19T12:00:00Z"), 1, "the boundary must select only the second row");
  assertEqual(at("2026-11-19T23:59:00Z"), 1, "late evening must select the final row");

  const three = [
    manualRow({ to: "07:15" }),
    manualRow({ from: "07:15", to: "19:45" }),
    manualRow({ from: "19:45" }),
  ];
  assertEqual(card.manualScheduleCurrentRowIndex(three, new Date("2026-11-19T19:44:00Z")), 1, "arbitrary-minute rows must use their own boundaries");
  assertEqual(card.manualScheduleCurrentRowIndex(three, new Date("2026-11-19T19:45:00Z")), 2, "the next row must take over at its exact start");

  card._hass.config = { time_zone: "Asia/Tokyo" };
  assertEqual(at("2026-11-19T03:00:00Z"), 1, "selection must use the Home Assistant time zone");
  assertEqual(card.manualScheduleCurrentRowIndex([], new Date("2026-11-19T06:30:00Z")), -1, "no rows must select nothing");
}

function test_manual_tab_glows_only_the_row_covering_now() {
  const { card } = makeCard();
  card._hass.config = { time_zone: "UTC" };
  withFixedDate("2026-11-19T06:30:00Z", () => {
    const html = card.renderManualScheduleTab();
    const rendered = [...html.matchAll(/<tr class="([^"]*)" data-manual-row="(\d+)"/g)];
    assertEqual(rendered.length, 2, "both manual rows must render");
    const glowing = rendered.filter((match) => match[1].split(" ").includes("time-current"));
    assertEqual(glowing.length, 1, "exactly one row must carry the glow");
    assertEqual(Number(glowing[0][2]), 0, "the row covering the current time must glow");
    assertTrue(!rendered[1][1].includes("time-current"), "other rows must not glow");
  });
}

function test_manual_glow_follows_time_on_live_updates() {
  const { card } = makeCard();
  card._hass.config = { time_zone: "UTC" };
  card._isRendered = true;
  card.setText = () => {};
  const makeRow = (index) => {
    const row = { applied: null };
    row.getAttribute = (name) => (name === "data-manual-row" ? String(index) : null);
    row.classList = { toggle: (name, on) => { if (name === "time-current") row.applied = on; } };
    return row;
  };
  const rows = [makeRow(0), makeRow(1)];
  card.querySelectorAll = (selector) => (selector === "[data-manual-row]" ? rows : []);
  let iso = "2026-11-19T06:30:00Z";
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [iso])); }
  };
  try {
    card.updateDynamicValues();
    assertEqual(rows.map((row) => row.applied), [true, false], "the live glow must follow the first window");
    iso = "2026-11-19T12:30:00Z";
    card.updateDynamicValues();
    assertEqual(rows.map((row) => row.applied), [false, true], "the live glow must move at the next boundary");
  } finally {
    global.Date = RealDate;
  }
}

function test_both_card_copies_remain_identical() {
  assertTrue(fs.readFileSync(componentCard).equals(fs.readFileSync(rootCard)), "both card copies must remain identical");
}

const tests = [
  test_manual_backend_state_populates_draft,
  test_manual_empty_backend_starts_with_no_rows,
  test_manual_validation_rejects_gaps_overlaps_and_boundaries,
  test_manual_validation_accepts_arbitrary_minute_contiguous_rows,
  test_manual_add_and_remove_rows_keep_the_chain_contiguous,
  test_manual_save_sends_normalized_rows_once,
  test_manual_rows_and_payload_exclude_removed_fields,
  test_manual_tab_hides_removed_controls,
  test_manual_save_rejects_invalid_rows_before_calling_the_service,
  test_manual_activate_saves_then_activates_and_applies_response,
  test_manual_deactivate_calls_the_service_and_clears_active_state,
  test_manual_empty_backend_auto_loads_tou_rows_once,
  test_manual_existing_row_does_not_auto_load_tou_rows,
  test_manual_tou_init_button_and_handler_are_removed_from_the_card,
  test_manual_tab_renders_rows_controls_and_active_status,
  test_manual_tab_drops_stale_slot_mapping_copy,
  test_manual_tab_exposes_fixed_last_midnight_boundary,
  test_manual_tab_shares_settings_and_control_buttons,
  test_manual_tab_uses_work_schedule_table_styling,
  test_manual_editing_lifecycle_clears_only_on_save,
  test_manual_remove_asks_for_confirmation,
  test_schedule_tabs_default_to_manual_and_switch_to_work,
  test_schedule_tabs_show_active_source_banner,
  test_manual_tab_uses_the_work_schedule_page_styling,
  test_manual_schedule_is_removed_from_the_settings_overlay,
  test_page_schedule_controls_are_bound_in_the_dashboard_binder,
  test_manual_activation_is_independent_of_deye_control,
  test_deye_control_toggle_is_independent_of_manual_schedule,
  test_work_schedule_toggle_is_rendered_and_bound_on_the_page,
  test_work_schedule_toggle_switches_to_the_opposite_source,
  test_manual_current_row_index_follows_the_local_clock,
  test_manual_tab_glows_only_the_row_covering_now,
  test_manual_glow_follows_time_on_live_updates,
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
