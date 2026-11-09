from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def _leaf_keys(value, prefix=""):
    if isinstance(value, dict):
        result = set()
        for key, child in value.items():
            result.update(_leaf_keys(child, f"{prefix}.{key}" if prefix else key))
        return result
    return {prefix}


class ReleaseVersionTests(unittest.TestCase):
    def test_backend_manifest_is_080(self):
        manifest = json.loads(
            (ROOT / "custom_components" / "deye_energy" / "manifest.json").read_text(
                encoding="utf-8-sig"
            )
        )
        self.assertEqual("0.8.0", manifest["version"])

    def test_frontend_copies_and_versions_are_consistent(self):
        paths = (
            ROOT / "custom_components" / "deye_energy" / "www" / "deye-energy-card.js",
            ROOT / "www" / "deye-energy-card.js",
        )
        self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
        source = paths[0].read_text(encoding="utf-8-sig")
        self.assertTrue(source.startswith("// Resource revision: v=0.8.0.44"))
        self.assertIn('version: "0.8.0"', source)
        self.assertIn('integration_version || "0.8.0"', source)
        self.assertIn("Deye Energy 0.8.0", source)
        self.assertIn("card 0.8.0 (resource revision v=0.8.0.44)", source)

    def test_docs_and_dashboard_use_current_release(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8-sig")
        install = (ROOT / "INSTALL.md").read_text(encoding="utf-8-sig")
        dashboard = (ROOT / "dashboard" / "energy_manager.yaml").read_text(encoding="utf-8-sig")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8-sig")
        release_notes = (ROOT / "RELEASE_NOTES_0.8.0.md").read_text(encoding="utf-8-sig")
        self.assertIn("version-0.8.0", readme)
        self.assertIn("deye-energy-card.js?v=0.8.0.44", readme)
        self.assertIn("Deye Energy 0.8.0", install)
        self.assertIn("deye-energy-card.js?v=0.8.0.44", install)
        self.assertIn("(v=0.8.0.44)", dashboard)
        self.assertIn("## [0.8.0]", changelog)
        self.assertIn("# Deye Energy 0.8.0", release_notes)
        self.assertIn("v=0.8.0.44", release_notes)

    def test_target_release_identity_is_consistent(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        install = (ROOT / "INSTALL.md").read_text(encoding="utf-8")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        combined = "\n".join((readme, install, changelog))
        self.assertIn("Deye Energy 0.8.0", combined)
        self.assertIn("v=0.8.0.44", combined)
        for stale in ("v=24", "v=25", "v=26", "v=078", "v=079", "v=0.7.7", "v=0.7.8"):
            self.assertNotIn(f"deye-energy-card.js?{stale}", combined)

    def test_translation_key_sets_are_complete(self):
        translation_root = ROOT / "custom_components" / "deye_energy"
        documents = [
            json.loads((translation_root / "translations" / "en.json").read_text(encoding="utf-8-sig")),
        ]
        self.assertTrue(_leaf_keys(documents[0]))


if __name__ == "__main__":
    unittest.main()
