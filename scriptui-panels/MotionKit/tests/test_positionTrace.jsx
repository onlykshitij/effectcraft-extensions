// SPDX-License-Identifier: MIT OR Apache-2.0
// Position Trace: the trace layer (name, place, label, no parent, controls), the vertex count
// for Frames Trace / Frames Offset / Trace Detail, vertices at the target's comp positions
// (through a moving parent), smoothing keeps the ends, stroke width, colour and taper, a deleted
// target without NaN, several layers, bad selection, one undo step.
// Comp positions are checked with EffectCraft's own sourcePointToComp.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers;

var comp = T.comp("Trace Test");  // 25 fps
var rig = comp.layers.addNull();
rig.name = "Rig";
rig.transform.position.setValueAtTime(0, [500, 300]);
rig.transform.position.setValueAtTime(2, [560, 260]);
rig.transform.rotation.setValue(10);
var ball = T.solid(comp, "Ball", 40, 40);
ball.parent = rig;
ball.transform.position.setValueAtTime(0, [-300, -150]);
ball.transform.position.setValueAtTime(2, [200, 120]);
comp.time = 1;

// The ball's anchor point in comp space at comp time t.
function ballAt(t) {
  var keep = comp.time;
  comp.time = t;
  var p = ball.sourcePointToComp([20, 20]);
  comp.time = keep;
  return p;
}
function ctrl(L, name) { return L.property("ADBE Effect Parade").property("Position Trace – " + name).property(1); }

T.select(comp, [], []);
var bad = MotionKit.run("positionTrace");
T.check(!bad.ok && /select one or more layers/.test(bad.message) && comp.numLayers === 2, "no layers: refused, nothing added");

T.select(comp, [ball], []);
var r = MotionKit.run("positionTrace");
var tr = comp.layer("Ball Trace");
T.check(r.ok && tr && r.created.length === 1 && tr instanceof ShapeLayer, "creates the shape layer \"Ball Trace\": " + r.message);
T.check(tr.index === ball.index - 1 && !tr.parent && tr.label === 3, "it sits directly above the target, has no parent and the guide label (Aqua)");
T.check(ctrl(tr, "Target").value === ball.index && ctrl(tr, "Frames Trace").value === 30 && ctrl(tr, "Frames Offset").value === 0 &&
  ctrl(tr, "Trace Smooth").value === 0 && ctrl(tr, "Trace Detail").value === 1 && ctrl(tr, "Stroke Width").value === 4,
  "controls: Target is the ball, Frames Trace 30, Offset 0, Smooth 0, Detail 1, Stroke Width 4");
T.check(T.near(ctrl(tr, "Stroke Colour").value, H.util.hexToRgb("#2BB3A3"), 1e-3), "Stroke Colour is the Rig accent");

var items = tr.property("ADBE Root Vectors Group");
var path = items.property(1).property("ADBE Vector Shape");
var stroke = items.property(2);
T.check(path.expression.indexOf("// Motion Kit: positionTrace") === 0 && path.expressionError === "", "the path has the trace expression");

function verts(t) { return path.valueAtTime(t, false).vertices; }
function inComp(v) { return tr.sourcePointToComp(v); }
var v = verts(1);
T.check(v.length === 31, "30 frames back, one sample per frame: 31 vertices (" + v.length + ")");
T.check(path.valueAtTime(1, false).closed === false, "an open path");
T.check(T.near(inComp(v[0]), ballAt(1), 1e-3), "vertex 1 is the ball now, in comp space (through its moving, rotated parent)");
T.check(T.near(inComp(v[10]), ballAt(1 - 10 / 25), 1e-3) && T.near(inComp(v[30]), ballAt(1 - 30 / 25), 1e-3), "vertex 11 is 10 frames back, vertex 31 is 30 frames back");

