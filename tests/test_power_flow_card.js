const fs = require("fs");
const vm = require("vm");

const source = ["deye-energy-card.js","deye-energy-main-card.js","deye-energy-inverter-config-card.js","deye-energy-trigger-logs-card.js","deye-energy-graphs-card.js","deye-energy-power-flow-card.js"].map(f => loadDeyeCardSource(f)).join("\n");
const sandbox = {
  console,
  HTMLElement: class {
    constructor() { this._inner = ""; this._listeners = {}; }
    set innerHTML(v) { this._inner = v; }
    get innerHTML() { return this._inner; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { const list = this._listeners[type] || []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1); }
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach(fn => fn(ev)); return true; }
  },
  customElements: { _defs: {}, get(name) { return this._defs[name]; }, define(name, cls) { this._defs[name] = cls; } },
  setTimeout: () => 1,
  clearTimeout: () => {},
};
sandbox.window = sandbox;
sandbox.window.customCards = [];
vm.createContext(sandbox);
// Load entry module with imports resolved inline for VM testing
const entrySrc = loadDeyeCardSource("deye-energy-card.js");
const resolved = entrySrc.replace(/import \{ (\w+) \} from "\.\/(.*?)\?v=[^"]+";/g, (_, cls, file) => {
  return loadDeyeCardSource(file).replace(/^export class /m, "class ");
});
vm.runInContext(resolved + "\nthis.PowerFlowCard = DeyeEnergyPowerFlowCard;", sandbox);

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
check(!html.includes("pfFlowDash") && !html.includes("stroke-dasharray:1 22"), "CSS dash animation should be gone");
check(html.includes('class="pf-balls"') && html.includes('class="pf-ball-core"') && html.includes('class="pf-ball-halo"'), "missing discrete glow balls");
check(!html.includes("Missing/unavailable entities"), "should not warn when all entities present");
check(/viewBox="0 0 1200 \d+"/.test(html), "missing scaled viewBox for widened node surrounds");
check(html.includes('preserveAspectRatio="xMidYMin meet"'), "missing top-aligned responsive preserveAspectRatio");
check(/aspect-ratio:1200 \/ \d+/.test(html), "diagram frame should scale with the viewBox");
check(!html.includes('min-height:980px'), "diagram frame should not keep a fixed minimum height");
check(html.includes('height:100%'), "missing height scaling");
check(/<g transform="translate\([-\d.]+ [-\d.]+\) scale\([-\d.]+\)">/.test(html), "diagram content should be scaled/translated");
const outerGroup = (markup, needleRe) => {
  const m = markup.match(needleRe);
  if (!m) return '';
  const at = m.index;
  let depth = 0;
  for (let i = at; i < markup.length;) {
    const open = markup.indexOf('<g', i);
    const close = markup.indexOf('</g>', i);
    if (close < 0) break;
    if (open >= 0 && open < close) { depth += 1; i = open + 2; }
    else { depth -= 1; i = close + 4; if (depth === 0) return markup.slice(at, i); }
  }
  return '';
};
const pfContentGroup = outerGroup(html, /<g transform="translate\([-\d.]+ [-\d.]+\) scale\([-\d.]+\)">/);
check(
  /cx="600" cy="470" r="121"/.test(pfContentGroup)
    && /<foreignObject[^>]*width="174"/.test(pfContentGroup)
    && pfContentGroup.includes('<foreignObject'),
  "ring, halos and nodes should all share the same scale transform",
);
const pfSvg = (html.match(/<svg viewBox="0 0 1200 \d+"[\s\S]*?<\/svg>/) || [''])[0];
check(
  pfSvg.indexOf('fill="url(#pf-grid)"') > -1
    && pfSvg.indexOf('fill="url(#pf-grid)"') < pfSvg.indexOf('<g transform='),
  "grid background should remain outside the content transform",
);

