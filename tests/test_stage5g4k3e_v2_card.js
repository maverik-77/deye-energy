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

const sellers = [
  { id: "octopus", name: "Octopus Energy" },
  { id: "other_supplier", name: "Other Supplier" },
];
function data(buy, seller = "") {
  return {
    mode: "automatic", provider: "octopus", plan: "intelligent_go", provider_name: "Octopus Energy",
    plan_name: "Intelligent Octopus Go", configured: true, season: "summer", zone: "peak",
    providers: [{ id: "octopus", name: "Octopus Energy", tariffs: [{ id: "intelligent_go", name: "Intelligent Octopus Go" }, { id: "flexible", name: "Flexible Octopus" }] }],
    tariffs: [{ id: "intelligent_go", name: "Intelligent Octopus Go" }, { id: "flexible", name: "Flexible Octopus" }],
    hourly_profile: [], price_contracts: { buy, sell: { today_entity: "sensor.sell", tomorrow_entity: "sensor.sell_tomorrow", source_adapter: "octopus_energy" } },
    price_diagnostics: {}, catalog_local_version: "2026.08.27.1", catalog_remote_version: "2026.08.27.1",
    catalog_last_checked: "2026-08-27T10:00:00+00:00", catalog_update_result: "up_to_date",
    catalog_current_validity: "valid", catalog_effective_from: "2026-01-01", catalog_valid_to: "2026-12-31",
    seller_fallback: {
      selected_seller_id: seller, selected_seller_tariff_id: "", seller_options: sellers,
      suggested_seller_id: "octopus", support_reason: "",
      support_matrix: { octopus: {
        intelligent_go: { suggested_seller_id: "octopus", status: "SUPPORTED_TARIFF_BUY" },
        flexible: { suggested_seller_id: "octopus", status: "DSO_ONLY_NO_STANDARD_SELLER_TARIFF", reason: "No standard tariff." },
      } },
      tariff_options_by_scope: { "octopus/intelligent_go/octopus": [{ id: "intelligent_go_2026", name: "Comfort" }] },
    },
  };
}

card.tariffData = () => data({ today_entity: "sensor.octopus_energy_buy", tomorrow_entity: "sensor.octopus_energy_buy_tomorrow", source_adapter: "octopus_energy" });
const mapped = card.renderTariffTab();
check(!mapped.includes('data-tariff-field="buy_seller_id"'), "mapped BUY must hide seller selection");

card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" });
const empty = card.renderTariffTab();
check(empty.includes("Energy supplier (purchase)"), "empty BUY must show seller selector");
check(empty.includes("Suggestion for this DSO"), "suggestion must be visible");
check(empty.includes("The choice is not applied automatically"), "suggestion must not silently select seller");
check(!empty.includes('data-tariff-field="buy_seller_tariff_id"'), "tariff selector must stay hidden without real ambiguity");

card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" }, "octopus");
const selected = card.renderTariffTab();
const simpleBlock = selected.split('<div class="seller-buy-fallback">', 2)[1].split("</div>", 1)[0];
check(selected.includes("Matched supplier tariff"), "unique seller tariff must be automatic");
check(!selected.includes('data-tariff-field="buy_seller_tariff_id"'), "unique match must not add a second selector");
check(!simpleBlock.includes("GBP/kWh"), "simple seller UI must not expose numeric prices");
check(!simpleBlock.includes("VAT"), "simple seller UI must not expose VAT internals");
check(!simpleBlock.includes("schema"), "simple seller UI must not expose schema internals");
check(selected.includes("Local catalog:"), "manual update status must show local version");
check(selected.includes("remote:"), "manual update status must show remote version");
check(selected.includes("validity:"), "manual update status must show current validity");

card._tariffDraft = { tariff_plan: "flexible", buy_seller_id: "octopus" };
card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" }, "octopus");
const unsupported = card.renderTariffTab();
check(unsupported.includes("The system remains fail-closed"), "unsupported special tariff needs a clear fail-closed status");

check(source.startsWith("// Resource revision: v=0.8.0.44"), "resource revision must be .44");
console.log("stage5g4k3e v2 seller tariff card OK");
