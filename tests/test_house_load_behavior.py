import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_house_load_behavior() -> None:
    subprocess.run(
        ["node", str(ROOT / "tests" / "test_house_load.js")],
        cwd=ROOT,
        check=True,
    )