// Summary widget row; the PV/Grid/Battery/Home chip row has been removed
for (const title of ["Overall grid", "Electricity", "Gas", "Export"]) {
  check(html.includes(`>${title}</div>`), `missing summary widget ${title}`);
}
check(html.includes('min-width:220px'), "summary chip widgets should remain");
check(!html.includes('min-width:130px'), "PV/Grid/Battery/Home chip row should be removed");
check(!html.includes('gap:10px;flex-wrap:wrap;margin-top:10px'), "second chip row container should be removed");
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
check(html.includes('data-flow-arrow="pf-pv-inv"') || html.includes('data-flow-arrows="pf-pv-inv"'), "missing arrow marker");
check(/data-flow-arrow="pf-pv-inv"[^>]*d="M [^"]+ L [^"]+ L [^"]+ L [^"]+ Z"/.test(html), "arrow should be an oriented chevron at flow end");
check(!html.includes('markerWidth="3.5" markerHeight="3.5"'), "clipped arrow marker should be gone");
check(!html.includes('width="84" height="30" rx="15"'), "on-arrow power label should not be rendered");
check(html.includes('.pf-flow-active{stroke-width:2!important}') && html.includes('.pf-balls{pointer-events:none}') && html.includes('.pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:2.5;opacity:.34'), "flow links should use discrete glow balls over a persistent background path");
check(!html.includes('stroke-width="14"'), "oversized link glow should be gone");
check(html.includes('d="M 600 274.5 L 600 344.5"'), "PV link should run from the halo edge to the smaller inverter ring");
check(html.includes('d="M 725.5 470 L 814 470"'), "inverter-to-home link should run from the ring to the halo edge");
check(html.includes('d="M 474.5 470 L 386 470"'), "grid link should run from the smaller inverter ring to the halo edge");
check(html.includes('d="M 600 695.5 L 600 595.5"'), "battery link should run from the halo edge to the smaller ring");
for (const [coords, dims, color] of [
  ['x="472.5" y="106.5"', 'width="255" height="164"', 'rgba(246,201,69,.10)'],
  ['x="127" y="377"', 'width="255" height="186"', 'rgba(91,192,255,.10)'],
  ['x="818" y="371.5"', 'width="255" height="197"', 'rgba(255,138,76,.10)'],
  ['x="472.5" y="699.5"', 'width="255" height="252"', 'rgba(126,226,45,.10)'],
]) {
  check(html.includes(`${coords} ${dims} rx="36" fill="none" stroke="${color}" stroke-width="8"`), `missing halo for ${color}`);
}
// Whole-card sizes: PV 174x132, Home 174x165, Grid 174x154, Inverter 248x220, Battery 223x220
check((html.match(/<foreignObject[^>]* width="174" height="132"/g) || []).length === 1, "PV card should be 174x132");
check((html.match(/<foreignObject[^>]* width="174" height="165"/g) || []).length === 1, "Home card should be 174x165");
check((html.match(/<foreignObject[^>]* width="174" height="154"/g) || []).length === 1, "Grid card should be 174x154");
check((html.match(/<foreignObject[^>]* width="248" height="220"/g) || []).length === 1, "Inverter card should stay 248x220");
check((html.match(/<foreignObject[^>]* width="223" height="220"/g) || []).length === 1, "Battery card should be 223x220");
// Entity cards start at Battery's 16 px inset from the left edge of their surround
check(html.includes('<foreignObject x="488.5" y="122.5" width="174" height="132"'), "PV card should start at Battery's left inset");
check(html.includes('<foreignObject x="143" y="393" width="174" height="154"'), "Grid card should start at Battery's left inset");
check(html.includes('<foreignObject x="834" y="387.5" width="174" height="165"'), "Home card should start at Battery's left inset");
check(html.includes('<foreignObject x="488.5" y="715.5" width="223" height="220"'), "Battery card should keep its left inset");
// Discrete glow balls: persistent phase, fixed spacing and power-scaled speed
const flowPath = (markup, id) => (markup.match(new RegExp(`<path id="${id}"[^>]*>`)) || [''])[0];
const flowDuration = (markup, id) => {
  const m = flowPath(markup, id).match(/data-flow-duration="([\d.]+)"/);
  return m ? Number(m[1]) : NaN;
};
check(flowPath(html, 'pf-grid-inv').includes('stroke-width="2"'), "flow paths should keep an explicit stroke width for idle links");
check(!html.includes('<animateMotion') && !html.includes('<mpath') && !html.includes('keyPoints='), "SMIL ball animation should not return");
check(!html.includes('pfFlowDash') && !html.includes('stroke-dasharray:1 22') && !html.includes('animation:pfFlow'), "CSS dash animation should be gone");
check(source.includes('targetGap = 60') && source.includes('geometry.length / state.count') && source.includes('watts / 5000'), "power-scaled ball logic should be present");
check(!source.includes('Math.abs(power) * 0.11'), "old linear power speed should stay gone");
check(html.includes('r="7.2"') && html.includes('r="4.2"') && html.includes('filter="url(#pf-glow)"'), "glow balls should keep a halo and a filtered core");
check(html.includes('data-flow-balls="pf-grid-inv"'), "each active link should group its glow balls");
check(flowPath(html, 'pf-grid-inv').includes('data-flow-direction="-1"'), "export direction should be recorded on the flow path");
check(/filter id="pf-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="\d+"/.test(html), "line glow filter should use a user-space region");
check(html.includes('.pf-flow-line{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;filter:url(#pf-line-glow)}') && html.includes('.pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:2.5;opacity:.34;filter:url(#pf-line-glow)}'), "flow paths should use the user-space glow filter");
check(!html.includes('stroke-dasharray:none;filter:url(#pf-glow)'), "straight links should not use the bounding-box glow filter");
check(html.includes('class="pf-flow-line pf-flow-active"'), "active links should carry the active-flow class");
check((html.match(/class="pf-flow-line-bg"/g) || []).length === 4, "each link should have a persistent background path");
check(html.includes('data-flow-arrows="pf-grid-inv"'), "active link should carry an arrowhead");
check(flowDuration(html, 'pf-pv-inv') < flowDuration(html, 'pf-inv-home') && flowDuration(html, 'pf-inv-home') < flowDuration(html, 'pf-grid-inv') && flowDuration(html, 'pf-grid-inv') < flowDuration(html, 'pf-batt-inv'), "ball speed should scale with each link's watts");

// Flow gaps after widening entity surrounds: 88.5 grid/home, 70 PV, 100 battery
const pathLength = (id) => {
  const m = flowPath(html, id).match(/d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/);
  return m ? Math.round(Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])) * 100) / 100 : NaN;
};
check(pathLength('pf-grid-inv') === 88.5, "grid-to-inverter gap should stop at the wider Grid surround");
check(pathLength('pf-pv-inv') === 70, "PV-to-inverter gap should be 80% of the old 87.5");
check(pathLength('pf-inv-home') === 88.5, "inverter-to-home gap should stop at the wider Home surround");
check(pathLength('pf-batt-inv') === 100, "inverter-to-battery gap should be 230% of the old 43.5");

