const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("custom_components/deye_energy/www/deye-energy-card.js", "utf8");
const sandbox = { console, HTMLElement: class {}, customElements: { define() {} }, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.Card = DeyeEnergyCard;`, sandbox);

function check(condition, message) { if (!condition) throw new Error(message); }
function count(text, needle) { return text.split(needle).length - 1; }

const card = new sandbox.Card();
card._config = {};
card._hass = { states: {} };

function known(adapter, direction) {
  const role = adapter === "octopus_energy"
    ? (direction === "buy" ? "retail_buy_all_in" : "prosumer_sell")
    : (direction === "buy" ? "energy_only" : "market_reference");
  return {
    source_adapter: adapter,
    adapter_summary: adapter,
    resolved_adapter_today: adapter,
    resolved_adapter_tomorrow: adapter,
    today_entity: `sensor.${adapter}_${direction}_today`,
    tomorrow_entity: `sensor.${adapter}_${direction}_tomorrow`,
    stable_identity_today_status: "bound",
    stable_identity_tomorrow_status: "bound",
    resolved_source_today: { economic_role: role, semantic_scope: adapter === "octopus_energy" ? "all_in_variable" : "energy_only", includes_distribution_variable: adapter === "octopus_energy" },
    resolved_source_tomorrow: { economic_role: role, semantic_scope: adapter === "octopus_energy" ? "all_in_variable" : "energy_only", includes_distribution_variable: adapter === "octopus_energy" },
  };
}

function tariffData(provider = "octopus", plan = "intelligent_go", contracts = null) {
  return {
    mode: provider === "other" || plan === "custom" ? "manual" : "automatic",
    provider,
    plan,
    provider_name: provider === "other" ? "Other operator" : "Octopus Energy",
    plan_name: plan.toUpperCase(),
    configured: true,
    providers: [
      { id: "octopus", name: "Octopus Energy", tariffs: [{ id: "intelligent_go", name: "Intelligent Octopus Go" }] },
      { id: "other", name: "Other operator", tariffs: [{ id: "custom", name: "Manual profile" }] },
    ],
    tariffs: provider === "other" ? [{ id: "custom", name: "Manual profile" }] : [{ id: "intelligent_go", name: "Intelligent Octopus Go" }],
    hourly_profile: [],
    price_contracts: contracts || { buy: known("octopus_energy", "buy"), sell: known("octopus_energy", "sell") },
    price_diagnostics: {},
  };
}

card.tariffData = () => tariffData();
const standard = card.renderTariffTab();
const standardBlock = standard.split('<section class="diagnostic-section"><h3>Operator and tariff settings</h3>', 2)[1].split("</section>", 1)[0];

check(count(standardBlock, "data-tariff-field=") === 2, "standard tariff block must have exactly two editable tariff fields");
check(standardBlock.includes('data-tariff-field="dso_provider"'), "standard tariff block must edit DSO provider");
check(standardBlock.includes('data-tariff-field="tariff_plan"'), "standard tariff block must edit tariff");
check(!standard.includes('data-tariff-field="tariff_mode"'), "legacy tariff mode selector must be hidden");
check(!standard.includes("manual-dso-profile"), "manual DSO fields must not render for catalog tariff");
check(!standard.includes("data-price-contract"), "known adapters must expose no contract override");
check(count(standard, "price-mapping-summary-row") === 4, "standard view must summarize exactly four central mappings");
check(standard.includes("BUY/SELL price entities are configured in the integration settings."), "mapping authority note missing");
check(standard.includes("Detected source: octopus_energy / octopus_energy"), "detected adapters must be informational");
check(standard.includes("DSO included"), "Octopus Energy BUY must say DSO is included");
check(standard.includes('<details class="diagnostic-section tariff-advanced">'), "polarity must be in collapsed Advanced");
check(!standard.includes('<details class="diagnostic-section tariff-advanced" open'), "Advanced must be collapsed by default");
check(standard.includes('<details class="diagnostic-section tariff-price-diagnostics">'), "technical diagnostics must remain available");
check(!standard.includes('<details class="diagnostic-section tariff-price-diagnostics" open'), "technical diagnostics must be collapsed by default");
check(standard.includes("resolver, schema and coverage"), "collapsed diagnostics must retain resolver/schema/coverage");

card.tariffData = () => tariffData("other", "custom");
const manual = card.renderTariffTab();
check(manual.includes("manual-dso-profile"), "manual/custom DSO must render manual profile fields");
check(manual.includes('data-tariff-field="distribution_peak_rate"'), "manual peak rate must remain editable");
check(manual.includes('data-tariff-field="distribution_offpeak_rate"'), "manual off-peak rate must remain editable");

const customBuy = {
  source_adapter: "custom",
  adapter_summary: "custom",
  resolved_adapter_today: "custom",
  today_entity: "sensor.custom_buy",
  tomorrow_entity: "",
  economic_role: "energy_only",
  semantic_scope: "energy_only",
  includes_distribution_variable: false,
  price_basis: "gross",
  unit: "GBP/kWh",
};
card.tariffData = () => tariffData("octopus", "intelligent_go", { buy: customBuy, sell: known("octopus_energy", "sell") });
const custom = card.renderTariffTab();
check(count(custom, "custom-price-contract") === 1, "only the actual Custom direction must expose advanced source settings");
check(custom.includes('data-contract-field="economic_role"'), "Custom must expose explicit economic role");
check(custom.includes('data-contract-field="value_field"'), "Custom schema must remain editable after expansion");
check(custom.includes("Advanced / Custom — custom source settings"), "Custom section label missing");

const snapshot = card.configurationSnapshot();
check(!Object.prototype.hasOwnProperty.call(snapshot.tariff_settings, "price_source"), "legacy price_source must not be exported in normal UI DTO");
check(source.startsWith("// Resource revision: v=0.8.0.44"), "resource revision must be .44");
console.log("stage5g4k3d UX and semantics card OK");
