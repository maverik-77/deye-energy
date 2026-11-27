const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CARD = path.join(ROOT, 'custom_components', 'deye_energy', 'www', 'deye-energy-trigger-logs-card.js');

function loadClass() {
  const code = fs.readFileSync(CARD, 'utf8').replace(/export class /g, 'class ');
  class MockElement {
    constructor() { this._inner = ''; this._children = []; this.style = {}; this.isConnected = true; }
    set innerHTML(v) { this._inner = String(v); this._children = []; }
    get innerHTML() { return this._inner; }
    querySelector(sel) { return this._children.find((c) => c.matches?.(sel)) || null; }
    querySelectorAll(sel) { return this._children.filter((c) => c.matches?.(sel)); }
    appendChild(c) { this._children.push(c); return c; }
  }
  const sandbox = {
    HTMLElement: MockElement,
    customElements: { get: () => undefined, define: () => {} },
    window: { customCards: [] },
    console,
    setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__TriggerLogs = DeyeEnergyTriggerLogsCard;', sandbox);
  return sandbox.__TriggerLogs;
}

function makeCard(entries) {
  const Cls = loadClass();
  const card = new Cls();
  card._config = { title: 'Trigger logs', default_filter: 'all' };
  card._filter = 'all';
  card._hass = {
    states: {
      'sensor.deye_energy_trigger_log': {
        state: String(entries.length),
        attributes: { entries },
      },
    },
  };
  const rendered = [];
  card._render = function renderPatched() {
    const entityId = this._findEntity();
    const stateObj = entityId ? this._hass.states[entityId] : null;
    const all = Array.isArray(stateObj?.attributes?.entries) ? [...stateObj.attributes.entries] : [];
    const filtered = this._applyFilter(all);
    this._applySort(filtered);
    rendered.push(filtered.map((e) => e.id));
  };
  card.rendered = rendered;
  return card;
}

test('Trigger Logs defaults to timestamp desc sort', () => {
  const Cls = loadClass();
  const card = new Cls();
  assert.equal(card._sortKey, 'timestamp');
  assert.equal(card._sortDir, 'desc');
});

test('Trigger Logs sorts by timestamp desc by default', () => {
  const card = makeCard([
    { id: 1, timestamp: '2026-11-27T10:00:00Z', entity_id: 'a', success: true },
    { id: 2, timestamp: '2026-11-27T12:00:00Z', entity_id: 'b', success: false },
    { id: 3, timestamp: '2026-11-27T11:00:00Z', entity_id: 'c', success: true },
  ]);
  card._render();
  assert.deepEqual(card.rendered[0], [2, 3, 1]);
});

test('Trigger Logs can sort by input and status', () => {
  const card = makeCard([
    { id: 1, timestamp: '2026-11-27T10:00:00Z', entity_id: 'switch.b', domain: 'switch', service: 'turn_on', success: true },
    { id: 2, timestamp: '2026-11-27T12:00:00Z', entity_id: 'switch.a', domain: 'switch', service: 'turn_off', success: false, source: 'z' },
    { id: 3, timestamp: '2026-11-27T11:00:00Z', entity_id: 'switch.c', domain: 'switch', service: 'turn_on', success: true, source: 'a' },
  ]);
  card._sortKey = 'input'; card._sortDir = 'asc';
  card._render();
  assert.deepEqual(card.rendered[0], [2, 1, 3]);
  card._sortKey = 'status'; card._sortDir = 'asc';
  card._render();
  assert.deepEqual(card.rendered.at(-1), [1, 3, 2]);
});

test('Trigger Logs row keeps trigger and source on same rows without breaks', () => {
  const Cls = loadClass();
  const card = new Cls();
  const html = card._row({ timestamp: '2026-11-27T10:00:00Z', entity_id: 'switch.a', domain: 'switch', service: 'turn_on', value: 1, success: true, source: 'manual' });
  assert.match(html, /switch\.a<\/span>\s*<span[^>]*>switch\.turn_on = 1<\/span>/);
  assert.match(html, /Success<\/span>\s*<span[^>]*>Source: manual<\/span>/);
  assert.doesNotMatch(html, /<div[^>]*margin-top:[^>]*>switch\.turn_on/);
});
