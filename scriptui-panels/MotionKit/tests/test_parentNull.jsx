// SPDX-License-Identifier: MIT OR Apache-2.0
// Add Parent Null: world positions kept (rotation, scale, an existing parent, keyframes),
// the null at the bounds centre / average / top layer, above the top layer, 3D when all are,
// re-parent all (layers under another selected layer keep their parent), one null per layer
// (taking over the old parent), exact shape-layer bounds, cameras and lights, bad selections.
// Comp positions are checked with EffectCraft's own sourcePointToComp, not Motion Kit's helpers.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers;

var comp = T.comp("Parent Test");
comp.time = 1;
var a = T.solid(comp, "A", 200, 100);
a.transform.rotation.setValue(30);
a.transform.scale.setValue([150, 80]);
a.transform.position.setValueAtTime(0, [300, 200]);
a.transform.position.setValueAtTime(2, [500, 260]);
var p = comp.layers.addNull();
p.name = "Old Parent";
p.transform.position.setValue([600, 300]);
p.transform.rotation.setValue(20);
p.transform.scale.setValue([120, 120]);
var b = T.solid(comp, "B", 100, 100);
b.parent = p;
b.transform.position.setValue([80, 40]);
var c = T.solid(comp, "C", 60, 60);
c.transform.position.setValue([150, 450]);

// Comp-space corners of a layer's rectangle at comp time t (EffectCraft's own conversion).
function corners(L, t) {
  comp.time = t;
  var r = L.sourceRectAtTime(t, false), out = [];
  var pts = [[r.left, r.top], [r.left + r.width, r.top], [r.left + r.width, r.top + r.height], [r.left, r.top + r.height]];
  for (var i = 0; i < 4; i++) out.push(L.sourcePointToComp(pts[i]));
  comp.time = 1;
  return out;
}
function same(x, y) {
  for (var i = 0; i < x.length; i++) if (!T.near(x[i], y[i], 1e-3)) return false;
  return true;
}
function snap(layers) {
  var s = [];
  for (var i = 0; i < layers.length; i++) s.push([corners(layers[i], 0), corners(layers[i], 1), corners(layers[i], 2)]);
  return s;
}
function unchanged(layers, before) {
  var now = snap(layers);
  for (var i = 0; i < layers.length; i++) for (var k = 0; k < 3; k++) if (!same(before[i][k], now[i][k])) return false;
  return true;
}

// Bad selections.
T.select(comp, [], []);
var none = MotionKit.run("parentNull");
T.check(!none.ok && /select one or more layers/.test(none.message) && comp.numLayers === 4, "no layers: refused, nothing added");

// Default: bounds centre, layers without a parent are parented.
var all = [a, b, c], before = snap(all);
var expected = [];
for (var i = 0; i < 3; i++) expected = expected.concat(corners(all[i], 1));
var bb = H.space.bounds(expected);
T.select(comp, [b, c, a], []);
var r = MotionKit.run("parentNull");
var nul = comp.layer("Parent Null");
T.check(r.ok && nul && r.created.length === 1 && r.created[0].name === "Parent Null", "creates \"Parent Null\": " + r.message);
T.check(nul.index === 1 && c.index === 2, "the null sits above the top-most selected layer (C, the newest)");
T.check(nul.nullLayer && !nul.threeDLayer, "a 2D null for 2D layers");
T.check(T.near(nul.transform.position.value, [bb.center[0], bb.center[1]], 1e-3), "at the centre of the combined bounds " + bb.center[0].toFixed(2) + ", " + bb.center[1].toFixed(2));
T.check(a.parent && a.parent.name === "Parent Null" && c.parent && c.parent.name === "Parent Null", "unparented layers now follow the null");
T.check(b.parent && b.parent.name === "Old Parent", "a layer with a parent keeps it");
T.check(unchanged(all, before), "nothing moved, at the current time and on the keyframes (t = 0, 1, 2)");
nul.transform.position.setValue([nul.transform.position.value[0] + 50, nul.transform.position.value[1]]);
T.check(T.near(corners(c, 1)[0][0], before[2][1][0][0] + 50, 1e-3), "moving the null moves its children");
app.executeCommand(app.findMenuCommandId("Undo"));

