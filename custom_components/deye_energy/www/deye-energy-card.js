// Resource revision: v=0.8.1.05
class DeyeEnergyCard extends HTMLElement {
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
      <div><span>Versions</span><strong>Integration ${this.escapeHtml(attrs.integration_version || "0.8.0")} \u00b7 card 0.8.1.05 (resource revision v=0.8.1.05)</strong></div>
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

class DeyeEnergyInverterConfigCard extends HTMLElement {
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
    this._inverterConfigSubTab = "inverter";
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
      { key: "power_flow", label: "Power flow" },
    ];
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

  renderPowerFlowConfigTab() {
    const draft = this.powerFlowDraft();
    const message = this._powerFlowMessage
      ? `<div class="ic-hint ${/failed|unavailable/i.test(this._powerFlowMessage) ? "ic-bad" : "ic-ok"}">${this.escapeHtml(this._powerFlowMessage)}</div>`
      : "";
    const layout = String(draft.layout || "cross") === "left_right" ? "left_right" : "cross";
    return `<section class="ic-section">
        <h4>Power flow layout</h4>
        <p class="ic-hint">Choose how nodes are arranged in the Power Flow card. "Left and right" places PV/Grid on the left, Inverter in the middle, and Battery/Home on the right, with curved connection lines.</p>
        <div class="ic-table-wrap"><table class="ic-table"><tbody><tr><td><strong>Display layout</strong></td><td><select class="ic-select" id="pf-layout-select" data-pf-layout="1">
            <option value="cross"${layout === "cross" ? " selected" : ""}>Cross (default)</option>
            <option value="left_right"${layout === "left_right" ? " selected" : ""}>Left and right</option>
          </select></td></tr></tbody></table></div>
      </section>
      <section class="ic-section">
        <h4>Power flow mapping</h4>
        <p class="ic-hint">Edit the entity IDs used by the Power Flow card, add extra detail rows to each node, and extend the summary chip row. Save writes the shared entity-map override; the Power Flow card then updates without a restart.</p>
      </section>
      ${this.renderPowerFlowSensorGroups()}
      <section class="ic-section pf-group">
        <h4>Top chips — summary row</h4>
        ${this.renderPowerFlowSummaryChips()}
      </section>
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

  _renderSig(active) {
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
      active, this._inverterConfigLoading, this._inverterConfigLoaded, this._inverterConfigError,
      this._inverterDatetimeSyncing, this._inverterDatetimeMessage, this._inverterDatetimeStatus,
      this._inverterConfig, this._inverterConfigDrafts, this._inverterConfigSaving,
      this._inverterConfigMessages, this._pendingApply, this._config?.title || "",
      monitorStates, this.powerFlowStateSignature(), JSON.stringify(this.powerFlowDisplay()),
      JSON.stringify(this._powerFlowDraft), this._powerFlowSaving, this._powerFlowMessage,
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
    const subTabs = this.inverterConfigSubTabDefs();
    const active = subTabs.some((tab) => tab.key === this._inverterConfigSubTab) ? this._inverterConfigSubTab : "inverter";
    this._inverterConfigSubTab = active;
    const sig = this._renderSig(active);
    if (sig === this._lastRenderSig) return;
    this._lastRenderSig = sig;
    const shownEntities = new Set();
    this.inverterConfigGroups().forEach((group) => (group.fields || []).forEach((field) => { if (field.entity_id) shownEntities.add(String(field.entity_id)); }));

    let body = "";
    if (active === "inverter") {
      body = `${this.renderInverterDatetimeSection()}${this.renderInverterConfigEditableGroup("work_mode_detail")}`;
    } else if (active === "grid") {
      body = this.renderInverterConfigEditableGroup("grid");
    } else if (active === "battery_inverter") {
      body = this.renderInverterConfigEditableGroup("battery_charging");
    } else if (active === "battery_settings") {
      body = this.renderInverterConfigEditableGroup("battery_config");
    } else if (active === "mode_control") {
      body = this.renderInverterConfigEditableGroup("system_control");
    } else if (active === "specification") {
      body = this.renderInverterConfigEditableGroup("specification");
    } else if (active === "voltages") {
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
    } else if (active === "power") {
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
    } else if (active === "battery") {
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
    } else if (active === "energy") {
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
    } else if (active === "power_flow") {
      body = this.renderPowerFlowConfigTab();
    }
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
          .ic-sub { margin: 4px 0 0; color: var(--ic-muted); font-size: 0.92rem; max-width: 72ch; }
          .ic-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
          .ic-btn, .ic-action { border: 1px solid var(--ic-line); background: var(--ic-surface2); color: var(--ic-text); border-radius: 10px; padding: 10px 14px; font: inherit; cursor: pointer; }
          .ic-btn:hover, .ic-action:hover { border-color: var(--ic-accent); }
          .ic-btn:disabled, .ic-action:disabled { opacity: .55; cursor: default; }
          .ic-action { background: color-mix(in srgb, var(--ic-accent) 28%, transparent); border-color: color-mix(in srgb, var(--ic-accent) 60%, var(--ic-line)); font-weight: 600; }
          .ic-action:hover:not(:disabled) { background: color-mix(in srgb, var(--ic-accent) 38%, transparent); border-color: var(--ic-accent); }
          .ic-btn-primary { background: color-mix(in srgb, var(--ic-accent) 22%, transparent); border-color: color-mix(in srgb, var(--ic-accent) 55%, var(--ic-line)); }
          .ic-btn-secondary { background: transparent; }
          .ic-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--ic-line); }
          .ic-tab { border: 1px solid transparent; border-bottom: 2px solid transparent; background: transparent; color: var(--ic-muted); border-radius: 6px 6px 0 0; padding: 8px 14px; font: inherit; cursor: pointer; margin-bottom: -2px; }
          .ic-tab.active { color: var(--ic-text); background: color-mix(in srgb, var(--ic-accent) 12%, transparent); border-color: var(--ic-line); border-bottom-color: var(--ic-accent); }
          .ic-section { border: 1px solid var(--ic-line); border-radius: 14px; background: var(--ic-surface); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
          .ic-section h4 { margin: 0; font-size: 1rem; }
          .ic-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .ic-table { width: 100%; border-collapse: collapse; min-width: 320px; }
          .ic-table th, .ic-table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--ic-line); vertical-align: top; }
          .ic-table th { color: var(--ic-muted); font-size: .85rem; font-weight: 600; }
          .ic-table tr:last-child td { border-bottom: none; }
          .ic-muted { color: var(--ic-muted); font-size: .82rem; }
          .ic-mono { font-family: var(--code-font-family, ui-monospace, SFMono-Regular, monospace); font-size: .92rem; }
          .ic-good { color: var(--ic-good); font-weight: 600; }
          .ic-bad-text { color: var(--ic-bad); font-weight: 600; }
          .ic-hint { font-size: .9rem; color: var(--ic-muted); padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,.08); }
          .ic-hint.ic-ok { color: var(--ic-good); background: color-mix(in srgb, var(--ic-good) 12%, transparent); }
          .ic-hint.ic-bad { color: var(--ic-bad); background: color-mix(in srgb, var(--ic-bad) 12%, transparent); }
          .ic-field { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
          .ic-field input, .ic-select, .pf-group .pf-entity-input, .pf-edit input[type="text"] { background: var(--card-background-color, rgba(0,0,0,.2)); color: var(--ic-text); border: 1px solid var(--ic-line); border-radius: 8px; padding: 8px 10px; font: inherit; min-width: 140px; max-width: 100%; }
          .ic-field input:focus, .ic-select:focus, .pf-group .pf-entity-input:focus, .pf-edit input[type="text"]:focus { outline: 2px solid color-mix(in srgb, var(--ic-accent) 45%, transparent); border-color: var(--ic-accent); }
          .ic-unit { color: var(--ic-muted); font-size: .88rem; }
          .ic-readonly { color: var(--ic-text); }
          .ic-new { color: var(--ic-accent); font-weight: 600; }
          .pf-edit { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ic-line); }
          .pf-edit-title { color: var(--ic-muted); font-size: .88rem; font-weight: 600; }
          .pf-edit-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
          .pf-group > .pf-edit + .pf-edit { margin-top: 16px; }
          .pf-edit select { min-width: 120px; }
          .pf-edit input[type="color"] { width: 48px; height: 36px; padding: 2px; }
          .pf-group .pf-entity-input, .pf-edit .pf-detail-entity-input, .pf-edit input[data-pf-summary$=":entity"] { min-width: 480px; width: 480px; max-width: 100%; }
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
            .pf-group .pf-entity-input, .pf-edit .pf-detail-entity-input, .pf-edit input[data-pf-summary$=":entity"], .pf-edit .pf-detail-label-input { width: 100%; min-width: 0; }
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
          <div class="ic-tabs" role="tablist" aria-label="Inverter configuration sections">
            ${subTabs.map((tab) => `<button type="button" role="tab" aria-selected="${active === tab.key ? "true" : "false"}" class="ic-tab ${active === tab.key ? "active" : ""}" data-inverter-config-subtab="${tab.key}">${this.escapeHtml(tab.label)}</button>`).join("")}
          </div>
          <div class="ic-body">${body}</div>
        </div>
        ${this.renderConfirmOverlay()}
      </ha-card>`;

    this._bind();
  }

