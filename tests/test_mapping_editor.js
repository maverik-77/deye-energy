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

const DEFAULT_STARTS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

function minuteOf(clock) {
  const [hour, minute] = String(clock).split(":").map(Number);
  return hour * 60 + minute;
}

function diagnostics(options = {}) {
  const starts = options.starts || DEFAULT_STARTS;
  const readOnly = options.readOnly === true;
  const rows = [];
  const physical = [];
  const plan = [];
  for (let slot = 1; slot <= 6; slot += 1) {
    const nextSlot = slot === 6 ? 1 : slot + 1;
    const values = {
      start: starts[slot - 1],
      end: starts[nextSlot - 1],
      soc: 10 + slot,
      grid_charge: slot % 2 === 0,
    };
    const entityIds = {
      start: `time.deye_prog_start_${slot}`,
      end: `time.deye_prog_start_${nextSlot}`,
      soc: `number.deye_prog_soc_${slot}`,
      grid_charge: `select.deye_prog_grid_${slot}`,
    };
    const fields = {};
    Object.entries(values).forEach(([field, value]) => {
      const capability = {
        field,
        entity_id: entityIds[field],
        supported: true,
        readable: true,
        writable: !readOnly,
        current_available: true,
        read_only: readOnly,
        actual: value,
        raw_actual: String(value),
      };
      fields[field] = {
        entity_id: capability.entity_id,
        actual: value,
        raw_actual: String(value),
        expected: value,
        status: "confirmed",
        writable: !readOnly,
        capability,
      };
    });
    rows.push({
      slot_index: slot,
      provider: options.provider || "sunsynk",
      read_only: readOnly,
      blocked_by_master_control: false,
      control_writable: !readOnly,
      fields: Object.fromEntries(Object.entries(fields).map(([name, item]) => [name, item.capability])),
    });
    physical.push({
      range: slot,
      actual_start: values.start,
      actual_end: values.end,
      actual_soc: values.soc,
      actual_grid_charge_enabled: values.grid_charge,
      fields,
    });
    plan.push({
      start: minuteOf(values.start),
      end: slot === 6 ? 0 : minuteOf(values.end),
      tou_soc: values.soc,
      grid_charge: values.grid_charge,
    });
  }
  return {
    tou_capabilities: rows,
    physical_tou: physical,
    mapping_plan: plan,
    control: { control_enabled: true, control_status: "Active" },
    tou_transaction: { tou_write_pending: options.pending === true },
    tou_reverse_sync: {},
    capabilities: { full_tou: { ok: true, supported: true } },
  };
}

function makeCard(options = {}) {
  const attrs = diagnostics(options);
  const calls = [];
  const card = new DeyeEnergyCard();
  card.setConfig({});
  card._hass = {
    states: {},
    services: {
      deye_energy: options.noSetService ? {} : { set_tou_slot: true },
      homeassistant: options.noUpdateService ? {} : { update_entity: true },
    },
    callService: async (domain, service, data) => { calls.push({ domain, service, data }); },
  };
  card.diagnosticsAttributes = () => attrs;
  card.querySelector = () => null;
  card.querySelectorAll = () => [];
  card.render = () => {};
  card.renderDialogOnly = () => { card._mappingRenders = (card._mappingRenders || 0) + 1; };
  card.updateSaveIndicator = () => {};
  card.beginSave = () => { card._beganSave = true; };
  card.finishSave = () => { card._finishedSave = true; };
  card.failSave = () => { card._failedSave = true; };
  return { card, attrs, calls };
}

function setLiveStates(card, starts) {
  card.touCapabilitiesDiagnostics().forEach((row) => {
    const slot = Number(row.slot_index);
    Object.values(row.fields || {}).forEach((capability) => {
      if (!capability?.entity_id) return;
      let value;
      if (capability.field === "start") value = starts[slot - 1];
      else if (capability.field === "end") value = starts[slot === 6 ? 0 : slot];
      else if (capability.field === "soc") value = String(10 + slot);
      else value = slot % 2 === 0 ? "on" : "off";
      card._hass.states[capability.entity_id] = { state: value };
    });
  });
}

function validRows() {
  return DEFAULT_STARTS.map((start, index) => ({
    slot: index + 1,
    start,
    end: index === 5 ? "00:00" : DEFAULT_STARTS[index + 1],
    soc: 10 + index + 1,
    gridCharge: (index + 1) % 2 === 0,
  }));
}

