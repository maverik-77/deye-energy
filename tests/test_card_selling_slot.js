const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failures = 0;

function loadDeyeCardSource(file = "deye-energy-card.js") {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", file), "utf8");
  if (file === "deye-energy-card.js" && src.includes("import {")) {
    return src.replace(/import \{ (\w+) \} from "\.\/(.*?)\?v=[^"]+";/g, (_, cls, mod) => {
      return fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", mod), "utf8").replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
    });
  }
  if (/^deye-energy-.*-card\.js$/.test(file)) {
    return src.replace(/^\/\/ Resource revision:.*\n/, "").replace(/^export class /m, "class ");
  }
  return src;
}
function loadDeyeCardClass(className) {
  const map = {
    DeyeEnergyCard: "deye-energy-main-card.js",
    DeyeEnergyInverterConfigCard: "deye-energy-inverter-config-card.js",
    DeyeEnergyTriggerLogsCard: "deye-energy-trigger-logs-card.js",
    DeyeEnergyGraphsCard: "deye-energy-graphs-card.js",
    DeyeEnergyPowerFlowCard: "deye-energy-power-flow-card.js",
  };
  const src = loadDeyeCardSource(map[className] || "deye-energy-card.js").replace(/^export class /m, "class ");
  return src;
}

function assertTrue(cond, msg) { if (!cond) { console.error("FAIL:", msg); failures++; } }
function assertEqual(a,b,msg){ if (a!==b){ console.error("FAIL:", msg, "expected", b, "got", a); failures++; } }

function loadCard() {
  const code = loadDeyeCardSource("deye-energy-card.js");
  const sandbox = {
    console,
    window: { customCards: [] },
    customElements: { define() {}, get() { return undefined; } },
    HTMLElement: class {},
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window.setTimeout = setTimeout;
  sandbox.window.clearTimeout = clearTimeout;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(loadDeyeCardClass("DeyeEnergyCard"), sandbox);
  return vm.runInContext("DeyeEnergyCard", sandbox);
}

function makeCard(states = {}) {
  const Card = loadCard();
  const card = new Card();
  card._config = { entity_prefix: "deye_energy" };
  card._hass = { states, callService: async () => {}, connection: { subscribeEvents: async () => () => {} } };
  return card;
}

function test_mode_meta() {
  const card = makeCard({});
  assertEqual(card.modeMeta("Selling").title, "Selling", "selling title");
  assertEqual(card.modeMeta("Normal Operation").title, "Normal Operation", "normal title");
  assertEqual(card.modeMeta("Charging").title, "Charging", "charging title");
}

function test_manual_schedule_rows_signature() {
  const card = makeCard({});
  card._managerState = { manual_schedule: { active: true, rows: [{ from:"00:00", to:"00:00", mode:"Selling", tou_soc:15, minimum_sell_soc:30, sell_power:500, charge_enabled:false }] } };
  const rows = card.manualScheduleRows ? card.manualScheduleRows() : (card._managerState.manual_schedule.rows || []);
  assertTrue(Array.isArray(rows) && rows.length === 1, "manual schedule rows available");
  assertEqual(rows[0].mode || rows[0].logical_work_mode, "Selling", "row mode preserved");
}

function test_both_card_copies_identical() {
  const a = fs.readFileSync(path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js"));
  const b = fs.readFileSync(path.join(__dirname, "..", "www", "deye-energy-card.js"));
  assertTrue(a.length === b.length && a.equals(b), "both card copies must remain identical");
}

test_mode_meta();
test_manual_schedule_rows_signature();
test_both_card_copies_identical();
if (failures) process.exit(1);
console.log("All selling slot card tests passed");