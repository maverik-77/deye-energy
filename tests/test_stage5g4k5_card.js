const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = loadDeyeCardClass("DeyeEnergyCard");
const sandbox = {
  console,
  HTMLElement: class {},
  customElements: { _defs:{}, get(n){return this._defs[n];}, define(n,c){this._defs[n]=c;} },
  setTimeout,
  clearTimeout,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const card = new sandbox.Card();

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

// Issue #2: static layout contract at the required representative widths.
for (const mode of ["auto", "full"]) {
  card.config = {
    layout: {
      layout_mode: mode,
      dashboard_width: 1280,
      allow_horizontal_scroll: false,
    },
  };
  for (const width of [390, 768, 1024, 1366, 1700]) {
    sandbox.innerWidth = width;
    card.clientWidth = width;
    const layout = card.effectiveLayout();
    check(layout.is_mobile === (width <= 768), `${mode} width ${width}: mobile breakpoint contract`);
    check(layout.dashboard_width === 1280, `${mode} width ${width}: desktop width must remain configured`);
    check(layout.allow_horizontal_scroll === false, `${mode} width ${width}: global horizontal scroll must stay disabled`);
    if (width <= 768 || mode === "full") {
      check(layout.fit_to_width === true, `${mode} width ${width}: card must fit available width`);
    }
  }
}

// Issue #9: unavailable values are missing, while valid zero/scientific values survive.
for (const value of [null, undefined, "", "   ", "unknown", "unavailable", "none", "null", "nan", "inf", "-inf", "+", "-"]) {
  check(card.asNumber(value) === null, `${String(value)} must remain missing, not zero`);
}

check(card.asNumber(0) === 0, "numeric zero must remain a real zero");
check(card.asNumber("0") === 0, "string zero must remain a real zero");
check(card.asNumber("1.5e-3") === 0.0015, "scientific notation must be preserved");
check(card.asNumber("-2E+2 W") === -200, "signed scientific notation with a unit must work");
check(card.asNumber("1,25 kW") === 1.25, "decimal comma with a unit must work");
check(card.asNumber("12 / 24") === null, "multiple numeric fragments must be rejected");
check(card.formatNumber("unknown", 1) === "missing", "unknown must be displayed as missing");
check(card.formatNumber("unavailable", 1) === "missing", "unavailable must be displayed as missing");
check(card.formatNumber(0, 1) === "0.0", "a real zero must still be displayed as zero");
check(/^\/\/ Resource revision: v=\d+\.\d+\.\d+(\.\d+)?\n/.test(fs.readFileSync(path.join(__dirname,"..","custom_components","deye_energy","www","deye-energy-main-card.js"),"utf8")), "resource revision header missing/invalid");
check(!source.includes("deye_inverter_time_of_use_"), "card must not hardcode the legacy TOU prefix");

console.log("Stage 5G.4K.5 card parser checks passed");