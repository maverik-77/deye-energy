// Resource revision: v=0.8.1.09
export class DeyeEnergyTriggerLogsCard extends HTMLElement {
  constructor() {
    super();
    this._page = 1;
    this._pageSize = 20;
    this._sortKey = "timestamp";
    this._sortDir = "desc";
    this._lastSig = "";
  }

  setConfig(config) {
    this._config = config || {};
    this._filter = this._config.default_filter || "24h";
    this._page = 1;
    this._sortKey = "timestamp";
    this._sortDir = "desc";
    this._lastSig = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass) return;
    this.style.display = "block";
    this.style.height = "100%";

    const title = this._escape(this._config.title || "Trigger logs");
    const entityId = this._findEntity();
    const stateObj = entityId ? this._hass.states[entityId] : null;
    const entries = Array.isArray(stateObj?.attributes?.entries)
      ? [...stateObj.attributes.entries]
      : [];
    const filtered = this._applyFilter(entries);
    this._applySort(filtered);

    const totalPages = Math.max(1, Math.ceil(filtered.length / this._pageSize));
    if (this._page > totalPages) this._page = totalPages;
    if (this._page < 1) this._page = 1;
    const startIdx = (this._page - 1) * this._pageSize;
    const pageEntries = filtered.slice(startIdx, startIdx + this._pageSize);

    const sig = JSON.stringify([
      entityId,
      stateObj?.last_updated || stateObj?.state || "",
      entries.length,
      entries[0]?.timestamp || "",
      entries[entries.length - 1]?.timestamp || "",
      this._filter,
      this._sortKey,
      this._sortDir,
      this._page,
      title,
    ]);
    if (sig === this._lastSig && this.querySelector("[data-trigger-log-scroll]")) {
      return;
    }

    const scrollEl = this.querySelector("[data-trigger-log-scroll]");
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    this._lastSig = sig;

    const options = [
      ["1h", "Past hour"],
      ["2h", "Past 2 hrs"],
      ["today", "Day"],
      ["24h", "Past 24 hours"],
      ["7d", "Past week"],
      ["30d", "Past 30 days"],
    ];
    const select = options
      .map(
        ([v, l]) =>
          `<option value="${v}" ${this._filter === v ? "selected" : ""}>${l}</option>`
      )
      .join("");

    let body = "";
    if (!stateObj) {
      body = `<div style="padding:8px 0;color:var(--secondary-text-color);">Trigger log sensor not found. Ensure the Deye Energy integration is loaded and updated.</div>`;
    } else if (!entries.length) {
      body = `<div style="padding:8px 0;color:var(--secondary-text-color);">No inverter triggers logged yet.</div>`;
    } else if (!filtered.length) {
      body = `<div style="padding:8px 0;color:var(--secondary-text-color);">No inverter triggers in the selected period.</div>`;
    } else {
      const rows = pageEntries.map((e) => this._row(e)).join("");
      const from = filtered.length ? startIdx + 1 : 0;
      const to = startIdx + pageEntries.length;
      body = `
        <div data-trigger-log-scroll style="flex:1;min-height:280px;overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--divider-color);border-radius:8px;">
          <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.92em;line-height:1.25;">
            <thead>
              <tr>
                ${this._sortHeader("Time", "timestamp")}
                ${this._sortHeader("Input / trigger", "input")}
                ${this._sortHeader("Status / source", "status")}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <div style="color:var(--secondary-text-color);font-size:0.9em;">Showing ${from}-${to} of ${filtered.length} (30-day retention: ${entries.length})</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" data-trigger-page="prev" ${this._page <= 1 ? "disabled" : ""} style="padding:4px 10px;border-radius:6px;border:1px solid var(--divider-color);background:rgba(9,24,35,.92);color:var(--primary-text-color);cursor:${this._page <= 1 ? "default" : "pointer"};opacity:${this._page <= 1 ? "0.5" : "1"};">Prev</button>
            <span style="font-size:0.9em;color:var(--secondary-text-color);min-width:72px;text-align:center;">Page ${this._page} / ${totalPages}</span>
            <button type="button" data-trigger-page="next" ${this._page >= totalPages ? "disabled" : ""} style="padding:4px 10px;border-radius:6px;border:1px solid var(--divider-color);background:rgba(9,24,35,.92);color:var(--primary-text-color);cursor:${this._page >= totalPages ? "default" : "pointer"};opacity:${this._page >= totalPages ? "0.5" : "1"};">Next</button>
          </div>
        </div>`;
    }

