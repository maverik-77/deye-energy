// Resource revision: v=0.8.1.09
import { DeyeEnergyCard } from "./deye-energy-main-card.js?v=0.8.1.09";
import { DeyeEnergyInverterConfigCard } from "./deye-energy-inverter-config-card.js?v=0.8.1.09";
import { DeyeEnergyTriggerLogsCard } from "./deye-energy-trigger-logs-card.js?v=0.8.1.09";
import { DeyeEnergyGraphsCard } from "./deye-energy-graphs-card.js?v=0.8.1.09";
import { DeyeEnergyPowerFlowCard } from "./deye-energy-power-flow-card.js?v=0.8.1.09";

const defs = [
  ["deye-energy-card", DeyeEnergyCard],
  ["deye-energy-inverter-config-card", DeyeEnergyInverterConfigCard],
  ["deye-energy-trigger-logs-card", DeyeEnergyTriggerLogsCard],
  ["deye-energy-graphs-card", DeyeEnergyGraphsCard],
  ["deye-energy-power-flow-card", DeyeEnergyPowerFlowCard],
];
for (const [name, cls] of defs) {
  if (!customElements.get(name)) customElements.define(name, cls);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "deye-energy-card",
  name: "Deye Energy",
  description: "Deye Energy 0.8.1.09",
});
window.customCards.push({
  type: "deye-energy-inverter-config-card",
  name: "Deye Inverter Configuration",
  description: "Live inverter configuration with confirmation before upload",
});
window.customCards.push({
  type: "deye-energy-trigger-logs-card",
  name: "Trigger logs",
  description: "Logs inverter inputs/triggers with success/failure status",
});
window.customCards.push({
  type: "deye-energy-graphs-card",
  name: "Deye Energy Graphs",
  description: "History graphs for inverter, grid, load, and battery metrics",
});
window.customCards.push({
  type: "deye-energy-power-flow-card",
  name: "Deye Energy Power Flow",
  description: "Live power flow between PV, Grid, Inverter, Battery, and Home",
});
