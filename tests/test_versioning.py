from __future__ import annotations

import json
import re
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "custom_components" / "deye_energy"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


class ReleaseVersionTests(unittest.TestCase):
    def _manifest_version(self) -> str:
        manifest = json.loads(_read(PKG / "manifest.json"))
        return str(manifest["version"])

    def _frontend_revision(self) -> str:
        frontend = _read(PKG / "frontend.py")
        m = re.search(r'^CARD_RESOURCE_REVISION = "([^"]+)"', frontend, re.M)
        self.assertIsNotNone(m, "CARD_RESOURCE_REVISION missing in frontend.py")
        return m.group(1)

    def test_manifest_has_version(self):
        version = self._manifest_version()
        self.assertRegex(version, r"^\d+\.\d+\.\d+(\.\d+)?$")

    def test_frontend_revision_matches_manifest(self):
        self.assertEqual(self._frontend_revision(), self._manifest_version())

    def test_manager_diagnostics_version_matches_manifest(self):
        manager = _read(PKG / "manager.py")
        version = self._manifest_version()
        self.assertIn(f'"integration_version": "{version}"', manager)

    def test_frontend_copies_and_versions_are_consistent(self):
        for f in ["deye-energy-card.js","deye-energy-main-card.js","deye-energy-inverter-config-card.js","deye-energy-trigger-logs-card.js","deye-energy-graphs-card.js","deye-energy-power-flow-card.js"]:
            a = (PKG / "www" / f).read_bytes()
            b = (ROOT / "www" / f).read_bytes()
            self.assertEqual(a, b, f)
        source = _read(PKG / "www" / "deye-energy-card.js")
        revision = self._frontend_revision()
        self.assertTrue(source.startswith(f"// Resource revision: v={revision}\n"))
        self.assertIn(f"Deye Energy {revision}", source)
        self.assertIn('Deye Inverter Configuration', source)

    def test_docs_reference_canonical_resource_path(self):
        readme = _read(ROOT / "README.md")
        install = _read(ROOT / "INSTALL.md")
        release_notes = _read(ROOT / "RELEASE_NOTES_0.8.0.md")
        self.assertIn("/deye_energy/deye-energy-card.js", readme)
        self.assertIn("/deye_energy/deye-energy-card.js", install)
        self.assertIn("Deye Energy 0.8.0", release_notes)

    def test_no_stale_resource_versions_in_docs(self):
        combined = "\n".join(
            _read(p)
            for p in (ROOT / "README.md", ROOT / "INSTALL.md", ROOT / "CHANGELOG.md")
        )
        for stale in ("v=24", "v=25", "v=26", "v=078", "v=079", "v=0.7.7", "v=0.7.8"):
            self.assertNotIn(f"deye-energy-card.js?{stale}", combined)


if __name__ == "__main__":
    unittest.main()
