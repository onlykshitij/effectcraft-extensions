// SPDX-License-Identifier: MIT OR Apache-2.0
// Nulls <-> Points: nulls at the vertices' comp positions (nested, skewed shape groups, a rotated
// and parented layer, masks); "points follow nulls" leaves the path unchanged until a null moves,
// then the vertex follows; tangents follow a rotated null when asked; "nulls follow points"
// tracks an animated mask; parent null; deleted nulls; renamed nulls and path layers (Layer
// Controls); the note on an animated path layer; foreign expressions; bad selection; undo.
// Comp positions are checked with EffectCraft's own sourcePointToComp.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers;

var comp = T.comp("Nulls Points Test");
var boss = comp.layers.addNull();
boss.name = "Boss";
boss.transform.position.setValue([420, 260]);
boss.transform.rotation.setValue(15);

var sh = comp.layers.addShape();
sh.name = "Blob";
sh.parent = boss;
sh.transform.position.setValue([60, 40]);
sh.transform.rotation.setValue(-20);
sh.transform.scale.setValue([120, 90]);
var g1 = sh.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
var t1 = g1.property("ADBE Vector Transform Group");
t1.property("ADBE Vector Position").setValue([30, -10]);
t1.property("ADBE Vector Anchor").setValue([5, 5]);
t1.property("ADBE Vector Rotation").setValue(25);
t1.property("ADBE Vector Scale").setValue([80, 110]);
var g2 = g1.property("ADBE Vectors Group").addProperty("ADBE Vector Group");
var t2 = g2.property("ADBE Vector Transform Group");
t2.property("ADBE Vector Skew").setValue(12);
t2.property("ADBE Vector Skew Axis").setValue(30);
t2.property("ADBE Vector Position").setValue([-15, 20]);
var item = g2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
var path = item.property("ADBE Vector Shape");
var shp = new Shape();
shp.vertices = [[0, 0], [100, -20], [120, 80], [-10, 60]];
shp.inTangents = [[0, -15], [-30, 0], [10, -25], [-5, 20]];
shp.outTangents = [[0, 15], [30, 0], [-10, 25], [5, -20]];
shp.closed = true;
path.setValue(shp);
g2.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");

// Where a path-space point of the blob is in comp space (EffectCraft's own layer -> comp).
function blobToComp(p) {
  var q = H.mat.apply(H.shapes.toLayerMatrix([g1, g2], comp.time), p);
  return sh.sourcePointToComp(q);
}
function pos(L, t) { var v = L.transform.position.valueAtTime(t === undefined ? comp.time : t, false); return [v[0], v[1]]; }
function samePath(a, b, eps) {
  if (a.vertices.length !== b.vertices.length || a.closed !== b.closed) return false;
  for (var i = 0; i < a.vertices.length; i++) {
    if (!T.near(a.vertices[i], b.vertices[i], eps) || !T.near(a.inTangents[i], b.inTangents[i], eps) || !T.near(a.outTangents[i], b.outTangents[i], eps)) return false;
  }
  return true;
}

// Bad selections change nothing.
var n0 = comp.numLayers;
T.select(comp, [sh], []);
var bad = MotionKit.run("nullsPoints");
T.check(!bad.ok && /path propert/.test(bad.message) && /path/.test(T.lastAlert()) && comp.numLayers === n0, "no path selected: refused with an alert, nothing added (" + bad.message + ")");
T.select(comp, [sh], [t1.property("ADBE Vector Position")]);
T.check(!MotionKit.run("nullsPoints").ok && comp.numLayers === n0, "a non-path property is refused");

// Points follow nulls (default).
var before = path.valueAtTime(0, false);
var expected = H.util.map(before.vertices, blobToComp);
T.select(comp, [], [path]);
var r = MotionKit.run("nullsPoints");
T.check(r.ok && r.created.length === 4 && comp.numLayers === n0 + 4, "four nulls for four vertices: " + r.message);
T.check(!/no longer moves/.test(r.message), "no note about animation when nothing about the path is animated");
var nulls = [];
for (var i = 1; i <= 4; i++) nulls.push(comp.layer("Blob Point " + i));
T.check(nulls[0] && nulls[3] && nulls[0].nullLayer, "named \"Blob Point 1\" to \"Blob Point 4\"");
T.check(nulls[3].index === sh.index - 1 && nulls[0].index === sh.index - 4, "the nulls sit above the path's layer, Point 1 on top");
var worst = 0;
for (i = 0; i < 4; i++) worst = Math.max(worst, Math.abs(pos(nulls[i])[0] - expected[i][0]), Math.abs(pos(nulls[i])[1] - expected[i][1]));
T.check(worst < 1e-3, "each null is at its vertex in comp space, through two groups (one skewed), the layer and its parent (error " + worst.toExponential(1) + ")");
T.check(path.expression.indexOf("// Motion Kit: nullsPoints") === 0 && path.expressionError === "", "the path gets the Motion Kit expression and it compiles");
T.check(samePath(path.valueAtTime(0, false), before, 1e-6), "round trip: the path is unchanged at t = 0");
T.check(samePath(path.valueAtTime(3, false), before, 1e-6), "and at t = 3");

