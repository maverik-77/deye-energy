// Resource revision: v=0.8.1.09
export class DeyeEnergyCard extends HTMLElement {
  setConfig(config) {
    this.config = config || {};
    this._interacting = false;
    this._pendingRender = false;
    this._dialog = null;
    this._lastTouDiagnosticsSignature = "";
    this._mappingDraft = null;
    this._mappingEditing = false;
    this._mappingSaveError = "";
    this._mappingStatus = "";
    this._mappingSaving = false;
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
    this._scrollTops = {};
    this._pageScrollTops = [];
    this._scrollRestoreFrame = null;
    this._scrollRestoreTimer = null;
    this._optimisticClearTimers = new Set();
    this._interactionRelease = null;
    this._isRendered = false;
    this._optimisticStates = {};
    this._pendingSaves = 0;
    this._saveStatus = "idle";
    this._saveMessage = "";
    this._saveStatusTimer = null;
    this._saveHadError = false;
    this._controlTogglePending = false;
    this._controlError = "";
    this._controlExpectedEnabled = null;
    this._controlFeedbackActive = false;
    this._defaultsApplying = false;
    this._defaultsStatus = "idle";
    this._defaultsMessage = "";
    this._resumeApplying = false;
    this._settingsTab = "tariff";
    this._scheduleTab = "manual";
    this._updateFrame = null;
    this._lastSlowSignature = "";
    this._tariffDraft = null;
    this._tariffSaveStatus = "";
    this._manualScheduleDraft = null;
    this._manualScheduleSaving = false;
    this._manualScheduleStatus = "";
    this._manualScheduleError = "";
    this._manualScheduleActive = false;
    this._manualScheduleAutoLoadAttempted = false;
    this._manualScheduleEditing = new Set();
  }

  layoutConfig() {
    const cfg = this.config?.layout || {};
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const asBool = (value, fallback) => (typeof value === "boolean" ? value : fallback);
    const asNumber = (value, fallback, min, max) => {
      const num = Number(value);
      return Number.isFinite(num) ? clamp(num, min, max) : fallback;
    };
    const asString = (value, fallback, allowed) => {
      const str = String(value || fallback).trim();
      return allowed.includes(str) ? str : fallback;
    };
    const defaults = {
      layout_mode: "auto",
      dashboard_width: 1280,
      phase_count: 1,
      center_dashboard: true,
      fit_to_width: false,
      allow_horizontal_scroll: false,
      grid_columns: null,
      grid_gap: 16,
      section: null,
      sections: {
        prices: true,
        solcast: true,
        schedule: true,
        sales_stats: true,
      },
      mobile: {
        mode: "auto",
        preserve_desktop_layout: false,
        fit_to_width: true,
        allow_horizontal_scroll: false,
        grid_columns: 1,
        mobile_breakpoint: 768,
      },
      prices_ratio: 0.80,
      buy_prices_ratio: 0.80,
      solcast_ratio: 1.40,
      flow_animation_speed: 6,
    };
    const phaseCount = asNumber(cfg.phase_count, defaults.phase_count, 1, 3);
    const mobileDefaults = defaults.mobile;
    const mobile = {
      mode: asString(cfg.mobile?.mode, mobileDefaults.mode, ["auto", "full", "section", "single", "grid", "fit"]),
      preserve_desktop_layout: asBool(cfg.mobile?.preserve_desktop_layout, mobileDefaults.preserve_desktop_layout),
      fit_to_width: asBool(cfg.mobile?.fit_to_width, mobileDefaults.fit_to_width),
      allow_horizontal_scroll: asBool(cfg.mobile?.allow_horizontal_scroll, mobileDefaults.allow_horizontal_scroll),
      grid_columns: asNumber(cfg.mobile?.grid_columns, mobileDefaults.grid_columns, 1, 4),
      mobile_breakpoint: asNumber(cfg.mobile?.mobile_breakpoint, mobileDefaults.mobile_breakpoint, 320, 1600),
    };
    return {
      layout_mode: asString(cfg.layout_mode, defaults.layout_mode, ["auto", "full", "section", "single", "grid", "fit"]),
      dashboard_width: asNumber(cfg.dashboard_width, defaults.dashboard_width, 320, 2400),
      phase_count: phaseCount === 3 ? 3 : 1,
      center_dashboard: asBool(cfg.center_dashboard, defaults.center_dashboard),
      fit_to_width: asBool(cfg.fit_to_width, defaults.fit_to_width),
      allow_horizontal_scroll: asBool(cfg.allow_horizontal_scroll, defaults.allow_horizontal_scroll),
      grid_columns: cfg.grid_columns === null || cfg.grid_columns === undefined ? defaults.grid_columns : asNumber(cfg.grid_columns, defaults.grid_columns, 1, 6),
      grid_gap: asNumber(cfg.grid_gap, defaults.grid_gap, 0, 64),
      section: asString(cfg.section, defaults.section, ["prices", "solcast", "schedule", "sales_stats", "settings"]),
      sections: {
        prices: asBool(cfg.sections?.prices, defaults.sections.prices),
        solcast: asBool(cfg.sections?.solcast, defaults.sections.solcast),
        schedule: asBool(cfg.sections?.schedule, defaults.sections.schedule),
        sales_stats: asBool(cfg.sections?.sales_stats, defaults.sections.sales_stats),
      },
      mobile,
      prices_ratio: asNumber(cfg.prices_ratio, defaults.prices_ratio, 0.1, 5),
      buy_prices_ratio: asNumber(cfg.buy_prices_ratio, defaults.buy_prices_ratio, 0.1, 5),
      solcast_ratio: asNumber(cfg.solcast_ratio, defaults.solcast_ratio, 0.1, 5),
      flow_animation_speed: asNumber(cfg.flow_animation_speed, defaults.flow_animation_speed, 1, 20),
    };
  }

  isMobileLayout(layout) {
    const viewportWidth = window.innerWidth || 0;
    const hostWidth = this.clientWidth || this.getBoundingClientRect?.().width || 0;
    const width = hostWidth > 0 && viewportWidth > 0 ? Math.min(hostWidth, viewportWidth) : (hostWidth || viewportWidth);
    return width > 0 && width <= layout.mobile.mobile_breakpoint;
  }

  effectiveLayout() {
    const layout = this.layoutConfig();
    const isMobile = this.isMobileLayout(layout) && !layout.mobile.preserve_desktop_layout;
    layout.is_mobile = isMobile;
    if (isMobile) {
      const mobileMode = layout.mobile.mode;
      if (mobileMode !== "auto") {
        layout.layout_mode = mobileMode;
      }
      layout.fit_to_width = layout.mobile.fit_to_width;
      layout.allow_horizontal_scroll = layout.mobile.allow_horizontal_scroll;
      if (layout.mobile.grid_columns !== null && layout.mobile.grid_columns !== undefined) {
        layout.grid_columns = layout.mobile.grid_columns;
      }
    }
    if (layout.layout_mode === "full") {
      layout.fit_to_width = true;
      layout.center_dashboard = false;
    } else if (layout.layout_mode === "fit") {
      layout.fit_to_width = true;
      layout.center_dashboard = true;
    }
    return layout;
  }

