const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(
  "custom_components/deye_energy/www/deye-energy-card.js",
  "utf8",
);
const sandbox = {
  console,
  HTMLElement: class {},
  customElements: { define() {} },
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
card.setConfig({});
card._hass = { states: {}, config: { time_zone: "Europe/Warsaw" } };

const required = {
  higher_priority_profile_reserve: "Energy preserved for a higher-priority profile",
  "material_live_input_changed:battery_power": "Recalculated after a significant battery power change",
  pv_only_profile: "The profile allows PV-only charging",
  pv_curtailed_by_export_or_inverter_limit: "PV production limited by export or inverter limit",
  price_filter_or_no_qualified_hours: "No hours meet the price conditions",
  core_budget_exceeded: "Core calculation budget exceeded",
  price_mapping_cache_invalidated: "Recalculated after a price mapping change",
  core_blocked_missing_soc: "No reliable SOC data",
  missing_prices: "No complete price data",
  no_profitable_hours: "No profitable hours",
};

for (const [code, expected] of Object.entries(required)) {
  const actual = card.aiUiText(code);
  check(actual === expected, `${code} must map to the required label`);
  check(!actual.includes(code), `${code} must not leak as its user-facing label`);
}

const materialFields = {
  soc: "SOC",
  price_today: "today's prices",
  price_tomorrow: "tomorrow's prices",
  solcast: "Solcast",
  pv: "PV production",
  load: "house consumption",
  grid: "grid flow",
  battery_power: "battery power",
  soc_health: "reliability",
  soc_freshness: "freshness",
  weather: "weather",
};
for (const [field, expectedPart] of Object.entries(materialFields)) {
  const code = `material_live_input_changed:${field}`;
  const actual = card.aiUiText(code);
  check(actual.includes(expectedPart), `${code} must identify the real input in English`);
  check(!actual.includes("material_live_input_changed"), `${code} must hide the internal prefix`);
}

check(
  card.aiUiText("material_live_input_changed:unknown_sensor")
    === "Recalculated after a significant input data change",
  "unknown material input must use the safe prefix fallback",
);
check(
  card.aiUiText("some_future_internal_reason") === "A plan constraint occurred",
  "unknown internal reason must use a neutral fallback",
);
check(
  card.aiUiText("higher_priority_profile_reserve / pv_only_profile")
    === "Energy preserved for a higher-priority profile / The profile allows PV-only charging",
  "compound limit reasons must map every component",
);

const existing = {
  grid_import_limit: "grid import limit",
  higher_value_slot_reserved: "energy preserved for a more expensive hour of this profile",
  current_voltage_battery_limit: "battery power resulting from current and voltage",
  battery_discharge_limit: "maximum battery discharge power",
};
for (const [code, expected] of Object.entries(existing)) {
  check(card.aiUiText(code) === expected, `${code} regression`);
  check(card.aiUiText(`limit:${code}`).toLowerCase().includes(expected), `limit:${code} regression`);
}

const evidence = "Candidates are available for preview; the profile does not have enough evidence yet.";
check(
  card.aiUiText(evidence)
    === "Candidates are available for preview; the profile does not have enough historical data yet.",
  "mixed Polish/English evidence sentence must be fully English",
);

const socFreshnessSources = {
  own_soc_report: "Direct SOC source report",
  sibling_health: "SOC source state confirmed by a related entity",
  "sibling_health:sensor.deye_battery_voltage": "SOC source state confirmed by a related entity",
  event_observed_at: "SOC change observed by Home Assistant",
  last_updated_fallback: "Last update time of the SOC entity",
  compatibility_fallback: "Fallback SOC freshness assessment",
  no_fresh_source_health: "No fresh SOC source confirmation",
};
for (const [code, expected] of Object.entries(socFreshnessSources)) {
  check(card.aiUiText(code) === expected, `${code} SOC freshness source must be user-facing English`);
}

const [executionStatus] = card.aiExecutionStatus({
  proposal_status: "blocked",
  deployment_reason: "higher_priority_profile_reserve",
});
check(executionStatus.includes(required.higher_priority_profile_reserve), "Plan and execution must use the mapper");
check(!executionStatus.includes("higher_priority_profile_reserve"), "Plan and execution must not leak raw reason");

check(
  source.includes("this.aiUiText(emptyReason.summary || emptyReason.code || \"no_proposals\")"),
  "empty reason must be routed through the central mapper",
);
check(
  !source.includes("(${this.escapeHtml(emptyReason.code"),
  "normal empty state must not append the raw technical code",
);
check(
  source.includes("this.aiUiText(planner.generation_reason || \"missing\")"),
  "Plan status and Ostatnia analiza must use the central mapper",
);
check(
  source.includes("this.aiUiText(detail.limit_reason || \"missing\")"),
  "Dlaczego ten plan must map binding limits",
);
check(
  source.includes("this.aiUiText(detail.reason_summary)"),
  "Dlaczego ten plan must map reason summaries",
);
check(
  source.includes("this.aiUiText(socDiagnostics.source_health_source || socDiagnostics.freshness_reason || \"missing\")"),
  "SOC freshness source in Data quality must use the central mapper",
);
check(
  source.startsWith("// Resource revision: v=0.8.0.44"),
  "resource revision must be v=0.8.0.44",
);

console.log("Stage 5G.4K.4 user-facing reason translation tests passed");
