// SPDX-License-Identifier: MIT OR Apache-2.0
// Ease Keyframes: influences and speeds land on the right sides of the selected keys; speeds are
// multiples of each segment's average speed (signed per dimension, path speed when spatial); the
// value follows the editor's cubic-bezier; no overshoot; the curve editor's handles drag through
// synthetic mouse events; presets, fields, Copy from Selected Key, Reset, Apply; bad selections;
// one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var LIN = KeyframeInterpolationType.LINEAR, BEZ = KeyframeInterpolationType.BEZIER;

var comp = T.comp("Ease Test");
var lay = T.solid(comp, "Box", 50, 50);
var op = lay.transform.opacity, rot = lay.transform.rotation;
op.setValueAtTime(1, 0);
op.setValueAtTime(2, 100);
op.setValueAtTime(3, 40);
op.setValueAtTime(4, 40);
rot.setValueAtTime(1, 0);
rot.setValueAtTime(2, 90);
rot.setValueAtTime(3, 0);

// Selects exactly these keyframes: [[prop, [indices]], ...].
function keys(list) {
  T.select(comp, [], []);
  for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i][1].length; j++) list[i][0].setSelectedAtKey(list[i][1][j], true);
}
function ease(p, i, side) { var e = side === "in" ? p.keyInTemporalEase(i) : p.keyOutTemporalEase(i); return e[0]; }
function easeIs(e, speed, influence) { return T.near(e.speed, speed, 1e-3) && T.near(e.influence, influence, 1e-3); }
// CSS cubic-bezier(x1, y1, x2, y2) at progress x.
function css(x1, y1, x2, y2, x) {
  var lo = 0, hi = 1;
  for (var i = 0; i < 60; i++) {
    var t = (lo + hi) / 2, u = 1 - t;
    if (3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t < x) lo = t;
    else hi = t;
  }
  var s = (lo + hi) / 2, v = 1 - s;
  return 3 * v * v * s * y1 + 3 * v * s * s * y2 + s * s * s;
}

// ---- bad selections change nothing
T.select(comp, [lay], []);
var bad = MotionKit.run("easeKeys");
T.check(!bad.ok && /select keyframes/.test(T.lastAlert()), "no selected keyframes: refused with an alert: " + bad.message);
var one = lay.transform.scale;
one.setValueAtTime(1, [100, 100]);
keys([[one, [1]]]);
T.check(!MotionKit.run("easeKeys").ok && one.keyOutInterpolationType(1) === LIN, "a property with one keyframe is refused and left linear");
one.removeKey(1);

// ---- three selected keys: out on all but the last, in on all but the first
keys([[op, [1, 2, 3]]]);
var r = MotionKit.run("easeKeys", { outInfluence: 50, outSpeed: 0, inInfluence: 75, inSpeed: 0 });
T.check(r.ok && /eased 3 keyframes on 1 property/.test(r.message), "runs: " + r.message);
T.check(easeIs(ease(op, 1, "out"), 0, 50) && easeIs(ease(op, 2, "in"), 0, 75) && easeIs(ease(op, 2, "out"), 0, 50) && easeIs(ease(op, 3, "in"), 0, 75),
  "out ease 0 / 50 % on keys 1 and 2, in ease 0 / 75 % on keys 2 and 3");
T.check(op.keyInInterpolationType(1) === LIN && op.keyOutInterpolationType(1) === BEZ && op.keyInInterpolationType(2) === BEZ &&
  op.keyOutInterpolationType(2) === BEZ && op.keyInInterpolationType(3) === BEZ && op.keyOutInterpolationType(3) === LIN,
  "eased sides become Bezier; the first key's in side and the last key's out side keep Linear");
T.check(op.keyInInterpolationType(4) === LIN && T.near(op.valueAtTime(3.5, false), 40), "the unselected key and its segment are untouched");
var worst = 0;
for (var x = 0.05; x < 1; x += 0.1) worst = Math.max(worst, Math.abs(op.valueAtTime(1 + x, false) - 100 * css(0.5, 0, 0.25, 1, x)));
T.check(worst < 0.01, "the value between keys 1 and 2 follows cubic-bezier(0.5, 0, 0.25, 1) (max error " + worst.toFixed(4) + ")");

