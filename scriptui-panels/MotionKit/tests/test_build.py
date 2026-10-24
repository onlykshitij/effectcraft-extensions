#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""build.py: Motion Kit.jsx and the library at the top of the output folder, the single panels
in extra/, and --check failing when any of them is missing or edited, or when a bundle the build
no longer writes (a single panel at the top level) is left behind. Runs in a temporary folder."""

import subprocess
import sys
import tempfile
from pathlib import Path

BUILD = Path(__file__).resolve().parent.parent / "build.py"
passed = 0


def check(ok, what):
    global passed
    if not ok:
        print(f"FAIL: {what}")
        sys.exit(1)
    passed += 1
    print(f"ok   {what}")


def build(out, *args):
    return subprocess.run([sys.executable, "-I", str(BUILD), "--out", str(out), *args], capture_output=True, text=True)


with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "dist"
    check(build(out).returncode == 0, "build.py writes a fresh folder")
    top = sorted(p.name for p in out.glob("*.jsx"))
    extra = sorted(p.name for p in (out / "extra").glob("*.jsx"))
    check(top == ["Motion Kit.jsx", "motionkit-lib.jsx"], f"the top level has the panel to install and the library: {top}")
    check(extra == ["Motion Kit 1.jsx", "Motion Kit 2.jsx", "Motion Kit 3.jsx", "Motion Kit 4.jsx", "Motion Kit Menu.jsx"], f"extra/ has the single panels: {extra}")
    check("var MK_PANEL = \"all\";" in (out / "Motion Kit.jsx").read_text(encoding="utf-8"), "Motion Kit.jsx is the switching panel (MK_PANEL \"all\")")
    check(build(out, "--check").returncode == 0, "--check passes on a fresh build")

    one = out / "extra" / "Motion Kit 1.jsx"
    one.write_text(one.read_text(encoding="utf-8") + "\n// edited\n", encoding="utf-8")
    r = build(out, "--check")
    check(r.returncode == 1 and "extra/Motion Kit 1.jsx" in r.stderr, "--check catches an edited panel in extra/: " + r.stderr.strip())
    one.unlink()
    r = build(out, "--check")
    check(r.returncode == 1 and "extra/Motion Kit 1.jsx" in r.stderr, "--check catches a missing panel in extra/")
    build(out)
    (out / "Motion Kit 2.jsx").write_text("// left from an older build\n", encoding="utf-8")
    r = build(out, "--check")
    check(r.returncode == 1 and "Motion Kit 2.jsx not built any more" in r.stderr, "--check catches a single panel left at the top level: " + r.stderr.strip())

print(f"all checks passed ({passed})")