    this.innerHTML = `
      <ha-card header="${title}" style="height:100%;min-height:480px;display:flex;flex-direction:column;overflow:hidden;font-family:Roboto,Arial,sans-serif;font-size:14px;background:radial-gradient(circle at 18% 0%,rgba(26,106,164,.22),transparent 34%),linear-gradient(180deg,#020913,#06131c 54%,#050b10);border:1px solid rgba(101,142,164,.32);box-shadow:0 18px 45px rgba(0,0,0,.35);color:#eef7ff;--primary-text-color:#eef7ff;--secondary-text-color:#9eb8c8;--divider-color:rgba(118,166,190,.22);--ha-card-background:transparent;--card-background-color:rgba(9,24,35,.92);--ha-card-header-color:#eef7ff;">
        <div class="card-content" style="flex:1;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <div style="color:var(--secondary-text-color);font-size:0.9em;">${filtered.length} event${filtered.length === 1 ? "" : "s"} in selected period</div>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.95em;color:var(--primary-text-color);">Filter
              <select id="trigger-log-filter" style="padding:4px 8px;border-radius:6px;border:1px solid var(--divider-color);background:rgba(9,24,35,.92);color:var(--primary-text-color);">${select}</select>
            </label>
          </div>
          ${body}
        </div>
      </ha-card>`;

