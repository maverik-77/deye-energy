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
const source = fs.readFileSync(componentCard, "utf8");
eval(source + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

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

const STARTS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

function minuteOf(clock) {
  const [hour, minute] = String(clock).split(":").map(Number);
  return hour * 60 + minute;
}

function diagnostics(options = {}) {
  const readOnly = options.readOnly === true;
  const controlEnabled = options.controlEnabled !== false;
  const caps = [];
  const physical = [];
  const plan = [];
  for (let slot = 1; slot <= 6; slot += 1) {
    const nextSlot = slot === 6 ? 1 : slot + 1;
    const values = {
      start: STARTS[slot - 1],
      end: STARTS[nextSlot - 1],
      soc: 10 + slot,
      grid_charge: slot % 2 === 0,
      mode: slot % 2 === 0 ? "Charge" : "None",
      charge: slot % 2 === 0 ? "Allow Grid" : "No Grid or Gen",
      sell: slot % 3 === 0,
      power: 5000 + slot * 100,
      voltage: 50 + slot,
    };
    const entityIds = {
      start: `time.deye_prog_start_${slot}`,
      end: `time.deye_prog_start_${nextSlot}`,
      soc: `number.deye_prog_soc_${slot}`,
      grid_charge: `select.deye_prog_grid_${slot}`,
      mode: `select.deye_prog${slot}_mode`,
      charge: `select.deye_prog${slot}_charge`,
      sell: `switch.deye_prog${slot}_sell`,
      power: `number.deye_prog${slot}_power`,
      voltage: `number.deye_prog${slot}_voltage`,
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
      };
      fields[field] = {
        entity_id: capability.entity_id,
        actual: value,
        expected: value,
        status: "confirmed",
        capability,
      };
    });
    caps.push({
      slot_index: slot,
      provider: "sunsynk",
      read_only: readOnly,
      blocked_by_master_control: !controlEnabled,
      fields: Object.fromEntries(Object.entries(fields).map(([name, item]) => [name, item.capability])),
    });
    physical.push({
      range: slot,
      actual_start: values.start,
      actual_soc: values.soc,
      actual_grid_charge_enabled: values.grid_charge,
      fields,
    });
    plan.push({ start: minuteOf(values.start), tou_soc: values.soc, grid_charge: values.grid_charge });
  }
  return {
    tou_capabilities: caps,
    physical_tou: physical,
    mapping_plan: plan,
    control: { control_enabled: controlEnabled, control_status: controlEnabled ? "Active" : "Disabled" },
    tou_transaction: { tou_write_pending: options.pending === true },
    tou_reverse_sync: {
      reverse_sync_status: "confirmed",
      reverse_sync_changed_hours: [6, 7],
      reverse_sync_round_trip_ok: true,
    },
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
      deye_energy: { set_tou_slot: true },
      homeassistant: { update_entity: true },
    },
    callService: async (domain, service, data) => { calls.push({ domain, service, data }); },
  };
  card.diagnosticsAttributes = () => attrs;
  card.querySelector = () => null;
  card.querySelectorAll = () => [];
  card.render = () => {};
  card.renderDialogOnly = () => {};
  card.updateSaveIndicator = () => {};
  card.beginSave = () => {};
  card.finishSave = () => {};
  card.failSave = () => {};
  return { card, attrs, calls };
}

function setLiveStates(card, starts) {
  card.touCapabilitiesDiagnostics().forEach((row) => {
    const slot = Number(row.slot_index);
    Object.values(row.fields || {}).forEach((capability) => {
      if (!capability?.entity_id) return;
      let value;
      let attributes = {};
      if (capability.field === "start") value = starts[slot - 1];
      else if (capability.field === "soc") value = String(10 + slot);
      else if (capability.field === "grid_charge") value = slot % 2 === 0 ? "Allow Grid" : "No Grid or Gen";
      else if (capability.field === "mode") { value = slot % 2 === 0 ? "Charge" : "None"; attributes.options = ["None", "General", "Backup", "Charge"]; }
      else if (capability.field === "charge") { value = slot % 2 === 0 ? "Allow Grid" : "No Grid or Gen"; attributes.options = ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]; }
      else if (capability.field === "sell") value = slot % 3 === 0 ? "on" : "off";
      else if (capability.field === "power") { value = String(5000 + slot * 100); attributes = { min: 0, max: 12000, step: 100 }; }
      else if (capability.field === "voltage") { value = String(50 + slot); attributes = { min: 0, max: 63, step: 0.1 }; }
      else value = slot % 2 === 0 ? "on" : "off";
      card._hass.states[capability.entity_id] = { state: value, attributes };
    });
  });
}

