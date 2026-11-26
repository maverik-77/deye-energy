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

const scheduleEntity = "sensor.deye_energy_manager_status";
function hassWithStatus(status, pv = "0") {
  return {
    states: {
      [scheduleEntity]: { state: status, attributes: {} },
      "sensor.deye_energy_pv_power": { state: pv, attributes: {} },
    },
    services: { select: { select_option: true } },
    callService: async () => {},
  };
}

function makeRenderedCard(status = "IDLE") {
  const card = new DeyeEnergyCard();
  card.setConfig({});
  card._hass = hassWithStatus(status);
  card._isRendered = true;
  card._scheduleEntityIds = [scheduleEntity];
  card._lastScheduleSignature = `${scheduleEntity}:${status}`;
  card.captureScrollPositions = () => {};
  card.updateSaveIndicator = () => {};
  card.querySelectorAll = () => [];
  return card;
}

(async () => {
  {
    const card = makeRenderedCard();
    let renders = 0;
    card.render = () => { renders += 1; };
    card.isInteracting = () => false;
    card.hass = hassWithStatus("SELLING ACTIVE");
    assertEqual(renders, 1, "schedule state change must render the card");
  }
  {
    const card = makeRenderedCard();
    let renders = 0;
    card.render = () => { renders += 1; };
    card.updateDynamicValues = () => {};
    card.isInteracting = () => false;
    card.hass = hassWithStatus("IDLE", "9000");
    assertEqual(renders, 0, "telemetry-only change must not render the schedule");
  }
  {
    const card = makeRenderedCard();
    let renders = 0;
    let interacting = true;
    card.render = () => { renders += 1; };
    card.updateDynamicValues = () => {};
    card.isInteracting = () => interacting;
    card.hass = hassWithStatus("SELLING ACTIVE");
    assertTrue(card._pendingRender, "schedule render must be deferred while editing");
    assertEqual(renders, 0, "deferred schedule update must not interrupt editing");
    interacting = false;
    card.flushPendingRender();
    assertEqual(renders, 1, "deferred schedule update must render after interaction");
  }
  {
    const card = makeRenderedCard();
    let renders = 0;
    card.render = () => { renders += 1; };
    await card.setSelect(scheduleEntity, "SELLING ACTIVE");
    assertEqual(card._optimisticStates[scheduleEntity], "SELLING ACTIVE", "select must be optimistic until HA confirms it");
    assertEqual(renders, 1, "select must render immediately");
  }

  // The obsolete slot bulk-edit API is no longer present.
  assertEqual(typeof DeyeEnergyCard.prototype.applyMultiEdit, "undefined", "slot bulk edit must be removed");
  assertEqual(typeof DeyeEnergyCard.prototype.applySchedulePatch, "undefined", "schedule patch API must be removed");

  if (failures) process.exit(1);
  console.log("All schedule card behavior tests passed");
})();
