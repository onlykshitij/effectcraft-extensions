// SPDX-License-Identifier: MIT OR Apache-2.0
// Move Anchor Point: comp positions kept with rotation, scale and a rotated, scaled parent, at
// and between keyframes; keyed anchor points; 3D layers (world positions kept); mask bounds;
// shape groups within their own bounds; exact shape-layer bounds (no stroke, no padding);
// animated rotation and scale (Position keyed where they change); expressions skipped; the 3 x 3
// options grid; bad selection; one undo step. Comp positions are checked with EffectCraft's own
// sourcePointToComp.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers;

var comp = T.comp("Anchor Test");
comp.time = 1;
var boss = comp.layers.addNull();
boss.name = "Boss";
boss.transform.position.setValue([600, 250]);
boss.transform.rotation.setValue(-25);
boss.transform.scale.setValue([130, 70]);
var a = T.solid(comp, "A", 200, 100);
a.parent = boss;
a.transform.rotation.setValue(30);
a.transform.scale.setValue([150, 80]);
a.transform.position.setValueAtTime(0, [-100, 40]);
a.transform.position.setValueAtTime(2, [60, -30]);

// Comp positions of a layer's four corners (and centre) at comp time t.
function corners(L, w, h, t) {
  var keep = comp.time;
  comp.time = t;
  var out = [L.sourcePointToComp([0, 0]), L.sourcePointToComp([w, 0]), L.sourcePointToComp([w, h]), L.sourcePointToComp([0, h]), L.sourcePointToComp([w / 2, h / 2])];
  comp.time = keep;
  return out;
}
function same(x, y, eps) {
  for (var i = 0; i < x.length; i++) if (!T.near(x[i], y[i], eps || 1e-3)) return false;
  return true;
}
function snap(L, w, h) { return [corners(L, w, h, 0), corners(L, w, h, 1), corners(L, w, h, 2)]; }
function kept(L, w, h, before) {
  var now = snap(L, w, h);
  for (var k = 0; k < 3; k++) if (!same(now[k], before[k])) return false;
  return true;
}

T.select(comp, [], []);
var bad = MotionKit.run("moveAnchor");
T.check(!bad.ok && /select one or more layers or shape groups/.test(bad.message), "nothing selected: refused (" + bad.message + ")");

// Top-left, with rotation, scale, a parent and keyed position.
var before = snap(a, 200, 100);
T.select(comp, [a], []);
var r = MotionKit.run("moveAnchor", { point: "tl" });
T.check(r.ok && /top left/.test(r.message), "runs: " + r.message);
T.check(T.near(a.transform.anchorPoint.value, [0, 0, 0]), "the anchor is the top-left of the layer's rectangle");
T.check(a.transform.position.numKeys === 2 && T.near(a.transform.position.keyTime(2), 2), "position keeps its two keys");
T.check(kept(a, 200, 100, before), "nothing moves in comp space, on both keys and between them (t = 0, 1, 2)");
T.check(T.near(a.transform.position.valueAtTime(1, false), H.space.fromComp(boss, before[1][0]), 1e-3), "position is where the old top-left corner was, in the parent's space");

// A plain click uses the last-chosen point: the saved option.
MotionKit.options.save(MotionKit.tools.moveAnchor, { point: "br", masks: false });
before = snap(a, 200, 100);
r = MotionKit.run("moveAnchor");
T.check(r.ok && T.near(a.transform.anchorPoint.value, [200, 100, 0]) && kept(a, 200, 100, before), "a plain run uses the saved point (bottom right), still nothing moves");
MotionKit.options.save(MotionKit.tools.moveAnchor, { point: "c", masks: false });

// Keyed anchor point and keyed scale.
var b = T.solid(comp, "B", 120, 80);
b.transform.anchorPoint.setValueAtTime(0, [0, 0]);
b.transform.anchorPoint.setValueAtTime(2, [40, 20]);
b.transform.scale.setValueAtTime(0, [100, 100]);
b.transform.scale.setValueAtTime(2, [200, 50]);
b.transform.position.setValueAtTime(0, [300, 300]);
b.transform.position.setValueAtTime(2, [400, 350]);
b.transform.rotation.setValue(15);
before = snap(b, 120, 80);
T.select(comp, [b], []);
r = MotionKit.run("moveAnchor", { point: "c" });
var akeys = [b.transform.anchorPoint.keyValue(1), b.transform.anchorPoint.keyValue(2)];
T.check(r.ok && T.near(b.transform.anchorPoint.valueAtTime(1, false), [60, 40, 0], 1e-3), "a keyed anchor point is at the centre now (t = 1)");
T.check(T.near(akeys[0], [40, 30, 0], 1e-3) && T.near(akeys[1], [80, 50, 0], 1e-3), "every anchor key shifts by the same amount (its animation is kept)");
T.check(same(corners(b, 120, 80, 0), before[0]) && same(corners(b, 120, 80, 2), before[2]), "on the keyframes nothing moves");