// Speed setting sets the base duration; each link scales it from its watts
const fastCard = new sandbox.PowerFlowCard();
fastCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' }, flow_animation_speed: 12 });
fastCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const fastHtml = fastCard.innerHTML;
check(card._flowDuration(0) === 8 && card._flowDuration(2500) === 4.4 && card._flowDuration(5000) === 0.8 && card._flowDuration(8000) === 0.8, "default speed should scale ball duration from link watts over 0-5000W");
check(fastCard._flowDuration(1000) === card._flowDuration(1000), "flow_animation_speed should not change physical ball speed");
check(flowDuration(fastHtml, 'pf-grid-inv') === card._flowDuration(400) && !fastHtml.includes('pfFlowDash'), "data-flow-duration should reflect physical ball speed");

// Direction: reversing power reverses both the arrowhead and the glow travel
const dirCard = new sandbox.PowerFlowCard();
dirCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
dirCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '-300' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const dirHtml = dirCard.innerHTML;
check(flowPath(dirHtml, 'pf-grid-inv').includes('d="M 386 470 L 474.5 470"') && dirHtml.includes('data-flow-arrows="pf-grid-inv"') && flowPath(dirHtml, 'pf-grid-inv').includes('pf-flow-active') && flowPath(dirHtml, 'pf-grid-inv').includes('data-flow-direction="1"'), "import should point from grid to inverter and move toward it");
check(flowPath(dirHtml, 'pf-batt-inv').includes('d="M 600 595.5 L 600 695.5"') && dirHtml.includes('data-flow-arrows="pf-batt-inv"') && flowPath(dirHtml, 'pf-batt-inv').includes('pf-flow-active') && flowPath(dirHtml, 'pf-batt-inv').includes('data-flow-direction="-1"'), "charging should point from inverter to battery and move toward it");
check(dirHtml.includes('data-flow-balls="pf-grid-inv"') && dirHtml.includes('data-flow-balls="pf-batt-inv"'), "active links should carry discrete glow balls");