function test_mapping_rows_come_from_live_inverter_states() {
  const { card } = makeCard();
  const starts = ["00:00", "03:30", "08:00", "12:00", "16:00", "20:00"];
  setLiveStates(card, starts);
  card._hass.states["number.deye_prog_soc_2"] = { state: "77" };
  card._hass.states["select.deye_prog_grid_2"] = { state: "on" };
  const rows = card.mappingRowsFromDiagnostics();
  assertEqual(rows.map((row) => row.start), starts, "live physical starts must win over diagnostics");
  assertEqual(rows[0].end, "03:30", "each To must follow the next From");
  assertEqual(rows[5].end, "00:00", "the last To must wrap to 00:00");
  assertEqual(rows[1].soc, 77, "live physical SOC must win over diagnostics");
  assertTrue(rows[1].gridCharge, "live physical grid charging must win over diagnostics");
}

function test_mapping_refresh_collects_only_present_physical_entity_ids() {
  const { card } = makeCard();
  setLiveStates(card, DEFAULT_STARTS);
  delete card._hass.states["select.deye_prog_grid_3"];
  const ids = card.mappingTouEntityIds();
  assertTrue(ids.includes("time.deye_prog_start_1"), "start entity must be refreshed");
  assertTrue(ids.includes("number.deye_prog_soc_6"), "SOC entity must be refreshed");
  assertTrue(!ids.includes("select.deye_prog_grid_3"), "missing entity must not be refreshed");
  assertEqual(new Set(ids).size, ids.length, "refresh entity ids must be unique");
}

async function test_mapping_refresh_forces_update_and_rebuilds_draft() {
  const { card, calls } = makeCard();
  setLiveStates(card, DEFAULT_STARTS);
  assertEqual(card.ensureMappingDraft()[1].start, "04:00", "initial draft must use current values");
  card._mappingDraft[1].start = "05:00";
  const refreshed = ["00:00", "03:30", "08:00", "12:00", "16:00", "20:00"];
  card.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    setLiveStates(card, refreshed);
  };
  await card.refreshMappingFromInverter();
  const update = calls.find((call) => call.service === "update_entity");
  assertTrue(Boolean(update), "opening the mapping tab must force homeassistant.update_entity");
  assertTrue(Array.isArray(update?.data?.entity_id) && update.data.entity_id.length > 0, "update_entity must target physical entities");
  assertTrue(card._mappingDraft === null, "refresh must discard the previous draft");
  assertEqual(card.ensureMappingDraft()[1].start, "03:30", "refreshed draft must come from the new inverter values");
}

async function test_mapping_refresh_can_keep_saved_status() {
  const { card } = makeCard();
  card._mappingStatus = "Saved to the inverter.";
  await card.refreshMappingFromInverter({ keepStatus: true });
  assertEqual(card._mappingStatus, "Saved to the inverter.", "post-save refresh must keep the saved message");
}

function test_mapping_draft_preserves_edits_and_keeps_boundaries_contiguous() {
  const { card } = makeCard();
  card.ensureMappingDraft();
  const elements = [
    { dataset: { mappingSlot: "1", mappingField: "end" }, value: "04:00" },
    { dataset: { mappingSlot: "2", mappingField: "start" }, value: "03:30" },
    { dataset: { mappingSlot: "3", mappingField: "start" }, value: "08:00" },
  ];
  card.querySelectorAll = () => elements;
  const rows = card.collectMappingDraft();
  assertEqual(rows[1].start, "03:30", "edited From must be kept in the draft");
  assertEqual(rows[0].end, "03:30", "previous To must follow an edited From");
  assertEqual(elements[0].value, "03:30", "previous To control must be updated in the UI");
  assertEqual(card._mappingSaveError, "", "editing must not run save validation");
}

function test_mapping_end_edit_moves_following_start() {
  const { card } = makeCard();
  card.ensureMappingDraft();
  const elements = [
    { dataset: { mappingSlot: "2", mappingField: "end" }, value: "09:00" },
    { dataset: { mappingSlot: "3", mappingField: "start" }, value: "08:00" },
  ];
  card.querySelectorAll = () => elements;
  const rows = card.collectMappingDraft();
  assertEqual(rows[1].end, "09:00", "edited To must be kept in the draft");
  assertEqual(rows[2].start, "09:00", "following From must follow an edited To");
  assertEqual(elements[1].value, "09:00", "following From control must be updated in the UI");
}

function validationError(mutate) {
  const { card } = makeCard();
  const rows = validRows();
  mutate(rows);
  return card.validateMappingDraft(rows);
}

function test_mapping_validation_expects_full_day_chain() {
  const { card } = makeCard();
  assertEqual(card.validateMappingDraft(validRows()), "", "valid six-range chain must pass");
  assertTrue(validationError((rows) => { rows[0].start = "00:30"; }).includes("first range must start at 00:00"), "first start must be 00:00");
  assertTrue(validationError((rows) => { rows[5].end = "00:30"; }).includes("last range must end at 00:00"), "last end must be 00:00");
  assertTrue(validationError((rows) => { rows[1].start = "04:30"; }).includes("ends at 04:00"), "gaps must be rejected");
  assertTrue(validationError((rows) => { rows[1].start = "03:30"; }).includes("Range 1"), "overlaps must be rejected");
  assertTrue(validationError((rows) => { rows[1].start = "04:15"; }).includes(":00 or :30"), "off-boundary times must be rejected");
  assertTrue(validationError((rows) => { rows[2].soc = 101; }).includes("between 0 and 100"), "SOC bounds must be enforced");
}