// 3D layer: world positions kept.
var c3 = T.solid(comp, "Deep", 100, 100);
c3.threeDLayer = true;
c3.transform.position.setValue([500, 300, 150]);
c3.transform.property("ADBE Rotate Y").setValue(50);
c3.transform.property("ADBE Rotate X").setValue(-20);
c3.transform.scale.setValue([120, 90, 100]);
var w0 = [H.space.toWorld(c3, [0, 0, 0]), H.space.toWorld(c3, [100, 100, 0])];
T.select(comp, [c3], []);
r = MotionKit.run("moveAnchor", { point: "r" });
T.check(r.ok && T.near(c3.transform.anchorPoint.value, [100, 50, 0]), "3D: the anchor is the right edge's midpoint");
T.check(T.near(H.space.toWorld(c3, [0, 0, 0]), w0[0], 1e-3) && T.near(H.space.toWorld(c3, [100, 100, 0]), w0[1], 1e-3), "3D: world positions kept");

// Mask bounds.
var m = T.solid(comp, "Masked", 300, 300);
var mask = m.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
var sq = new Shape();
sq.vertices = [[50, 100], [250, 100], [250, 200], [50, 200]];
sq.closed = true;
mask.property("ADBE Mask Shape").setValue(sq);
m.transform.rotation.setValue(10);
before = snap(m, 300, 300);
T.select(comp, [m], []);
r = MotionKit.run("moveAnchor", { point: "tr", masks: true });
T.check(r.ok && T.near(m.transform.anchorPoint.value, [250, 100, 0]) && kept(m, 300, 300, before), "Include masks: the anchor goes to the mask's top right, nothing moves");
r = MotionKit.run("moveAnchor", { point: "tr", masks: false });
T.check(T.near(m.transform.anchorPoint.value, [300, 0, 0]), "without it: the rectangle's top right");

// Expressions: skipped with a message.
var e = T.solid(comp, "Driven", 50, 50);
e.transform.position.expression = "value + [10, 0]";
T.select(comp, [e], []);
r = MotionKit.run("moveAnchor", { point: "tl" });
T.check(!r.ok && /expression/.test(r.message) && T.near(e.transform.anchorPoint.value, [25, 25, 0]), "a layer whose position has an expression is skipped, unchanged (" + r.message + ")");
T.select(comp, [e, m], []);
r = MotionKit.run("moveAnchor", { point: "c" });
T.check(r.ok && /Skipped Driven/.test(r.message) && T.near(m.transform.anchorPoint.value, [150, 150, 0]), "with another layer it moves that one and reports the skip: " + r.message);

// Shape groups: within the group's own contents.
var sh = comp.layers.addShape();
sh.name = "Shapes";
sh.transform.rotation.setValue(-12);
var g = sh.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
var rect = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
rect.property("ADBE Vector Rect Size").setValue([80, 40]);
rect.property("ADBE Vector Rect Position").setValue([30, 10]);
var inner = g.property("ADBE Vectors Group").addProperty("ADBE Vector Group");
var ell = inner.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
ell.property("ADBE Vector Ellipse Size").setValue([20, 20]);
inner.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([100, 0]);
g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
var gt = g.property("ADBE Vector Transform Group");
gt.property("ADBE Vector Rotation").setValue(35);
gt.property("ADBE Vector Scale").setValue([120, 80]);
gt.property("ADBE Vector Position").setValue([-40, 25]);
function groupPts() {
  var M = H.shapes.toLayerMatrix([g], comp.time);
  return H.util.map([[-10, -10], [70, 30], [110, 10]], function (p) { return sh.sourcePointToComp(H.mat.apply(M, p)); });
}
var gBefore = groupPts();
T.select(comp, [sh], [g]);
r = MotionKit.run("moveAnchor", { point: "l" });
// The contents span x -10 (rectangle) .. 110 (ellipse), y -10 .. 30 (rectangle).
T.check(r.ok && /1 group/.test(r.message) && T.near(gt.property("ADBE Vector Anchor").value, [-10, 10], 1e-3), "a selected group: its anchor goes to the left middle of its own contents (nested ellipse included): " + r.message);
T.check(same(groupPts(), gBefore), "and the group's contents don't move in comp space");
T.check(T.near(sh.transform.anchorPoint.value, [0, 0, 0]), "the layer's own anchor is left alone");

