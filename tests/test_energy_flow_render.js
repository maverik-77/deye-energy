const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cardPath = path.join(
  root,
  "custom_components",
  "deye_energy",
  "www",
  "deye-energy-card.js",
);

global.window = {
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: (handle) => clearTimeout(handle),
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1280,
  confirm: () => true,
  alert() {},
  customCards: [],
};
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
global.document = {
  activeElement: null,
  scrollingElement: { scrollTop: 0 },
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
};
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
global.HTMLElement = class {
  constructor() {
    this.innerHTML = "";
    this.clientWidth = 1280;
    this.ownerDocument = {
      activeElement: null,
      addEventListener() {},
      removeEventListener() {},
    };
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  contains() {
    return false;
  }

  getBoundingClientRect() {
    return { width: 1280, height: 800, top: 0, left: 0 };
  }

  addEventListener() {}
  removeEventListener() {}
  setText() {}
  setClass() {}
};
global.customElements = { define() {} };

const source = fs.readFileSync(cardPath, "utf8");
eval(`${source}\nglobal.DeyeEnergyCard = DeyeEnergyCard;`);

function makeState(state, attributes = {}) {
  return { state, attributes };
}

function makeHass(managerStatus = "present", scheduleSource = null) {
  const states = {
    "switch.manually_renamed_deye_control": makeState("on", {
      friendly_name: "Manually renamed Deye control",
    }),
    "sensor.deye_energy_pv_power": makeState("4200"),
    "sensor.deye_energy_grid_power": makeState("-350"),
    "sensor.deye_energy_load_power": makeState("2800"),
    "sensor.deye_energy_battery_power": makeState("1050"),
    "sensor.deye_energy_battery_soc": makeState("67"),
    "sensor.deye_energy_decision_reason": makeState("Plan testowy"),
  };

  if (managerStatus === "present") {
    const attributes = {
      control: {
        entity_id: "switch.manually_renamed_deye_control",
        enabled: true,
        status: "Active",
      },
    };
    if (scheduleSource !== null) {
      attributes.schedule_source = scheduleSource;
    }
    states["sensor.deye_energy_manager_status"] = makeState("Aktywny", attributes);
  } else if (managerStatus === "unavailable") {
    states["sensor.deye_energy_manager_status"] = makeState(
      "unavailable",
      {},
    );
  }

  return {
    config: { time_zone: "Europe/London" },
    states,
    services: {},
    locale: { language: "pl" },
    callService: async () => {},
  };
}

function makeCard(managerStatus = "present", scheduleSource = null) {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card._hass = makeHass(managerStatus, scheduleSource);
  return card;
}

function readDynamic(card) {
  const text = {};
  card.setText = (selector, value) => {
    text[selector] = String(value);
  };
  card.setHtml = () => {};
  card.setClass = () => {};
  card.querySelectorAll = () => [];
  card._isRendered = true;
  card.updateDynamicValues();
  return text;
}

function test_dynamic_status_values_render_without_reference_error() {
  const text = readDynamic(makeCard());
  assert.strictEqual(text["[data-live='decision-reason']"], "Plan testowy");
  assert.strictEqual(text["[data-live='manager-mode']"], "Aktywny");
  for (const removed of [
    /energyFlowPanel\(\)/,
    /planned_manager_action/,
    /executed_manager_action/,
    /Planned decision/,
    /Executed decision/,
  ]) {
    assert.doesNotMatch(source, removed);
  }
}

function test_card_full_render_with_manager_status_control_contract() {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card.hass = makeHass();
  assert.match(card.innerHTML, /class="dem-v073"/);
  assert.match(card.innerHTML, /class="dialog-host"/);
  assert.doesNotMatch(card.innerHTML, /class="energy-flow-panel"/);
  assert.match(card.innerHTML, /Deye control/);
  assert.match(card.innerHTML, /Active/);
  assert.strictEqual(
    card.controlEntityId(),
    "switch.manually_renamed_deye_control",
  );
}

function test_card_render_survives_missing_manager_status_entity() {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card.hass = makeHass("missing");
  assert.match(card.innerHTML, /class="dem-v073"/);
  const text = readDynamic(card);
  assert.strictEqual(text["[data-live='manager-mode']"], "No data");
}

function test_card_render_survives_unavailable_manager_status_entity() {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card.hass = makeHass("unavailable");
  assert.match(card.innerHTML, /class="dem-v073"/);
  const text = readDynamic(card);
  assert.strictEqual(text["[data-live='manager-mode']"], "unavailable");
}

function test_removed_energy_status_tile_markers_are_absent() {
  assert.doesNotMatch(source, /class="energy-flow-panel"/);
  assert.doesNotMatch(source, /flow-sold-icon|flow-sold-copy|flow-sold-value/);
  const card = makeCard();
  card.hass = makeHass();
  assert.doesNotMatch(card.innerHTML, /class="energy-flow-panel"/);
  assert.doesNotMatch(card.innerHTML, /flow-sold-icon/);
}

function setManualRows(card, rows) {
  card._hass.config = { time_zone: "UTC" };
  card._hass.states["sensor.deye_energy_ai_state"] = makeState("ready", {
    manual_schedule: { active: true, rows },
  });
}

function test_active_time_label_uses_manual_row_when_manual_active() {
  const card = makeCard("present", "manual");
  setManualRows(card, [
    { from: "00:00", to: "12:00" },
    { from: "12:00", to: "00:00" },
  ]);
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T08:30:00Z")),
    "00:00-12:00",
  );
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T21:45:00Z")),
    "12:00-00:00",
  );
}