// Re-parent all, with the average position.
before = snap(all);
T.select(comp, [a, b], []);
r = MotionKit.run("parentNull", { reparentAll: true, anchor: "average" });
var nul2 = r.created[0];
T.check(r.ok && a.parent.index === nul2.index && b.parent.index === nul2.index, "re-parent all moves b off its old parent too");
T.check(unchanged(all, before), "still nothing moved");
var aa = a.sourcePointToComp([100, 50]), ba = b.sourcePointToComp([50, 50]);
T.check(T.near(nul2.transform.position.value, [(aa[0] + ba[0]) / 2, (aa[1] + ba[1]) / 2], 1e-3), "average: the mean of the anchor points in comp space");

// Top-most layer's position.
var d = T.solid(comp, "D", 40, 40), e = T.solid(comp, "E", 40, 40);
d.transform.position.setValue([100, 100]);
e.transform.position.setValue([800, 500]);
T.select(comp, [d, e], []);
r = MotionKit.run("parentNull", { anchor: "top" });
T.check(r.ok && T.near(r.created[0].transform.position.value, [800, 500]), "top: the top-most layer's position (E is above D)");

// Every selected layer already has a parent.
T.select(comp, [d], []);
var kept = MotionKit.run("parentNull");
T.check(!kept.ok && /already has a parent/.test(kept.message), "all parented and re-parent off: refused (" + kept.message + ")");

// One null per layer.
var f = T.solid(comp, "F", 100, 50), g = T.solid(comp, "G", 100, 50);
f.transform.position.setValue([200, 100]);
f.transform.rotation.setValue(45);
g.transform.anchorPoint.setValue([0, 0]);
g.transform.position.setValue([600, 100]);
before = snap([f, g]);
T.select(comp, [f, g], []);
r = MotionKit.run("parentNull", { perLayer: true });
T.check(r.ok && r.created.length === 2, "null per layer: " + r.message);
var fn = comp.layer("F Parent"), gn = comp.layer("G Parent");
T.check(fn && gn && f.parent.index === fn.index && g.parent.index === gn.index, "each layer follows its own null");
T.check(fn.index === f.index - 1 && gn.index === g.index - 1, "each null sits directly above its layer");
T.check(T.near(fn.transform.position.value, [200, 100]) && T.near(gn.transform.position.value, [600, 100]), "each null at its layer's anchor point");
T.check(unchanged([f, g], before), "nothing moved");

// 3D layers: a 3D null, world positions kept.
var h1 = T.solid(comp, "H1", 100, 100), h2 = T.solid(comp, "H2", 100, 100);
h1.threeDLayer = true;
h2.threeDLayer = true;
h1.transform.position.setValue([300, 300, 200]);
h2.transform.position.setValue([500, 300, -100]);
h2.transform.property("ADBE Rotate Y").setValue(40);
var w1 = H.space.toWorld(h1, [0, 0, 0]), w2 = H.space.toWorld(h2, [100, 100, 0]);
T.select(comp, [h1, h2], []);
r = MotionKit.run("parentNull");
var n3 = r.created[0];
T.check(r.ok && n3.threeDLayer, "3D layers get a 3D null");
T.check(T.near(H.space.toWorld(h1, [0, 0, 0]), w1, 1e-3) && T.near(H.space.toWorld(h2, [100, 100, 0]), w2, 1e-3), "3D world positions kept");
T.check(Math.abs(n3.transform.position.value[2] - 50) < 40, "the 3D null's depth is between the layers (" + n3.transform.position.value[2].toFixed(1) + ")");
var mixed = T.solid(comp, "Flat", 10, 10);
T.select(comp, [mixed, h1], []);
r = MotionKit.run("parentNull", { reparentAll: true });
T.check(r.ok && !r.created[0].threeDLayer, "a 2D null when not all layers are 3D");

