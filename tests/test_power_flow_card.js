const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
  "custom_components/deye_energy/www/deye-energy-card.js",
  "utf8",
);
const sandbox = {
  console,
  HTMLElement: class {
    constructor() { this._inner = ""; }
    set innerHTML(v) { this._inner = v; }
    get innerHTML() { return this._inner; }
  },
  customElements: { define(name, cls) { this._defs = this._defs || {}; this._defs[name] = cls; } },
  setTimeout: () => 1,
  clearTimeout: () => {},
};
sandbox.window = sandbox;
sandbox.window.customCards = [];
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.PowerFlowCard = DeyeEnergyPowerFlowCard;`, sandbox);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// Registration
check(sandbox.customElements._defs["deye-energy-power-flow-card"], "power flow card not registered");
check(sandbox.window.customCards.some(c => c.type === "deye-energy-power-flow-card"), "customCards missing power flow card");

// Stub/defaults
const stub = sandbox.PowerFlowCard.getStubConfig();
check(stub.entities.pv === "sensor.garage_deye_energy_pv_power", "default pv entity mismatch");
check(stub.entities.grid === "sensor.garage_deye_energy_grid_power", "default grid entity mismatch");
check(stub.entities.battery === "sensor.garage_deye_energy_battery_power", "default battery entity mismatch");
check(stub.entities.battery_soc === "sensor.garage_deye_energy_battery_soc", "default battery_soc entity mismatch");
check(stub.entities.load === "sensor.garage_deye_energy_load_power", "default load entity mismatch");
check(stub.entities.inverter === "sensor.deye_inverter_power", "default inverter entity mismatch");

const card = new sandbox.PowerFlowCard();
card.setConfig({
  title: "Test Flow",
  entities: { pv: "sensor.my_pv", grid: "sensor.my_grid", battery: "sensor.my_batt", battery_soc: "sensor.my_soc", load: "sensor.my_load", inverter: "sensor.my_inv" },
});
card.hass = {
  states: {
    "sensor.my_pv": { state: "2500" },
    "sensor.my_grid": { state: "-400" },
    "sensor.my_batt": { state: "300" },
    "sensor.my_soc": { state: "77" },
    "sensor.my_load": { state: "1800" },
    "sensor.my_inv": { state: "2100" },
  },
};

const html = card.innerHTML;
check(html.includes("Test Flow"), "missing title");
check(html.includes("PV"), "missing PV node");
check(html.includes("Grid"), "missing Grid node");
check(html.includes("Inverter"), "missing Inverter node");
check(html.includes("Battery"), "missing Battery node");
check(html.includes("Home"), "missing Home node");
check(html.includes("2500 W"), "missing PV W formatting");
check(html.includes("2400 W"), "missing calculated home load");
check(html.includes("Exporting"), "missing grid export label");
check(html.includes("Discharging"), "missing battery discharging label");
check(html.includes("-300 W"), "missing flipped battery power display");
check(html.includes("SOC 77%"), "missing SOC label");
check(html.includes("<svg"), "missing svg");
check(html.includes("animateMotion"), "missing animated flow");
check(!html.includes("Missing/unavailable entities"), "should not warn when all entities present");
check(html.includes('viewBox="0 0 1200 800"'), "missing larger viewBox");
check(html.includes('preserveAspectRatio="xMidYMid meet"'), "missing responsive preserveAspectRatio");
check(html.includes('height:100%'), "missing height scaling");
check(/<path[^>]*d="M [^"]* [LC] /.test(html), "missing flow path");
check(html.includes('pf-icon-glow'), "missing icon glow filter");
check(html.includes('pf-glow'), "missing glow filter");
check(html.includes('pf-arrow-pf-pv-inv'), "missing arrow marker");
check(html.includes('markerWidth="3.5" markerHeight="3.5"'), "missing smaller arrow marker");
check(!html.includes('markerWidth="10" markerHeight="10"'), "oversized arrow marker should be gone");
check(!html.includes('width="84" height="30" rx="15"'), "on-arrow power label should not be rendered");
check(html.includes('r="150"') && html.includes('stroke-width="28"'), "shrunken inverter ring should be rendered");
check(!html.includes('r="210" stroke="rgba(188,99,255,.05)" stroke-width="38"'), "oversized inverter ring should be gone");
check(html.includes('display:flex;flex-direction:column;justify-content:center;width:248px'), "node content should be vertically centered");

// Node images (light theme) and active glow
for (const key of ['solar-pv', 'grid', 'inverter', 'home', 'battery']) {
  check(html.includes(`src="/deye_energy/pf-${key}.jpeg"`), `missing ${key} node image`);
  check(!html.includes(`src="/deye_energy/pf-${key}-dark.jpeg"`), `${key} dark image should not be used in light theme`);
}
check(html.includes('object-fit:contain;display:block;border-radius:8px'), "node images should be contained and rounded");
check(html.includes('width:77%;height:100%;border-radius:999px;background:#7ee22d'), "77% SOC bar should be green at 77% width");
check(html.includes('position:absolute;left:8%;right:8%;bottom:8%;height:14%'), "SOC bar should be proportionally positioned within the image");
check(html.includes('drop-shadow(0 0 5px #') && html.includes('drop-shadow(0 0 14px #'), "active nodes should have a coloured glow");
check(html.includes('box-shadow:0 0 12px #') && html.includes('border:1px solid #'), "active node ring should glow");

check(html.includes('pf-node-click'), "missing clickable node class");
check(html.includes('data-entity="sensor.my_pv"'), "missing node entity data attribute");
check(html.toLowerCase().includes('click any node for details'), "missing click hint");
check(html.includes('Import today'), "missing grid import today detail");
check(html.includes('Export today'), "missing grid export today detail");
check(html.includes('Charged today'), "missing battery charged today detail");
check(html.includes('Discharged today'), "missing battery discharged today detail");
check(html.includes('Today'), "missing daily detail label");

// Click dispatch
let fired = null;
card.dispatchEvent = (ev) => { fired = ev; return true; };
card._openMoreInfo('sensor.my_pv');
check(fired && fired.type === 'hass-more-info', "more-info event not fired");
check(fired.detail && fired.detail.entityId === 'sensor.my_pv', "more-info entityId mismatch");

// Missing entity warning
card.hass = { states: { "sensor.my_pv": { state: "0" } } };
check(card.innerHTML.includes("Missing/unavailable entities"), "missing entity warning not shown");

// Consumers + period selector
const card2 = new sandbox.PowerFlowCard();
card2.setConfig({
  title: "Deye",
  view: { energy_periods: ["power", "today", "24h", "week", "month"] },
  entities: { pv: "sensor.pv", grid: "sensor.grid", battery: "sensor.batt", battery_soc: "sensor.soc", load: "sensor.load", inverter: "sensor.inv" },
  consumers: [
    { entity: "sensor.ac", name: "Right AC", icon: "mdi:air-conditioner", min_w: 5 },
    { entity: "sensor.uni", name: "Unifi", icon: "mdi:server", min_w: 1 },
    { type: "rest", name: "Rest", icon: "mdi:cloud-question", min_w: 20 }
  ]
});
card2.hass = { states: {
  "sensor.pv": { state: "1000" }, "sensor.grid": { state: "200" }, "sensor.batt": { state: "0" },
  "sensor.soc": { state: "50" }, "sensor.load": { state: "1200" }, "sensor.inv": { state: "1000" },
  "sensor.ac": { state: "500" }, "sensor.uni": { state: "50" }
}};
const h2 = card2.innerHTML;
check(h2.includes("Consumers"), "missing consumers section");
check(h2.includes("Right AC"), "missing consumer name");
check(h2.includes("Unifi"), "missing consumer name Unifi");
check(h2.includes("Rest"), "missing rest consumer");
check(h2.includes("pf-period"), "missing period selector");
check(h2.includes('data-period="today"'), "missing today period");
check(h2.includes('data-period="24h"'), "missing 24h period");
check(h2.includes("pf-consumer-click"), "missing consumer click class");
check(card2._period === "power", "default period should be power");
card2._period = "today"; card2._render();
check(card2.innerHTML.includes("Energy period view"), "missing period view label");

// Dark theme node images
card2.hass = { themes: { darkMode: true }, states: {
  "sensor.pv": { state: "1000" }, "sensor.grid": { state: "200" }, "sensor.batt": { state: "0" },
  "sensor.soc": { state: "50" }, "sensor.load": { state: "1200" }, "sensor.inv": { state: "1000" },
  "sensor.ac": { state: "500" }, "sensor.uni": { state: "50" }
}};
const darkHtml = card2.innerHTML;
for (const key of ['solar-pv', 'grid', 'inverter', 'home', 'battery']) {
  check(darkHtml.includes(`src="/deye_energy/pf-${key}-dark.jpeg"`), `missing ${key} dark node image`);
  check(!darkHtml.includes(`src="/deye_energy/pf-${key}.jpeg"`), `${key} light image should not be used in dark theme`);
}

// Battery SOC bar colour thresholds and unavailable fallback
const socStates = { p: { state: '0' }, g: { state: '0' }, b: { state: '0' }, l: { state: '0' }, i: { state: '0' } };
const socCard = new sandbox.PowerFlowCard();
socCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
socCard.hass = { states: { ...socStates, s: { state: '12' } } };
check(socCard.innerHTML.includes('width:12%;height:100%;border-radius:999px;background:#ff5d70'), "low SOC bar should be red");
socCard.hass = { states: { ...socStates, s: { state: '35' } } };
check(socCard.innerHTML.includes('width:35%;height:100%;border-radius:999px;background:#ffb020'), "mid SOC bar should be amber");
socCard.hass = { states: socStates };
check(socCard.innerHTML.includes('width:0%;height:100%;border-radius:999px;background:#9eb8c8'), "missing SOC bar should be empty and grey");

check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("Power flow card tests passed");
