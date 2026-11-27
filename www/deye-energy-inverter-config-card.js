// Resource revision: v=0.8.1.09
export class DeyeEnergyInverterConfigCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._inverterConfig = null;
    this._inverterConfigLoading = false;
    this._inverterConfigLoaded = false;
    this._inverterConfigError = "";
    this._inverterConfigDrafts = {};
    this._inverterConfigSaving = {};
    this._inverterConfigMessages = {};
    this._inverterDatetimeStatus = null;
    this._inverterDatetimeSyncing = false;
    this._inverterDatetimeMessage = "";
    this._topTab = "inverter_config";
    this._inverterConfigSubTab = "inverter";
    this._powerFlowSubTab = "general";
    this._graphConfigSubTab = "";
    this._pendingApply = null; // {groupKey, groupLabel, values, changes}
    this._forceReloadOnConnect = true;
    this._lastRenderSig = "";
    this._powerFlowDraft = null;
    this._powerFlowSaving = false;
    this._powerFlowMessage = "";
    this._powerFlowDraftDirty = false;
    this._pfDraftSource = null;
    this._pfDisplaySource = null;
    this._pfDisplayCache = null;
    this._pfDisplayKey = null;
    this._graphsDraft = null;
    this._graphsSaving = false;
    this._graphsMessage = "";
    this._graphsDraftDirty = false;
    this._graphsDraftSource = null;
  }

  setConfig(config) {
    this._config = config || {};
    this._pfDraftSource = null;
    this._pfDisplaySource = null;
    this._pfDisplayCache = null;
    this._pfDisplayKey = null;
  }

  getCardSize() { return 8; }

  static getStubConfig() {
    return { title: "Inverter configuration" };
  }

  connectedCallback() {
    this._forceReloadOnConnect = true;
    this._lastRenderSig = "";
    if (this._hass) this._loadLive(true);
    this._render();
  }

  disconnectedCallback() {
    if (this._focusoutRenderTimer) {
      clearTimeout(this._focusoutRenderTimer);
      this._focusoutRenderTimer = null;
    }
    this._pfDraftSource = null;
    this._pfDisplaySource = null;
    this._pfDisplayCache = null;
    this._pfDisplayKey = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected && this._forceReloadOnConnect) {
      this._loadLive(true);
    } else {
      this._render();
    }
  }

  /* ---------- helpers ---------- */
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  asNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (!text || ["unknown", "unavailable", "none", "null", "nan", "inf", "-inf"].includes(text.toLowerCase())) return null;
    const normalized = text.replace(",", ".");
    const match = normalized.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  formatNumber(value, digits = 2) {
    const number = this.asNumber(value);
    return number === null ? "missing" : number.toFixed(digits);
  }

  hasService(domain, service) {
    return Boolean(this._hass?.services?.[domain]?.[service]);
  }

  async callService(domain, service, data = {}) {
    return this._hass.callService(domain, service, data);
  }

  async callServiceWithResponse(domain, service, data = {}) {
    if (typeof this._hass?.callService !== "function") return undefined;
    try {
      return await this._hass.callService(domain, service, data, undefined, false, true);
    } catch (error) {
      if (!/return_response|does not support response/i.test(String(error?.message || ""))) throw error;
      return this.callService(domain, service, data);
    }
  }

  configuredEntity(key, domain, fallbackSuffix) {
    const sources = [this._config?.entities, this._config?.entity_map, this._config?.mapping];
    for (const source of sources) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const candidates = [
      `${domain}.deye_energy_${fallbackSuffix}`,
      `${domain}.deye_${fallbackSuffix}`,
      `${domain}.${fallbackSuffix}`,
    ];
    return candidates.find((id) => Boolean(this._hass?.states?.[id])) || candidates[0];
  }

  /* ---------- data loading ---------- */
  inverterConfigGroups() {
    return Array.isArray(this._inverterConfig?.groups) ? this._inverterConfig.groups : [];
  }

  async _loadLive(force = false) {
    if (!this._hass) return false;
    if (!this.hasService("deye_energy", "get_inverter_configuration")) {
      this._inverterConfigError = "The deye_energy.get_inverter_configuration service is unavailable. Reload the integration after installing the new version.";
      this._forceReloadOnConnect = false;
      this._render();
      return false;
    }
    if (this._inverterConfigLoading) return false;
    if (!force && this._inverterConfigLoaded && !this._forceReloadOnConnect) return true;
    this._inverterConfigLoading = true;
    this._inverterConfigError = "";
    this._forceReloadOnConnect = false;
    this._render();
    try {
      const response = await this.callServiceWithResponse("deye_energy", "get_inverter_configuration", {});
      const nested = response?.response ?? response?.result;
      let payload = response;
      if (Array.isArray(response)) payload = { groups: response };
      else if (!Array.isArray(payload?.groups) && Array.isArray(nested?.groups)) payload = nested;
      const groups = Array.isArray(payload?.groups) ? payload.groups : [];
      if (!groups.length) throw new Error("No inverter configuration groups were returned");
      const datetimeStatus = payload?.datetime_status ?? nested?.datetime_status ?? response?.datetime_status ?? null;
      this._inverterConfig = { groups, datetime_status: datetimeStatus };
      this._inverterDatetimeStatus = datetimeStatus;
      this._inverterConfigDrafts = {};
      this._inverterConfigLoaded = true;
      this._inverterConfigMessages = {};
      this._pendingApply = null;
      return true;
    } catch (error) {
      this._inverterConfigError = `Could not read inverter configuration: ${error?.message || error}`;
      return false;
    } finally {
      this._inverterConfigLoading = false;
      this._render();
    }
  }

  async syncInverterDatetime() {
    if (this._inverterDatetimeSyncing) return false;
    if (!this.hasService("deye_energy", "sync_inverter_datetime")) {
      this._inverterDatetimeMessage = "The deye_energy.sync_inverter_datetime service is unavailable. Reload the integration after installing the new version.";
      this._render();
      return false;
    }
    this._inverterDatetimeSyncing = true;
    this._inverterDatetimeMessage = "";
    this._render();
    try {
      const response = await this.callServiceWithResponse("deye_energy", "sync_inverter_datetime", {});
      const nested = response?.response ?? response?.result;
      const payload = response?.status !== undefined ? response : (nested?.status !== undefined ? nested : response);
      if (payload?.status === "failed" || payload?.error) {
        throw new Error(payload?.error || "Sync failed");
      }
      this._inverterDatetimeMessage = `Synced inverter time to ${payload?.ha_time || payload?.synced_value || "Home Assistant server time"}.`;
      await this._loadLive(true);
      return true;
    } catch (error) {
      this._inverterDatetimeMessage = `Sync failed: ${error?.message || error}`;
      this._render();
      return false;
    } finally {
      this._inverterDatetimeSyncing = false;
      this._render();
    }
  }

  /* ---------- field helpers ---------- */
  inverterConfigFieldValue(field) {
    if (Object.prototype.hasOwnProperty.call(this._inverterConfigDrafts, field.key)) {
      return this._inverterConfigDrafts[field.key];
    }
    if (field.domain === "switch") return field.value === true ? "true" : "false";
    return field.value === null || field.value === undefined ? "" : String(field.value);
  }

  _fieldDisplay(field) {
    const display = String(field.display_value ?? "Not mapped");
    const unit = display === "Not mapped" || display === "Unavailable" || !field.unit ? "" : ` ${String(field.unit)}`;
    return `${display}${unit}`.trim();
  }

  _draftDisplay(field, raw) {
    if (field.domain === "switch") return (raw === true || raw === "true" || raw === "on") ? "On" : "Off";
    const unit = field.unit ? ` ${String(field.unit)}` : "";
    return `${String(raw ?? "")}${unit}`.trim();
  }

  inverterConfigInput(groupKey, field) {
    const key = this.escapeHtml(String(field.key));
    if (!field.writable) {
      const display = this._fieldDisplay(field);
      const reason = field.read_only_reason && field.read_only_reason !== "Not mapped"
        ? `<small class="ic-muted">${this.escapeHtml(String(field.read_only_reason))}</small>` : "";
      return `<span class="ic-readonly" data-inverter-config-display="${key}">${this.escapeHtml(display)}</span>${reason}`;
    }
    const value = this.inverterConfigFieldValue(field);
    const attrs = `data-inverter-config-field="${key}" data-inverter-config-group="${this.escapeHtml(String(groupKey))}"`;
    if (field.domain === "number") {
      const min = field.min === null || field.min === undefined ? "" : ` min="${this.escapeHtml(String(field.min))}"`;
      const max = field.max === null || field.max === undefined ? "" : ` max="${this.escapeHtml(String(field.max))}"`;
      const step = field.step === null || field.step === undefined ? "" : ` step="${this.escapeHtml(String(field.step))}"`;
      const unit = field.unit ? ` <span class="ic-unit">${this.escapeHtml(String(field.unit))}</span>` : "";
      return `<label class="ic-field"><input type="number" inputmode="decimal" ${attrs}${min}${max}${step} value="${this.escapeHtml(String(value))}">${unit}</label>`;
    }
    const options = field.domain === "switch"
      ? [["true", "On"], ["false", "Off"]]
      : (Array.isArray(field.options) ? field.options.map((option) => [String(option), String(option)]) : []);
    const optionsHtml = options.map(([optionValue, label]) =>
      `<option value="${this.escapeHtml(String(optionValue))}"${String(optionValue) === String(value) ? " selected" : ""}>${this.escapeHtml(String(label))}</option>`
    ).join("");
    return `<select class="ic-select" ${attrs}>${optionsHtml}</select>`;
  }

  collectInverterConfigDrafts() {
    this.querySelectorAll("[data-inverter-config-field]").forEach((el) => {
      this._inverterConfigDrafts[el.dataset.inverterConfigField] = el.value;
    });
  }

  /* ---------- apply with confirmation ---------- */
  _validateAndBuildChanges(groupKey) {
    const group = this.inverterConfigGroups().find((item) => item.key === groupKey);
    if (!group) return { error: "Group not found" };
    this.collectInverterConfigDrafts();
    const values = {};
    const changes = [];
    for (const field of group.fields) {
      if (!field.writable) continue;
      const raw = this.inverterConfigFieldValue(field);
      let parsed;
      if (field.domain === "number") {
        parsed = Number(String(raw).replace(",", "."));
        if (!Number.isFinite(parsed)) return { error: `${field.label}: enter a valid number` };
        const min = Number(field.min);
        const max = Number(field.max);
        const step = Number(field.step);
        if (Number.isFinite(min) && Number.isFinite(max) && (parsed < min || parsed > max)) {
          return { error: `${field.label}: enter a value between ${min} and ${max}` };
        }
        if (Number.isFinite(step) && step > 0 && Number.isFinite(min)) {
          const steps = (parsed - min) / step;
          if (Math.abs(steps - Math.round(steps)) > 1e-6) {
            return { error: `${field.label}: value must follow step ${step}` };
          }
        }
      } else if (field.domain === "switch") {
        parsed = raw === true || raw === "true" || raw === "on";
      } else {
        const option = String(raw ?? "");
        if (Array.isArray(field.options) && field.options.length && !field.options.map(String).includes(option)) {
          return { error: `${field.label}: unsupported selection` };
        }
        parsed = option;
      }
      values[field.key] = parsed;

      // compare to current live value
      const oldVal = field.value;
      let changed = false;
      if (field.domain === "number") {
        const oldNum = Number(oldVal);
        changed = !(Number.isFinite(oldNum) && Math.abs(oldNum - parsed) < 1e-9);
      } else if (field.domain === "switch") {
        changed = Boolean(oldVal) !== Boolean(parsed);
      } else {
        changed = String(oldVal ?? "") !== String(parsed ?? "");
      }
      if (changed) {
        changes.push({
          key: field.key,
          label: String(field.label || field.key),
          previous: this._fieldDisplay(field),
          current: this._draftDisplay(field, raw),
        });
      }
    }
    return { group, values, changes };
  }

  requestApplyInverterConfigGroup(groupKey) {
    if (this._inverterConfigSaving[groupKey]) return;
    const result = this._validateAndBuildChanges(groupKey);
    if (result.error) {
      this._inverterConfigMessages[groupKey] = { ok: false, text: result.error };
      this._render();
      return;
    }
    if (!Object.keys(result.values).length) {
      this._inverterConfigMessages[groupKey] = { ok: false, text: "This group has no editable fields" };
      this._render();
      return;
    }
    if (!result.changes.length) {
      this._inverterConfigMessages[groupKey] = { ok: true, text: "No changes to upload." };
      this._render();
      return;
    }
    if (!this.hasService("deye_energy", "apply_inverter_configuration_group")) {
      this._inverterConfigMessages[groupKey] = { ok: false, text: "The apply service is unavailable. Reload the integration." };
      this._render();
      return;
    }
    this._pendingApply = {
      groupKey,
      groupLabel: String(result.group.label || groupKey),
      values: result.values,
      changes: result.changes,
    };
    this._render();
  }

  cancelPendingApply() {
    this._pendingApply = null;
    this._render();
  }

  async confirmPendingApply() {
    const pending = this._pendingApply;
    if (!pending) return;
    const { groupKey, values } = pending;
    this._pendingApply = null;
    this._inverterConfigSaving[groupKey] = true;
    this._inverterConfigMessages[groupKey] = null;
    this._render();
    let msg = null;
    try {
      const response = await this.callServiceWithResponse(
        "deye_energy",
        "apply_inverter_configuration_group",
        { group: groupKey, values },
      );
      const nested = response?.response ?? response?.result;
      const payload = response?.status !== undefined ? response : nested;
      const error = payload?.error || "";
      if (payload?.status === "failed" || error) throw new Error(error || "Apply failed");
      msg = { ok: true, text: "Applied and refreshed from live values." };
    } catch (error) {
      msg = { ok: false, text: String(error?.message || error) };
    } finally {
      this._inverterConfigSaving[groupKey] = false;
      await this._loadLive(true);
      if (msg) this._inverterConfigMessages[groupKey] = msg;
      this._render();
    }
  }

  /* ---------- render ---------- */
  topTabDefs() {
    return [
      { key: "inverter_config", label: "Inverter configuration" },
      { key: "power_flow", label: "Power flow" },
      { key: "graph_config", label: "Graph config" },
    ];
  }

  inverterConfigSubTabDefs() {
    return [
      { key: "inverter", label: "Inverter" },
      { key: "grid", label: "Grid" },
      { key: "battery_inverter", label: "Battery settings in inverter" },
      { key: "battery_settings", label: "Battery settings" },
      { key: "mode_control", label: "Mode & control" },
      { key: "specification", label: "Specification" },
      { key: "voltages", label: "Voltages" },
      { key: "power", label: "Power" },
      { key: "battery", label: "Battery" },
      { key: "energy", label: "Energy" },
    ];
  }

  powerFlowSubTabDefs() {
    return [
      { key: "general", label: "General" },
      { key: "pv", label: "PV" },
      { key: "grid", label: "Grid" },
      { key: "inverter", label: "Inverter" },
      { key: "battery", label: "Battery" },
      { key: "home", label: "Home" },
    ];
  }

  graphConfigSubTabDefs() {
    const draft = this.graphsDraft();
    const groups = Array.isArray(draft?.groups) ? draft.groups : [];
    return groups.map((group, index) => ({
      key: String(group?.key || `group_${index + 1}`),
      label: String(group?.label || group?.key || `Group ${index + 1}`),
      index,
    }));
  }

  inverterConfigMonitorEntityState(entityId) {
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return { text: "Unavailable", entity: entityId };
    const raw = stateObj.state;
    if (raw === undefined || raw === null || raw === "" || raw === "unknown" || raw === "unavailable") {
      return { text: "Unavailable", entity: entityId };
    }
    const unit = String(stateObj.attributes?.unit_of_measurement || "").trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && unit) {
      const decimals = Math.abs(numeric) >= 100 || Number.isInteger(numeric) ? (Number.isInteger(numeric) ? 0 : 1) : 2;
      return { text: `${numeric.toFixed(decimals)} ${unit}`.trim(), entity: entityId };
    }
    if (Number.isFinite(numeric)) return { text: String(raw), entity: entityId };
    return { text: String(raw), entity: entityId };
  }

  renderInverterConfigMonitorSections(sections, shownEntities = new Set()) {
    return sections.map((section) => {
      const rows = (section.entities || []).filter((item) => item && item.entity && !shownEntities.has(item.entity)).map((item) => {
        shownEntities.add(item.entity);
        const st = this.inverterConfigMonitorEntityState(item.entity);
        return `<tr><td><strong>${this.escapeHtml(item.label)}</strong><br><small class="ic-muted">${this.escapeHtml(item.entity)}</small></td><td class="ic-mono">${this.escapeHtml(st.text)}</td></tr>`;
      }).join("");
      if (!rows) return "";
      return `<section class="ic-section"><h4>${this.escapeHtml(section.title)}</h4><div class="ic-table-wrap"><table class="ic-table"><tbody>${rows}</tbody></table></div></section>`;
    }).join("");
  }

  inverterConfigGroupByKey(key) {
    return this.inverterConfigGroups().find((group) => group.key === key) || null;
  }

  renderInverterConfigEditableGroup(groupKey) {
    const group = this.inverterConfigGroupByKey(groupKey);
    if (!group) return `<div class="ic-hint">This group is unavailable. Load live inverter configuration first.</div>`;
    const rows = group.fields.map((field) => `<tr><td><strong>${this.escapeHtml(String(field.label))}</strong>${field.entity_id ? `<br><small class="ic-muted">${this.escapeHtml(String(field.entity_id))}</small>` : ""}</td><td>${this.inverterConfigInput(group.key, field)}</td></tr>`).join("");
    const message = this._inverterConfigMessages[group.key];
    const saving = Boolean(this._inverterConfigSaving[group.key]);
    const label = this.escapeHtml(String(group.label));
    return `<section class="ic-section">
      <h4>${label}</h4>
      <div class="ic-table-wrap"><table class="ic-table"><tbody>${rows}</tbody></table></div>
      ${message ? `<div class="${message.ok ? "ic-hint ic-ok" : "ic-hint ic-bad"}">${this.escapeHtml(String(message.text))}</div>` : ""}
      <button class="ic-action" data-apply-inverter-config="${this.escapeHtml(String(group.key))}" ${group.writable && !saving ? "" : "disabled"}>${saving ? "Applying…" : `Apply ${label}`}</button>
    </section>`;
  }

  graphsDisplay() {
    const states = this._hass?.states || {};
    const entry = Object.entries(states).find(([id, state]) => id.startsWith("sensor.") && id.endsWith("_ai_state") && state?.attributes?.graphs_display);
    const source = entry?.[1]?.attributes?.graphs_display;
    if (!source || typeof source !== "object" || Array.isArray(source)) return { schema_version: 1, groups: [] };
    return source;
  }

  graphsDraft() {
    const display = this.graphsDisplay();
    const key = JSON.stringify(display);
    if (!this._graphsDraft || (this._graphsDraftSource !== key && !this._graphsDraftDirty)) {
      this._graphsDraft = this._pfCopy(display && Object.keys(display).length ? display : { schema_version: 1, groups: [] });
      if (!Array.isArray(this._graphsDraft.groups)) this._graphsDraft.groups = [];
      this._graphsDraftSource = key;
      this._graphsDraftDirty = false;
    }
    return this._graphsDraft;
  }

  powerFlowDisplay() {
    const states = this._hass?.states || {};
    const entry = Object.entries(states).find(([id, state]) => id.startsWith("sensor.") && id.endsWith("_ai_state") && state?.attributes?.power_flow_display);
    const source = entry?.[1]?.attributes?.power_flow_display;
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const key = JSON.stringify(source);
    if (this._pfDisplayKey === key) return this._pfDisplayCache;
    this._pfDisplayKey = key;
    this._pfDisplayCache = source;
    return source;
  }

  _pfCopy(value) {
    return value === undefined || value === null ? {} : JSON.parse(JSON.stringify(value));
  }

  powerFlowDraft() {
    const display = this.powerFlowDisplay();
    const key = JSON.stringify(display);
    if (!this._powerFlowDraft || (this._pfDraftSource !== key && !this._powerFlowDraftDirty)) {
      this._powerFlowDraft = {
        schema_version: 1,
        layout: String(display.layout || "cross") === "left_right" ? "left_right" : "cross",
        entities: { ...(display.entities || {}) },
        node_details: this._pfCopy(display.node_details || {}),
        node_detail_layout: this.powerFlowEffectiveDetailLayout(display),
        chip_rows: {
          summary: Array.isArray(display.chip_rows?.summary)
            ? this._pfCopy(display.chip_rows.summary)
            : [],
        },
      };
      this._pfDraftSource = key;
      this._powerFlowDraftDirty = false;
    }
    return this._powerFlowDraft;
  }

  powerFlowFormats() {
    const formats = this.powerFlowDisplay().formats;
    return Array.isArray(formats) && formats.length ? formats : ["w", "kw", "kwh", "num", "gbp", "pct"];
  }

  powerFlowChipKinds() {
    const kinds = this.powerFlowDisplay().chip_kinds;
    return Array.isArray(kinds) && kinds.length ? kinds : ["import", "export", "bolt", "flame", "pound"];
  }

  powerFlowNodeGroups() {
    const groups = this.powerFlowDisplay().node_detail_keys;
    return Array.isArray(groups) && groups.length ? groups : ["grid", "pv", "inverter", "home", "battery"];
  }

  powerFlowBuiltinDetails() {
    return {
      pv: [
        { builtin: "pv_energy", label: "Today / period" },
      ],
      grid: [
        { builtin: "grid_import", label: "Import today / period" },
        { builtin: "grid_export", label: "Export today / period" },
        { builtin: "grid_voltage", label: "Voltage" },
      ],
      inverter: [
        { builtin: "inv_temperature", label: "Temperature" },
        { builtin: "inv_status", label: "Status" },
      ],
      home: [
        { builtin: "home_energy", label: "Today / period" },
        { builtin: "home_consumers", label: "Consumers" },
      ],
      battery: [
        { builtin: "batt_soc", label: "SOC" },
        { builtin: "batt_voltage", label: "Voltage" },
        { builtin: "batt_current", label: "Current" },
        { builtin: "batt_temperature", label: "Temp" },
        { builtin: "batt_charged", label: "Charged today / period" },
        { builtin: "batt_discharged", label: "Discharged today / period" },
      ],
    };
  }

  powerFlowBuiltinEntity(key, entities) {
    const mapped = {
      pv_energy: entities.pv_energy || entities.daily_pv_production,
      grid_import: entities.grid_import_energy || entities.daily_energy_bought,
      grid_export: entities.grid_export_energy || entities.daily_energy_sold,
      grid_voltage: entities.grid_l1_voltage,
      inv_temperature: entities.inverter_temperature,
      inv_status: "",
      home_energy: entities.load_energy || entities.daily_load_consumption,
      home_consumers: "",
      batt_soc: entities.battery_soc,
      batt_voltage: entities.battery_voltage,
      batt_current: entities.battery_current,
      batt_temperature: entities.battery_temperature,
      batt_charged: entities.battery_charge_energy || entities.daily_battery_charge,
      batt_discharged: entities.battery_discharge_energy || entities.daily_battery_discharge,
    };
    return mapped[key] || "";
  }

  powerFlowEffectiveDetailLayout(display) {
    const builtins = this.powerFlowBuiltinDetails();
    const layout = {};
    this.powerFlowNodeGroups().forEach((group) => {
      const configured = display.node_detail_layout?.[group];
      if (Array.isArray(configured)) {
        layout[group] = this._pfCopy(configured);
        return;
      }
      const extras = Array.isArray(display.node_details?.[group]) ? display.node_details[group] : [];
      layout[group] = [
        ...(builtins[group] || []).map((row) => ({ builtin: row.builtin })),
        ...this._pfCopy(extras),
      ];
    });
    return layout;
  }

  powerFlowLive(entityId) {
    return this.inverterConfigMonitorEntityState(entityId);
  }

  powerFlowSelect(options, selected) {
    const chosen = String(selected ?? "");
    return options.map((option) => {
      const value = String(option);
      return `<option value="${this.escapeHtml(value)}"${value === chosen ? " selected" : ""}>${this.escapeHtml(value.toUpperCase())}</option>`;
    }).join("");
  }

  powerFlowStateSignature() {
    const display = this.powerFlowDisplay();
    const draft = this._powerFlowDraft || {};
    const ids = new Set();
    const addEntity = (value) => { if (typeof value === "string" && value.trim()) ids.add(value.trim()); };
    Object.values(display.entities || {}).forEach(addEntity);
    Object.values(draft.entities || {}).forEach(addEntity);
    const collectRows = (groups) => Object.values(groups || {}).forEach((rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        addEntity(row?.entity);
        (Array.isArray(row?.items) ? row.items : []).forEach((item) => addEntity(item?.entity));
      });
    });
    collectRows(display.node_details);
    collectRows(draft.node_details);
    collectRows(display.node_detail_layout);
    collectRows(draft.node_detail_layout);
    collectRows(display.chip_rows);
    collectRows(draft.chip_rows);
    return [...ids].sort().map((id) => {
      const state = this._hass?.states?.[id];
      return `${id}=${state ? `${state.state}|${state.attributes?.unit_of_measurement || ""}` : ""}`;
    }).join(";");
  }

  renderPowerFlowDetailRows(group) {
    const draft = this.powerFlowDraft();
    const rows = Array.isArray(draft.node_detail_layout?.[group]) ? draft.node_detail_layout[group] : [];
    const formats = this.powerFlowFormats();
    const builtinLabels = this.powerFlowBuiltinDetails()[group] || [];
    const entities = draft.entities || {};
    const body = rows.map((row, index) => {
      const builtin = row && row.builtin;
      const label = builtin
        ? (builtinLabels.find((item) => item.builtin === builtin)?.label || builtin)
        : String(row?.label ?? "");
      const entity = builtin ? this.powerFlowBuiltinEntity(builtin, entities) : String(row?.entity ?? "");
      const live = this.powerFlowLive(entity);
      return `<tr>
        <td>${builtin
          ? `<span class="ic-muted">${this.escapeHtml(label)}</span>`
          : `<input type="text" class="pf-detail-label-input" value="${this.escapeHtml(label)}" data-pf-detail="${this.escapeHtml(group)}:${index}:label" aria-label="Detail label ${index + 1}">`}</td>
        <td>${builtin
          ? `<span class="ic-mono">${this.escapeHtml(entity || "Built-in")}</span>`
          : `<input type="text" class="pf-detail-entity-input" value="${this.escapeHtml(entity)}" data-pf-detail="${this.escapeHtml(group)}:${index}:entity" aria-label="Detail entity ${index + 1}">`}</td>
        <td>${builtin
          ? `<span class="ic-muted">Built-in</span>`
          : `<select data-pf-detail="${this.escapeHtml(group)}:${index}:format">${this.powerFlowSelect(formats, row.format || "num")}</select>`}</td>
        <td><span class="ic-mono">${builtin && !entity ? "—" : this.escapeHtml(live.text)}</span></td>
        <td class="pf-row-actions">
          <button class="ic-btn ic-btn-secondary" data-pf-move-detail="${this.escapeHtml(group)}:${index}:up" ${index === 0 ? "disabled" : ""} aria-label="Move row ${index + 1} up">↑</button>
          <button class="ic-btn ic-btn-secondary" data-pf-move-detail="${this.escapeHtml(group)}:${index}:down" ${index === rows.length - 1 ? "disabled" : ""} aria-label="Move row ${index + 1} down">↓</button>
          <button class="ic-btn ic-btn-secondary" data-pf-remove-detail="${this.escapeHtml(group)}:${index}">Remove</button>
        </td>
      </tr>`;
    }).join("");
    return `<div class="pf-edit">
      <div class="pf-edit-title">Additional data shown in the ${this.escapeHtml(group)} node</div>
      <div class="ic-table-wrap"><table class="ic-table"><thead><tr><th>Label</th><th>Entity ID</th><th>Format</th><th>Live value</th><th>Order</th></tr></thead><tbody>${body || `<tr><td colspan="5" class="ic-muted">No rows are shown below the divider in this node.</td></tr>`}</tbody></table></div>
      <button class="ic-btn ic-btn-secondary" data-pf-add-detail="${this.escapeHtml(group)}">Add data row</button>
    </div>`;
  }

  movePowerFlowDetailRow(group, index, direction) {
    const rows = this.powerFlowDraft().node_detail_layout?.[group];
    if (!Array.isArray(rows)) return;
    const from = Number(index);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= rows.length) return;
    [rows[from], rows[to]] = [rows[to], rows[from]];
    this._powerFlowDraftDirty = true;
    this._render();
  }

  removePowerFlowDetailRow(group, index) {
    const rows = this.powerFlowDraft().node_detail_layout?.[group];
    if (!Array.isArray(rows)) return;
    rows.splice(Number(index), 1);
    this._powerFlowDraftDirty = true;
    this._render();
  }

  renderPowerFlowSensorGroups() {
    const display = this.powerFlowDisplay();
    const draft = this.powerFlowDraft();
    const groups = Array.isArray(display.sensor_groups) ? display.sensor_groups : [];
    const nodeGroups = new Set(this.powerFlowNodeGroups());
    return groups.map((group) => {
      const sensors = Array.isArray(group.sensors) ? group.sensors : [];
      const rows = sensors.map((sensor) => {
        const entity = String(draft.entities?.[sensor.key] ?? "");
        const live = this.powerFlowLive(entity);
        return `<tr>
          <td><strong>${this.escapeHtml(String(sensor.label ?? sensor.key))}</strong></td>
          <td><input type="text" class="pf-entity-input" value="${this.escapeHtml(entity)}" data-pf-entity="${this.escapeHtml(String(sensor.key))}" aria-label="Source entity for ${this.escapeHtml(String(sensor.label ?? sensor.key))}"></td>
          <td class="ic-mono">${this.escapeHtml(live.text)}</td>
        </tr>`;
      }).join("");
      return `<section class="ic-section pf-group">
        <h4>${this.escapeHtml(String(group.label ?? group.key))}</h4>
        <div class="ic-table-wrap"><table class="ic-table"><thead><tr><th>Sensor</th><th>Entity ID</th><th>Live value</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="ic-muted">No sensors listed.</td></tr>`}</tbody></table></div>
        ${nodeGroups.has(group.key) ? this.renderPowerFlowDetailRows(group.key) : ""}
      </section>`;
    }).join("");
  }

  renderPowerFlowSummaryChips() {
    const draft = this.powerFlowDraft();
    const rows = Array.isArray(draft.chip_rows?.summary) ? draft.chip_rows.summary : [];
    const formats = this.powerFlowFormats();
    const kinds = this.powerFlowChipKinds();
    const groups = rows.map((chip, chipIndex) => {
      const items = Array.isArray(chip.items) ? chip.items : [];
      const itemRows = items.map((item, itemIndex) => `<tr>
        <td><input type="text" value="${this.escapeHtml(String(item.label ?? ""))}" data-pf-summary="${chipIndex}:${itemIndex}:label" aria-label="Summary item label ${itemIndex + 1}"></td>
        <td><input type="text" value="${this.escapeHtml(String(item.entity ?? ""))}" data-pf-summary="${chipIndex}:${itemIndex}:entity" aria-label="Summary item entity ${itemIndex + 1}"></td>
        <td><select data-pf-summary="${chipIndex}:${itemIndex}:format">${this.powerFlowSelect(formats, item.format || "num")}</select></td>
        <td><select data-pf-summary="${chipIndex}:${itemIndex}:kind">${this.powerFlowSelect(kinds, item.kind || "bolt")}</select></td>
        <td><input type="color" value="${this.escapeHtml(String(item.color || "#bc63ff"))}" data-pf-summary="${chipIndex}:${itemIndex}:color" aria-label="Summary item colour ${itemIndex + 1}"></td>
        <td><span class="ic-mono">${this.escapeHtml(this.powerFlowLive(item.entity).text)}</span></td>
        <td><button class="ic-btn ic-btn-secondary" data-pf-remove-summary-item="${chipIndex}:${itemIndex}">Remove</button></td>
      </tr>`).join("");
      return `<div class="pf-group">
        <div class="pf-edit-row">
          <input type="text" value="${this.escapeHtml(String(chip.label ?? ""))}" data-pf-chip="summary:${chipIndex}:label" aria-label="Summary chip label ${chipIndex + 1}">
          <button class="ic-btn ic-btn-secondary" data-pf-remove-chip="summary:${chipIndex}">Remove chip group</button>
        </div>
        <div class="ic-table-wrap"><table class="ic-table"><thead><tr><th>Label</th><th>Entity ID</th><th>Format</th><th>Icon</th><th>Colour</th><th>Live value</th><th></th></tr></thead><tbody>${itemRows || `<tr><td colspan="7" class="ic-muted">No items yet.</td></tr>`}</tbody></table></div>
        <button class="ic-btn ic-btn-secondary" data-pf-add-summary-item="${chipIndex}">Add item</button>
      </div>`;
    }).join("");
    return `<div class="pf-edit">
      <div class="pf-edit-title">Extra chip groups above the Power Flow diagram</div>
      ${groups || `<div class="ic-hint">No extra summary chip groups yet.</div>`}
      <button class="ic-btn ic-btn-secondary" data-pf-add-chip="summary">Add chip group</button>
    </div>`;
  }

  renderPowerFlowNodeGroup(groupKey) {
    const display = this.powerFlowDisplay();
    const draft = this.powerFlowDraft();
    const groups = Array.isArray(display.sensor_groups) ? display.sensor_groups : [];
    const group = groups.find((g) => String(g?.key) === String(groupKey));
    if (!group) return `<div class="ic-hint">No Power Flow configuration for ${this.escapeHtml(String(groupKey))}.</div>`;
    const sensors = Array.isArray(group.sensors) ? group.sensors : [];
    const rows = sensors.map((sensor) => {
      const entity = String(draft.entities?.[sensor.key] ?? "");
      const live = this.powerFlowLive(entity);
      return `<tr>
        <td><strong>${this.escapeHtml(String(sensor.label ?? sensor.key))}</strong></td>
        <td><input type="text" class="pf-entity-input" value="${this.escapeHtml(entity)}" data-pf-entity="${this.escapeHtml(String(sensor.key))}" aria-label="Source entity for ${this.escapeHtml(String(sensor.label ?? sensor.key))}"></td>
        <td class="ic-mono">${this.escapeHtml(live.text)}</td>
      </tr>`;
    }).join("");
    const nodeGroups = new Set(this.powerFlowNodeGroups());
    return `<section class="ic-section pf-group">
      <h4>${this.escapeHtml(String(group.label ?? group.key))}</h4>
      <div class="ic-table-wrap"><table class="ic-table"><thead><tr><th>Sensor</th><th>Entity ID</th><th>Live value</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="ic-muted">No sensors listed.</td></tr>`}</tbody></table></div>
      ${nodeGroups.has(group.key) ? this.renderPowerFlowDetailRows(group.key) : ""}
    </section>`;
  }

  renderPowerFlowConfigTab() {
    const draft = this.powerFlowDraft();
    const message = this._powerFlowMessage
      ? `<div class="ic-hint ${/failed|unavailable/i.test(this._powerFlowMessage) ? "ic-bad" : "ic-ok"}">${this.escapeHtml(this._powerFlowMessage)}</div>`
      : "";
    const layout = String(draft.layout || "cross") === "left_right" ? "left_right" : "cross";
    const subTabs = this.powerFlowSubTabDefs();
    const active = subTabs.some((tab) => tab.key === this._powerFlowSubTab) ? this._powerFlowSubTab : "general";
    this._powerFlowSubTab = active;

    let body = "";
    if (active === "general") {
      body = `<section class="ic-section">
        <h4>Power flow layout</h4>
        <p class="ic-hint">Choose how nodes are arranged in the Power Flow card. "Left and right" places PV/Grid on the left, Inverter in the middle, and Battery/Home on the right, with curved connection lines.</p>
        <div class="ic-table-wrap"><table class="ic-table"><tbody><tr><td><strong>Display layout</strong></td><td><select class="ic-select" id="pf-layout-select" data-pf-layout="1">
            <option value="cross"${layout === "cross" ? " selected" : ""}>Cross (default)</option>
            <option value="left_right"${layout === "left_right" ? " selected" : ""}>Left and right</option>
          </select></td></tr></tbody></table></div>
      </section>
      <section class="ic-section pf-group">
        <h4>Top chips — summary row</h4>
        ${this.renderPowerFlowSummaryChips()}
      </section>`;
    } else {
      body = this.renderPowerFlowNodeGroup(active);
    }

    return `<section class="ic-section">
        <h4>Power flow mapping</h4>
        <p class="ic-hint">Edit the entity IDs used by the Power Flow card, add extra detail rows to each node, and extend the summary chip row. Save writes the shared entity-map override; the Power Flow card then updates without a restart.</p>
      </section>
      <div class="ic-tabs" role="tablist" aria-label="Power flow sections">
        ${subTabs.map((tab) => `<button type="button" role="tab" aria-selected="${active === tab.key ? "true" : "false"}" class="ic-tab ${active === tab.key ? "active" : ""}" data-power-flow-subtab="${tab.key}">${this.escapeHtml(tab.label)}</button>`).join("")}
      </div>
      ${body}
      <section class="ic-section">
        <button class="ic-action" data-pf-save="1" ${this._powerFlowSaving ? "disabled" : ""}>${this._powerFlowSaving ? "Saving…" : "Save power flow mapping"}</button>
        ${message}
      </section>`;
  }

  async savePowerFlowDisplay() {
    if (this._powerFlowSaving) return;
    if (!this.hasService("deye_energy", "save_power_flow_display")) {
      this._powerFlowMessage = "The save_power_flow_display service is unavailable. Update and restart the integration.";
      this._render();
      return;
    }
    this._powerFlowSaving = true;
    this._powerFlowMessage = "";
    this._render();
    try {
      const draft = this.powerFlowDraft();
      const layout = this._pfCopy(draft.node_detail_layout || {});
      const legacyDetails = {};
      Object.entries(layout).forEach(([group, rows]) => {
        legacyDetails[group] = (Array.isArray(rows) ? rows : [])
          .filter((row) => row && !row.builtin)
          .map((row) => ({ label: row.label, entity: row.entity, format: row.format }));
      });
      const payload = {
        schema_version: 1,
        layout: String(draft.layout || "cross") === "left_right" ? "left_right" : "cross",
        entities: { ...(draft.entities || {}) },
        node_details: legacyDetails,
        node_detail_layout: layout,
        chip_rows: {
          summary: Array.isArray(draft.chip_rows?.summary)
            ? this._pfCopy(draft.chip_rows.summary)
            : [],
        },
      };
      const response = await this.callServiceWithResponse(
        "deye_energy",
        "save_power_flow_display",
        { data: JSON.stringify(payload) }
      );
      this._powerFlowMessage = "Power flow mapping saved.";
      this._powerFlowDraftDirty = false;
      if (response && typeof response === "object") {
        this._pfDisplayKey = JSON.stringify(response);
        this._pfDisplayCache = response;
        this._pfDisplaySource = response;
        this._pfDraftSource = this._pfDisplayKey;
        this._powerFlowDraft = {
          schema_version: 1,
          layout: String(response.layout || "cross") === "left_right" ? "left_right" : "cross",
          entities: { ...(response.entities || {}) },
          node_details: this._pfCopy(response.node_details || {}),
          node_detail_layout: this.powerFlowEffectiveDetailLayout(response),
          chip_rows: {
            summary: Array.isArray(response.chip_rows?.summary)
              ? this._pfCopy(response.chip_rows.summary)
              : [],
          },
        };
      }
    } catch (error) {
      this._powerFlowMessage = `Save failed: ${String(error?.message || error)}`;
    } finally {
      this._powerFlowSaving = false;
      this._render();
    }
  }

  async saveGraphsDisplay() {
    if (this._graphsSaving) return;
    if (!this.hasService("deye_energy", "save_graphs_display")) {
      this._graphsMessage = "The save_graphs_display service is unavailable. Update and restart the integration.";
      this._render();
      return;
    }
    this._graphsSaving = true;
    this._graphsMessage = "";
    this._render();
    try {
      const draft = this.graphsDraft();
      const payload = {
        schema_version: 1,
        groups: Array.isArray(draft.groups) ? this._pfCopy(draft.groups) : [],
      };
      const response = await this.callServiceWithResponse(
        "deye_energy",
        "save_graphs_display",
        { data: JSON.stringify(payload) }
      );
      this._graphsMessage = "Graphs configuration saved.";
      this._graphsDraftDirty = false;
      if (response && typeof response === "object") {
        this._graphsDraft = this._pfCopy(response);
        this._graphsDraftSource = JSON.stringify(this.graphsDisplay());
      }
    } catch (error) {
      this._graphsMessage = `Save failed: ${String(error?.message || error)}`;
    } finally {
      this._graphsSaving = false;
      this._render();
    }
  }

  renderGraphConfigGroup(group, gi) {
    const charts = Array.isArray(group?.charts) ? group.charts : [];
    const chartHtml = charts.map((chart, ci) => {
      const series = Array.isArray(chart.series) ? chart.series : [];
      const seriesRows = series.map((ser, si) => `<tr>
        <td><input class="ic-input" type="text" value="${this.escapeHtml(String(ser.label ?? ""))}" data-gc-series="${gi}:${ci}:${si}:label" placeholder="Label"></td>
        <td><input class="ic-input ic-mono" type="text" value="${this.escapeHtml(String(ser.entity ?? ""))}" data-gc-series="${gi}:${ci}:${si}:entity" placeholder="sensor.entity_id"></td>
        <td><input class="ic-input" type="text" value="${this.escapeHtml(String(ser.color ?? "#5bc0ff"))}" data-gc-series="${gi}:${ci}:${si}:color" placeholder="#5bc0ff"></td>
        <td><label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" data-gc-series-enabled="${gi}:${ci}:${si}" ${ser.enabled === false ? "" : "checked"}> Show</label></td>
        <td><button class="ic-btn ic-btn-secondary" data-gc-remove-series="${gi}:${ci}:${si}">Remove</button></td>
      </tr>`).join("");
      return `<div class="ic-section" style="margin-top:10px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
          <strong>Chart: ${this.escapeHtml(String(chart.title || chart.key || `Chart ${ci+1}`))}</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="display:flex;gap:6px;align-items:center;color:#9eb8c8;"><input type="checkbox" data-gc-chart-enabled="${gi}:${ci}" ${chart.enabled === false ? "" : "checked"}> Enabled</label>
            <button class="ic-btn ic-btn-secondary" data-gc-remove-chart="${gi}:${ci}">Remove chart</button>
          </div>
        </div>
        <div class="ic-table-wrap"><table class="ic-table"><tbody>
          <tr><td><strong>Title</strong></td><td><input class="ic-input" type="text" value="${this.escapeHtml(String(chart.title ?? ""))}" data-gc-chart="${gi}:${ci}:title"></td></tr>
          <tr><td><strong>Unit</strong></td><td><input class="ic-input" type="text" value="${this.escapeHtml(String(chart.unit ?? ""))}" data-gc-chart="${gi}:${ci}:unit" placeholder="W / V / °C / %"></td></tr>
        </tbody></table></div>
        <div class="ic-table-wrap"><table class="ic-table"><thead><tr><th>Series label</th><th>Entity</th><th>Color</th><th>Show</th><th></th></tr></thead><tbody>${seriesRows || `<tr><td colspan="5" class="ic-muted">No series. Add one below.</td></tr>`}</tbody></table></div>
        <button class="ic-btn ic-btn-secondary" data-gc-add-series="${gi}:${ci}">Add series</button>
      </div>`;
    }).join("");

    return `<section class="ic-section">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
        <h4 style="margin:0;">Group: ${this.escapeHtml(String(group.label || group.key || `Group ${gi+1}`))}</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <label style="display:flex;gap:6px;align-items:center;color:#9eb8c8;"><input type="checkbox" data-gc-group-enabled="${gi}" ${group.enabled === false ? "" : "checked"}> Enabled</label>
          <button class="ic-btn ic-btn-secondary" data-gc-remove-group="${gi}">Remove group</button>
        </div>
      </div>
      <div class="ic-table-wrap"><table class="ic-table"><tbody>
        <tr><td><strong>Group title</strong></td><td><input class="ic-input" type="text" value="${this.escapeHtml(String(group.label ?? ""))}" data-gc-group="${gi}:label"></td></tr>
      </tbody></table></div>
      ${chartHtml || `<div class="ic-hint">No charts in this group.</div>`}
      <button class="ic-btn ic-btn-secondary" data-gc-add-chart="${gi}">Add chart</button>
    </section>`;
  }

  renderGraphConfigTab() {
    const draft = this.graphsDraft();
    const groups = Array.isArray(draft.groups) ? draft.groups : [];
    const message = this._graphsMessage
      ? `<div class="ic-hint ${/failed|unavailable/i.test(this._graphsMessage) ? "ic-bad" : "ic-ok"}">${this.escapeHtml(this._graphsMessage)}</div>`
      : "";
    const subTabs = this.graphConfigSubTabDefs();
    if (!subTabs.some((tab) => tab.key === this._graphConfigSubTab)) this._graphConfigSubTab = subTabs[0]?.key || "";
    const activeKey = this._graphConfigSubTab;
    const activeTab = subTabs.find((tab) => tab.key === activeKey) || subTabs[0] || null;
    const activeGroup = activeTab ? groups[activeTab.index] : null;
    const groupHtml = activeGroup ? this.renderGraphConfigGroup(activeGroup, activeTab.index) : `<section class="ic-section"><div class="ic-hint">No graph groups configured. Add a group to start.</div></section>`;

    return `<section class="ic-section">
      <h4>Deye Energy Graphs configuration</h4>
      <p class="ic-hint">Edit graph groups, chart titles, sensor entities, colors, and visibility. Disabled groups/charts/series are hidden from Deye Energy Graphs. Save writes the shared entity-map override and updates graphs without restart.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="ic-btn ic-btn-secondary" data-gc-add-group="1">Add group</button>
        <button class="ic-action" data-gc-save="1" ${this._graphsSaving ? "disabled" : ""}>${this._graphsSaving ? "Saving…" : "Save graph config"}</button>
      </div>
      ${message}
    </section>
    ${subTabs.length ? `<div class="ic-tabs" role="tablist" aria-label="Graph config groups">${subTabs.map((tab) => `<button type="button" role="tab" aria-selected="${activeKey === tab.key ? "true" : "false"}" class="ic-tab ${activeKey === tab.key ? "active" : ""}" data-graph-config-subtab="${tab.key}">${this.escapeHtml(tab.label)}</button>`).join("")}</div>` : ""}
    ${groupHtml}`;
  }

  renderInverterDatetimeSection() {
    const status = this._inverterDatetimeStatus || this._inverterConfig?.datetime_status || null;
    const syncing = Boolean(this._inverterDatetimeSyncing);
    const message = this._inverterDatetimeMessage ? `<div class="ic-hint ${/failed/i.test(this._inverterDatetimeMessage) ? "ic-bad" : "ic-ok"}">${this.escapeHtml(String(this._inverterDatetimeMessage))}</div>` : "";
    const inverterTime = status?.inverter_time ?? "Not loaded";
    const haTime = status?.ha_time ?? "Not loaded";
    const inSync = status?.in_sync;
    const deviation = status?.deviation_seconds;
    const syncState = inSync === true
      ? `<span class="ic-good">In sync</span>`
      : inSync === false
        ? `<span class="ic-bad-text">Out of sync${Number.isFinite(Number(deviation)) ? ` (${this.formatNumber(Number(deviation), 0)}s)` : ""}</span>`
        : `<span class="ic-muted">Unknown</span>`;
    const lastCheck = status?.last_check_at ? this.escapeHtml(String(status.last_check_at).replace("T", " ")) : "Never";
    const lastSync = status?.last_sync_at ? this.escapeHtml(String(status.last_sync_at).replace("T", " ")) : "Never";
    const lastError = status?.last_error ? `<div class="ic-hint ic-bad">${this.escapeHtml(String(status.last_error))}</div>` : "";
    const entity = status?.entity_id ? `<div class="ic-hint">Entity: <code>${this.escapeHtml(String(status.entity_id))}</code></div>` : "";
    return `<section class="ic-section">
      <h4>Inverter time</h4>
      <div class="ic-table-wrap"><table class="ic-table"><tbody>
        <tr><td><strong>Inverter time</strong></td><td class="ic-mono">${this.escapeHtml(String(inverterTime))}</td></tr>
        <tr><td><strong>Home Assistant server time</strong></td><td class="ic-mono">${this.escapeHtml(String(haTime))}</td></tr>
        <tr><td><strong>Status</strong></td><td>${syncState}</td></tr>
        <tr><td><strong>Last 6-hour check</strong></td><td>${lastCheck}</td></tr>
        <tr><td><strong>Last sync</strong></td><td>${lastSync}</td></tr>
      </tbody></table></div>
      ${entity}
      ${lastError}
      ${message}
      <button class="ic-action" data-sync-inverter-datetime="1" ${syncing || this._inverterConfigLoading ? "disabled" : ""}>${syncing ? "Syncing…" : "Sync now"}</button>
      <div class="ic-hint">The integration compares inverter and Home Assistant server time every 6 hours and force-syncs if any hour, minute, or second differs.</div>
    </section>`;
  }

  renderConfirmOverlay() {
    const p = this._pendingApply;
    if (!p) return "";
    const rows = p.changes.map((c) => `<tr>
      <td><strong>${this.escapeHtml(c.label)}</strong><br><small class="ic-muted">${this.escapeHtml(c.key)}</small></td>
      <td class="ic-mono">${this.escapeHtml(c.previous)}</td>
      <td class="ic-mono ic-new">${this.escapeHtml(c.current)}</td>
    </tr>`).join("");
    return `<div class="ic-overlay" data-ic-overlay="1">
      <div class="ic-overlay-card" role="dialog" aria-modal="true" aria-label="Confirm inverter changes">
        <div class="ic-overlay-head">
          <h3>Confirm upload to inverter</h3>
          <p>Review the changes for <strong>${this.escapeHtml(p.groupLabel)}</strong> before uploading. Previous values are from the last live read.</p>
        </div>
        <div class="ic-overlay-body">
          <div class="ic-table-wrap"><table class="ic-table ic-confirm-table">
            <thead><tr><th>Setting</th><th>Previous</th><th>New</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </div>
        <div class="ic-overlay-actions">
          <button class="ic-btn ic-btn-secondary" data-ic-cancel-apply="1">Cancel</button>
          <button class="ic-btn ic-btn-primary" data-ic-confirm-apply="1">Confirm upload</button>
        </div>
      </div>
    </div>`;
  }

  _renderSig(topTab, activeSubTab) {
    const monitorIds = [
      "sensor.deye_pv1_voltage","sensor.deye_pv1_current","sensor.deye_pv2_voltage","sensor.deye_pv2_current","sensor.deye_pv3_voltage","sensor.deye_pv3_current",
      "sensor.deye_grid_voltage","sensor.deye_inverter_voltage",
      "sensor.deye_pv_power","sensor.deye_pv1_power","sensor.deye_pv2_power","sensor.deye_pv3_power",
      "sensor.deye_inverter_power","sensor.deye_load_power","sensor.deye_load_l1_power","sensor.deye_load_l2_power","sensor.deye_essential_power","sensor.deye_essential_1_power","sensor.deye_essential_2_power","sensor.deye_non_essential_power",
      "sensor.deye_grid_power","sensor.deye_gen_power",
      "sensor.deye_battery_soc","sensor.deye_battery_voltage","sensor.deye_battery_charging_voltage","sensor.deye_battery_current","sensor.deye_battery_power","sensor.deye_battery_temperature","sensor.deye_bat1_soc","sensor.deye_bat1_cycle","sensor.deye_battery_charge_limit_current","sensor.deye_battery_discharge_limit_current",
      "sensor.deye_day_battery_charge","sensor.deye_day_battery_discharge","sensor.deye_total_battery_charge","sensor.deye_total_battery_discharge",
      "sensor.deye_day_pv_energy","sensor.deye_day_load_energy","sensor.deye_day_grid_import","sensor.deye_day_grid_export","sensor.deye_day_active_energy","sensor.deye_day_reactive_energy",
      "sensor.deye_total_pv_energy","sensor.deye_total_load_energy","sensor.deye_total_grid_import","sensor.deye_total_grid_export","sensor.deye_total_active_energy","sensor.deye_year_pv_energy","sensor.deye_year_load_energy","sensor.deye_year_grid_export",
    ];
    const monitorStates = monitorIds.map((id) => {
      const s = this._hass?.states?.[id];
      return s ? `${id}=${s.state}|${s.attributes?.unit_of_measurement || ""}` : `${id}=`;
    }).join(";");
    return JSON.stringify([
      topTab, activeSubTab, this._inverterConfigLoading, this._inverterConfigLoaded, this._inverterConfigError,
      this._inverterDatetimeSyncing, this._inverterDatetimeMessage, this._inverterDatetimeStatus,
      this._inverterConfig, this._inverterConfigDrafts, this._inverterConfigSaving,
      this._inverterConfigMessages, this._pendingApply, this._config?.title || "",
      monitorStates, this.powerFlowStateSignature(), JSON.stringify(this.powerFlowDisplay()),
      JSON.stringify(this._powerFlowDraft), this._powerFlowSaving, this._powerFlowMessage,
      JSON.stringify(this.graphsDisplay()), JSON.stringify(this._graphsDraft), this._graphsSaving, this._graphsMessage,
      this._powerFlowSubTab, this._graphConfigSubTab,
    ]);
  }

  _render() {
    if (!this._hass) {
      this.innerHTML = `<ha-card><div style="padding:16px">Loading…</div></ha-card>`;
      return;
    }
    const focused = typeof document !== "undefined" ? document.activeElement : null;
    if (focused && focused !== document.body && typeof this.contains === "function" && this.contains(focused) && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) {
      return;
    }

    const topTabs = this.topTabDefs();
    const topActive = topTabs.some((tab) => tab.key === this._topTab) ? this._topTab : "inverter_config";
    this._topTab = topActive;

    let subTabs = [];
    let subActive = "";
    let subAttr = "";
    let subAria = "";
    let body = "";

    if (topActive === "inverter_config") {
      subTabs = this.inverterConfigSubTabDefs();
      subActive = subTabs.some((tab) => tab.key === this._inverterConfigSubTab) ? this._inverterConfigSubTab : "inverter";
      this._inverterConfigSubTab = subActive;
      subAttr = "data-inverter-config-subtab";
      subAria = "Inverter configuration sections";
      const shownEntities = new Set();
      this.inverterConfigGroups().forEach((group) => (group.fields || []).forEach((field) => { if (field.entity_id) shownEntities.add(String(field.entity_id)); }));
      if (subActive === "inverter") {
        body = `${this.renderInverterDatetimeSection()}${this.renderInverterConfigEditableGroup("work_mode_detail")}`;
      } else if (subActive === "grid") {
        body = this.renderInverterConfigEditableGroup("grid");
      } else if (subActive === "battery_inverter") {
        body = this.renderInverterConfigEditableGroup("battery_charging");
      } else if (subActive === "battery_settings") {
        body = this.renderInverterConfigEditableGroup("battery_config");
      } else if (subActive === "mode_control") {
        body = this.renderInverterConfigEditableGroup("system_control");
      } else if (subActive === "specification") {
        body = this.renderInverterConfigEditableGroup("specification");
      } else if (subActive === "voltages") {
        body = this.renderInverterConfigMonitorSections([
          { title: "PV voltages & currents", entities: [
            { label: "PV1 Voltage", entity: "sensor.deye_pv1_voltage" },
            { label: "PV1 Current", entity: "sensor.deye_pv1_current" },
            { label: "PV2 Voltage", entity: "sensor.deye_pv2_voltage" },
            { label: "PV2 Current", entity: "sensor.deye_pv2_current" },
            { label: "PV3 Voltage", entity: "sensor.deye_pv3_voltage" },
            { label: "PV3 Current", entity: "sensor.deye_pv3_current" },
          ] },
          { title: "AC / system voltages", entities: [
            { label: "Grid Voltage", entity: "sensor.deye_grid_voltage" },
            { label: "Inverter Voltage", entity: "sensor.deye_inverter_voltage" },
          ] },
        ], shownEntities);
      } else if (subActive === "power") {
        body = this.renderInverterConfigMonitorSections([
          { title: "PV power", entities: [
            { label: "PV Total Power", entity: "sensor.deye_pv_power" },
            { label: "PV1 Power", entity: "sensor.deye_pv1_power" },
            { label: "PV2 Power", entity: "sensor.deye_pv2_power" },
            { label: "PV3 Power", entity: "sensor.deye_pv3_power" },
          ] },
          { title: "Inverter / load / essential power", entities: [
            { label: "Inverter Power", entity: "sensor.deye_inverter_power" },
            { label: "Load Power", entity: "sensor.deye_load_power" },
            { label: "Load L1 Power", entity: "sensor.deye_load_l1_power" },
            { label: "Load L2 Power", entity: "sensor.deye_load_l2_power" },
            { label: "Essential Power", entity: "sensor.deye_essential_power" },
            { label: "Essential 1 Power", entity: "sensor.deye_essential_1_power" },
            { label: "Essential 2 Power", entity: "sensor.deye_essential_2_power" },
            { label: "Non-Essential Power", entity: "sensor.deye_non_essential_power" },
          ] },
          { title: "Grid / generator power", entities: [
            { label: "Grid Power", entity: "sensor.deye_grid_power" },
            { label: "Generator Power", entity: "sensor.deye_gen_power" },
          ] },
        ], shownEntities);
      } else if (subActive === "battery") {
        body = this.renderInverterConfigMonitorSections([
          { title: "Battery status", entities: [
            { label: "State of Charge", entity: "sensor.deye_battery_soc" },
            { label: "Battery Voltage", entity: "sensor.deye_battery_voltage" },
            { label: "Charging Voltage", entity: "sensor.deye_battery_charging_voltage" },
            { label: "Battery Current", entity: "sensor.deye_battery_current" },
            { label: "Battery Power", entity: "sensor.deye_battery_power" },
            { label: "Battery Temperature", entity: "sensor.deye_battery_temperature" },
            { label: "Battery 1 SOC", entity: "sensor.deye_bat1_soc" },
            { label: "Battery 1 Cycles", entity: "sensor.deye_bat1_cycle" },
            { label: "Charge Limit Current", entity: "sensor.deye_battery_charge_limit_current" },
            { label: "Discharge Limit Current", entity: "sensor.deye_battery_discharge_limit_current" },
          ] },
          { title: "Battery energy", entities: [
            { label: "Battery Charge Today", entity: "sensor.deye_day_battery_charge" },
            { label: "Battery Discharge Today", entity: "sensor.deye_day_battery_discharge" },
            { label: "Battery Charge Total", entity: "sensor.deye_total_battery_charge" },
            { label: "Battery Discharge Total", entity: "sensor.deye_total_battery_discharge" },
          ] },
        ], shownEntities);
      } else if (subActive === "energy") {
        body = this.renderInverterConfigMonitorSections([
          { title: "Energy today", entities: [
            { label: "PV Energy Today", entity: "sensor.deye_day_pv_energy" },
            { label: "Load Energy Today", entity: "sensor.deye_day_load_energy" },
            { label: "Grid Import Today", entity: "sensor.deye_day_grid_import" },
            { label: "Grid Export Today", entity: "sensor.deye_day_grid_export" },
            { label: "Active Energy Today", entity: "sensor.deye_day_active_energy" },
            { label: "Reactive Energy Today", entity: "sensor.deye_day_reactive_energy" },
          ] },
          { title: "Energy totals", entities: [
            { label: "PV Total", entity: "sensor.deye_total_pv_energy" },
            { label: "Load Total", entity: "sensor.deye_total_load_energy" },
            { label: "Grid Import Total", entity: "sensor.deye_total_grid_import" },
            { label: "Grid Export Total", entity: "sensor.deye_total_grid_export" },
            { label: "Active Energy Total", entity: "sensor.deye_total_active_energy" },
            { label: "PV Energy Year", entity: "sensor.deye_year_pv_energy" },
            { label: "Load Energy Year", entity: "sensor.deye_year_load_energy" },
            { label: "Grid Export Year", entity: "sensor.deye_year_grid_export" },
          ] },
        ], shownEntities);
      }
    } else if (topActive === "power_flow") {
      subTabs = this.powerFlowSubTabDefs();
      subActive = subTabs.some((tab) => tab.key === this._powerFlowSubTab) ? this._powerFlowSubTab : "general";
      this._powerFlowSubTab = subActive;
      subAttr = "data-power-flow-subtab";
      subAria = "Power flow sections";
      body = this.renderPowerFlowConfigTab();
    } else if (topActive === "graph_config") {
      subTabs = this.graphConfigSubTabDefs();
      subActive = subTabs.some((tab) => tab.key === this._graphConfigSubTab) ? this._graphConfigSubTab : (subTabs[0]?.key || "");
      this._graphConfigSubTab = subActive;
      subAttr = "data-graph-config-subtab";
      subAria = "Graph config groups";
      body = this.renderGraphConfigTab();
    }

    const sig = this._renderSig(topActive, subActive);
    if (sig === this._lastRenderSig) return;
    this._lastRenderSig = sig;

    if (!body) body = `<div class="ic-hint">No data available for this section.</div>`;

    const title = this.escapeHtml(String(this._config.title || "Inverter configuration"));
    const err = this._inverterConfigError ? `<div class="ic-hint ic-bad">${this.escapeHtml(this._inverterConfigError)}</div>` : "";

    this.innerHTML = `
      <ha-card class="ic-card">
        <style>
          .ic-card { --ic-bg: var(--card-background-color, #111); --ic-surface: rgba(255,255,255,.03); --ic-surface2: rgba(255,255,255,.06); --ic-line: rgba(118,166,190,.22); --ic-text: #eef7ff; --ic-muted: #9eb8c8; --ic-accent: #4da3ff; --ic-good: var(--success-color, #66bb6a); --ic-bad: var(--error-color, #ff6b6b); --primary-text-color:#eef7ff; --secondary-text-color:#9eb8c8; --divider-color:rgba(118,166,190,.22); --ha-card-background:transparent; --card-background-color:rgba(9,24,35,.92); color: var(--ic-text); background: radial-gradient(circle at 18% 0%,rgba(26,106,164,.22),transparent 34%),linear-gradient(180deg,#020913,#06131c 54%,#050b10); border: 1px solid rgba(101,142,164,.32); box-shadow: 0 18px 45px rgba(0,0,0,.35); overflow: hidden; font-family: Roboto,Arial,sans-serif; font-size: 14px; }
          .ic-wrap { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
          .ic-header { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; justify-content: space-between; }
          .ic-header h2 { margin: 0; font-size: 1.35rem; line-height: 1.2; }
          .ic-sub { margin: 4px 0 0; color: var(--ic-muted); font-size: .92rem; }
          .ic-toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
          .ic-btn, .ic-action { appearance: none; border: 1px solid var(--ic-line); background: var(--ic-surface2); color: var(--ic-text); border-radius: 10px; padding: 8px 12px; font: inherit; cursor: pointer; }
          .ic-btn:hover, .ic-action:hover { border-color: var(--ic-accent); }
          .ic-btn:disabled, .ic-action:disabled { opacity: .55; cursor: default; }
          .ic-btn-primary, .ic-action { background: color-mix(in srgb, var(--ic-accent) 22%, var(--ic-surface2)); border-color: color-mix(in srgb, var(--ic-accent) 45%, var(--ic-line)); }
          .ic-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
          .ic-tab { appearance: none; border: 1px solid var(--ic-line); background: transparent; color: var(--ic-muted); border-radius: 999px; padding: 7px 12px; font: inherit; cursor: pointer; }
          .ic-tab.active { color: var(--ic-text); background: color-mix(in srgb, var(--ic-accent) 18%, transparent); border-color: color-mix(in srgb, var(--ic-accent) 45%, var(--ic-line)); }
          .ic-body { display: flex; flex-direction: column; gap: 12px; }
          .ic-section { background: rgba(255,255,255,.02); border: 1px solid var(--ic-line); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
          .ic-section h4 { margin: 0; font-size: 1rem; }
          .ic-table-wrap { overflow-x: auto; }
          .ic-table { width: 100%; border-collapse: collapse; min-width: 420px; }
          .ic-table th, .ic-table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(118,166,190,.14); vertical-align: top; }
          .ic-table th { color: var(--ic-muted); font-size: .85rem; font-weight: 600; }
          .ic-muted { color: var(--ic-muted); }
          .ic-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; word-break: break-word; }
          .ic-good { color: var(--ic-good); font-weight: 600; }
          .ic-bad-text { color: var(--ic-bad); font-weight: 600; }
          .ic-hint { font-size: .9rem; color: var(--ic-muted); padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,.08); }
          .ic-hint.ic-ok { color: var(--ic-good); background: color-mix(in srgb, var(--ic-good) 12%, transparent); }
          .ic-hint.ic-bad { color: var(--ic-bad); background: color-mix(in srgb, var(--ic-bad) 12%, transparent); }
          .ic-field { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
          .ic-field input, .ic-select, .ic-input, .pf-group .pf-entity-input, .pf-edit input[type="text"] { background: var(--card-background-color, rgba(0,0,0,.2)); color: var(--ic-text); border: 1px solid var(--ic-line); border-radius: 8px; padding: 8px 10px; font: inherit; min-width: 140px; max-width: 100%; }
          .ic-field input:focus, .ic-select:focus, .ic-input:focus, .pf-group .pf-entity-input:focus, .pf-edit input[type="text"]:focus { outline: 2px solid color-mix(in srgb, var(--ic-accent) 45%, transparent); border-color: var(--ic-accent); }
          .ic-unit { color: var(--ic-muted); font-size: .88rem; }
          .ic-readonly { color: var(--ic-text); }
          .ic-new { color: var(--ic-accent); font-weight: 600; }
          .pf-edit { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(118,166,190,.14); }
          .pf-edit-title { color: var(--ic-muted); font-size: .88rem; font-weight: 600; }
          .pf-edit-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
          .pf-group > .pf-edit + .pf-edit { margin-top: 16px; }
          .pf-edit select { min-width: 120px; }
          .pf-edit input[type="color"] { width: 48px; height: 36px; padding: 2px; }
          .pf-group .pf-entity-input, .pf-edit .pf-detail-entity-input, .pf-edit input[data-pf-summary$=":entity"], .ic-table input.ic-input[data-gc-series$=":entity"] { min-width: 480px; width: 480px; max-width: 100%; }
          .pf-edit .pf-detail-label-input { min-width: 240px; max-width: 100%; }
          .pf-row-actions { display: flex; flex-wrap: wrap; gap: 4px; }
          .ic-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 1000; }
          .ic-overlay-card { width: min(760px, 100%); max-height: min(85vh, 900px); overflow: auto; background: var(--card-background-color, #1c1c1c); color: var(--ic-text); border: 1px solid var(--ic-line); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.45); }
          .ic-overlay-head { padding: 16px 18px; border-bottom: 1px solid var(--ic-line); }
          .ic-overlay-head h3 { margin: 0 0 6px; font-size: 1.15rem; }
          .ic-overlay-head p { margin: 0; color: var(--ic-muted); font-size: .92rem; }
          .ic-overlay-body { padding: 14px 18px; }
          .ic-overlay-actions { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 18px; border-top: 1px solid var(--ic-line); flex-wrap: wrap; }
          .ic-confirm-table td, .ic-confirm-table th { white-space: normal; word-break: break-word; }
          @media (max-width: 720px) {
            .ic-wrap { padding: 12px; }
            .ic-header { flex-direction: column; align-items: stretch; }
            .ic-toolbar { width: 100%; }
            .ic-toolbar .ic-btn { flex: 1; }
            .ic-table { min-width: 280px; font-size: .94rem; }
            .ic-table th, .ic-table td { padding: 8px 6px; }
            .ic-field { display: flex; width: 100%; }
            .ic-field input, .ic-select { width: 100%; min-width: 0; }
            .pf-group .pf-entity-input, .pf-edit .pf-detail-entity-input, .pf-edit input[data-pf-summary$=":entity"], .ic-table input.ic-input[data-gc-series$=":entity"], .pf-edit .pf-detail-label-input { width: 100%; min-width: 0; }
            .ic-overlay { padding: 10px; align-items: flex-end; }
            .ic-overlay-card { width: 100%; max-height: 90vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
            .ic-overlay-actions .ic-btn { flex: 1; }
          }
        </style>
        <div class="ic-wrap">
          <div class="ic-header">
            <div>
              <h2>${title}</h2>
              <p class="ic-sub">Live values are read from the inverter every time this page is accessed. Review changes before uploading.</p>
            </div>
            <div class="ic-toolbar">
              <button class="ic-btn" data-refresh-inverter-config="1" ${this._inverterConfigLoading ? "disabled" : ""}>${this._inverterConfigLoading ? "Loading…" : "Refresh live values"}</button>
            </div>
          </div>
          ${err}
          <div class="ic-tabs" role="tablist" aria-label="Configuration sections">
            ${topTabs.map((tab) => `<button type="button" role="tab" aria-selected="${topActive === tab.key ? "true" : "false"}" class="ic-tab ${topActive === tab.key ? "active" : ""}" data-ic-top-tab="${tab.key}">${this.escapeHtml(tab.label)}</button>`).join("")}
          </div>
          ${subTabs.length ? `<div class="ic-tabs" role="tablist" aria-label="${this.escapeHtml(subAria)}">${subTabs.map((tab) => `<button type="button" role="tab" aria-selected="${subActive === tab.key ? "true" : "false"}" class="ic-tab ${subActive === tab.key ? "active" : ""}" ${subAttr}="${tab.key}">${this.escapeHtml(tab.label)}</button>`).join("")}</div>` : ""}
          <div class="ic-body">${body}</div>
        </div>
        ${this.renderConfirmOverlay()}
      </ha-card>`;

    this._bind();
  }

  _bind() {
    this.querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("focusout", () => {
      if (this._focusoutRenderTimer) clearTimeout(this._focusoutRenderTimer);
      this._focusoutRenderTimer = setTimeout(() => {
        this._focusoutRenderTimer = null;
        if (this.isConnected === false) return;
        this._render();
      }, 0);
    }));
    this.querySelectorAll("[data-ic-top-tab]").forEach((el) => el.addEventListener("click", () => {
      this._topTab = el.dataset.icTopTab || "inverter_config";
      this._render();
    }));
    this.querySelectorAll("[data-inverter-config-subtab]").forEach((el) => el.addEventListener("click", () => {
      this._inverterConfigSubTab = el.dataset.inverterConfigSubtab || "inverter";
      this._render();
    }));
    this.querySelectorAll("[data-power-flow-subtab]").forEach((el) => el.addEventListener("click", () => {
      this._powerFlowSubTab = el.dataset.powerFlowSubtab || "general";
      this._render();
    }));
    this.querySelectorAll("[data-graph-config-subtab]").forEach((el) => el.addEventListener("click", () => {
      this._graphConfigSubTab = el.dataset.graphConfigSubtab || "";
      this._render();
    }));
    this.querySelectorAll("[data-refresh-inverter-config]").forEach((el) => el.addEventListener("click", () => {
      this._loadLive(true);
    }));
    this.querySelectorAll("[data-sync-inverter-datetime]").forEach((el) => el.addEventListener("click", () => {
      this.syncInverterDatetime();
    }));
    this.querySelectorAll("[data-apply-inverter-config]").forEach((el) => el.addEventListener("click", () => {
      this.requestApplyInverterConfigGroup(el.dataset.applyInverterConfig);
    }));
    this.querySelectorAll("[data-inverter-config-field]").forEach((el) => {
      const update = () => { this._inverterConfigDrafts[el.dataset.inverterConfigField] = el.value; };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-pf-entity]").forEach((el) => {
      const update = () => {
        this.powerFlowDraft().entities[el.dataset.pfEntity] = el.value;
        this._powerFlowDraftDirty = true;
      };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-pf-detail]").forEach((el) => {
      const [group, index, field] = String(el.dataset.pfDetail).split(":");
      const update = () => {
        const rows = this.powerFlowDraft().node_detail_layout?.[group];
        if (!Array.isArray(rows) || !rows[Number(index)]) return;
        rows[Number(index)][field] = el.value;
        this._powerFlowDraftDirty = true;
      };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-pf-chip]").forEach((el) => {
      const [row, index, field] = String(el.dataset.pfChip).split(":");
      if (row !== "summary") return;
      const update = () => {
        const rows = this.powerFlowDraft().chip_rows.summary;
        if (!Array.isArray(rows) || !rows[Number(index)]) return;
        rows[Number(index)][field] = el.value;
        this._powerFlowDraftDirty = true;
      };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-pf-summary]").forEach((el) => {
      const [chipIndex, itemIndex, field] = String(el.dataset.pfSummary).split(":");
      const update = () => {
        const chip = this.powerFlowDraft().chip_rows.summary?.[Number(chipIndex)];
        if (!chip || !Array.isArray(chip.items) || !chip.items[Number(itemIndex)]) return;
        chip.items[Number(itemIndex)][field] = el.value;
        this._powerFlowDraftDirty = true;
      };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-pf-layout]").forEach((el) => el.addEventListener("change", () => {
      const draft = this.powerFlowDraft();
      draft.layout = el.value === "left_right" ? "left_right" : "cross";
      this._powerFlowDraftDirty = true;
    }));
    this.querySelectorAll("[data-pf-add-detail]").forEach((el) => el.addEventListener("click", () => {
      const group = el.dataset.pfAddDetail;
      const draft = this.powerFlowDraft();
      draft.node_detail_layout[group] = Array.isArray(draft.node_detail_layout[group]) ? draft.node_detail_layout[group] : [];
      draft.node_detail_layout[group].push({ label: "New reading", entity: "", format: "num" });
      this._powerFlowDraftDirty = true;
      this._render();
    }));
    this.querySelectorAll("[data-pf-remove-detail]").forEach((el) => el.addEventListener("click", () => {
      const [group, index] = String(el.dataset.pfRemoveDetail).split(":");
      this.removePowerFlowDetailRow(group, index);
    }));
    this.querySelectorAll("[data-pf-move-detail]").forEach((el) => el.addEventListener("click", () => {
      const [group, index, direction] = String(el.dataset.pfMoveDetail).split(":");
      this.movePowerFlowDetailRow(group, index, direction);
    }));
    this.querySelectorAll("[data-pf-add-chip]").forEach((el) => el.addEventListener("click", () => {
      if (el.dataset.pfAddChip !== "summary") return;
      const draft = this.powerFlowDraft();
      draft.chip_rows.summary = Array.isArray(draft.chip_rows.summary) ? draft.chip_rows.summary : [];
      draft.chip_rows.summary.push({
        label: "New group",
        items: [{ label: "New reading", entity: "", format: "num", kind: "bolt", color: "#bc63ff" }],
      });
      this._powerFlowDraftDirty = true;
      this._render();
    }));
    this.querySelectorAll("[data-pf-remove-chip]").forEach((el) => el.addEventListener("click", () => {
      const [row, index] = String(el.dataset.pfRemoveChip).split(":");
      if (row !== "summary") return;
      const rows = this.powerFlowDraft().chip_rows.summary;
      if (Array.isArray(rows)) rows.splice(Number(index), 1);
      this._powerFlowDraftDirty = true;
      this._render();
    }));
    this.querySelectorAll("[data-pf-add-summary-item]").forEach((el) => el.addEventListener("click", () => {
      const chip = this.powerFlowDraft().chip_rows.summary?.[Number(el.dataset.pfAddSummaryItem)];
      if (!chip) return;
      chip.items = Array.isArray(chip.items) ? chip.items : [];
      chip.items.push({ label: "New reading", entity: "", format: "num", kind: "bolt", color: "#bc63ff" });
      this._powerFlowDraftDirty = true;
      this._render();
    }));
    this.querySelectorAll("[data-pf-remove-summary-item]").forEach((el) => el.addEventListener("click", () => {
      const [chipIndex, itemIndex] = String(el.dataset.pfRemoveSummaryItem).split(":");
      const chip = this.powerFlowDraft().chip_rows.summary?.[Number(chipIndex)];
      if (chip && Array.isArray(chip.items)) chip.items.splice(Number(itemIndex), 1);
      this._powerFlowDraftDirty = true;
      this._render();
    }));
    this.querySelectorAll("[data-pf-save]").forEach((el) => el.addEventListener("click", () => this.savePowerFlowDisplay()));
    this.querySelectorAll("[data-gc-save]").forEach((el) => el.addEventListener("click", () => this.saveGraphsDisplay()));
    this.querySelectorAll("[data-gc-group]").forEach((el) => {
      const [gi, field] = String(el.dataset.gcGroup).split(":");
      const update = () => { const g = this.graphsDraft().groups?.[Number(gi)]; if (g) { g[field] = el.value; this._graphsDraftDirty = true; } };
      el.addEventListener("input", update); el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-gc-group-enabled]").forEach((el) => el.addEventListener("change", () => {
      const g = this.graphsDraft().groups?.[Number(el.dataset.gcGroupEnabled)]; if (g) { g.enabled = el.checked; this._graphsDraftDirty = true; }
    }));
    this.querySelectorAll("[data-gc-chart]").forEach((el) => {
      const [gi, ci, field] = String(el.dataset.gcChart).split(":");
      const update = () => { const c = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]; if (c) { c[field] = el.value; this._graphsDraftDirty = true; } };
      el.addEventListener("input", update); el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-gc-chart-enabled]").forEach((el) => el.addEventListener("change", () => {
      const [gi, ci] = String(el.dataset.gcChartEnabled).split(":"); const c = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]; if (c) { c.enabled = el.checked; this._graphsDraftDirty = true; }
    }));
    this.querySelectorAll("[data-gc-series]").forEach((el) => {
      const [gi, ci, si, field] = String(el.dataset.gcSeries).split(":");
      const update = () => { const ser = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]?.series?.[Number(si)]; if (ser) { ser[field] = el.value; this._graphsDraftDirty = true; } };
      el.addEventListener("input", update); el.addEventListener("change", update);
    });
    this.querySelectorAll("[data-gc-series-enabled]").forEach((el) => el.addEventListener("change", () => {
      const [gi, ci, si] = String(el.dataset.gcSeriesEnabled).split(":"); const ser = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]?.series?.[Number(si)]; if (ser) { ser.enabled = el.checked; this._graphsDraftDirty = true; }
    }));
    this.querySelectorAll("[data-gc-add-group]").forEach((el) => el.addEventListener("click", () => {
      const d = this.graphsDraft(); d.groups = Array.isArray(d.groups) ? d.groups : [];
      d.groups.push({ key: `group_${Date.now()}`, label: "New group", enabled: true, charts: [] }); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-gc-remove-group]").forEach((el) => el.addEventListener("click", () => {
      const d = this.graphsDraft(); if (Array.isArray(d.groups)) d.groups.splice(Number(el.dataset.gcRemoveGroup), 1); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-gc-add-chart]").forEach((el) => el.addEventListener("click", () => {
      const g = this.graphsDraft().groups?.[Number(el.dataset.gcAddChart)]; if (!g) return; g.charts = Array.isArray(g.charts) ? g.charts : [];
      g.charts.push({ key: `chart_${Date.now()}`, title: "New chart", unit: "W", enabled: true, series: [] }); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-gc-remove-chart]").forEach((el) => el.addEventListener("click", () => {
      const [gi, ci] = String(el.dataset.gcRemoveChart).split(":"); const g = this.graphsDraft().groups?.[Number(gi)]; if (g && Array.isArray(g.charts)) g.charts.splice(Number(ci), 1); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-gc-add-series]").forEach((el) => el.addEventListener("click", () => {
      const [gi, ci] = String(el.dataset.gcAddSeries).split(":"); const c = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]; if (!c) return; c.series = Array.isArray(c.series) ? c.series : [];
      c.series.push({ key: `series_${Date.now()}`, label: "New series", entity: "", color: "#5bc0ff", enabled: true }); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-gc-remove-series]").forEach((el) => el.addEventListener("click", () => {
      const [gi, ci, si] = String(el.dataset.gcRemoveSeries).split(":"); const c = this.graphsDraft().groups?.[Number(gi)]?.charts?.[Number(ci)]; if (c && Array.isArray(c.series)) c.series.splice(Number(si), 1); this._graphsDraftDirty = true; this._render();
    }));
    this.querySelectorAll("[data-ic-cancel-apply]").forEach((el) => el.addEventListener("click", () => this.cancelPendingApply()));
    this.querySelectorAll("[data-ic-confirm-apply]").forEach((el) => el.addEventListener("click", () => this.confirmPendingApply()));
    const overlay = this.querySelector("[data-ic-overlay]");
    if (overlay) {
      overlay.addEventListener("click", (e) => { if (e.target === overlay) this.cancelPendingApply(); });
    }
  }
}