ctrl(tr, "Trace Detail").setValue(3);
T.check(verts(1).length === 11, "Trace Detail 3: 11 vertices (" + verts(1).length + ")");
ctrl(tr, "Frames Offset").setValue(6);
ctrl(tr, "Trace Detail").setValue(2);
v = verts(1);
T.check(v.length === 19 && T.near(inComp(v[0]), ballAt(1 + 6 / 25), 1e-3) && T.near(inComp(v[18]), ballAt(1 - 30 / 25), 1e-3),
  "Frames Offset 6, Detail 2: 19 vertices from 6 frames ahead back to 30 frames behind");
ctrl(tr, "Frames Offset").setValue(0);
ctrl(tr, "Trace Detail").setValue(1);

// Smoothing: a moving average that leaves the two ends where they are.
ctrl(tr, "Trace Smooth").setValue(2);
v = verts(1);
var mean = [0, 0];
for (var k = 3; k <= 7; k++) { var p = ballAt(1 - k / 25); mean[0] += p[0] / 5; mean[1] += p[1] / 5; }
var m1 = [0, 0];
for (k = 0; k <= 2; k++) { var q = ballAt(1 - k / 25); m1[0] += q[0] / 3; m1[1] += q[1] / 3; }
T.check(v.length === 31 && T.near(inComp(v[0]), ballAt(1), 1e-3) && T.near(inComp(v[30]), ballAt(1 - 30 / 25), 1e-3), "Trace Smooth 2 keeps the ends");
T.check(T.near(inComp(v[5]), mean, 1e-3) && T.near(inComp(v[1]), m1, 1e-3), "and averages 5 samples in the middle, 3 next to the ends");
ctrl(tr, "Trace Smooth").setValue(0);

// The stroke.
T.check(T.near(stroke.property("ADBE Vector Stroke Width").valueAtTime(1, false), 4), "stroke width follows the control (4)");
ctrl(tr, "Stroke Width").setValue(9);
T.check(T.near(stroke.property("ADBE Vector Stroke Width").valueAtTime(1, false), 9), "and changes with it (9)");
T.check(T.near(stroke.property("ADBE Vector Stroke Color").valueAtTime(1, false), H.util.hexToRgb("#2BB3A3"), 1e-3), "stroke colour follows the control");
var taper = stroke.property("ADBE Vector Stroke Taper");
T.check(taper.property("Length Units").value === 2 && taper.property("End Length").value === 100 && taper.property("End Width").value === 0, "Taper Out: the end (the oldest sample) tapers to 0 over 100 %");

// The trace updates with the time.
T.check(T.near(inComp(verts(2)[0]), ballAt(2), 1e-3), "at t = 2 the first vertex is the ball at t = 2");

// Options set the controls; several layers; no taper.
var b2 = T.solid(comp, "Box", 30, 30), b3 = T.solid(comp, "Cube", 30, 30);
T.select(comp, [b2, b3], []);
r = MotionKit.run("positionTrace", { frames: 12, detail: 4, taper: false, color: "#FF0000" });
var t2 = comp.layer("Box Trace"), t3 = comp.layer("Cube Trace");
T.check(r.ok && t2 && t3 && r.created.length === 2, "one trace per selected layer: " + r.message);
T.check(ctrl(t2, "Frames Trace").value === 12 && ctrl(t2, "Trace Detail").value === 4 && T.near(ctrl(t3, "Stroke Colour").value, [1, 0, 0], 1e-3), "the run's options become the control values");
T.check(t2.property("ADBE Root Vectors Group").property(1).property("ADBE Vector Shape").valueAtTime(1, false).vertices.length === 4, "12 frames every 4: 4 vertices");
T.check(t2.property("ADBE Root Vectors Group").property(2).property("ADBE Vector Stroke Taper").property("End Length").value === 0, "taper off leaves the stroke untapered");

// A deleted target: the path falls back to its own (empty) value.
ball.remove();
var gone = path.valueAtTime(1, false);
T.check(gone.vertices.length === 0 && path.expressionError === "", "a deleted target leaves an empty path, no NaN");

// One undo step.
var n = comp.numLayers;
T.select(comp, [b2], []);
MotionKit.run("positionTrace");
T.check(comp.numLayers === n + 1 && comp.layer("Box Trace 2"), "a second trace of the same layer gets a new name");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(comp.numLayers === n, "one Undo removes it");

T.done();
