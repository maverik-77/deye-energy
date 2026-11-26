from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
CARD_PATHS = (
    ROOT / "custom_components" / "deye_energy" / "www" / "deye-energy-card.js",
    ROOT / "www" / "deye-energy-card.js",
)


def extract_method(source: str, signature: str) -> str:
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 0
    quote = None
    escaped = False
    for index in range(opening, len(source)):
        character = source[index]
        if quote:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in ('"', "'", "`"):
            quote = character
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"Method end not found: {signature}")


def extract_between(source: str, start_signature: str, end_signature: str) -> str:
    start = source.index(start_signature)
    end = source.index(end_signature, start)
    return source[start:end]


class FrontendDefaultRestoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = [path.read_text(encoding="utf-8") for path in CARD_PATHS]

    def test_distributed_card_copies_are_identical(self):
        self.assertEqual(CARD_PATHS[0].read_bytes(), CARD_PATHS[1].read_bytes())

    def test_card_sources_declare_current_resource_revision(self):
        frontend = (ROOT / "custom_components" / "deye_energy" / "frontend.py").read_text(encoding="utf-8")
        import re as _re
        rev = _re.search(r'^CARD_RESOURCE_REVISION = "([^"]+)"', frontend, _re.M).group(1)
        for source in self.sources:
            self.assertTrue(source.startswith(f"// Resource revision: v={rev}\n"))

    def test_tou_table_is_the_simple_24h_to_six_tou_ranges(self):
        for source in self.sources:
            table = extract_method(source, "renderTouSettingsContent(slots)")
            self.assertIn("Edit the six rows below", table)
            self.assertIn("The first From and last To are fixed at 00:00", table)
            self.assertIn("Values are loaded from the inverter", table)
            self.assertIn("<th>SOC</th>", table)
            self.assertNotIn(
                "Minimum sell SOC</strong> is a logical Manager protection",
                source,
            )
            self.assertIn("mappingPlanDiagnostics()", source)
            self.assertIn("const backendPlan = this.mappingPlanDiagnostics()", source)
            self.assertIn("No complete Deye Time Of Use mapping", source)

    def test_tou_table_uses_only_confirmed_backend_reads(self):
        for source in self.sources:
            rows_method = extract_method(source, "mappingRowsFromDiagnostics()")
            self.assertIn("this.physicalTouDiagnostics()", rows_method)
            self.assertIn("this.mappingPlanDiagnostics()", rows_method)
            self.assertIn("this.mappingLiveValue(", rows_method)
            self.assertIn("touCapabilitiesDiagnostics()", source)
            self.assertIn("mappingTouEntityIds()", source)
            self.assertNotIn("physical.actual_soc ?? this.numberState(tou.soc)", source)

    def test_apply_defaults_uses_one_backend_service_call_only(self):
        method = extract_method(self.sources[0], "async applyDefaultValues()")
        self.assertEqual(method.count("this.callService("), 1)
        self.assertIn(
            'this.callService("deye_energy", "restore_defaults", {})',
            method,
        )
        for forbidden in (
            "select_option",
            "set_value",
            "default_work_mode",
            "default_sell_power",
            "default_discharge_current",
            "default_charge_current",
            "default_grid_charge_current",
            "Zero Export To Load",
            "numberState(",
        ):
            self.assertNotIn(forbidden, method)

    def test_apply_defaults_blocks_duplicates_and_reports_all_states(self):
        method = extract_method(self.sources[0], "async applyDefaultValues()")
        for required in (
            "if (this._defaultsApplying) return false",
            "Applying default settings…",
            "Default settings applied",
            "Could not confirm the complete set of default settings",
        ):
            self.assertIn(required, method)
        self.assertIn("data-default-action", self.sources[0])
        self.assertIn("button.disabled = this._defaultsApplying", self.sources[0])

    def test_restore_defaults_reuses_the_same_backend_path(self):
        method = extract_method(self.sources[0], "async restoreDefaults()")
        self.assertIn("return this.applyDefaultValues()", method)
        self.assertNotIn("callService", method)
        self.assertIn('data-default-label="Stop Manager and apply defaults"', self.sources[0])


    def test_resume_manager_uses_dedicated_backend_service(self):
        method = extract_method(self.sources[0], "async resumeManager()")
        self.assertEqual(method.count("this.callService("), 1)
        self.assertIn('this.callService("deye_energy", "resume_manager", {})', method)
        self.assertIn("data-resume-manager", self.sources[0])
        self.assertIn("SCHEDULE APPLY ERROR", self.sources[0])

    def test_ai_overlay_is_removed_from_the_card(self):
        source = self.sources[0]
        for marker in (
            "renderAiDialog(",
            "data-open-ai",
            "ai-dialog-v2",
            "aiSuggestions(",
            "saveAiAnalysis(",
            "aiSettings(",
            "aiHistory(",
            "aiUiText(",
            "save_future_plan",
            "cancel_future_plan",
            "Optimizer shadow",
            "renderAiExplanation",
            "data-ai-chart-point",
            "data-ai-weather-mode",
        ):
            self.assertNotIn(marker, source)

    def test_deye_mode_shows_raw_system_work_mode(self):
        source = self.sources[0]
        update = extract_method(source, "updateDynamicValues() {")
        entity_lookup = extract_method(source, "deyeWorkModeEntity()")
        state_lookup = extract_method(source, "deyeWorkModeState() {")
        # Must read the physical Deye select (or its configured mapping), not the manager selector.
        self.assertIn('"select.deye_inverter_system_work_mode"', entity_lookup)
        self.assertIn("this.config?.entities?.system_work_mode", entity_lookup)
        self.assertIn("this.exists(entityId)", entity_lookup)
        self.assertIn('"unavailable"', state_lookup)
        self.assertIn('"unknown"', state_lookup)
        self.assertIn('"enabled"', state_lookup)
        self.assertIn('"disabled"', state_lookup)
        self.assertIn("const currentModeValue = this.deyeWorkModeState()", update)
        self.assertIn("data-live='deye-mode'", update)
        self.assertIn('currentModeValue || "—"', update)
        self.assertNotIn("slotModeLabel(currentModeValue)", update)
        self.assertNotIn("energyFlowPanel()", source)

    def test_documentation_uses_card_cache_revision(self):
        for name in ("README.md", "INSTALL.md"):
            source = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn("/deye_energy/deye-energy-card.js", source)
            self.assertNotIn("deye-energy-card.js?v=22", source)
            self.assertNotIn("deye-energy-card.js?v=10", source)
            self.assertNotIn("deye-energy-card.js?v=09", source)
            self.assertNotIn("deye-energy-card.js?v=08", source)
            self.assertNotIn("deye-energy-card.js?v=07", source)
            self.assertNotIn("deye-energy-card.js?v=0780", source)
            self.assertNotIn("deye-energy-card.js?v=0778", source)
            self.assertNotIn("deye-energy-card.js?v=0777", source)
            self.assertNotIn("deye-energy-card.js?v=0774", source)
            self.assertNotIn("deye-energy-card.js?v=0773", source)
            self.assertNotIn("deye-energy-card.js?v=0772", source)
            self.assertNotIn("deye-energy-card.js?v=0765", source)

    def test_dashboard_yaml_includes_layout_examples(self):
        yaml_path = ROOT / "dashboard" / "energy_manager.yaml"
        self.assertTrue(yaml_path.exists(), "dashboard/energy_manager.yaml must exist")
        source = yaml_path.read_text(encoding="utf-8")
        for key in (
            "layout:",
            "layout_mode:",
            "sections:",
            "dashboard_width:",
            "mobile:",
            "flow_animation_speed:",
            "prices_ratio:",
            "buy_prices_ratio:",
            "solcast_ratio:",
        ):
            self.assertIn(key, source)

    def test_card_has_explicit_direct_edit_path_for_physical_tou_entities(self):
        source = self.sources[0]
        tou_table = extract_method(source, "renderTouSettingsContent(slots)")
        for required in (
            'data-mapping-field="${field}"',
            'data-mapping-field="soc" data-mapping-slot=',
            'selectCell(row.slot, "mode"',
            'selectCell(row.slot, "charge"',
            'data-mapping-field="sell" data-mapping-slot=',
            'numberCell("power")',
            'numberCell("voltage")',
            'data-refresh-mapping="1"',
            'data-edit-mapping="1"',
            'data-cancel-mapping="1"',
            'data-save-mapping="1"',
            '"Refresh"',
            '>Edit</button>',
            '>Cancel</button>',
            '"Save"',
            'Values are loaded from the inverter',
            'this._mappingEditing',
        ):
            self.assertIn(required, tou_table)
        self.assertNotIn("data-open-tou", source)
        self.assertNotIn("data-save-tou", source)
        self.assertNotIn("async savePhysicalTouSlot(slot)", source)

    def test_tou_edit_and_rollback_controls_are_bound_on_the_page(self):
        for source in self.sources:
            dialog = extract_method(source, "bindDialogControls(slots) {")
            dashboard = extract_method(source, "bindDashboardControls(slots) {")
            self.assertIn('root.querySelectorAll("[data-mapping-field]")', dashboard)
            self.assertIn("this.collectMappingDraft()", dashboard)
            self.assertIn('root.querySelectorAll("[data-save-mapping]")', dashboard)
            self.assertIn("this.saveMappingToInverter()", dashboard)
            self.assertIn('root.querySelectorAll("[data-refresh-mapping]")', dashboard)
            self.assertIn("this.rollbackTouTable()", dashboard)
            self.assertNotIn("[data-save-mapping]", dialog)

            rollback = extract_method(source, "async rollbackTouTable()")
            self.assertIn("this.refreshMappingFromInverter()", rollback)
            self.assertIn("Restored all rows from the inverter.", rollback)
            refresh = extract_between(source, "async refreshMappingFromInverter(", "collectMappingDraft()")
            self.assertIn('"homeassistant", "update_entity"', refresh)
            self.assertIn("mappingTouEntityIds()", refresh)

    def test_unconfirmed_logical_tou_soc_never_renders_as_zero(self):
        source = self.sources[0]
        number_state = extract_method(source, "numberState(entityId, fallback = \"0\")")
        self.assertIn('value === "unknown" || value === "unavailable" ? fallback : value', number_state)
        segments = extract_method(source, "  scheduleSegments(slots) {")
        self.assertIn('this.numberState(entities.touSoc, "")', segments)
        self.assertNotIn('this.numberState(entities.touSoc, 0)', segments)
        self.assertNotIn('◇ ${touSoc}%', source)
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        self.assertIn('this.slotDraftInput("tou_soc", "%")', dialog)
        self.assertNotIn("this.numberInput(entities.touSoc", dialog)

    def test_mapping_table_shows_only_physical_tou_fields(self):
        source = self.sources[0]
        mapping = extract_method(source, "  scheduleSegments(slots) {")
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        self.assertIn("touSoc: this.asNumber(item.tou_soc)", mapping)
        self.assertIn("chargeEnabled: Boolean(item.grid_charge)", mapping)
        tou = extract_method(source, "renderTouSettingsContent(slots)")
        for header in ("<th>Mode</th>", "<th>Charge</th>", "<th>Sell</th>", "<th>Power</th>", "<th>Voltage</th>", "<th>SOC</th>"):
            self.assertIn(header, tou)
        self.assertIn('selectCell(row.slot, "mode"', tou)
        self.assertIn('selectCell(row.slot, "charge"', tou)
        self.assertIn('data-mapping-field="sell"', tou)
        self.assertIn('numberCell("power")', tou)
        self.assertIn('numberCell("voltage")', tou)
        self.assertNotIn('>Grid charging<', tou)
        self.assertNotIn("<th>Function</th>", dialog)

    def test_settings_menu_has_only_tariff_and_system_tabs(self):
        source = self.sources[0]
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        self.assertIn('tabButton("tariff", "Tariff and distribution")', dialog)
        self.assertIn('tabButton("system", "System and diagnostics")', dialog)
        for removed in (
            'tabButton("defaults"',
            'tabButton("history"',
            "Mode settings",
            "History and data",
            "data-save-default-settings",
            "data-save-charge-profile",
            "data-save-normal-profile",
            "renderHistoryTab()",
        ):
            self.assertNotIn(removed, dialog)
        self.assertIn('const tab = this._settingsTab || "tariff";', dialog)
        self.assertIn('this._settingsTab = "tariff";', source)
        self.assertIn('tab && tab !== "1" ? tab : "tariff"', source)

    def test_charge_slot_is_editable_and_profile_is_only_a_template(self):
        source = self.sources[0]
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        for required in (
            'slotDraftInput("tou_soc"',
            'slotDraftSelect("charge_enabled"',
            'data-draft-charge-profile="1"',
        ):
            self.assertIn(required, dialog)
        for forbidden in (
            'slotDraftInput("charge_current"',
            'slotDraftInput("discharge_current"',
            'slotDraftInput("grid_charge_current"',
        ):
            self.assertNotIn(forbidden, dialog)
        self.assertIn("const isSelling", dialog)
        self.assertIn("const socField", dialog)
        self.assertEqual(dialog.count("${socField}"), 1)
        self.assertNotIn("this.callService(", dialog)

    def test_card_uses_english_manager_modes(self):
        source = self.sources[0]
        start = source.index("  slotWorkModes() {")
        method = source[start : source.index("\n  }", start) + 4]
        for mode in (
            "Normal Operation",
            "Selling",
            "Charging",
        ):
            self.assertIn(mode, method)
        self.assertNotIn("Zero Export To Load", method)
        self.assertNotIn("Zero Export To CT", method)

    def test_slot_modes_use_display_labels(self):
        source = self.sources[0]
        mode_meta = extract_method(source, "modeMeta(mode, enabled = true)")
        self.assertIn('title: "Selling"', mode_meta)
        self.assertIn('title: "Normal Operation"', mode_meta)
        self.assertIn('title: "Charging"', mode_meta)
        self.assertIn('title: "Disabled"', mode_meta)
        self.assertIn('subtitle: "Normal operation mode"', mode_meta)
        self.assertIn('subtitle: "Slot inactive"', mode_meta)

    def test_slot_mode_selectors_use_canonical_english_values(self):
        source = self.sources[0]
        self.assertIn("slotModeLabel(mode)", source)
        self.assertIn("slotModeOptions()", source)
        self.assertIn("this.slotWorkModes().map((mode) => [mode, this.slotModeLabel(mode)])", source)
        self.assertIn("this.slotModeOptions(), bulk.mode)", source)
        self.assertNotIn('this.rawSelect("multi-mode", this.slotWorkModes(), bulk.mode)', source)

    def test_zero_export_physical_modes_display_as_normal_operation(self):
        normalizer = extract_method(self.sources[0], "  normalizeManagerMode(value) {")
        mode_meta = extract_method(self.sources[0], "modeMeta(mode, enabled = true)")
        self.assertIn('"Zero Export To Load": "Normal Operation"', normalizer)
        self.assertIn('"Zero Export To CT": "Normal Operation"', normalizer)
        self.assertIn('this.normalizeManagerMode(mode)', mode_meta)
        self.assertIn('title: "Normal Operation"', mode_meta)
        self.assertIn('cls: "normal"', mode_meta)
        label_method = extract_method(self.sources[0], "slotModeLabel(mode)")
        self.assertIn('this.normalizeManagerMode(mode)', label_method)

    def test_card_labels_successful_rollback_as_restored(self):
        for source in self.sources:
            rollback = extract_method(source, "async rollbackTouTable()")
            self.assertIn('"Restored all rows from the inverter."', rollback)

    def test_card_uses_backend_normal_profile_labels_in_slot_editor(self):
        source = self.sources[0]
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        self.assertIn(
            'this.slotDraftSelect("physical_work_mode", this.normalProfileModeOptions())',
            dialog,
        )
        self.assertNotIn('["Zero Export To Load", "Export disabled — Load measurement"]', dialog)
        self.assertNotIn('["Zero Export To CT", "Export disabled — CT measurement"]', dialog)

    def test_card_uses_english_charge_profile_label(self):
        self.assertIn("Charging profile target SOC", self.sources[0])
        self.assertNotIn("Docelowy SOC profilu Charge", self.sources[0])

    def test_card_does_not_expose_zero_export_provider_values_as_user_labels(self):
        dialog = extract_method(self.sources[0], "renderDialog(slots, touStarts)")
        self.assertNotIn('["Zero Export To Load", "Zero Export To Load"]', dialog)
        self.assertNotIn('["Zero Export To CT", "Zero Export To CT"]', dialog)

    def test_card_mapping_does_not_depend_on_legacy_schedule_function(self):
        mapping = extract_method(self.sources[0], "scheduleSegments(slots)")
        dialog = extract_method(self.sources[0], "renderDialog(slots, touStarts)")
        self.assertNotIn("schedule_function", mapping)
        self.assertNotIn("<th>Function</th>", dialog)

    def test_disabled_state_is_not_a_work_mode_option(self):
        source = self.sources[0]
        dialog = extract_method(source, "renderDialog(slots, touStarts)")
        self.assertIn('slotDraftSelect("mode", this.slotModeOptions())', dialog)
        self.assertNotIn("Disabled", dialog)

    def test_schedule_table_displays_stored_grid_permission(self):
        source = self.sources[0]
        row = extract_method(source, "renderManualScheduleRow(row, index, rows, modeOptions)")
        self.assertIn('data-label="Grid charging" class="metric grid"', row)
        self.assertIn('selectControl("charge_enabled", [["false", "No"], ["true", "Yes"]])', row)
        self.assertIn('row.charge_enabled ? "yes" : "no"', row)
        self.assertNotIn("gridChargeLabel", source)
        self.assertNotIn("gridChargeCurrent", source)
        self.assertNotIn("not applicable", source)

    def test_settings_dialog_scrolls_on_desktop_tablet_and_phone(self):
        source = self.sources[0]
        self.assertIn(".settings-content{min-width:0;overflow:auto", source)
        self.assertIn("@media(max-width:980px)", source)
        self.assertIn(".settings-layout{grid-template-columns:1fr", source)
        self.assertIn("@media(max-width:620px)", source)
        self.assertIn(".settings-content{padding:9px}", source)

    def test_diagnostics_show_logical_and_physical_soc_separately(self):
        method = extract_method(self.sources[0], "renderDiagnostics(slots)")
        for required in (
            "active_slot_control",
            "physical_tou",
            "minimum_sell_soc",
            "tou_soc",
            "charge_profile_target_soc",
            "effective_tou_soc",
            "physical_soc_actual",
            "grid_charge_expected",
            "grid_charge_actual",
        ):
            self.assertIn(required, method)
        self.assertNotIn('"currents"', method)

    def test_layout_config_has_defaults_and_mobile_overrides(self):
        source = self.sources[0]
        method = extract_method(source, "layoutConfig() {")
        for required in (
            'layout_mode: "auto"',
            "dashboard_width: 1280",
            "center_dashboard: true",
            "fit_to_width: false",
            "allow_horizontal_scroll: false",
            "prices_ratio: 0.80",
            "buy_prices_ratio: 0.80",
            "solcast_ratio: 1.40",
            "flow_animation_speed: 6",
            'mobile: {',
            'mode: "auto"',
            "mobile_breakpoint: 768",
        ):
            self.assertIn(required, method)
        # Validation helpers
        self.assertIn("asString(", method)
        self.assertIn("asNumber(", method)
        self.assertIn("asBool(", method)
        self.assertIn("clamp(", method)

    def test_render_uses_layout_config_for_dashboard(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        self.assertIn("const layout = this.effectiveLayout();", render)
        self.assertIn(r'dashStyle.push(layout.is_mobile ? "max-width:100%" : `max-width:${layout.dashboard_width}px`)', render)
        self.assertIn('dashStyle.push("min-width:0")', render)
        self.assertIn('dashStyle.push("box-sizing:border-box")', render)
        self.assertIn('if (layout.center_dashboard) dashStyle.push("margin:0 auto")', render)
        self.assertIn('if (layout.fit_to_width || layout.is_mobile) dashStyle.push("width:100%")', render)
        self.assertIn('if (layout.allow_horizontal_scroll) {', render)
        self.assertIn('dashStyle.push("overflow-x:auto")', render)
        self.assertIn('dashStyle.push("overflow-x:hidden")', render)
        self.assertIn('layout.is_mobile ? "grid-template-columns:minmax(0,1fr)"', render)
        self.assertIn(r"grid-template-columns:${layout.prices_ratio}fr ${layout.buy_prices_ratio}fr ${layout.solcast_ratio}fr", render)
        self.assertIn('if (layout.layout_mode === "grid" && layout.grid_columns)', render)
        self.assertIn("const showPrices = isSingle ? layout.section === \"prices\" : layout.sections.prices;", render)
        self.assertIn("const showSolcast = isSingle ? layout.section === \"solcast\" : layout.sections.solcast;", render)
        self.assertIn("if (isSingle && [\"settings\"].includes(layout.section) && !this._dialog)", render)
        self.assertIn('<div class="dem-v073" style="${demStyle}">', render)
        self.assertIn("${infoGridSection}", render)
        self.assertNotIn("status_energy", render)
        self.assertNotIn("${statusSection}", render)
        # Mobile-safe min-width/max-width reset
        self.assertIn(".dem-v073>*,.info-grid>*,.panel,.schedule-shell,.sales-panel{min-width:0;max-width:100%;box-sizing:border-box}", render)
        self.assertIn(".dem-v073{padding:18px;display:grid;gap:16px;margin:0 auto;max-width:1280px;min-width:0;box-sizing:border-box", render)
        self.assertIn("${scheduleSection}", render)
        self.assertIn("${salesSection}", render)

    def test_dialog_host_renders_outside_dashboard_container(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        # Dialog host must be a sibling of .dem-v073, not inside it.
        self.assertIn('</div>\n          <div class="dialog-host">${this.renderDialog(slots, touStarts)}</div>', render)
        self.assertIn("this._lastSlots = slots;", render)
        self.assertIn("this._lastTouStarts = touStarts;", render)

    def test_render_dialog_only_updates_dialog_independently(self):
        source = self.sources[0]
        method = extract_method(source, "renderDialogOnly() {")
        for required in (
            "if (!this._lastSlots) return;",
            'const host = this.querySelector(".dialog-host");',
            "host.innerHTML = this.renderDialog(this._lastSlots, this._lastTouStarts);",
            "this.bindDialogControls(this._lastSlots);",
            "this.restoreScrollPositions();",
        ):
            self.assertIn(required, method)

    def test_effective_layout_reports_mobile_flag(self):
        source = self.sources[0]
        method = extract_method(source, "effectiveLayout() {")
        self.assertIn("const isMobile = this.isMobileLayout(layout) && !layout.mobile.preserve_desktop_layout;", method)
        self.assertIn("layout.is_mobile = isMobile;", method)
        self.assertIn("if (isMobile) {", method)

    def test_mobile_detection_uses_card_width_and_viewport(self):
        source = self.sources[0]
        method = extract_method(source, "isMobileLayout(layout) {")
        self.assertIn("const viewportWidth = window.innerWidth || 0;", method)
        self.assertIn("const hostWidth = this.clientWidth", method)
        self.assertIn("Math.min(hostWidth, viewportWidth)", method)
        self.assertIn("layout.mobile.mobile_breakpoint", method)

    def test_desktop_info_grid_uses_yaml_ratios(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        # Desktop path keeps proportional ratios
        self.assertIn(r"grid-template-columns:${layout.prices_ratio}fr ${layout.buy_prices_ratio}fr ${layout.solcast_ratio}fr", render)
        # Mobile path collapses to single column
        self.assertIn('layout.is_mobile ? "grid-template-columns:minmax(0,1fr)"', render)

    def test_allow_horizontal_scroll_false_hides_global_overflow(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        self.assertIn('dashStyle.push("overflow-x:hidden")', render)

    def test_local_scroll_containers_preserved(self):
        source = self.sources[0]
        # The schedule shell cannot grow the card; only its table container scrolls.
        self.assertIn(".schedule-shell{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden", source)
        self.assertIn(".schedule-table-card{width:100%;max-width:100%;min-width:0;box-sizing:border-box", source)
        self.assertIn("overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain", source)
        self.assertIn(".schedule-table{min-width:", source)
        # Solcast days can scroll horizontally on mobile
        self.assertIn(".solcast-days{display:grid;grid-template-columns:repeat(7,minmax(58px,1fr))", source)
        self.assertIn(".solcast-days{display:flex;max-width:100%;gap:6px;overflow-x:auto;overscroll-behavior-x:contain", source)
        self.assertIn(".solcast-panel{width:100%;max-width:100%;min-width:0;overflow:hidden", source)
        self.assertIn(".solcast-bars{height:138px;min-width:0;width:100%;max-width:100%", source)
        self.assertNotIn(".solcast-bars{height:138px;min-width:560px}", source)
        # Price table scrolls inside its own card
        self.assertIn(".price-scroll{height:auto;flex:0 0 auto;min-height:0;overflow:visible", source)
        self.assertIn(".price-scroll{height:260px;overflow:auto", source)

    def test_ai_dialog_css_is_removed(self):
        source = self.sources[0]
        for marker in (
            ".ai-dialog-v2",
            ".ai-shell",
            ".ai-sidebar",
            ".ai-main",
            ".ai-metric-card",
            ".ai-chart-card",
            ".settings-dialog .ai-shell",
            ".settings-dialog .ai-main",
        ):
            self.assertNotIn(marker, source)

    def test_ai_dialog_tabs_and_renderer_are_removed(self):
        source = self.sources[0]
        for marker in (
            ".ai-dialog-v2 .ai-sidebar nav",
            "renderAiDialog(slots)",
            "data-ai-explanation-day",
            "Proposed changes",
            "Why this plan?",
            "Plan and actual",
        ):
            self.assertNotIn(marker, source)

    def test_plan_execution_ui_is_removed(self):
        source = self.sources[0]
        for marker in (
            "renderAiPlanExecution(",
            "renderAiExecutionChart",
            "renderAiExecutionTable",
            "async loadAiExecutionDay(dateKey)",
            'service: "get_plan_execution"',
            "The plan is a frozen Optimizer Core proposal",
        ):
            self.assertNotIn(marker, source)

    def test_plan_explanation_ui_is_removed(self):
        source = self.sources[0]
        for marker in (
            "renderAiExplanation(planner)",
            'data-ai-explanation-day="today"',
            'data-ai-explanation-day="tomorrow"',
            "profile.day_summaries?.[day]",
            "this.aiPlannedSlotPower(source)",
            "Additional optimizer suggestions",
            "does not count towards fulfilment of the user profile target",
            "Today's morning selling window has already ended",
        ):
            self.assertNotIn(marker, source)

    def test_ai_execution_table_is_removed(self):
        source = self.sources[0]
        for marker in (
            "renderAiExecutionTable(data, planOnly = false)",
            "Plan: buy / selling",
            "Wykonanie: kupno / selling",
            "row.effective_buy_price",
            "row.sell_price",
            "actual.buy_price_gbp_kwh",
            "actual.sell_price_gbp_kwh",
            'colspan="2" class="ai-exec-col-error"',
        ):
            self.assertNotIn(marker, source)

    def test_ai_charts_tables_and_weather_ui_is_removed(self):
        source = self.sources[0]
        for marker in (
            ".ai-dialog-v2 .ai-plan-table-wrap",
            ".ai-dialog-v2 .ai-crisp-chart",
            ".ai-plan-table{",
            ".ai-chart-v2 svg{",
            ".ai-dialog-v2 .ai-weather-day",
            ".ai-dialog-v2 .ai-weather-source",
        ):
            self.assertNotIn(marker, source)

    def test_ai_dialog_switching_is_removed_but_dialog_only_render_remains(self):
        source = self.sources[0]
        for marker in (
            '["overview",',
            '["proposals",',
            '["quality",',
            "renderAiDialog(slots)",
            '<section class="dialog ai-dialog ai-dialog-v2"',
        ):
            self.assertNotIn(marker, source)
        self.assertIn("renderDialogOnly()", source)
        self.assertIn("this.renderDialogOnly();", source)

    def test_layout_mode_grid_columns_one_on_mobile(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        self.assertIn('grid-template-columns:repeat(${layout.grid_columns},minmax(0,1fr))', render)

    def test_control_master_is_shown_in_schedule_header_and_status_panel(self):
        source = self.sources[0]
        render = extract_method(source, "renderManualScheduleTab() {")
        binding = extract_method(source, "bindDashboardControls(slots)")
        update = extract_method(source, "updateDynamicValues() {")
        self.assertIn('data-control-toggle="1"', render)
        self.assertIn("Deye control — ${this.escapeHtml(control.status)}", render)
        self.assertIn("const control = this.controlState()", render)
        self.assertIn("[data-control-toggle]", binding)
        self.assertIn("this.toggleControl()", binding)
        self.assertIn("data-live='decision-reason'", update)
        self.assertIn('this.entity("sensor", "decision_reason")', update)
        for removed in (
            "planned_manager_action",
            "executed_manager_action",
            "Planned decision",
            "Executed decision",
        ):
            self.assertNotIn(removed, source)

    def test_manual_schedule_header_shares_settings_and_control_buttons(self):
        source = self.sources[0]
        render = extract_method(source, "renderManualScheduleTab() {")
        self.assertIn('data-control-toggle="1"', render)
        self.assertIn("Deye control — ${this.escapeHtml(control.status)}", render)
        self.assertIn('data-open-settings="1"', render)
        self.assertIn('class="gear-btn"', render)
        self.assertIn('class="schedule-table manual-schedule-table"', render)
        row = extract_method(source, "renderManualScheduleRow(row, index, rows, modeOptions) {")
        self.assertIn("data-manual-edit=", row)
        self.assertIn("data-manual-remove=", row)

    def test_manual_schedule_current_row_glow_is_rendered_and_live(self):
        for source in self.sources:
            helper = extract_method(source, "manualScheduleCurrentRowIndex(rows, now = new Date()) {")
            self.assertIn("localMinuteOfDay(now)", helper)
            self.assertIn("minutesFromClock(row.from)", helper)
            self.assertIn("minutesFromClock(row.to)", helper)
            self.assertIn("end = 1440", helper)

            row = extract_method(source, "renderManualScheduleRow(row, index, rows, modeOptions) {")
            self.assertIn('current ? "time-current" : ""', row)

            dynamic = extract_method(source, "updateDynamicValues() {")
            self.assertIn("manualScheduleCurrentRowIndex(this.ensureManualScheduleDraft())", dynamic)
            self.assertIn('[data-manual-row]', dynamic)
            self.assertIn(
                '"time-current", Number(row.getAttribute("data-manual-row")) === currentManualRow',
                dynamic,
            )

            self.assertIn(".manual-schedule-table tr.time-current td", source)
            self.assertIn("background:transparent", source)
            self.assertIn("box-shadow:none", source)
            self.assertIn("@keyframes manual-time-current-text-glow", source)
            self.assertIn("@keyframes manual-time-current-icon-glow", source)
            self.assertIn("2.4s ease-in-out infinite", source)
            self.assertIn("text-shadow:0 0 0 rgba(255,166,45,0)", source)
            self.assertIn("0 0 4px rgba(255,244,214,.95)", source)
            self.assertIn("0 0 10px rgba(255,176,58,.95)", source)
            self.assertIn("0 0 18px rgba(255,140,0,.55)", source)
            self.assertIn("filter:drop-shadow(0 0 0 rgba(255,166,45,0))", source)
            self.assertIn("drop-shadow(0 0 8px rgba(255,166,45,.85))", source)
            self.assertNotIn("@keyframes manual-time-current-row", source)
            self.assertNotIn("@keyframes manual-time-current-cell", source)

    def test_schedule_source_captions_are_live_in_both_status_layouts(self):
        source = self.sources[0]
        helper = extract_method(source, "scheduleSourceLabel() {")
        self.assertIn("schedule_source", helper)
        self.assertIn('"Manual schedule"', helper)
        self.assertIn('"Schedule slots"', helper)
        dynamic = extract_method(source, "updateDynamicValues() {")
        self.assertIn("const scheduleSourceLabel = this.scheduleSourceLabel();", dynamic)
        self.assertEqual(dynamic.count("[data-live='executed-schedule-source']"), 1)
        self.assertEqual(dynamic.count("[data-live='manager-schedule-source']"), 1)
        self.assertNotIn("energyFlowPanel()", source)

    def test_manager_mode_slot_follows_the_active_schedule_source(self):
        source = self.sources[0]
        helper = extract_method(source, "activeSlotTimeLabel(now = new Date()) {")
        self.assertIn("schedule_source", helper)
        self.assertIn('"manual"', helper)
        self.assertIn("manualScheduleBackend().rows", helper)
        self.assertIn("localMinuteOfDay(now)", helper)
        self.assertIn("row.from", helper)
        self.assertIn("row.to", helper)
        minutes = extract_method(source, "localMinuteOfDay(value = new Date()) {")
        self.assertIn('minute: "2-digit"', minutes)
        self.assertIn("hour === 24 ? 0 : hour", minutes)
        dynamic = extract_method(source, "updateDynamicValues() {")
        self.assertIn("const activeSlotLabel = this.activeSlotTimeLabel();", dynamic)
        self.assertIn('this.setText("[data-live=\'active-slot\']", activeSlotLabel);', dynamic)
        self.assertNotIn("energyFlowPanel()", source)

    def test_disabled_schedule_save_has_explicit_english_monitoring_message(self):
        method = extract_method(self.sources[0], "async applySchedulePatch(updates, options = null)")
        self.assertIn("this.slotControlEnabled()", method)
        self.assertNotIn('this.entity("switch", "control")', method)
        self.assertIn(
            "Changes were saved in the schedule. Deye control is disabled — they were not sent to the inverter.",
            method,
        )

    def test_configuration_import_never_restores_external_physical_entities_directly(self):
        source = self.sources[0]
        editable = extract_method(source, "editableConfigEntities()")
        snapshot = extract_method(source, "configurationSnapshot()")
        apply = extract_method(source, "async applyConfigurationSnapshot(snapshot)")
        self.assertNotIn("this.touEntities(", editable)
        self.assertIn('entityId.includes("deye_energy_")', editable)
        self.assertIn("physical_tou:", snapshot)
        self.assertIn('entityId.includes("deye_energy_")', apply)
        self.assertIn('this.callService("deye_energy", "set_tou_slot"', apply)
        self.assertIn("physicalTou.length && desiredControlOn", apply)
        self.assertIn("no physical TOU was sent to the inverter", apply)

    def test_dialog_host_and_dashboard_render_unchanged(self):
        source = self.sources[0]
        render = extract_method(source, "renderV073()")
        self.assertIn('</div>\n          <div class="dialog-host">${this.renderDialog(slots, touStarts)}</div>', render)
        self.assertIn("${infoGridSection}", render)
        self.assertIn("${scheduleSection}", render)
        self.assertIn("${salesSection}", render)
        self.assertNotIn("${statusSection}", render)
        self.assertNotIn("status_energy", render)


if __name__ == "__main__":
    unittest.main()
