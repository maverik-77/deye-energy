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
    "sensor.deye_energy_active_slot": makeState("2130_2200"),
  };

  if (managerStatus === "present") {
    const attributes = {
      control: {
        entity_id: "switch.manually_renamed_deye_control",
        enabled: true,
        status: "Active",
      },
      planned_manager_action: "Plan testowy",
      executed_manager_action: "Executed test",
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

function test_energy_flow_panel_renders_without_reference_error() {
  const card = makeCard();
  const html = card.energyFlowPanel();
  assert.match(html, /class="energy-flow-panel"/);
  assert.match(html, /Plan testowy/);
  assert.match(html, /Executed test/);
}

function test_card_full_render_with_manager_status_control_contract() {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card.hass = makeHass();
  assert.match(card.innerHTML, /class="dem-v073"/);
  assert.match(card.innerHTML, /class="energy-flow-panel"/);
  assert.match(card.innerHTML, /Plan testowy/);
  assert.match(card.innerHTML, /Executed test/);
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
  assert.match(card.innerHTML, /class="energy-flow-panel"/);
}

function test_card_render_survives_unavailable_manager_status_entity() {
  const card = new global.DeyeEnergyCard();
  card.setConfig({});
  card.hass = makeHass("unavailable");
  assert.match(card.innerHTML, /class="energy-flow-panel"/);
}

function test_energy_flow_panel_shows_manual_schedule_source_captions() {
  const html = makeCard("present", "manual").energyFlowPanel();
  assert.match(html, /data-live="executed-schedule-source">Manual schedule</);
  assert.match(html, /data-live="manager-schedule-source">Manual schedule</);
}

function test_energy_flow_panel_shows_stored_schedule_slots_source_captions() {
  const html = makeCard("present", "work").energyFlowPanel();
  assert.match(html, /data-live="executed-schedule-source">Schedule slots</);
  assert.match(html, /data-live="manager-schedule-source">Schedule slots</);
}

function test_energy_flow_panel_defaults_missing_schedule_source_to_stored_slots() {
  const html = makeCard().energyFlowPanel();
  assert.match(html, /data-live="executed-schedule-source">Schedule slots</);
  assert.match(html, /data-live="manager-schedule-source">Schedule slots</);
}

function test_energy_flow_panel_sold_today_uses_pound_icon() {
  const card = makeCard();
  const html = card.energyFlowPanel();
  const iconStart = html.indexOf('<div class="flow-sold-icon"');
  assert.ok(iconStart >= 0);
  const iconEnd = html.indexOf("</div>", iconStart);
  const icon = html.slice(iconStart, iconEnd);
  assert.notStrictEqual(card.iconSvg("pound"), card.iconSvg("money"));
  assert.ok(icon.includes(card.iconSvg("pound")));
  assert.ok(!icon.includes(card.iconSvg("money")));
  assert.ok(card.iconSvg("pound").includes('stroke="none">£</text>'));
}

function test_energy_flow_panel_sold_today_value_stays_on_one_line() {
  const html = makeCard().energyFlowPanel();
  assert.ok(html.includes(".flow-sold-copy>span:first-child{display:block"));
  assert.ok(!html.includes(".flow-sold-copy span{display:block"));
  assert.ok(html.includes(".flow-sold-value span{display:inline}"));
  assert.match(html, /\.flow-sold-tile\{[^}]*min-width:300px/);
}

function setManualRows(card, rows) {
  card._hass.config = { time_zone: "UTC" };
  card._hass.states["sensor.deye_energy_ai_state"] = makeState("ready", {
    manual_schedule: { active: true, rows },
  });
}

function test_active_slot_time_label_uses_manual_row_when_manual_active() {
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

function test_active_slot_time_label_uses_work_slot_when_work_active() {
  const card = makeCard("present", "work");
  setManualRows(card, [{ from: "00:00", to: "00:00" }]);
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T21:45:00Z")),
    "21:30-22:00",
  );
}

function test_active_slot_time_label_falls_back_without_manual_rows() {
  const card = makeCard("present", "manual");
  assert.strictEqual(
    card.activeSlotTimeLabel(new Date("2026-11-19T21:45:00Z")),
    "21:30-22:00",
  );
}

function test_energy_flow_panel_slot_uses_manual_row_range() {
  const card = makeCard("present", "manual");
  setManualRows(card, [
    { from: "00:00", to: "12:00" },
    { from: "12:00", to: "00:00" },
  ]);
  const html = card.energyFlowPanel();
  assert.match(html, /data-live="active-slot">(00:00-12:00|12:00-00:00)</);
  assert.doesNotMatch(html, /data-live="active-slot">21:30-22:00/);
}

function test_energy_flow_panel_slot_uses_work_slot_when_work_active() {
  const card = makeCard("present", "work");
  setManualRows(card, [{ from: "00:00", to: "00:00" }]);
  const html = card.energyFlowPanel();
  assert.match(html, /data-live="active-slot">21:30-22:00</);
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

test_energy_flow_panel_renders_without_reference_error();
test_card_full_render_with_manager_status_control_contract();
test_card_render_survives_missing_manager_status_entity();
test_card_render_survives_unavailable_manager_status_entity();
test_energy_flow_panel_shows_manual_schedule_source_captions();
test_energy_flow_panel_shows_stored_schedule_slots_source_captions();
test_energy_flow_panel_defaults_missing_schedule_source_to_stored_slots();
test_energy_flow_panel_sold_today_uses_pound_icon();
test_energy_flow_panel_sold_today_value_stays_on_one_line();
test_active_slot_time_label_uses_manual_row_when_manual_active();
test_active_slot_time_label_uses_work_slot_when_work_active();
test_active_slot_time_label_falls_back_without_manual_rows();
test_energy_flow_panel_slot_uses_manual_row_range();
test_energy_flow_panel_slot_uses_work_slot_when_work_active();
test_energy_status_power_switches_to_kw_at_10000_watts();
console.log("energy flow render tests passed");