// ---- speeds are multiples of each segment's average speed
keys([[op, [1, 2, 3]]]);
MotionKit.run("easeKeys", { outInfluence: 40, outSpeed: 1.5, inInfluence: 20, inSpeed: 2 });
T.check(easeIs(ease(op, 1, "out"), 150, 40) && easeIs(ease(op, 2, "in"), 200, 20), "key 1 out: 1.5 x 100 %/s; key 2 in: 2 x 100 %/s");
T.check(easeIs(ease(op, 2, "out"), -90, 40) && easeIs(ease(op, 3, "in"), -120, 20), "a falling segment gets signed speeds (-60 %/s average)");
keys([[op, [1, 2]]]);
MotionKit.run("easeKeys", { outInfluence: 50, outSpeed: 5, inInfluence: 10, inSpeed: 50 });
T.check(easeIs(ease(op, 1, "out"), 200, 50) && easeIs(ease(op, 2, "in"), 1000, 10), "speeds are capped at 100 / influence (no overshoot)");
var over = 0;
for (var y = 1; y <= 2; y += 0.02) over = Math.max(over, op.valueAtTime(y, false));
T.check(over <= 100 + 1e-6, "and the value stays within the keys (max " + over.toFixed(4) + ")");

// ---- spatial, multi-dimensional, a lone key, several properties at once
var pos = lay.transform.position, sc = lay.transform.scale;
pos.setValueAtTime(5, [100, 100]);
pos.setValueAtTime(6, [400, 500]);
sc.setValueAtTime(5, [100, 100]);
sc.setValueAtTime(6, [200, 50]);
keys([[pos, [1, 2]], [sc, [1, 2]]]);
r = MotionKit.run("easeKeys", { outInfluence: 30, outSpeed: 0.5, inInfluence: 60, inSpeed: 1 });
T.check(r.ok && /on 2 properties/.test(r.message), "two properties in one run: " + r.message);
T.check(pos.keyOutTemporalEase(1).length === 1 && easeIs(ease(pos, 1, "out"), 250, 30) && easeIs(ease(pos, 2, "in"), 500, 60), "position (spatial): one ease, speed along the path (500 px/s average)");
var so = sc.keyOutTemporalEase(1), si = sc.keyInTemporalEase(2);
T.check(so.length === 3 && easeIs(so[0], 50, 30) && easeIs(so[1], -25, 30) && easeIs(so[2], 0, 30) && easeIs(si[0], 100, 60) && easeIs(si[1], -50, 60),
  "scale: one signed speed per dimension");
keys([[rot, [2]]]);
MotionKit.run("easeKeys", { outInfluence: 33.333, outSpeed: 0, inInfluence: 33.333, inSpeed: 0 });
T.check(easeIs(ease(rot, 2, "in"), 0, 33.333) && easeIs(ease(rot, 2, "out"), 0, 33.333) && rot.keyOutInterpolationType(1) === LIN,
  "a lone selected key gets both sides; its neighbours are untouched");
var p1 = lay.transform.anchorPoint;
p1.setValueAtTime(1, [25, 25]);
keys([[rot, [1, 3]], [p1, [1]]]);
r = MotionKit.run("easeKeys");
T.check(r.ok && /Skipped 1/.test(r.message) && easeIs(ease(rot, 1, "out"), 0, 33.333), "a one-key property among others is skipped: " + r.message);

// ---- the curve editor (built, not shown: a modal dialog blocks headless)
MotionKit.options.save("easeKeys", { outInfluence: 33.333, outSpeed: 0, inInfluence: 33.333, inSpeed: 0 });
var ed = MotionKit.tools.easeKeys.openOptions(true);
T.check(ed && ed.graph && ed.fields.outInfluence.text === "33.33" && ed.presets.selection.text === "Ease In-Out (33 %)",
  "the editor shows the saved ease and names its preset");
T.check(ed.readout.text === "cubic-bezier(0.333, 0.000, 0.667, 1.000)", "and its cubic-bezier: " + ed.readout.text);
__uiRunDraws(ed.win);
var ops = ed.graph.__draw || [], strokes = 0, fills = 0;
for (var o = 0; o < ops.length; o++) if (ops[o].op === "stroke") strokes++; else if (ops[o].op === "fill") fills++;
T.check(strokes >= 13 && fills >= 3, "the graph draws its grid, curve, handle lines and handles (" + strokes + " strokes, " + fills + " fills)");

var h1 = ed.handlePx(1), to = ed.toPx(0.5, 0.25);
T.mouse(ed.win, ed.graph, "mousedown", h1[0] + 3, h1[1] - 2);
T.check(ed.drag === 1, "pressing near the out handle grabs it");
T.mouse(ed.win, ed.graph, "mousemove", to[0], to[1]);
T.check(T.near(ed.st.outInfluence, 50) && T.near(ed.st.outSpeed, 0.5) && ed.fields.outInfluence.text === "50" && ed.fields.outSpeed.text === "0.5",
  "dragging it to (0.5, 0.25) gives out influence 50 % and speed 0.5 x");