// Shape layers: the exact corners of the contents, without strokes (EffectCraft's own rectangle
// adds 1 px on each side and counts the stroke).
var stroked = comp.layers.addShape();
var srect = stroked.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Rect");
srect.property("ADBE Vector Rect Size").setValue([100, 50]);
srect.property("ADBE Vector Rect Position").setValue([30, 0]);
stroked.property("ADBE Root Vectors Group").addProperty("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").setValue(10);
var sb = [stroked.sourcePointToComp([-20, -25]), stroked.sourcePointToComp([80, 25])];
T.select(comp, [stroked], []);
r = MotionKit.run("moveAnchor", { point: "tl" });
T.check(r.ok && T.near(stroked.transform.anchorPoint.value, [-20, -25, 0], 1e-6), "a stroked rectangle's top left is its geometry's corner (" + stroked.transform.anchorPoint.value.join(", ") + ")");
T.check(T.near(stroked.sourcePointToComp([-20, -25]), sb[0], 1e-3) && T.near(stroked.sourcePointToComp([80, 25]), sb[1], 1e-3), "and the shape doesn't move");
T.select(comp, [stroked], []);
MotionKit.run("moveAnchor", { point: "br" });
T.check(T.near(stroked.transform.anchorPoint.value, [80, 25, 0], 1e-6), "bottom right: [80, 25]");

// Animated rotation with keyed Position: Position gets keys where rotation changes and at the
// current time, so nothing moves there.
var spin = T.solid(comp, "Spin", 200, 100);
spin.transform.position.setValueAtTime(0, [300, 300]);
spin.transform.position.setValueAtTime(2, [700, 300]);
spin.transform.rotation.setValueAtTime(0, 0);
spin.transform.rotation.setValueAtTime(2, 180);
comp.time = 1;
before = snap(spin, 200, 100);
T.select(comp, [spin], []);
r = MotionKit.run("moveAnchor", { point: "tl" });
T.check(r.ok && /Spin has animated scale or rotation/.test(r.message) && /can drift slightly between them/.test(r.message), "animated rotation: the message says so: " + r.message);
T.check(spin.transform.position.numKeys === 3 && kept(spin, 200, 100, before), "Position gets a key at the current time (t = 1); nothing moves at t = 0, 1 and 2");
// Animated scale with a static Position: Position gets keys at the scale keys and the current time.
comp.time = 0;
var grow = T.solid(comp, "Grow", 200, 100);
grow.transform.position.setValue([500, 300]);
grow.transform.scale.setValueAtTime(0, [50, 50]);
grow.transform.scale.setValueAtTime(2, [200, 200]);
before = snap(grow, 200, 100);
T.select(comp, [grow], []);
r = MotionKit.run("moveAnchor", { point: "tl" });
T.check(r.ok && grow.transform.position.numKeys === 2 && kept(grow, 200, 100, before), "animated scale, static Position: keys at t = 0 and 2, nothing moves at t = 0, 1, 2 (linear scale)");
comp.time = 1;

// The 3 x 3 grid in the options dialog.
var dlg = MotionKit.optionsDialog.build(MotionKit.tools.moveAnchor, { point: "tr", masks: false });
var grid = dlg.inputs.point;
T.check(grid.get() === "tr", "the options grid shows the saved point");
var rows = grid.control.children, bl = rows[2].children[0];
T.check(rows.length === 3 && rows[0].children.length === 3 && rows[0].children[2].value === true && bl.type === "radiobutton", "it is three rows of three radio buttons, top right on");
bl.value = true;
bl.onClick();
var on = 0;
for (var ri = 0; ri < 3; ri++) for (var ci = 0; ci < 3; ci++) if (rows[ri].children[ci].value) on++;
T.check(grid.get() === "bl" && on === 1 && dlg.read().values.point === "bl", "clicking bottom left picks it and clears the others (across rows)");

// One undo step.
var u = T.solid(comp, "Undo Me", 100, 60);
T.select(comp, [u], []);
MotionKit.run("moveAnchor", { point: "tl" });
T.check(T.near(u.transform.anchorPoint.value, [0, 0, 0]), "moved");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(T.near(u.transform.anchorPoint.value, [50, 30, 0]) && T.near(u.transform.position.value, [500, 300, 0]) && u.property("ADBE Effect Parade").numProperties === 0, "one Undo restores anchor and position (and leaves no probe effect)");

T.done();