  connectedCallback() {
    if (!this._dialogCloseHandler) {
      this._dialogCloseHandler = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const closeControl = target?.closest("[data-close-dialog]");
        if (!closeControl || !this.contains(closeControl)) return;
        if (closeControl.classList.contains("overlay") && target !== closeControl) return;
        event.preventDefault();
        event.stopPropagation();
        this.closeDialog();
      };
      this.addEventListener("click", this._dialogCloseHandler);
    }
    if (!this._dialogEscapeHandler) {
      this._dialogEscapeHandler = (event) => {
        if (event.key === "Escape" && this._dialog) this.closeDialog();
      };
      this.ownerDocument?.addEventListener("keydown", this._dialogEscapeHandler);
    }
    if (!this._wheelInteractionHandler) {
      this._wheelInteractionHandler = () => this.holdInteraction(900);
      this.addEventListener("wheel", this._wheelInteractionHandler, { passive: true });
    }
    if (!this._touchStartInteractionHandler) {
      this._touchStartInteractionHandler = () => this.holdInteraction(1300);
      this.addEventListener("touchstart", this._touchStartInteractionHandler, { passive: true });
    }
    if (!this._touchMoveInteractionHandler) {
      this._touchMoveInteractionHandler = () => this.holdInteraction(1300);
      this.addEventListener("touchmove", this._touchMoveInteractionHandler, { passive: true });
    }
    if (!this._focusInInteractionHandler) {
      this._focusInInteractionHandler = () => {
        window.clearTimeout(this._interactionRelease);
        this._interacting = true;
      };
      this.addEventListener("focusin", this._focusInInteractionHandler);
    }
    if (!this._focusOutInteractionHandler) {
      this._focusOutInteractionHandler = () => this.releaseInteraction(350);
      this.addEventListener("focusout", this._focusOutInteractionHandler);
    }
  }

  disconnectedCallback() {
    if (this._updateFrame) cancelAnimationFrame(this._updateFrame);
    if (this._scrollRestoreFrame) cancelAnimationFrame(this._scrollRestoreFrame);
    this._scrollRestoreFrame = null;
    if (this._scrollRestoreTimer) window.clearTimeout(this._scrollRestoreTimer);
    this._scrollRestoreTimer = null;
    this._optimisticClearTimers.forEach((timer) => window.clearTimeout(timer));
    this._optimisticClearTimers.clear();
    window.clearTimeout(this._saveStatusTimer);
    this._saveStatusTimer = null;
    this.querySelectorAll("[data-scroll-key]").forEach((el) => {
      el._demScrollController?.abort();
      el._demScrollController = null;
    });
    this._pageScrollTops = [];
    if (this._dialogEscapeHandler) {
      this.ownerDocument?.removeEventListener("keydown", this._dialogEscapeHandler);
      this._dialogEscapeHandler = null;
    }
    if (this._wheelInteractionHandler) {
      this.removeEventListener("wheel", this._wheelInteractionHandler);
      this._wheelInteractionHandler = null;
    }
    if (this._touchStartInteractionHandler) {
      this.removeEventListener("touchstart", this._touchStartInteractionHandler);
      this._touchStartInteractionHandler = null;
    }
    if (this._touchMoveInteractionHandler) {
      this.removeEventListener("touchmove", this._touchMoveInteractionHandler);
      this._touchMoveInteractionHandler = null;
    }
    if (this._focusInInteractionHandler) {
      this.removeEventListener("focusin", this._focusInInteractionHandler);
      this._focusInInteractionHandler = null;
    }
    if (this._focusOutInteractionHandler) {
      this.removeEventListener("focusout", this._focusOutInteractionHandler);
      this._focusOutInteractionHandler = null;
    }
    if (this._dialogCloseHandler) {
      this.removeEventListener("click", this._dialogCloseHandler);
      this._dialogCloseHandler = null;
    }
    window.clearTimeout(this._interactionRelease);
  }

  closeDialog() {
    if (!this._dialog) return;
    this._dialog = null;
    this._interacting = false;
    this.render();
    return true;
  }

  scheduleStateSignature(hass = this._hass) {
    const ids = Array.isArray(this._scheduleEntityIds) ? this._scheduleEntityIds : [];
    return ids.map((id) => `${id}:${hass?.states?.[id]?.state ?? "missing"}`).join("|");
  }

  set hass(hass) {
    this._hass = hass;
    this.maybeAutoLoadManualScheduleFromTou();
    const scheduleSignature = this.scheduleStateSignature(hass);
    const scheduleChanged = this._isRendered && scheduleSignature !== this._lastScheduleSignature;
    this._lastScheduleSignature = scheduleSignature;
    if (this._isRendered) {
      const touSignature = this.touDiagnosticsSignature();
      if (touSignature !== this._lastTouDiagnosticsSignature) {
        this._lastTouDiagnosticsSignature = touSignature;
        if (this._scheduleTab === "tou" && !this._dialog) this.requestScheduleRender();
      }
      if (scheduleChanged) {
        this.requestScheduleRender();
        return;
      }
      if (this._updateFrame) cancelAnimationFrame(this._updateFrame);
      this._updateFrame = requestAnimationFrame(() => {
        this._updateFrame = null;
        this.updateDynamicValues();
      });
      return;
    }
    this.render(true);
  }

  getCardSize() {
    return 12;
  }

  isInteracting() {
    const active = this.ownerDocument?.activeElement;
    return this._interacting || (active && this.contains(active));
  }

  releaseInteraction(delay = 350) {
    window.clearTimeout(this._interactionRelease);
    this._interactionRelease = window.setTimeout(() => {
      this._interacting = false;
      this.flushPendingRender();
    }, delay);
  }

  holdInteraction(delay = 850) {
    this._interacting = true;
    this.releaseInteraction(delay);
  }

  requestScheduleRender() {
    if (this.isInteracting()) {
      this._pendingRender = true;
      return false;
    }
    this._pendingRender = false;
    this.captureScrollPositions();
    this.render();
    return true;
  }

  flushPendingRender() {
    if (!this._pendingRender || this.isInteracting()) return false;
    this._pendingRender = false;
    this.captureScrollPositions();
    this.render();
    return true;
  }

  captureScrollPositions() {
    this.querySelectorAll("[data-scroll-key]").forEach((el) => {
      this._scrollTops[el.dataset.scrollKey] = el.scrollTop;
    });
    this._pageScrollTops = this.pageScrollContainers().map((el) => ({
      el,
      top: el.scrollTop,
      left: el.scrollLeft,
    }));
  }

  pageScrollContainers() {
    const containers = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const canScrollY = (el.scrollHeight || 0) - (el.clientHeight || 0) > 1;
      const canScrollX = (el.scrollWidth || 0) - (el.clientWidth || 0) > 1;
      if (canScrollY || canScrollX) containers.push(el);
    };

    add(document.scrollingElement);
    add(document.documentElement);
    add(document.body);

    let node = this;
    while (node) {
      if (node.nodeType === 1) add(node);
      if (node.assignedSlot) {
        node = node.assignedSlot;
      } else if (node.parentNode) {
        node = node.parentNode;
      } else {
        const root = node.getRootNode?.();
        node = root?.host || null;
      }
    }
    return containers;
  }

  restorePageScrollPositions() {
    const restore = () => {
      (this._pageScrollTops || []).forEach(({ el, top, left }) => {
        if (!el) return;
        try {
          el.scrollTop = top;
          el.scrollLeft = left;
        } catch (_err) {
          // Some Home Assistant containers are read-only during view transitions.
        }
      });
    };
    restore();
    if (!this.isConnected) return;
    if (this._scrollRestoreFrame) cancelAnimationFrame(this._scrollRestoreFrame);
    if (this._scrollRestoreTimer) window.clearTimeout(this._scrollRestoreTimer);
    this._scrollRestoreFrame = requestAnimationFrame(() => {
      this._scrollRestoreFrame = null;
      restore();
    });
    this._scrollRestoreTimer = window.setTimeout(() => {
      this._scrollRestoreTimer = null;
      restore();
    }, 0);
  }

  restoreScrollPositions() {
    this.querySelectorAll("[data-scroll-key]").forEach((el) => {
      const key = el.dataset.scrollKey;
      if (this._scrollTops[key] !== undefined) el.scrollTop = this._scrollTops[key];
      this.attachScrollHandlers(el);
    });
    this.restorePageScrollPositions();
  }

  attachScrollHandlers(el) {
    if (!el || el._demScrollController) return;
    const controller = new AbortController();
    const signal = controller.signal;
    el._demScrollController = controller;
    el.addEventListener("scroll", () => {
      this._scrollTops[el.dataset.scrollKey] = el.scrollTop;
      this.holdInteraction(900);
    }, { passive: true, signal });
    el.addEventListener("wheel", () => this.holdInteraction(900), { passive: true, signal });
    el.addEventListener("touchstart", () => this.holdInteraction(1200), { passive: true, signal });
    el.addEventListener("touchmove", () => this.holdInteraction(1200), { passive: true, signal });
    el.addEventListener("pointerenter", () => this.holdInteraction(900), { signal });
    el.addEventListener("pointerleave", () => this.releaseInteraction(350), { signal });
  }

  setText(selector, value) {
    const el = this.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = value;
      el.classList.remove("live-changed");
      void el.offsetWidth;
      el.classList.add("live-changed");
    }
  }

  setHtml(selector, value) {
    const el = this.querySelector(selector);
    if (el) el.innerHTML = value;
  }

  setClass(selector, baseClass, activeClass, isActive) {
    const el = this.querySelector(selector);
    if (!el) return;
    el.className = `${baseClass}${isActive ? ` ${activeClass}` : ""}`;
  }

  updateDynamicValues() {
    if (!this._hass || !this._isRendered) return;
    this.updateControlUi();
    const statusEntity = this.entity("sensor", "manager_status");
    const rawStatus = this.state(statusEntity);
    const [modeText, modeClass] = this.readMode(rawStatus);
    const batterySoc = this.entity("sensor", "battery_soc");
    const soldEnergyToday = this.entity("sensor", "sold_energy_today");
    const soldValueToday = this.entity("sensor", "sold_value_today");
    const sellPriceToday = this.entity("sensor", ["sell_price_today", "energy_price"]);
    const sellPriceTomorrow = this.entity("sensor", "sell_price_tomorrow");
    const buyPriceToday = this.entity("sensor", "buy_price_today");
    const buyPriceTomorrow = this.entity("sensor", "buy_price_tomorrow");
    const solcastPower = this.entity("sensor", "solcast_current_power");
    const solcastToday = this.entity("sensor", "solcast_forecast_today");
    const solcastTomorrow = this.entity("sensor", "solcast_forecast_tomorrow");
    const solcastDay3 = this.entity("sensor", "solcast_forecast_day_3");
    const solcastDay4 = this.entity("sensor", "solcast_forecast_day_4");
    const solcastDay5 = this.entity("sensor", "solcast_forecast_day_5");
    const solcastDay6 = this.entity("sensor", "solcast_forecast_day_6");
    const solcastDay7 = this.entity("sensor", "solcast_forecast_day_7");
    const solcastRemaining = this.entity("sensor", "solcast_remaining_today");
    const solcastPeakPower = this.entity("sensor", "solcast_peak_power_today");
    const dailyPvProduction = this.entity("sensor", "daily_pv_production");
    const solcastAccuracy = this.entity("sensor", "solcast_accuracy");
    const minSellPrice = this.entity("number", "minimum_sell_price");
    const priceThreshold = this.asNumber(this.numberState(minSellPrice, 0)) || 0;
    const scheduler = this.entity("switch", "scheduler");
    const controlMode = this.entity("select", "control_mode");
    const lastAction = this.state(this.entity("sensor", "last_action"), "");
    const decisionText = this.state(this.entity("sensor", "decision_reason"));
    const statusUpper = String(rawStatus || "").toUpperCase();
    const lastActionUpper = String(lastAction || "").toUpperCase();
    const schedulerOn = this.state(scheduler) === "on";
    const defaultsActive = statusUpper.includes("DEFAULT") || statusUpper.includes("PRICE") || statusUpper.includes("SOC") || (!schedulerOn && lastActionUpper.includes("DEFAULT"));
    const sellActive = schedulerOn && statusUpper.includes("SCHEDULE") && !defaultsActive;
    const stopActive = statusUpper.includes("STOP") || this.state(controlMode) === "Stop Sell" || (!schedulerOn && (statusUpper.includes("IDLE") || lastActionUpper.includes("RESTORED") || lastActionUpper.includes("STOP")));
    const defaultButtonActive = defaultsActive && !stopActive;
    const pvValue = this.asNumber(this.state(this.energyStatusEntity("pv_power")), 0) || 0;
    const gridValue = this.asNumber(this.state(this.energyStatusEntity("grid_power")), 0) || 0;
    const batteryValue = this.asNumber(this.state(this.energyStatusEntity("battery_power")), 0) || 0;
    const loadValue = this.calculatedHouseLoad(pvValue, gridValue, batteryValue);
    const batterySocValue = this.optionalSocNumber(this.state(this.energyStatusEntity("battery_soc")));
    const currentModeValue = this.deyeWorkModeState();

    const formatKw = (w) => this.formatEnergyStatusPower(w);
    const gridMainText = gridValue < -1 ? `Export ${formatKw(Math.abs(gridValue))}` : gridValue > 1 ? `Import ${formatKw(gridValue)}` : `Balance 0 kW`;
    const batteryDirectionText = batteryValue < -1 ? `Charging ${formatKw(Math.abs(batteryValue))}` : batteryValue > 1 ? `Discharging ${formatKw(batteryValue)}` : `Idle`;

    const fmtNum = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v)) ? "—" : v.toFixed(d);
    const detailed = (key, fallback = null) => this.asNumber(this.state(this.energyStatusEntity(key)), fallback);
    const singlePhase = this.layoutConfig().phase_count === 1;
    const gridL1Live = singlePhase
      ? this.singlePhaseValue(detailed("grid_l1_power"), detailed("grid_power"))
      : detailed("grid_l1_power");
    const loadL1Live = singlePhase
      ? this.singlePhaseValue(detailed("load_l1_power"), loadValue)
      : detailed("load_l1_power");
    const managerModeClass = this.modeTextClass(modeText);
    const currentModeMeta = currentModeValue ? this.modeMeta(currentModeValue, true) : { cls: "disabled" };
    const safeModeClass = (cls) => cls ? `mode-${cls}` : "";

    this.setText("[data-live='pv-main']", formatKw(pvValue));
    this.setText("[data-live='pv-total']", formatKw(pvValue));
    this.setText("[data-live='pv-daily']", fmtNum(detailed("daily_pv_production"), 2));
    this.setText("[data-live='pv1-power']", formatKw(detailed("pv1_power")));
    this.setText("[data-live='pv1-volts']", fmtNum(detailed("pv1_voltage"), 1));
    this.setText("[data-live='pv1-amps']", fmtNum(detailed("pv1_current"), 1));
    this.setText("[data-live='pv2-power']", formatKw(detailed("pv2_power")));
    this.setText("[data-live='pv2-volts']", fmtNum(detailed("pv2_voltage"), 1));
    this.setText("[data-live='pv2-amps']", fmtNum(detailed("pv2_current"), 1));

    this.setText("[data-live='grid-main']", gridMainText);
    this.setText("[data-live='grid-l1-power']", formatKw(gridL1Live));
    this.setText("[data-live='grid-l1-volt']", fmtNum(detailed("grid_l1_voltage"), 1));
    this.setText("[data-live='grid-l2-power']", formatKw(detailed("grid_l2_power")));
    this.setText("[data-live='grid-l2-volt']", fmtNum(detailed("grid_l2_voltage"), 1));
    this.setText("[data-live='grid-l3-power']", formatKw(detailed("grid_l3_power")));
    this.setText("[data-live='grid-l3-volt']", fmtNum(detailed("grid_l3_voltage"), 1));
    this.setText("[data-live='grid-bought']", fmtNum(detailed("daily_energy_bought"), 2));
    this.setText("[data-live='grid-sold']", fmtNum(detailed("daily_energy_sold"), 2));
    this.setText("[data-live='grid-frequency']", fmtNum(detailed("load_frequency"), 2));

    this.setText("[data-live='battery-soc-value']", batterySocValue === null ? "—" : `${Math.round(batterySocValue)}`);
    const batteryIconHtml = this.batteryLevelSvg(batterySocValue);
    this.querySelectorAll("[data-live-html='battery-icon']").forEach((el) => { el.innerHTML = batteryIconHtml; });
    this.setText("[data-live='battery-direction']", batteryDirectionText);
    this.setText("[data-live='battery-voltage']", fmtNum(detailed("battery_bms_voltage"), 1));
    this.setText("[data-live='battery-current']", fmtNum(detailed("battery_current"), 1));
    this.setText("[data-live='battery-temp']", fmtNum(detailed("battery_temperature"), 1));
    this.setText("[data-live='battery-charge-daily']", fmtNum(detailed("daily_battery_charge"), 2));
    this.setText("[data-live='battery-discharge-daily']", fmtNum(detailed("daily_battery_discharge"), 2));

    this.setText("[data-live='load-main']", formatKw(loadValue));
    this.setText("[data-live='load-daily']", fmtNum(detailed("daily_load_consumption"), 2));
    this.setText("[data-live='load-l1-power']", formatKw(loadL1Live));
    this.setText("[data-live='load-l2-power']", formatKw(detailed("load_l2_power")));
    this.setText("[data-live='load-l3-power']", formatKw(detailed("load_l3_power")));
    this.setText("[data-live='grid-ac-voltage']", fmtNum(this.asNumber(this.state(this.acVoltageEntity("grid"))), 1));
    this.setText("[data-live='inverter-ac-voltage']", fmtNum(this.asNumber(this.state(this.acVoltageEntity("inverter"))), 1));

    this.setText("[data-live='inverter-temp']", detailed("inverter_ac_temperature") === null ? "—" : `${Math.round(detailed("inverter_ac_temperature"))}`);
    const soldKwh = this.asNumber(this.state(this.energyStatusEntity("sold_energy_today")), null);
    const soldGbp = this.asNumber(this.state(this.energyStatusEntity("sold_value_today")), null);
    this.setText("[data-live='sold-today-kwh']", `${fmtNum(soldKwh, 2)} kWh`);
    this.setText("[data-live='sold-today-gbp']", `${fmtNum(soldGbp, 2)} GBP`);

    this.setText("[data-live='manager-mode']", modeText);
    this.setText("[data-live='manager-active-mode']", modeText);
    this.setText("[data-live='decision-reason']", this.state(this.entity("sensor", "decision_reason"), "—"));
    this.setText("[data-live='deye-mode']", currentModeValue || "—");
    this.setText("[data-live='manager-deye-mode']", currentModeValue || "—");
    this.setClass("[data-live='manager-active-mode']", safeModeClass(managerModeClass), "", false);
    this.setClass("[data-live='manager-mode']", safeModeClass(managerModeClass), "", false);
    this.setClass("[data-live='deye-mode']", safeModeClass(currentModeMeta.cls), "", false);

    this.querySelector("[data-action='sell']")?.classList.toggle("active", sellActive);
    this.querySelector("[data-action='stop']")?.classList.toggle("active", stopActive);
    this.querySelector("[data-action='defaults']")?.classList.toggle("active", defaultButtonActive);

    const currentManualRow = this.manualScheduleCurrentRowIndex(this.ensureManualScheduleDraft());
    this.querySelectorAll("[data-manual-row]").forEach((row) => {
      row.classList.toggle("time-current", Number(row.getAttribute("data-manual-row")) === currentManualRow);
    });

    this.setText("[data-live='target-mode']", this.state(this.entity("sensor", "target_mode")));
    this.setText("[data-live='target-sell-power']", `${this.state(this.entity("sensor", "target_sell_power"))} W`);
    this.setText("[data-live='current-mode']", this.state(this.entity("sensor", "current_work_mode")));
    this.setText("[data-live='current-sell-power']", `${this.state(this.entity("sensor", "current_sell_power"))} W`);

    const slowEntities = [sellPriceToday, sellPriceTomorrow, buyPriceToday, buyPriceTomorrow, this.entity("sensor", "ai_state"),
      solcastToday, solcastTomorrow, solcastDay3, solcastDay4, solcastDay5, solcastDay6,
      solcastDay7, solcastRemaining, solcastPeakPower, dailyPvProduction, solcastAccuracy,
      soldEnergyToday, soldValueToday];
    const slowSignature = slowEntities.map((entityId) => {
      const entity = this._hass?.states?.[entityId];
      return `${entityId}:${entity?.state}:${entity?.last_updated || ""}`;
    }).join("|");
    if (slowSignature === this._lastSlowSignature) {
      this.updateToggleButtons();
      return;
    }
    this._lastSlowSignature = slowSignature;

    const currentHour = this.localDateTimeParts()?.hour ?? new Date().getHours();
    const canonicalSellNow = this.canonicalPriceMaps("sell")[0].get(currentHour);
    this.setText("[data-live='sell-now']", `${this.formatPrice(canonicalSellNow)} GBP/kWh`);
    this.updatePriceTable("sell-prices", sellPriceToday, sellPriceTomorrow, priceThreshold, true);

    const canonicalBuyNow = this.canonicalPriceMaps("buy")[0].get(currentHour);
    this.setText("[data-live='buy-now']", `${this.formatPrice(canonicalBuyNow)} GBP/kWh`);
    this.updatePriceTable("buy-prices", buyPriceToday, buyPriceTomorrow, 0, false);
    this.setText("[data-live='solcast-power']", this.formatPower(this.state(solcastPower)));
    const solcastAccuracyAttrs = this._hass?.states?.[solcastAccuracy]?.attributes || {};
    const solcastForecastValue = this.asNumber(solcastAccuracyAttrs.forecast_today_kwh);
    const dailyPvValue = this.asNumber(solcastAccuracyAttrs.production_today_kwh);
    const solcastDifference = this.asNumber(solcastAccuracyAttrs.forecast_difference_today_kwh);
    const realizationTodayValue = this.asNumber(solcastAccuracyAttrs.realization_today_pct);
    const historicalAccuracyValue = this.asNumber(solcastAccuracyAttrs.historical_accuracy_pct)
      ?? this.asNumber(this.state(solcastAccuracy));
    const remainingForecastValue = this.asNumber(solcastAccuracyAttrs.remaining_forecast_kwh);
    const forecastTomorrowValue = this.asNumber(solcastAccuracyAttrs.forecast_tomorrow_kwh);
    this.setText("[data-live='solcast-today']", this.formatEnergy(solcastForecastValue));
    this.setText("[data-live='solcast-remaining']", this.formatEnergy(remainingForecastValue));
    this.setText("[data-live='solcast-tomorrow']", this.formatEnergy(forecastTomorrowValue));
    this.setText("[data-live='solcast-peak-power']", this.formatPower(this.state(solcastPeakPower)));
    this.setText("[data-live='solcast-best-day']", this.bestSolcastDay([solcastToday, solcastTomorrow, solcastDay3, solcastDay4, solcastDay5, solcastDay6, solcastDay7]));
    this.setText("[data-live='solcast-performance-forecast']", this.formatEnergy(solcastForecastValue));
    this.setText("[data-live='solcast-performance-actual']", this.formatEnergy(dailyPvValue));
    this.setText("[data-live='solcast-performance-difference']", this.formatSignedEnergy(solcastDifference));
    this.setText("[data-live='solcast-performance-progress']", realizationTodayValue === null ? "missing" : `${realizationTodayValue.toFixed(1)} %`);
    this.setText("[data-live='solcast-performance-accuracy']", historicalAccuracyValue === null ? "missing" : `${historicalAccuracyValue.toFixed(1)} %`);
    if (!this.isInteracting()) {
      this.setHtml("[data-live-html='solcast-days']", this.solcastDaysChart([solcastToday, solcastTomorrow, solcastDay3, solcastDay4, solcastDay5, solcastDay6, solcastDay7]));
      this.setHtml("[data-live-html='solcast-chart']", this.solcastChart(solcastToday, solcastTomorrow));
    }
    if (!this.isInteracting()) {
      const salesScrollTop = this.querySelector("[data-scroll-key='sales-month']")?.scrollTop;
      const salesHourlyTop = this.querySelector("[data-scroll-key='sales-hourly']")?.scrollTop;
      this.setHtml("[data-live-html='sales-stats']", this.salesStatsPanel());
      const salesScroll = this.querySelector("[data-scroll-key='sales-month']");
      const salesHourly = this.querySelector("[data-scroll-key='sales-hourly']");
      if (salesScrollTop !== undefined && salesScroll) salesScroll.scrollTop = salesScrollTop;
      if (salesHourlyTop !== undefined && salesHourly) salesHourly.scrollTop = salesHourlyTop;
      if (salesScroll) this.attachScrollHandlers(salesScroll);
      if (salesHourly) this.attachScrollHandlers(salesHourly);
    }
    this.updateToggleButtons();
  }

  updatePriceTable(scrollKey, todayEntity, tomorrowEntity, threshold = 0, highIsGood = true) {
    const [today, tomorrow] = this.canonicalPriceMaps(scrollKey.startsWith("buy") ? "buy" : "sell");
    const currentHour = new Date().getHours();
    for (let hour = 0; hour < 24; hour += 1) {
      this.setHtml(`[data-price='${scrollKey}:today:${hour}']`, this.priceCell(today.get(hour), threshold, highIsGood));
      this.setHtml(`[data-price='${scrollKey}:tomorrow:${hour}']`, this.priceCell(tomorrow.get(hour), threshold, highIsGood));
      this.querySelector(`[data-price-row='${scrollKey}:${hour}']`)?.classList.toggle("active", hour === currentHour);
    }
  }

  exists(entityId) {
    return Boolean(this._hass?.states?.[entityId]);
  }

  hasLiveState(entityId) {
    const state = this._hass?.states?.[entityId]?.state;
    return state !== undefined && state !== null && state !== "" &&
      state !== "unknown" && state !== "unavailable";
  }

  configuredEntity(key, domain, fallbackSuffix) {
    const sources = [this.config?.entities, this.config?.entity_map, this.config?.mapping];
    for (const source of sources) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return this.entity(domain, fallbackSuffix);
  }

  energyStatusEntity(role) {
    return this.configuredEntity(role, "sensor", role);
  }

  firstExistingEntity(...ids) {
    for (const id of ids) {
      const candidate = typeof id === "string" ? id.trim() : "";
      if (candidate && this.exists(candidate)) return candidate;
    }
    return "";
  }

  acVoltageEntity(kind) {
    const key = kind === "grid" ? "grid_voltage" : "inverter_output_voltage";
    const defaults = kind === "grid"
      ? ["sensor.deye_grid_voltage"]
      : ["sensor.deye_inverter_voltage", "sensor.deye_grid_voltage"];
    return this.firstExistingEntity(
      this.config?.entities?.[key],
      this.config?.entity_map?.[key],
      this.config?.mapping?.[key],
      ...defaults,
      this.configuredEntity("grid_l1_voltage", "sensor", "grid_l1_voltage"),
    );
  }

  state(entityId, fallback = "missing") {
    return this._hass?.states?.[entityId]?.state ?? fallback;
  }

  displayState(entityId, fallback = "missing") {
    if (Object.prototype.hasOwnProperty.call(this._optimisticStates || {}, entityId)) {
      const actual = this.state(entityId, fallback);
      const optimistic = this._optimisticStates[entityId];
      const actualNumber = this.asNumber(actual);
      const optimisticNumber = this.asNumber(optimistic);
      const numericComparable = /\d/.test(String(actual)) && /\d/.test(String(optimistic));
      const valuesMatch = actual === optimistic
        || (numericComparable && actualNumber !== null && optimisticNumber !== null && actualNumber === optimisticNumber);
      if (valuesMatch) {
        delete this._optimisticStates[entityId];
      } else {
        return optimistic;
      }
    }
    return this.state(entityId, fallback);
  }

  numberState(entityId, fallback = "0") {
    const value = this.displayState(entityId, fallback);
    return value === "unknown" || value === "unavailable" ? fallback : value;
  }

  asNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (!text || ["unknown", "unavailable", "none", "null", "nan", "inf", "-inf"].includes(text.toLowerCase())) return null;
    const normalized = text.replace(",", ".");
    const match = normalized.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return null;
    const remainder = `${normalized.slice(0, match.index)}${normalized.slice((match.index || 0) + match[0].length)}`;
    if (/\d/.test(remainder)) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  calculatedHouseLoad(pvPower, gridPower, batteryPower) {
    const pv = this.asNumber(pvPower) || 0;
    const grid = this.asNumber(gridPower) || 0;
    const battery = this.asNumber(batteryPower) || 0;
    const gridImport = Math.max(grid, 0);
    const gridExport = Math.max(-grid, 0);
    const batteryDischarge = Math.max(battery, 0);
    const batteryCharge = Math.max(-battery, 0);
    return (pv + gridImport + batteryDischarge) - (gridExport + batteryCharge);
  }

  optionalSocNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
    }
    const text = String(value).trim();
    if (!text || ["unknown", "unavailable", "none", "null", "nan"].includes(text.toLowerCase())) {
      return null;
    }
    if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
    const parsed = Number(text.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  }

  singlePhaseValue(phaseValue, totalValue) {
    return phaseValue === null || phaseValue === undefined || Number.isNaN(phaseValue) || phaseValue === 0
      ? totalValue
      : phaseValue;
  }

  formatPrice(value) {
    const number = this.asNumber(value);
    if (number === null) return "missing";
    return number.toFixed(2);
  }

  formatNumber(value, digits = 2) {
    const number = this.asNumber(value);
    return number === null ? "missing" : number.toFixed(digits);
  }

  hourLabel(hour) {
    const start = String(hour).padStart(2, "0");
    const end = String((hour + 1) % 24).padStart(2, "0");
    return `${start}-${end}`;
  }

  localDateTimeParts(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const timeZone = this._hass?.config?.time_zone || undefined;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date).reduce((result, item) => {
        if (item.type !== "literal") result[item.type] = item.value;
        return result;
      }, {});
      const hour = Number(parts.hour);
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        hour: hour === 24 ? 0 : hour,
      };
    } catch (_error) {
      return null;
    }
  }

  localMinuteOfDay(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const timeZone = this._hass?.config?.time_zone || undefined;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date).reduce((result, item) => {
        if (item.type !== "literal") result[item.type] = item.value;
        return result;
      }, {});
      const hour = Number(parts.hour);
      return (hour === 24 ? 0 : hour) * 60 + Number(parts.minute);
    } catch (_error) {
      return null;
    }
  }

  priceSlotFromValue(value, fallback = null) {
    if (typeof value === "number" && value >= 0 && value < 24) {
      return { date: null, hour: Math.floor(value) };
    }
    const text = String(value ?? "").trim();
    const isoMatch = text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i
    );
    if (isoMatch) {
      if (isoMatch[5]) {
        const localized = this.localDateTimeParts(text.replace(" ", "T"));
        if (localized) return localized;
      }
      const hour = Number(isoMatch[4]);
      if (hour >= 0 && hour < 24) {
        return { date: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, hour };
      }
    }
    const hourMatch = text.match(/(^|\D)(\d{1,2})(?::\d{2})?/);
    if (hourMatch) {
      const hour = Number(hourMatch[2]);
      if (hour >= 0 && hour < 24) return { date: null, hour };
    }
    return { date: null, hour: fallback };
  }

  hourFromValue(value, fallback = null) {
    return this.priceSlotFromValue(value, fallback).hour;
  }

  priceCell(value, threshold = 0, highIsGood = true) {
    const number = this.asNumber(value);
    if (number === null) return `<span class="price missing">missing</span>`;
    let cls = "";
    if (threshold > 0) cls = highIsGood ? (number >= threshold ? "good" : "warn") : (number <= threshold ? "good" : "warn");
    return `<span class="price ${cls}">${this.formatPrice(number)}</span>`;
  }

  priceTable(todayEntity, tomorrowEntity, threshold = 0, highIsGood = true, scrollKey = "prices") {
    const [today, tomorrow] = this.canonicalPriceMaps(scrollKey.startsWith("buy") ? "buy" : "sell");
    const currentHour = this.localDateTimeParts()?.hour ?? new Date().getHours();
    return `<div class="price-scroll" data-scroll-key="${scrollKey}"><table class="price-table">
      <thead><tr><th>Hour</th><th>Today</th><th>Tomorrow</th></tr></thead>
      <tbody>${Array.from({ length: 24 }, (_, hour) => `<tr class="${hour === currentHour ? "active" : ""}" data-price-row="${scrollKey}:${hour}">
        <td>${this.hourLabel(hour)}</td>
        <td data-price="${scrollKey}:today:${hour}">${this.priceCell(today.get(hour), threshold, highIsGood)}</td>
        <td data-price="${scrollKey}:tomorrow:${hour}">${this.priceCell(tomorrow.get(hour), threshold, highIsGood)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  formatEnergyStatusPower(value) {
    const number = this.asNumber(value);
    if (number === null) return "—";
    return Math.abs(number) >= 10000 ? `${(number / 1000).toFixed(2)} kW` : `${Math.round(number)} W`;
  }

  formatPower(value) {
    const number = this.asNumber(value);
    if (number === null) return "missing";
    if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(2)} kW`;
    return `${Math.round(number)} W`;
  }

  formatEnergy(value) {
    const number = this.asNumber(value);
    if (number === null) return "missing";
    return `${number.toFixed(2)} kWh`;
  }

  formatSignedEnergy(value) {
    const number = this.asNumber(value);
    if (number === null) return "missing";
    return `${number > 0 ? "+" : ""}${number.toFixed(2)} kWh`;
  }

  forecastFromObject(item) {
    if (!item || typeof item !== "object") return null;
    const keys = ["pv_estimate", "estimate", "value", "energy", "kwh", "forecast", "state"];
    for (const key of keys) {
      if (item[key] !== undefined) {
        const value = this.asNumber(item[key]);
        if (value !== null) return value;
      }
    }
    return null;
  }

  forecastTimeFromObject(item) {
    if (!item || typeof item !== "object") return null;
    const keys = ["period_start", "start", "from", "time", "datetime", "timestamp", "hour"];
    for (const key of keys) {
      if (item[key] !== undefined) return item[key];
    }
    return null;
  }

  addForecastCandidate(map, item, fallbackHour = null, aggregate = false) {
    let hour = null;
    let value = null;
    if (Array.isArray(item)) {
      hour = this.hourFromValue(item[0], fallbackHour);
      value = this.asNumber(item[1]);
    } else if (item && typeof item === "object") {
      hour = this.hourFromValue(this.forecastTimeFromObject(item), fallbackHour);
      value = this.forecastFromObject(item);
    } else {
      hour = fallbackHour;
      value = this.asNumber(item);
    }
    if (hour === null || value === null || value < 0) return;
    map.set(hour, aggregate ? (map.get(hour) || 0) + value : (map.has(hour) ? map.get(hour) : value));
  }

  readForecastMap(entityId) {
    const entity = this._hass?.states?.[entityId];
    const map = new Map();
    if (!entity) return map;
    const attrs = entity.attributes || {};

    const parseSource = (source, aggregate = false) => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach((item, index) => this.addForecastCandidate(map, item, index < 24 ? index : null, aggregate));
        return;
      }
      if (typeof source === "object") {
        Object.entries(source).forEach(([key, value], index) => {
          const fallbackHour = index < 24 ? index : null;
          if (value && typeof value === "object" && !Array.isArray(value)) {
            this.addForecastCandidate(map, { ...value, hour: value.hour ?? key }, fallbackHour, aggregate);
          } else {
            this.addForecastCandidate(map, [key, value], fallbackHour, aggregate);
          }
        });
      }
    };

    [
      attrs.detailedHourly,
      attrs.detailed_hourly,
      attrs.hourly,
      attrs.hours,
      attrs.today,
      attrs.tomorrow,
    ].forEach((source) => parseSource(source, false));

    if (map.size === 0) {
      [attrs.detailedForecast, attrs.detailed_forecast, attrs.forecast, attrs.intervals].forEach((source) => parseSource(source, true));
    }
    return map;
  }

  solcastChart(todayEntity, tomorrowEntity) {
    const today = this.readForecastMap(todayEntity);
    const tomorrow = this.readForecastMap(tomorrowEntity);
    const values = [...today.values(), ...tomorrow.values()].map((value) => this.asNumber(value) || 0);
    const max = Math.max(0.001, ...values);
    const currentHour = new Date().getHours();
    const bars = Array.from({ length: 24 }, (_, hour) => {
      const todayValue = this.asNumber(today.get(hour)) || 0;
      const tomorrowValue = this.asNumber(tomorrow.get(hour)) || 0;
      const todayHeight = Math.max(3, Math.round((todayValue / max) * 100));
      const tomorrowHeight = Math.max(3, Math.round((tomorrowValue / max) * 100));
      return `<div class="solcast-bar ${hour === currentHour ? "now" : ""}" title="${this.hourLabel(hour)}: today ${todayValue.toFixed(2)} kWh, tomorrow ${tomorrowValue.toFixed(2)} kWh">
        <div class="solcast-columns">
          <span class="today" style="height:${todayHeight}%"></span>
          <span class="tomorrow" style="height:${tomorrowHeight}%"></span>
        </div>
        <em>${String(hour).padStart(2, "0")}</em>
      </div>`;
    }).join("");
    return `<div class="solcast-chart"><div class="solcast-bars">${bars}</div></div>
      <div class="solcast-legend"><span class="today"></span>Today <span class="tomorrow"></span>Tomorrow</div>`;
  }

  solcastDaysChart(entities) {
    const days = this.solcastDayData(entities);
    const max = Math.max(0.001, ...days.map((day) => day.value || 0));
    const bars = days.map((day) => {
      const number = day.value || 0;
      const height = Math.max(6, Math.round((number / max) * 100));
      const missing = day.value === null;
      return `<div class="solcast-day ${missing ? "missing" : ""}" title="${day.label}: ${missing ? "missing" : `${number.toFixed(2)} kWh`}">
        <div class="solcast-day-head"><strong>${day.label}</strong><em>${day.date}</em></div>
        <div class="solcast-day-meter"><span style="height:${height}%"></span></div>
        <b>${missing ? "-" : number.toFixed(1)} kWh</b>
      </div>`;
    }).join("");
    return `<div class="solcast-days">${bars}</div>`;
  }

  solcastDayData(entities) {
    const labels = ["Today", "Tomorrow", "in 2 days", "in 3 days", "in 4 days", "in 5 days", "in 6 days"];
    return entities.map((entityId, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + index);
      return {
        label: labels[index],
        date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" }),
        value: this.asNumber(this.state(entityId)),
      };
    });
  }

  bestSolcastDay(entities) {
    const days = this.solcastDayData(entities).filter((day) => day.value !== null);
    if (!days.length) return "missing";
    const best = days.reduce((winner, day) => (day.value > winner.value ? day : winner), days[0]);
    return `${best.label} / ${best.value.toFixed(1)} kWh`;
  }

  salesAttributes() {
    return this._hass?.states?.[this.entity("sensor", "sold_energy_today")]?.attributes || {};
  }

  salesRows(key) {
    const attrs = this.salesAttributes();
    const rows = attrs[key];
    return Array.isArray(rows) ? rows : [];
  }

  formatKwh(value) {
    const number = this.asNumber(value);
    if (number === null) return "0.000";
    return number.toFixed(3);
  }

  formatMoney(value) {
    const number = this.asNumber(value);
    if (number === null) return "0.00";
    return number.toFixed(2);
  }

  salesStatsPanel() {
    const attrs = this.salesAttributes();
    const hourly = this.salesRows("hourly_today");
    const week = this.salesRows("week");
    const month = this.salesRows("month");
    const todayKwh = this.asNumber(this.state(this.entity("sensor", "sold_energy_today"), 0)) || 0;
    const todayValue = this.asNumber(attrs.sold_value_today) || this.asNumber(this.state(this.entity("sensor", "sold_value_today"), 0)) || 0;
    const hourKwh = this.asNumber(attrs.sold_energy_current_hour) || this.asNumber(this.state(this.entity("sensor", "sold_energy_current_hour"), 0)) || 0;
    const hourValue = this.asNumber(attrs.sold_value_current_hour) || this.asNumber(this.state(this.entity("sensor", "sold_value_current_hour"), 0)) || 0;
    const maxHour = Math.max(0.001, ...hourly.map((row) => this.asNumber(row.kwh) || 0));
    const weekKwh = this.asNumber(attrs.sold_energy_week) || week.reduce((sum, row) => sum + (this.asNumber(row.kwh) || 0), 0);
    const weekValue = this.asNumber(attrs.sold_value_week) || week.reduce((sum, row) => sum + (this.asNumber(row.value) || 0), 0);
    const monthKwh = this.asNumber(attrs.sold_energy_month) || month.reduce((sum, row) => sum + (this.asNumber(row.kwh) || 0), 0);
    const monthValue = this.asNumber(attrs.sold_value_month) || month.reduce((sum, row) => sum + (this.asNumber(row.value) || 0), 0);
    const currentHour = new Date().getHours();

    const bars = hourly.map((row) => {
      const hour = this.asNumber(row.hour) ?? 0;
      const kwh = this.asNumber(row.kwh) || 0;
      const value = this.asNumber(row.value) || 0;
      const height = Math.max(4, Math.round((kwh / maxHour) * 86));
      return `<div class="sales-bar ${hour === currentHour ? "now" : ""}" title="${row.label}: ${this.formatKwh(kwh)} kWh / ${this.formatMoney(value)} GBP">
        <span style="height:${height}%"></span><em>${String(hour).padStart(2, "0")}</em>
      </div>`;
    }).join("");

    const dailyRows = (rows, emptyText) => {
      if (!rows.length) return `<tr><td colspan="3">${emptyText}</td></tr>`;
      return rows.slice(-31).reverse().map((row) => `<tr>
        <td>${row.label || row.date || "-"}</td>
        <td>${this.formatKwh(row.kwh)} kWh</td>
        <td>${this.formatMoney(row.value)} GBP</td>
      </tr>`).join("");
    };
    const hourlyRows = hourly.map((row) => `<tr>
      <td>${row.label || this.hourLabel(row.hour || 0)}</td>
      <td>${this.formatKwh(row.kwh)} kWh</td>
      <td>${this.formatMoney(row.value)} GBP</td>
    </tr>`).join("");

    return `
      <div class="sales-summary">
        ${this.stat("Today's energy", `${this.formatKwh(todayKwh)} kWh`, "sales-energy", "", "sell")}
        ${this.stat("Today's value", `${this.formatMoney(todayValue)} GBP`, "sales-value", "", "money")}
        ${this.stat("This hour", `${this.formatKwh(hourKwh)} kWh / ${this.formatMoney(hourValue)} GBP`, "sales-hour", "", "clock")}
        ${this.stat("Week", `${this.formatKwh(weekKwh)} kWh / ${this.formatMoney(weekValue)} GBP`, "sales-week", "", "chart")}
        ${this.stat("Month", `${this.formatKwh(monthKwh)} kWh / ${this.formatMoney(monthValue)} GBP`, "sales-month", "", "calendar")}
      </div>
      <div class="sales-chart">${bars}</div>
      <div class="sales-tables">
        <div><div class="section-label">Today hour by hour</div><div class="sales-scroll" data-scroll-key="sales-hourly"><table class="mini-table"><tbody>${hourlyRows}</tbody></table></div></div>
        <div><div class="section-label">Last 7 days</div><table class="mini-table"><tbody>${dailyRows(week, "No week history")}</tbody></table></div>
        <div><div class="section-label">Current month</div><div class="sales-scroll" data-scroll-key="sales-month"><table class="mini-table"><tbody>${dailyRows(month, "No month history")}</tbody></table></div></div>
      </div>`;
  }

  options(entityId, fallback = []) {
    return this._hass?.states?.[entityId]?.attributes?.options || fallback;
  }

  norm(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  exactEntity(domain, suffixes) {
    const list = Array.isArray(suffixes) ? suffixes : [suffixes];
    for (const suffix of list) {
      const direct = `${domain}.deye_energy_${suffix}`;
      if (this.hasLiveState(direct)) return direct;
      const doubled = `${domain}.deye_energy_deye_energy_${suffix}`;
      if (this.hasLiveState(doubled)) return doubled;
    }
    return "";
  }

  entity(domain, suffixes) {
    const list = Array.isArray(suffixes) ? suffixes : [suffixes];
    const exact = this.exactEntity(domain, list);
    if (exact) return exact;

    const candidates = Object.keys(this._hass.states).filter((id) => id.startsWith(`${domain}.`));
    for (const suffix of list) {
      const normalized = this.norm(suffix);
      const found = candidates.find((id) => {
        if (!this.hasLiveState(id)) return false;
        const flatId = this.norm(id);
        const friendly = this.norm(this._hass.states[id]?.attributes?.friendly_name || "");
        return (flatId.includes("deyeenergy") && flatId.includes(normalized))
          || (friendly.includes("deyeenergy") && friendly.includes(normalized));
      });
      if (found) return found;
    }
    return `${domain}.deye_energy_${list[0]}`;
  }

  deyeWorkModeEntity() {
    const configured = [
      this.config?.entities?.system_work_mode,
      this.config?.entities?.deye_system_work_mode,
      this.config?.entity_map?.system_work_mode,
      this.config?.mapping?.system_work_mode,
      this.config?.system_work_mode,
      this.config?.deye_work_mode_entity,
    ].filter((entityId) => typeof entityId === "string" && entityId.trim());
    const candidates = [...configured, "select.deye_inverter_system_work_mode"];
    return candidates.find((entityId) => this.exists(entityId)) || "select.deye_inverter_system_work_mode";
  }

  deyeWorkModeState() {
    const value = String(this.state(this.deyeWorkModeEntity(), "") || "").trim();
    return ["unknown", "unavailable", "none", "null", "enabled", "disabled"].includes(value.toLowerCase()) ? "" : value;
  }

  normalProfileStoredValues() {
    const statusId = this.entity("sensor", "manager_status");
    const profile = this._hass?.states?.[statusId]?.attributes?.normal_profile;
    return profile && typeof profile === "object" ? profile : {};
  }

  managerStatusAttributes() {
    return this._hass?.states?.[this.entity("sensor", "manager_status")]?.attributes || {};
  }

  manualScheduleCurrentRowIndex(rows, now = new Date()) {
    if (!Array.isArray(rows) || !rows.length) return -1;
    const minuteOfDay = this.localMinuteOfDay(now);
    if (minuteOfDay === null) return -1;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const start = this.minutesFromClock(row.from);
      let end = this.minutesFromClock(row.to);
      if (start === null || end === null) continue;
      if (index === rows.length - 1 && end === 0) end = 1440;
      if (start <= minuteOfDay && minuteOfDay < end) return index;
    }
    return -1;
  }

  controlContract() {
    const attributes = this.managerStatusAttributes();
    const control = attributes?.control;
    if (control && typeof control === "object") return control;
    return {
      entity_id: null,
      enabled: attributes.control_enabled === true,
      status: attributes.control_status,
    };
  }

  controlEntityId() {
    return this.controlState().entity_id;
  }

  controlEnabled() {
    return this.controlState().enabled;
  }

  controlStatus() {
    return this.controlState().status;
  }

  controlState() {
    const contract = this.controlContract();
    const entityId = typeof contract.entity_id === "string" && contract.entity_id.startsWith("switch.")
      ? contract.entity_id
      : "";
    const enabled = contract.enabled === true;
    const rawStatus = String(contract.status || "");
    let status = ["Active", "Disabling", "Disabled"].includes(rawStatus)
      ? rawStatus
      : (enabled ? "Active" : "Disabled");
    const awaitingExpectedState = typeof this._controlExpectedEnabled === "boolean"
      && enabled !== this._controlExpectedEnabled;
    if (awaitingExpectedState && this._controlExpectedEnabled === false) status = "Disabling";
    return {
      entity_id: entityId,
      enabled,
      status,
      pending: this._controlTogglePending || status === "Disabling" || awaitingExpectedState,
    };
  }

  normalProfileModeOptions() {
    const rows = this.managerStatusAttributes()?.normal_profile_options;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && row.available === true && row.value && row.label)
      .map((row) => [String(row.value), String(row.label)]);
  }

  normalizeSlotEditValue(field, value) {
    if (field === "mode") return this.normalizeManagerMode(value);
    if (field === "enabled" || field === "charge_enabled" || field === "battery_charge_enabled") {
      if (typeof value === "string") return ["true", "on", "1", "yes", "yes"].includes(value.trim().toLowerCase());
      return Boolean(value);
    }
    if (["sell_power", "minimum_sell_soc", "tou_soc", "min_sell_price"].includes(field)) {
      if (value === null || value === undefined || String(value).trim() === "") return null;
      const numeric = Number(String(value).replace(",", "."));
      return Number.isFinite(numeric) ? numeric : value;
    }
    return value === null || value === undefined ? null : String(value).trim();
  }

  callService(domain, service, data = {}) {
    return this._hass.callService(domain, service, data);
  }

  hasService(domain, service) {
    return Boolean(this._hass?.services?.[domain]?.[service]);
  }

  updateSaveIndicator() {
    const el = this.querySelector("[data-save-indicator]");
    if (!el) return;
    el.className = `save-indicator ${this._saveStatus}`;
    el.textContent = this._saveStatus === "saving"
      ? this._saveMessage || "Saving..."
      : this._saveStatus === "saved"
        ? this._saveMessage || "Saved"
        : this._saveStatus === "error"
          ? this._saveMessage || "Save error"
          : "";
  }

  updateControlUi() {
    let control = this.controlState();
    const expected = this._controlExpectedEnabled;
    const settled = typeof expected === "boolean"
      && control.enabled === expected
      && control.status !== "Disabling";
    const updateFeedback = this._controlFeedbackActive;
    if (settled) {
      this._controlExpectedEnabled = null;
      control = this.controlState();
    }

    const buttons = typeof this.querySelectorAll === "function"
      ? this.querySelectorAll("[data-control-toggle]")
      : [];
    buttons.forEach((button) => {
      button.textContent = `Deye control — ${control.status}`;
      button.disabled = control.pending;
      button.classList?.toggle("active", control.enabled);
    });
    const status = typeof this.querySelector === "function"
      ? this.querySelector("[data-live='control-status']")
      : null;
    if (status) {
      status.textContent = control.status;
      status.className = `mode-${control.enabled ? "normal" : "disabled"}`;
    }
    if (updateFeedback) {
      this._saveStatus = settled ? "saved" : "saving";
      this._saveMessage = settled
        ? (control.enabled ? "Deye control is active." : "Deye control is disabled.")
        : (expected === true ? "Enabling Deye Control…" : "Disabling Deye Control…");
      if (typeof this.querySelector === "function") this.updateSaveIndicator();
      if (settled) this._controlFeedbackActive = false;
    }
  }

  beginSave() {
    window.clearTimeout(this._saveStatusTimer);
    if (this._pendingSaves === 0) this._saveHadError = false;
    this._pendingSaves += 1;
    this._saveStatus = "saving";
    this._saveMessage = "";
    this.updateSaveIndicator();
  }

  finishSave() {
    this._pendingSaves = Math.max(0, this._pendingSaves - 1);
    if (this._pendingSaves > 0) return;
    if (this._saveHadError) {
      this._saveStatus = "error";
      this.updateSaveIndicator();
      return;
    }
    this._saveStatus = "saved";
    this.updateSaveIndicator();
    this._saveStatusTimer = window.setTimeout(() => {
      this._saveStatus = "idle";
      this.updateSaveIndicator();
    }, 2500);
  }

  failSave(entityId, error) {
    this._pendingSaves = Math.max(0, this._pendingSaves - 1);
    this._saveHadError = true;
    delete this._optimisticStates[entityId];
    this._saveStatus = "error";
    this._saveMessage = `Save error: ${error?.message || "missing Home Assistant confirmation"}`;
    this.captureScrollPositions();
    this.render();
    this.updateSaveIndicator();
  }

  updateDefaultApplyState() {
    this.querySelectorAll("[data-default-action]").forEach((button) => {
      button.disabled = this._defaultsApplying;
      button.textContent = this._defaultsApplying
        ? "Applying default settings…"
        : button.dataset.defaultLabel || "Apply default settings";
    });
    this.querySelectorAll("[data-defaults-status]").forEach((status) => {
      status.className = `hint defaults-status ${this._defaultsStatus}`;
      status.textContent = this._defaultsMessage;
      status.hidden = !this._defaultsMessage;
    });
  }

  optimisticService(entityId, value, domain, service, data) {
    if (!this.exists(entityId)) return Promise.resolve(false);
    this._optimisticStates[entityId] = String(value);
    this.beginSave();
    const request = this.callService(domain, service, data);
    return Promise.resolve(request).then(() => {
      this.finishSave();
      const timer = window.setTimeout(() => {
        this._optimisticClearTimers.delete(timer);
        if (!this.isConnected) return;
        if (Object.prototype.hasOwnProperty.call(this._optimisticStates, entityId)) {
          delete this._optimisticStates[entityId];
          this.updateToggleButtons();
        }
      }, 15000);
      this._optimisticClearTimers.add(timer);
      return true;
    }).catch((error) => {
      this.failSave(entityId, error);
      return false;
    });
  }

  setNumber(entityId, value) {
    const raw = String(value).trim().replace(",", ".");
    if (!raw) return Promise.resolve(false);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !this.exists(entityId)) return Promise.resolve(false);
    return this.optimisticService(entityId, parsed, "number", "set_value", { entity_id: entityId, value: parsed });
  }

  setSelect(entityId, option) {
    if (!this.exists(entityId)) return Promise.resolve(false);
    // The mode never implies permission to charge from the grid.  That
    // permission is controlled solely by "Grid charging" in the shared
    // Charging Profile.
    const result = this.optimisticService(entityId, option, "select", "select_option", { entity_id: entityId, option });
    this.captureScrollPositions();
    this.render();
    return result;
  }

  turnSwitch(entityId, value) {
    if (!this.exists(entityId)) return Promise.resolve(false);
    const target = value ? "on" : "off";
    this._optimisticStates[entityId] = target;
    this.updateToggleButtons();
    return this.optimisticService(entityId, target, "switch", value ? "turn_on" : "turn_off", { entity_id: entityId });
  }

  setTime(entityId, value) {
    if (!this.exists(entityId)) return Promise.resolve(false);
    const time = value.length === 5 ? `${value}:00` : value;
    return this.optimisticService(entityId, time, "time", "set_value", { entity_id: entityId, time });
  }

  updatePillElement(el) {
    const entityId = el.dataset.toggle;
    const state = this.displayState(entityId, "missing");
    el.classList.toggle("on", state === "on");
    el.classList.toggle("off", state === "off");
    el.classList.toggle("missing", state !== "on" && state !== "off");
    el.textContent = state === "on" ? "yes" : state === "off" ? "no" : "missing";
  }

  updateToggleButtons() {
    this.querySelectorAll("[data-toggle]").forEach((el) => this.updatePillElement(el));
  }

  toggle(entityId) {
    const entity = this._hass.states[entityId];
    if (!entity) return;
    const turnOn = this.displayState(entityId, entity.state) !== "on";
    const target = turnOn ? "on" : "off";
    this.captureScrollPositions();
    this.turnSwitch(entityId, turnOn);
    this.render();
    const timer = window.setTimeout(() => {
      this._optimisticClearTimers.delete(timer);
      if (this.isConnected === false) return;
      if (this._optimisticStates?.[entityId] === target) {
        delete this._optimisticStates[entityId];
        this.updateToggleButtons();
      }
    }, 12000);
    this._optimisticClearTimers.add(timer);
  }

  async toggleControl() {
    const control = this.controlState();
    if (control.pending) return false;
    const entityId = control.entity_id;
    const entity = entityId ? this._hass?.states?.[entityId] : null;
    if (!entity || ["unavailable", "unknown"].includes(String(entity.state))) {
      this._controlError = "Deye Control entity not found. Reload the integration or check the configuration.";
      this._saveStatus = "error";
      this._saveMessage = this._controlError;
      this.render();
      return false;
    }

    const turnOn = !control.enabled;
    this._controlExpectedEnabled = turnOn;
    this._controlFeedbackActive = true;
    this._controlTogglePending = true;
    this._controlError = "";
    this._saveStatus = "saving";
    this._saveMessage = turnOn ? "Enabling Deye Control…" : "Disabling Deye Control…";
    this.render();
    try {
      await this.callService("switch", turnOn ? "turn_on" : "turn_off", { entity_id: entityId });
      return true;
    } catch (error) {
      this._controlExpectedEnabled = null;
      this._controlFeedbackActive = false;
      this._controlError = `Could not toggle Deye Control: ${error?.message || error}`;
      this._saveStatus = "error";
      this._saveMessage = this._controlError;
      return false;
    } finally {
      this._controlTogglePending = false;
      this.render();
      this.updateControlUi();
    }
  }

  pill(entityId, text = null) {
    const state = this.displayState(entityId, "missing");
    const cls = state === "on" ? "on" : state === "off" ? "off" : "missing";
    const label = text || (state === "on" ? "yes" : state === "off" ? "no" : "missing");
    return `<button class="pill ${cls}" data-toggle="${entityId}" ${this.exists(entityId) ? "" : "disabled"}>${label}</button>`;
  }

  escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  downloadHistory(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  editableConfigEntities() {
    const editableDomains = new Set(["number", "select", "switch", "time", "input_number", "input_select", "input_boolean", "input_datetime"]);
    return Object.keys(this._hass?.states || {}).filter((entityId) => {
      const [domain] = entityId.split(".");
      return editableDomains.has(domain) && entityId.includes("deye_energy_");
    });
  }

  configurationSnapshot() {
    const values = {};
    this.editableConfigEntities().forEach((entityId) => { values[entityId] = this.state(entityId); });
    const tariff = this.tariffData();
    return {
      format: "deye-energy-config",
      version: "0.8.0",
      created_at: new Date().toISOString(),
      values,
      physical_tou: this.physicalTouDiagnostics().map((row) => ({
        slot: Number(row.range),
        start: String(row.actual_start || "").slice(0, 5),
        end: String(row.actual_end || "").slice(0, 5),
        soc: this.asNumber(row.actual_soc),
        grid_charge: row.actual_grid_charge === true,
      })),
      tariff_settings: {
        tariff_mode: tariff.mode || "automatic",
        dso_provider: tariff.provider || "other",
        tariff_plan: tariff.plan || "intelligent_go",
        distribution_peak_rate: tariff.peak_rate ?? 0,
        distribution_offpeak_rate: tariff.offpeak_rate ?? 0,
        custom_offpeak_windows: tariff.custom_offpeak_windows || "13:00-15:00,22:00-06:00",
        price_includes_distribution: Boolean(tariff.price_includes_distribution),
        grid_positive_is_import: tariff.grid_positive_is_import !== false,
        battery_positive_is_discharge: tariff.battery_positive_is_discharge !== false,
      },
      card: { theme: this.config?.theme || "deye" },
    };
  }

  async applyConfigurationSnapshot(snapshot) {
    if (!snapshot || snapshot.format !== "deye-energy-config" || typeof snapshot.values !== "object") throw new Error("Invalid configuration file");
    const controlMode = this.entity("select", "control_mode");
    const scheduler = this.entity("switch", "scheduler");
    const chargeScheduler = this.entity("switch", "charge_scheduler");
    const masterControl = this.controlEntityId();
    const deferred = new Set([controlMode, scheduler, chargeScheduler, masterControl].filter(Boolean));
    if (this.exists(controlMode)) {
      await this.callService("select", "select_option", { entity_id: controlMode, option: "Stop Sell" });
    }
    if (this.exists(scheduler)) await this.callService("switch", "turn_off", { entity_id: scheduler });
    if (this.exists(chargeScheduler)) await this.callService("switch", "turn_off", { entity_id: chargeScheduler });
    for (const [entityId, value] of Object.entries(snapshot.values)) {
      if (!entityId.includes("deye_energy_") || !this.exists(entityId) || deferred.has(entityId)) continue;
      const domain = entityId.split(".")[0];
      if (["switch", "input_boolean"].includes(domain)) await this.callService(domain, value === "on" ? "turn_on" : "turn_off", { entity_id: entityId });
      else if (["select", "input_select"].includes(domain)) await this.callService(domain, "select_option", { entity_id: entityId, option: value });
      else if (["number", "input_number"].includes(domain)) await this.callService(domain, "set_value", { entity_id: entityId, value: Number(value) });
      else if (domain === "time") await this.callService(domain, "set_value", { entity_id: entityId, time: String(value).slice(0, 8) });
      else if (domain === "input_datetime") await this.callService(domain, "set_datetime", { entity_id: entityId, time: String(value).slice(0, 8) });
    }
    if (snapshot.tariff_settings && typeof snapshot.tariff_settings === "object") {
      await this.callService("deye_energy", "save_tariff_settings", { data: JSON.stringify(snapshot.tariff_settings) });
    }
    for (const entityId of [chargeScheduler, scheduler]) {
      if (!entityId || !this.exists(entityId) || !(entityId in snapshot.values)) continue;
      await this.callService("switch", snapshot.values[entityId] === "on" ? "turn_on" : "turn_off", { entity_id: entityId });
    }
    if (controlMode && this.exists(controlMode) && controlMode in snapshot.values) {
      await this.callService("select", "select_option", { entity_id: controlMode, option: snapshot.values[controlMode] });
    }
    if (masterControl && this.exists(masterControl) && masterControl in snapshot.values) {
      await this.callService("switch", snapshot.values[masterControl] === "on" ? "turn_on" : "turn_off", { entity_id: masterControl });
    }

    const desiredControlOn = masterControl && this.exists(masterControl)
      ? (masterControl in snapshot.values ? snapshot.values[masterControl] === "on" : this.state(masterControl) === "on")
      : false;
    const physicalTou = Array.isArray(snapshot.physical_tou) ? snapshot.physical_tou : [];
    if (physicalTou.length && desiredControlOn && this.hasService("deye_energy", "set_tou_slot")) {
      for (const row of physicalTou) {
        if (!row || row.slot < 1 || row.slot > 6 || row.soc === null) continue;
        await this.callService("deye_energy", "set_tou_slot", {
          slot: Number(row.slot),
          start: String(row.start || "").slice(0, 5),
          end: String(row.end || "").slice(0, 5),
          soc: Number(row.soc),
          grid_charge: row.grid_charge === true,
        });
      }
    } else if (physicalTou.length && !desiredControlOn) {
      this._saveMessage = "The local configuration was restored. Deye Control is off — no physical TOU was sent to the inverter.";
    }
  }

  exportConfiguration() {
    const snapshot = this.configurationSnapshot();
    this.downloadHistory(`deye-configuration-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
  }

  createConfigurationBackup() {
    const snapshot = this.configurationSnapshot();
    localStorage.setItem("deye_energy_config_backup_v076", JSON.stringify(snapshot));
    this.downloadHistory(`deye-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
  }

  async restoreConfigurationBackup() {
    const raw = localStorage.getItem("deye_energy_config_backup_v076") || localStorage.getItem("deye_energy_config_backup_v074");
    if (!raw) throw new Error("No local backup");
    await this.applyConfigurationSnapshot(JSON.parse(raw));
  }

  refreshConfiguredEntities() {
    const entityIds = Object.keys(this._hass?.states || {}).filter((entityId) => entityId.includes("deye_energy_") || entityId.startsWith("select.deye_inverter_") || entityId.startsWith("number.deye_inverter_") || entityId.startsWith("sensor.deye_inverter_"));
    if (entityIds.length) this.callService("homeassistant", "update_entity", { entity_id: entityIds });
  }

  renderDiagnostics() {
    const entity = this._hass?.states?.[this.entity("sensor", "diagnostics")];
    const attrs = entity?.attributes || {};
    const required = Array.isArray(attrs.entities) ? attrs.entities : [];
    const entityRows = required.length ? required.map((item) => `<tr><td>${this.escapeHtml(item.entity_id)}</td><td><span class="diag-badge ${item.ok ? "ok" : "error"}">${item.ok ? "OK" : this.escapeHtml(item.state)}</span></td></tr>`).join("") : `<tr><td colspan="2">No diagnostic data. Restart Home Assistant.</td></tr>`;
    const connected = attrs.connected === true;
    const mappingSegments = this.mappingSegmentCount();
    const tou = attrs.tou || {};
    const capabilities = attrs.capabilities && typeof attrs.capabilities === "object" ? attrs.capabilities : {};
    const provider = capabilities.provider && typeof capabilities.provider === "object" ? capabilities.provider : {};
    const missingTou = Array.isArray(tou.missing) ? tou.missing : [];
    const attempt = attrs.last_schedule_attempt && typeof attrs.last_schedule_attempt === "object" ? attrs.last_schedule_attempt : null;
    const activeControl = attrs.active_decision_control && typeof attrs.active_decision_control === "object" ? attrs.active_decision_control : {};
    const physicalTou = Array.isArray(attrs.physical_tou) ? attrs.physical_tou : [];
    const diagnosticValue = (value) => value === null || value === undefined || value === "" ? "missing" : String(value);
    const renderValues = (values) => Object.entries(values || {}).map(([label, value]) => `<li><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(String(value))}</strong></li>`).join("") || "<li>No data</li>";
    const attemptSection = attempt?.status ? `<section class="diagnostic-section"><h3>Last schedule apply attempt</h3><div class="schedule-attempt ${attempt.status === "failed" ? "failed" : "ok"}"><div><span>Result</span><strong>${attempt.status === "failed" ? "Failed" : attempt.status === "applied" ? "Confirmed" : "In progress"}</strong></div><div><span>Time / slot</span><strong>${this.formatAppliedAt(attempt.at)} \u00b7 ${this.escapeHtml(attempt.slot || "missing")}</strong></div><div><span>Stage</span><strong>${this.escapeHtml(attempt.stage || "missing")}</strong></div><div class="schedule-attempt-message"><span>Details</span><strong>${this.escapeHtml(attempt.message || "No additional information")}</strong></div><div><span>Expected</span><ul>${renderValues(attempt.expected)}</ul></div><div><span>Read back</span><ul>${renderValues(attempt.actual)}</ul></div></div></section>` : "";
    const activeControlSection = `<section class="diagnostic-section"><h3>SOC and active slot parameters</h3><div class="schedule-attempt"><div><span>Slot / mode</span><strong>${this.escapeHtml(diagnosticValue(activeControl.slot))} \u00b7 ${this.escapeHtml(diagnosticValue(activeControl.mode))}</strong></div><div><span>Sell-stop threshold</span><strong>${this.escapeHtml(diagnosticValue(activeControl.minimum_sell_soc))}%</strong></div><div><span>Physical Deye TOU SOC</span><strong>${this.escapeHtml(diagnosticValue(activeControl.tou_soc))}%</strong></div><div><span>Charging profile target SOC</span><strong>${this.escapeHtml(diagnosticValue(activeControl.charge_profile_target_soc))}%</strong></div><div><span>Effective TOU SOC</span><strong>${this.escapeHtml(diagnosticValue(activeControl.effective_tou_soc))}%</strong></div><div><span>Physical range / SOC reading</span><strong>${this.escapeHtml(diagnosticValue(activeControl.physical_range))} \u00b7 ${this.escapeHtml(diagnosticValue(activeControl.physical_soc_actual))}%</strong></div><div><span>Grid Charge expected / read back</span><strong>${activeControl.grid_charge_expected ? "YES" : "NO"} \u00b7 ${this.escapeHtml(diagnosticValue(activeControl.grid_charge_actual))}</strong></div><div><span>Selling blocked by SOC</span><strong>${activeControl.sale_blocked_by_soc ? "YES" : "NO"}</strong></div></div></section>`;
    const powerLimits = activeControl.power_limits || {};
    const powerLimitsSection = `<section class="diagnostic-section"><h3>Selling power limits</h3><div class="schedule-attempt"><div><span>Target / capped power</span><strong>${diagnosticValue(powerLimits.target_sell_power_w)} W / ${diagnosticValue(powerLimits.applied_sell_power_w)} W</strong></div><div><span>Configured limit</span><strong>${diagnosticValue(powerLimits.configured_inverter_max_power_w)} W</strong></div><div><span>Detected entity limit</span><strong>${diagnosticValue(powerLimits.detected_entity_max_power_w)} W</strong></div><div><span>Effective limit</span><strong>${diagnosticValue(powerLimits.effective_inverter_max_power_w)} W</strong></div></div></section>`;
    const physicalRows = physicalTou.map((row) => `<tr class="${row.actual_active ? "active" : ""}"><td>${this.escapeHtml(diagnosticValue(row.range))}</td><td>${this.escapeHtml(diagnosticValue(row.expected_start))}\u2013${this.escapeHtml(diagnosticValue(row.expected_end))}</td><td>${this.escapeHtml(diagnosticValue(row.actual_start))}\u2013${this.escapeHtml(diagnosticValue(row.actual_end))}</td><td>${this.escapeHtml(diagnosticValue(row.expected_soc))}% / ${this.escapeHtml(diagnosticValue(row.actual_soc))}%</td><td>${row.expected_grid_charge ? "YES" : "NO"} / ${this.escapeHtml(this.touGridLabel(row.actual_grid_charge))}</td></tr>`).join("") || `<tr><td colspan="5">No physical mapping data</td></tr>`;
    const physicalSection = tou.supported === false ? "" : `<section class="diagnostic-section"><h3>Physical Deye TOU ranges</h3><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Range</th><th>Expected hours</th><th>Read-back hours</th><th>SOC expected / read back</th><th>Grid expected / read back</th></tr></thead><tbody>${physicalRows}</tbody></table></div></section>`;
    const touState = tou.supported === false ? "LIMITED" : tou.ok === false ? "ERROR" : "OK";
    const touMessage = tou.supported === false
      ? (tou.note || "The selected provider does not expose safe Time Of Use control in Home Assistant.")
      : tou.ok === false
        ? `Missing entities: ${missingTou.join(", ")}`
        : "All Time Of Use entities are available";
    const touSection = `<section class="diagnostic-section"><h3>Deye Time Of Use mapping</h3><div class="tou-diagnostics"><span class="diag-badge ${tou.supported === false ? "" : tou.ok === false ? "error" : "ok"}">${touState}</span><strong>${this.escapeHtml(touMessage)}</strong></div></section>`;
    const capabilityLabels = {
      readings: "Basic readings",
      basic_control: "Basic control",
      selling: "Selling",
      charging: "Charging",
      full_tou: "Full Deye Time Of Use",
      schedule_data: "Complete schedule data",
    };
    const capabilityRows = Object.entries(capabilityLabels).map(([key, label]) => {
      const item = capabilities[key] || {};
      const text = item.supported === false ? "NOT SUPPORTED" : item.ok ? "OK" : `BRAKI: ${(item.missing || []).join(", ") || "no data"}`;
      return `<tr><td>${label}</td><td><span class="diag-badge ${item.ok ? "ok" : item.supported === false ? "" : "error"}">${this.escapeHtml(text)}</span></td></tr>`;
    }).join("");
    const operationRows = Object.entries(capabilities.operations || {}).filter(([_key, item]) => item?.entity_id && item.entity_id !== "not_configured").map(([key, item]) => `<tr><td>${this.escapeHtml(key)}</td><td>${this.escapeHtml(item.entity_id)}</td><td>${this.escapeHtml(item.operation)}</td></tr>`).join("");
    const capabilitySection = `<section class="diagnostic-section"><h3>Inverter connection capabilities</h3><div class="tou-diagnostics"><strong>${this.escapeHtml(provider.label || attrs.inverter_provider_label || "Unknown profile")}</strong><span>${this.escapeHtml(provider.note || "Feature range depends on the available Home Assistant entities.")}</span></div><div class="diagnostic-entities"><table class="settings-table"><tbody>${capabilityRows}</tbody></table></div>${operationRows ? `<details><summary>Operations assigned to entities</summary><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Function</th><th>Entity</th><th>HA operation</th></tr></thead><tbody>${operationRows}</tbody></table></div></details>` : ""}</section>`;
    return `<div class="diagnostic-summary">
      <div><span>Inverter connection</span><strong class="${connected ? "good" : "bad"}">${connected ? "Connected" : "Problem"}</strong></div>
      <div><span>Manager state</span><strong class="${this.readMode(attrs.manager_status || "NO DATA")[1]}">${this.readMode(attrs.manager_status || "NO DATA")[0]}</strong></div>
      <div><span>Active decision</span><strong>${this.escapeHtml(attrs.active_decision || "missing")} \u00b7 next ${this.escapeHtml(attrs.next_active_decision || "missing")}</strong></div>
      <div><span>Schedule and mapping</span><strong class="${attrs.mapping_status === "OK" ? "good" : "bad"}">${attrs.mapping_status || "missing"} \u00b7 ${mappingSegments}/6</strong></div>
      <div><span>Last save</span><strong>${this.formatAppliedAt(attrs.last_saved_at)}</strong></div>
      <div><span>Last applied</span><strong>${this.formatAppliedAt(attrs.last_applied_at)}</strong></div>
      <div><span>Last error</span><strong class="${attrs.last_error && attrs.last_error !== "none" ? "bad" : "good"}">${attrs.last_error && attrs.last_error !== "none" ? this.escapeHtml(attrs.last_error) : "None"}</strong></div>
      <div><span>Versions</span><strong>Integration ${this.escapeHtml(attrs.integration_version || "0.8.0")} \u00b7 card 0.8.1.09 (resource revision v=0.8.1.09)</strong></div>
    </div>
    ${attemptSection}
    ${capabilitySection}
    ${activeControlSection}
    ${powerLimitsSection}
    ${physicalSection}
    ${touSection}
    <section class="diagnostic-section"><h3>Required entities</h3><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Entity</th><th>State</th></tr></thead><tbody>${entityRows}</tbody></table></div></section>
    <section class="diagnostic-section"><h3>Control and read-back</h3><div class="diagnostic-actions"><button class="resume" data-resume-manager="1" ${this._resumeApplying ? "disabled" : ""}>${this._resumeApplying ? "Enabling Manager\u2026" : "Enable Manager and schedule"}</button><button data-system-defaults="1" data-default-action="1" data-default-label="Stop Manager and apply defaults" ${this._defaultsApplying ? "disabled" : ""}>${this._defaultsApplying ? "Applying default settings\u2026" : "Stop Manager and apply defaults"}</button><button data-refresh-entities="1">Re-read entities</button></div><p class="hint">Enabling the Manager sets Schedule mode and the Scheduler. It does not enable a separate grid-charge schedule.</p></section>
    <section class="diagnostic-section"><h3>Configuration and backup</h3><div class="diagnostic-actions"><button data-export-config="1">Export configuration</button><button data-import-config-open="1">Import configuration</button><input type="file" accept="application/json,.json" data-import-config hidden><button data-create-backup="1">Create a backup</button><button data-restore-backup="1">Restore a backup</button><button class="danger" data-restore-defaults="1" data-default-action="1" data-default-label="Restore default settings" ${this._defaultsApplying ? "disabled" : ""}>${this._defaultsApplying ? "Applying default settings\u2026" : "Restore default settings"}</button></div><div class="hint defaults-status ${this._defaultsStatus}" data-defaults-status ${this._defaultsMessage ? "" : "hidden"}>${this.escapeHtml(this._defaultsMessage)}</div></section>`;
  }

  tariffData() {
    const tariffState = this._hass?.states?.[this.entity("sensor", "tariff_status")];
    const aiState = this._hass?.states?.[this.entity("sensor", "ai_state")];
    return tariffState?.attributes || aiState?.attributes?.tariff || {};
  }

  canonicalPriceData(planner = null) {
    if (planner?.canonical_prices?.schema_version === 1) return planner.canonical_prices;
    const backend = this.tariffData().price_diagnostics;
    return backend?.schema_version === 1 ? backend : { schema_version: 1, buy: { rows: [] }, sell: { rows: [] } };
  }

  canonicalPriceRows(direction, planner = null) {
    const branch = this.canonicalPriceData(planner)?.[direction];
    return Array.isArray(branch?.rows)
      ? branch.rows.filter((row) => row && row.quality === "ready")
      : [];
  }

  canonicalPriceMaps(direction, field = "final_price_gbp_kwh", planner = null) {
    const maps = [new Map(), new Map()];
    this.canonicalPriceRows(direction, planner).forEach((row) => {
      const day = row.day === "today" ? 0 : row.day === "tomorrow" ? 1 : -1;
      const hour = Number(row.hour);
      const value = this.asNumber(row[field]);
      if (day >= 0 && Number.isInteger(hour) && hour >= 0 && hour < 24 && value !== null) maps[day].set(hour, value);
    });
    return maps;
  }

  tariffZoneLabel(zone) {
    return {
      all_day: "All day", peak: "Peak", offpeak: "Cheap / off-peak",
      morning_peak: "Morning peak", afternoon_peak: "Afternoon peak",
      day_peak: "Day peak", day_offpeak: "Day off-peak", night: "Night",
      recommended: "Recommended import", restriction: "Recommended restriction", normal: "Other hours",
      other: "Other hours", dynamic_unavailable: "No dynamic signal",
    }[zone] || String(zone || "missing");
  }

  collectTariffDraft() {
    const draft = { ...(this._tariffDraft || {}) };
    this.querySelectorAll("[data-tariff-field]").forEach((el) => {
      const key = el.dataset.tariffField;
      if (el.type === "checkbox") draft[key] = el.checked;
      else if (["distribution_peak_rate", "distribution_offpeak_rate"].includes(key)) draft[key] = this.asNumber(el.value) ?? el.value;
      else draft[key] = el.value;
    });
    this.querySelectorAll("[data-price-contract]").forEach((el) => {
      const direction = el.dataset.priceContract;
      const key = el.dataset.contractField;
      const targetKey = `${direction}_price_contract`;
      const contract = { ...(draft[targetKey] || {}) };
      let value = el.type === "checkbox" ? el.checked : el.value;
      if (["includes_distribution_variable", "includes_excise", "includes_service_margin"].includes(key)) {
        value = value === "true" ? true : value === "false" ? false : null;
      } else if (key === "vat_rate") {
        value = value === "" ? null : (this.asNumber(value) ?? value);
      }
      contract[key] = value;
      draft[targetKey] = contract;
    });
    if (draft.dso_provider) {
      draft.tariff_mode = draft.dso_provider === "other" || draft.tariff_plan === "custom"
        ? "manual"
        : "automatic";
    }
    this._tariffDraft = draft;
    return draft;
  }

  renderPriceMappingSummary(tariff) {
    const roleLabel = (role) => ({
      retail_buy_all_in: "retail BUY all-in",
      energy_only: "energy only",
      market_reference: "market reference",
      prosumer_sell: "prosumer selling",
      custom: "custom",
    }[role] || "role not determined");
    const statusLabel = (value, entity) => !entity
      ? "not configured"
      : ({ bound: "bound", entity_id_only: "mapping saved", mapped_entity_missing: "entity unavailable" }[value] || value || "awaiting data");
    const rows = [];
    for (const direction of ["buy", "sell"]) {
      const contract = tariff.price_contracts?.[direction] || {};
      for (const day of ["today", "tomorrow"]) {
        const entity = contract[`${day}_entity`] || "";
        const profile = contract[`resolved_source_${day}`] || contract;
        const adapter = contract[`resolved_adapter_${day}`] || "unmapped";
        const status = contract[`stable_identity_${day}_status`] || "";
        rows.push(`<div class="price-mapping-summary-row"><span>${direction.toUpperCase()} ${day === "today" ? "Today" : "Tomorrow"}</span><strong>${this.escapeHtml(entity || "missing")}</strong><small>${this.escapeHtml(statusLabel(status, entity))} · ${this.escapeHtml(adapter)} · ${this.escapeHtml(roleLabel(profile.economic_role))}</small></div>`);
      }
    }
    const buy = tariff.price_contracts?.buy || {};
    const buyProfiles = [buy.resolved_source_today || buy, buy.resolved_source_tomorrow || buy];
    const dsoIncluded = buyProfiles.some((profile) => profile.economic_role === "retail_buy_all_in" || profile.includes_distribution_variable === true);
    const detected = [tariff.price_contracts?.buy?.adapter_summary, tariff.price_contracts?.sell?.adapter_summary]
      .filter((value) => value && value !== "unmapped").join(" / ") || "missing";
    return `<section class="diagnostic-section price-mapping-summary"><h3>Price sources</h3><p><strong>Detected source: ${this.escapeHtml(detected)}</strong> · ${dsoIncluded ? "DSO included" : "DSO added according to tariff"}</p><div class="diagnostic-summary">${rows.join("")}</div><p class="hint">BUY/SELL price entities are configured in the integration settings.</p></section>`;
  }

  renderPriceContract(direction, contract = {}) {
    const label = direction === "buy" ? "BUY — purchase" : "SELL — selling";
    const dayAdapters = [contract.resolved_adapter_today, contract.resolved_adapter_tomorrow].filter((value) => value && value !== "unmapped");
    const known = dayAdapters.some((value) => ["octopus_energy"].includes(value));
    const unmapped = !contract.today_entity && !contract.tomorrow_entity;
    const adapterLabel = contract.adapter_summary || contract.source_adapter || (unmapped ? "unmapped" : "generic");
    const mappingSummary = `<div class="diagnostic-summary"><div><span>Today — authoritative mapping</span><strong>${this.escapeHtml(contract.today_entity || "missing")}</strong></div><div><span>Tomorrow — authoritative mapping</span><strong>${this.escapeHtml(contract.tomorrow_entity || "missing")}</strong></div><div><span>Adapter</span><strong>${this.escapeHtml(adapterLabel)}</strong></div><div><span>Metadata source</span><strong>automatic from mapping</strong></div></div>`;
    const yesNo = (value) => value === true ? "yes" : value === false ? "no" : "missing";
    const readOnlyDay = (day, title) => {
      const adapter = contract[`resolved_adapter_${day}`] || "unmapped";
      if (adapter === "unmapped") return `<div><span>${title}</span><strong>not configured</strong></div>`;
      const profile = contract[`resolved_source_${day}`] || contract;
      const schema = contract[`resolved_schema_${day}`] || {};
      return `<div><span>${title}</span><strong>${this.escapeHtml(adapter)} · ${this.escapeHtml(schema.schema_id || "schema awaiting data")}</strong><small>${this.escapeHtml(profile.economic_role || "missing role")} · ${this.escapeHtml(profile.semantic_scope || "missing semantics")} · distribution ${yesNo(profile.includes_distribution_variable)} · excise ${yesNo(profile.includes_excise)} · margin/service ${yesNo(profile.includes_service_margin)}</small></div>`;
    };
    const field = (name, title, values = null) => {
      const value = contract[name] ?? "";
      const control = values
        ? `<select data-price-contract="${direction}" data-contract-field="${name}">${values.map(([key, text]) => `<option value="${this.escapeHtml(key)}" ${String(value) === String(key) ? "selected" : ""}>${this.escapeHtml(text)}</option>`).join("")}</select>`
        : `<input data-price-contract="${direction}" data-contract-field="${name}" type="text" value="${this.escapeHtml(value)}">`;
      return `<div class="settings-row"><span>${title}</span>${control}</div>`;
    };
    const tri = [["unknown", "unknown — fail closed"], ["true", "yes"], ["false", "no"]];
    if (known || unmapped) {
      return `<details class="diagnostic-section"><summary><b>${label}</b> · ${this.escapeHtml(adapterLabel)} · automatic / read-only</summary>
        ${mappingSummary}
        <div class="diagnostic-summary readonly-price-contract">${readOnlyDay("today", "Today — automatic contract")}${readOnlyDay("tomorrow", "Tomorrow — automatic contract")}</div>
        <p class="hint">Entities are changed only in the "Energy price entities" step. The adapter, schema and semantics of known integrations are re-detected after a mapping change.</p>
      </details>`;
    }
    return `<details class="diagnostic-section custom-price-contract"><summary><b>${label}</b> · ${this.escapeHtml(adapterLabel)} · Advanced / Custom — custom source settings</summary>
      ${mappingSummary}
      ${field("source_adapter", "Contract mode", [["generic", "Generic — fail closed"], ["custom", "Custom contract"]])}
      ${field("economic_role", "Economic role", [["", "select — fail closed"], ["retail_buy_all_in", "retail BUY all-in"], ["energy_only", "energy only"], ["market_reference", "market reference"], ["prosumer_sell", "prosumer selling"], ["custom", "custom"]])}
      ${field("semantic_scope", "Price meaning", [["energy_only", "energy only"], ["all_in_variable", "full variable"], ["partial", "partial / ambiguous"]])}
      ${field("price_basis", "Basis", [["gross", "gross"], ["net", "net"], ["unknown", "unknown — fail closed"]])}
      ${field("unit", "Unit", [["GBP/kWh", "GBP/kWh"], ["GBP/MWh", "GBP/MWh"], ["unknown", "unknown — fail closed"]])}
      ${field("includes_distribution_variable", "Includes variable distribution", tri)}
      ${field("includes_excise", "Includes excise", tri)}
      ${field("includes_service_margin", "Includes margin/service", tri)}
      ${field("list_attribute", "List attribute")}${field("today_list_attribute", "List attribute Today")}${field("tomorrow_list_attribute", "List attribute Tomorrow")}
      ${field("value_field", "Value field")}${field("start_field", "Start field")}${field("end_field", "End field")}
      ${field("period_field", "Period field")}${field("timestamp_field", "Time field")}
      ${field("timestamp_role", "Time meaning", [["start", "start"], ["end", "end"]])}
      ${field("business_date_field", "Business day field")}
      ${field("granularity", "Resolution", [["15m", "15 min"], ["60m", "60 min"], ["timestamp_series", "timestamp series"], ["unknown", "unknown"]])}
      ${field("vat_rate", "VAT as a fraction (e.g. 0.23)")}
    </details>`;
  }

  renderPriceDiagnostics(tariff) {
    const snapshot = tariff.price_diagnostics || {};
    const resolverLabel = (value) => ({
      unmapped: "not configured",
      user_unmapped: "removed in mapping",
      mapped_entity_missing: "missing mapped entity",
      unsupported_price_schema: "unsupported price schema",
      incomplete_price_series: "incomplete price series",
      price_source_not_configured: "price source not configured",
    }[value] || value || "missing");
    const line = (direction) => {
      const hasAuthoritative = Boolean(tariff.price_contracts && Object.prototype.hasOwnProperty.call(tariff.price_contracts, direction));
      const authoritative = tariff.price_contracts?.[direction] || {};
      const branch = snapshot[direction] || {};
      const sellerCatalog = branch.contract?.source_adapter === "seller_catalog";
      const unmapped = hasAuthoritative && !authoritative.today_entity && !authoritative.tomorrow_entity && !sellerCatalog;
      const contract = unmapped ? authoritative : branch.contract || authoritative;
      const diag = unmapped ? { status: "price_source_not_configured", coverage_today: 0, coverage_tomorrow: 0 } : branch.diagnostics || {};
      const rows = unmapped ? [] : Array.isArray(branch.rows) ? branch.rows : [];
      const now = rows.find((row) => row.day === "today" && Number(row.hour) === (this.localDateTimeParts()?.hour ?? new Date().getHours()));
      const addedDso = rows.some((row) => Math.abs(this.asNumber(row.added_distribution) || 0) > 1e-12);
      const aggregation = contract.granularity === "15m" ? "15m→60m weighted" : `${contract.granularity || "per-day"}→60m`;
      return `<tr><td>${direction.toUpperCase()}</td><td>${this.escapeHtml(contract.adapter_summary || contract.source_adapter || "missing")}</td><td>${this.escapeHtml(contract.economic_role || "missing role")} / ${this.escapeHtml(contract.semantic_scope || "per-day")}</td><td>${this.escapeHtml(contract.unit || "per-day")} / ${this.escapeHtml(contract.price_basis || "per-day")}</td><td>${this.escapeHtml(aggregation)}</td><td>${diag.coverage_today || 0}/24 · ${diag.coverage_tomorrow || 0}/24</td><td>${addedDso ? "yes" : "no"}</td><td>${this.escapeHtml(resolverLabel(diag.status || "waiting_data"))}</td><td>${now ? `${this.formatPrice(now.final_price_gbp_kwh)} GBP/kWh` : "missing"}</td></tr>`;
    };
    const resolverLine = (direction, day) => {
      const hasAuthoritative = Boolean(tariff.price_contracts && Object.prototype.hasOwnProperty.call(tariff.price_contracts, direction));
      const authoritative = tariff.price_contracts?.[direction] || {};
      const mapped = hasAuthoritative ? authoritative[`${day}_entity`] || "" : null;
      const branch = snapshot[direction] || {};
      const sellerCatalog = branch.contract?.source_adapter === "seller_catalog";
      const resolver = mapped === "" && !sellerCatalog ? {
        mapped_entity: "", resolved_entity: "", stable_identity_status: "unmapped",
        detected_adapter: "unmapped", resolved_schema: "missing", coverage_hours: 0,
        status: "unmapped", reason: "user_unmapped",
      } : branch.diagnostics?.resolver?.[day] || {};
      const schema = resolver.resolved_schema || "unknown";
      return `<tr><td>${direction.toUpperCase()} ${day === "today" ? "Today" : "Tomorrow"}</td><td>${this.escapeHtml(resolver.mapped_entity || "missing")}</td><td>${this.escapeHtml(resolver.resolved_entity || "missing")}</td><td>${this.escapeHtml(resolverLabel(resolver.stable_identity_status || "unbound"))}</td><td>${this.escapeHtml(resolver.detected_adapter || "generic")}</td><td>${this.escapeHtml(typeof schema === "string" ? schema : schema.schema_id || "unknown")}</td><td>${this.escapeHtml(resolver.list_attribute || "missing")} / ${this.escapeHtml(resolver.value_field || "missing")}</td><td>${this.escapeHtml(resolver.unit || "unknown")} / ${this.escapeHtml(resolver.economic_role || "missing role")} / ${this.escapeHtml(resolver.semantic_scope || "unknown")}</td><td>${Number(resolver.coverage_hours || 0)}/24</td><td>${this.escapeHtml(resolverLabel(resolver.status || "waiting_data"))}${resolver.reason ? ` · ${this.escapeHtml(resolverLabel(resolver.reason))}` : ""}</td></tr>`;
    };
    return `<details class="diagnostic-section tariff-price-diagnostics"><summary><b>Technical price diagnostics</b> · resolver, schema and coverage</summary><section><h3>Backend canonical prices</h3><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Direction</th><th>Source</th><th>Price type</th><th>Unit / net-gross</th><th>Aggregation</th><th>Coverage</th><th>DEM added DSO</th><th>Status</th><th>Final Core price</th></tr></thead><tbody>${line("buy")}${line("sell")}</tbody></table></div><h4>Resolver for mapped entities</h4><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Mapping</th><th>Selected entity</th><th>Resolved entity</th><th>Stable identity</th><th>Adapter</th><th>Schema</th><th>List / value</th><th>Unit / semantics</th><th>Coverage</th><th>Status / reason</th></tr></thead><tbody>${resolverLine("buy", "today")}${resolverLine("buy", "tomorrow")}${resolverLine("sell", "today")}${resolverLine("sell", "tomorrow")}</tbody></table></div><p class="hint">An unknown unit, basis, role or semantics blocks planning (fail closed). Distribution, VAT and other components are added only in the backend. The frontend does not read or guess the schema of source entities.</p></section></details>`;
  }

  async saveTariffSettings() {
    const button = this.querySelector("[data-save-tariff]");
    if (button) button.disabled = true;
    try {
      const data = this.collectTariffDraft();
      await this.callService("deye_energy", "save_tariff_settings", { data: JSON.stringify(data) });
      this._tariffDraft = null;
      this._tariffSaveStatus = "Saved. The schedule uses the new settings.";
    } catch (error) {
      this._tariffSaveStatus = `Save error: ${error?.message || error}`;
    }
    this.render();
  }

  renderTariffTab() {
    const tariff = this.tariffData();
    const draft = {
      tariff_mode: tariff.mode || "automatic",
      dso_provider: tariff.provider || "other",
      tariff_plan: tariff.plan || "intelligent_go",
      price_includes_distribution: Boolean(tariff.price_includes_distribution),
      buy_price_contract: { ...(tariff.price_contracts?.buy || {}) },
      sell_price_contract: { ...(tariff.price_contracts?.sell || {}) },
      distribution_peak_rate: tariff.peak_rate ?? 0,
      distribution_offpeak_rate: tariff.offpeak_rate ?? 0,
      custom_offpeak_windows: tariff.custom_offpeak_windows || "13:00-15:00,22:00-06:00",
      grid_positive_is_import: tariff.grid_positive_is_import !== false,
      battery_positive_is_discharge: tariff.battery_positive_is_discharge !== false,
      buy_seller_id: tariff.seller_fallback?.selected_seller_id || "",
      buy_seller_tariff_id: tariff.seller_fallback?.selected_seller_tariff_id || "",
      ...(this._tariffDraft || {}),
    };
    const providers = Array.isArray(tariff.providers) ? tariff.providers : [];
    const selectedProvider = providers.find((item) => item.id === draft.dso_provider);
    const tariffs = selectedProvider?.tariffs || (Array.isArray(tariff.tariffs) ? tariff.tariffs : []);
    if (tariffs.length && !tariffs.some((item) => item.id === draft.tariff_plan)) draft.tariff_plan = tariffs[0].id;
    const options = (rows, selected) => rows.map((item) => {
      const reason = item.available === false && item.unavailable_reason ? ` — ${item.unavailable_reason}` : "";
      const disabled = item.available === false && item.id !== selected ? "disabled" : "";
      return `<option value="${this.escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""} ${disabled}>${this.escapeHtml(`${item.name}${reason}`)}</option>`;
    }).join("");
    const rows = Array.isArray(tariff.hourly_profile) ? tariff.hourly_profile : [];
    const profileRows = rows.map((row) => `<tr>
      <td>${this.escapeHtml(row.date || "")}</td><td>${this.escapeHtml(row.label || this.hourLabel(Number(row.hour)))}</td>
      <td>${this.escapeHtml(this.tariffZoneLabel(row.zone))}</td><td>${this.formatNumber(row.rate, 4)}</td>
      <td>${this.formatNumber(row.common_rate, 4)}</td><td>${this.formatNumber(row.total_distribution_rate ?? row.rate, 4)}</td>
      <td>${row.holiday ? "holiday" : row.weekend ? "weekend" : "weekday"}</td>
    </tr>`).join("");
    const statusClass = tariff.catalog_error ? "bad" : tariff.configured ? "good" : "warn";
    const manual = draft.dso_provider === "other" || draft.tariff_plan === "custom";
    draft.tariff_mode = manual ? "manual" : "automatic";
    const isCustom = (contract) => {
      const mapped = Boolean(contract?.today_entity || contract?.tomorrow_entity);
      return mapped && (
        ["custom", "generic"].includes(contract?.source_adapter)
        || ["today", "tomorrow"].some((day) => ["custom", "generic"].includes(contract?.[`resolved_adapter_${day}`]))
      );
    };
    const buyMapped = Boolean(draft.buy_price_contract?.today_entity || draft.buy_price_contract?.tomorrow_entity);
    const fallback = tariff.seller_fallback || {};
    const support = fallback.support_matrix?.[draft.dso_provider]?.[draft.tariff_plan] || {};
    const sellerOptions = Array.isArray(fallback.seller_options) ? fallback.seller_options : [];
    const sellerName = (id) => sellerOptions.find((item) => item.id === id)?.name || id || "missing";
    const scopeKey = `${draft.dso_provider}/${draft.tariff_plan}/${draft.buy_seller_id || ""}`;
    const sellerTariffs = Array.isArray(fallback.tariff_options_by_scope?.[scopeKey])
      ? fallback.tariff_options_by_scope[scopeKey]
      : [];
    if (draft.buy_seller_tariff_id && !sellerTariffs.some((item) => item.id === draft.buy_seller_tariff_id)) {
      draft.buy_seller_tariff_id = "";
    }
    const sellerChoices = `<option value="">— select —</option>${options(sellerOptions, draft.buy_seller_id)}`;
    const suggestedSeller = support.suggested_seller_id || fallback.suggested_seller_id || "";
    const unsupportedReason = draft.buy_seller_id && draft.buy_seller_id !== suggestedSeller
      ? "No verified standard tariff for this supplier for the selected DSO tariff."
      : support.reason || fallback.support_reason || "No valid, unambiguous standard tariff.";
    const sellerFallbackUi = buyMapped ? "" : `<div class="seller-buy-fallback">
      <h4>Standard energy purchase</h4>
      <div class="settings-row"><span>Energy supplier (purchase)</span><select data-tariff-field="buy_seller_id">${sellerChoices}</select></div>
      ${!draft.buy_seller_id && suggestedSeller ? `<p class="hint">Suggestion for this DSO: <b>${this.escapeHtml(sellerName(suggestedSeller))}</b>. The choice is not applied automatically.</p>` : ""}
      ${draft.buy_seller_id && sellerTariffs.length === 1 ? `<p class="hint good">Matched supplier tariff: <b>${this.escapeHtml(sellerTariffs[0].name)}</b>.</p>` : ""}
      ${draft.buy_seller_id && sellerTariffs.length > 1 ? `<div class="settings-row"><span>Supplier tariff</span><select data-tariff-field="buy_seller_tariff_id"><option value="">— select —</option>${options(sellerTariffs, draft.buy_seller_tariff_id)}</select></div>` : ""}
      ${draft.buy_seller_id && sellerTariffs.length === 0 ? `<p class="hint bad">No standard BUY: ${this.escapeHtml(unsupportedReason)} The system remains fail-closed.</p>` : ""}
    </div>`;
    const catalogValidity = tariff.catalog_current_validity === "valid" ? "valid" : tariff.catalog_current_validity || "no data";
    return `<div class="hint">The operator, tariff and rates are only saved with the <b>Save settings</b>. The profile covers today and tomorrow; weekends, holidays and seasons are calculated automatically.</div>
      <div class="diagnostic-summary"><div><span>DSO operator</span><strong>${this.escapeHtml(tariff.provider_name || "missing")}</strong></div><div><span>Tariff / season</span><strong>${this.escapeHtml(tariff.plan_name || "missing")} · ${tariff.season === "summer" ? "summer" : tariff.season === "winter" ? "winter" : "missing"}</strong></div><div><span>Current zone</span><strong>${this.escapeHtml(this.tariffZoneLabel(tariff.zone))} · ${this.formatNumber(tariff.total_distribution_rate ?? tariff.distribution_rate, 4)} GBP/kWh</strong></div><div><span>Catalog</span><strong class="${statusClass}">${this.escapeHtml(tariff.catalog_version || "bundled")} · ${this.escapeHtml(tariff.catalog_source || "missing")}</strong></div></div>
      <section class="diagnostic-section"><h3>Operator and tariff settings</h3>
        <div class="settings-row"><span>DSO operator</span><select data-tariff-field="dso_provider">${options(providers, draft.dso_provider)}</select></div>
        <div class="settings-row"><span>Tariff</span><select data-tariff-field="tariff_plan">${options(tariffs, draft.tariff_plan)}</select></div>
        ${manual ? `<div class="manual-dso-profile"><h4>Manual DSO profile</h4><div class="settings-row"><span>Peak rate [GBP/kWh]</span><input data-tariff-field="distribution_peak_rate" type="text" inputmode="decimal" value="${this.escapeHtml(draft.distribution_peak_rate)}"></div><div class="settings-row"><span>Cheap rate [GBP/kWh]</span><input data-tariff-field="distribution_offpeak_rate" type="text" inputmode="decimal" value="${this.escapeHtml(draft.distribution_offpeak_rate)}"></div><div class="settings-row"><span>Custom cheap hours</span><input data-tariff-field="custom_offpeak_windows" type="text" value="${this.escapeHtml(draft.custom_offpeak_windows)}"></div></div>` : ""}
        ${sellerFallbackUi}
        <div class="diagnostic-actions"><button class="wide-action" data-save-tariff="1">Save settings</button><button data-refresh-tariff="1">Check catalog update</button></div>
        <p class="hint">Local catalog: <b>${this.escapeHtml(tariff.catalog_local_version || tariff.catalog_version || "missing")}</b> · remote: <b>${this.escapeHtml(tariff.catalog_remote_version || "not checked")}</b> · checked: <b>${this.escapeHtml(tariff.catalog_last_checked || "never")}</b> · result: <b>${this.escapeHtml(tariff.catalog_update_result || "not checked")}</b> · validity: <b>${this.escapeHtml(catalogValidity)} (${this.escapeHtml(tariff.catalog_effective_from || "?")}–${this.escapeHtml(tariff.catalog_valid_to || "?")})</b></p>
        ${this._tariffSaveStatus ? `<div class="hint">${this.escapeHtml(this._tariffSaveStatus)}</div>` : ""}
        ${tariff.catalog_error ? `<div class="hint bad">${this.escapeHtml(tariff.catalog_error)}. The last valid catalog is used.</div>` : ""}
        ${tariff.tariff_error ? `<div class="hint bad">The selected profile is unavailable: ${this.escapeHtml(tariff.tariff_error)}. The scheduler will not use it for charge planning.</div>` : ""}
      </section>
      ${this.renderPriceMappingSummary(tariff)}
      ${isCustom(draft.buy_price_contract) ? this.renderPriceContract("buy", draft.buy_price_contract) : ""}
      ${isCustom(draft.sell_price_contract) ? this.renderPriceContract("sell", draft.sell_price_contract) : ""}
      <details class="diagnostic-section tariff-advanced"><summary><b>Advanced</b> · flow polarity</summary><div class="settings-row"><span>Positive grid power means import</span><input data-tariff-field="grid_positive_is_import" type="checkbox" ${draft.grid_positive_is_import ? "checked" : ""}></div><div class="settings-row"><span>Positive battery power means discharge</span><input data-tariff-field="battery_positive_is_discharge" type="checkbox" ${draft.battery_positive_is_discharge ? "checked" : ""}></div></details>
      ${this.renderPriceDiagnostics(tariff)}
      <section class="diagnostic-section"><h3>Distribution cost profile — today and tomorrow</h3><div class="diagnostic-entities"><table class="settings-table"><thead><tr><th>Date</th><th>Hour</th><th>Zone</th><th>Grid</th><th>Variable charges</th><th>Total</th><th>Day type</th></tr></thead><tbody>${profileRows || '<tr><td colspan="7">No profile. Select an operator and tariff, then save.</td></tr>'}</tbody></table></div></section>`;
  }

  physicalTouDiagnostics() {
    const attrs = this.diagnosticsAttributes();
    return Array.isArray(attrs.physical_tou) ? attrs.physical_tou : [];
  }

  touCapabilitiesDiagnostics() {
    const rows = this.diagnosticsAttributes()?.tou_capabilities;
    return Array.isArray(rows) ? rows : [];
  }

  touTransactionDiagnostics() {
    const value = this.diagnosticsAttributes()?.tou_transaction;
    return value && typeof value === "object" ? value : {};
  }

  touReverseSyncDiagnostics() {
    const value = this.diagnosticsAttributes()?.tou_reverse_sync;
    return value && typeof value === "object" ? value : {};
  }

  touCapabilityRow(slot) {
    return this.touCapabilitiesDiagnostics().find((row) => Number(row.slot_index) === Number(slot)) || null;
  }

  touWritePending() {
    return this.touTransactionDiagnostics().tou_write_pending === true;
  }

  touOperationStatus() {
    const transaction = this.touTransactionDiagnostics();
    return String(transaction.operation_status || transaction.tou_operation_status || "idle");
  }

  touControlBlocked(row = null) {
    const control = this.diagnosticsAttributes()?.control || {};
    return control.control_enabled === false
      || String(control.control_status || "") !== "Active"
      || row?.blocked_by_master_control === true;
  }

  touOperationStatusLabel(status = this.touOperationStatus()) {
    return ({
      idle: "No active save",
      writing: "Saving",
      confirming: "Waiting for confirmation",
      waiting: "Waiting for confirmation",
      confirmed: "Confirmed",
      rollback: "Restoring previous settings",
      rollback_failed: "Could not restore the settings",
      mismatch: "Mismatch",
      unavailable: "Unavailable",
    })[String(status)] || "No active save";
  }

  touReverseStatusLabel(status) {
    return ({
      idle: "No active synchronisation",
      applying: "Synchronising the schedule",
      confirmed: "Confirmed",
      skipped_manual_schedule: "Skipped — manual schedule active",
      rollback: "Wycofana",
      rollback_failed: "Could not restore the settings",
    })[String(status)] || "No data";
  }

  touDiagnosticsSignature() {
    return JSON.stringify({
      capabilities: this.touCapabilitiesDiagnostics(),
      physical: this.physicalTouDiagnostics(),
      transaction: this.touTransactionDiagnostics(),
      reverse: this.touReverseSyncDiagnostics(),
      control: this.diagnosticsAttributes()?.control || {},
    });
  }

  diagnosticsAttributes() {
    return this._hass?.states?.[this.entity("sensor", "diagnostics")]?.attributes || {};
  }

  fullTouCapability() {
    return this.diagnosticsAttributes()?.capabilities?.full_tou || { ok: false, supported: false };
  }

  mappingPlanDiagnostics() {
    const plan = this.diagnosticsAttributes()?.mapping_plan;
    return Array.isArray(plan) ? plan : [];
  }

  mappingSegmentCount() {
    const segments = this.diagnosticsAttributes()?.mapping_segments;
    if (Array.isArray(segments)) return segments.length;
    return this.mappingPlanDiagnostics().length || this.physicalTouDiagnostics().length;
  }

  // ---- Deye Time Of Use table editor ---------------------------------------

  // Reverse of clockFromMinutes; accepts whole-minute clock times (HH:MM, H:MM, with optional seconds).
  minutesFromClock(value) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value ?? "").trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  normalizeMappingClock(value) {
    if (value === null || value === undefined || value === "") return "00:00";
    const text = String(value).trim();
    if (text !== "" && Number.isFinite(Number(text))) return this.clockFromMinutes(Number(text));
    const minutes = this.minutesFromClock(text);
    return minutes === null ? text.slice(0, 5) : this.clockFromMinutes(minutes);
  }

  // The physical TOU entity IDs are published in tou_capabilities[].fields.
  // Using them keeps the refresh independent of provider naming.
  mappingTouEntityIds() {
    const ids = new Set();
    this.touCapabilitiesDiagnostics().forEach((row) => {
      Object.values(row?.fields || {}).forEach((field) => {
        if (field?.entity_id) ids.add(String(field.entity_id));
      });
    });
    return [...ids].filter((id) => Boolean(this._hass?.states?.[id]));
  }

  mappingEntityId(slot, field) {
    return this.touCapabilityRow(slot)?.fields?.[field]?.entity_id || null;
  }

  mappingLiveValue(entityId, field) {
    if (!entityId) return null;
    const state = this._hass?.states?.[entityId];
    if (!state) return null;
    const raw = String(state.state ?? "").trim();
    if (!raw || ["unknown", "unavailable", "none"].includes(raw.toLowerCase())) return null;
    if (field === "start") return this.normalizeMappingClock(raw);
    if (field === "soc" || field === "power" || field === "voltage") {
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }
    if (field === "grid_charge" || field === "sell") {
      const normalized = raw.toLowerCase();
      if (["on", "true", "1", "yes", "enable", "enabled", "allow grid", "both"].includes(normalized)) return true;
      if (["off", "false", "0", "no", "disable", "disabled", "no grid or gen"].includes(normalized)) return false;
      const label = this.touGridLabel(raw);
      if (label === "yes") return true;
      if (label === "no") return false;
      return null;
    }
    if (field === "mode" || field === "charge") {
      return raw;
    }
    return null;
  }

  mappingRowsFromDiagnostics() {
    const physical = this.physicalTouDiagnostics();
    const plan = this.mappingPlanDiagnostics();
    const rows = [];
    for (let slot = 1; slot <= 6; slot += 1) {
      const physicalRow = physical.find((item) => Number(item.range) === slot) || {};
      const planRow = plan[slot - 1] || {};
      const cap = (field) => physicalRow?.capabilities?.fields?.[field] ?? physicalRow?.fields?.[field] ?? this.touCapabilityRow(slot)?.fields?.[field] ?? null;
      const capActual = (field) => {
        const c = cap(field);
        let val = c?.actual;
        if (val === undefined || val === null || val === "") return null;
        if (field === "sell" || field === "grid_charge") {
          if (typeof val === "boolean") return val;
          const n = String(val).trim().toLowerCase();
          if (["on","true","1","yes","enable","enabled","allow grid","both"].includes(n)) return true;
          if (["off","false","0","no","disable","disabled","no grid or gen"].includes(n)) return false;
          return null;
        }
        if (field === "soc" || field === "power" || field === "voltage") {
          const num = Number(val);
          return Number.isFinite(num) ? num : null;
        }
        if (field === "start") return this.normalizeMappingClock(val);
        return String(val);
      };
      const start = this.normalizeMappingClock(
        this.mappingLiveValue(this.mappingEntityId(slot, "start"), "start")
        ?? physicalRow.actual_start
        ?? capActual("start")
        ?? planRow.start_time
        ?? planRow.start
        ?? "00:00",
      );
      const soc = this.mappingLiveValue(this.mappingEntityId(slot, "soc"), "soc")
        ?? physicalRow.actual_soc
        ?? capActual("soc")
        ?? planRow.tou_soc;
      const grid = this.mappingLiveValue(this.mappingEntityId(slot, "grid_charge"), "grid_charge")
        ?? physicalRow.actual_grid_charge_enabled
        ?? capActual("grid_charge")
        ?? planRow.grid_charge;
      const mode = this.mappingLiveValue(this.mappingEntityId(slot, "mode"), "mode")
        ?? physicalRow.actual_mode
        ?? capActual("mode")
        ?? planRow.mode
        ?? null;
      const charge = this.mappingLiveValue(this.mappingEntityId(slot, "charge"), "charge")
        ?? physicalRow.actual_charge
        ?? capActual("charge")
        ?? planRow.charge
        ?? null;
      const sell = this.mappingLiveValue(this.mappingEntityId(slot, "sell"), "sell")
        ?? physicalRow.actual_sell
        ?? capActual("sell")
        ?? planRow.sell;
      const power = this.mappingLiveValue(this.mappingEntityId(slot, "power"), "power")
        ?? physicalRow.actual_power
        ?? capActual("power")
        ?? planRow.power;
      const voltage = this.mappingLiveValue(this.mappingEntityId(slot, "voltage"), "voltage")
        ?? physicalRow.actual_voltage
        ?? capActual("voltage")
        ?? planRow.voltage;
      rows.push({
        slot,
        start,
        soc: soc === null || soc === undefined || soc === "" ? null : Number(soc),
        gridCharge: Boolean(grid),
        mode: mode === null || mode === undefined || mode === "" ? null : String(mode),
        charge: charge === null || charge === undefined || charge === "" ? null : String(charge),
        sell: sell === null || sell === undefined ? null : Boolean(sell),
        power: power === null || power === undefined || power === "" ? null : Number(power),
        voltage: voltage === null || voltage === undefined || voltage === "" ? null : Number(voltage),
      });
    }
    rows.forEach((row, index) => {
      row.end = index === rows.length - 1 ? "00:00" : rows[index + 1].start;
    });
    return rows;
  }

  resetMappingEditor() {
    this._mappingDraft = null;
    this._mappingEditing = false;
    this._mappingSaveError = "";
    this._mappingStatus = "";
  }

  ensureMappingDraft() {
    if (this._mappingEditing) {
      if (Array.isArray(this._mappingDraft) && this._mappingDraft.length === 6) return this._mappingDraft;
      this._mappingDraft = this.mappingRowsFromDiagnostics();
      return this._mappingDraft;
    }
    // View mode: always load live inverter/HA values; no local copy.
    return this.mappingRowsFromDiagnostics();
  }

  startMappingEdit() {
    if (this.touWritePending() || this._mappingSaving) return;
    this._mappingDraft = this.mappingRowsFromDiagnostics();
    this._mappingEditing = true;
    this._mappingSaveError = "";
    this._mappingStatus = "";
    this.render();
  }

  async cancelMappingEdit() {
    this._mappingEditing = false;
    this._mappingDraft = null;
    this._mappingSaveError = "";
    await this.refreshMappingFromInverter();
  }

  // Force the upstream integration to re-read the physical TOU entities, then
  // redraw from the live states. Called every time the TOU tab is opened.
  async refreshMappingFromInverter(options = {}) {
    const keepStatus = options.keepStatus === true;
    const keepEditing = options.keepEditing === true;
    const previousStatus = this._mappingStatus;
    const entityIds = this.mappingTouEntityIds();
    const diagnosticsEntity = this.entity("sensor", "diagnostics");
    if (diagnosticsEntity && this.exists(diagnosticsEntity) && !entityIds.includes(diagnosticsEntity)) {
      entityIds.push(diagnosticsEntity);
    }
    let refreshError = "";
    if (entityIds.length && this.hasService("homeassistant", "update_entity")) {
      try {
        await this.callService("homeassistant", "update_entity", { entity_id: entityIds });
      } catch (error) {
        refreshError = error?.message || "Could not refresh the inverter values.";
      }
    }
    // Opening the tab or pressing Rollback discards any unsaved draft so the
    // next render is built from the freshly fetched inverter values.
    const wasEditing = this._mappingEditing;
    this.resetMappingEditor();
    if (keepEditing && wasEditing) {
      this._mappingEditing = true;
      this._mappingDraft = this.mappingRowsFromDiagnostics();
    }
    if (refreshError) this._mappingSaveError = refreshError;
    else if (keepStatus) this._mappingStatus = previousStatus;
    this.render();
  }

  // Rollback discards every local edit and repopulates all six rows from the
  // values currently reported by the inverter.
  async rollbackTouTable() {
    this._mappingEditing = false;
    this._mappingDraft = null;
    await this.refreshMappingFromInverter();
    if (!this._mappingSaveError) this._mappingStatus = "Restored all rows from the inverter.";
    this.render();
  }

  collectMappingDraft() {
    const rows = this.ensureMappingDraft();
    const controls = typeof this.querySelectorAll === "function"
      ? Array.from(this.querySelectorAll("[data-mapping-field]"))
      : [];
    const setControlValue = (slot, field, value) => {
      const el = controls.find((item) => Number(item.dataset.mappingSlot) === Number(slot)
        && item.dataset.mappingField === field);
      if (el) el.value = value;
    };
    controls.forEach((el) => {
      const slot = Number(el.dataset.mappingSlot);
      const field = String(el.dataset.mappingField || "");
      const row = rows.find((item) => Number(item.slot) === slot);
      if (!row) return;
      const rawValue = String(el.value || "").trim();
      const timeValue = (field === "start" || field === "end")
        ? this.normalizeMappingClock(rawValue)
        : "";
      // An unchanged control may be stale after a neighbouring edit synced it.
      // Ignore it so it cannot overwrite the newer value.
      if ((field === "start" || field === "end") && timeValue === row[field]) return;
      if (field === "start") {
        row.start = timeValue;
        // To is derived from the following From; keep the chain contiguous.
        if (slot > 1) {
          const previous = rows.find((item) => Number(item.slot) === slot - 1);
          if (previous) {
            previous.end = timeValue;
            setControlValue(slot - 1, "end", timeValue);
          }
        }
      } else if (field === "end") {
        row.end = timeValue;
        if (slot < rows.length) {
          const next = rows.find((item) => Number(item.slot) === slot + 1);
          if (next) {
            next.start = timeValue;
            setControlValue(slot + 1, "start", timeValue);
          }
        }
      } else if (field === "soc") {
        const numeric = Number(el.value);
        row.soc = Number.isFinite(numeric) ? numeric : null;
      } else if (field === "grid_charge") {
        row.gridCharge = String(el.value) === "on";
      } else if (field === "mode" || field === "charge") {
        const value = String(el.value ?? "").trim();
        row[field] = value || null;
      } else if (field === "sell") {
        row.sell = String(el.value) === "on";
      } else if (field === "power" || field === "voltage") {
        const numeric = Number(el.value);
        row[field] = Number.isFinite(numeric) ? numeric : null;
      }
    });
    return rows;
  }

  // Save-only validation. A first start of 00:00, a last end of 00:00, an
  // unbroken To[i] == From[i+1] chain and positive durations imply exactly one
  // midnight wrap and coverage of the full 24-hour day without gaps/overlap.
  validateMappingDraft(rows) {
    if (!Array.isArray(rows) || rows.length !== 6) return "The mapping must contain exactly six ranges.";
    const times = rows.map((row) => ({
      start: this.minutesFromClock(row.start),
      end: this.minutesFromClock(row.end),
    }));
    if (times.some((row) => row.start === null || row.end === null)) {
      return "All From and To times must be valid HH:MM times.";
    }
    if (times[0].start !== 0) return "The first range must start at 00:00.";
    if (times[times.length - 1].end !== 0) return "The last range must end at 00:00.";
    for (let index = 0; index < times.length; index += 1) {
      const current = times[index];
      const end = index === times.length - 1 && current.end === 0 ? 1440 : current.end;
      if (end - current.start <= 0) return `Range ${index + 1} must cover a positive amount of time.`;
      if (index < times.length - 1 && current.end !== times[index + 1].start) {
        return `Range ${index + 1} ends at ${this.clockFromMinutes(current.end)} but range ${index + 2} starts at ${this.clockFromMinutes(times[index + 1].start)}.`;
      }
    }
    for (const row of rows) {
      const soc = Number(row.soc);
      if (!Number.isFinite(soc) || soc < 0 || soc > 100) {
        return `Deye TOU SOC must be between 0 and 100% (range ${row.slot}).`;
      }
      for (const field of ["power", "voltage"]) {
        if (row[field] === null || row[field] === undefined || row[field] === "") continue;
        const numeric = Number(row[field]);
        if (!Number.isFinite(numeric) || numeric < 0) {
          return `Deye TOU ${field} must be a non-negative number (range ${row.slot}).`;
        }
      }
    }
    return "";
  }

  mappingFieldWritable(slot, field) {
    const capability = this.touCapabilityRow(slot);
    const fieldCapability = capability?.fields?.[field];
    return Boolean(fieldCapability?.supported === true
      && fieldCapability.writable === true
      && !this.touControlBlocked(capability));
  }

  async saveMappingToInverter() {
    if (this._mappingSaving || this.touWritePending()) {
      this._mappingSaveError = "Saving Deye Time Of Use";
      this.render();
      return false;
    }
    if (!this.hasService("deye_energy", "set_tou_slot")) {
      this._mappingSaveError = "The set_tou_slot service is unavailable.";
      this.render();
      return false;
    }
    const rows = this.collectMappingDraft();
    const error = this.validateMappingDraft(rows);
    if (error) {
      this._mappingSaveError = error;
      this._mappingStatus = "";
      this.render();
      return false;
    }
    const capabilities = this.touCapabilitiesDiagnostics();
    if (capabilities.length && capabilities.every((row) => row.read_only === true)) {
      this._mappingSaveError = "This provider exposes Deye Time Of Use as read-only.";
      this.render();
      return false;
    }
    if (this.touControlBlocked()) {
      this._mappingSaveError = "Deye control is disabled.";
      this.render();
      return false;
    }
    // Each write re-validates the whole start vector against current HA states.
    // Move earlier starts in ascending slot order first, then later starts in
    // descending order, so intermediate vectors stay ordered where possible.
    const previousStarts = new Map(this.mappingRowsFromDiagnostics().map((row) => [Number(row.slot), this.minutesFromClock(row.start)]));
    const ordered = [...rows].sort((a, b) => {
      const aDelta = this.minutesFromClock(a.start) - (previousStarts.get(Number(a.slot)) ?? 0);
      const bDelta = this.minutesFromClock(b.start) - (previousStarts.get(Number(b.slot)) ?? 0);
      if ((aDelta < 0) !== (bDelta < 0)) return aDelta < 0 ? -1 : 1;
      if (aDelta === bDelta) return Number(a.slot) - Number(b.slot);
      return aDelta < 0 ? Number(a.slot) - Number(b.slot) : Number(b.slot) - Number(a.slot);
    });
    this._mappingSaving = true;
    this._mappingSaveError = "";
    this._mappingStatus = "";
    this.beginSave();
    this.render();
    try {
      for (const row of ordered) {
        const payload = { slot: Number(row.slot) };
        if (this.mappingFieldWritable(row.slot, "start")) payload.start = String(row.start).slice(0, 5);
        if (this.mappingFieldWritable(row.slot, "soc")) payload.soc = Number(row.soc);
        if (this.mappingFieldWritable(row.slot, "mode") && row.mode !== null && row.mode !== undefined && row.mode !== "") {
          payload.mode = String(row.mode);
        } else if (this.mappingFieldWritable(row.slot, "grid_charge")) {
          payload.grid_charge = Boolean(row.gridCharge);
        }
        if (this.mappingFieldWritable(row.slot, "charge") && row.charge !== null && row.charge !== undefined && row.charge !== "") {
          payload.charge = String(row.charge);
        }
        if (this.mappingFieldWritable(row.slot, "sell") && row.sell !== null && row.sell !== undefined) {
          payload.sell = Boolean(row.sell);
        }
        if (this.mappingFieldWritable(row.slot, "power") && row.power !== null && row.power !== undefined && row.power !== "") {
          payload.power = Number(row.power);
        }
        if (this.mappingFieldWritable(row.slot, "voltage") && row.voltage !== null && row.voltage !== undefined && row.voltage !== "") {
          payload.voltage = Number(row.voltage);
        }
        if (Object.keys(payload).length === 1) continue;
        await this.callService("deye_energy", "set_tou_slot", payload);
      }
      this._mappingSaving = false;
      this.finishSave();
      this.resetMappingEditor();
      this._mappingStatus = "Saved to the inverter.";
      this.render();
      await this.refreshMappingFromInverter({ keepStatus: true });
      return true;
    } catch (error) {
      this._mappingSaving = false;
      this._mappingSaveError = error?.message || "Could not save the mapping to the inverter.";
      this._mappingStatus = "";
      this.failSave("tou_mapping", error);
      this.render();
      return false;
    }
  }

  // ---- Manual schedule editor ---------------------------------------------

  manualScheduleBackend() {
    const entity = this._hass?.states?.[this.entity("sensor", "ai_state")];
    const manual = entity?.attributes?.manual_schedule;
    return manual && typeof manual === "object" && !Array.isArray(manual) ? manual : {};
  }

  maybeAutoLoadManualScheduleFromTou() {
    const rows = this.manualScheduleBackend().rows;
    if (Array.isArray(rows) && rows.length) {
      this._manualScheduleAutoLoadAttempted = false;
      return Promise.resolve(false);
    }
    if (this._manualScheduleAutoLoadAttempted || this._manualScheduleSaving) return Promise.resolve(false);
    if (!this.hasService("deye_energy", "init_manual_schedule_from_tou")) return Promise.resolve(false);
    this._manualScheduleAutoLoadAttempted = true;
    return this.runManualScheduleService("init_manual_schedule_from_tou", {}, "");
  }

  manualScheduleIsActive() {
    return Boolean(this._manualScheduleActive || this.manualScheduleBackend().active);
  }

  manualScheduleFields() {
    return ["enabled", "mode", "sell_power", "charge_enabled", "battery_charge_enabled", "minimum_sell_soc"];
  }

  manualScheduleDefaults() {
    const profile = this.normalProfileStoredValues() || {};
    const number = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      enabled: true,
      mode: "Normal Operation",
      sell_power: number(profile.sell_power, 0),
      minimum_sell_soc: 0,
      charge_enabled: false,
      battery_charge_enabled: false,
    };
  }

  normalizeManualScheduleRow(row) {
    const defaults = this.manualScheduleDefaults();
    const source = row && typeof row === "object" ? row : {};
    const normalized = {
      from: String(source.from ?? "00:00").slice(0, 5),
      to: String(source.to ?? "00:00").slice(0, 5),
    };
    this.manualScheduleFields().forEach((field) => {
      const value = source[field] === undefined ? defaults[field] : source[field];
      normalized[field] = this.normalizeSlotEditValue(field, value);
    });
    normalized.mode = this.normalizeManagerMode(normalized.mode || "Normal Operation");
    return normalized;
  }

  applyManualScheduleState(state) {
    const source = state && typeof state === "object" ? state : {};
    const rows = Array.isArray(source.rows) ? source.rows : [];
    this._manualScheduleDraft = rows.map((row) => this.normalizeManualScheduleRow(row));
    this._manualScheduleActive = Boolean(source.active);
  }

  ensureManualScheduleDraft() {
    if (Array.isArray(this._manualScheduleDraft)) return this._manualScheduleDraft;
    this.applyManualScheduleState(this.manualScheduleBackend());
    return this._manualScheduleDraft;
  }

  updateManualScheduleField(index, field, value) {
    const rows = this.ensureManualScheduleDraft();
    const row = rows[index];
    if (!row) return;
    if (field === "from" || field === "to") {
      row[field] = String(value || "").slice(0, 5);
    } else {
      row[field] = this.normalizeSlotEditValue(field, value);
    }
    if (field === "mode") {
      row.enabled = true;
      row.mode = this.normalizeManagerMode(row.mode);
    }
    this._manualScheduleError = "";
    this._manualScheduleStatus = "";
  }

  addManualScheduleRow() {
    const rows = this.ensureManualScheduleDraft();
    if (!rows.length) {
      rows.push({ ...this.manualScheduleDefaults(), from: "00:00", to: "00:00" });
      this._manualScheduleError = "";
      this._manualScheduleStatus = "";
      return;
    }
    const last = rows[rows.length - 1];
    const start = this.minutesFromClock(last?.from);
    const end = String(last?.to) === "00:00" ? 1440 : this.minutesFromClock(last?.to);
    if (start === null || end === null || end - start < 2) {
      this._manualScheduleError = "The last row needs at least two minutes before it can be split.";
      this._manualScheduleStatus = "";
      return;
    }
    const middle = start + Math.floor((end - start) / 2);
    const newRow = { ...last, from: this.clockFromMinutes(middle), to: "00:00" };
    last.to = this.clockFromMinutes(middle);
    rows.push(newRow);
    this._manualScheduleError = "";
    this._manualScheduleStatus = "";
  }

  toggleManualScheduleRowEdit(index) {
    if (!this._manualScheduleEditing) this._manualScheduleEditing = new Set();
    if (this._manualScheduleEditing.has(index)) this._manualScheduleEditing.delete(index);
    else this._manualScheduleEditing.add(index);
  }

  clearManualScheduleRowEdits() {
    this._manualScheduleEditing = new Set();
  }

  removeManualScheduleRow(index) {
    const rows = this.ensureManualScheduleDraft();
    if (rows.length <= 1 || !rows[index]) return;
    const removed = rows[index];
    if (index === 0) {
      rows[1].from = removed.from;
    } else {
      rows[index - 1].to = removed.to;
    }
    rows.splice(index, 1);
    if (this._manualScheduleEditing?.has(index)) this._manualScheduleEditing.delete(index);
    if (this._manualScheduleEditing) {
      this._manualScheduleEditing = new Set(
        [...this._manualScheduleEditing].map((editingIndex) => (editingIndex > index ? editingIndex - 1 : editingIndex)),
      );
    }
    this._manualScheduleError = "";
    this._manualScheduleStatus = "";
  }

  validateManualScheduleRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return "Add at least one manual schedule row.";
    const times = rows.map((row, index) => {
      const start = this.minutesFromClock(row.from);
      const rawEnd = String(row.to ?? "").trim();
      const end = index === rows.length - 1 && rawEnd === "00:00"
        ? 1440
        : (rawEnd === "24:00" ? 1440 : this.minutesFromClock(rawEnd));
      return { start, end };
    });
    if (times.some((item) => item.start === null || item.end === null)) {
      return "All From and To times must be valid whole-minute HH:MM times.";
    }
    if (times[0].start !== 0) return "The first row must start at 00:00.";
    if (times[times.length - 1].end !== 1440) return "The last row must end at 00:00.";
    for (let index = 0; index < rows.length; index += 1) {
      const { start, end } = times[index];
      if (index < rows.length - 1 && end === 1440) return "Only the last row may end at 00:00.";
      if (end <= start) return `Row ${index + 1} must be at least 1 minute long.`;
      if (index > 0 && start !== times[index - 1].end) {
        return start < times[index - 1].end
          ? "Manual schedule rows must not overlap."
          : "Manual schedule must cover the full 24 hours without gaps.";
      }
    }
    const limits = {
      sell_power: [0, 100000],
      minimum_sell_soc: [0, 100],
    };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const mode = this.normalizeManagerMode(row.mode);
      if (!["Normal Operation","Selling","Charging"].includes(mode)) return `Row ${index + 1}: select a valid mode.`;
      for (const [field, [minimum, maximum]] of Object.entries(limits)) {
        const value = Number(row[field]);
        if (!Number.isFinite(value) || value < minimum || value > maximum) {
          return `Row ${index + 1}: ${field} must be between ${minimum} and ${maximum}.`;
        }
      }
    }
    return "";
  }

  manualSchedulePayloadRows(rows) {
    return rows.map((row) => {
      const mode = this.normalizeManagerMode(row.mode);
      const numeric = (field) => {
        const value = Number(row[field]);
        return Number.isFinite(value) ? value : 0;
      };
      return {
        from: String(row.from ?? "00:00").slice(0, 5),
        to: String(row.to ?? "00:00").slice(0, 5),
        enabled: Boolean(row.enabled),
        mode,
        sell_power: numeric("sell_power"),
        minimum_sell_soc: numeric("minimum_sell_soc"),
        charge_enabled: Boolean(row.charge_enabled),
        battery_charge_enabled: Boolean(row.battery_charge_enabled),
      };
    });
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

  async runManualScheduleService(service, data, successMessage, clearEditsOnSuccess = false) {
    if (this._manualScheduleSaving) return false;
    if (!this.hasService("deye_energy", service)) {
      this._manualScheduleError = `The ${service} service is unavailable. Reload the integration after installing the new version.`;
      this._manualScheduleStatus = "";
      this.render();
      return false;
    }
    this._manualScheduleSaving = true;
    this._manualScheduleError = "";
    this._manualScheduleStatus = "";
    this.beginSave();
    this.render();
    try {
      const response = await this.callServiceWithResponse("deye_energy", service, data || {});
      if (response && typeof response === "object" && (Array.isArray(response.rows) || "active" in response)) {
        this.applyManualScheduleState(response);
      } else {
        this.applyManualScheduleState(this.manualScheduleBackend());
      }
      if (clearEditsOnSuccess) this.clearManualScheduleRowEdits();
      this._manualScheduleStatus = successMessage;
      this.finishSave();
      return true;
    } catch (error) {
      this._manualScheduleError = error?.message || `Could not run ${service}.`;
      this._manualScheduleStatus = "";
      this.failSave("manual_schedule", error);
      return false;
    } finally {
      this._manualScheduleSaving = false;
      this.render();
    }
  }

  async saveManualSchedule() {
    const rows = this.ensureManualScheduleDraft();
    const error = this.validateManualScheduleRows(rows);
    if (error) {
      this._manualScheduleError = error;
      this._manualScheduleStatus = "";
      this.render();
      return false;
    }
    return this.runManualScheduleService(
      "save_manual_schedule",
      { data: JSON.stringify(this.manualSchedulePayloadRows(rows)) },
      this._manualScheduleActive
        ? "Manual schedule saved and re-applied to the six physical TOU ranges."
        : "Manual schedule saved. Activate it to override the six physical TOU ranges.",
      true,
    );
  }

  async activateManualSchedule() {
    const rows = this.ensureManualScheduleDraft();
    const error = this.validateManualScheduleRows(rows);
    if (error) {
      this._manualScheduleError = error;
      this._manualScheduleStatus = "";
      this.render();
      return false;
    }
    if (!this._manualScheduleSaving) {
      const saved = await this.runManualScheduleService(
        "save_manual_schedule",
        { data: JSON.stringify(this.manualSchedulePayloadRows(rows)) },
        "",
      );
      if (!saved) return false;
    }
    return this.runManualScheduleService(
      "activate_manual_schedule",
      {},
      "Manual schedule activated. Its rows override the six physical TOU ranges until deactivated.",
    );
  }

  async deactivateManualSchedule() {
    return this.runManualScheduleService(
      "deactivate_manual_schedule",
      {},
      "Manual schedule deactivated. The physical TOU ranges are active again.",
    );
  }

  renderScheduleTabs(manualPanel, touPanel = "") {
    const tab = ["manual", "tou"].includes(this._scheduleTab) ? this._scheduleTab : "manual";
    const scheduleTabButton = (key, label) => `<button type="button" class="${tab === key ? "active" : ""}" data-schedule-tab="${key}">${label}</button>`;
    const panel = (key, content) => `<div class="schedule-tab-panel" data-schedule-panel="${key}" ${tab === key ? "" : "hidden"}>${content}</div>`;
    const sourceBanner = this.manualScheduleIsActive()
      ? `<div class="good schedule-source-banner" data-schedule-source-banner>Manual schedule is active — its rows override the six physical TOU ranges. Use Disable here to return to the physical TOU ranges.</div>`
      : "";
    return `<section class="schedule-shell">
      <div class="schedule-tabs">${scheduleTabButton("manual", "Manual schedule")}${touPanel ? scheduleTabButton("tou", "Deye Time Of Use") : ""}</div>
      ${sourceBanner}
      ${panel("manual", manualPanel)}
      ${touPanel ? panel("tou", touPanel) : ""}
    </section>`;
  }

  renderManualScheduleRow(row, index, rows, modeOptions) {
    const mode = this.normalizeManagerMode(row.mode);
    const isSelling = mode === "Selling";
    const editing = Boolean(this._manualScheduleEditing?.has(index));
    const from = this.escapeHtml(String(row.from || "00:00").slice(0, 5));
    const to = this.escapeHtml(String(row.to || "00:00").slice(0, 5));
    const timeCell = (name, fixed, value) => {
      if (fixed) return "<span>00:00</span>";
      if (!editing) return `<span>${value}</span>`;
      return `<input type="time" step="60" data-manual-field="${name}" data-manual-index="${index}" value="${value}">`;
    };
    const numberControl = (name, minimum, maximum, step = "1") => `<input type="number" min="${minimum}" max="${maximum}" step="${step}" data-manual-field="${name}" data-manual-index="${index}" value="${this.escapeHtml(row[name] === null || row[name] === undefined ? "" : String(row[name]))}">`;
    const selectControl = (name, options) => {
      const current = String(row[name] ?? "");
      return `<select data-manual-field="${name}" data-manual-index="${index}">${options.map(([value, label]) => `<option value="${this.escapeHtml(value)}" ${String(value) === current ? "selected" : ""}>${this.escapeHtml(label)}</option>`).join("")}</select>`;
    };
    const sellPower = this.escapeHtml(String(row.sell_power ?? 0));
    const soc = this.escapeHtml(String(row.minimum_sell_soc ?? 0));
    const current = index === this.manualScheduleCurrentRowIndex(rows);
    const rowClass = [editing ? "editing" : "", current ? "time-current" : "", row.enabled ? "enabled" : "disabled"].filter(Boolean).join(" ");
    return `<tr class="${rowClass}" data-manual-row="${index}">
      <td data-label="From" class="time-col">${timeCell("from", index === 0, from)}</td>
      <td data-label="To" class="time-col">${timeCell("to", index === rows.length - 1, to)}</td>
      <td data-label="Mode">${editing ? selectControl("mode", modeOptions) : this.modePill(mode, row.enabled)}</td>
      <td data-label="Sell power" class="metric sell">${editing ? numberControl("sell_power", 0, 100000) : row.enabled ? `${this.iconSvg("sell")} ${sellPower} W` : "-"}</td>
      <td data-label="Grid charging" class="metric grid">${editing ? selectControl("charge_enabled", [["false", "No"], ["true", "Yes"]]) : `<span class="pill ${row.charge_enabled ? "on" : "off"}">${row.charge_enabled ? "yes" : "no"}</span>`}</td>
      <td data-label="Battery charge" class="metric battery-charge">${editing ? selectControl("battery_charge_enabled", [["false", "No"], ["true", "Yes"]]) : `<span class="pill ${row.battery_charge_enabled ? "on" : "off"}">${row.battery_charge_enabled ? "yes" : "no"}</span>`}</td>
      <td data-label="Stop selling at SOC" class="metric soc">${!isSelling ? "-" : editing ? numberControl("minimum_sell_soc", 0, 100) : `◇ ${soc}%`}</td>
      <td data-label="Active">${editing ? `<input type="checkbox" data-manual-field="enabled" data-manual-index="${index}" ${row.enabled ? "checked" : ""}>` : `<span class="pill ${row.enabled ? "on" : "off"}">${row.enabled ? "ON" : "OFF"}</span>`}</td>
      <td data-label="Action"><div class="manual-action-cell">
        <button type="button" class="icon-only ${editing ? "active" : ""}" data-manual-edit="${index}" title="${editing ? "Finish editing row" : "Edit row"}">${this.iconSvg("edit")}</button>
        <button type="button" class="icon-only remove" data-manual-remove="${index}" title="Remove row" ${rows.length <= 1 || this._manualScheduleSaving ? "disabled" : ""}>${this.iconSvg("remove")}</button>
      </div></td>
    </tr>`;
  }

  renderManualScheduleTab() {
    const rows = this.ensureManualScheduleDraft();
    const active = this.manualScheduleIsActive();
    const validationError = this.validateManualScheduleRows(rows);
    const modeOptions = this.slotModeOptions();
    const rowHtml = rows.map((row, index) => this.renderManualScheduleRow(row, index, rows, modeOptions)).join("");
    const message = this._manualScheduleError
      ? `<div class="bad" data-manual-schedule-error>${this.escapeHtml(this._manualScheduleError)}</div>`
      : this._manualScheduleStatus
        ? `<div class="good" data-manual-schedule-status>${this.escapeHtml(this._manualScheduleStatus)}</div>`
        : "";
    const validation = validationError
      ? `<div class="bad" data-manual-schedule-validation>${this.escapeHtml(validationError)}</div>`
      : '<div class="good" data-manual-schedule-validation>All rows cover the full 24 hours.</div>';
    const toggle = active
      ? `<button type="button" class="tool-btn active" data-manual-deactivate="1" ${this._manualScheduleSaving ? "disabled" : ""}>Manual schedule — Disable</button>`
      : `<button type="button" class="tool-btn" data-manual-activate="1" ${this._manualScheduleSaving ? "disabled" : ""}>Manual schedule — Enable</button>`;
    const control = this.controlState();
    const controlButton = `<button class="tool-btn ${control.enabled ? "active" : ""}" data-control-toggle="1" ${control.pending ? "disabled" : ""}>Deye control — ${this.escapeHtml(control.status)}</button>`;
    const settingsButton = `<button class="gear-btn" data-open-settings="1" title="Settings">${this.iconSvg("gear")}</button>`;
    return `<div class="schedule-head manual-panel-head">
        <div class="schedule-title">
          <h2>Manual schedule</h2>
          <p>Define time ranges for each row. The six physical TOU ranges are the baseline; these manual rows override them while the manual schedule is enabled.</p>
        </div>
        <div class="schedule-tools">${toggle}${controlButton}${settingsButton}</div>
      </div>
      <div class="schedule-table-card">
        <table class="schedule-table manual-schedule-table">
          <colgroup><col class="col-time"><col class="col-time"><col class="col-mode"><col class="col-power"><col class="col-grid"><col class="col-battery-charge"><col class="col-soc"><col class="col-active"><col class="col-action"></colgroup>
          <thead><tr><th class="time-col">From</th><th class="time-col">To</th><th>Mode</th><th>Sell power</th><th>Grid charging</th><th>Battery charge</th><th>Stop selling at SOC</th><th>Active</th><th>Action</th></tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
      <div class="manual-row-actions">
        <button type="button" data-manual-add="1" ${this._manualScheduleSaving ? "disabled" : ""}>Add row</button>
      </div>
      ${validation}
      <div class="foot-actions manual-save-actions">
        <button type="button" class="primary" data-manual-save="1" ${this._manualScheduleSaving ? "disabled" : ""}>${this._manualScheduleSaving ? "Saving…" : active ? "Save and re-apply" : "Save manual schedule"}</button>
      </div>
      ${message}`;
  }

  touGridLabel(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["on", "grid", "allow grid", "both"].includes(normalized)) return "yes";
    if (["off", "disabled", "no grid or gen"].includes(normalized)) return "no";
    return value ? String(value) : "missing";
  }

  renderTouReverseSyncSummary() {
    const reverse = this.touReverseSyncDiagnostics();
    const changed = Array.isArray(reverse.reverse_sync_changed_hours)
      ? reverse.reverse_sync_changed_hours.join(", ")
      : "";
    const roundTrip = reverse.reverse_sync_round_trip_ok === true
      ? "Match"
      : reverse.reverse_sync_round_trip_ok === false ? "Mismatch" : "No data";
    const error = reverse.reverse_sync_last_error && reverse.reverse_sync_last_error !== "none"
      ? `<div class="bad">${this.escapeHtml(String(reverse.reverse_sync_last_error))}</div>`
      : "";
    return `<div class="hint tou-reverse-sync" data-tou-reverse-sync>
      <div>Schedule synchronisation: <strong>${this.touReverseStatusLabel(reverse.reverse_sync_status)}</strong></div>
      <div>Changed hours: <strong>${changed || "None"}</strong></div>
      <div>Round-trip: <strong>${roundTrip}</strong></div>${error}
    </div>`;
  }

  renderTouSettingsContent() {
    const editing = Boolean(this._mappingEditing);
    const backendPlan = this.mappingPlanDiagnostics();
    const rows = editing ? this.ensureMappingDraft() : this.mappingRowsFromDiagnostics();
    const boundaryField = (row, field) => (field === "start" && Number(row.slot) === 1)
      || (field === "end" && Number(row.slot) === rows.length);
    const editableFields = ["start", "end", "soc", "mode", "charge", "sell", "power", "voltage", "grid_charge"];
    const canEdit = rows.some((row) => editableFields
      .some((field) => !boundaryField(row, field) && this.mappingFieldWritable(row.slot, field)));
    const optionsFor = (slot, field, fallback) => {
      const entityId = this.mappingEntityId(slot, field);
      const options = this._hass?.states?.[entityId]?.attributes?.options;
      return Array.isArray(options) && options.length ? options.map((value) => String(value)) : fallback;
    };
    const selectCell = (slot, field, value, fallback, labelFor = (v) => v) => {
      if (!editing || !this.mappingFieldWritable(slot, field)) {
        const text = value === null || value === undefined || value === "" ? "Unavailable" : labelFor(String(value));
        return `<span>${this.escapeHtml(text)}</span>`;
      }
      const options = optionsFor(slot, field, fallback);
      const current = value === null || value === undefined ? "" : String(value);
      const selectedValue = options.includes(current) ? current : (options[0] ?? "");
      return `<select data-mapping-field="${field}" data-mapping-slot="${slot}">${options.map((option) => `<option value="${this.escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${this.escapeHtml(labelFor(option))}</option>`).join("")}</select>`;
    };
    const rowHtml = rows.map((row) => {
      const timeCell = (field) => {
        if (editing && !boundaryField(row, field) && this.mappingFieldWritable(row.slot, field)) {
          return `<input type="time" step="60" data-mapping-field="${field}" data-mapping-slot="${row.slot}" value="${this.escapeHtml(this.normalizeMappingClock(row[field]))}">`;
        }
        return `<span>${this.escapeHtml(this.normalizeMappingClock(row[field]))}</span>`;
      };
      const socCell = (editing && this.mappingFieldWritable(row.slot, "soc"))
        ? `<input type="number" min="0" max="100" step="1" data-mapping-field="soc" data-mapping-slot="${row.slot}" value="${this.escapeHtml(String(row.soc ?? ""))}">`
        : `<span>${row.soc === null || row.soc === undefined ? "Unavailable" : `${this.escapeHtml(String(row.soc))}%`}</span>`;
      const modeCell = selectCell(row.slot, "mode", row.mode, ["None", "General", "Backup", "Charge"]);
      const chargeCell = selectCell(row.slot, "charge", row.charge, ["No Grid or Gen", "Allow Grid", "Allow Gen", "Allow Grid & Gen"]);
      const sellCell = (editing && this.mappingFieldWritable(row.slot, "sell"))
        ? `<select data-mapping-field="sell" data-mapping-slot="${row.slot}"><option value="off" ${row.sell ? "" : "selected"}>No</option><option value="on" ${row.sell ? "selected" : ""}>Yes</option></select>`
        : `<span>${row.sell === null || row.sell === undefined ? "Unavailable" : (row.sell ? "Yes" : "No")}</span>`;
      const numberCell = (field, step = "1") => {
        const value = row[field];
        if (!editing || !this.mappingFieldWritable(row.slot, field)) {
          return `<span>${value === null || value === undefined || value === "" ? "Unavailable" : this.escapeHtml(String(value))}</span>`;
        }
        const entityId = this.mappingEntityId(row.slot, field);
        const attrs = this._hass?.states?.[entityId]?.attributes || {};
        const min = Number.isFinite(Number(attrs.min)) ? Number(attrs.min) : 0;
        const max = Number.isFinite(Number(attrs.max)) ? Number(attrs.max) : "";
        const stepAttr = Number.isFinite(Number(attrs.step)) ? Number(attrs.step) : step;
        return `<input type="number" min="${this.escapeHtml(String(min))}" ${max === "" ? "" : `max="${this.escapeHtml(String(max))}"`} step="${this.escapeHtml(String(stepAttr))}" data-mapping-field="${field}" data-mapping-slot="${row.slot}" value="${this.escapeHtml(value === null || value === undefined ? "" : String(value))}">`;
      };
      return `<tr><td>${row.slot}</td><td>${timeCell("start")}</td><td>${timeCell("end")}</td><td>${modeCell}</td><td>${chargeCell}</td><td>${sellCell}</td><td>${numberCell("power")}</td><td>${numberCell("voltage")}</td><td>${socCell}</td></tr>`;
    }).join("");
    const message = this._mappingSaveError
      ? `<div class="bad" data-mapping-error>${this.escapeHtml(this._mappingSaveError)}</div>`
      : this._mappingStatus
        ? `<div class="good" data-mapping-status>${this.escapeHtml(this._mappingStatus)}</div>`
        : "";
    const readOnlyHint = (!canEdit && !editing) ? `<div class="hint">This provider exposes Deye Time Of Use as read-only; the table cannot be edited.</div>` : "";
    const blockedHint = this.touControlBlocked() ? `<div class="hint">Deye control is disabled.</div>` : "";
    const pendingHint = this.touWritePending() ? `<div class="hint">Saving Deye Time Of Use</div>` : "";
    const hint = editing
      ? `<div class="hint">${this.mapWarning()}. Edit the six rows below. The first From and last To are fixed at 00:00; each To follows the next row's From. Save validates that the day starts at 00:00, ends at 00:00 and has no gaps or overlaps.</div>`
      : `<div class="hint">Values are loaded from the inverter. ${this.mapWarning()}. Use Edit to change TOU slots.</div>`;
    const header = `<div class="schedule-head tou-panel-head">
        <div class="schedule-title">
          <h2>Deye Time Of Use</h2>
          <p>Six physical inverter ranges covering the full 24 hours.</p>
        </div>
        <div class="schedule-tools">${editing
          ? `<button type="button" class="tool-btn" data-cancel-mapping="1" ${this._mappingSaving ? "disabled" : ""}>Cancel</button>`
          : `<button type="button" class="tool-btn" data-refresh-mapping="1" ${this._mappingSaving ? "disabled" : ""}>${this._mappingSaving ? "Reading…" : "Refresh"}</button>
             <button type="button" class="tool-btn active" data-edit-mapping="1" ${canEdit && !this._mappingSaving && !this.touWritePending() ? "" : "disabled"}>Edit</button>`}</div>
      </div>`;
    const footer = editing
      ? `<div class="foot-actions tou-save-actions">
          <button type="button" class="primary" data-save-mapping="1" ${canEdit && !this._mappingSaving ? "" : "disabled"}>${this._mappingSaving ? "Saving…" : "Save"}</button>
        </div>`
      : "";
    return `${header}
      ${hint}
      ${readOnlyHint}${blockedHint}${pendingHint}
      <div class="hint">Operation status: <strong>${this.touOperationStatusLabel()}</strong></div>
      <div class="schedule-table-card"><table class="schedule-table mapping-table" data-tou-capabilities-table><thead><tr><th>Slot</th><th>From</th><th>To</th><th>Mode</th><th>Charge</th><th>Sell</th><th>Power</th><th>Voltage</th><th>SOC</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
      ${this.renderTouReverseSyncSummary()}
      ${footer}
      ${message}`;
  }

  stat(label, value, cls = "", liveKey = "", icon = "") {
    const liveCard = liveKey ? ` data-live-card="${liveKey}"` : "";
    const liveValue = liveKey ? ` data-live="${liveKey}"` : "";
    return `<div class="stat ${cls}"${liveCard}>${icon ? `<i class="stat-icon">${this.iconSvg(icon)}</i>` : ""}<div class="stat-copy"><span>${label}</span><strong${liveValue}>${value}</strong></div></div>`;
  }

  row(label, value, cls = "") {
    return `<div class="row ${cls}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  readMode(rawStatus) {
    const status = String(rawStatus || "").toUpperCase();
    if (status.includes("SELL BLOCKED")) return ["Selling stopped", "warn"];
    if (status.includes("GRID CHARGE")) return ["Grid charging per schedule", "charge"];
    if (status.includes("PV CHARGE")) return ["PV charging per schedule", "charge"];
    if (status.includes("EMERGENCY")) return ["Emergency stopped", "bad"];
    if (status.includes("MAPPING ERROR")) return ["Deye mapping error", "bad"];
    if (status.includes("SCHEDULE APPLY ERROR")) return ["The current slot was not applied", "bad"];
    if (status.includes("NO DATA")) return ["No control data", "warn"];
    if (status.includes("DEFAULT")) return ["Default settings", "warn"];
    if (status.includes("PROTECT")) return ["Battery protection", "warn"];
    if (status.includes("SCHEDULER OFF")) return ["Schedule disabled", "neutral"];
    if (status.includes("SLOT DISABLED")) return ["Slot disabled - defaults", "warn"];
    if (status.includes("GRID CHARGE")) return ["Grid charging", "charge"];
    if (status.includes("SELLING ACTIVE")) return ["Selling per schedule", "good"];
    if (status.includes("ZERO EXPORT CT")) return ["Normal Operation", "ct"];
    if (status.includes("ZERO EXPORT LOAD")) return ["Normal Operation", "zero"];
    if (status.includes("SCHEDULE")) return ["Schedule active", "good"];
    if (status.includes("MANUAL")) return ["Manual selling", "good"];
    if (status.includes("CHARGE")) return ["Manual charging", "charge"];
    if (status.includes("STOP")) return ["Stopped - default settings", "bad"];
    if (status.includes("SOC")) return ["Selling blocked by SOC", "warn"];
    if (status.includes("PRICE")) return ["Selling blocked by price", "warn"];
    if (status.includes("WAITING")) return ["Waiting for a decision", "neutral"];
    if (status.includes("IDLE")) return ["Idle", ""];
    if (!rawStatus || rawStatus === "missing") return ["No data", "warn"];
    return [rawStatus, ""];
  }

  formatAppliedAt(value) {
    if (!value || value === "missing" || value === "never") return "Not applied yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  clockFromMinutes(minutes) {
    const value = ((Number(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  async restoreDefaults() {
    return this.applyDefaultValues();
  }

  async resumeManager() {
    if (this._resumeApplying) return false;
    this._resumeApplying = true;
    this._defaultsStatus = "saving";
    this._defaultsMessage = "Enabling Manager and schedule\u2026";
    this.beginSave();
    this.render();
    try {
      if (!this.hasService("deye_energy", "resume_manager")) throw new Error("The deye_energy.resume_manager service is unavailable");
      await this.callService("deye_energy", "resume_manager", {});
      this._defaultsStatus = "saved";
      this._defaultsMessage = "Manager and schedule enabled";
      this._saveMessage = this._defaultsMessage;
      this.finishSave();
      return true;
    } catch (error) {
      this._defaultsStatus = "error";
      this._defaultsMessage = `Could not enable the Manager: ${error?.message || "missing Home Assistant confirmation"}`;
      this.failSave("resume_manager", error);
      return false;
    } finally {
      this._resumeApplying = false;
      if (this.isConnected) this.render();
    }
  }

  async applyDefaultValues() {
    if (this._defaultsApplying) return false;
    this._defaultsApplying = true;
    this._defaultsStatus = "saving";
    this._defaultsMessage = "Applying default settings…";
    this.beginSave();
    this._saveMessage = this._defaultsMessage;
    this.updateSaveIndicator();
    this.updateDefaultApplyState();
    try {
      if (!this.hasService("deye_energy", "restore_defaults")) {
        throw new Error("The deye_energy.restore_defaults service is unavailable");
      }
      await this.callService("deye_energy", "restore_defaults", {});
      this._defaultsStatus = "saved";
      this._defaultsMessage = "Default settings applied";
      this._saveMessage = this._defaultsMessage;
      this.finishSave();
      return true;
    } catch (error) {
      this._defaultsStatus = "error";
      this._defaultsMessage = `Could not confirm the complete set of default settings: ${error?.message || "missing Home Assistant confirmation"}`;
      this.failSave("restore_defaults", error);
      this._saveMessage = this._defaultsMessage;
      this.updateSaveIndicator();
      return false;
    } finally {
      this._defaultsApplying = false;
      this.updateDefaultApplyState();
    }
  }

  normalizeManagerMode(value) {
    const raw = value === null || value === undefined ? "" : String(value).trim();
    return ({
      "Selling First": "Selling",
      Sell: "Selling",
      "Selling": "Selling",
      Charge: "Charging",
      "Charging": "Charging",
      normal: "Normal Operation",
      "Normal Operation": "Normal Operation",
      "Zero Export To Load": "Normal Operation",
      "Zero Export To CT": "Normal Operation",
      "Zero Export": "Normal Operation",
      Essentials: "Normal Operation",
    })[raw] || raw;
  }

  slotModeLabel(mode) {
    return this.normalizeManagerMode(mode);
  }

  slotModeOptions() {
    return [
      ["Normal Operation", "Normal Operation"],
      ["Selling", "Selling"],
      ["Charging", "Charging"],
    ];
  }

  modeMeta(mode, enabled = true) {
    if (!enabled) {
      return { cls: "disabled", title: "Disabled", subtitle: "Slot inactive", icon: "shield" };
    }
    const normalized = this.normalizeManagerMode(mode);
    if (normalized === "Selling") {
      return { cls: "selling", title: "Selling", subtitle: "Selling priority", icon: "sell" };
    }
    if (normalized === "Normal Operation") {
      return { cls: "normal", title: "Normal Operation", subtitle: "Normal operation mode", icon: "normal" };
    }
    if (normalized === "Charging") {
      return { cls: "charge", title: "Charging", subtitle: "Grid charging", icon: "charge" };
    }
    return { cls: "disabled", title: "No data", subtitle: "Unknown operation mode", icon: "shield" };
  }

  modeTextClass(text) {
    const normalized = this.norm(text);
    if (normalized.includes("selling")) return "selling";
    if (normalized.includes("normal") || normalized.includes("zeroexport") || normalized.includes("ct") || normalized.includes("load")) return "normal";
    if (normalized.includes("adowan") || normalized.includes("charge")) return "charge";
    if (normalized.includes("disabled") || normalized.includes("idle") || normalized.includes("no data")) return "disabled";
    return "";
  }

  batteryLevelSvg(soc) {
    const value = this.optionalSocNumber(soc);
    if (value === null) {
      return '<svg viewBox="0 0 64 64" role="img" aria-label="Battery level unknown"><rect x="18" y="4" width="28" height="6" rx="2" fill="#64748b" stroke="#94a3b8" stroke-width="2"/><rect x="10" y="9" width="44" height="51" rx="6" fill="rgba(6,19,29,.55)" stroke="#94a3b8" stroke-width="3"/><rect x="15" y="15" width="34" height="39" rx="3" fill="rgba(148,163,184,.10)"/><path d="M15 25h34M15 35h34M15 45h34" stroke="rgba(148,163,184,.20)" stroke-width="1"/></svg>';
    }
    const level = Math.max(0, Math.min(100, value));
    const hue = level < 25
      ? 0
      : level < 40
        ? Math.round(((level - 25) / 15) * 60)
        : level <= 70
          ? Math.round(60 + ((level - 40) / 30) * 60)
          : 120;
    const color = `hsl(${hue}, 85%, 55%)`;
    const fillHeight = Math.round(39 * level / 100);
    const fillY = 54 - fillHeight;
    return `<svg viewBox="0 0 64 64" role="img" aria-label="Battery ${Math.round(level)} percent"><rect x="18" y="4" width="28" height="6" rx="2" fill="${color}" stroke="${color}" stroke-width="2"/><rect x="10" y="9" width="44" height="51" rx="6" fill="rgba(6,19,29,.55)" stroke="${color}" stroke-width="3"/><rect x="15" y="15" width="34" height="39" rx="3" fill="rgba(255,255,255,.05)"/><rect x="15" y="${fillY}" width="34" height="${fillHeight}" rx="3" fill="${color}" fill-opacity=".9"/><path d="M15 25h34M15 35h34M15 45h34" stroke="rgba(6,19,29,.35)" stroke-width="1"/></svg>`;
  }

  iconSvg(type) {
    const icons = {
      sell: '<svg viewBox="0 0 24 24"><path d="M4 14h4l2-6 4 12 2-6h4"/><path d="M4 18h16"/></svg>',
      charge: '<svg viewBox="0 0 24 24"><path d="M13 2 5 13h6l-1 9 8-12h-6z"/></svg>',
      shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="M9 12l2 2 4-5"/></svg>',
      normal: '<svg viewBox="0 0 24 24"><path d="M3 12h2v7h14v-7h2"/><path d="M5 10l7-7 7 7"/><path d="M9 21v-6h6v6"/><path d="M12 3v4"/></svg>',
      edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 6l4 4"/></svg>',
      remove: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
      gear: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4"/></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>',
      close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>',
      money: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .9-3 2s1 1.8 3 2.2 3 1.1 3 2.3-1.3 2-3 2c-1.3 0-2.5-.4-3.3-1.2M12 5v14"/></svg>',
      calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h.01m4 0h.01m4 0h.01M8 18h.01m4 0h.01"/></svg>',
    };
    return icons[type] || icons.gear;
  }

  modePill(mode, enabled) {
    const meta = this.modeMeta(mode, enabled);
    return `<span class="mode-pill ${meta.cls}">${meta.title}</span>`;
  }

  mapWarning() {
    const count = this.mappingSegmentCount();
    const capability = this.fullTouCapability();
    if (capability.ok !== true) {
      return `<span class="bad">No complete Deye Time Of Use mapping</span>`;
    }
    if (count === 6) return `<span class="good">OK: 6/6 Deye ranges</span>`;
    if (count > 6) return `<span class="bad">Too many changes: ${count}/6 Deye ranges</span>`;
    return `<span class="bad">Incomplete mapping: ${count}/6 Deye ranges</span>`;
  }

  renderDialog() {
    if (!this._dialog) return "";

    if (this._dialog.type === "settings") {
      const tab = this._settingsTab || "tariff";
      const tabButton = (key, label) => `<button class="${tab === key ? "active" : ""}" data-settings-tab="${key}">${label}</button>`;
      let body = "";
      if (tab === "tariff") {
        body = this.renderTariffTab();
      } else if (tab === "system") {
        body = this.renderDiagnostics();
      }

      return `<div class="overlay" data-close-dialog="1">
        <section class="dialog settings-dialog" data-dialog-box="1">
          <div class="dialog-head"><strong>Settings and diagnostics</strong><button type="button" data-close-dialog="1">${this.iconSvg("close")}</button></div>
          <div class="settings-layout">
            <nav class="settings-nav">
              ${tabButton("tariff", "Tariff and distribution")}
              ${tabButton("system", "System and diagnostics")}
            </nav>
            <div class="settings-content">${body}</div>
          </div>
        </section>
      </div>`;
    }
    return "";
  }

  renderV073() {
    if (!this._hass) return;
    this._pendingRender = false;
    this.captureScrollPositions();

    const sellPriceToday = this.entity("sensor", ["sell_price_today", "energy_price"]);
    const sellPriceTomorrow = this.entity("sensor", "sell_price_tomorrow");
    const buyPriceToday = this.entity("sensor", "buy_price_today");
    const buyPriceTomorrow = this.entity("sensor", "buy_price_tomorrow");
    const solcastPower = this.entity("sensor", "solcast_current_power");
    const solcastToday = this.entity("sensor", "solcast_forecast_today");
    const solcastTomorrow = this.entity("sensor", "solcast_forecast_tomorrow");
    const solcastDay3 = this.entity("sensor", "solcast_forecast_day_3");
    const solcastDay4 = this.entity("sensor", "solcast_forecast_day_4");
    const solcastDay5 = this.entity("sensor", "solcast_forecast_day_5");
    const solcastDay6 = this.entity("sensor", "solcast_forecast_day_6");
    const solcastDay7 = this.entity("sensor", "solcast_forecast_day_7");
    const solcastPeakPower = this.entity("sensor", "solcast_peak_power_today");
    const solcastAccuracy = this.entity("sensor", "solcast_accuracy");
    const minSellPrice = this.entity("number", "minimum_sell_price");
    const priceThreshold = this.asNumber(this.numberState(minSellPrice, 0)) || 0;
    const solcastEntities = [solcastToday, solcastTomorrow, solcastDay3, solcastDay4, solcastDay5, solcastDay6, solcastDay7];
    const solcastAccuracyAttrs = this._hass?.states?.[solcastAccuracy]?.attributes || {};
    const solcastForecastValue = this.asNumber(solcastAccuracyAttrs.forecast_today_kwh);
    const dailyPvValue = this.asNumber(solcastAccuracyAttrs.production_today_kwh);
    const solcastDifference = this.asNumber(solcastAccuracyAttrs.forecast_difference_today_kwh);
    const realizationTodayValue = this.asNumber(solcastAccuracyAttrs.realization_today_pct);
    const historicalAccuracyValue = this.asNumber(solcastAccuracyAttrs.historical_accuracy_pct)
      ?? this.asNumber(this.state(solcastAccuracy));
    const remainingForecastValue = this.asNumber(solcastAccuracyAttrs.remaining_forecast_kwh);
    const forecastTomorrowValue = this.asNumber(solcastAccuracyAttrs.forecast_tomorrow_kwh);

    const layout = this.effectiveLayout();
    const dashStyle = [];
    dashStyle.push(layout.is_mobile ? "max-width:100%" : `max-width:${layout.dashboard_width}px`);
    dashStyle.push("min-width:0");
    dashStyle.push("box-sizing:border-box");
    if (layout.center_dashboard) dashStyle.push("margin:0 auto");
    if (layout.fit_to_width || layout.is_mobile) dashStyle.push("width:100%");
    if (layout.allow_horizontal_scroll) {
      dashStyle.push("overflow-x:auto");
    } else {
      dashStyle.push("overflow-x:hidden");
    }
    if (layout.layout_mode === "section" || layout.layout_mode === "single" || layout.layout_mode === "full" || layout.layout_mode === "fit") {
      dashStyle.push("grid-template-columns:1fr");
    } else if (layout.layout_mode === "grid" && layout.grid_columns) {
      dashStyle.push(`grid-template-columns:repeat(${layout.grid_columns},minmax(0,1fr))`);
      dashStyle.push(`gap:${layout.grid_gap}px`);
    }
    const demStyle = dashStyle.join(";");
    const infoGridStyle = layout.layout_mode === "grid"
      ? "display:contents"
      : layout.layout_mode === "single"
        ? (layout.section === "prices" && !layout.is_mobile ? "grid-template-columns:minmax(0,1fr) minmax(0,1fr)" : "grid-template-columns:minmax(0,1fr)")
        : (layout.is_mobile ? "grid-template-columns:minmax(0,1fr)" : `grid-template-columns:${layout.prices_ratio}fr ${layout.buy_prices_ratio}fr ${layout.solcast_ratio}fr`);

    const isSingle = layout.layout_mode === "single";
    const showPrices = isSingle ? layout.section === "prices" : layout.sections.prices;
    const showBuyPrices = isSingle ? layout.section === "prices" : layout.sections.prices;
    const showSolcast = isSingle ? layout.section === "solcast" : layout.sections.solcast;
    const showSchedule = isSingle ? layout.section === "schedule" : layout.sections.schedule;
    const showSales = isSingle ? layout.section === "sales_stats" : layout.sections.sales_stats;
    if (isSingle && ["settings"].includes(layout.section) && !this._dialog) {
      this._dialog = { type: layout.section };
    }

    const pricesSection = showPrices ? `
             <section class="panel price-panel">
               <h2 class="panel-title">Sell prices</h2>
               <div class="price-summary single">
                 ${this.stat("Now", `${this.formatPrice(this.state(sellPriceToday))} GBP/kWh`, "", "sell-now")}
               </div>
               ${this.priceTable(sellPriceToday, sellPriceTomorrow, priceThreshold, true, "sell-prices")}
             </section>` : "";
    const buyPricesSection = showBuyPrices ? `
             <section class="panel price-panel">
               <h2 class="panel-title">Purchase prices</h2>
               <div class="price-summary single">
                 ${this.stat("Now", `${this.formatPrice(this.state(buyPriceToday))} GBP/kWh`, "", "buy-now")}
               </div>
               ${this.priceTable(buyPriceToday, buyPriceTomorrow, 0, false, "buy-prices")}
             </section>` : "";
    const solcastSection = showSolcast ? `
             <section class="panel solcast-panel">
               <h2 class="panel-title">Solcast forecast</h2>
               <div class="solcast-summary">
                 ${this.stat("Now", this.formatPower(this.state(solcastPower)), "", "solcast-power")}
                 ${this.stat("Today", this.formatEnergy(solcastForecastValue), "", "solcast-today")}
                 ${this.stat("Remaining", this.formatEnergy(remainingForecastValue), "", "solcast-remaining")}
                 ${this.stat("Tomorrow", this.formatEnergy(forecastTomorrowValue), "", "solcast-tomorrow")}
                 ${this.stat("Peak", this.formatPower(this.state(solcastPeakPower)), "", "solcast-peak-power")}
                 ${this.stat("Best day", this.bestSolcastDay(solcastEntities), "", "solcast-best-day")}
               </div>
               <div data-live-html="solcast-days">${this.solcastDaysChart(solcastEntities)}</div>
               <div data-live-html="solcast-chart">${this.solcastChart(solcastToday, solcastTomorrow)}</div>
               <div class="solcast-performance">
                 ${this.stat("Forecast for today", this.formatEnergy(solcastForecastValue), "", "solcast-performance-forecast")}
                 ${this.stat("Actual production", this.formatEnergy(dailyPvValue), "", "solcast-performance-actual")}
                 ${this.stat("Difference", this.formatSignedEnergy(solcastDifference), "", "solcast-performance-difference")}
                 ${this.stat("Today's fulfilment", realizationTodayValue === null ? "missing" : `${realizationTodayValue.toFixed(1)} %`, "", "solcast-performance-progress")}
                 ${this.stat("Historical accuracy", historicalAccuracyValue === null ? "missing" : `${historicalAccuracyValue.toFixed(1)} %`, "", "solcast-performance-accuracy")}
               </div>
             </section>` : "";
    const infoGridSection = (showPrices || showBuyPrices || showSolcast) ? `
           <div class="info-grid" style="${infoGridStyle}">
            ${pricesSection}
            ${buyPricesSection}
            ${solcastSection}
           </div>` : "";
    const scheduleSection = showSchedule
      ? this.renderScheduleTabs(this.renderManualScheduleTab(), this.renderTouSettingsContent())
      : "";
    const salesSection = showSales ? `
           <section class="panel sales-panel"><h2 class="panel-title">${this.iconSvg("chart")} Selling statistics</h2><div data-live-html="sales-stats">${this.salesStatsPanel()}</div></section>` : "";

    this.innerHTML = `
      <ha-card class="theme-schedule-dark">
        <style>
          ha-card{--bg:#020b12;--panel:rgba(9,24,35,.92);--panel2:rgba(13,31,45,.88);--panel3:rgba(16,38,54,.72);--line:rgba(118,166,190,.22);--line2:rgba(80,169,226,.38);--text:#eef7ff;--muted:#9eb8c8;--blue:#159bff;--blue2:#0a6ad8;--green:#7ee22d;--green2:#35d66f;--purple:#bc63ff;--gold:#f6a619;--red:#ff4242;overflow:hidden;background:radial-gradient(circle at 18% 0%,rgba(26,106,164,.22),transparent 34%),linear-gradient(180deg,#020913,#06131c 54%,#050b10);color:var(--text);border:1px solid rgba(101,142,164,.32);box-shadow:0 18px 45px rgba(0,0,0,.35)}
 .dem-v073{padding:18px;display:grid;gap:16px;margin:0 auto;max-width:1280px;min-width:0;box-sizing:border-box;font-family:Roboto,Arial,sans-serif;font-size:14px}.dialog-host{position:relative}.dem-v073>*,.info-grid>*,.panel,.schedule-shell,.sales-panel{min-width:0;max-width:100%;box-sizing:border-box}
           svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
          button{font:inherit}
           .panel,.schedule-shell,.table-wrap{box-sizing:border-box;border:1px solid rgba(107,157,182,.34);border-radius:10px;background:radial-gradient(circle at 12% 8%,rgba(20,85,130,.16),transparent 32%),linear-gradient(180deg,rgba(5,16,26,.98),rgba(7,21,32,.98));box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 12px 28px rgba(0,0,0,.18)}
          .panel-title{margin:0;padding:12px 14px;background:linear-gradient(180deg,rgba(16,45,61,.92),rgba(6,20,31,.86));border-bottom:1px solid rgba(107,157,182,.24);font-size:18px;font-weight:800;color:#fff}
          .stat{border:1px solid rgba(111,154,178,.45);border-radius:7px;background:rgba(7,18,28,.74);padding:10px;min-width:0}
          .stat span{display:block;color:#a9c1d0;font-size:12px}.stat strong{display:block;margin-top:4px;color:#fff;font-size:18px;line-height:1.2}.stat.good strong,.good{color:#2dff95!important}.stat.warn strong,.warn{color:#ffd95c!important}.bad{color:#ff6b7a!important}
           .info-grid{display:grid;grid-template-columns:0.85fr 0.85fr 1.30fr;gap:14px;align-items:stretch;width:100%;box-sizing:border-box}.info-grid>.panel{height:auto;min-height:470px;display:flex;flex-direction:column;min-width:0}
          .price-summary,.solcast-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:9px}.price-summary.single{grid-template-columns:1fr}.price-summary .stat strong,.solcast-summary .stat strong{font-size:14px}
          .price-scroll{height:auto;flex:0 0 auto;min-height:0;overflow:visible;border-top:1px solid var(--line);overscroll-behavior:contain}.price-table{width:100%;border-collapse:collapse;table-layout:fixed}.price-table th,.price-table td{padding:3px 8px;border-top:1px solid var(--line);font-size:11px;line-height:14px}.price-table th{position:sticky;top:0;z-index:1;background:rgba(18,42,59,.96);color:#d8f4ff;text-align:left}.price-table tbody tr.active{background:rgba(37,105,151,.32);box-shadow:inset 3px 0 0 var(--blue)}.price-table tbody tr.active td:first-child{color:#fff;font-weight:900}.price{font-weight:900;color:#e9f7ff}.price.good{color:#2dff95}.price.warn{color:#ffd95c}.price.missing{opacity:.55}
                     .solcast-days{display:grid;grid-template-columns:repeat(7,minmax(58px,1fr));gap:8px;padding:9px;border-top:1px solid var(--line)}.solcast-day{height:104px;border:1px solid var(--line);border-radius:8px;background:rgba(7,18,28,.72);display:grid;grid-template-rows:auto 1fr auto;gap:4px;padding:6px}.solcast-day-head{display:flex;justify-content:space-between;gap:4px}.solcast-day-head strong{font-size:11px;color:#e8f7ff;white-space:nowrap}.solcast-day-head em{font-style:normal;font-size:10px;color:#88a7bb}.solcast-day-meter{display:flex;align-items:end;justify-content:center;border-radius:6px;background:rgba(255,255,255,.03)}.solcast-day-meter span{width:34px;border-radius:8px 8px 2px 2px;background:linear-gradient(180deg,#ffd166,#39ef8d);min-height:8px}.solcast-day b{text-align:center;font-size:11px}.solcast-day.missing{opacity:.45}
                     .solcast-panel{width:100%;max-width:100%;min-width:0;overflow:hidden}.solcast-panel [data-live-html="solcast-days"],.solcast-panel [data-live-html="solcast-chart"]{width:100%;max-width:100%;min-width:0;overflow:hidden}.solcast-chart{height:170px;max-width:100%;min-width:0;overflow-x:hidden;border-top:1px solid var(--line);padding:10px 8px 0;box-sizing:border-box;overscroll-behavior:contain}.solcast-bars{height:146px;width:100%;max-width:100%;min-width:0;display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:4px;align-items:end}.solcast-bar{height:146px;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}.solcast-columns{height:128px;width:100%;display:flex;align-items:end;justify-content:center;gap:2px}.solcast-columns span{display:block;width:42%;border-radius:4px 4px 0 0;min-height:3px}.solcast-columns .today{background:#2dff95}.solcast-columns .tomorrow{background:#57b9ff}.solcast-bar.now .solcast-columns span{box-shadow:0 0 0 1px #ffd166 inset}.solcast-bar em{font-style:normal;font-size:10px;color:#89a5b5;writing-mode:vertical-rl;transform:rotate(180deg)}.solcast-legend{display:flex;gap:7px;padding:4px 10px 8px;color:#a9c1d0;font-size:12px}.solcast-legend span{width:10px;height:10px;border-radius:999px;display:inline-block}.solcast-legend .today{background:#2dff95}.solcast-legend .tomorrow{background:#57b9ff}.solcast-performance{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:auto;padding:9px;border-top:1px solid var(--line)}.solcast-performance .stat{padding:8px}.solcast-performance .stat strong{font-size:14px}.live-changed{animation:dem-live-pulse .45s ease-out}@keyframes dem-live-pulse{0%{color:#fff;text-shadow:0 0 10px rgba(87,185,255,.9)}100%{color:inherit;text-shadow:none}}
          .defaults-status{margin-top:10px}.defaults-status.saving{color:#ffd166}.defaults-status.saved{color:var(--green)}.defaults-status.error{color:#ff8b98}button[data-default-action]:disabled{opacity:.55;cursor:wait}
           .schedule-shell{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;padding:10px;background:radial-gradient(circle at 12% 8%,rgba(20,85,130,.22),transparent 30%),linear-gradient(180deg,rgba(5,16,26,.98),rgba(7,21,32,.98))}
          .schedule-tabs{display:flex;gap:8px;padding:10px;border-bottom:1px solid var(--line);overflow-x:auto}.schedule-tabs button{border:1px solid var(--line2);border-radius:7px;background:rgba(255,255,255,.03);color:#dfeef6;padding:8px 12px;white-space:nowrap;cursor:pointer}.schedule-tabs button.active{border-color:var(--blue);color:#fff;background:rgba(21,155,255,.22)}.schedule-tab-panel[hidden]{display:none}.manual-save-actions{justify-content:flex-end;margin-top:10px}
          .schedule-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:8px}.schedule-title h2{margin:0;display:flex;align-items:center;gap:8px;font-size:22px;font-weight:850}.schedule-title p{margin:3px 0 0;color:#c1d4df;font-size:13px}.save-indicator{display:none;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;line-height:1.2}.save-indicator.saving{display:inline-flex;color:#ffd166;background:rgba(246,166,25,.16)}.save-indicator.saved{display:inline-flex;color:var(--green);background:rgba(53,214,111,.14)}.save-indicator.error{display:inline-flex;max-width:360px;color:#ff8b98;background:rgba(255,77,99,.15);white-space:normal}
          .schedule-tools{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.tool-btn,.gear-btn,.bulk-actions button,.icon-only{border:1px solid rgba(100,145,170,.42);border-radius:8px;background:rgba(7,17,27,.72);color:#eaf7ff;min-height:38px;padding:0 13px;display:inline-flex;align-items:center;gap:9px;cursor:pointer}.tool-btn.active{border-color:var(--blue);color:#2ea7ff;background:rgba(8,53,92,.55)}.gear-btn{width:48px;justify-content:center;padding:0}.gear-btn:hover,.tool-btn:hover,.icon-only:hover{border-color:var(--blue);box-shadow:0 0 0 1px rgba(21,155,255,.25) inset}.icon-only{width:32px;min-height:28px;padding:0;justify-content:center}
           .schedule-table-card{width:100%;max-width:100%;min-width:0;box-sizing:border-box;border:1px solid rgba(107,157,182,.28);border-radius:8px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;background:rgba(6,19,29,.62)}.schedule-table{width:100%;border-collapse:collapse;table-layout:auto}.schedule-table th,.schedule-table td{padding:1px 4px;border-top:1px solid var(--line);text-align:left;vertical-align:middle}.schedule-table th{background:rgba(19,41,56,.86);color:#d9ecf6;font-size:10px;font-weight:800}.schedule-table td{font-size:11px}.schedule-table tr{height:24px}.schedule-table tr.active{background:rgba(37,105,151,.32);animation:schedule-current-row 1.6s ease-in-out infinite}.schedule-table tr.active td{animation:schedule-current-cell 1.6s ease-in-out infinite}.schedule-table tr.active .time-col{color:#fff;font-weight:800;text-shadow:0 0 8px rgba(87,185,255,.9)}@keyframes schedule-current-row{0%,100%{background:rgba(37,105,151,.26)}50%{background:rgba(37,105,151,.58)}}@keyframes schedule-current-cell{0%,100%{box-shadow:inset 0 0 0 1px rgba(87,185,255,.32),inset 0 0 8px rgba(87,185,255,.10)}50%{box-shadow:inset 0 0 0 1px rgba(87,185,255,.95),inset 0 0 16px rgba(87,185,255,.38)}}.schedule-table tr.selected{background:rgba(0,122,255,.14);box-shadow:inset 0 0 0 1px var(--blue)}.time-col{width:56px;min-width:56px;max-width:56px;text-align:left;white-space:nowrap}.schedule-table .metric,.schedule-table .mode-pill{white-space:nowrap}.schedule-table col.col-time{width:58px}.schedule-table col.col-mode{width:118px}.schedule-table col.col-power{width:76px}.schedule-table col.col-grid{width:54px}.schedule-table col.col-soc{width:56px}.schedule-table col.col-active{width:56px}.schedule-table col.col-action{width:42px}.slot-check{display:inline-flex;align-items:center;justify-content:center}.slot-check input{display:none}.slot-check span{width:18px;height:18px;border:1px solid rgba(159,190,207,.55);border-radius:5px;background:rgba(255,255,255,.02)}.slot-check input:checked+span{background:var(--blue);border-color:var(--blue);box-shadow:inset 0 0 0 3px rgba(0,0,0,.18)}.slot-check input:checked+span::after{content:"";display:block;width:8px;height:5px;border-left:2px solid #00131f;border-bottom:2px solid #00131f;transform:rotate(-45deg);margin:5px 0 0 5px}
          .mode-pill{display:inline-flex;align-items:center;border-radius:6px;padding:3px 7px;font-weight:800;background:#223241;color:#d7e7ef;white-space:nowrap}.mode-pill.selling{background:rgba(72,154,38,.24);color:var(--green)}.mode-pill.zero{background:rgba(21,155,255,.18);color:#55baff}.mode-pill.ct{background:rgba(188,99,255,.18);color:#ce8cff}.mode-pill.charge{background:rgba(246,166,25,.18);color:#ffc65a}.mode-pill.disabled{background:rgba(142,160,172,.16);color:#d6e1e8}.mode-pill.normal{background:rgba(77,171,247,.18);color:#4dabf7}
          .metric{white-space:nowrap}.metric svg{width:16px;height:16px;vertical-align:-3px}.metric.sell{color:#8cef3b}.metric.discharge{color:#ff4848}.metric.charge{color:#20a9ff}.metric.grid,.metric.grid-current{color:#ffc65a}.metric.soc{color:#d279ff}.metric.price-limit{color:#2dff95}
          .pill{border:0;border-radius:999px;min-width:42px;padding:3px 9px;font-weight:900;cursor:pointer;background:#233849;color:#d9edf5}.pill.on{background:linear-gradient(90deg,#0a68d7,#159bff);color:#fff}.pill.off{background:#263e51;color:#d9edf5}.pill.missing{opacity:.62}
          .foot-actions{display:flex;gap:9px;flex-wrap:wrap}.foot-actions button{border:1px solid rgba(100,145,170,.42);border-radius:8px;background:rgba(7,17,27,.72);color:#eaf7ff;min-height:32px;padding:0 12px;display:inline-flex;align-items:center;gap:8px;cursor:pointer}.foot-actions .primary{background:linear-gradient(180deg,#0b7eee,#075bc0);border-color:#159bff}
          .bulk-panel{border:1px solid rgba(107,157,182,.28);border-radius:8px;background:linear-gradient(180deg,rgba(10,29,45,.95),rgba(7,21,33,.96));padding:20px}.bulk-panel h3{margin:0 0 16px;font-size:20px}.range-box{border:1px solid rgba(21,155,255,.35);border-radius:8px;background:rgba(0,81,145,.18);padding:14px;margin-bottom:16px;color:#2ea7ff}.range-box span,.range-box small{display:block;margin-top:5px}.apply-row{display:grid;grid-template-columns:24px 1fr 1.25fr;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.apply-row input[type="checkbox"]{width:20px;height:20px;accent-color:var(--blue)}.preview-box{margin-top:12px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.03);padding:12px;color:#cbdce5}.bulk-actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px}.bulk-actions .primary{background:linear-gradient(180deg,#72d13b,#41a91d);border-color:#75e247;color:#041007}
          input,select{width:100%;min-width:0;box-sizing:border-box;background:rgba(8,22,34,.95);color:#f6fbff;border:1px solid rgba(107,157,182,.34);border-radius:7px;padding:8px}option,select option{background:#fff!important;color:#111!important}.field{position:relative;display:block}.field input{padding-right:42px}.field span{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-weight:800;color:#d8ecf7}.row{min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid var(--line)}.row strong{text-align:right}.settings-row{min-height:40px;display:grid;grid-template-columns:1fr 260px;gap:12px;align-items:center;padding:9px 12px;border-top:1px solid var(--line)}.settings-row>input[type="checkbox"]{justify-self:end;width:20px;height:20px;accent-color:var(--blue)}.settings-row select{max-width:260px;justify-self:end}.tou-reverse-sync{display:grid;gap:5px}.hint{padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.03);color:#c7d9e2;margin-bottom:12px}.wide-action{width:100%;min-height:38px;border:1px solid rgba(100,145,170,.45);border-radius:8px;background:#173a57;color:#fff;font-weight:800;cursor:pointer}.wide-action:disabled{opacity:.45;cursor:not-allowed}.settings-table{width:100%;border-collapse:collapse}.settings-table th,.settings-table td{padding:8px;border-top:1px solid var(--line);text-align:left}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;z-index:20;padding:16px}.dialog{width:min(760px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(107,157,182,.45);border-radius:12px;background:radial-gradient(circle at 16% 0%,rgba(22,91,139,.2),transparent 36%),linear-gradient(180deg,#071b2a,#061420);box-shadow:0 25px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)}.settings-dialog{width:min(880px,100%)}.dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:linear-gradient(180deg,rgba(14,50,70,.9),rgba(10,30,44,.86));border-bottom:1px solid rgba(107,157,182,.28)}.dialog-head strong{font-size:19px}.dialog-head button{border:0;background:transparent;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.dialog-head button svg{pointer-events:none}.dialog-body{padding:14px}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 14px 14px}.dialog-actions button{border:1px solid var(--line2);border-radius:8px;background:#173a57;color:#fff;min-height:38px;padding:0 16px}.dialog-actions button:disabled{opacity:.45;cursor:not-allowed}
           .settings-dialog{width:min(1180px,96vw)!important;height:min(820px,92vh);max-height:92vh!important;overflow:hidden!important;display:grid;grid-template-rows:auto minmax(0,1fr)}.settings-layout{min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr)}.settings-nav{padding:12px;border-right:1px solid var(--line);background:rgba(4,15,24,.58);display:flex;flex-direction:column;gap:7px;overflow-y:auto}.settings-nav button{width:100%;min-height:42px;border:1px solid var(--line2);border-radius:7px;background:rgba(255,255,255,.025);color:#dfeef6;padding:8px 10px;text-align:left;cursor:pointer}.settings-nav button.active{border-color:var(--blue);color:#fff;background:rgba(21,155,255,.22)}.settings-content{min-width:0;overflow:auto;overscroll-behavior:contain;padding:14px}.diagnostic-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:12px}.diagnostic-summary>div{border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.03);padding:11px}.diagnostic-summary span{display:block;color:#9db7c6;font-size:11px}.diagnostic-summary strong{display:block;margin-top:5px;overflow-wrap:anywhere}.diagnostic-section{border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:12px;background:rgba(255,255,255,.025)}.diagnostic-section h3{margin:0;padding:10px 12px;background:rgba(18,42,59,.78);color:#dff4ff}.diagnostic-entities{max-height:260px;overflow:auto}.diag-badge{display:inline-flex;border-radius:999px;padding:3px 9px;font-weight:800}.diag-badge.ok{color:var(--green);background:rgba(53,214,111,.12)}.diag-badge.error{color:#ff8b98;background:rgba(255,77,99,.13)}.diagnostic-actions{display:flex;flex-wrap:wrap;gap:8px;padding:12px}.diagnostic-actions button{min-height:38px;border:1px solid var(--line2);border-radius:7px;background:#173a57;color:#fff;padding:0 13px;cursor:pointer}.diagnostic-actions button.danger{background:rgba(138,24,42,.28);border-color:rgba(255,77,99,.55);color:#ff9cab}.diagnostic-actions button.resume{background:rgba(38,112,64,.55);border-color:rgba(103,229,100,.65)}.tou-diagnostics{padding:12px;display:flex;gap:10px;align-items:center;overflow-wrap:anywhere}.schedule-attempt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px}.schedule-attempt>div{border:1px solid var(--line);border-radius:7px;padding:9px;overflow-wrap:anywhere}.schedule-attempt .schedule-attempt-message{grid-column:span 3}.schedule-attempt span{display:block;font-size:11px;color:#9db7c6}.schedule-attempt strong{display:block;margin-top:4px}.schedule-attempt ul{margin:6px 0 0;padding:0;list-style:none}.schedule-attempt li{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:2px 0}.schedule-attempt.failed{background:rgba(145,28,48,.08)}
           .sales-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px}.sales-chart{height:130px;display:grid;grid-template-columns:repeat(24,1fr);gap:4px;align-items:end;padding:10px;border-top:1px solid var(--line)}.sales-bar{height:112px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;min-width:0}.sales-bar span{display:block;width:100%;min-height:4px;border-radius:4px 4px 0 0;background:#35d66f}.sales-bar.now span{background:#ffd166}.sales-bar em{font-style:normal;font-size:10px;color:#8aa8b8;writing-mode:vertical-rl;transform:rotate(180deg)}.sales-tables{display:grid;grid-template-columns:1fr .8fr 1fr;gap:10px;padding:0 10px 10px}.section-label{padding:8px 10px;color:#d9f7ff;background:#1b3445;font-size:12px;font-weight:900;text-transform:uppercase}.sales-scroll{max-height:170px;overflow:auto;overscroll-behavior:contain}.mini-table{width:100%;border-collapse:collapse}.mini-table td{padding:5px 8px;border-top:1px solid var(--line);font-size:12px}
          .sales-panel{background:radial-gradient(circle at 12% 0%,rgba(20,85,130,.22),transparent 30%),linear-gradient(180deg,rgba(5,16,26,.99),rgba(7,21,32,.99));border-color:rgba(107,157,182,.3)}
          .sales-panel .panel-title{display:flex;align-items:center;gap:9px;padding:13px 15px;background:transparent;border-bottom:1px solid rgba(107,157,182,.25);font-size:21px}.sales-panel .panel-title svg{width:21px;height:21px;color:var(--blue)}
          .sales-summary .stat{position:relative;display:flex;align-items:center;gap:11px;min-height:58px;padding:10px 12px;border:1px solid rgba(107,157,182,.28);border-radius:8px;background:linear-gradient(180deg,rgba(12,31,45,.84),rgba(6,19,29,.88));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
          .stat-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:rgba(21,155,255,.14);color:#55baff}.stat-icon svg{width:19px;height:19px}.stat-copy{min-width:0;flex:1}.sales-summary .stat span{font-size:11px;color:#8eacbd}.sales-summary .stat strong{font-size:16px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                     .sales-panel{width:100%;box-sizing:border-box}.sales-panel>div{padding:0 2px 2px}.sales-summary{gap:10px;padding:12px}.sales-summary .stat{border-left:3px solid rgba(21,155,255,.72)}.sales-summary .stat:nth-child(1){border-left-color:var(--green)}.sales-summary .stat:nth-child(2){border-left-color:#ffd166}.sales-summary .stat:nth-child(3){border-left-color:var(--blue)}.sales-summary .stat:nth-child(4){border-left-color:var(--purple)}.sales-summary .stat:nth-child(5){border-left-color:var(--gold)}
          .sales-chart{height:118px;margin:0 12px 12px;padding:10px 8px 7px;border:1px solid rgba(107,157,182,.25);border-radius:8px;background:rgba(4,15,24,.7)}.sales-bar{height:98px}.sales-bar span{background:linear-gradient(180deg,#74ea4b,#28b963);box-shadow:0 0 10px rgba(53,214,111,.12)}.sales-bar.now span{background:linear-gradient(180deg,#ffe08a,#f5b942)}
          .sales-tables{gap:12px;padding:0 12px 12px}.sales-tables>div{overflow:hidden;border:1px solid rgba(107,157,182,.25);border-radius:8px;background:rgba(4,15,24,.62)}.section-label{padding:9px 11px;background:rgba(18,42,59,.86);color:#d8edf8;font-size:11px;letter-spacing:0;text-transform:uppercase}.mini-table td{padding:6px 9px;border-top:1px solid rgba(118,166,190,.16);font-size:11px}.mini-table tr:hover td{background:rgba(21,155,255,.05)}
           .dialog-head{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,rgba(14,50,70,.98),rgba(10,30,44,.98))}.dialog-actions{position:sticky;bottom:0;z-index:4;padding:12px 14px;background:rgba(6,20,32,.98);border-top:1px solid var(--line)}
           @media(max-width:1500px){.info-grid{grid-template-columns:1fr 1fr}.info-grid>.panel:nth-child(3){grid-column:1/-1}.bulk-panel{max-width:none}}
           @media(max-width:980px){.dem-v073{padding:10px}.info-grid{grid-template-columns:1fr}.sales-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.info-grid>.panel{height:auto;min-height:340px}.schedule-head{display:grid}.schedule-tools{justify-content:stretch}.tool-btn{flex:1}.schedule-table{min-width:1160px}.schedule-table-card{overflow-x:auto}.sales-tables{grid-template-columns:1fr}.sales-chart{overflow-x:auto;grid-template-columns:repeat(24,24px)}.price-scroll{height:260px;overflow:auto;scrollbar-gutter:stable}.solcast-days{grid-template-columns:repeat(2,1fr)}.settings-layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.settings-nav{flex-direction:row;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--line)}.settings-nav button{width:auto;min-width:max-content;text-align:center}.diagnostic-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
           @media(max-width:620px){
             .dem-v073{padding:4px;gap:8px}.panel,.schedule-shell,.table-wrap{border-radius:7px}.panel-title{padding:10px 12px;font-size:18px}
             .sales-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px!important;padding:7px!important}.sales-summary .stat{min-height:52px;padding:7px 8px;gap:7px}.stat-icon{width:29px;height:29px}.stat-icon svg{width:17px;height:17px}.sales-summary .stat span{font-size:10px}.sales-summary .stat strong{font-size:13px;line-height:1.25;white-space:normal;overflow-wrap:anywhere}
             .info-grid{gap:8px}.info-grid>.panel{min-height:0;height:auto}.price-summary{grid-template-columns:1fr}.price-scroll{height:230px}.price-table th,.price-table td{padding:4px 7px;font-size:11px}
              .solcast-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.solcast-days{display:flex;max-width:100%;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding-bottom:5px}.solcast-day{min-width:132px;scroll-snap-align:start}.solcast-chart{height:162px;padding-left:5px;padding-right:5px}.solcast-bars{height:138px;min-width:0;width:100%;max-width:100%;grid-template-columns:repeat(24,minmax(0,1fr))}.solcast-performance{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:7px}
             .schedule-shell{padding:7px}.schedule-head{gap:8px}.schedule-title h2{font-size:19px}.schedule-title p{font-size:11px;line-height:1.35}.schedule-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}.tool-btn{min-height:36px;padding:0 8px;justify-content:center;font-size:12px}.gear-btn{width:100%;min-height:36px}.schedule-table{min-width:880px}.schedule-table th,.schedule-table td{padding:2px 3px}.schedule-table td{font-size:10px}.foot-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.foot-actions button{justify-content:center;padding:0 7px;font-size:11px}
             .sales-summary{padding:8px}.sales-chart{min-height:150px}.sales-tables{gap:8px}
              .overlay{padding:0;align-items:stretch}.dialog,.settings-dialog{width:100%!important;height:100dvh!important;max-height:100dvh!important;border-radius:0}.dialog-head{padding-top:max(14px,env(safe-area-inset-top))}.dialog-actions{padding-bottom:max(12px,env(safe-area-inset-bottom))}.apply-row{grid-template-columns:24px 1fr}.apply-row .field,.apply-row select{grid-column:2}.settings-content{padding:9px}.diagnostic-summary{grid-template-columns:1fr}.diagnostic-actions{display:grid}.diagnostic-actions button{width:100%}
           }
           .manual-schedule-table{min-width:820px}.manual-schedule-table .time-col{white-space:nowrap}.manual-schedule-table tr.editing{background:rgba(21,155,255,.09)}.manual-schedule-table tr.disabled{opacity:.72}.manual-schedule-table tr.editing td{border-top-color:rgba(21,155,255,.38)}.manual-schedule-table input,.manual-schedule-table select{width:100%;min-width:90px;box-sizing:border-box;background:rgba(8,22,34,.95);color:#f6fbff;border:1px solid rgba(107,157,182,.34);border-radius:7px;padding:5px 6px}.manual-schedule-table input[type=checkbox]{width:auto;min-width:0;accent-color:var(--blue)}.manual-action-cell{display:flex;gap:6px;align-items:center}.manual-schedule-table .icon-only.active{border-color:var(--blue);color:#2ea7ff;background:rgba(8,53,92,.55)}.manual-schedule-table .icon-only.remove:hover{border-color:rgba(255,77,99,.7);color:#ff9cab}.manual-schedule-table .icon-only:disabled{opacity:.35;cursor:not-allowed}.manual-row-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.manual-row-actions button{min-height:36px;border:1px solid var(--line2);border-radius:7px;background:#173a57;color:#fff;padding:0 12px;cursor:pointer}.manual-row-actions button:disabled{opacity:.45;cursor:not-allowed}.manual-schedule-table tr.time-current td{background:transparent;box-shadow:none;color:#fff8ea}.manual-schedule-table tr.time-current td,.manual-schedule-table tr.time-current td *{text-shadow:0 0 0 rgba(255,166,45,0);animation:manual-time-current-text-glow 2.4s ease-in-out infinite}.manual-schedule-table tr.time-current td svg,.manual-schedule-table tr.time-current td .icon-only{animation:manual-time-current-icon-glow 2.4s ease-in-out infinite}@keyframes manual-time-current-text-glow{0%,100%{text-shadow:0 0 0 rgba(255,166,45,0);color:inherit}50%{text-shadow:0 0 4px rgba(255,244,214,.95),0 0 10px rgba(255,176,58,.95),0 0 18px rgba(255,140,0,.55);color:#fffaf0}}@keyframes manual-time-current-icon-glow{0%,100%{filter:drop-shadow(0 0 0 rgba(255,166,45,0))}50%{filter:drop-shadow(0 0 3px rgba(255,244,214,.95)) drop-shadow(0 0 8px rgba(255,166,45,.85))}}
           </style>
            <div class="dem-v073" style="${demStyle}">
            ${infoGridSection}
            ${scheduleSection}
            ${salesSection}
          </div>
          <div class="dialog-host">${this.renderDialog()}</div>
      </ha-card>`;

    this.bindControlsV073();
    this._isRendered = true;
    this.restoreScrollPositions();
  }

  bindControlsV073() {
    this.bindDashboardControls();
    this.bindDialogControls();
  }

  bindDashboardControls() {
    const root = this.querySelector(".dem-v073") || this;
    root.querySelectorAll("[data-control-toggle]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleControl();
      });
    });
    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggle(el.dataset.toggle);
      });
    });
    root.querySelectorAll("[data-number]").forEach((el) => {
      el.onchange = () => this.setNumber(el.dataset.number, el.value);
      el.onkeydown = (event) => {
        if (event.key === "Enter") {
          this.setNumber(el.dataset.number, el.value);
          el.blur();
        }
      };
    });
    root.querySelectorAll("[data-select]").forEach((el) => {
      el.value = this.state(el.dataset.select);
      // Charging is a work-mode choice. Grid permission remains separate
      // explicit consent and must never be inferred from this selection.
      el.onchange = () => this.setSelect(el.dataset.select, el.value);
    });
    root.querySelectorAll("[data-time]").forEach((el) => {
      el.onchange = () => this.setTime(el.dataset.time, el.value);
    });
    root.querySelectorAll("[data-open-settings]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      this.captureScrollPositions();
      const tab = el.dataset.openSettings;
      this._settingsTab = tab && tab !== "1" ? tab : "tariff";
      this._dialog = { type: "settings" };
      this.render();
    }));
    root.querySelectorAll("[data-schedule-tab]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      const tab = el.dataset.scheduleTab;
      this._scheduleTab = ["manual", "tou"].includes(tab) ? tab : "manual";
      if (this._scheduleTab === "tou") this.resetMappingEditor();
      this.render();
      if (this._scheduleTab === "tou") this.refreshMappingFromInverter();
    }));
    root.querySelectorAll("[data-mapping-field]").forEach((el) => {
      const update = () => this.collectMappingDraft();
      el.addEventListener("change", update);
      if (el.tagName !== "SELECT") el.addEventListener("input", update);
    });
    root.querySelectorAll("[data-refresh-mapping]").forEach((el) => el.addEventListener("click", () => {
      this.rollbackTouTable();
    }));
    root.querySelectorAll("[data-edit-mapping]").forEach((el) => el.addEventListener("click", () => {
      this.startMappingEdit();
    }));
    root.querySelectorAll("[data-cancel-mapping]").forEach((el) => el.addEventListener("click", () => {
      this.cancelMappingEdit();
    }));
    root.querySelectorAll("[data-save-mapping]").forEach((el) => el.addEventListener("click", () => {
      this.saveMappingToInverter();
    }));
    root.querySelectorAll("[data-manual-field]").forEach((el) => {
      const update = () => {
        this.updateManualScheduleField(Number(el.dataset.manualIndex), el.dataset.manualField, el.value);
        if (el.dataset.manualField === "mode") this.render();
      };
      el.addEventListener("change", update);
      if (el.tagName !== "SELECT" && el.type !== "checkbox") el.addEventListener("input", update);
    });
    root.querySelectorAll("[data-manual-add]").forEach((el) => el.addEventListener("click", () => {
      this.addManualScheduleRow();
      this.render();
    }));
    root.querySelectorAll("[data-manual-edit]").forEach((el) => el.addEventListener("click", () => {
      this.toggleManualScheduleRowEdit(Number(el.dataset.manualEdit));
      this.render();
    }));
    root.querySelectorAll("[data-manual-remove]").forEach((el) => el.addEventListener("click", () => {
      const index = Number(el.dataset.manualRemove);
      const row = this.ensureManualScheduleDraft()[index];
      if (!row) return;
      const label = `row ${index + 1} (${row.from} → ${row.to})`;
      if (!window.confirm(`Remove manual schedule ${label}? The remaining rows will be joined automatically.`)) return;
      this.removeManualScheduleRow(index);
      this.render();
    }));
    root.querySelectorAll("[data-manual-save]").forEach((el) => el.addEventListener("click", () => this.saveManualSchedule()));
    root.querySelectorAll("[data-manual-activate]").forEach((el) => el.addEventListener("click", () => this.activateManualSchedule()));
    root.querySelectorAll("[data-manual-deactivate]").forEach((el) => el.addEventListener("click", () => this.deactivateManualSchedule()));
  }

  bindDialogControls() {
    const root = this.querySelector(".dialog-host") || this;
    root.querySelectorAll("[data-close-dialog]").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (el.classList.contains("overlay") && event.target !== el) return;
        event.preventDefault();
        event.stopPropagation();
        this.closeDialog();
      });
    });
    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggle(el.dataset.toggle);
      });
    });
    root.querySelectorAll("[data-number]").forEach((el) => {
      el.onchange = () => this.setNumber(el.dataset.number, el.value);
      el.onkeydown = (event) => {
        if (event.key === "Enter") {
          this.setNumber(el.dataset.number, el.value);
          el.blur();
        }
      };
    });
    root.querySelectorAll("[data-select]").forEach((el) => {
      el.value = this.state(el.dataset.select);
      // Charging is a work-mode choice. Grid permission remains separate
      // explicit consent and must never be inferred from this selection.
      el.onchange = () => this.setSelect(el.dataset.select, el.value);
    });
    root.querySelectorAll("[data-time]").forEach((el) => {
      el.onchange = () => this.setTime(el.dataset.time, el.value);
    });
    root.querySelectorAll("[data-settings-tab]").forEach((el) => el.addEventListener("click", () => {
      this._settingsTab = el.dataset.settingsTab;
      this._tariffDraft = null;
      this.renderDialogOnly();
    }));
    root.querySelectorAll("[data-tariff-field='dso_provider'],[data-tariff-field='tariff_plan'],[data-tariff-field='buy_seller_id'],[data-tariff-field='buy_seller_tariff_id']").forEach((el) => el.addEventListener("change", () => {
      const draft = this.collectTariffDraft();
      if (el.dataset.tariffField === "dso_provider") {
        const provider = this.tariffData().providers?.find((item) => item.id === draft.dso_provider);
        if (provider?.tariffs?.length) draft.tariff_plan = provider.tariffs[0].id;
      }
      if (["dso_provider", "tariff_plan", "buy_seller_id"].includes(el.dataset.tariffField)) {
        draft.buy_seller_tariff_id = "";
      }
      this._tariffDraft = draft;
      this.renderDialogOnly();
    }));
    root.querySelectorAll("[data-save-tariff]").forEach((el) => el.addEventListener("click", () => this.saveTariffSettings()));
    root.querySelectorAll("[data-refresh-tariff]").forEach((el) => el.addEventListener("click", async () => {
      el.disabled = true;
      try {
        await this.callService("deye_energy", "refresh_tariff_catalog", {});
        this._tariffSaveStatus = "Catalog checked. The latest valid version remains active.";
      } catch (error) {
        this._tariffSaveStatus = `Could not check the catalog: ${error?.message || error}`;
      }
      this.render();
    }));
    root.querySelectorAll("[data-action='apply-defaults']").forEach((el) => el.addEventListener("click", () => this.restoreDefaults()));
    root.querySelectorAll("[data-resume-manager]").forEach((el) => el.addEventListener("click", () => {
      if (window.confirm("Enable the Manager and schedule? This will not enable a grid-charge schedule.")) this.resumeManager();
    }));
    root.querySelectorAll("[data-system-defaults]").forEach((el) => el.addEventListener("click", () => {
      if (window.confirm("Stop the Manager and apply the default settings?")) this.restoreDefaults();
    }));
    root.querySelectorAll("[data-refresh-entities]").forEach((el) => el.addEventListener("click", () => this.refreshConfiguredEntities()));
    root.querySelectorAll("[data-export-config]").forEach((el) => el.addEventListener("click", () => this.exportConfiguration()));
    root.querySelectorAll("[data-create-backup]").forEach((el) => el.addEventListener("click", () => {
      try { this.createConfigurationBackup(); } catch (error) { window.alert(`Could not create the backup: ${error.message}`); }
    }));
    root.querySelectorAll("[data-restore-backup]").forEach((el) => el.addEventListener("click", async () => {
      if (!window.confirm("Restore the last local backup? The current settings will be replaced.")) return;
      try { await this.restoreConfigurationBackup(); window.alert("The backup was restored."); } catch (error) { window.alert(error.message); }
    }));
    root.querySelectorAll("[data-restore-defaults]").forEach((el) => el.addEventListener("click", () => {
      if (window.confirm("Restore the default settings and stop the schedule?")) this.restoreDefaults();
    }));
    root.querySelectorAll("[data-import-config-open]").forEach((el) => el.addEventListener("click", () => root.querySelector("[data-import-config]")?.click()));
    root.querySelectorAll("[data-import-config]").forEach((el) => el.addEventListener("change", async () => {
      const file = el.files?.[0];
      if (!file) return;
      try {
        const snapshot = JSON.parse(await file.text());
        if (!window.confirm(`Import the configuration from ${file.name}?`)) return;
        await this.applyConfigurationSnapshot(snapshot);
        window.alert("The configuration was imported.");
      } catch (error) {
        window.alert(`Import error: ${error.message}`);
      } finally {
        el.value = "";
      }
    }));
  }

  renderDialogOnly() {
    const host = this.querySelector(".dialog-host");
    if (!host) return;
    this.captureScrollPositions();
    host.innerHTML = this.renderDialog();
    this.bindDialogControls();
    this.restoreScrollPositions();
  }

  render() {
    return this.renderV073();
  }
}

