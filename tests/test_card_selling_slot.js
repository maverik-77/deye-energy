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
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
function assertTrue(value, message) {
  if (!value) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}
function assertFalse(value, message) {
  if (value) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function entityId(domain, suffix) {
  return `${domain}.deye_energy_${suffix}`;
}

function defaultStates() {
  const states = {
    [entityId("sensor", "manager_status")]: { state: "Normal Operation", attributes: { mapping_plan: [] } },
  };
  const digits = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}${String(minutes % 60).padStart(2, "0")}`;
  for (let index = 0; index < 48; index++) {
    const key = `${digits(index * 30)}_${digits(index * 30 + 30)}`;
    states[entityId("switch", `slot_${key}_enabled`)] = { state: "off", attributes: {} };
    states[entityId("select", `slot_${key}_mode`)] = { state: "Normal Operation", attributes: {} };
    states[entityId("number", `slot_${key}_tou_soc`)] = { state: "0", attributes: {} };
    states[entityId("number", `slot_${key}_minimum_sell_soc`)] = { state: "0", attributes: {} };
    states[entityId("switch", `slot_${key}_charge_enabled`)] = { state: "off", attributes: {} };
  }
  return states;
}

function makeCard(overrides = {}) {
  const card = new DeyeEnergyCard();
  card.setConfig({});
  card._isRendered = true;
  card.captureScrollPositions = () => {};
  card.updateSaveIndicator = () => {};
  card.querySelectorAll = () => [];
  const states = defaultStates();
  for (const [id, value] of Object.entries(overrides)) {
    states[id] = value;
  }
  card._hass = {
    states,
    services: {},
    callService: async () => {},
  };
  return card;
}

function setSlot(states, key, values) {
  const prefix = `slot_${key}`;
  if (values.enabled !== undefined) {
    states[entityId("switch", `${prefix}_enabled`)] = { state: values.enabled ? "on" : "off", attributes: {} };
  }
  if (values.mode !== undefined) {
    states[entityId("select", `${prefix}_mode`)] = { state: values.mode, attributes: {} };
  }
  if (values.touSoc !== undefined) {
    states[entityId("number", `${prefix}_tou_soc`)] = { state: String(values.touSoc), attributes: {} };
  }
  if (values.minimumSellSoc !== undefined) {
    states[entityId("number", `${prefix}_minimum_sell_soc`)] = { state: String(values.minimumSellSoc), attributes: {} };
  }
  if (values.chargeEnabled !== undefined) {
    states[entityId("switch", `${prefix}_charge_enabled`)] = { state: values.chargeEnabled ? "on" : "off", attributes: {} };
  }
}

function findSegmentForMinute(segments, minute) {
  return segments.find((segment) => {
    const end = segment.end === 0 ? 1440 : segment.end;
    if (segment.start <= end) {
      return segment.start <= minute && minute < end;
    }
    return minute >= segment.start || minute < end;
  });
}

function extractAttribute(html, label, attr) {
  const regex = new RegExp(`<span>${label}</span>[^]*?${attr}="([^"]+)"`, "i");
  const match = html.match(regex);
  return match ? match[1] : null;
}

function test_card_selling_slot_keeps_minimum_sell_soc_and_tou_soc_separate() {
  const slots = (new DeyeEnergyCard()).scheduleSlots();
  const states = {};
  setSlot(states, "0600_0630", { enabled: true, mode: "Selling", touSoc: 15, minimumSellSoc: 30 });
  const card = makeCard(states);
  const segments = card.scheduleSegments(slots);
  const segment = findSegmentForMinute(segments, 360);
  assertEqual(segment.touSoc, 15, "selling segment must use tou_soc as physical SOC");
  assertEqual(segment.mode, "Selling", "segment must keep canonical logical mode");
  assertEqual(segment.minimumSellSoc, 30, "segment must keep minimum_sell_soc as logical guard");
}

function test_card_mapping_preview_uses_tou_soc_for_selling() {
  const slots = (new DeyeEnergyCard()).scheduleSlots();
  const states = {};
  setSlot(states, "0600_0630", { enabled: true, mode: "Selling", touSoc: 15, minimumSellSoc: 30 });
  setSlot(states, "0630_0700", { enabled: true, mode: "Selling", touSoc: 15, minimumSellSoc: 30 });
  setSlot(states, "0700_0730", { enabled: true, mode: "Normal Operation", touSoc: 15, minimumSellSoc: 0 });
  setSlot(states, "0730_0800", { enabled: true, mode: "Normal Operation", touSoc: 15, minimumSellSoc: 0 });
  const card = makeCard(states);
  const segments = card.scheduleSegments(slots);
  const segment = findSegmentForMinute(segments, 360);
  assertEqual(segment.touSoc, 15, "shared physical range must use tou_soc");
  assertEqual(segment.end, 480, "selling and normal slots with same tou_soc/grid must share a physical range");
}

function test_card_selling_slot_save_does_not_copy_minimum_sell_soc_to_tou_soc() {
  const slots = (new DeyeEnergyCard()).scheduleSlots();
  const states = {};
  setSlot(states, "0600_0630", { enabled: true, mode: "Selling", touSoc: 15, minimumSellSoc: 30 });
  const card = makeCard(states);
  card._dialog = { type: "sell", key: "0600_0630" };
  const html = card.renderDialog(slots, []);
  assertTrue(html.includes("Stop selling at SOC"), "selling dialog must show stop SOC label");
  assertTrue(html.includes("Deye TOU SOC / battery reserve"), "selling dialog must show physical TOU SOC label");
  assertTrue(html.includes('data-slot-draft-field="minimum_sell_soc"'), "stop SOC input must target minimum_sell_soc draft field");
  assertTrue(html.includes('data-slot-draft-field="tou_soc"'), "physical TOU input must target tou_soc draft field");
  assertEqual(card._slotEditDraft.values.minimum_sell_soc, 30, "stop SOC draft must use minimum_sell_soc backend value");
  assertEqual(card._slotEditDraft.values.tou_soc, 15, "physical TOU draft must use tou_soc backend value");
}

function test_card_schedule_segment_key_does_not_include_minimum_sell_soc() {
  const states = {};
  setSlot(states, "0600_0630", { enabled: true, mode: "Selling", touSoc: 15, minimumSellSoc: 30 });
  const card = makeCard(states);
  const segmentCode = card.scheduleSegments.toString();
  assertTrue(segmentCode.includes("\"touSoc\""), "schedule segment key must include touSoc");
  assertTrue(segmentCode.includes("\"chargeEnabled\""), "schedule segment key must include chargeEnabled");
  assertFalse(segmentCode.includes("\"minimumSellSoc\""), "schedule segment key must not include minimumSellSoc");
  assertFalse(segmentCode.includes("\"minimum_sell_soc\""), "schedule segment key must not include minimum_sell_soc");
}

function test_both_card_copies_remain_identical() {
  const a = fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js"));
  const b = fs.readFileSync(path.join(__dirname, "..", "www", "deye-energy-card.js"));
  assertTrue(a.length === b.length && a.equals(b), "both card copies must remain identical");
}

(async () => {
  test_card_selling_slot_keeps_minimum_sell_soc_and_tou_soc_separate();
  test_card_mapping_preview_uses_tou_soc_for_selling();
  test_card_selling_slot_save_does_not_copy_minimum_sell_soc_to_tou_soc();
  test_card_schedule_segment_key_does_not_include_minimum_sell_soc();
  test_both_card_copies_remain_identical();

  if (failures) process.exit(1);
  console.log("All selling slot card tests passed");
})();
