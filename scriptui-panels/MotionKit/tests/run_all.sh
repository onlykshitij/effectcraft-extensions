#!/usr/bin/env bash
# SPDX-License-Identifier: MIT OR Apache-2.0
# Runs the Motion Kit tests headless in effectcraft-cli and prints a pass/fail summary.
#
#   tests/run_all.sh                  every tests/test_*.jsx against dist/
#   tests/run_all.sh test_loop.jsx    only the named tests
#   MK_DIST=/tmp/me/dist tests/run_all.sh     test another build (python3 build.py --out DIR)
#   EFFECTCRAFT_CLI=/path/to/effectcraft-cli  the CLI to use (default: effectcraft-cli on PATH)
#
# EffectCraft only lets a script load files from its own folder (unless file access is allowed),
# so the tests and the dist folder are copied into one staging folder and run from there.
set -u

here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
dist=$(cd "${MK_DIST:-$root/dist}" 2>/dev/null && pwd) || { echo "run_all.sh: no dist folder at ${MK_DIST:-$root/dist} (run python3 build.py)" >&2; exit 2; }
[ -f "$dist/motionkit-lib.jsx" ] || { echo "run_all.sh: $dist/motionkit-lib.jsx is missing (run python3 build.py)" >&2; exit 2; }

cli=${EFFECTCRAFT_CLI:-}
if [ -z "$cli" ]; then
  if command -v effectcraft-cli >/dev/null 2>&1; then
    cli=effectcraft-cli
  else
    # A source checkout of EffectCraft next to this repository.
    cli="$root/../../../effectcraft/target/live-release/release/effectcraft-cli"
  fi
fi
[ -x "$cli" ] || command -v "$cli" >/dev/null 2>&1 || { echo "run_all.sh: effectcraft-cli not found; set EFFECTCRAFT_CLI" >&2; exit 2; }

stage=$(mktemp -d "${TMPDIR:-/tmp}/motionkit-tests.XXXXXX")
trap 'rm -rf "$stage"' EXIT
cp "$here"/*.jsx "$stage"/
mkdir "$stage/dist"
cp "$dist"/*.jsx "$stage/dist/"

if [ $# -gt 0 ]; then tests=("$@"); else tests=(); for f in "$here"/test_*.jsx; do tests+=("$(basename "$f")"); done; fi

pass=0
fail=0
failed=()
for t in "${tests[@]}"; do
  name=$(basename "$t")
  log="$stage/$name.log"
  if "$cli" script "$stage/$name" --empty >"$log" 2>&1 && grep -q "^all checks passed" "$log"; then
    pass=$((pass + 1))
    echo "PASS  $name ($(grep -c '^ok ' "$log") checks)"
  else
    fail=$((fail + 1))
    failed+=("$name")
    echo "FAIL  $name"
    sed 's/^/      /' "$log" | tail -n 25
  fi
done

echo
echo "$pass passed, $fail failed (dist: $dist)"
[ "$fail" -eq 0 ] || { echo "failed: ${failed[*]}"; exit 1; }