async function test_mapping_save_writes_all_six_slots_then_refreshes() {
  const { card, calls } = makeCard();
  setLiveStates(card, DEFAULT_STARTS);
  const result = await card.saveMappingToInverter();
  assertTrue(result, "valid mapping save must succeed");
  assertTrue(card._beganSave && card._finishedSave, "save indicator lifecycle must run");
  const writes = calls.filter((call) => call.service === "set_tou_slot");
  assertEqual(writes.length, 6, "save must write all six physical TOU slots");
  assertEqual(writes.map((call) => call.data.slot), [1, 2, 3, 4, 5, 6], "writes must be sequential by slot");
  assertEqual(writes.map((call) => call.data.start), DEFAULT_STARTS, "writes must carry the edited starts");
  assertTrue(writes.every((call) => call.data.start && !Object.prototype.hasOwnProperty.call(call.data, "end")), "end is derived from the next start");
  assertTrue(calls.some((call) => call.service === "update_entity"), "save must finish with a forced inverter refresh");
  assertEqual(card._mappingStatus, "Saved to the inverter.", "saved status must survive the final refresh");
}

async function test_mapping_save_rejects_invalid_draft_before_any_write() {
  const { card, calls } = makeCard();
  card._mappingDraft = validRows();
  card._mappingDraft[2].start = "09:15";
  const result = await card.saveMappingToInverter();
  assertTrue(!result, "invalid draft must not save");
  assertEqual(calls.filter((call) => call.service === "set_tou_slot").length, 0, "invalid draft must not call set_tou_slot");
  assertTrue(card._mappingSaveError.includes(":00 or :30"), "save validation error must be shown");
}

async function test_mapping_save_handles_read_only_provider_without_writes() {
  const { card, calls } = makeCard({ readOnly: true });
  const html = card.renderMappingTab([]);
  assertTrue(html.includes("read-only"), "read-only provider must explain that saving is unavailable");
  assertTrue(html.includes('data-save-mapping="1" disabled'), "read-only provider must disable the save button");
  const result = await card.saveMappingToInverter();
  assertTrue(!result, "read-only save must fail cleanly");
  assertEqual(calls.length, 0, "read-only provider must not write or refresh");
}

async function test_mapping_save_checks_service_and_backend_pending() {
  const noService = makeCard({ noSetService: true });
  assertTrue(!(await noService.card.saveMappingToInverter()), "missing service must fail cleanly");
  assertEqual(noService.calls.length, 0, "missing service must not call anything");
  const pending = makeCard({ pending: true });
  assertTrue(!(await pending.card.saveMappingToInverter()), "backend pending must block a second save");
  assertEqual(pending.calls.length, 0, "backend pending must not call anything");
}

function test_mapping_tab_renders_editable_fields_and_fixed_boundaries() {
  const { card } = makeCard();
  const html = card.renderMappingTab([]);
  assertTrue(html.includes('data-mapping-field="start" data-mapping-slot="2"'), "middle From values must be editable");
  assertTrue(html.includes('data-mapping-field="end" data-mapping-slot="5"'), "middle To values must be editable");
  assertTrue(!html.includes('data-mapping-field="start" data-mapping-slot="1"'), "first From must be fixed at 00:00");
  assertTrue(!html.includes('data-mapping-field="end" data-mapping-slot="6"'), "last To must be fixed at 00:00");
  assertTrue(html.includes('data-refresh-mapping="1"') && html.includes('data-save-mapping="1"'), "refresh and save actions must be present");
}

function test_both_card_copies_remain_identical() {
  assertTrue(fs.readFileSync(componentCard).equals(fs.readFileSync(rootCard)), "both card copies must remain identical");
}

const tests = [
  test_mapping_rows_come_from_live_inverter_states,
  test_mapping_refresh_collects_only_present_physical_entity_ids,
  test_mapping_refresh_forces_update_and_rebuilds_draft,
  test_mapping_refresh_can_keep_saved_status,
  test_mapping_draft_preserves_edits_and_keeps_boundaries_contiguous,
  test_mapping_end_edit_moves_following_start,
  test_mapping_validation_expects_full_day_chain,
  test_mapping_save_writes_all_six_slots_then_refreshes,
  test_mapping_save_rejects_invalid_draft_before_any_write,
  test_mapping_save_handles_read_only_provider_without_writes,
  test_mapping_save_checks_service_and_backend_pending,
  test_mapping_tab_renders_editable_fields_and_fixed_boundaries,
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
  console.log(`All mapping editor tests passed (${tests.length})`);
})();