T.mouse(ed.win, ed.graph, "mouseup", to[0], to[1]);
T.check(ed.drag === null && ed.presets.selection.text === "Custom", "release ends the drag; the preset reads Custom");
var h2 = ed.handlePx(2), up = ed.toPx(0.8, 1.4);
T.mouse(ed.win, ed.graph, "mousedown", h2[0], h2[1]);
T.mouse(ed.win, ed.graph, "mousemove", up[0], up[1]);
T.check(ed.drag === 2 && T.near(ed.st.inInfluence, 20) && T.near(ed.st.inSpeed, 0), "the in handle drags too, held inside the square (y 1.4 becomes 1)");
T.mouse(ed.win, ed.btnReset, "mouseup", 2, 2);
T.check(ed.drag === null, "releasing outside the graph ends the drag");
T.mouse(ed.win, ed.graph, "mousemove", 5, 5);
T.check(T.near(ed.st.inInfluence, 20), "moves after the drag change nothing");
T.mouse(ed.win, ed.graph, "mousedown", 110, 70);
T.check(ed.drag === null, "pressing away from both handles grabs nothing");
T.mouse(ed.win, ed.graph, "mouseup", 110, 70);

ed.presets.selection = 5;
ed.presets.notify("onChange");
T.check(T.near(ed.st.outInfluence, 75) && ed.st.outSpeed === 0 && T.near(ed.st.inInfluence, 75) && /0\.750, 0\.000, 0\.250, 1\.000/.test(ed.readout.text), "the Strong In-Out preset");
ed.fields.outSpeed.text = "9";
ed.fields.outSpeed.notify("onChange");
T.check(T.near(ed.st.outSpeed, 100 / 75) && ed.fields.outSpeed.text === "1.333", "a speed field is capped so the curve can't overshoot");
ed.fields.inInfluence.text = "abc";
ed.fields.inInfluence.notify("onChange");
T.check(T.near(ed.st.inInfluence, 75) && ed.fields.inInfluence.text === "75", "a bad entry goes back to the last value");
keys([[op, [1, 2]]]);
ed.btnCopy.notify("onClick");
T.check(T.near(ed.st.outInfluence, 50) && T.near(ed.st.outSpeed, 2) && T.near(ed.st.inInfluence, 10) && T.near(ed.st.inSpeed, 10),
  "Copy from Selected Key reads key 1's out and key 2's in ease as multiples of the average speed");
T.select(comp, [lay], []);
T.alerts = [];
ed.btnCopy.notify("onClick");
T.check(/select a keyframe/.test(T.lastAlert()) && T.near(ed.st.outSpeed, 2), "with nothing to copy it says so and keeps the curve");
ed.btnReset.notify("onClick");
T.check(T.near(ed.st.outInfluence, 33.333) && ed.st.outSpeed === 0 && ed.st.inSpeed === 0, "Reset goes back to the default ease");
ed.presets.selection = 1;
ed.presets.notify("onChange");
ed.btnApply.notify("onClick");
T.check(ed.action === "run" && MotionKit.options.get("easeKeys").outSpeed === 1 && MotionKit.options.get("easeKeys").inSpeed === 1, "Apply saves the ease (Linear) and asks to run");
keys([[op, [1, 2]]]);
MotionKit.run("easeKeys");
var lw = 0;
for (var z = 1; z <= 2; z += 0.05) lw = Math.max(lw, Math.abs(op.valueAtTime(z, false) - 100 * (z - 1)));
T.check(lw < 1e-3 && easeIs(ease(op, 1, "out"), 100, 33.333), "a click applies the saved ease: the Linear preset keeps the motion linear");
var ed2 = MotionKit.tools.easeKeys.openOptions(true);
ed2.presets.selection = 6;
ed2.presets.notify("onChange");
ed2.btnSave.notify("onClick");
T.check(ed2.action === "save" && T.near(MotionKit.options.get("easeKeys").outInfluence, 90) && T.near(MotionKit.options.get("easeKeys").inInfluence, 15), "Save keeps the Snappy Out preset without running");

// ---- one undo step
keys([[rot, [1, 2, 3]]]);
var before = rot.keyOutInterpolationType(1);
MotionKit.run("easeKeys");
T.check(rot.keyOutInterpolationType(1) === BEZ && T.near(ease(rot, 1, "out").influence, 90), "eased again");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(rot.keyOutInterpolationType(1) === before && T.near(ease(rot, 1, "out").influence, 33.333), "one Undo restores the keys");

T.done();