// Reversal: phase is preserved, old/new arrowheads cross-fade, glow dims then returns
const revCard = new sandbox.PowerFlowCard();
revCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
revCard.hass = { states: { p: { state: '0' }, g: { state: '-400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const revState = revCard._flowMotion.get('pf-grid-inv');
revState.phase = 20;
revCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const revHtml = revCard.innerHTML;
const revGridPath = flowPath(revHtml, 'pf-grid-inv');
check(revGridPath.includes('d="M 386 470 L 474.5 470"') && revGridPath.includes('data-flow-direction="1"'), "reversal should repoint the path and arrowhead");
check(revHtml.includes('data-flow-arrow="pf-grid-inv-old"') && revHtml.includes('data-flow-arrow="pf-grid-inv"'), "reversal should show both the old and new arrowheads");
check(revState.phase >= 68 && revState.phase <= 69, "reversal should preserve ball positions while it fades");
revState.transitionStart = revCard._flowNow() - 720;
const midHtml = revCard._flow('pf-grid-inv', 'M 386 470 L 474.5 470', '#5bc0ff', 400, 1);
const midNewArrow = (midHtml.match(/data-flow-arrow="pf-grid-inv"[^>]*opacity="([^"]+)"/) || ['', '1'])[1];
const midOldArrow = (midHtml.match(/data-flow-arrow="pf-grid-inv-old"[^>]*opacity="([^"]+)"/) || ['', '0'])[1];
check(parseFloat(midNewArrow) > 0.2, "new arrow should be fading in at mid transition");
check(parseFloat(midOldArrow) < 0.8, "old arrow should be fading out at mid transition");
check(midHtml.includes('opacity="0.1"') && midHtml.includes('opacity="0.01"'), "mid reversal should dim glow balls while arrowheads cross-fade");
revState.transitionStart = revCard._flowNow() - 1400;
const lateHtml = revCard._flow('pf-grid-inv', 'M 386 470 L 474.5 470', '#5bc0ff', 400, 1);
check(lateHtml.includes('opacity="0.98"') && lateHtml.includes('opacity="0.14"'), "late reversal should restore glow before movement resumes");
revState.transitionStart = revCard._flowNow() - 1700;
const doneHtml = revCard._flow('pf-grid-inv', 'M 386 470 L 474.5 470', '#5bc0ff', 400, 1);
check(!doneHtml.includes('data-flow-arrow="pf-grid-inv-old"') && doneHtml.includes('data-flow-direction="1"'), "completed reversal should leave only the new arrowhead");

// Persistent phase: a sensor update re-renders the SVG without restarting the balls
const persistCard = new sandbox.PowerFlowCard();
persistCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
persistCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const persistState = persistCard._flowMotion.get('pf-grid-inv');
persistState.phase = 20;
const pointBefore = persistCard._ballPoint(persistState, 0);
persistCard.hass = { states: { p: { state: '0' }, g: { state: '450' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const pointAfter = persistCard._ballPoint(persistState, 0);
check(persistCard._flowMotion.get('pf-grid-inv') === persistState && persistState.phase === 20, "re-render should keep the same flow state and phase");
check(pointBefore.x === pointAfter.x && pointBefore.y === pointAfter.y, "re-render should not snap the glow balls back to the start");

// One rAF ticker advances the persistent phases and moves both circles of each ball
sandbox.requestAnimationFrame = (fn) => { sandbox.__flowRaf = fn; sandbox.__rafCalls = (sandbox.__rafCalls || 0) + 1; return 41; };
sandbox.cancelAnimationFrame = () => {};
const animCard = new sandbox.PowerFlowCard();
animCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
animCard.hass = { states: { p: { state: '0' }, g: { state: '400' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const phaseBefore = animCard._flowMotion.get('pf-grid-inv').phase;
const lineAttrs = [], arrowAttrs = [], haloAttrs = [], coreAttrs = [];
const fakeEl = (attrs) => ({ setAttribute: (key, value) => attrs.push([key, value]) });
const haloEl = fakeEl(haloAttrs), coreEl = fakeEl(coreAttrs);
const ballsNode = { querySelectorAll: (selector) => selector === '.pf-ball-halo' ? [haloEl] : [coreEl] };
animCard.querySelector = (selector) => {
  if (selector === '#pf-grid-inv') return fakeEl(lineAttrs);
  if (selector === '[data-flow-arrows="pf-grid-inv"]') return { querySelector: (sel) => sel === '[data-flow-arrow="pf-grid-inv"]' ? fakeEl(arrowAttrs) : null };
  if (selector === '#pf-arrow-pf-grid-inv path') return fakeEl(arrowAttrs);
  if (selector === '[data-flow-balls="pf-grid-inv"]') return ballsNode;
  return null;
};
animCard.querySelectorAll = () => [];
animCard._bindFlowAnimation();
animCard._flowLastTs = animCard._flowNow() - 100;
sandbox.__flowRaf();
const expectedPhase = Number(((phaseBefore + 88.5 * 0.1 / animCard._flowDuration(400)) % 88.5).toFixed(2));
check(Math.abs(animCard._flowMotion.get('pf-grid-inv').phase - expectedPhase) < 0.01, "rAF ticker should advance the ball phase smoothly");
check(coreAttrs.some(([key]) => key === 'cx') && haloAttrs.some(([key]) => key === 'cy'), "rAF ticker should move both halo and core circles");
check(coreAttrs.some(([key, value]) => key === 'opacity' && value === 0.98), "rAF ticker should maintain glow intensity");
check(typeof sandbox.__flowRaf === 'function', "rAF ticker should reschedule while a link is active");
animCard.disconnectedCallback();

// Lifecycle: removing and reinserting the host restores delegated clicks
const lifecycleCard = new sandbox.PowerFlowCard();
check(lifecycleCard._listeners.click.length === 1, "constructor should install one delegated click listener");
lifecycleCard.disconnectedCallback();
check(lifecycleCard._listeners.click.length === 0 && lifecycleCard._clickHandler === null, "disconnect should remove the click listener");
lifecycleCard.connectedCallback();
check(lifecycleCard._listeners.click.length === 1, "reconnect should restore the click listener");
lifecycleCard.connectedCallback();
check(lifecycleCard._listeners.click.length === 1, "reconnect should be idempotent");
lifecycleCard._maybeFetchStats = () => {};
lifecycleCard._render = () => {};
const periodTarget = { closest: (selector) => selector.includes('.pf-period') ? { getAttribute: () => 'today' } : null };
lifecycleCard.dispatchEvent({ type: 'click', target: periodTarget });
check(lifecycleCard._period === 'today', "reconnected delegated click should change the period again");
lifecycleCard.disconnectedCallback();

// Lifecycle: a detached card must not start or reschedule the rAF ticker
const detachedCard = new sandbox.PowerFlowCard();
detachedCard.isConnected = false;
detachedCard._flowMotion.set('pf-grid-inv', { active: true, duration: 1, geometry: { length: 10 }, phase: 0 });
sandbox.__rafCalls = 0;
detachedCard._startFlowAnimation();
check(detachedCard._flowRaf === null && sandbox.__rafCalls === 0, "detached card should not start a rAF ticker");
const reschedCard = new sandbox.PowerFlowCard();
reschedCard.isConnected = true;
reschedCard._flowMotion.set('pf-grid-inv', { active: true, duration: 1, geometry: { length: 10 }, phase: 0 });
reschedCard._startFlowAnimation();
check(typeof sandbox.__flowRaf === 'function' && sandbox.__rafCalls === 1, "connected card should start one rAF ticker");
reschedCard.isConnected = false;
sandbox.__flowRaf();
check(reschedCard._flowRaf === null && sandbox.__rafCalls === 1, "detached card should not reschedule the rAF ticker");

// Idle: the link stays, but direction-dependent decorations disappear
const idleCard = new sandbox.PowerFlowCard();
idleCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
idleCard.hass = { states: { p: { state: '0' }, g: { state: '0' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const idleHtml = idleCard.innerHTML;
check(flowPath(idleHtml, 'pf-grid-inv').includes('d="M 386 470 L 474.5 470"'), "idle grid link should remain rendered");
check(flowPath(idleHtml, 'pf-batt-inv').includes('d="M 600 695.5 L 600 595.5"'), "idle battery link should remain rendered");
check(!idleHtml.includes('data-flow-arrows="pf-grid-inv"'), "idle links should have no arrowheads");
check(!idleHtml.includes('class="pf-flow-line pf-flow-active"') && !idleHtml.includes('data-flow-balls=') && !idleHtml.includes('pf-ball-core'), "idle links should have no glow balls");
check((idleHtml.match(/class="pf-flow-line-bg"/g) || []).length === 4 && (idleHtml.match(/class="pf-flow-line"/g) || []).length === 4, "idle links should remain as plain background and line paths");

// Grid activation: any non-zero power is active; Grid is idle only at exactly 0
const gridCard = new sandbox.PowerFlowCard();
gridCard.setConfig({ entities: { pv: 'p', grid: 'g', battery: 'b', battery_soc: 's', load: 'l', inverter: 'i' } });
const gridNodeHtml = (markup) => (markup.match(/<foreignObject[^>]* width="174" height="154"[\s\S]*?<\/foreignObject>/) || [''])[0];

gridCard.hass = { states: { p: { state: '0' }, g: { state: '0.5' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const tinyImportHtml = gridCard.innerHTML;
check(flowPath(tinyImportHtml, 'pf-grid-inv').includes('pf-flow-active') && tinyImportHtml.includes('data-flow-arrows="pf-grid-inv"'), "0.5 W import should animate the grid link with an arrowhead");
check(gridNodeHtml(tinyImportHtml).includes('border:1px solid #5bc0ff;'), "0.5 W import should activate the Grid node");
check(tinyImportHtml.includes('>Importing<'), "0.5 W import should label the Grid as importing");

gridCard.hass = { states: { p: { state: '0' }, g: { state: '-0.5' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const tinyExportHtml = gridCard.innerHTML;
check(flowPath(tinyExportHtml, 'pf-grid-inv').includes('d="M 474.5 470 L 386 470"') && flowPath(tinyExportHtml, 'pf-grid-inv').includes('pf-flow-active') && tinyExportHtml.includes('data-flow-arrows="pf-grid-inv"'), "0.5 W export should point to the grid and animate");
check(gridNodeHtml(tinyExportHtml).includes('border:1px solid #5bc0ff;'), "0.5 W export should activate the Grid node");
check(tinyExportHtml.includes('>Exporting<'), "0.5 W export should label the Grid as exporting");

gridCard.hass = { states: { p: { state: '0' }, g: { state: '0' }, b: { state: '0' }, s: { state: '50' }, l: { state: '0' }, i: { state: '0' } } };
const zeroGridHtml = gridCard.innerHTML;
check(!flowPath(zeroGridHtml, 'pf-grid-inv').includes('pf-flow-active') && !zeroGridHtml.includes('data-flow-arrows="pf-grid-inv"'), "0 W grid should leave the link idle");
check(gridNodeHtml(zeroGridHtml).includes('border:1px solid rgba(148,173,189,.28);'), "0 W grid should leave the Grid node idle");
check(zeroGridHtml.slice(zeroGridHtml.indexOf('>Grid</div>'), zeroGridHtml.indexOf('>Grid</div>') + 400).includes('Idle'), "0 W Grid node should read Idle");

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
check(!html.toLowerCase().includes('click any node for details'), "header subtitle should be removed");
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
  view: { energy_periods: ["power", "today"] },
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
check(!h2.includes('data-period="24h"'), "24h period should be removed");
check(!h2.includes('data-period="week"'), "week period should be removed");
check(!h2.includes('data-period="month"'), "month period should be removed");
const periodAt = h2.indexOf('class="pf-period"');
const frameAt = h2.indexOf('class="pf-diagram" style="width:100%;aspect-ratio:1200 /');
const frameEndAt = h2.indexOf('</div>', h2.indexOf('</svg>', frameAt));
check(periodAt > h2.indexOf('min-width:220px'), "period selector should render below the summary chips");
check(periodAt > frameAt && periodAt < frameEndAt, "period selector should render inside the power flow display outline");
check(h2.includes('position:absolute;top:12px;right:12px;justify-content:flex-end;z-index:2;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px);'), "period selector should be pinned to the top-right of the display");
check(!h2.includes('gap:6px;flex-wrap:wrap;margin-top:10px'), "period selector should not be a separate row outside the display");
const lrPeriodCard = new sandbox.PowerFlowCard();
lrPeriodCard.setConfig({ entities: { pv:'sensor.pv', grid:'sensor.grid', battery:'sensor.batt', battery_soc:'sensor.soc', load:'sensor.load', inverter:'sensor.inv' } });
lrPeriodCard.hass = { states: {
  "sensor.pv": { state: "1000" }, "sensor.grid": { state: "200" }, "sensor.batt": { state: "0" },
  "sensor.soc": { state: "50" }, "sensor.load": { state: "1200" }, "sensor.inv": { state: "1000" },
  "sensor.ac": { state: "500" }, "sensor.uni": { state: "50" },
  "sensor.garage_deye_energy_ai_state": { state: "ready", attributes: { power_flow_display: { layout: "left_right", entities: {} } } },
} };
const lrPeriodHtml = lrPeriodCard.innerHTML;
check(lrPeriodHtml.includes('position:absolute;top:12px;left:50%;transform:translateX(-50%);justify-content:center;z-index:2;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px);'), "left_right layout should center period selector");
// On narrow screens the pills flow above the SVG inside the same frame, so they cannot cover PV
check(/class="pf-diagram" style="width:100%;aspect-ratio:1200 \/ \d+/.test(h2), "diagram frame should carry the mobile layout class");
check(h2.includes('class="pf-periods" style="position:absolute;top:12px;right:12px'), "period selector should carry the mobile layout class");
check(h2.indexOf('class="pf-periods"') < h2.indexOf('<svg viewBox="0 0 1200 '), "period selector should precede the SVG so it can flow above it on mobile");
check(h2.includes('.pf-periods{position:static!important;') && h2.includes('.pf-diagram{aspect-ratio:auto!important}') && /\.pf-diagram svg\{height:auto!important;aspect-ratio:1200 \/ \d+\}/.test(h2), "mobile rules should flow the period selector above the SVG inside the frame");
check(h2.includes("pf-consumer-click"), "missing consumer click class");
check(card2._period === "power", "default period should be power");
card2._period = "today"; card2._render();
check(!card2.innerHTML.includes("Energy period view"), "period header subtitle should be removed");

// Today/energy periods: PV, Grid and Home must keep the kWh unit on the value's row
const kwhCard = new sandbox.PowerFlowCard();
kwhCard.setConfig({
  view: { energy_periods: ["power", "today"] },
  entities: {
    pv: "sensor.kwh_pv", grid: "sensor.kwh_grid", battery: "sensor.kwh_batt", battery_soc: "sensor.kwh_soc",
    load: "sensor.kwh_load", inverter: "sensor.kwh_inv",
    pv_energy: "sensor.kwh_pv_energy", grid_import_energy: "sensor.kwh_grid_import",
    grid_export_energy: "sensor.kwh_grid_export", load_energy: "sensor.kwh_load_energy",
  },
});
kwhCard.hass = { states: {
  "sensor.kwh_pv": { state: "0" }, "sensor.kwh_grid": { state: "0" }, "sensor.kwh_batt": { state: "0" },
  "sensor.kwh_soc": { state: "50" }, "sensor.kwh_load": { state: "0" }, "sensor.kwh_inv": { state: "0" },
  "sensor.kwh_pv_energy": { state: "12.34" }, "sensor.kwh_grid_import": { state: "5.67" },
  "sensor.kwh_grid_export": { state: "1.23" }, "sensor.kwh_load_energy": { state: "9.87" },
} };
kwhCard._period = "today"; kwhCard._render();
const kwhHtml = kwhCard.innerHTML;
for (const [title, text] of [["PV", "12.34 kWh"], ["Grid", "5.67 kWh in"], ["Home", "9.87 kWh"]]) {
  const at = kwhHtml.indexOf(`>${title}</div>`);
  const segment = kwhHtml.slice(at, at + 500);
  const valueDiv = (segment.match(/<div style="font-size:26px[^>]*>[\s\S]*?<\/div>/) || [''])[0];
  check(valueDiv.includes(text), `${title} node should render the full ${text} value`);
  check(valueDiv.includes('white-space:nowrap;'), `${title} node value should keep kWh on the same row`);
}

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

// Shared entity-map override: defaults -> override -> card config, plus summary
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
          // Legacy main row retained in the fixture to prove it is ignored.
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
check(!overrideHtml.includes(">Water</div>") && !overrideHtml.includes('data-entity="sensor.water"'), "legacy main chip row should be ignored");
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

// Node heights follow the number of rendered detail rows below the divider.
const detailRows = (prefix, count) => Array.from({ length: count }, (_, i) => ({ label: `${prefix} ${i + 1}`, entity: "sensor.row", format: "num" }));
const dynamicHeightHtml = (layout) => {
  const c = new sandbox.PowerFlowCard();
  c.setConfig({ entities: {
    pv: "sensor.pv3", grid: "sensor.grid3", battery: "sensor.batt3", battery_soc: "sensor.soc3",
    load: "sensor.load3", inverter: "sensor.inv3",
  } });
  c.hass = { states: {
    "sensor.pv3": { state: "0" },
    "sensor.grid3": { state: "0" },
    "sensor.batt3": { state: "0" },
    "sensor.soc3": { state: "50" },
    "sensor.load3": { state: "0" },
    "sensor.inv3": { state: "0" },
    "sensor.deye_ai_state": { state: "ready", attributes: { power_flow_display: {
      schema_version: 1,
      node_detail_layout: layout,
    } } },
  } };
  return c.innerHTML;
};
const grownHtml = dynamicHeightHtml({
  pv: detailRows("PV", 3),
  grid: detailRows("Grid", 5),
  home: detailRows("Home", 4),
  battery: detailRows("Battery", 8),
});
check(grownHtml.includes("PV 3") && grownHtml.includes("Battery 8"), "extra detail rows should render");
for (const [x, y, w, h, label] of [
  ["488.5", "102.5", 174, 172, "PV"],
  ["143", "373", 174, 194, "Grid"],
  ["834", "367.5", 174, 205, "Home"],
  ["488.5", "695.5", 223, 260, "Battery"],
]) {
  check(grownHtml.includes(`<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"`), `grown ${label} card should be ${w}x${h}`);
}
for (const [coords, dims, color] of [
  ['x="472.5" y="86.5"', 'width="255" height="204"', 'rgba(246,201,69,.10)'],
  ['x="127" y="357"', 'width="255" height="226"', 'rgba(91,192,255,.10)'],
  ['x="818" y="351.5"', 'width="255" height="237"', 'rgba(255,138,76,.10)'],
  ['x="472.5" y="679.5"', 'width="255" height="292"', 'rgba(126,226,45,.10)'],
]) {
  check(grownHtml.includes(`${coords} ${dims} rx="36" fill="none" stroke="${color}" stroke-width="8"`), `grown halo should follow ${color}`);
}
check(/viewBox="0 0 1200 \d+"/.test(grownHtml) && /aspect-ratio:1200 \/ \d+/.test(grownHtml), "grown detail rows should expand the SVG viewBox");
check(/filter id="pf-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="\d+"/.test(grownHtml), "grown detail rows should expand the glow filter");
check((grownHtml.match(/<foreignObject[^>]* width="248" height="220"/g) || []).length === 1, "inverter card should keep its fixed height");

const shrunkHtml = dynamicHeightHtml({ pv: [], grid: [], home: [], battery: [] });

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

for (const [x, y, w, h, label] of [
  ["488.5", "132.5", 174, 112, "PV"],
  ["143", "422", 174, 96, "Grid"],
  ["834", "407.5", 174, 125, "Home"],
  ["488.5", "775.5", 223, 100, "Battery"],
]) {
  check(shrunkHtml.includes(`<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"`), `empty ${label} detail layout should shrink the card to ${w}x${h}`);
}
check(/viewBox="0 0 1200 \d+"/.test(shrunkHtml), "empty detail layouts should shrink the SVG viewBox");
check((shrunkHtml.match(/<foreignObject[^>]* width="248" height="220"/g) || []).length === 1, "inverter card should still keep its fixed height");

check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(source), "resource revision header missing/invalid");
console.log("Power flow card tests passed");