// Re-parent all with a hierarchy selected: Arm stays on Body, which moves.
var body = T.solid(comp, "Body", 100, 100);
body.transform.position.setValueAtTime(0, [200, 200]);
body.transform.position.setValueAtTime(2, [600, 200]);
var arm = T.solid(comp, "Arm", 50, 50);
arm.parent = body;
before = snap([body, arm]);
T.select(comp, [body, arm], []);
r = MotionKit.run("parentNull", { reparentAll: true });
T.check(r.ok && body.parent.index === r.created[0].index && arm.parent.index === body.index && /1 kept their parent/.test(r.message),
  "re-parent all: Body goes on the null, Arm (under the selected Body) keeps Body: " + r.message);
T.check(unchanged([body, arm], before), "and Arm still moves with Body (t = 0, 1, 2)");

// Null per layer with re-parent all: the new null takes over the old, moving parent.
var body2 = T.solid(comp, "Body 2", 100, 100);
body2.transform.position.setValueAtTime(0, [200, 400]);
body2.transform.position.setValueAtTime(2, [600, 400]);
body2.transform.rotation.setValue(15);
var hand = T.solid(comp, "Hand", 50, 50);
hand.parent = body2;
before = snap([hand]);
T.select(comp, [hand], []);
r = MotionKit.run("parentNull", { reparentAll: true, perLayer: true });
var hp = comp.layer("Hand Parent");
T.check(r.ok && hp && hand.parent.index === hp.index && hp.parent && hp.parent.index === body2.index, "null per layer: Hand -> Hand Parent -> Body 2");
T.check(unchanged([hand], before), "and Hand still moves with Body 2 (t = 0, 1, 2)");

// A shape layer: the exact centre of its contents, not EffectCraft's padded, rounded rectangle.
var sh = comp.layers.addShape();
var grp = sh.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([100, 50]);
grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").setValue(10);
var gtr = grp.property("ADBE Vector Transform Group");
gtr.property("ADBE Vector Position").setValue([200, 100]);
gtr.property("ADBE Vector Rotation").setValue(45);
gtr.property("ADBE Vector Scale").setValue([150, 150]);
sh.transform.position.setValue([300, 300]);
T.select(comp, [sh], []);
r = MotionKit.run("parentNull");
var mid = sh.sourcePointToComp([200, 100]);
T.check(r.ok && T.near(r.created[0].transform.position.value, [mid[0], mid[1]], 1e-3),
  "a shape layer's null sits at the centre of its rotated rectangle (" + r.created[0].transform.position.value[0].toFixed(3) + ", " + r.created[0].transform.position.value[1].toFixed(3) + ")");

// Cameras and lights: a 3D null at their position, and they don't move.
var cam = comp.layers.addCamera("Cam", [500, 300]);
cam.transform.position.setValue([400, 250, -900]);
var view = [H.space.toWorld(cam, [0, 0, 0]), H.space.toWorld(cam, [0, 0, 100])];
T.select(comp, [cam], []);
r = MotionKit.run("parentNull");
T.check(r.ok && r.created[0].threeDLayer && T.near(r.created[0].transform.position.value, [400, 250, -900], 1e-3) && cam.parent.index === r.created[0].index,
  "a camera gets a 3D null at its position: " + r.message);
T.check(T.near(H.space.toWorld(cam, [0, 0, 0]), view[0], 1e-3) && T.near(H.space.toWorld(cam, [0, 0, 100]), view[1], 1e-3), "and keeps its place and direction");
var light = comp.layers.addLight("Key", [500, 300]);
light.transform.position.setValue([100, 50, -300]);
T.select(comp, [light], []);
r = MotionKit.run("parentNull", { perLayer: true });
T.check(r.ok && comp.layer("Key Parent").threeDLayer && T.near(H.space.toWorld(light, [0, 0, 0]), [100, 50, -300], 1e-3), "a light, null per layer: a 3D null, the light stays put: " + r.message);

T.done();