nulls[1].transform.position.setValue([pos(nulls[1])[0] + 30, pos(nulls[1])[1] - 12]);
var moved = path.valueAtTime(0, false);
T.check(T.near(blobToComp(moved.vertices[1]), [expected[1][0] + 30, expected[1][1] - 12], 1e-3), "moving null 2 moves vertex 2 by the same comp-space offset");
T.check(T.near(moved.vertices[0], before.vertices[0], 1e-6) && T.near(moved.outTangents[1], before.outTangents[1], 1e-6), "the other vertices and the tangents stay");
var link = sh.property("ADBE Effect Parade").property("Nulls ↔ Points – Blob Point 2");
nulls[1].name = "Knee";
T.check(link && link.property(1).value === nulls[1].index && T.near(path.valueAtTime(0, false).vertices[1], moved.vertices[1], 1e-6) && path.expressionError === "",
  "renaming null 2 keeps vertex 2 on it (the Layer Control \"Nulls ↔ Points – Blob Point 2\" on Blob names it)");

// A deleted null: that vertex falls back to the path's own value, never NaN.
nulls[3].remove();
var gone = path.valueAtTime(0, false);
T.check(gone.vertices.length === 4 && T.near(gone.vertices[3], before.vertices[3], 1e-6) && path.expressionError === "", "a deleted null leaves its vertex where the path has it");

// Tangents follow too, on a plain 2D shape.
var s2 = comp.layers.addShape();
s2.name = "Wave";
var it2 = s2.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Group");
var p2 = it2.property("ADBE Vector Shape");
var w = new Shape();
w.vertices = [[-100, 0], [100, 0]];
w.inTangents = [[0, 0], [-40, 0]];
w.outTangents = [[40, 0], [0, 0]];
w.closed = false;
p2.setValue(w);
s2.transform.rotation.setValue(30);
T.select(comp, [], [p2]);
r = MotionKit.run("nullsPoints", { tangents: true, parent: true });
T.check(r.ok && r.created.length === 3, "tangents and parent options: two nulls and a parent: " + r.message);
var wp1 = comp.layer("Wave Point 1"), wpar = comp.layer("Wave Points");
T.check(wpar && wp1.parent && wp1.parent.index === wpar.index && wpar.index < wp1.index, "the nulls are grouped under \"Wave Points\", above them");
var c0 = s2.sourcePointToComp([-100, 0]), c1 = s2.sourcePointToComp([100, 0]);
T.check(T.near(wpar.transform.position.value, [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2], 1e-3), "the parent null is at the centre of the points");
T.check(T.near(H.space.anchorInComp(wp1), c0, 1e-3), "a grouped null is still at its vertex");
T.check(samePath(p2.valueAtTime(0, false), w, 1e-6), "round trip with tangents on: unchanged");
wp1.transform.rotation.setValue(90);
var turned = p2.valueAtTime(0, false);
var tip = s2.sourcePointToComp([turned.vertices[0][0] + turned.outTangents[0][0], turned.vertices[0][1] + turned.outTangents[0][1]]);
var dir = [tip[0] - c0[0], tip[1] - c0[1]];
var want = [-40 * Math.sin(Math.PI / 6), 40 * Math.cos(Math.PI / 6)];
T.check(T.near(turned.vertices[0], [-100, 0], 1e-6) && T.near(dir, want, 1e-3), "rotating the null 90 degrees turns its tangent 90 degrees in comp space");
wp1.transform.scale.setValue([50, 50]);
var halved = p2.valueAtTime(0, false);
T.check(T.near(Math.sqrt(halved.outTangents[0][0] * halved.outTangents[0][0] + halved.outTangents[0][1] * halved.outTangents[0][1]), 20, 1e-3), "scaling the null to 50 % halves its tangent");
wpar.transform.position.setValue([wpar.transform.position.value[0] + 10, wpar.transform.position.value[1]]);
T.check(T.near(s2.sourcePointToComp(p2.valueAtTime(0, false).vertices[1]), [c1[0] + 10, c1[1]], 1e-3), "moving the parent null moves every point");

