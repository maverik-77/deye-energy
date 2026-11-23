const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
  "custom_components/deye_energy/www/deye-energy-card.js",
  "utf8",
);
const sandbox = {
  console,
  HTMLElement: class {
    constructor() { this._inner = ""; this._listeners = {}; }
    set innerHTML(v) { this._inner = v; }
    get innerHTML() { return this._inner; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach(fn => fn(ev)); return true; }
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
    "sensor.givenergy_ed2253g336_import_power": { state: "0" },
    "sensor.givenergy_ed2253g336_export_power": { state: "3331" },
    "sensor.givenergy_ed2253g336_import_energy_today_kwh": { state: "77.6" },
    "sensor.smart_meter_electricity_cost_today": { state: "4.64" },
    "sensor.smart_meter_gas_import_today": { state: "2.344" },
    "sensor.smart_meter_gas_cost_today": { state: "0.44" },
    "sensor.givenergy_ed2253g336_export_energy_today_kwh": { state: "3.7" },
    "sensor.smart_meter_electricity_income_today": { state: "0.444" },
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
check(html.includes("pfFlowDash") && html.includes("stroke-dasharray:1 22"), "missing animated flow");
check(!html.includes("Missing/unavailable entities"), "should not warn when all entities present");
check(html.includes('viewBox="0 0 1200 1081"'), "missing scaled viewBox for widened node surrounds");
check(html.includes('preserveAspectRatio="xMidYMin meet"'), "missing top-aligned responsive preserveAspectRatio");
check(html.includes('aspect-ratio:1200 / 1081'), "diagram frame should scale with the viewBox");
check(!html.includes('min-height:980px'), "diagram frame should not keep a fixed minimum height");
check(html.includes('height:100%'), "missing height scaling");
check(
  html.includes('<g transform="translate(-105.28541226215646 -81.18816067653277) scale(1.175475687103594)">'),
  "diagram content should be scaled to one grid cell of left/top margin",
);
const pfContentGroup = (html.match(/<g transform="translate\([^"]+\) scale\([^"]+\)">[\s\S]*?<\/g>/) || [''])[0];
check(
  pfContentGroup.includes('cx="600" cy="470" r="121"')
    && pfContentGroup.includes('x="127" y="377"')
    && pfContentGroup.includes('<foreignObject'),
  "ring, halos and nodes should all share the same scale transform",
);
const pfSvg = (html.match(/<svg viewBox="0 0 1200 1081"[\s\S]*?<\/svg>/) || [''])[0];
check(
  pfSvg.indexOf('fill="url(#pf-grid)"') > -1
    && pfSvg.indexOf('fill="url(#pf-grid)"') < pfSvg.indexOf('<g transform='),
  "grid background should remain outside the content transform",
);

// Summary widget row above the existing PV/Grid/Battery/Home chips
for (const title of ["Overall grid", "Electricity", "Gas", "Export"]) {
  check(html.includes(`>${title}</div>`), `missing summary widget ${title}`);
}
check(html.indexOf(">Overall grid</div>") < html.indexOf(">PV</div>"), "summary row should be above PV/Grid/Battery/Home chips");
check(html.includes("0 W") && html.includes("3331 W"), "missing overall grid import/export values");
check(html.includes("77.60 kWh") && html.includes("£4.64"), "missing electricity values");
check(html.includes("2.34 kWh") && html.includes("£0.44"), "missing gas values");
check(html.includes("3.70 kWh"), "missing export energy value");
const overallGridHtml = html.slice(html.indexOf(">Overall grid</div>"), html.indexOf(">Electricity</div>"));
const electricityHtml = html.slice(html.indexOf(">Electricity</div>"), html.indexOf(">Gas</div>"));
const gasHtml = html.slice(html.indexOf(">Gas</div>"), html.indexOf(">Export</div>"));
check((overallGridHtml.match(/font-size:18px;font-weight:800;color:#7ee22d;text-shadow:0 0 14px #7ee22d55/g) || []).length === 2, "overall grid values should share one font format");
check((electricityHtml.match(/font-size:18px;font-weight:800;/g) || []).length === 2, "electricity values should share one font format");
check((gasHtml.match(/font-size:18px;font-weight:800;/g) || []).length === 2, "gas values should share one font format");
check(html.includes('stroke="#7ee22d"') && html.includes('stroke="#5bc0ff"') && html.includes('stroke="#ff5d70"'), "summary icons should use the specified colours");
check(html.includes('font-weight="800" fill="#ff5d70" stroke="none">£</text>'), "missing red pound glyph");
check(/<path[^>]*d="M [^"]* [LC] /.test(html), "missing flow path");
check(html.includes('pf-icon-glow'), "missing icon glow filter");
check(html.includes('pf-glow'), "missing glow filter");
check(html.includes('pf-arrow-pf-pv-inv'), "missing arrow marker");
check(html.includes('viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"'), "arrow marker should have a viewBox and a visible tip");
check(html.includes('M 0 0 L 10 5 L 0 10 L 2.5 5 Z'), "arrow marker should use a complete arrow shape");
check(!html.includes('markerWidth="3.5" markerHeight="3.5"'), "clipped arrow marker should be gone");
check(!html.includes('width="84" height="30" rx="15"'), "on-arrow power label should not be rendered");
check(html.includes('.pf-flow-active{stroke-dasharray:1 22;stroke-width:7!important') && html.includes('.pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:5;opacity:.34'), "flow links should use Energy Status style dashes");
check(!html.includes('stroke-width="14"'), "oversized link glow should be gone");
check(html.includes('d="M 600 274.5 L 600 344.5"'), "PV link should run from the halo edge to the smaller inverter ring");
check(html.includes('d="M 725.5 470 L 814 470"'), "inverter-to-home link should run from the ring to the halo edge");
check(html.includes('d="M 474.5 470 L 386 470"'), "grid link should run from the smaller inverter ring to the halo edge");
check(html.includes('d="M 600 695.5 L 600 595.5"'), "battery link should run from the halo edge to the smaller ring");
for (const [coords, dims, color] of [
  ['x="472.5" y="106.5"', 'width="255" height="164"', 'rgba(246,201,69,.10)'],
  ['x="127" y="377"', 'width="255" height="186"', 'rgba(91,192,255,.10)'],
  ['x="818" y="388"', 'width="255" height="164"', 'rgba(255,138,76,.10)'],
  ['x="472.5" y="699.5"', 'width="255" height="252"', 'rgba(126,226,45,.10)'],
]) {
  check(html.includes(`${coords} ${dims} rx="36" fill="none" stroke="${color}" stroke-width="8"`), `missing halo for ${color}`);
}
// Whole-card sizes: PV/Home 174x132, Grid 174x154, Inverter 248x220, Battery 223x220
check((html.match(/<foreignObject[^>]* width="174" height="132"/g) || []).length === 2, "PV and Home cards should be 174x132");
check((html.match(/<foreignObject[^>]* width="174" height="154"/g) || []).length === 1, "Grid card should be 174x154");
check((html.match(/<foreignObject[^>]* width="248" height="220"/g) || []).length === 1, "Inverter card should stay 248x220");
check((html.match(/<foreignObject[^>]* width="223" height="220"/g) || []).length === 1, "Battery card should be 223x220");
// Energy Status style dots: CSS dash stream, fixed spacing, config-driven speed
const flowPath = (markup, id) => (markup.match(new RegExp(`<path id="${id}"[^>]*>`)) || [''])[0];
check(flowPath(html, 'pf-grid-inv').includes('stroke-width="4"'), "flow paths should keep an explicit stroke width for idle links");
check(!html.includes('<animateMotion') && !html.includes('<mpath') && !html.includes('keyPoints='), "SVG ball animation should be gone");
check(!source.includes('const gap = 30;') && !source.includes('Math.abs(power) * 0.11'), "power-scaled ball logic should be gone");
check(html.includes('.pf-flow-active{stroke-dasharray:1 22;stroke-width:7!important;animation:pfFlowDash 3.00s linear infinite}'), "dot stream should use config-driven duration");
check(html.includes('filter id="pf-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="1081"'), "line glow filter should use a user-space region");
check(html.includes('.pf-flow-line{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;filter:url(#pf-line-glow)}') && html.includes('.pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:5;opacity:.34;filter:url(#pf-line-glow)}'), "flow paths should use the user-space glow filter");
check(!html.includes('stroke-dasharray:none;filter:url(#pf-glow)'), "straight links should not use the bounding-box glow filter");
check(html.includes('@keyframes pfFlowDash{to{stroke-dashoffset:-220}}'), "dot stream should use the fixed Energy Status offset formula");
check(html.includes('@media (max-width:640px){.pf-flow-active{stroke-dasharray:1 18;animation-name:pfFlowDashMobile}}'), "mobile dot variant should be present");
check(html.includes('class="pf-flow-line pf-flow-active"'), "active links should carry the scrolling-dot class");
check((html.match(/class="pf-flow-line-bg"/g) || []).length === 4, "each link should have a persistent background path");
check(flowPath(html, 'pf-grid-inv').includes('marker-end='), "active link should carry an arrowhead");

// Flow gaps after widening entity surrounds: 88.5 grid/home, 70 PV, 100 battery
const pathLength = (id) => {
  const m = flowPath(html, id).match(/d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/);
  return m ? Math.round(Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])) * 100) / 100 : NaN;
};
check(pathLength('pf-grid-inv') === 88.5, "grid-to-inverter gap should stop at the wider Grid surround");
check(pathLength('pf-pv-inv') === 70, "PV-to-inverter gap should be 80% of the old 87.5");
check(pathLength('pf-inv-home') === 88.5, "inverter-to-home gap should stop at the wider Home surround");
check(pathLength('pf-batt-inv') === 100, "inverter-to-battery gap should be 230% of the old 43.5");

// Speed setting drives duration/offset, not live power
const fastCard = new sandbox.PowerFlowCard();
fastCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' }, flow_animation_speed: 12 });
fastCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const fastHtml = fastCard.innerHTML;
check(fastHtml.includes('animation:pfFlowDash 1.50s linear infinite}') && fastHtml.includes('stroke-dashoffset:-110'), "flow_animation_speed should control dot speed");

// Direction: reversing power reverses both the arrowhead and the glow travel
const dirCard = new sandbox.PowerFlowCard();
dirCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
dirCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '-300' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const dirHtml = dirCard.innerHTML;
check(flowPath(dirHtml, 'pf-grid-inv').includes('d="M 386 470 L 474.5 470"') && flowPath(dirHtml, 'pf-grid-inv').includes('marker-end=') && flowPath(dirHtml, 'pf-grid-inv').includes('pf-flow-active'), "import should point from grid to inverter and scroll toward it");
check(flowPath(dirHtml, 'pf-batt-inv').includes('d="M 600 595.5 L 600 695.5"') && flowPath(dirHtml, 'pf-batt-inv').includes('marker-end=') && flowPath(dirHtml, 'pf-batt-inv').includes('pf-flow-active'), "charging should point from inverter to battery and scroll toward it");

// Idle: the link stays, but direction-dependent decorations disappear
const idleCard = new sandbox.PowerFlowCard();
idleCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
idleCard.hass = { states: { p: { state: '0' }, g: { state: '0' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const idleHtml = idleCard.innerHTML;
check(flowPath(idleHtml, 'pf-grid-inv').includes('d="M 386 470 L 474.5 470"'), "idle grid link should remain rendered");
check(flowPath(idleHtml, 'pf-batt-inv').includes('d="M 600 695.5 L 600 595.5"'), "idle battery link should remain rendered");
check(!idleHtml.includes('marker-end='), "idle links should have no arrowheads");
check(!idleHtml.includes('class="pf-flow-line pf-flow-active"'), "idle links should have no scrolling dots");
check((idleHtml.match(/class="pf-flow-line-bg"/g) || []).length === 4 && (idleHtml.match(/class="pf-flow-line"/g) || []).length === 4, "idle links should remain as plain background and line paths");

// Grid activation: any non-zero power is active; Grid is idle only at exactly 0
const gridCard = new sandbox.PowerFlowCard();
gridCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
const gridNodeHtml = (markup) => (markup.match(/<foreignObject[^>]* width="174" height="154"[\s\S]*?<\/foreignObject>/) || [''])[0];

gridCard.hass = { states: { p: { state: '0' }, g: { state: '0.5' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const tinyImportHtml = gridCard.innerHTML;
check(flowPath(tinyImportHtml, 'pf-grid-inv').includes('pf-flow-active') && flowPath(tinyImportHtml, 'pf-grid-inv').includes('marker-end='), "0.5 W import should animate the grid link with an arrowhead");
check(gridNodeHtml(tinyImportHtml).includes('border:1px solid #5bc0ff;'), "0.5 W import should activate the Grid node");
check(tinyImportHtml.includes('>Importing<'), "0.5 W import should label the Grid as importing");

gridCard.hass = { states: { p: { state: '0' }, g: { state: '-0.5' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const tinyExportHtml = gridCard.innerHTML;
check(flowPath(tinyExportHtml, 'pf-grid-inv').includes('d="M 474.5 470 L 386 470"') && flowPath(tinyExportHtml, 'pf-grid-inv').includes('pf-flow-active') && flowPath(tinyExportHtml, 'pf-grid-inv').includes('marker-end='), "0.5 W export should point to the grid and animate");
check(gridNodeHtml(tinyExportHtml).includes('border:1px solid #5bc0ff;'), "0.5 W export should activate the Grid node");
check(tinyExportHtml.includes('>Exporting<'), "0.5 W export should label the Grid as exporting");

gridCard.hass = { states: { p: { state: '0' }, g: { state: '0' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const zeroGridHtml = gridCard.innerHTML;
check(!flowPath(zeroGridHtml, 'pf-grid-inv').includes('pf-flow-active') && !flowPath(zeroGridHtml, 'pf-grid-inv').includes('marker-end='), "0 W grid should leave the link idle");
check(gridNodeHtml(zeroGridHtml).includes('border:1px solid rgba(148,173,189,.28);'), "0 W grid should leave the Grid node idle");
check(zeroGridHtml.slice(zeroGridHtml.indexOf('>Grid</div>'), zeroGridHtml.indexOf('>Grid</div>') + 400).includes('Idle'), "0 W grid chip should read Idle");

check(html.includes('r="121"') && html.includes('stroke-width="9"'), "inverter ring radius and stroke should be reduced by a further 20%");
check(!html.includes('r="151"') && !html.includes('stroke-width="11"'), "previous larger inverter ring should be gone");
check(html.includes('cx="600" cy="470" r="121"'), "inverter ring should stay centred on the inverter node");
check(html.includes('display:flex;flex-direction:column;gap:2px;align-items:center;'), "inverter Temperature and Status detail rows should be centred");
check(html.includes('display:flex;flex-direction:column;justify-content:center;width:248px'), "node content should be vertically centered");
check(html.includes('display:flex;justify-content:flex-start;gap:5px;font-size:12px;line-height:1.5;'), "detail rows should use a tight label/value gap");
check(!html.includes('justify-content:space-between;gap:10px;font-size:12px;line-height:1.5;'), "old wide-spaced detail rows should be gone");
check(!html.includes('>Frequency</span>'), "Grid Frequency detail row should be removed");
check(html.includes('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)'), "inverter image should be centred in its node and ring");

// Node images (light theme) and active glow
for (const key of ['solar-pv', 'grid', 'inverter', 'home', 'battery']) {
  check(html.includes(`src="/deye_energy/pf-${key}.png"`), `missing ${key} node image`);
  check(!html.includes(`src="/deye_energy/pf-${key}-dark.png"`), `${key} dark image should not be used in light theme`);
}
check(html.includes('width:64px;height:64px') && !html.includes('clip-path:'), "node images should be enlarged and shown in full");
check(html.includes('width:77%;height:100%;border-radius:999px;background:#7ee22d'), "77% SOC bar should be green at 77% width");
check(html.includes('position:absolute;left:8%;right:8%;bottom:8%;height:14%'), "SOC bar should sit at the bottom of the full image");
check(html.includes('drop-shadow(0 0 2px #') && html.includes('drop-shadow(0 0 5px #'), "active nodes should have a tight coloured glow");
check(!html.includes('drop-shadow(0 0 14px #'), "oversized glow should be gone");
check(!html.includes('animation:pfPulse') && !html.includes('box-shadow:0 0 12px #'), "pulsing ring should be gone");

check(html.includes('pf-node-click'), "missing clickable node class");
check(html.includes('data-entity="sensor.my_pv"'), "missing node entity data attribute");
check(html.toLowerCase().includes('click any node for details'), "missing click hint");
check(html.includes('Import today'), "missing grid import today detail");
check(html.includes('Export today'), "missing grid export today detail");
check(html.includes('Charged today'), "missing battery charged today detail");
check(html.includes('Discharged today'), "missing battery discharged today detail");
check(html.includes('Today'), "missing daily detail label");

// Clicks must be delegated once from the host; per-node listeners would dispatch twice
check(source.includes("e.target.closest('.pf-value-click[data-entity], .pf-node-click[data-entity], .pf-consumer-click[data-entity]')"), "delegated value click handler missing");
check(!source.includes("this.querySelectorAll('.pf-node-click[data-entity], .pf-consumer-click[data-entity]')"), "duplicate per-node click listener should be gone");

// Every rendered sensor value carries the entity whose more-info dialog it opens
check(html.includes('class="pf-value-click" data-entity="sensor.my_pv"'), "PV node value should open its own entity");
check(html.includes('class="pf-value-click" data-entity="sensor.my_soc"'), "SOC detail value should open its own entity");
check(html.includes('class="pf-value-click" data-entity="sensor.givenergy_ed2253g336_import_power"'), "summary grid import value should open its own entity");
check(html.includes('class="pf-value-click" data-entity="sensor.givenergy_ed2253g336_import_energy_today_kwh"'), "electricity import value should open its own entity");

// Nested value clicks win over the node fallback; blank node area still opens the node entity
const clickCard = new sandbox.PowerFlowCard();
clickCard.setConfig({ entities: {
  pv: "sensor.my_pv", grid: "sensor.my_grid", battery: "sensor.my_batt",
  battery_soc: "sensor.my_soc", load: "sensor.my_load", inverter: "sensor.my_inv",
} });
clickCard.hass = { states: {
  "sensor.my_pv": { state: "0" },
  "sensor.my_soc": { state: "77" },
} };
let nestedFired = null;
clickCard.dispatchEvent = (ev) => { nestedFired = ev; return true; };
clickCard._listeners.click[0]({ target: {
  closest(selector) {
    if (selector.includes(".pf-value-click")) return { getAttribute: () => "sensor.my_soc" };
    if (selector.includes(".pf-period")) return null;
    return null;
  },
} });
check(nestedFired && nestedFired.detail && nestedFired.detail.entityId === "sensor.my_soc", "nested value click should open the value entity");
let fallbackFired = null;
clickCard.dispatchEvent = (ev) => { fallbackFired = ev; return true; };
clickCard._listeners.click[0]({ target: {
  closest(selector) {
    if (selector.includes(".pf-value-click")) return { getAttribute: () => "sensor.my_pv" };
    if (selector.includes(".pf-period")) return null;
    return null;
  },
} });
check(fallbackFired && fallbackFired.detail && fallbackFired.detail.entityId === "sensor.my_pv", "node fallback should still open the node entity");

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
  check(darkHtml.includes(`src="/deye_energy/pf-${key}-dark.png"`), `missing ${key} dark node image`);
  check(!darkHtml.includes(`src="/deye_energy/pf-${key}.png"`), `${key} light image should not be used in dark theme`);
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

// Shared entity-map override: defaults -> override -> card config, plus extra
// chips and node detail rows.
const overrideCard = new sandbox.PowerFlowCard();
overrideCard.setConfig({ entities: { pv: "sensor.card_pv" } });
overrideCard.hass = { states: {
  "sensor.card_pv": { state: "8888" },
  "sensor.override_pv": { state: "1111" },
  "sensor.override_grid": { state: "-250" },
  "sensor.override_batt": { state: "0" },
  "sensor.override_soc": { state: "60" },
  "sensor.override_load": { state: "9000" },
  "sensor.override_inv": { state: "8600" },
  "sensor.extra_pv": { state: "123" },
  "sensor.extra_grid": { state: "50.5" },
  "sensor.water": { state: "7" },
  "sensor.extra_summary": { state: "42" },
  "sensor.deye_ai_state": {
    state: "ready",
    attributes: {
      power_flow_display: {
        schema_version: 1,
        entities: {
          pv: "sensor.override_pv",
          grid: "sensor.override_grid",
          battery: "sensor.override_batt",
          battery_soc: "sensor.override_soc",
          load: "sensor.override_load",
          inverter: "sensor.override_inv",
        },
        node_details: {
          pv: [{ label: "Extra PV", entity: "sensor.extra_pv", format: "w" }],
          grid: [{ label: "Extra Grid", entity: "sensor.extra_grid", format: "num" }],
          inverter: [{ label: "Extra Inverter", entity: "sensor.override_inv", format: "w" }],
          home: [{ label: "Extra Home", entity: "sensor.override_load", format: "w" }],
          battery: [{ label: "Extra Battery", entity: "sensor.override_soc", format: "pct" }],
        },
        chip_rows: {
          main: [{ label: "Water", entity: "sensor.water", format: "num" }],
          summary: [{
            label: "Extra group",
            items: [{ label: "Reading", entity: "sensor.extra_summary", format: "num", kind: "bolt", color: "#bc63ff" }],
          }],
        },
      },
    },
  },
} };
const overrideHtml = overrideCard.innerHTML;
check(overrideHtml.includes("8888 W"), "card config entity should win over the override for PV");
check(!overrideHtml.includes("1111 W"), "override PV entity should not replace card config");
check(overrideHtml.includes("250 W") || overrideHtml.includes("250 W"), "override grid entity should be used when card config omits it");
check(overrideHtml.includes(">Water</div>") && overrideHtml.includes('class="pf-value-click" data-entity="sensor.water"') && overrideHtml.includes(">7</span>"), "extra main chip should render with its live, clickable value");
check(overrideHtml.includes(">Extra group</div>") && overrideHtml.includes('class="pf-value-click" data-entity="sensor.extra_summary"') && overrideHtml.includes(">42</span>"), "extra summary chip group should render with its clickable value");
for (const [label, entity] of [
  ["Extra PV", "sensor.extra_pv"],
  ["Extra Grid", "sensor.extra_grid"],
  ["Extra Inverter", "sensor.override_inv"],
  ["Extra Home", "sensor.override_load"],
  ["Extra Battery", "sensor.override_soc"],
]) {
  check(overrideHtml.includes(label), `missing extra node detail row: ${label}`);
  check(overrideHtml.includes(`class="pf-value-click" data-entity="${entity}"`), `extra node detail row ${label} should open its own entity`);
}
check(overrideHtml.includes("123 W") && overrideHtml.includes("50.5") && overrideHtml.includes("60 %"), "extra node detail values should be formatted");

// Ordered node detail layout: built-ins can be removed/reordered and custom rows stay inline.
const layoutCard = new sandbox.PowerFlowCard();
layoutCard.setConfig({ entities: {
  pv: "sensor.pv2", grid: "sensor.grid2", battery: "sensor.batt2", battery_soc: "sensor.soc2",
  load: "sensor.load2", inverter: "sensor.inv2",
}});
layoutCard.hass = { states: {
  "sensor.pv2": { state: "1000" },
  "sensor.grid2": { state: "200" },
  "sensor.batt2": { state: "0" },
  "sensor.soc2": { state: "50" },
  "sensor.load2": { state: "1200" },
  "sensor.inv2": { state: "1000" },
  "sensor.temp2": { state: "33" },
  "sensor.deye_ai_state": { state: "ready", attributes: { power_flow_display: {
    schema_version: 1,
    entities: { inverter_temperature: "sensor.temp2" },
    node_detail_layout: {
      inverter: [
        { label: "Custom first", entity: "sensor.temp2", format: "num" },
        { builtin: "inv_status" },
      ],
      grid: [{ builtin: "grid_export" }, { builtin: "grid_import" }],
    },
  } } },
}};
const layoutHtml = layoutCard.innerHTML;
check(layoutHtml.includes("Custom first") && layoutHtml.includes('data-entity="sensor.temp2"'), "layout custom row should render in the real card");
const inverterRows = layoutCard._nodeDetailRows("inverter", {
  inv_temperature: () => "TEMP-ROW",
  inv_status: () => "STATUS-ROW",
}, ["inv_temperature", "inv_status"]);
check(inverterRows.length === 2 && inverterRows[0].includes("Custom first") && inverterRows[1] === "STATUS-ROW", "layout should preserve configured row order");
const gridRows = layoutCard._nodeDetailRows("grid", {
  grid_import: () => "IMPORT-ROW",
  grid_export: () => "EXPORT-ROW",
  grid_voltage: () => "VOLTAGE-ROW",
}, ["grid_import", "grid_export", "grid_voltage"]);
check(gridRows.length === 2 && gridRows[0] === "EXPORT-ROW" && gridRows[1] === "IMPORT-ROW", "layout should remove and reorder built-in rows");

check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("Power flow card tests passed");