function tableHtml(card) {
  return card.renderTouSettingsContent([]);
}

function test_tou_table_is_inline_editable_without_overlay_controls() {
  const { card } = makeCard();
  const view = tableHtml(card);
  assertTrue(!view.includes('data-mapping-field="start" data-mapping-slot="2"'), "view mode must not render inline inputs");
  assertTrue(view.includes('data-edit-mapping="1"') && view.includes(">Edit<"), "view mode must show Edit button");
  assertTrue(view.includes('data-refresh-mapping="1"') && view.includes(">Refresh<"), "view mode must show Refresh button");

  card.startMappingEdit();
  const html = tableHtml(card);
  assertTrue(html.includes('data-mapping-field="start" data-mapping-slot="2"'), "middle From must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="end" data-mapping-slot="5"'), "middle To must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="soc" data-mapping-slot="2"'), "SOC must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="mode" data-mapping-slot="2"'), "mode must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="charge" data-mapping-slot="2"'), "charge must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="sell" data-mapping-slot="2"'), "sell must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="power" data-mapping-slot="2"'), "power must be editable in edit mode");
  assertTrue(html.includes('data-mapping-field="voltage" data-mapping-slot="2"'), "voltage must be editable in edit mode");
  assertTrue(!html.includes("data-open-tou"), "per-row overlay edit button must be gone");
  assertTrue(!html.includes("data-tou-field"), "overlay field controls must be gone");
  assertTrue(!html.includes("data-save-tou") && !html.includes("data-rollback-tou"), "overlay action buttons must be gone");
}

function test_tou_table_has_save_and_rollback_at_the_bottom() {
  const { card } = makeCard();
  const view = tableHtml(card);
  const viewActions = view.slice(view.lastIndexOf("</table>"));
  assertTrue(viewActions.includes('data-refresh-mapping="1"') && viewActions.includes(">Refresh<"), "view must have Refresh");
  assertTrue(viewActions.includes('data-edit-mapping="1"') && viewActions.includes(">Edit<"), "view must have Edit");

  card.startMappingEdit();
  const html = tableHtml(card);
  const tableEnd = html.lastIndexOf("</table>");
  assertTrue(tableEnd > 0, "the editor table must be rendered");
  const actions = html.slice(tableEnd);
  assertTrue(actions.includes('data-cancel-mapping="1"') && actions.includes(">Cancel<"), "Cancel must be at the bottom in edit mode");
  assertTrue(actions.includes('data-save-mapping="1"') && actions.includes(">Save<"), "Save must be at the bottom in edit mode");
  assertTrue(actions.indexOf('data-cancel-mapping="1"') < actions.indexOf('data-save-mapping="1"'), "Cancel must sit next to Save");
}

function test_tou_table_explains_full_day_validation() {
  const { card } = makeCard();
  const view = tableHtml(card);
  assertTrue(view.includes("Values are loaded from the inverter"), "view mode must explain fresh load");
  assertTrue(view.includes("Use Edit to change TOU slots"), "view mode must point to Edit");
  card.startMappingEdit();
  const html = tableHtml(card);
  assertTrue(html.includes("starts at 00:00, ends at 00:00 and has no gaps or overlaps"), "validation rule must be explained in edit mode");
  assertTrue(html.includes("Operation status") && html.includes("data-tou-reverse-sync"), "status sections must remain visible");
}

function test_tou_table_shows_validation_errors_after_failed_save() {
  const { card } = makeCard();
  card.startMappingEdit();
  card._mappingDraft[0].start = "00:30";
  return card.saveMappingToInverter().then((saved) => {
    assertEqual(saved, false, "invalid draft must not save");
    const html = tableHtml(card);
    assertTrue(html.includes("data-mapping-error"), "validation error container must be rendered");
    assertTrue(html.includes("first range must start at 00:00"), "specific validation error must be shown");
  });
}