// Nulls follow points, on an animated mask of a rotated solid.
var solid = T.solid(comp, "Plate", 200, 120);
solid.transform.rotation.setValue(-35);
solid.transform.position.setValue([300, 400]);
var mask = solid.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
var mp = mask.property("ADBE Mask Shape");
var ms = mp.value;
mp.setValueAtTime(0, ms);
var ms2 = mp.value;
ms2.vertices[2] = [190, 150];
mp.setValueAtTime(1, ms2);
T.select(comp, [], [mask]);
r = MotionKit.run("nullsPoints", { mode: "nulls" });
T.check(r.ok && r.created.length === 4 && mp.expression === "", "nulls follow points on a mask (selected as the mask group); the mask keeps no expression: " + r.message);
var pl3 = comp.layer("Plate Point 3");
T.check(pl3.transform.position.expression.indexOf("// Motion Kit: nullsPoints") === 0 && pl3.transform.position.expressionError === "", "the nulls get position expressions");
comp.time = 0;
var e0 = solid.sourcePointToComp(ms.vertices[2]);
comp.time = 1;
var e1 = solid.sourcePointToComp([190, 150]);
comp.time = 0;
T.check(T.near(pos(pl3, 0), e0, 1e-3) && T.near(pos(pl3, 1), e1, 1e-3), "null 3 tracks the animated vertex in comp space (t = 0 and t = 1)");
solid.transform.position.setValue([350, 380]);
comp.time = 1;
var e2 = solid.sourcePointToComp([190, 150]);
comp.time = 0;
T.check(T.near(pos(pl3, 1), e2, 1e-3), "and follows when the layer moves");
solid.name = "Plate Renamed";
solid.transform.position.setValue([400, 380]);
comp.time = 1;
var e3 = solid.sourcePointToComp([190, 150]);
comp.time = 0;
T.check(T.near(pos(pl3, 1), e3, 1e-3) && pl3.property("ADBE Effect Parade").property("Nulls ↔ Points – Path Layer").property(1).value === solid.index,
  "and after renaming the path's layer (its \"Path Layer\" Layer Control names it)");
mask.remove();
var pre = pl3.transform.position.valueAtTime(1, true);
T.check(T.near(pos(pl3, 1), [pre[0], pre[1]]) && isFinite(pos(pl3, 1)[0]), "a removed mask: the null falls back to its own position, no NaN");

// Points follow nulls on a moving layer: the message says its animation no longer moves the path.
var mover = comp.layers.addShape();
mover.name = "Mover";
var pm = mover.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
pm.setValue(w);
mover.transform.position.setValueAtTime(0, [200, 300]);
mover.transform.position.setValueAtTime(2, [800, 300]);
T.select(comp, [], [pm]);
r = MotionKit.run("nullsPoints");
T.check(r.ok && /the animation of Mover \(transform, shape groups or path keyframes\) no longer moves it/.test(r.message), "an animated path layer: " + r.message);

// Foreign expressions: kept on "no".
var s3 = comp.layers.addShape();
s3.name = "Kept";
var p3 = s3.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
p3.setValue(w);
p3.expression = "value";
T.select(comp, [], [p3]);
T.answer = false;
r = MotionKit.run("nullsPoints");
T.check(r.ok && /Kept 1/.test(r.message) && p3.expression === "value" && r.created.length === 0, "a path with a foreign expression is kept when the user says no: " + r.message);
T.answer = true;

// One undo step.
var nBefore = comp.numLayers;
T.select(comp, [], [p3]);
r = MotionKit.run("nullsPoints");
T.check(r.ok && comp.numLayers === nBefore + 2 && p3.expression.indexOf("// Motion Kit") === 0, "runs again after saying yes");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(comp.numLayers === nBefore && p3.expression === "value" && s3.property("ADBE Effect Parade").numProperties === 0, "one Undo removes the nulls and their Layer Controls and restores the expression");

T.done();
