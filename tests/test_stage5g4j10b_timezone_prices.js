const fs = require("fs");
const path = require("path");

global.window = { setTimeout, clearTimeout };
global.document = {};
global.HTMLElement = class HTMLElement {};
global.customElements = { define: () => {} };

const cardPath = path.join(__dirname, "..", "custom_components", "deye_energy", "www", "deye-energy-card.js");
const source = fs.readFileSync(cardPath, "utf8");
eval(source + "\nglobal.DeyeEnergyCard = DeyeEnergyCard;");

const card = new global.DeyeEnergyCard();
card.setConfig({});
card._hass = {
  config: { time_zone: "Europe/London" },
  states: {},
};

const equal = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
};

const readyRow = (day, hour, value, overrides = {}) => ({
  day,
  hour,
  quality: "ready",
  final_price_gbp_kwh: value,
  ...overrides,
});

const setSellRows = (rows) => {
  card._hass.states["sensor.deye_energy_tariff_status"] = {
    state: "ok",
    attributes: {
      price_diagnostics: {
        schema_version: 1,
        buy: { rows: [] },
        sell: { rows },
      },
    },
  };
};

const priceMaps = () => {
  const maps = card.canonicalPriceMaps("sell");
  return [Object.fromEntries(maps[0]), Object.fromEntries(maps[1])];
};

[
  "2026-08-24T18:00:00Z",
  "2026-08-24T18:00:00+00:00",
  "2026-08-24T19:00:00+01:00",
].forEach((stamp) => {
  equal(card.priceSlotFromValue(stamp), { date: "2026-08-24", hour: 19 }, `aware conversion ${stamp}`);
});

equal(
  card.priceSlotFromValue("2026-08-24T18:00:00"),
  { date: "2026-08-24", hour: 18 },
  "naive ISO remains local wall time",
);
equal(card.priceSlotFromValue("01:00"), { date: null, hour: 1 }, "plain label");

setSellRows([
  readyRow("today", 19, 1.1),
  readyRow("tomorrow", 0, 2.2),
  readyRow("today", 20, 9.9, { quality: "pending" }),
]);
let maps = priceMaps();
equal(maps[0], { 19: 1.1 }, "today canonical bucket");
equal(maps[1], { 0: 2.2 }, "tomorrow canonical bucket after midnight crossing");

equal(
  card.priceSlotFromValue("2026-03-29T01:00:00Z"),
  { date: "2026-03-29", hour: 2 },
  "spring DST skips nonexistent local 01:00",
);
setSellRows([
  readyRow("today", 0, 0),
  readyRow("today", 2, -0.25),
  readyRow("today", 1, 8.8, { quality: "missing" }),
]);
maps = priceMaps();
equal(maps[0], { 0: 0, 2: -0.25 }, "spring canonical rows keep non-positive prices and skip 01:00");

equal(
  card.priceSlotFromValue("2026-10-25T00:00:00Z"),
  { date: "2026-10-25", hour: 1 },
  "autumn first duplicate local hour",
);
equal(
  card.priceSlotFromValue("2026-10-25T01:00:00Z"),
  { date: "2026-10-25", hour: 1 },
  "autumn second duplicate local hour",
);
setSellRows([readyRow("today", 1, 1.0)]);
maps = priceMaps();
equal(
  maps[0],
  { 1: 1.0 },
  "autumn duplicate local hour is already deduplicated to the first provider value",
);

console.log("Stage 5G.4J.10B timezone price card tests passed");