  _bind() {
    this.querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("focusout", () => {
      setTimeout(() => { if (this.isConnected === false) return; this._render(); }, 0);
    }));
    this.querySelectorAll("[data-inverter-config-subtab]").forEach((el) => el.addEventListener("click", () => {
      this._inverterConfigSubTab = el.dataset.inverterConfigSubtab || "inverter";
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
    this.querySelectorAll("[data-ic-cancel-apply]").forEach((el) => el.addEventListener("click", () => this.cancelPendingApply()));
    this.querySelectorAll("[data-ic-confirm-apply]").forEach((el) => el.addEventListener("click", () => this.confirmPendingApply()));
    const overlay = this.querySelector("[data-ic-overlay]");
    if (overlay) {
      overlay.addEventListener("click", (e) => { if (e.target === overlay) this.cancelPendingApply(); });
    }
  }
}

class DeyeEnergyTriggerLogsCard extends HTMLElement {
  constructor() {
    super();
    this._page = 1;
    this._pageSize = 20;
    this._lastSig = "";
  }

  setConfig(config) {
    this._config = config || {};
    this._filter = this._config.default_filter || "24h";
    this._page = 1;
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
    filtered.reverse();

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
          <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.95em;">
            <thead>
              <tr>
                <th style="position:sticky;top:0;z-index:2;text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);background:rgba(9,24,35,.92);">Time</th>
                <th style="position:sticky;top:0;z-index:2;text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);background:rgba(9,24,35,.92);">Input / trigger</th>
                <th style="position:sticky;top:0;z-index:2;text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);background:rgba(9,24,35,.92);">Status</th>
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
      <td style="white-space:nowrap;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">${ts}</td>
      <td style="padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">
        <div style="font-family:var(--code-font-family, monospace);font-size:0.92em;word-break:break-word;">${target || "—"}</div>
        <div style="color:var(--secondary-text-color);font-size:0.9em;margin-top:2px;word-break:break-word;">${service || "—"}</div>
      </td>
      <td style="padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top;">
        <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;color:${color};background:${bg};">${status}</span>
        ${msg ? `<div style="color:var(--secondary-text-color);font-size:0.85em;margin-top:4px;word-break:break-word;">${msg}</div>` : ""}
      </td>
    </tr>`;
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

class DeyeEnergyGraphsCard extends HTMLElement {
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
    if (!old || (hass && hass.connected !== old.connected)) {
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

  _groupDefs() {
    const e = this._entities();
    return [
      {
        key: 'power_flow',
        title: 'Power flow',
        charts: [
          {
            key: 'power_flow',
            title: 'Power flow',
            unit: 'W',
            series: [
              { key: 'grid_power', label: 'Grid', entity: e.grid_power, color: '#5bc0ff' },
              { key: 'load_power', label: 'Load', entity: e.load_power, color: '#f6a619' },
              { key: 'battery_power', label: 'Battery', entity: e.battery_power, color: '#7ee22d' },
              { key: 'inverter_power', label: 'Inverter', entity: e.inverter_power, color: '#bc63ff' },
            ],
          },
        ],
      },
      {
        key: 'inverter',
        title: 'Inverter',
        charts: [
          { key: 'ac_output_voltage', title: 'AC output voltage', unit: 'V', series: [{ key: 'ac_output_voltage', label: 'AC output voltage', entity: e.ac_output_voltage, color: '#5bc0ff' }] },
          { key: 'ac_inverter_output_power', title: 'AC inverter output power', unit: 'W', series: [{ key: 'inverter_power', label: 'Inverter output power', entity: e.inverter_power, color: '#bc63ff' }] },
          {
            key: 'inverter_temperatures',
            title: 'Inverter temperatures',
            unit: '°C',
            series: [
              { key: 'inverter_rad_temperature', label: 'Radiator', entity: e.inverter_rad_temperature, color: '#ff7a45' },
              { key: 'inverter_dc_transformer_temperature', label: 'DC transformer', entity: e.inverter_dc_transformer_temperature, color: '#f6a619' },
              { key: 'inverter_ac_temperature', label: 'AC temperature', entity: e.inverter_ac_temperature, color: '#5bc0ff' },
            ],
          },
        ],
      },
      {
        key: 'grid',
        title: 'Grid',
        charts: [
          { key: 'grid_voltage', title: 'Grid voltage', unit: 'V', series: [{ key: 'grid_voltage', label: 'Grid voltage', entity: e.grid_voltage, color: '#5bc0ff' }] },
          { key: 'grid_frequency', title: 'Grid frequency', unit: 'Hz', series: [{ key: 'grid_frequency', label: 'Grid frequency', entity: e.grid_frequency, color: '#35d66f' }] },
          { key: 'grid_power', title: 'Grid power (input / output)', unit: 'W', series: [{ key: 'grid_power', label: 'Grid power', entity: e.grid_power, color: '#5bc0ff' }] },
        ],
      },
      {
        key: 'load',
        title: 'Load',
        charts: [
          { key: 'load_power', title: 'Load power', unit: 'W', series: [{ key: 'load_power', label: 'Load power', entity: e.load_power, color: '#f6a619' }] },
        ],
      },
      {
        key: 'battery',
        title: 'Battery',
        charts: [
          { key: 'battery_soc', title: 'Battery SOC', unit: '%', series: [{ key: 'battery_soc', label: 'SOC', entity: e.battery_soc, color: '#7ee22d' }] },
          { key: 'battery_power', title: 'Battery power', unit: 'W', series: [{ key: 'battery_power', label: 'Battery power', entity: e.battery_power, color: '#7ee22d' }] },
          { key: 'battery_current', title: 'Battery current', unit: 'A', series: [{ key: 'battery_current', label: 'Battery current', entity: e.battery_current, color: '#5bc0ff' }] },
          { key: 'battery_voltage', title: 'DC voltage', unit: 'V', series: [{ key: 'battery_voltage', label: 'DC voltage', entity: e.battery_voltage, color: '#bc63ff' }] },
          { key: 'battery_temperatures', title: 'Battery temperature', unit: '°C', series: [{ key: 'battery_temperature', label: 'Battery temperature', entity: e.battery_temperature, color: '#ff7a45' }] },
        ],
      },
    ];
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
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
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
        <button class="g-apply" style="padding:5px 12px;border-radius:999px;border:1px solid ${this._customRange ? 'rgba(126,226,45,.65)' : 'rgba(118,166,190,.28)'};background:${this._customRange ? 'rgba(126,226,45,.14)' : 'rgba(255,255,255,.03)'};color:#eef7ff;cursor:pointer;font-size:12px;">Apply range</button>
      </div>`;
    const groupTabs = groups.map(g => {
      const active = g.key === this._group;
      return `<button class="gg" data-group="${g.key}" style="padding:8px 14px;border-radius:6px 6px 0 0;border:1px solid ${active ? 'rgba(118,166,190,.28)' : 'transparent'};border-bottom:2px solid ${active ? 'rgba(126,226,45,.85)' : 'transparent'};background:${active ? 'rgba(126,226,45,.12)' : 'transparent'};color:#eef7ff;cursor:pointer;font-size:13px;font-weight:${active ? '600' : '500'};margin-bottom:-2px;">${this._esc(g.title)}</button>`;
    }).join('');

    const charts = (activeGroup?.charts || []).map(c => `
      <div class="g-chart" style="background:rgba(255,255,255,.03);border:1px solid rgba(118,166,190,.16);border-radius:12px;padding:12px;min-width:0;width:100%;box-sizing:border-box;">
        <div style="font-size:13px;font-weight:600;color:#eef7ff;margin-bottom:8px;">${this._esc(c.title)}</div>
        ${this._chartSvg(c)}
      </div>`).join('');

    const err = this._error ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.35);color:#ffb3b3;font-size:13px;">${this._esc(this._error)}</div>` : '';
    const loading = this._loading ? `<span style="color:#9eb8c8;font-size:12px;">Loading history…</span>` : `<span style="color:#9eb8c8;font-size:12px;">${this._lastFetch ? 'Updated ' + this._esc(new Date(this._lastFetch).toLocaleTimeString()) : ''}</span>`;

    this.innerHTML = `
      <ha-card style="overflow:hidden;font-family:Roboto,Arial,sans-serif;font-size:14px;background:radial-gradient(circle at 18% 0%,rgba(26,106,164,.22),transparent 34%),linear-gradient(180deg,#020913,#06131c 54%,#050b10);border:1px solid rgba(101,142,164,.32);box-shadow:0 18px 45px rgba(0,0,0,.35);color:#eef7ff;--primary-text-color:#eef7ff;--secondary-text-color:#9eb8c8;--divider-color:rgba(118,166,190,.22);--g-muted:#9eb8c8;">
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
    const applyBtn = this.querySelector('.g-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const from = this.querySelector('.g-from')?.value || '';
        const to = this.querySelector('.g-to')?.value || '';
        this._customFrom = from;
        this._customTo = to;
        this._customRange = true;
        this._lastSig = '';
        this._render();
        this._fetchHistory();
      });
    }
    this._attachChartHovers();
  }
}


class DeyeEnergyPowerFlowCard extends HTMLElement {
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
    const d = ((offset % g.length) + g.length) % g.length;
    if (g.type === 'line') return d / g.length;
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
    state.gap = 60;
    state.count = geometry ? Math.max(1, Math.min(5, Math.floor(geometry.length / state.gap) + 1)) : 1;
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
    const arrowHead = (cx, cy, tan, fill, opacity, key) => {
      const nx = -tan.y, ny = tan.x;
      const tipX = cx + tan.x * 7;
      const tipY = cy + tan.y * 7;
      const baseX = cx - tan.x * 5;
      const baseY = cy - tan.y * 5;
      const w = 6.2;
      const notchX = cx - tan.x * 1.5;
      const notchY = cy - tan.y * 1.5;
      const p1 = `${tipX.toFixed(2)} ${tipY.toFixed(2)}`;
      const p2 = `${(baseX + nx * w).toFixed(2)} ${(baseY + ny * w).toFixed(2)}`;
      const p3 = `${notchX.toFixed(2)} ${notchY.toFixed(2)}`;
      const p4 = `${(baseX - nx * w).toFixed(2)} ${(baseY - ny * w).toFixed(2)}`;
      return `<path data-flow-arrow="${key}" d="M ${p1} L ${p2} L ${p3} L ${p4} Z" fill="${fill}" opacity="${opacity}"/>`;
    };
    let centerArrows = '';
    if (active && geometry) {
      const mid = geometry.length / 2;
      const pt = this._pointAt(geometry, mid);
      const tan = this._tangentAt(geometry, mid);
      if (transition) {
        const oldTan = { x: -tan.x, y: -tan.y };
        centerArrows += arrowHead(pt.x, pt.y, oldTan, color, oldArrowOpacity, `${id}-old`);
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
      <path id="${id}" class="pf-flow-line${active ? ' pf-flow-active' : ''}" data-flow-duration="${state.duration}" data-flow-direction="${dir}" d="${d}" stroke="${active ? color : 'rgba(158,184,200,.18)'}" stroke-width="4" stroke-opacity="${active ? 0.96 : 0.18}" fill="none"/>
      ${centerArrows ? `<g data-flow-arrows="${id}">${centerArrows}</g>` : ''}
      ${balls ? `<g class="pf-balls" data-flow-balls="${id}">${balls}</g>` : ''}`;
  }
  _arrowPath(cx, cy, tan) {
    const nx = -tan.y, ny = tan.x;
    const tipX = cx + tan.x * 7;
    const tipY = cy + tan.y * 7;
    const baseX = cx - tan.x * 5;
    const baseY = cy - tan.y * 5;
    const w = 6.2;
    const notchX = cx - tan.x * 1.5;
    const notchY = cy - tan.y * 1.5;
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
            const mid = state.geometry.length / 2;
            const pt = this._pointAt(state.geometry, mid);
            const tan = this._tangentAt(state.geometry, mid);
            els.arrow.setAttribute('d', this._arrowPath(pt.x, pt.y, tan));
          }
        }
        if (els && els.oldArrow) {
          els.oldArrow.setAttribute('opacity', transition ? transition.oldArrow.toFixed(2) : '0');
          if (state.geometry) {
            const mid = state.geometry.length / 2;
            const pt = this._pointAt(state.geometry, mid);
            const tan = this._tangentAt(state.geometry, mid);
            els.oldArrow.setAttribute('d', this._arrowPath(pt.x, pt.y, { x: -tan.x, y: -tan.y }));
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
      ? { pv:[220,230], grid:[220,640], inv:[600,435], home:[980,640], batt:[980,230] }
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
      const cx1 = x1 + dx * bend;
      const cy1 = y1 + dy * 0.3;
      const cx2 = x2 - dx * bend;
      const cy2 = y2 - dy * 0.3;
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
    const invAttachY = (side, sign) => N.inv[1] + sign * (ringR * 0.45);
    const pvToInv = layout === 'left_right'
      ? curve(edge.pv.r, N.pv[1], edge.inv.l, invAttachY('left', -1), 0.45)
      : straight(N.pv[0], edge.pv.b, N.inv[0], edge.inv.t);
    const gridToInv = layout === 'left_right'
      ? curve(edge.grid.r, N.grid[1], edge.inv.l, invAttachY('left', 1), 0.45)
      : straight(edge.grid.r, N.grid[1], edge.inv.l, N.inv[1]);
    const invToGrid = layout === 'left_right'
      ? curve(edge.inv.l, invAttachY('left', 1), edge.grid.r, N.grid[1], 0.45)
      : straight(edge.inv.l, N.inv[1], edge.grid.r, N.grid[1]);
    const invToHome = layout === 'left_right'
      ? curve(edge.inv.r, invAttachY('right', 1), edge.home.l, N.home[1], 0.45)
      : straight(edge.inv.r, N.inv[1], edge.home.l, N.home[1]);
    const battToInv = layout === 'left_right'
      ? curve(edge.batt.l, N.batt[1], edge.inv.r, invAttachY('right', -1), 0.45)
      : straight(N.batt[0], edge.batt.t, N.inv[0], edge.inv.b);
    const invToBatt = layout === 'left_right'
      ? curve(edge.inv.r, invAttachY('right', -1), edge.batt.l, N.batt[1], 0.45)
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
          .pf-flow-line-bg{fill:none;stroke-linecap:round;stroke-width:5;opacity:.34;filter:url(#pf-line-glow)}
          .pf-flow-active{stroke-width:4!important}
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

customElements.define("deye-energy-card", DeyeEnergyCard);
customElements.define("deye-energy-inverter-config-card", DeyeEnergyInverterConfigCard);
customElements.define("deye-energy-trigger-logs-card", DeyeEnergyTriggerLogsCard);
customElements.define("deye-energy-graphs-card", DeyeEnergyGraphsCard);
customElements.define("deye-energy-power-flow-card", DeyeEnergyPowerFlowCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "deye-energy-card",
  name: "Deye Energy",
  description: "Deye Energy 0.8.1.05",
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
