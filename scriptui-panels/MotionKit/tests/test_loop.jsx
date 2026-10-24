// SPDX-License-Identifier: MIT OR Apache-2.0
// Loop In/Out: cycle, ping-pong, offset and continue, in/out/both, the keyframe count, and the
// replacement rule (Motion Kit expressions silently, others only after asking).
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("Loop Test");
var lay = T.solid(comp, "Spinner", 60, 60);
var rot = lay.transform.rotation;
// 0 at 2 s, 100 at 3 s, 40 at 4 s (linear keys).
rot.setValueAtTime(2, 0);
rot.setValueAtTime(3, 100);
rot.setValueAtTime(4, 40);
function v(t) { return rot.valueAtTime(t, false); }
function run(opts) {
  T.select(comp, [lay], [rot]);
  return MotionKit.run("loop", opts);
}

var r = run({});
T.check(r.ok && rot.expression === "// Motion Kit: loop\nloopOut(\"cycle\", 0)", "default: cycle out over all keys");
T.check(T.near(v(4.5), 50) && T.near(v(6.25), 25) && T.near(v(3.5), 70), "cycle repeats 2-4 s after the last key, keys untouched");

run({ type: "pingpong" });
T.check(T.near(v(4.5), 70) && T.near(v(5.5), 50) && T.near(v(6.5), 50) && T.near(v(7.5), 70), "ping-pong plays back and forth");
run({ type: "offset" });
T.check(T.near(v(5), 140) && T.near(v(6), 80), "offset adds the change per cycle (40 each time)");
run({ type: "continue", keyframes: 1 });
T.check(rot.expression.indexOf("loopOut(\"continue\")") > 0 && T.near(v(5), -20), "continue keeps the last speed and ignores the keyframe count");
run({ type: "cycle", keyframes: 1 });
T.check(T.near(v(4.5), 70) && T.near(v(5.25), 85), "a keyframe count of 1 loops only the last segment");
run({ type: "cycle", side: "in" });
T.check(T.near(v(1.5), 70) && T.near(v(4.5), 40), "in: loops before the first key only");
run({ type: "cycle", side: "both" });
T.check(T.near(v(1.5), 70) && T.near(v(4.5), 50) && T.near(v(2.5), 50), "both: loopIn before, loopOut after, the keys between");

// Saved options are what a click uses.
MotionKit.options.save("loop", { type: "pingpong", side: "out", keyframes: 0 });
run();
T.check(T.near(v(4.5), 70), "a run without options uses the saved ones");

// Only Motion Kit expressions are replaced without asking.
rot.expression = "value + 1";
T.answer = false;
T.confirms = [];
var kept = run({});
T.check(kept.ok && rot.expression === "value + 1" && T.confirms.length === 1 && /didn't write/.test(T.confirms[0]), "asks before replacing another expression and keeps it on no");
T.answer = true;
run({});
T.check(rot.expression.indexOf("// Motion Kit: loop") === 0 && T.confirms.length === 2, "replaces it on yes");
run({ type: "offset" });
T.check(T.confirms.length === 2 && /offset/.test(rot.expression), "its own expression is replaced without asking");

// Bad selections.
var one = lay.transform.opacity;
one.setValueAtTime(1, 50);
T.select(comp, [lay], [one]);
var bad = MotionKit.run("loop");
T.check(!bad.ok && one.expression === "" && /two keyframes/.test(bad.message), "a property with one key is refused: " + bad.message);
var shape = comp.layers.addShape();
var grp = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Rect");
var size = grp.property("ADBE Vector Rect Size");
size.setValueAtTime(0, [10, 10]);
size.setValueAtTime(1, [50, 50]);
T.select(comp, [shape], [size]);
T.check(MotionKit.run("loop", { type: "cycle" }).ok && T.near(size.valueAtTime(1.5, false), [30, 30]), "works on a shape property too");

T.done();