function test_active_time_label_uses_tou_when_manual_inactive() {
  const card = makeCard("present", "work");
  setManualRows(card, [{ from: "00:00", to: "00:00" }]);
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T21:45:00Z")),
    "21:30-22:00",
  );
}

function test_active_time_label_falls_back_without_manual_rows() {
  const card = makeCard("present", "manual");
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T21:45:00Z")),
    "21:30-22:00",
  );
}

function test_dynamic_active_time_uses_manual_row_range() {
  const card = makeCard("present", "manual");
  setManualRows(card, [
    { from: "00:00", to: "12:00" },
    { from: "12:00", to: "00:00" },
  ]);
  const label = readDynamic(card)["[data-live='active-slot']"];
  assert.ok(
    label === "00:00-12:00" || label === "12:00-00:00",
    `manual active-slot label must come from a manual row, got ${label}`,
  );
  assert.notStrictEqual(label, "21:30-22:00");
}

function test_dynamic_active_time_uses_tou_when_manual_inactive() {
  const card = makeCard("present", "work");
  setManualRows(card, [{ from: "00:00", to: "00:00" }]);
  assert.strictEqual(
    readDynamic(card)["[data-live='active-slot']"],
    "21:30-22:00",
  );
}

function test_energy_status_power_switches_to_kw_at_10000_watts() {
  const card = makeCard();
  assert.strictEqual(card.formatEnergyStatusPower(300), "300 W");
  assert.strictEqual(card.formatEnergyStatusPower(9999), "9999 W");
  assert.strictEqual(card.formatEnergyStatusPower(-1250), "-1250 W");
  assert.strictEqual(card.formatEnergyStatusPower(10000), "10.00 kW");
  assert.strictEqual(card.formatEnergyStatusPower(12345), "12.35 kW");
  assert.strictEqual(card.formatEnergyStatusPower(null), "—");
}

test_dynamic_status_values_render_without_reference_error();
test_card_full_render_with_manager_status_control_contract();
test_card_render_survives_missing_manager_status_entity();
test_card_render_survives_unavailable_manager_status_entity();
test_removed_energy_status_tile_markers_are_absent();
test_energy_status_power_switches_to_kw_at_10000_watts();
console.log("energy flow render tests passed");