async function test_tou_rollback_rebuilds_every_row_from_the_inverter() {
  const { card, calls } = makeCard();
  const refreshed = ["00:00", "03:30", "08:00", "12:00", "16:00", "20:00"];
  setLiveStates(card, STARTS);
  card.startMappingEdit();
  card._mappingDraft[1].start = "05:00";
  card.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    setLiveStates(card, refreshed);
  };
  await card.rollbackTouTable();
  const update = calls.find((call) => call.service === "update_entity");
  assertTrue(Boolean(update), "rollback must force a fresh inverter read");
  assertTrue(Array.isArray(update?.data?.entity_id) && update.data.entity_id.length > 0, "all physical TOU entities must be refreshed");
  assertEqual(card._mappingDraft, null, "rollback must discard the edited draft");
  assertEqual(card._mappingEditing, false, "rollback must exit edit mode");
  assertEqual(card.ensureMappingDraft()[1].start, "03:30", "all rows must be rebuilt from the refreshed inverter values");
  assertEqual(card._mappingStatus, "Restored all rows from the inverter.", "rollback must report the restore");
  assertTrue(tableHtml(card).includes("Restored all rows from the inverter."), "rollback status must appear in the UI");
}

function test_tou_read_only_provider_disables_save() {
  const { card } = makeCard({ readOnly: true });
  const html = tableHtml(card);
  assertTrue(html.includes("read-only"), "read-only provider must be explained");
  assertTrue(html.includes('data-edit-mapping="1" disabled'), "read-only provider must disable Edit");
  assertTrue(!html.includes('data-save-mapping="1"'), "read-only view must not show Save");
}

function test_tou_disabled_master_control_shows_hint_and_disables_save() {
  const { card } = makeCard({ controlEnabled: false });
  const html = tableHtml(card);
  assertTrue(html.includes("Deye control is disabled."), "disabled control must be explained");
  assertTrue(html.includes('data-edit-mapping="1" disabled'), "disabled control must disable Edit");
}

function test_tou_pending_save_disables_both_bottom_actions() {
  const { card } = makeCard();
  card._mappingSaving = true;
  let html = tableHtml(card);
  assertTrue(html.includes('data-refresh-mapping="1" disabled'), "Refresh must be disabled while saving");
  assertTrue(html.includes('data-edit-mapping="1" disabled'), "Edit must be disabled while saving");
  card._mappingSaving = false;
  card.startMappingEdit();
  card._mappingSaving = true;
  html = tableHtml(card);
  assertTrue(html.includes('data-cancel-mapping="1" disabled'), "Cancel must be disabled while saving");
  assertTrue(html.includes('data-save-mapping="1" disabled'), "Save must be disabled while saving");
}

function test_overlay_and_mapping_tab_code_is_removed() {
  for (const forbidden of [
    'tabButton("mapping"',
    "24 h mapping",
    "renderMappingTab(",
    'data-open-tou',
    "openTouEditor(",
    "savePhysicalTouSlot(",
    "rollbackTouEditor(",
    "touEditorFieldHtml(",
    "_touEditDraft",
    '_dialog.type === "tou"',
    "Apply to Inverter",
  ]) {
    assertTrue(!source.includes(forbidden), `obsolete code must be removed: ${forbidden}`);
  }
}

function test_both_card_copies_remain_identical() {
  assertEqual(fs.readFileSync(componentCard), fs.readFileSync(rootCard), "both card copies must remain identical");
}

const tests = [
  test_tou_table_is_inline_editable_without_overlay_controls,
  test_tou_table_has_save_and_rollback_at_the_bottom,
  test_tou_table_explains_full_day_validation,
  test_tou_table_shows_validation_errors_after_failed_save,
  test_tou_rollback_rebuilds_every_row_from_the_inverter,
  test_tou_read_only_provider_disables_save,
  test_tou_disabled_master_control_shows_hint_and_disables_save,
  test_tou_pending_save_disables_both_bottom_actions,
  test_overlay_and_mapping_tab_code_is_removed,
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
  console.log(`All TOU editor tests passed (${tests.length})`);
})();
