const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("custom_components/deye_energy/www/deye-energy-card.js", "utf8");
const sandbox = { console, HTMLElement: class {}, customElements: { define() {} }, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) { if (!condition) throw new Error(message); }
const card = new sandbox.Card();
card._config = {};
card._hass = { states: {} };

const known = (adapter) => ({
  source_adapter: adapter, adapter_summary: adapter,
  resolved_adapter_today: adapter, resolved_adapter_tomorrow: adapter,
  today_entity: `sensor.${adapter}_today`, tomorrow_entity: `sensor.${adapter}_tomorrow`,
  resolved_source_today: {
    semantic_scope: adapter === "octopus_energy" ? "energy_only" : "all_in_variable",
    includes_distribution_variable: adapter !== "octopus_energy",
    includes_excise: adapter !== "octopus_energy",
    includes_service_margin: adapter !== "octopus_energy",
  },
  resolved_source_tomorrow: {
    semantic_scope: adapter === "octopus_energy" ? "energy_only" : "all_in_variable",
    includes_distribution_variable: adapter !== "octopus_energy",
    includes_excise: adapter !== "octopus_energy",
    includes_service_margin: adapter !== "octopus_energy",
  },
});

for (const adapter of ["octopus_energy"]) {
  const html = card.renderPriceContract("buy", known(adapter));
  check(html.includes("automatic / read-only"), `${adapter} must be explicitly read-only`);
  check(html.includes("automatic contract"), `${adapter} must render diagnostics as text`);
  check(!html.includes("data-price-contract"), `${adapter} must expose no editable contract control`);
}

const custom = card.renderPriceContract("buy", {
  source_adapter: "custom", adapter_summary: "custom", resolved_adapter_today: "custom",
  today_entity: "sensor.custom", tomorrow_entity: "", semantic_scope: "energy_only",
  includes_distribution_variable: false, price_basis: "gross", unit: "GBP/kWh",
});
check(custom.includes('data-price-contract="buy"'), "Custom fields must remain editable");

const empty = {
  adapter_summary: "unmapped", resolved_adapter_today: "unmapped", resolved_adapter_tomorrow: "unmapped",
  today_entity: "", tomorrow_entity: "",
};
const staleSnapshot = {
  buy: {
    contract: known("octopus_energy"),
    rows: [{ day: "tomorrow", hour: 23, quality: "ready", final_price_gbp_kwh: 1.16 }],
    diagnostics: { resolver: {
      today: { mapped_entity: "sensor.old_octopus_energy_today", resolved_entity: "sensor.old_octopus_energy_today" },
      tomorrow: { mapped_entity: "sensor.old_octopus_energy_tomorrow", resolved_entity: "sensor.old_octopus_energy_tomorrow" },
    } },
  },
};
const diagnostics = card.renderPriceDiagnostics({
  price_contracts: { buy: empty, sell: empty }, price_diagnostics: staleSnapshot,
});
check(!diagnostics.includes("sensor.old_octopus_energy"), "empty diagnostics must not render stale entity names");
check(diagnostics.includes("not configured"), "empty diagnostics must show unconfigured status");

card.tariffData = () => ({
  mode: "automatic", provider: "octopus", plan: "intelligent_go", providers: [], tariffs: [], hourly_profile: [],
  price_source: "octopus_energy", price_contracts: { buy: known("octopus_energy"), sell: empty },
});
const tariff = card.renderTariffTab();
check(!tariff.includes('data-tariff-field="price_source"'), "legacy source must not be an active dropdown");
check(tariff.includes("Detected source: octopus_energy"), "derived source must be rendered as read-only text");
check(source.startsWith("// Resource revision: v=0.8.0.44"), "resource revision must be .44");
console.log("stage5g4k3b2 real HA cleanup card OK");
