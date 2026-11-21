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
check(html.includes("2.50 kW"), "missing PV kW formatting");
check(html.includes("Exporting"), "missing grid export label");
check(html.includes("Charging"), "missing battery charging label");
check(html.includes("SOC 77%"), "missing SOC label");
check(html.includes("<svg"), "missing svg");
check(html.includes("animateMotion"), "missing animated flow");
check(!html.includes("Missing/unavailable entities"), "should not warn when all entities present");
check(html.includes('viewBox="0 0 1200 760"'), "missing larger viewBox");
check(html.includes('preserveAspectRatio="xMidYMid meet"'), "missing responsive preserveAspectRatio");
check(html.includes('height:100%'), "missing height scaling");
check(/<path[^>]*d="M [^"]* C /.test(html), "missing curved flow path");
check(html.includes('pf-icon-glow'), "missing icon glow filter");
check(html.includes('pf-glow'), "missing glow filter");
check(html.includes('pf-arrow-pf-pv-inv'), "missing arrow marker");
check(html.includes('pf-node-click'), "missing clickable node class");
check(html.includes('data-entity="sensor.my_pv"'), "missing node entity data attribute");
check(html.toLowerCase().includes('click any node for details'), "missing click hint");

// Click dispatch
let fired = null;
card.dispatchEvent = (ev) => { fired = ev; return true; };
card._openMoreInfo('sensor.my_pv');
check(fired && fired.type === 'hass-more-info', "more-info event not fired");
check(fired.detail && fired.detail.entityId === 'sensor.my_pv', "more-info entityId mismatch");

// Missing entity warning
card.hass = { states: { "sensor.my_pv": { state: "0" } } };
check(card.innerHTML.includes("Missing/unavailable entities"), "missing entity warning not shown");

check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("Power flow card tests passed");
