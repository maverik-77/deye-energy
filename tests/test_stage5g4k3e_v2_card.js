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
  { id: "supplier_a", name: "Supplier A" },
  { id: "supplier_e", name: "Supplier E" },
];
function data(buy, seller = "") {
  return {
    mode: "automatic", provider: "dso_a", plan: "g12w", provider_name: "DSO A",
    plan_name: "G12w", configured: true, season: "summer", zone: "peak",
    providers: [{ id: "dso_a", name: "DSO A", tariffs: [{ id: "g12w", name: "G12w" }, { id: "g12as", name: "G12as" }] }],
    tariffs: [{ id: "g12w", name: "G12w" }, { id: "g12as", name: "G12as" }],
    hourly_profile: [], price_contracts: { buy, sell: { today_entity: "sensor.sell", tomorrow_entity: "sensor.sell_tomorrow", source_adapter: "rce_pse" } },
    price_diagnostics: {}, catalog_local_version: "2026.08.27.1", catalog_remote_version: "2026.08.27.1",
    catalog_last_checked: "2026-08-27T10:00:00+00:00", catalog_update_result: "up_to_date",
    catalog_current_validity: "valid", catalog_effective_from: "2026-01-01", catalog_valid_to: "2026-12-31",
    seller_fallback: {
      selected_seller_id: seller, selected_seller_tariff_id: "", seller_options: sellers,
      suggested_seller_id: "supplier_a", support_reason: "",
      support_matrix: { dso_a: {
        g12w: { suggested_seller_id: "supplier_a", status: "SUPPORTED_TARIFF_BUY" },
        g12as: { suggested_seller_id: "supplier_a", status: "OSD_ONLY_NO_STANDARD_SELLER_TARIFF", reason: "No standard tariff." },
      } },
      tariff_options_by_scope: { "dso_a/g12w/supplier_a": [{ id: "supplier_a_g12w_2026", name: "Comfort" }] },
    },
  };
}

card.tariffData = () => data({ today_entity: "sensor.pstryk_buy", tomorrow_entity: "sensor.pstryk_buy_tomorrow", source_adapter: "pstryk" });
const mapped = card.renderTariffTab();
check(!mapped.includes('data-tariff-field="buy_seller_id"'), "mapped BUY must hide seller selection");

card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" });
const empty = card.renderTariffTab();
check(empty.includes("Energy supplier (purchase)"), "empty BUY must show seller selector");
check(empty.includes("Suggestion for this DSO"), "suggestion must be visible");
check(empty.includes("The choice is not applied automatically"), "suggestion must not silently select seller");
check(!empty.includes('data-tariff-field="buy_seller_tariff_id"'), "tariff selector must stay hidden without real ambiguity");

card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" }, "supplier_a");
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

card._tariffDraft = { tariff_plan: "g12as", buy_seller_id: "supplier_a" };
card.tariffData = () => data({ today_entity: "", tomorrow_entity: "", source_adapter: "generic" }, "supplier_a");
const unsupported = card.renderTariffTab();
check(unsupported.includes("The system remains fail-closed"), "unsupported special tariff needs a clear fail-closed status");

check(source.startsWith("// Resource revision: v=0.8.0.44"), "resource revision must be .44");
console.log("stage5g4k3e v2 seller tariff card OK");
