// Resource revision: v=0.8.1.09
export class DeyeEnergyPowerFlowCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._period = 'power';
    this._stats = {};
    this._statsLoading = false;
    this._statsKey = '';
    this._statsToken = 0;
    this._clickHandler = null;
    this._flowMotion = new Map();
    this._flowEls = new Map();
    this._flowRaf = null;
    this._flowLastTs = 0;
    this.connectedCallback();
  }

  connectedCallback() {
    if (this._clickHandler) return;
    if (typeof this.addEventListener === 'function') {
      this._clickHandler = (e) => {
        const t = e?.target?.closest ? e.target.closest('.pf-value-click[data-entity], .pf-node-click[data-entity], .pf-consumer-click[data-entity]') : null;
        if (t) this._openMoreInfo(t.getAttribute('data-entity'));
        const p = e?.target?.closest ? e.target.closest('.pf-period[data-period]') : null;
        if (p) { this._period = p.getAttribute('data-period') || 'power'; this._maybeFetchStats(); this._render(); }
      };
      this.addEventListener('click', this._clickHandler);
    }
  }

  disconnectedCallback() {
    if (this._clickHandler) {
      this.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
    this._statsToken += 1;
    this._statsLoading = false;
    this._pfDisplaySource = null;
    this._pfDisplayCache = null;
    if (this._flowRaf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._flowRaf);
    this._flowRaf = null;
    this._flowEls.clear();
  }

  static getStubConfig() {
    return {
      title: 'Deye Energy Power Flow',
      view: { energy_periods: ['power', 'today'] },
      entities: {
        pv: 'sensor.garage_deye_energy_pv_power',
        grid: 'sensor.garage_deye_energy_grid_power',
        battery: 'sensor.garage_deye_energy_battery_power',
        battery_soc: 'sensor.garage_deye_energy_battery_soc',
        load: 'sensor.garage_deye_energy_load_power',
        inverter: 'sensor.deye_inverter_power',
        daily_pv_production: 'sensor.garage_deye_energy_daily_pv_production',
        daily_energy_bought: 'sensor.garage_deye_energy_daily_energy_bought',
        daily_energy_sold: 'sensor.garage_deye_energy_daily_energy_sold',
        daily_battery_charge: 'sensor.garage_deye_energy_daily_battery_charge',
        daily_battery_discharge: 'sensor.garage_deye_energy_daily_battery_discharge',
        daily_load_consumption: 'sensor.garage_deye_energy_daily_load_consumption',
        battery_voltage: 'sensor.garage_deye_energy_battery_bms_voltage',
        battery_current: 'sensor.garage_deye_energy_battery_current',
        battery_temperature: 'sensor.garage_deye_energy_battery_temperature',
        grid_frequency: 'sensor.garage_deye_energy_load_frequency',
        inverter_temperature: 'sensor.garage_deye_energy_inverter_ac_temperature',
        grid_l1_voltage: 'sensor.garage_deye_energy_grid_l1_voltage',
        overall_grid_import: 'sensor.givenergy_ed2253g336_import_power',
        overall_grid_export: 'sensor.givenergy_ed2253g336_export_power',
        electricity_import_today: 'sensor.givenergy_ed2253g336_import_energy_today_kwh',
        electricity_cost_today: 'sensor.smart_meter_electricity_cost_today',
        gas_import_today: 'sensor.smart_meter_gas_import_today',
        gas_cost_today: 'sensor.smart_meter_gas_cost_today',
        electricity_export_today: 'sensor.givenergy_ed2253g336_export_energy_today_kwh',
        electricity_income_today: 'sensor.smart_meter_electricity_income_today',
      },
      consumers: [],
    };
  }

  getCardSize() { return 12; }
  setConfig(config) { this._config = config || {}; this._period = 'power'; this._stats = {}; this._statsKey = ''; this._statsToken += 1; this._pfDisplaySource = null; this._pfDisplayCache = null; this._render(); this._maybeFetchStats(); }
  set hass(hass) { const old = this._hass; this._hass = hass; if (!old) this._maybeFetchStats(); this._render(); }

  _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  _num(entityId) { const st = this._hass?.states?.[entityId]; if (!st) return null; const v = Number(st.state); return Number.isFinite(v) ? v : null; }
  _flowTiming() {
    const cfg = Number(this._config?.flow_animation_speed ?? 6);
    const speed = Number.isFinite(cfg) ? Math.min(20, Math.max(1, cfg)) : 6;
    const duration = Number(Math.max(0.5, 18 / speed).toFixed(2));
    return { speed, duration };
  }
  _flowDuration(power) {
    const watts = Math.max(0, Math.min(5000, Math.abs(Number(power) || 0)));
    const minDuration = 0.8;
    const maxDuration = 8;
    const t = watts / 5000;
    return Number((maxDuration - (maxDuration - minDuration) * t).toFixed(2));
  }
  _flowNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }
  _flowTransition(state) {
    if (!state.transitionStart || !state.prevDir || !state.dir || state.prevDir === state.dir) return null;
    const p = Math.min(1, (this._flowNow() - state.transitionStart) / 1600);
    if (p >= 1) {
      state.transitionStart = 0;
      state.prevDir = 0;
      return null;
    }
    let intensity, oldArrow, newArrow, moving;
    if (p < 0.30) {
      const q = p / 0.30;
      intensity = 1 - 0.9 * q;
      oldArrow = 1 - q;
      newArrow = 0;
      moving = false;
    } else if (p < 0.60) {
      const q = (p - 0.30) / 0.30;
      intensity = 0.1;
      oldArrow = 1 - q;
      newArrow = q;
      moving = false;
    } else if (p < 0.85) {
      const q = (p - 0.60) / 0.25;
      intensity = 0.1 + 0.9 * q;
      oldArrow = 0;
      newArrow = 1;
      moving = false;
    } else {
      intensity = 1;
      oldArrow = 0;
      newArrow = 1;
      moving = true;
    }
    return { p, intensity, oldArrow, newArrow, moving };
  }
  _flowGeometry(d) {
    const str = String(d);
    const line = str.match(/^M\s+([-\d.]+)\s+([-\d.]+)\s+L\s+([-\d.]+)\s+([-\d.]+)$/);
    if (line) {
      const x1 = Number(line[1]), y1 = Number(line[2]), x2 = Number(line[3]), y2 = Number(line[4]);
      return { type: 'line', x1, y1, x2, y2, length: Math.hypot(x2 - x1, y2 - y1) };
    }
    const cubic = str.match(/^M\s+([-\d.]+)\s+([-\d.]+)\s+C\s+([-\d.]+)\s+([-\d.]+),\s*([-\d.]+)\s+([-\d.]+),\s*([-\d.]+)\s+([-\d.]+)$/);
    if (cubic) {
      const p0 = { x: Number(cubic[1]), y: Number(cubic[2]) };
      const p1 = { x: Number(cubic[3]), y: Number(cubic[4]) };
      const p2 = { x: Number(cubic[5]), y: Number(cubic[6]) };
      const p3 = { x: Number(cubic[7]), y: Number(cubic[8]) };
      const samples = 48;
      const lut = [0];
      let len = 0;
      let prev = p0;
      for (let i = 1; i <= samples; i += 1) {
        const pt = this._cubicPoint(p0, p1, p2, p3, i / samples);
        len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        lut.push(len);
        prev = pt;
      }
      return { type: 'cubic', p0, p1, p2, p3, length: len, lut, samples };
    }
    return null;
  }
  _cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }
  _cubicTangent(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
      x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
    };
  }
  _tAtOffset(g, offset) {
    if (!g || !g.length) return 0;
    const raw = Number(offset) || 0;
    const d = raw >= g.length ? g.length : ((raw % g.length) + g.length) % g.length;
    if (g.type === 'line') return g.length ? d / g.length : 0;
    const lut = g.lut || [0, g.length];
    let lo = 0, hi = lut.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lut[mid] < d) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const d0 = lut[i - 1], d1 = lut[i];
    const segT = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
    return Math.max(0, Math.min(1, ((i - 1) + segT) / g.samples));
  }
  _pointAt(g, offset) {
    if (!g || !g.length) return { x: 0, y: 0 };
    if (g.type === 'line') {
      const t = this._tAtOffset(g, offset);
      return {
        x: Number((g.x1 + (g.x2 - g.x1) * t).toFixed(2)),
        y: Number((g.y1 + (g.y2 - g.y1) * t).toFixed(2)),
      };
    }
    const t = this._tAtOffset(g, offset);
    const pt = this._cubicPoint(g.p0, g.p1, g.p2, g.p3, t);
    return { x: Number(pt.x.toFixed(2)), y: Number(pt.y.toFixed(2)) };
  }
  _tangentAt(g, offset) {
    if (!g || !g.length) return { x: 1, y: 0 };
    if (g.type === 'line') {
      const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    const t = this._tAtOffset(g, offset);
    const tan = this._cubicTangent(g.p0, g.p1, g.p2, g.p3, t);
    const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
    return { x: tan.x / len, y: tan.y / len };
  }
  _fmtW(v) { if (v == null || !Number.isFinite(v)) return '—'; const abs = Math.abs(v); if (abs >= 10000) return `${(v / 1000).toFixed(1)} kW`; return `${Math.round(v)} W`; }
  _fmtKwh(v) { return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)} kWh`; }
  _fmtNum(v, d=1, unit='') { return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}${unit}`; }
  _fmtGbp(v) { return v == null || !Number.isFinite(v) ? '—' : `£${v.toFixed(2)}`; }
  _summaryIcon(kind, color) {
    const glyph = {
      import: '<path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/>',
      export: '<path d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16"/>',
      bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
      flame: '<path d="M12 22c3.9 0 7-3.1 7-7 0-3.8-2.8-5.9-4-9-1 2-2 3-3 3 0-3-1-5-3-7 0 4-4 6.2-4 13 0 3.9 3.1 7 7 7z"/>',
      pound: `<text x="12" y="17" text-anchor="middle" font-size="15" font-weight="800" fill="${color}" stroke="none">£</text>`,
    }[kind] || '';
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;filter:drop-shadow(0 0 5px ${color}66);">${glyph}</svg>`;
  }
  _powerFlowDisplay() {
    const states = this._hass?.states || {};
    const entry = Object.entries(states).find(([id, state]) => id.startsWith("sensor.") && id.endsWith("_ai_state") && state?.attributes?.power_flow_display);
    const source = entry?.[1]?.attributes?.power_flow_display;
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    if (this._pfDisplaySource === source) return this._pfDisplayCache;
    this._pfDisplaySource = source;
    this._pfDisplayCache = source;
    return source;
  }
  _configValue(entityId, format) {
    const raw = this._hass?.states?.[entityId]?.state;
    if (format === 'num' || !format) {
      if (raw == null || raw === 'unknown' || raw === 'unavailable') return '—';
      const value = Number(raw);
      return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : raw;
    }
    const value = this._num(entityId);
    if (format === 'w') return this._fmtW(value);
    if (format === 'kwh') return this._fmtKwh(value);
    if (format === 'gbp') return this._fmtGbp(value);
    if (format === 'pct') return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)} %`;
    if (format === 'kw') return value == null || !Number.isFinite(value) ? '—' : `${(value / 1000).toFixed(2)} kW`;
    return value == null || !Number.isFinite(value) ? '—' : String(Math.round(value * 100) / 100);
  }
  _nodeDetailRows(group, builtins, fallbackKeys) {
    const display = this._powerFlowDisplay();
    const configured = display.node_detail_layout?.[group];
    const rows = Array.isArray(configured)
      ? configured
      : [
          ...fallbackKeys.map((key) => ({ builtin: key })),
          ...(Array.isArray(display.node_details?.[group]) ? display.node_details[group] : []),
        ];
    return rows.map((row) => {
      if (!row) return null;
      if (row.builtin) {
        const make = builtins[row.builtin];
        return typeof make === "function" ? make() : null;
      }
      return this._detailLine(row.label, this._configValue(row.entity, row.format), '#9eb8c8', row.entity);
    }).filter(Boolean);
  }
  _entities() {
    const d = DeyeEnergyPowerFlowCard.getStubConfig().entities;
    const override = this._powerFlowDisplay().entities || {};
    return { ...d, ...override, ...(this._config.entities || {}) };
  }
  _periods() { const p = this._config?.view?.energy_periods; const allowed = ['power','today']; const filtered = Array.isArray(p) && p.length ? p.filter(x => allowed.includes(x)) : allowed; return filtered.length ? filtered : allowed; }
  _isEnergyPeriod() { return this._period !== 'power'; }
  _periodLabel(p) { return ({power:'Power',today:'Today'})[p] || p; }

  _openMoreInfo(entityId) {
    if (!entityId || !this._hass?.states?.[entityId]) return;
    const ev = typeof Event === 'function' ? new Event('hass-more-info', { bubbles: true, composed: true }) : { bubbles: true, composed: true, type: 'hass-more-info' };
    ev.detail = { entityId }; this.dispatchEvent(ev);
  }

  _periodRange(period) {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);
    if (period === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: start.toISOString(), end: end.toISOString() };
  }

  _statEntityMap() {
    const e = this._entities();
    // For period stats, prefer explicit energy entities; fall back to daily sensors for today-like cumulative where useful.
    return {
      pv: e.pv_energy || e.daily_pv_production,
      grid_import: e.grid_import_energy || e.daily_energy_bought,
      grid_export: e.grid_export_energy || e.daily_energy_sold,
      batt_charge: e.battery_charge_energy || e.daily_battery_charge,
      batt_discharge: e.battery_discharge_energy || e.daily_battery_discharge,
      load: e.load_energy || e.daily_load_consumption,
    };
  }

  async _maybeFetchStats() {
    const period = this._period;
    if (period === 'power' || !this._hass?.connection?.sendMessagePromise) return;
    const map = this._statEntityMap();
    const ids = [...new Set(Object.values(map).filter(Boolean))];
    if (!ids.length) return;
    const range = this._periodRange(period);
    const key = period + '|' + ids.join(',') + '|' + range.start.slice(0,13);
    if (this._statsKey === key) return;
    const fetchKey = key;
    const token = ++this._statsToken;
    this._statsKey = key; this._statsLoading = true; this._stats = {};
    try {
      const periodType = 'day';
      const res = await this._hass.connection.sendMessagePromise({
        type: 'recorder/statistics_during_period',
        start_time: range.start,
        end_time: range.end,
        statistic_ids: ids,
        period: periodType,
        types: ['change'],
      });
      if (this._statsKey !== fetchKey || token !== this._statsToken || !this.isConnected) return;
      const data = res?.statistics && typeof res.statistics === 'object' && !Array.isArray(res.statistics) ? res.statistics : res;
      const out = {};
      for (const id of ids) {
        const rows = Array.isArray(data?.[id]) ? data[id] : [];
        let sum = 0; let seen = false;
        for (const r of rows) {
          const raw = r?.change ?? r?.sum ?? r?.state;
          const v = Number(raw);
          if (Number.isFinite(v)) { sum += v; seen = true; }
        }
        out[id] = seen ? sum : null;
      }
      this._stats = out;
    } catch (e) {
      if (this._statsKey === fetchKey && token === this._statsToken && this.isConnected) console.warn('[deye-energy-power-flow-card] statistics fetch failed', e);
    } finally {
      if (this._statsKey === fetchKey && token === this._statsToken && this.isConnected) {
        this._statsLoading = false;
        this._render();
      }
    }
  }

  _energyVal(key) {
    const map = this._statEntityMap();
    const id = map[key];
    if (!id) return null;
    if (this._period === 'today') {
      const n = this._num(id);
      if (n != null) return n;
    }
    if (Object.prototype.hasOwnProperty.call(this._stats, id)) return this._stats[id];
    if (this._period === 'today') return this._num(id);
    return null;
  }

  _syncFlowState(id, power, dir, geometry) {
    const now = this._flowNow();
    let state = this._flowMotion.get(id);
    if (!state) {
      state = { dir: 0, prevDir: 0, phase: 0, transitionStart: 0, duration: 3, active: false, power: 0 };
      this._flowMotion.set(id, state);
    }
    if (dir !== state.dir) {
      const reversed = state.dir !== 0 && dir !== 0 && state.dir === -dir;
      if (reversed && geometry && geometry.length) state.phase = (geometry.length - state.phase) % geometry.length;
      state.prevDir = reversed ? state.dir : 0;
      state.dir = dir;
      state.transitionStart = reversed ? now : 0;
    }
    state.power = Math.abs(Number(power) || 0);
    state.active = state.power > 10;
    if (!state.active) {
      state.transitionStart = 0;
      state.prevDir = 0;
    }
    state.duration = this._flowDuration(state.power);
    state.geometry = geometry;
    const targetGap = 60;
    state.count = geometry ? Math.max(1, Math.min(5, Math.round(geometry.length / targetGap))) : 1;
    state.gap = geometry ? geometry.length / state.count : targetGap;
    return state;
  }
  _ballPoint(state, index) {
    const g = state.geometry;
    if (!g || !g.length) return { x: 0, y: 0 };
    const offset = (state.phase + index * state.gap) % g.length;
    return this._pointAt(g, offset);
  }
  _flow(id, d, color, power, dir = 0) {
    const geometry = this._flowGeometry(d);
    const state = this._syncFlowState(id, power, dir, geometry);
    const active = state.active;
    const transition = active ? this._flowTransition(state) : null;
    const intensity = transition ? transition.intensity : 1;
    const coreOpacity = Number((0.98 * intensity).toFixed(2));
    const haloOpacity = Number((0.14 * intensity).toFixed(2));
    const arrowOpacity = transition ? Number(transition.newArrow.toFixed(2)) : 0.95;
    const oldArrowOpacity = transition ? Number(transition.oldArrow.toFixed(2)) : 0;
    const markerAttrs = active ? `${transition ? `marker-start="url(#pf-arrow-${id}-old)" ` : ''}marker-end="url(#pf-arrow-${id})"` : '';
    const arrowHead = (tipX, tipY, tan, fill, opacity, key) => {
      const nx = -tan.y, ny = tan.x;
      // Tip at the end of the line (target entity). Notch is centered on the line thickness.
      const len = 12;
      const w = 6.2;
      const baseX = tipX - tan.x * len;
      const baseY = tipY - tan.y * len;
      const notchX = tipX - tan.x * (len * 0.55);
      const notchY = tipY - tan.y * (len * 0.55);
      const p1 = `${tipX.toFixed(2)} ${tipY.toFixed(2)}`;
      const p2 = `${(baseX + nx * w).toFixed(2)} ${(baseY + ny * w).toFixed(2)}`;
      const p3 = `${notchX.toFixed(2)} ${notchY.toFixed(2)}`; // on centerline
      const p4 = `${(baseX - nx * w).toFixed(2)} ${(baseY - ny * w).toFixed(2)}`;
      return `<path data-flow-arrow="${key}" d="M ${p1} L ${p2} L ${p3} L ${p4} Z" fill="${fill}" opacity="${opacity}"/>`;
    };
    let centerArrows = '';
    if (active && geometry) {
      const tipOffset = geometry.length;
      const pt = this._pointAt(geometry, tipOffset);
      const tan = this._tangentAt(geometry, tipOffset);
      if (transition) {
        const oldPt = this._pointAt(geometry, 0);
        const oldTanRaw = this._tangentAt(geometry, 0);
        const oldTan = { x: -oldTanRaw.x, y: -oldTanRaw.y };
        centerArrows += arrowHead(oldPt.x, oldPt.y, oldTan, color, oldArrowOpacity, `${id}-old`);
        centerArrows += arrowHead(pt.x, pt.y, tan, color, arrowOpacity, `${id}`);
      } else {
        centerArrows += arrowHead(pt.x, pt.y, tan, color, arrowOpacity, `${id}`);
      }
    }
    let balls = '';
    if (active && geometry) {
      for (let i = 0; i < state.count; i += 1) {
        const point = this._ballPoint(state, i);
        balls += `<circle class="pf-ball-halo" cx="${point.x}" cy="${point.y}" r="7.2" fill="${color}" opacity="${haloOpacity}"/>`;
        balls += `<circle class="pf-ball-core" cx="${point.x}" cy="${point.y}" r="4.2" fill="${color}" opacity="${coreOpacity}" filter="url(#pf-glow)"/>`;
      }
    }
    return `
      <path class="pf-flow-line-bg" d="${d}" stroke="${color}" fill="none"/>
      <path id="${id}" class="pf-flow-line${active ? ' pf-flow-active' : ''}" data-flow-duration="${state.duration}" data-flow-direction="${dir}" d="${d}" stroke="${active ? color : 'rgba(158,184,200,.18)'}" stroke-width="2" stroke-opacity="${active ? 0.96 : 0.18}" fill="none"/>
      ${centerArrows ? `<g data-flow-arrows="${id}">${centerArrows}</g>` : ''}
      ${balls ? `<g class="pf-balls" data-flow-balls="${id}">${balls}</g>` : ''}`;
  }
  _arrowPath(tipX, tipY, tan) {
    const nx = -tan.y, ny = tan.x;
    const len = 12;
    const w = 6.2;
    const baseX = tipX - tan.x * len;
    const baseY = tipY - tan.y * len;
    const notchX = tipX - tan.x * (len * 0.55);
    const notchY = tipY - tan.y * (len * 0.55);
    const p1 = `${tipX.toFixed(2)} ${tipY.toFixed(2)}`;
    const p2 = `${(baseX + nx * w).toFixed(2)} ${(baseY + ny * w).toFixed(2)}`;
    const p3 = `${notchX.toFixed(2)} ${notchY.toFixed(2)}`;
    const p4 = `${(baseX - nx * w).toFixed(2)} ${(baseY - ny * w).toFixed(2)}`;
    return `M ${p1} L ${p2} L ${p3} L ${p4} Z`;
  }
  _bindFlowAnimation() {
    this._flowEls.clear();
    if (typeof this.querySelector !== 'function' || typeof this.querySelectorAll !== 'function') return;
    for (const [id] of this._flowMotion) {
      const line = this.querySelector(`#${id}`) || null;
      const arrowsNode = this.querySelector(`[data-flow-arrows="${id}"]`) || null;
      const arrow = arrowsNode?.querySelector(`[data-flow-arrow="${id}"]`) || this.querySelector(`#pf-arrow-${id} path`) || null;
      const oldArrow = arrowsNode?.querySelector(`[data-flow-arrow="${id}-old"]`) || this.querySelector(`#pf-arrow-${id}-old path`) || null;
      const ballsNode = this.querySelector(`[data-flow-balls="${id}"]`) || null;
      const halos = ballsNode ? Array.from(ballsNode.querySelectorAll('.pf-ball-halo')) : [];
      const cores = ballsNode ? Array.from(ballsNode.querySelectorAll('.pf-ball-core')) : [];
      if (line || arrow || oldArrow || halos.length) this._flowEls.set(id, { line, arrow, oldArrow, halos, cores });
    }
  }
  _startFlowAnimation() {
    if (typeof requestAnimationFrame !== 'function' || this._flowRaf != null || this.isConnected === false) return;
    this._flowLastTs = this._flowNow();
    const tick = () => {
      this._flowRaf = null;
      const now = this._flowNow();
      const dt = Math.min(0.1, Math.max(0, (now - this._flowLastTs) / 1000));
      this._flowLastTs = now;
      let keepRunning = this.isConnected !== false;
      for (const [id, state] of this._flowMotion) {
        const transition = this._flowTransition(state);
        const els = this._flowEls.get(id);
        if (!state.active && !transition) {
          if (els && els.oldArrow) els.oldArrow.setAttribute('opacity', '0');
          continue;
        }
        if (this.isConnected !== false) keepRunning = true;
        const intensity = transition ? transition.intensity : 1;
        const coreOpacity = Number((0.98 * intensity).toFixed(2));
        const haloOpacity = Number((0.14 * intensity).toFixed(2));
        if (state.active && (!transition || transition.moving) && state.geometry && state.geometry.length) {
          state.phase = (state.phase + state.geometry.length * dt / state.duration) % state.geometry.length;
        }
        if (els && els.line) {
          els.line.setAttribute('stroke-opacity', state.active ? '0.96' : '0.18');
          els.line.setAttribute('data-flow-duration', state.duration);
        }
        if (els && els.arrow) {
          els.arrow.setAttribute('opacity', transition ? transition.newArrow.toFixed(2) : '0.95');
          if (state.geometry) {
            const tipOffset = state.geometry.length;
            const pt = this._pointAt(state.geometry, tipOffset);
            const tan = this._tangentAt(state.geometry, tipOffset);
            els.arrow.setAttribute('d', this._arrowPath(pt.x, pt.y, tan));
          }
        }
        if (els && els.oldArrow) {
          els.oldArrow.setAttribute('opacity', transition ? transition.oldArrow.toFixed(2) : '0');
          if (state.geometry) {
            const oldPt = this._pointAt(state.geometry, 0);
            const oldTanRaw = this._tangentAt(state.geometry, 0);
            els.oldArrow.setAttribute('d', this._arrowPath(oldPt.x, oldPt.y, { x: -oldTanRaw.x, y: -oldTanRaw.y }));
          }
        }
        if (els) {
          els.halos.forEach((el, i) => {
            const point = this._ballPoint(state, i);
            if (els.halos[i]) {
              els.halos[i].setAttribute('opacity', haloOpacity);
              els.halos[i].setAttribute('cx', point.x);
              els.halos[i].setAttribute('cy', point.y);
            }
          });
          els.cores.forEach((el, i) => {
            const point = this._ballPoint(state, i);
            el.setAttribute('opacity', coreOpacity);
            el.setAttribute('cx', point.x);
            el.setAttribute('cy', point.y);
          });
        }
      }
      if (keepRunning && this.isConnected !== false) this._flowRaf = requestAnimationFrame(tick);
    };
    this._flowRaf = requestAnimationFrame(tick);
  }

  _entityValue(value, entityId, style='') {
    const text = this._esc(value == null ? '—' : value);
    const attrs = entityId ? ` class="pf-value-click" data-entity="${this._esc(entityId)}"` : '';
    return `<span${attrs}${style ? ` style="${style}"` : ''}>${text}</span>`;
  }

  _detailLine(label, value, color='#9eb8c8', entityId='') {
    return `<div style="display:flex;justify-content:flex-start;gap:5px;font-size:12px;line-height:1.5;"><span style="color:#93adbc;">${this._esc(label)}</span>${this._entityValue(value, entityId, `color:${this._esc(color)};font-weight:600;white-space:nowrap;`)}</div>`;
  }

  _nodeIconSrc(key) {
    const dark = !!(this._hass && this._hass.themes && this._hass.themes.darkMode);
    return `/deye_energy/pf-${key}${dark ? '-dark' : ''}.png`;
  }

  _nodeIcon(key) {
    return `<img src="${this._nodeIconSrc(key)}" alt="" style="width:64px;height:64px;max-width:100%;box-sizing:border-box;object-fit:contain;display:block;border-radius:8px;">`;
  }

  _batteryNodeIcon(soc) {
    const pct = Number.isFinite(soc) ? Math.max(0, Math.min(100, soc)) : null;
    const color = pct == null ? '#9eb8c8' : (pct < 20 ? '#ff5d70' : pct < 50 ? '#ffb020' : '#7ee22d');
    const fill = pct == null ? '0%' : `${pct}%`;
    return `<span style="position:relative;display:block;width:64px;height:64px;max-width:100%;box-sizing:border-box;">
        <img src="${this._nodeIconSrc('battery')}" alt="" style="width:100%;height:100%;max-width:100%;box-sizing:border-box;object-fit:contain;display:block;border-radius:8px;">
        <span style="position:absolute;left:8%;right:8%;bottom:8%;height:14%;min-height:3px;max-height:6px;box-sizing:border-box;overflow:hidden;border-radius:999px;background:rgba(2,9,19,.78);border:1px solid rgba(158,184,200,.38);">
          <span style="display:block;width:${fill};height:100%;border-radius:999px;background:${color};box-shadow:0 0 6px ${color};"></span>
        </span>
      </span>`;
  }

  _node(x, y, icon, title, value, sub, color, active, entityId, details=[], opts={}) {
    const click = entityId ? `class="pf-node-click" data-entity="${this._esc(entityId)}" style="cursor:pointer"` : '';
    const border = active ? color : 'rgba(148,173,189,.28)';
    const det = details.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(118,166,190,.16);display:flex;flex-direction:column;gap:2px;${opts.centerDetails ? 'align-items:center;' : ''}">${details.join('')}</div>` : '';
    const nodeW = opts.nodeW ?? 248, nodeH = opts.nodeH ?? (details.length ? 220 : 112);
    const nx = Number.isFinite(opts.nodeX) ? opts.nodeX : x - nodeW/2, ny = y - nodeH/2;
    const iconTile = `<div style="width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:28px;background:${color}18;border:1px solid ${color}55;box-shadow:${active ? `0 0 8px ${color}33` : 'none'};position:relative;flex:0 0 64px;">
              <span style="filter:${active ? `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color}99)` : 'none'}">${icon}</span>
            </div>`;
    const labels = `<div style="min-width:0;">
              <div style="font-size:12px;color:#93adbc;letter-spacing:.5px;text-transform:uppercase;">${this._esc(title)}</div>
              <div style="font-size:26px;font-weight:800;color:#f4fbff;line-height:1.15;margin-top:2px;white-space:nowrap;">${this._entityValue(value, entityId)}</div>
              <div style="font-size:12px;color:${this._esc(color)};font-weight:700;margin-top:2px;">${this._esc(sub || '')}</div>
            </div>`;
    const body = opts.centerIcon ? `
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);">${iconTile}</div>
          <div style="position:absolute;left:14px;right:14px;top:10px;text-align:center;">${labels}</div>
          <div style="position:absolute;left:14px;right:14px;bottom:10px;">${det}</div>` : `
          <div style="display:flex;align-items:center;gap:12px;">${iconTile}${labels}</div>
          ${det}`;
    return `
      <foreignObject x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" overflow="visible">
        <div xmlns="http://www.w3.org/1999/xhtml" ${click} style="box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;width:${nodeW}px;min-height:${nodeH}px;${opts.centerIcon ? 'position:relative;' : ''}padding:14px 14px 12px;border-radius:22px;background:linear-gradient(180deg,rgba(11,24,40,.90),rgba(7,16,28,.82));border:1px solid ${border};box-shadow:${active ? `0 0 0 1px ${color}22,0 0 28px ${color}22,0 18px 40px rgba(0,0,0,.35)` : '0 12px 30px rgba(0,0,0,.28)'};backdrop-filter:blur(6px);font-family:Roboto,Arial,sans-serif;color:#eef7ff;">
          ${body}
        </div>
      </foreignObject>`;
  }

  _consumerDefs() {
    const raw = Array.isArray(this._config?.consumers) ? this._config.consumers : [];
    return raw.filter(c => c && typeof c === 'object').map(c => ({
      entity: typeof c.entity === 'string' ? c.entity : '',
      name: c.name || c.entity || 'Consumer',
      icon: c.icon || 'mdi:flash',
      color: c.color || 'var(--primary-color)',
      min_w: Number.isFinite(Number(c.min_w)) ? Number(c.min_w) : 0,
      type: c.type || 'consumer',
    }));
  }

  _mdiToEmoji(icon) {
    const m = { 'mdi:ev-plug-type2':'🔌','mdi:fridge':'🧊','mdi:fridge-industrial':'🧊','mdi:chair-rolling':'🪑','mdi:desktop-classic':'🖥️','mdi:cctv':'📷','mdi:router-network':'📡','mdi:sofa':'🛋️','mdi:fan-chevron-up':'🌀','mdi:window-shutter':'🪟','mdi:air-humidifier':'💧','mdi:dishwasher':'🍽️','mdi:printer':'🖨️','mdi:music':'🎵','mdi:television':'📺','mdi:tumble-dryer':'🧺','mdi:generator-stationary':'⚙️','mdi:air-conditioner':'❄️','mdi:server':'🖥️','mdi:home':'🏠','mdi:flash':'⚡' };
    return m[icon] || '⚡';
  }

  _render() {
    const e = this._entities();
    const display = this._powerFlowDisplay();
    const layout = String(display.layout || 'cross') === 'left_right' ? 'left_right' : 'cross';
    const isPower = !this._isEnergyPeriod();
    const periods = this._periods();
    const period = periods.includes(this._period) ? this._period : 'power';
    this._period = period;
    const pvP = this._num(e.pv); const gridP = this._num(e.grid); const battP = this._num(e.battery);
    const soc = this._num(e.battery_soc); const loadP = this._num(e.load); const invP = this._num(e.inverter);
    const pvDaily = this._num(e.daily_pv_production);
    const gridBought = this._num(e.daily_energy_bought); const gridSold = this._num(e.daily_energy_sold);
    const battChargeDaily = this._num(e.daily_battery_charge); const battDischargeDaily = this._num(e.daily_battery_discharge);
    const loadDaily = this._num(e.daily_load_consumption);
    const battV = this._num(e.battery_voltage); const battA = this._num(e.battery_current); const battT = this._num(e.battery_temperature);
    const invT = this._num(e.inverter_temperature); const gridV = this._num(e.grid_l1_voltage);

    const pvE = this._energyVal('pv');
    const gridImportE = this._energyVal('grid_import');
    const gridExportE = this._energyVal('grid_export');
    const battChargeE = this._energyVal('batt_charge');
    const battDischargeE = this._energyVal('batt_discharge');
    const loadE = this._energyVal('load');

    const fmtVal = (w, kwh) => isPower ? this._fmtW(w) : this._fmtKwh(kwh);
    const pvVal = isPower ? Math.max(0, pvP || 0) : Math.max(0, pvE || 0);
    const gridImport = isPower ? Math.max(0, gridP || 0) : Math.max(0, gridImportE || 0);
    const gridExport = isPower ? Math.max(0, -(gridP || 0)) : Math.max(0, gridExportE || 0);
    const battRaw = isPower ? battP : (battChargeE != null || battDischargeE != null ? (Number(battChargeE||0) - Number(battDischargeE||0)) : null);
    const battCharge = isPower ? Math.max(0, -(battP || 0)) : Math.max(0, battChargeE || 0);
    const battDischarge = isPower ? Math.max(0, (battP || 0)) : Math.max(0, battDischargeE || 0);
    const calcLoadP = Math.max(0, (pvP || 0) + Math.max(0, gridP || 0) + Math.max(0, battP || 0) - (Math.max(0, -(gridP || 0)) + Math.max(0, -(battP || 0))));
    const loadVal = isPower ? calcLoadP : Math.max(0, loadE || 0);
    const invVal = isPower ? invP : (pvE != null || gridImportE != null || gridExportE != null || battChargeE != null || battDischargeE != null ? Math.max(0, Number(pvE||0)+Number(gridImportE||0)+Number(battDischargeE||0)-Number(gridExportE||0)-Number(battChargeE||0)) : null);

    const consumers = this._consumerDefs();
    const consumerData = consumers.map(c => {
      const p = this._num(c.entity);
      const active = p != null && Math.abs(p) >= (c.min_w || 0) && Math.abs(p) > 1;
      return { ...c, power: p, active, abs: Math.abs(p || 0) };
    });
    const namedConsumers = consumerData.filter(c => c.type !== 'rest');
    const restDef = consumerData.find(c => c.type === 'rest');
    const namedSum = namedConsumers.reduce((a,c)=>a + (c.abs || 0), 0);
    const restPower = Math.max(0, loadVal - namedSum);
    const showRest = !!restDef;
    const displayConsumers = namedConsumers.concat(showRest ? [{...restDef, name: restDef.name || 'Rest', icon: restDef.icon || 'mdi:cloud-question', power: restPower, abs: restPower, active: restPower >= (restDef.min_w||0) && restPower > 1, entity: ''}] : []);

    const W = 1200, PF_MARGIN = 44;
    const HALO_PAD = 16, HALO_SW = 8, RING_R = 121, RING_SW = 9;
    const DETAIL_ROW_H = 20;
    const DEFAULT_DETAIL_ROWS = { pv: 1, grid: 3, home: 2, batt: 6 };
    const statMap = this._statEntityMap();

    const pvDetails = this._nodeDetailRows('pv', {
      pv_energy: () => this._detailLine(isPower?'Today':this._periodLabel(period), this._fmtKwh(isPower?pvDaily:pvE),'#f6c945',statMap.pv),
    }, ['pv_energy']);
    const gridDetails = this._nodeDetailRows('grid', {
      grid_import: () => this._detailLine('Import '+(isPower?'today':period), this._fmtKwh(isPower?gridBought:gridImportE),'#5bc0ff',statMap.grid_import),
      grid_export: () => this._detailLine('Export '+(isPower?'today':period), this._fmtKwh(isPower?gridSold:gridExportE),'#7ee22d',statMap.grid_export),
      grid_voltage: () => this._detailLine('Voltage', this._fmtNum(gridV,1,' V'),'#9eb8c8',e.grid_l1_voltage),
    }, ['grid_import', 'grid_export', 'grid_voltage']);
    const homeDetails = this._nodeDetailRows('home', {
      home_energy: () => this._detailLine(isPower?'Today':this._periodLabel(period), this._fmtKwh(isPower?loadDaily:loadE),'#ff8a4c',statMap.load),
      home_consumers: () => this._detailLine('Consumers', String(displayConsumers.length)),
    }, ['home_energy', 'home_consumers']);
    const battDetails = this._nodeDetailRows('battery', {
      batt_soc: () => this._detailLine('SOC', soc!=null?`${Math.round(soc)} %`:'—','#7ee22d',e.battery_soc),
      batt_voltage: () => this._detailLine('Voltage', this._fmtNum(battV,1,' V'),'#9eb8c8',e.battery_voltage),
      batt_current: () => this._detailLine('Current', this._fmtNum(battA,1,' A'),'#9eb8c8',e.battery_current),
      batt_temperature: () => this._detailLine('Temp', this._fmtNum(battT,1,' °C'),'#9eb8c8',e.battery_temperature),
      batt_charged: () => this._detailLine('Charged '+(isPower?'today':period), this._fmtKwh(isPower?battChargeDaily:battChargeE),'#7ee22d',statMap.batt_charge),
      batt_discharged: () => this._detailLine('Discharged '+(isPower?'today':period), this._fmtKwh(isPower?battDischargeDaily:battDischargeE),'#ff8a4c',statMap.batt_discharge),
    }, ['batt_soc', 'batt_voltage', 'batt_current', 'batt_temperature', 'batt_charged', 'batt_discharged']);

    const dynamicNodeH = (key, base, rows) => Math.max(96, base + (rows.length - DEFAULT_DETAIL_ROWS[key]) * DETAIL_ROW_H);
    const SZ = {
      pv:   { w:174, h:dynamicNodeH('pv',132,pvDetails) },
      grid: { w:174, h:dynamicNodeH('grid',154,gridDetails) },
      inv:  { w:248, h:220 },
      home: { w:174, h:dynamicNodeH('home',165,homeDetails) },
      batt: { w:223, h:dynamicNodeH('batt',220,battDetails) },
    };
    const N = layout === 'left_right'
      ? { pv:[220,230], grid:[220,590], inv:[600,400], home:[980,590], batt:[980,230] }
      : { pv:[600,188.5], grid:[254.5,470], inv:[600,470], home:[945.5,470], batt:[600,825.5] };
    const PF_BOUNDS = {
      left: Math.min(N.pv[0]-SZ.pv.w/2-HALO_PAD, N.grid[0]-SZ.grid.w/2-HALO_PAD, N.inv[0]-RING_R-RING_SW/2, N.batt[0]-SZ.batt.w/2-HALO_PAD),
      right: Math.max(N.home[0]+SZ.home.w/2+HALO_PAD, N.batt[0]+SZ.batt.w/2+HALO_PAD, N.inv[0]+RING_R+RING_SW/2, N.pv[0]+SZ.pv.w/2+HALO_PAD, N.grid[0]+SZ.grid.w/2+HALO_PAD),
      top: Math.min(N.pv[1]-SZ.pv.h/2-HALO_PAD, N.batt[1]-SZ.batt.h/2-HALO_PAD, N.inv[1]-RING_R-RING_SW/2, N.home[1]-SZ.home.h/2-HALO_PAD, N.grid[1]-SZ.grid.h/2-HALO_PAD),
      bottom: Math.max(N.grid[1]+SZ.grid.h/2+HALO_PAD, N.home[1]+SZ.home.h/2+HALO_PAD, N.inv[1]+RING_R+RING_SW/2, N.batt[1]+SZ.batt.h/2+HALO_PAD, N.pv[1]+SZ.pv.h/2+HALO_PAD),
    };
    const PF_SCALE = (W - PF_MARGIN * 2) / (PF_BOUNDS.right - PF_BOUNDS.left);
    const PF_TX = PF_MARGIN - PF_BOUNDS.left * PF_SCALE;
    const PF_TY = PF_MARGIN - PF_BOUNDS.top * PF_SCALE;
    const H = Math.round(PF_MARGIN * 2 + (PF_BOUNDS.bottom - PF_BOUNDS.top) * PF_SCALE);
    const pos = N;
    // Links meet the outer edge of each halo. Entity surrounds share Battery's width.
    const SURROUND_W = SZ.batt.w + HALO_PAD * 2;
    // Entity cards start at Battery's inset from the left edge of the surround.
    const entityNodeX = (key) => N[key][0] - SURROUND_W / 2 + HALO_PAD;
    const ringR = RING_R + RING_SW / 2;
    const boxEdge = (key) => {
      const c = N[key], hw = SURROUND_W/2 + HALO_SW/2, hh = SZ[key].h/2 + HALO_PAD + HALO_SW/2;
      return { b: c[1] + hh, t: c[1] - hh, l: c[0] - hw, r: c[0] + hw };
    };
    const edge = {
      pv:   boxEdge('pv'),
      grid: boxEdge('grid'),
      inv:  { b: N.inv[1] + ringR, t: N.inv[1] - ringR, l: N.inv[0] - ringR, r: N.inv[0] + ringR },
      home: boxEdge('home'),
      batt: boxEdge('batt'),
    };
    const haloRect = (key, color) => {
      const c = N[key], hw = SURROUND_W/2, hh = SZ[key].h/2 + HALO_PAD;
      return `<rect x="${c[0]-hw}" y="${c[1]-hh}" width="${SURROUND_W}" height="${hh*2}" rx="36" fill="none" stroke="${color}" stroke-width="${HALO_SW}"/>`;
    };
    const straight = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y2}`;
    const curve = (x1, y1, x2, y2, bend = 0.45) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cx1 = x1 + dx * 0.2;
      const cy1 = y1 + dy * 0.85;
      const cx2 = x2 - dx * 0.2;
      const cy2 = y2 - dy * 0.85;
      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    };
    const angled = (x1, y1, x2, y2, tilt = 18) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const cx1 = x1 + dx * 0.35 + nx * tilt;
      const cy1 = y1 + dy * 0.35 + ny * tilt;
      const cx2 = x2 - dx * 0.35 + nx * tilt;
      const cy2 = y2 - dy * 0.35 + ny * tilt;
      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    };
    const invAttach = (signX, signY) => {
      const dy = signY * ringR * 0.45;
      const dx = signX * Math.sqrt(Math.max(0, ringR * ringR - dy * dy));
      return [N.inv[0] + dx, N.inv[1] + dy];
    };
    const [invLT_x, invLT_y] = invAttach(-1, -1);
    const [invLB_x, invLB_y] = invAttach(-1, 1);
    const [invRT_x, invRT_y] = invAttach(1, -1);
    const [invRB_x, invRB_y] = invAttach(1, 1);
    const pvToInv = layout === 'left_right'
      ? curve(edge.pv.r, N.pv[1], invLT_x, invLT_y, 0.45)
      : straight(N.pv[0], edge.pv.b, N.inv[0], edge.inv.t);
    const gridToInv = layout === 'left_right'
      ? curve(edge.grid.r, N.grid[1], invLB_x, invLB_y, 0.45)
      : straight(edge.grid.r, N.grid[1], edge.inv.l, N.inv[1]);
    const invToGrid = layout === 'left_right'
      ? curve(invLB_x, invLB_y, edge.grid.r, N.grid[1], 0.45)
      : straight(edge.inv.l, N.inv[1], edge.grid.r, N.grid[1]);
    const invToHome = layout === 'left_right'
      ? curve(invRB_x, invRB_y, edge.home.l, N.home[1], 0.45)
      : straight(edge.inv.r, N.inv[1], edge.home.l, N.home[1]);
    const battToInv = layout === 'left_right'
      ? curve(edge.batt.l, N.batt[1], invRT_x, invRT_y, 0.45)
      : straight(N.batt[0], edge.batt.t, N.inv[0], edge.inv.b);
    const invToBatt = layout === 'left_right'
      ? curve(invRT_x, invRT_y, edge.batt.l, N.batt[1], 0.45)
      : straight(N.inv[0], edge.inv.b, N.batt[0], edge.batt.t);

    const flows = [];
    flows.push(this._flow('pf-pv-inv', pvToInv, '#f6c945', isPower ? pvVal : (pvVal>0.01?1000:0), 1));
    if (gridImport > 0) flows.push(this._flow('pf-grid-inv', gridToInv, '#5bc0ff', isPower ? Math.max(gridImport, 10.01) : 1000, 1));
    else if (gridExport > 0) flows.push(this._flow('pf-grid-inv', invToGrid, '#5bc0ff', isPower ? Math.max(gridExport, 10.01) : 1000, -1));
    else flows.push(this._flow('pf-grid-inv', gridToInv, '#5bc0ff', 0, 0));
    flows.push(this._flow('pf-inv-home', invToHome, '#ff8a4c', isPower?loadVal:(loadVal>0.01?1000:0), 1));
    if (battDischarge > (isPower?10:0.01)) flows.push(this._flow('pf-batt-inv', battToInv, '#7ee22d', isPower?battDischarge:1000, 1));
    else if (battCharge > (isPower?10:0.01)) flows.push(this._flow('pf-batt-inv', invToBatt, '#7ee22d', isPower?battCharge:1000, -1));
    else flows.push(this._flow('pf-batt-inv', battToInv, '#7ee22d', 0, 0));

    const gridLabel = gridImport > 0 ? 'Importing' : gridExport > 0 ? 'Exporting' : 'Idle';
    const battLabel = battDischarge > (isPower?10:0.01) ? 'Discharging' : battCharge > (isPower?10:0.01) ? 'Charging' : 'Idle';
    const socText = soc != null ? `SOC ${Math.round(soc)}%` : '';
    const unavailable = [e.pv,e.grid,e.battery,e.battery_soc,e.load,e.inverter].filter(id => !this._hass?.states?.[id]);
    const warn = unavailable.length ? `<div style="margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(255,170,0,.10);border:1px solid rgba(255,170,0,.28);color:#ffd38a;font-size:12px;">Missing/unavailable entities: ${unavailable.map(x => this._esc(x)).join(', ')}</div>` : '';

    const periodBtns = periods.map(p => {
      const active = p === period;
      return `<button class="pf-period" data-period="${this._esc(p)}" style="cursor:pointer;padding:7px 12px;border-radius:999px;border:1px solid ${active?'rgba(126,226,45,.55)':'rgba(118,166,190,.20)'};background:${active?'rgba(126,226,45,.14)':'rgba(255,255,255,.03)'};color:${active?'#d9ffb0':'#9eb8c8'};font-size:12px;font-weight:700;">${this._esc(this._periodLabel(p))}</button>`;
    }).join('');

    const summaryChips = [
      ['Overall grid', [
        ['import', this._fmtW(this._num(e.overall_grid_import)), '#7ee22d', e.overall_grid_import],
        ['export', this._fmtW(this._num(e.overall_grid_export)), '#7ee22d', e.overall_grid_export],
      ]],
      ['Electricity', [
        ['bolt', this._fmtKwh(this._num(e.electricity_import_today)), '#5bc0ff', e.electricity_import_today],
        ['pound', this._fmtGbp(this._num(e.electricity_cost_today)), '#ff5d70', e.electricity_cost_today],
      ]],
      ['Gas', [
        ['flame', this._fmtKwh(this._num(e.gas_import_today)), '#5bc0ff', e.gas_import_today],
        ['pound', this._fmtGbp(this._num(e.gas_cost_today)), '#ff5d70', e.gas_cost_today],
      ]],
      ['Export', [
        ['export', this._fmtKwh(this._num(e.electricity_export_today)), '#5bc0ff', e.electricity_export_today],
        ['pound', this._fmtGbp(this._num(e.electricity_income_today)), '#7ee22d', e.electricity_income_today],
      ]],
      ...(Array.isArray(display.chip_rows?.summary) ? display.chip_rows.summary : []).map((chip) => [
        chip.label,
        (Array.isArray(chip.items) ? chip.items : []).map((item) => [
          item.kind,
          this._configValue(item.entity, item.format),
          item.color || '#bc63ff',
          item.entity,
        ]),
      ]),
    ].map(([title, items]) => `<div style="flex:1;min-width:220px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.035);border:1px solid rgba(118,166,190,.18);">
        <div style="font-size:11px;color:#9eb8c8;letter-spacing:.4px;text-transform:uppercase;">${this._esc(title)}</div>
        <div style="display:flex;align-items:center;gap:16px;margin-top:8px;">
          ${items.map(([kind, value, color, entity]) => `<div style="display:flex;align-items:center;gap:7px;min-width:0;">${this._summaryIcon(kind, color)}${this._entityValue(value, entity, `font-size:18px;font-weight:800;color:${color};text-shadow:0 0 14px ${color}55;white-space:nowrap;`)}</div>`).join('')}
        </div>
      </div>`).join('');

    const pvNode = this._node(pos.pv[0],pos.pv[1],this._nodeIcon('solar-pv'),'PV',fmtVal(pvVal,pvE), isPower?(pvVal>10?'Generating':'Idle'):this._periodLabel(period),'#f6c945',(isPower?pvVal>10:pvVal>0.01),e.pv,pvDetails, { nodeW: SZ.pv.w, nodeH: SZ.pv.h, nodeX: entityNodeX('pv') });
    const gridNode = this._node(pos.grid[0],pos.grid[1],this._nodeIcon('grid'),'Grid', isPower?this._fmtW(gridP):(gridImportE!=null||gridExportE!=null?`${this._fmtKwh(gridImportE)} in`:'—'), gridLabel,'#5bc0ff',(gridImport>0||gridExport>0),e.grid,gridDetails, { nodeW: SZ.grid.w, nodeH: SZ.grid.h, nodeX: entityNodeX('grid') });
    const invNode = this._node(pos.inv[0],pos.inv[1],this._nodeIcon('inverter'),'Inverter',fmtVal(invVal,invVal), invP!=null||!isPower?'Active':'Unavailable','#bc63ff',(isPower?invP!=null&&Math.abs(invP)>10:invVal!=null&&invVal>0.01),e.inverter,this._nodeDetailRows('inverter', {
      inv_temperature: () => this._detailLine('Temperature', this._fmtNum(invT,1,' °C'),'#bc63ff',e.inverter_temperature),
      inv_status: () => this._detailLine('Status', invP!=null||!isPower?'Online':'—'),
    }, ['inv_temperature', 'inv_status']), { centerIcon: true, centerDetails: true });
    const homeNode = this._node(pos.home[0],pos.home[1],this._nodeIcon('home'),'Home',fmtVal(loadVal,loadE), isPower?(loadVal>10?'Consuming':'Idle'):this._periodLabel(period),'#ff8a4c',(isPower?loadVal>10:loadVal>0.01),e.load,homeDetails, { nodeW: SZ.home.w, nodeH: SZ.home.h, nodeX: entityNodeX('home') });
    const battNode = this._node(pos.batt[0],pos.batt[1],this._batteryNodeIcon(soc),'Battery',fmtVal(isPower?(battP!=null?-battP:null):battRaw, isPower?null:null), [battLabel,socText].filter(Boolean).join(' · '),'#7ee22d',(battCharge>(isPower?10:0.01)||battDischarge>(isPower?10:0.01)),e.battery,battDetails, { nodeW: SZ.batt.w, nodeH: SZ.batt.h, nodeX: entityNodeX('batt') });

    const consumerHtml = displayConsumers.length ? `
      <div style="margin-top:14px;padding:14px;border-radius:18px;border:1px solid rgba(118,166,190,.18);background:rgba(255,255,255,.02);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="font-size:14px;font-weight:800;color:#eef7ff;letter-spacing:.2px;">Consumers</div>
          <div style="font-size:11px;color:#93adbc;">${isPower?'Live power':'Period view uses live power for consumers'}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
          ${displayConsumers.map(c => {
            const active = c.active;
            const col = c.color && c.color.startsWith('var(') ? '#9eb8c8' : (c.color || '#9eb8c8');
            const border = active ? 'rgba(126,226,45,.35)' : 'rgba(118,166,190,.16)';
            const icon = c.icon && c.icon.startsWith('mdi:') ? this._mdiToEmoji(c.icon) : (c.icon || '⚡');
            const cls = c.entity ? 'pf-consumer-click' : '';
            const data = c.entity ? `data-entity="${this._esc(c.entity)}"` : '';
            return `<div class="${cls}" ${data} style="cursor:${c.entity?'pointer':'default'};padding:12px;border-radius:14px;background:linear-gradient(180deg,rgba(10,22,36,.82),rgba(7,16,28,.72));border:1px solid ${border};box-shadow:${active?'0 0 18px rgba(126,226,45,.08)':'none'};">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;background:rgba(255,255,255,.04);border:1px solid rgba(118,166,190,.18);">${this._esc(icon)}</div>
                <div style="min-width:0;flex:1;">
                  <div style="font-size:12px;color:#93adbc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(c.name)}</div>
                  <div style="font-size:20px;font-weight:800;color:${active?'#eef7ff':'#9eb8c8'};">${this._esc(this._fmtW(c.power))}</div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    this.innerHTML = `
      <ha-card style="width:100%;max-width:none;box-sizing:border-box;height:100%;min-height:1100px;display:flex;flex-direction:column;overflow:hidden;font-family:Roboto,Arial,sans-serif;background:radial-gradient(ellipse at 20% 0%,rgba(39,120,190,.25),transparent 35%),radial-gradient(ellipse at 80% 100%,rgba(126,226,45,.10),transparent 30%),linear-gradient(180deg,#020913,#06131c 55%,#040b11);border:1px solid rgba(101,142,164,.34);box-shadow:0 24px 60px rgba(0,0,0,.45);color:#eef7ff;">
        <style>
          @keyframes pfPulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.05;transform:scale(1.08)}}
          .pf-flow-line{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;filter:url(#pf-line-glow)}
          .pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:2.5;opacity:.34;filter:url(#pf-line-glow)}
          .pf-flow-active{stroke-width:2!important}
          .pf-balls{pointer-events:none}
          .pf-value-click{cursor:pointer;text-decoration:underline dotted rgba(158,184,200,.45);text-underline-offset:3px}
          .pf-value-click:hover{text-decoration-color:currentColor}
          @media (max-width:640px){
            .pf-periods{position:static!important;margin:0 0 10px!important;max-width:none!important;justify-content:flex-start!important}
            .pf-diagram{aspect-ratio:auto!important}
            .pf-diagram svg{height:auto!important;aspect-ratio:${W} / ${H}}}
        </style>
        <div style="display:flex;flex-direction:column;height:100%;padding:18px;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;">
            <div>
              <div style="font-size:30px;font-weight:800;letter-spacing:.2px;">${this._esc(this._config.title || 'Deye Energy Power Flow')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <div style="font-size:12px;color:#9eb8c8;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(118,166,190,.18);">${this._statsLoading ? 'Loading…' : new Date().toLocaleString()}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">${summaryChips}</div>
          <div class="pf-diagram" style="width:100%;aspect-ratio:${W} / ${H};margin-top:14px;border-radius:20px;overflow:hidden;border:1px solid rgba(118,166,190,.18);background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008));position:relative;">
            <div class="pf-periods" style="position:absolute;top:12px;${layout === 'left_right' ? 'left:50%;transform:translateX(-50%);justify-content:center;' : 'right:12px;justify-content:flex-end;'}z-index:2;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px);">${periodBtns}</div>
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" style="width:100%;height:100%;display:block;">
              <defs>
                <linearGradient id="pf-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(77,163,255,.10)"/><stop offset="100%" stop-color="rgba(126,226,45,.04)"/></linearGradient>
                <filter id="pf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="pf-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="3.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="pf-icon-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <pattern id="pf-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M 44 0 L 0 0 0 44" fill="none" stroke="rgba(158,184,200,.045)" stroke-width="1"/></pattern>
              </defs>
              <rect x="0" y="0" width="${W}" height="${H}" fill="url(#pf-bg)" opacity="0.55"/>
              <rect x="0" y="0" width="${W}" height="${H}" fill="url(#pf-grid)"/>
              <g transform="translate(${PF_TX} ${PF_TY}) scale(${PF_SCALE})">
                <circle cx="${N.inv[0]}" cy="${N.inv[1]}" r="${RING_R}" fill="none" stroke="rgba(188,99,255,.05)" stroke-width="${RING_SW}"/>
                ${haloRect('pv', 'rgba(246,201,69,.10)')}
                ${haloRect('grid', 'rgba(91,192,255,.10)')}
                ${haloRect('home', 'rgba(255,138,76,.10)')}
                ${haloRect('batt', 'rgba(126,226,45,.10)')}
                ${flows.join('')}
                ${pvNode}
                ${gridNode}
                ${invNode}
                ${homeNode}
                ${battNode}
              </g>
            </svg>
          </div>
          ${consumerHtml}
          ${warn}
        </div>
      </ha-card>`;
    this._bindFlowAnimation();
    this._startFlowAnimation();
  }
}

