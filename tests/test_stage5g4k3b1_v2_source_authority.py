from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "custom_components" / "deye_energy" / "price_sources.py"
SPEC = importlib.util.spec_from_file_location("stage5g4k3b1_price_sources", MODULE_PATH)
assert SPEC and SPEC.loader
price_sources = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = price_sources
SPEC.loader.exec_module(price_sources)






def test_clear_removes_binding_schema_adapter_and_provider_semantics() -> None:
    saved = price_sources.rebuild_price_contract(
        {}, "buy", "sensor.octopus_energy", "sensor.octopus_energy_tomorrow", "octopus_energy", "octopus_energy"
    )
    saved["today_binding"] = {"entity_id": "sensor.octopus_energy", "registry_entry_id": "old"}
    saved["resolved_schema_today"] = {"schema_id": "octopus_rates_v1"}
    cleared = price_sources.rebuild_price_contract(saved, "buy", "", "", "generic", "generic")
    assert cleared["today_entity"] == ""
    assert cleared["tomorrow_entity"] == ""
    assert cleared["resolved_adapter_today"] == "unmapped"
    assert cleared["resolved_source_today"] == {}
    assert cleared["resolved_schema_today"] == {}
    assert cleared["adapter_summary"] == "unmapped"


def test_custom_overrides_survive_same_mapping_but_not_entity_switch() -> None:
    custom = price_sources.rebuild_price_contract(
        {
            "source_adapter": "custom", "today_entity": "sensor.custom",
            "tomorrow_entity": "", "semantic_scope": "energy_only",
            "includes_distribution_variable": False, "price_basis": "gross",
            "unit": "GBP/kWh", "list_attribute": "hourly", "value_field": "amount",
        },
        "buy", "sensor.custom", "", "custom", "generic",
    )
    same = price_sources.rebuild_price_contract(
        custom, "buy", "sensor.custom", "", "generic", "generic"
    )
    changed = price_sources.rebuild_price_contract(
        custom, "buy", "sensor.other", "", "generic", "generic"
    )
    assert same["source_adapter"] == "custom"
    assert same["value_field"] == "amount"
    assert changed["source_adapter"] == "generic"
    assert changed["value_field"] == "price"
    assert changed["price_basis"] == "unknown"




def test_legacy_source_selector_is_not_runtime_authority_for_present_mapping_keys() -> None:
    manager_source = (ROOT / "custom_components" / "deye_energy" / "manager.py").read_text(encoding="utf-8")
    flow_source = (ROOT / "custom_components" / "deye_energy" / "config_flow.py").read_text(encoding="utf-8")
    assert 'if self.price_source == "none"' not in manager_source
    assert 'buy_source["source_adapter"] = adapter' not in manager_source
    assert 'vol.Optional(\n                    key,\n                    description={"suggested_value": default}' in flow_source