    const sel = this.querySelector("#trigger-log-filter");
    if (sel) {
      sel.addEventListener("change", (ev) => {
        this._filter = ev.target.value;
        this._page = 1;
        this._lastSig = "";
        this._render();
      });
    }
    this.querySelectorAll("[data-trigger-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-trigger-page");
        const total = Math.max(1, Math.ceil(filtered.length / this._pageSize));
        if (dir === "prev" && this._page > 1) this._page -= 1;
        if (dir === "next" && this._page < total) this._page += 1;
        this._lastSig = "";
        this._render();
        const nextScroll = this.querySelector("[data-trigger-log-scroll]");
        if (nextScroll) nextScroll.scrollTop = 0;
      });
    });
    this.querySelectorAll("[data-log-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-log-sort");
        if (!key) return;
        if (this._sortKey === key) {
          this._sortDir = this._sortDir === "asc" ? "desc" : "asc";
        } else {
          this._sortKey = key;
          this._sortDir = key === "timestamp" ? "desc" : "asc";
        }
        this._page = 1;
        this._lastSig = "";
        this._render();
      });
    });

    const newScroll = this.querySelector("[data-trigger-log-scroll]");
    if (newScroll && scrollTop) {
      newScroll.scrollTop = scrollTop;
    }
  }

  _row(e) {
    const ok = e && e.success === true;
    const status = ok ? "Success" : "Failed";
    const color = ok ? "var(--success-color, #4caf50)" : "var(--error-color, #f44336)";
    const bg = ok ? "rgba(76,175,80,0.14)" : "rgba(244,67,54,0.14)";
    const ts = this._escape(this._formatTime(e?.timestamp));
    const target = this._escape(e?.entity_id || "");
    const service = this._escape(
      `${e?.domain || ""}.${e?.service || ""}` +
        (e?.value !== undefined && e?.value !== null && e?.value !== ""
          ? ` = ${e.value}`
          : "")
    );
    const msgParts = [];
    if (e?.error) msgParts.push(String(e.error));
    if (e?.source) msgParts.push(`Source: ${e.source}`);
    const msg = this._escape(msgParts.join(" | "));
    return `<tr>
      <td style="white-space:nowrap;padding:5px 8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">${ts}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">
        <div style="word-break:break-word;">
          <span style="font-family:var(--code-font-family, monospace);font-size:0.92em;">${target || "—"}</span>
          <span style="color:var(--secondary-text-color);font-size:0.9em;margin-left:6px;">${service || "—"}</span>
        </div>
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">
        <div style="display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;">
          <span style="display:inline-block;padding:1px 8px;border-radius:999px;font-weight:600;font-size:0.88em;color:${color};background:${bg};white-space:nowrap;">${status}</span>
          ${msg ? `<span style="color:var(--secondary-text-color);font-size:0.85em;word-break:break-word;">${msg}</span>` : ""}
        </div>
      </td>
    </tr>`;
  }

  _sortHeader(label, key) {
    const active = this._sortKey === key;
    const arrow = !active ? "↕" : this._sortDir === "asc" ? "↑" : "↓";
    const color = active ? "var(--primary-text-color)" : "var(--secondary-text-color)";
    return `<th style="position:sticky;top:0;z-index:2;text-align:left;padding:6px 8px;border-bottom:1px solid var(--divider-color);background:rgba(9,24,35,.96);white-space:nowrap;">
      <button type="button" data-log-sort="${this._escape(key)}" style="all:unset;cursor:pointer;color:${color};font-weight:600;display:inline-flex;align-items:center;gap:4px;">
        <span>${this._escape(label)}</span><span style="font-size:0.85em;opacity:${active ? "1" : "0.65"};">${arrow}</span>
      </button>
    </th>`;
  }

  _sortValue(entry, key) {
    if (key === "timestamp") {
      const t = new Date(entry?.timestamp || 0).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    if (key === "input") {
      const target = String(entry?.entity_id || "").toLowerCase();
      const service = `${entry?.domain || ""}.${entry?.service || ""}${entry?.value !== undefined && entry?.value !== null && entry?.value !== "" ? ` = ${entry.value}` : ""}`.toLowerCase();
      return `${target} ${service}`.trim();
    }
    if (key === "status") {
      const ok = entry?.success === true ? "0success" : "1failed";
      const src = String(entry?.source || entry?.error || "").toLowerCase();
      return `${ok} ${src}`.trim();
    }
    return "";
  }

  _applySort(entries) {
    const key = this._sortKey || "timestamp";
    const dir = this._sortDir === "asc" ? 1 : -1;
    entries.sort((a, b) => {
      const av = this._sortValue(a, key);
      const bv = this._sortValue(b, key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      const at = new Date(a?.timestamp || 0).getTime();
      const bt = new Date(b?.timestamp || 0).getTime();
      return (at - bt) * dir;
    });
  }

  _formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  }

  _applyFilter(entries) {
    const now = new Date();
    let cutoff = null;
    switch (this._filter) {
      case "1h":
        cutoff = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "2h":
        cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        break;
      case "today":
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "24h":
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    return entries.filter((e) => {
      const t = new Date(e?.timestamp);
      if (Number.isNaN(t.getTime())) return true;
      return t >= cutoff;
    });
  }

  _findEntity() {
    if (!this._hass?.states) return "";
    if (this._config?.entity && this._hass.states[this._config.entity]) {
      return this._config.entity;
    }
    const ids = Object.keys(this._hass.states).filter(
      (id) => id.startsWith("sensor.") && id.includes("trigger_log")
    );
    return (
      ids.find((id) => id.includes("deye_energy") && id.endsWith("_trigger_log")) ||
      ids.find((id) => id.includes("deye") && id.includes("trigger_log")) ||
      ids[0] ||
      ""
    );
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return { title: "Trigger logs", default_filter: "24h" };
  }
}

