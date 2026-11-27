// Resource revision: v=0.8.1.09
export class DeyeEnergyGraphsCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._range = '6h';
    this._group = 'power_flow';
    this._customRange = false;
    this._customFrom = '';
    this._customTo = '';
    this._loading = false;
    this._error = '';
    this._history = {};
    this._lastFetch = 0;
    this._lastSig = '';
    this._graphsSig = '';
    this._timer = null;
  }

  static getStubConfig() {
    return { title: 'Deye Energy Graphs', default_range: '6h' };
  }

  getCardSize() { return 8; }

  setConfig(config) {
    this._config = config || {};
    this._range = this._config.default_range || '6h';
    this._history = {};
    this._lastFetch = 0;
    this._lastSig = '';
    this._chartMeta = {};
  }

  disconnectedCallback() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._chartMeta = {};
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    const newGraphsSig = JSON.stringify(this._graphsDisplay() || null);
    const graphsChanged = !old || newGraphsSig !== this._graphsSig;
    if (graphsChanged) {
      this._graphsSig = newGraphsSig;
      this._lastSig = '';
      this._scheduleFetch(0);
    } else if (!old || (hass && hass.connected !== old.connected)) {
      this._scheduleFetch(0);
    }
    this._render();
  }

  _scheduleFetch(delay = 30000) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._fetchHistory(); }, delay);
  }

  _ranges() {
    return [
      ['1h', '1h', 60 * 60 * 1000],
      ['6h', '6h', 6 * 60 * 60 * 1000],
      ['24h', '24h', 24 * 60 * 60 * 1000],
      ['7d', '7d', 7 * 24 * 60 * 60 * 1000],
      ['30d', '30d', 30 * 24 * 60 * 60 * 1000],
      ['1y', '1y', 365 * 24 * 60 * 60 * 1000],
    ];
  }

  _rangeMs() {
    const found = this._ranges().find(r => r[0] === this._range);
    return found ? found[2] : 6 * 60 * 60 * 1000;
  }

  _defaultEntities() {
    return {
      grid_voltage: 'sensor.deye_grid_voltage',
      grid_frequency: 'sensor.deye_grid_frequency',
      grid_power: 'sensor.deye_grid_power',
      load_power: 'sensor.deye_load_power',
      inverter_power: 'sensor.deye_inverter_power',
      ac_output_voltage: 'sensor.totals_ac_output_voltage',
      battery_soc: 'sensor.deye_battery_soc',
      battery_power: 'sensor.deye_battery_power',
      battery_current: 'sensor.deye_battery_current',
      battery_voltage: 'sensor.deye_battery_voltage',
      battery_temperature: 'sensor.deye_battery_temperature',
      inverter_rad_temperature: 'sensor.deye_radiator_temperature',
      inverter_dc_transformer_temperature: 'sensor.deye_dc_transformer_temperature',
      inverter_ac_temperature: 'sensor.garage_deye_energy_inverter_ac_temperature',
    };
  }

  _entities() {
    return { ...this._defaultEntities(), ...(this._config.entities || {}) };
  }

  _graphsDisplay() {
    const states = this._hass?.states || {};
    const entry = Object.entries(states).find(([id, state]) => id.startsWith("sensor.") && id.endsWith("_ai_state") && state?.attributes?.graphs_display);
    const source = entry?.[1]?.attributes?.graphs_display;
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    return source;
  }

  _defaultGraphGroups() {
    const e = this._entities();
    return [
      { key: 'power_flow', label: 'Power flow', enabled: true, charts: [{ key: 'power_flow', title: 'Power flow', unit: 'W', enabled: true, series: [
        { key: 'grid_power', label: 'Grid', entity: e.grid_power, color: '#5bc0ff', enabled: true },
        { key: 'load_power', label: 'Load', entity: e.load_power, color: '#f6a619', enabled: true },
        { key: 'battery_power', label: 'Battery', entity: e.battery_power, color: '#7ee22d', enabled: true },
        { key: 'inverter_power', label: 'Inverter', entity: e.inverter_power, color: '#bc63ff', enabled: true },
      ]}]},
      { key: 'inverter', label: 'Inverter', enabled: true, charts: [
        { key: 'ac_output_voltage', title: 'AC output voltage', unit: 'V', enabled: true, series: [{ key: 'ac_output_voltage', label: 'AC output voltage', entity: e.ac_output_voltage, color: '#5bc0ff', enabled: true }] },
        { key: 'ac_inverter_output_power', title: 'AC inverter output power', unit: 'W', enabled: true, series: [{ key: 'inverter_power', label: 'Inverter output power', entity: e.inverter_power, color: '#bc63ff', enabled: true }] },
        { key: 'inverter_temperatures', title: 'Inverter temperatures', unit: '°C', enabled: true, series: [
          { key: 'inverter_rad_temperature', label: 'Radiator', entity: e.inverter_rad_temperature, color: '#ff7a45', enabled: true },
          { key: 'inverter_dc_transformer_temperature', label: 'DC transformer', entity: e.inverter_dc_transformer_temperature, color: '#f6a619', enabled: true },
          { key: 'inverter_ac_temperature', label: 'AC temperature', entity: e.inverter_ac_temperature, color: '#5bc0ff', enabled: true },
        ]},
      ]},
      { key: 'grid', label: 'Grid', enabled: true, charts: [
        { key: 'grid_voltage', title: 'Grid voltage', unit: 'V', enabled: true, series: [{ key: 'grid_voltage', label: 'Grid voltage', entity: e.grid_voltage, color: '#5bc0ff', enabled: true }] },
        { key: 'grid_frequency', title: 'Grid frequency', unit: 'Hz', enabled: true, series: [{ key: 'grid_frequency', label: 'Grid frequency', entity: e.grid_frequency, color: '#35d66f', enabled: true }] },
        { key: 'grid_power', title: 'Grid power (input / output)', unit: 'W', enabled: true, series: [{ key: 'grid_power', label: 'Grid power', entity: e.grid_power, color: '#5bc0ff', enabled: true }] },
      ]},
      { key: 'load', label: 'Load', enabled: true, charts: [
        { key: 'load_power', title: 'Load power', unit: 'W', enabled: true, series: [{ key: 'load_power', label: 'Load power', entity: e.load_power, color: '#f6a619', enabled: true }] },
      ]},
      { key: 'battery', label: 'Battery', enabled: true, charts: [
        { key: 'battery_soc', title: 'Battery SOC', unit: '%', enabled: true, series: [{ key: 'battery_soc', label: 'SOC', entity: e.battery_soc, color: '#7ee22d', enabled: true }] },
        { key: 'battery_power', title: 'Battery power', unit: 'W', enabled: true, series: [{ key: 'battery_power', label: 'Battery power', entity: e.battery_power, color: '#7ee22d', enabled: true }] },
        { key: 'battery_current', title: 'Battery current', unit: 'A', enabled: true, series: [{ key: 'battery_current', label: 'Battery current', entity: e.battery_current, color: '#5bc0ff', enabled: true }] },
        { key: 'battery_voltage', title: 'DC voltage', unit: 'V', enabled: true, series: [{ key: 'battery_voltage', label: 'DC voltage', entity: e.battery_voltage, color: '#bc63ff', enabled: true }] },
        { key: 'battery_temperatures', title: 'Battery temperature', unit: '°C', enabled: true, series: [{ key: 'battery_temperature', label: 'Battery temperature', entity: e.battery_temperature, color: '#ff7a45', enabled: true }] },
      ]},
    ];
  }

  _groupDefs() {
    const display = this._graphsDisplay();
    const rawGroups = Array.isArray(display?.groups) && display.groups.length ? display.groups : this._defaultGraphGroups();
    const groups = rawGroups
      .filter(g => g && g.enabled !== false)
      .map(g => ({
        key: String(g.key || ''),
        title: String(g.label || g.key || 'Group'),
        charts: (Array.isArray(g.charts) ? g.charts : [])
          .filter(c => c && c.enabled !== false)
          .map(c => ({
            key: String(c.key || ''),
            title: String(c.title || c.key || 'Chart'),
            unit: String(c.unit || ''),
            series: (Array.isArray(c.series) ? c.series : [])
              .filter(s => s && s.enabled !== false && String(s.entity || '').trim())
              .map(s => ({
                key: String(s.key || ''),
                label: String(s.label || s.key || 'Series'),
                entity: String(s.entity || ''),
                color: String(s.color || '#5bc0ff'),
              })),
          }))
          .filter(c => c.series.length),
      }))
      .filter(g => g.charts.length);
    return groups.length ? groups : this._defaultGraphGroups().map(g => ({ ...g, title: g.label })).map(g => ({ key: g.key, title: g.label, charts: g.charts.map(c => ({ key:c.key, title:c.title, unit:c.unit, series:c.series.filter(s=>s.enabled!==false) })) }));
  }

  _allEntityIds() {
    const ids = new Set();
    for (const g of this._groupDefs()) for (const c of g.charts) for (const s of c.series) if (s.entity) ids.add(s.entity);
    return [...ids];
  }

  async _fetchHistory() {
    if (!this._hass || this._loading) return;
    const ids = this._allEntityIds();
    if (!ids.length) return;
    this._loading = true;
    this._error = '';
    this._render();
    try {
      let start;
      let end;
      if (this._customRange && this._customFrom && this._customTo) {
        start = new Date(this._customFrom);
        end = new Date(this._customTo);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
          throw new Error('Invalid custom date range. Ensure From is before To.');
        }
      } else {
        end = new Date();
        start = new Date(end.getTime() - this._rangeMs());
      }
      const url = `history/period/${start.toISOString()}?filter_entity_id=${ids.join(',')}&end_time=${end.toISOString()}&minimal_response=1&no_attributes=1&significant_changes_only=0`;
      const data = await this._hass.callApi('GET', url);
      const map = {};
      (Array.isArray(data) ? data : []).forEach(arr => {
        const arrItems = Array.isArray(arr) ? arr : [];
        const id = arrItems.find(i => i && i.entity_id)?.entity_id;
        if (!id) return;
        arrItems.forEach(item => {
          const t = new Date(item.last_changed || item.last_updated || 0).getTime();
          const v = Number(item.state);
          if (!Number.isFinite(t) || !Number.isFinite(v)) return;
          if (!map[id]) map[id] = [];
          map[id].push([t, v]);
        });
      });
      this._history = map;
      this._lastFetch = Date.now();
    } catch (e) {
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
      this._lastSig = '';
      if (!this.isConnected) return;
      this._render();
      this._scheduleFetch(60000);
    }
  }

  _fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  _esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _chartSvg(chart) {
    const w = 640, h = 220, padL = 46, padR = 12, padT = 12, padB = 28;
    const seriesData = chart.series.map(s => ({ ...s, points: (this._history[s.entity] || []).slice().sort((a, b) => a[0] - b[0]) }));
    const all = seriesData.flatMap(s => s.points);
    if (!all.length) {
      return `<div style="height:${h}px;display:flex;align-items:center;justify-content:center;color:var(--g-muted);font-size:0.95em;border:1px dashed rgba(118,166,190,.22);border-radius:10px;background:rgba(255,255,255,.02);">No history data for selected range</div>`;
    }
    let minX = Math.min(...all.map(p => p[0]));
    let maxX = Math.max(...all.map(p => p[0]));
    let minY = Math.min(...all.map(p => p[1]));
    let maxY = Math.max(...all.map(p => p[1]));
    if (minX === maxX) maxX = minX + 1;
    if (minY === maxY) { minY -= 1; maxY += 1; }
    if (minY > 0 && (chart.unit === '%' || chart.unit === 'V' || chart.unit === 'Hz')) minY = Math.min(0, minY);
    const spanY = maxY - minY || 1;
    minY -= spanY * 0.08; maxY += spanY * 0.08;
    const x = t => padL + ((t - minX) / (maxX - minX)) * (w - padL - padR);
    const y = v => padT + (1 - (v - minY) / (maxY - minY || 1)) * (h - padT - padB);
    const gridLines = 4;
    let grid = '';
    for (let i = 0; i <= gridLines; i++) {
      const val = minY + (spanY * 1.16) * (i / gridLines);
      const yy = padT + (1 - i / gridLines) * (h - padT - padB);
      grid += `<line x1="${padL}" y1="${yy.toFixed(2)}" x2="${w - padR}" y2="${yy.toFixed(2)}" stroke="rgba(158,184,200,.14)" stroke-dasharray="4 4"/>`;
      grid += `<text x="${padL - 8}" y="${(yy + 4).toFixed(2)}" text-anchor="end" fill="#9eb8c8" font-size="10">${this._esc(val.toFixed(val >= 100 ? 0 : 1))}</text>`;
    }
    const xLabels = 4;
    let xLbl = '';
    for (let i = 0; i <= xLabels; i++) {
      const t = minX + (maxX - minX) * (i / xLabels);
      const xx = x(t);
      xLbl += `<text x="${xx.toFixed(2)}" y="${h - 8}" text-anchor="middle" fill="#9eb8c8" font-size="10">${this._esc(this._fmtTime(t))}</text>`;
    }
    let paths = '';
    let lastVals = [];
    let hoverDots = '';
    seriesData.forEach((s, idx) => {
      if (!s.points.length) return;
      const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(2)} ${y(p[1]).toFixed(2)}`).join(' ');
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round"/>`;
      const lv = s.points[s.points.length - 1][1];
      lastVals.push(`<span style="color:${s.color};white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:4px;vertical-align:middle;"></span>${this._esc(s.label)}: <strong>${this._esc(lv.toFixed(2))}${this._esc(chart.unit)}</strong></span>`);
      hoverDots += `<circle class="g-hover-dot" data-series="${idx}" r="4" fill="${s.color}" stroke="#eef7ff" stroke-width="1.5" visibility="hidden"></circle>`;
    });
    this._chartMeta = this._chartMeta || {};
    this._chartMeta[chart.key] = {
      w, h, padL, padR, padT, padB, minX, maxX, minY, maxY, unit: chart.unit || '',
      series: seriesData.map(s => ({ label: s.label, color: s.color, points: s.points })),
    };
    const hoverReadout = `<div class="g-hover-readout" style="margin-top:8px;min-height:22px;font-size:12px;color:#9eb8c8;">Hover graph to see time and values</div>`;
    return `
      <div class="g-chart-wrap" data-chart-key="${this._esc(chart.key)}">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:var(--g-muted);">${lastVals.join('')}</div>
        <svg class="g-svg" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01));border-radius:10px;border:1px solid rgba(118,166,190,.16);cursor:crosshair;">
          ${grid}
          ${paths}
          ${xLbl}
          <line class="g-hover-x" x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(238,247,255,.45)" stroke-dasharray="4 4" visibility="hidden"></line>
          <line class="g-hover-y" x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="rgba(238,247,255,.45)" stroke-dasharray="4 4" visibility="hidden"></line>
          ${hoverDots}
          <rect class="g-capture" x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="transparent"></rect>
        </svg>
        ${hoverReadout}
      </div>`;
  }

  _attachChartHovers() {
    this.querySelectorAll('.g-chart-wrap[data-chart-key]').forEach(wrap => {
      const key = wrap.getAttribute('data-chart-key');
      const meta = this._chartMeta?.[key];
      const svg = wrap.querySelector('.g-svg');
      const capture = wrap.querySelector('.g-capture');
      const readout = wrap.querySelector('.g-hover-readout');
      const hx = wrap.querySelector('.g-hover-x');
      const hy = wrap.querySelector('.g-hover-y');
      if (!meta || !svg || !capture) return;

      const x = t => meta.padL + ((t - meta.minX) / (meta.maxX - meta.minX || 1)) * (meta.w - meta.padL - meta.padR);
      const y = v => meta.padT + (1 - (v - meta.minY) / (meta.maxY - meta.minY || 1)) * (meta.h - meta.padT - meta.padB);
      const xToT = px => meta.minX + ((px - meta.padL) / (meta.w - meta.padL - meta.padR || 1)) * (meta.maxX - meta.minX);
      const hide = () => {
        if (hx) hx.setAttribute('visibility', 'hidden');
        if (hy) hy.setAttribute('visibility', 'hidden');
        wrap.querySelectorAll('.g-hover-dot').forEach(d => d.setAttribute('visibility', 'hidden'));
        if (readout) readout.innerHTML = 'Hover graph to see time and values';
      };

      capture.addEventListener('mousemove', (evt) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const sx = ((evt.clientX - rect.left) / rect.width) * meta.w;
        const sy = ((evt.clientY - rect.top) / rect.height) * meta.h;
        const t = xToT(Math.min(meta.w - meta.padR, Math.max(meta.padL, sx)));
        let nearestT = null;
        let nearestDist = Infinity;
        meta.series.forEach(s => {
          s.points.forEach(p => {
            const d = Math.abs(p[0] - t);
            if (d < nearestDist) { nearestDist = d; nearestT = p[0]; }
          });
        });
        if (nearestT == null) { hide(); return; }
        const px = x(nearestT);
        if (hx) {
          hx.setAttribute('x1', px.toFixed(2));
          hx.setAttribute('x2', px.toFixed(2));
          hx.setAttribute('y1', String(meta.padT));
          hx.setAttribute('y2', String(meta.h - meta.padB));
          hx.setAttribute('visibility', 'visible');
        }
        const hoverY = Math.min(meta.h - meta.padB, Math.max(meta.padT, sy));
        if (hy) {
          hy.setAttribute('x1', String(meta.padL));
          hy.setAttribute('x2', String(meta.w - meta.padR));
          hy.setAttribute('y1', hoverY.toFixed(2));
          hy.setAttribute('y2', hoverY.toFixed(2));
          hy.setAttribute('visibility', 'visible');
        }
        const values = [];
        meta.series.forEach((s, idx) => {
          let best = null, bestD = Infinity;
          s.points.forEach(p => { const d = Math.abs(p[0] - nearestT); if (d < bestD) { bestD = d; best = p; } });
          const dot = wrap.querySelector(`.g-hover-dot[data-series="${idx}"]`);
          if (best) {
            const py = y(best[1]);
            if (dot) { dot.setAttribute('cx', px.toFixed(2)); dot.setAttribute('cy', py.toFixed(2)); dot.setAttribute('visibility', 'visible'); }
            values.push(`<span style="color:${s.color};white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:4px;vertical-align:middle;"></span>${this._esc(s.label)}: <strong>${this._esc(best[1].toFixed(2))}${this._esc(meta.unit)}</strong></span>`);
          } else if (dot) {
            dot.setAttribute('visibility', 'hidden');
          }
        });
        if (readout) {
          readout.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;"><span style="color:#eef7ff;font-weight:600;">${this._esc(new Date(nearestT).toLocaleString())}</span>${values.join('')}</div>`;
        }
      });
      capture.addEventListener('mouseleave', hide);
    });
  }

  _render() {
    if (!this._hass) return;
    const groups = this._groupDefs();
    const activeGroup = groups.find(g => g.key === this._group) || groups[0];
    if (activeGroup && this._group !== activeGroup.key) this._group = activeGroup.key;
    const sig = JSON.stringify({ r: this._range, g: this._group, c: this._customRange, cf: this._customFrom, ct: this._customTo, l: this._loading, e: this._error, lf: this._lastFetch, ids: this._allEntityIds().map(id => this._hass.states[id]?.last_updated || '') });
    if (sig === this._lastSig && this.querySelector('.graphs-root')) return;
    this._lastSig = sig;

    const ranges = this._ranges().map(([k, label]) => {
      const active = !this._customRange && this._range === k;
      return `<button class="rg" data-range="${k}" style="padding:6px 12px;border-radius:6px 6px 0 0;border:1px solid ${active ? 'rgba(118,166,190,.28)' : 'transparent'};border-bottom:2px solid ${active ? 'rgba(77,163,255,.9)' : 'transparent'};background:${active ? 'rgba(77,163,255,.14)' : 'transparent'};color:#eef7ff;cursor:pointer;font-size:12px;margin-bottom:-2px;">${label}</button>`;
    }).join('');
    const customControls = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;">
        <label style="font-size:12px;color:#9eb8c8;">From <input class="g-from" type="datetime-local" value="${this._esc(this._customFrom)}" style="margin-left:4px;background:rgba(255,255,255,.04);color:#eef7ff;border:1px solid rgba(118,166,190,.28);border-radius:8px;padding:4px 6px;"></label>
        <label style="font-size:12px;color:#9eb8c8;">To <input class="g-to" type="datetime-local" value="${this._esc(this._customTo)}" style="margin-left:4px;background:rgba(255,255,255,.04);color:#eef7ff;border:1px solid rgba(118,166,190,.28);border-radius:8px;padding:4px 6px;"></label>
        <button class="g-clear" style="padding:5px 12px;border-radius:999px;border:1px solid rgba(118,166,190,.28);background:rgba(255,255,255,.03);color:#eef7ff;cursor:pointer;font-size:12px;">Clear</button>
        <button class="g-apply" style="padding:5px 12px;border-radius:999px;border:1px solid ${this._customRange ? 'rgba(126,226,45,.65)' : 'rgba(118,166,190,.28)'};background:${this._customRange ? 'rgba(126,226,45,.14)' : 'rgba(255,255,255,.03)'};color:#eef7ff;cursor:pointer;font-size:12px;">Apply range</button>
      </div>`;
    const groupTabs = groups.map(g => {
      const active = g.key === this._group;
      return `<button class="gg" data-group="${g.key}" style="padding:8px 14px;border-radius:6px 6px 0 0;border:1px solid ${active ? 'rgba(118,166,190,.28)' : 'transparent'};border-bottom:2px solid ${active ? 'rgba(126,226,45,.85)' : 'transparent'};background:${active ? 'rgba(126,226,45,.12)' : 'transparent'};color:#eef7ff;cursor:pointer;font-size:13px;font-weight:${active ? '600' : '500'};margin-bottom:-2px;">${this._esc(g.title)}</button>`;
    }).join('');

    const charts = (activeGroup?.charts || []).map(c => `
      <div class="g-chart" style="background:rgba(255,255,255,.03);border:1px solid rgba(118,166,190,.16);border-radius:12px;padding:12px;min-width:0;width:100%;box-sizing:border-box;position:relative;">
        <div style="font-size:13px;font-weight:600;color:#eef7ff;margin-bottom:8px;">${this._esc(c.title)}</div>
        <div style="position:relative;">
          ${this._chartSvg(c)}
          ${this._loading ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,19,28,.45);backdrop-filter:blur(1px);border-radius:10px;color:#9eb8c8;font-size:13px;gap:8px;"><span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(158,184,200,.25);border-top-color:#5bc0ff;border-radius:50%;animation:gSpin .9s linear infinite;"></span>Loading data…</div>` : ''}
        </div>
      </div>`).join('');

    const err = this._error ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.35);color:#ffb3b3;font-size:13px;">${this._esc(this._error)}</div>` : '';
    const loading = this._loading ? `<span style="color:#9eb8c8;font-size:12px;">Loading history…</span>` : `<span style="color:#9eb8c8;font-size:12px;">${this._lastFetch ? 'Updated ' + this._esc(new Date(this._lastFetch).toLocaleTimeString()) : ''}</span>`;

    this.innerHTML = `
      <ha-card style="overflow:hidden;font-family:Roboto,Arial,sans-serif;font-size:14px;background:radial-gradient(circle at 18% 0%,rgba(26,106,164,.22),transparent 34%),linear-gradient(180deg,#020913,#06131c 54%,#050b10);border:1px solid rgba(101,142,164,.32);box-shadow:0 18px 45px rgba(0,0,0,.35);color:#eef7ff;--primary-text-color:#eef7ff;--secondary-text-color:#9eb8c8;--divider-color:rgba(118,166,190,.22);--g-muted:#9eb8c8;">
        <style>@keyframes gSpin{to{transform:rotate(360deg)}}</style>
        <div class="graphs-root" style="padding:16px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:20px;font-weight:700;color:#eef7ff;">${this._esc(this._config.title || 'Deye Energy Graphs')}</div>
              <div style="color:#9eb8c8;font-size:12px;margin-top:4px;">History graphs for ${this._esc(activeGroup?.title || 'selected')} metrics. ${loading}</div>
            </div>
            <div style="display:flex;gap:2px;flex-wrap:wrap;align-items:center;border-bottom:1px solid rgba(118,166,190,.22);">${ranges}</div>
          </div>
          ${customControls}
          <div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:14px;border-bottom:1px solid rgba(118,166,190,.22);">${groupTabs}</div>
          ${err}
          <section style="margin-top:14px;">
            <div style="display:grid;grid-template-columns:1fr;gap:12px;">${charts}</div>
          </section>
        </div>
      </ha-card>`;

    this.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._range = btn.getAttribute('data-range');
        this._customRange = false;
        this._customFrom = '';
        this._customTo = '';
        this._lastSig = '';
        this._render();
        this._fetchHistory();
      });
    });
    this.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._group = btn.getAttribute('data-group');
        this._lastSig = '';
        this._render();
      });
    });
    const fromInput = this.querySelector('.g-from');
    const toInput = this.querySelector('.g-to');
    const syncCustomInputs = () => {
      this._customFrom = fromInput?.value || '';
      this._customTo = toInput?.value || '';
    };
    if (fromInput) {
      fromInput.addEventListener('input', syncCustomInputs);
      fromInput.addEventListener('change', syncCustomInputs);
    }
    if (toInput) {
      toInput.addEventListener('input', syncCustomInputs);
      toInput.addEventListener('change', syncCustomInputs);
    }
    const clearBtn = this.querySelector('.g-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this._customFrom = '';
        this._customTo = '';
        this._customRange = false;
        this._error = '';
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        this._lastSig = '';
        this._render();
      });
    }
    const applyBtn = this.querySelector('.g-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        syncCustomInputs();
        const from = this._customFrom;
        const to = this._customTo;
        if (!from || !to) {
          this._error = 'Select both From and To dates before applying a custom range.';
          this._lastSig = '';
          this._render();
          return;
        }
        this._error = '';
        this._customRange = true;
        this._lastSig = '';
        this._render();
        this._fetchHistory();
      });
    }
    this._attachChartHovers();
  }
}


