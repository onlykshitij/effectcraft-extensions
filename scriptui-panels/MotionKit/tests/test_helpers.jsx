// SPDX-License-Identifier: MIT OR Apache-2.0
// The core helpers other tools build on: space conversion, keyframe read/write, expression
// controls, shape traversal and group matrices, 2D matrices.
// Checked against EffectCraft's own answers (sourcePointToComp, sourceRectAtTime).
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers, S = H.space, K = H.keys, C = H.controls, SH = H.shapes, M = H.mat;

var comp = T.comp("Helpers Test", 1000, 600);
var par = comp.layers.addNull();
par.transform.position.setValue([400, 300]);
par.transform.rotation.setValue(25);
par.transform.scale.setValue([150, 80]);
var lay = T.solid(comp, "Child", 120, 60);
lay.parent = par;
lay.transform.position.setValue([30, -20]);
lay.transform.rotation.setValue(-40);
lay.transform.anchorPoint.setValue([10, 5]);

// ---- space
var pts = [[0, 0], [120, 0], [120, 60], [37, 11]];
var mine = S.toCompPoints(lay, pts), ok = true;
for (var i = 0; i < pts.length; i++) if (!T.near(mine[i], lay.sourcePointToComp(pts[i]), 1e-6)) ok = false;
T.check(ok, "toCompPoints matches EffectCraft's sourcePointToComp through a rotated, scaled parent");
T.check(T.near(S.toComp(lay, [37, 11]), lay.sourcePointToComp([37, 11]), 1e-6), "toComp (single point)");
var back = S.fromComp(lay, S.toComp(lay, [37, 11]));
T.check(T.near(back, [37, 11, 0], 1e-6), "fromComp undoes toComp");
var m = S.matrix(lay), inv = M.invert(m);
T.check(T.near(M.apply(M.mul(m, inv), [5, 7]), [5, 7], 1e-9), "matrix() is affine and invertible");
var corners = S.rectCornersInComp(lay, 0);
T.check(corners.length === 4 && T.near(corners[2], lay.sourcePointToComp([120, 60]), 1e-6), "rectCornersInComp: the four corners in comp space");
T.check(T.near(S.anchorInComp(lay), lay.sourcePointToComp([10, 5]), 1e-6), "anchorInComp");
var target = [700, 150];
var inParent = S.compToParent(lay, target);
lay.transform.position.setValue([inParent[0], inParent[1]]);
T.check(T.near(lay.sourcePointToComp([10, 5]), target, 1e-6), "compToParent: setting Position to it puts the anchor on the comp point");
var b = S.bounds([[1, 5, 0], [3, -1, 10], [-2, 2, 2]]);
T.check(b.left === -2 && b.right === 3 && b.top === -1 && b.bottom === 5 && T.near(b.center, [0.5, 2, 4]), "bounds");
// Time: keys move the layer, conversions follow the time asked for.
lay.transform.position.setValueAtTime(0, [0, 0]);
lay.transform.position.setValueAtTime(2, [100, 0]);
comp.time = 2;
var at2 = lay.sourcePointToComp([10, 5]);
comp.time = 0;
T.check(T.near(S.toComp(lay, [10, 5], 2), at2, 1e-6), "conversions at another time than the current one");
// 3D and layers without effects.
var l3 = T.solid(comp, "Deep", 100, 100);
l3.threeDLayer = true;
l3.transform.position.setValue([300, 200, 400]);
l3.transform.property("ADBE Rotate Y").setValue(30);
T.check(!S.is2D(l3) && S.is2D(par), "is2D");
var w = S.toWorld(l3, [100, 0, 0]);
T.check(T.near(w, [300 + 50 * Math.cos(Math.PI / 6), 150, 400 - 50 * Math.sin(Math.PI / 6)], 1e-3), "toWorld on a 3D layer (rotated 30 degrees about Y)");
T.check(T.near(S.fromWorld(l3, w), [100, 0, 0], 1e-6), "fromWorld undoes it");
var cam = comp.layers.addCamera("Cam", [500, 300]);
var nBefore = comp.numLayers;
var cw = S.toWorld(cam, [0, 0, 0]);
T.check(cw.length === 3 && comp.numLayers === nBefore && lay.property("ADBE Effect Parade").numProperties === 0, "a camera (no effects) converts through a temporary null; no probes are left behind");
cam.remove();

// ---- 2D matrices
var tm = M.transform([10, 5], [100, 50], [200, 50], 90, 0, 0);
T.check(T.near(M.apply(tm, [10, 5]), [100, 50]) && T.near(M.apply(tm, [11, 5]), [100, 52]), "transform: anchor to position, then scale and rotate");
T.check(M.invert([0, 0, 1, 0, 0, 1]) === null, "a singular matrix has no inverse");

// ---- keyframes
var src = T.solid(comp, "Keys", 50, 50), dst = T.solid(comp, "Copy", 50, 50);
var sp = src.transform.position;
sp.setValueAtTime(1, [100, 100]);
sp.setValueAtTime(2, [300, 100]);
sp.setValueAtTime(3, [300, 300]);
sp.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
sp.setTemporalEaseAtKey(2, [new KeyframeEase(0, 75)], [new KeyframeEase(50, 20)]);
sp.setSpatialTangentsAtKey(2, [-40, 0, 0], [0, 40, 0]);
var k2 = K.read(sp, 2);
T.check(k2.time === 2 && T.near(k2.value, [300, 100]) && k2.inInterp === KeyframeInterpolationType.BEZIER && T.near(k2.inEase[0].influence, 75) && T.near(k2.outEase[0].speed, 50), "read: time, value, interpolation, eases");
T.check(k2.spatial && T.near(k2.inTangent, [-40, 0]) && T.near(k2.outTangent, [0, 40]), "read: spatial tangents");
var keys = K.readAll(sp), dp = dst.transform.position;
for (var j = 0; j < keys.length; j++) K.write(dp, keys[j], keys[j].time + 2);
var c2 = K.read(dp, 2);
T.check(dp.numKeys === 3 && c2.time === 4 && T.near(c2.value, [300, 100]) && T.near(c2.inEase[0].influence, 75) && T.near(c2.outEase[0].influence, 20) && T.near(c2.outTangent, [0, 40]), "write copies a key to another time and property, eases and tangents included");
T.check(T.near(dp.valueAtTime(4.5, false), sp.valueAtTime(2.5, false), 1e-6), "the copy animates the same way");
var op = dst.transform.opacity;
op.setValueAtTime(0, 0);
op.setValueAtTime(1, 100);
K.setEase(op, 1, [{ speed: 0, influence: 60 }], [{ speed: 0, influence: 60 }]);
K.write(op, { value: 50, inEase: k2.inEase, outEase: k2.outEase }, 2, { interp: false });
T.check(op.numKeys === 3 && T.near(op.keyInTemporalEase(3)[0].influence, 75), "eases fit other properties; parts limit what is written");
var sc = dst.transform.scale;
sc.setValueAtTime(0, [100, 100]);
K.setEase(sc, 1, [{ speed: 0, influence: 40 }], null);
var se = sc.keyInTemporalEase(1), all40 = se.length >= 2;
for (var e = 0; e < se.length; e++) if (!T.near(se[e].influence, 40)) all40 = false;
T.check(all40 && T.near(sc.keyOutTemporalEase(1)[0].influence, 40), "a one-entry ease is reused for every dimension (" + se.length + " on Scale)");
K.remove(dp, [1, 3]);
T.check(dp.numKeys === 1 && dp.keyTime(1) === 4, "remove by indices in any order");
sp.setSelectedAtKey(2, true);
sp.setSelectedAtKey(1, false);
sp.setSelectedAtKey(3, false);
T.check(K.readSelected(sp).length === 1 && K.readSelected(sp)[0].index === 2, "readSelected");

// ---- expression controls
var e1 = C.slider(lay, C.name("Test", "Amount"), 12);
var e2 = C.slider(lay, "Test – Amount", 99);
T.check(e1.name === "Test – Amount" && lay.property("ADBE Effect Parade").numProperties === 1 && e2.property(1).value === 12, "ensure creates a control once and reuses it by name (value kept)");
C.color(lay, "Tint", "#FF8000");
C.checkbox(lay, "Flag", true);
C.layer(lay, "Target", par);
C.point(lay, "Offset", [3, 4]);
C.angle(lay, "Turn", 45);
C.dropdown(lay, "Choice", 2);
T.check(T.near(C.find(lay, "Tint").property(1).value, [1, 128 / 255, 0, 1]) && C.find(lay, "Flag").property(1).value === 1 &&
  C.find(lay, "Target").property(1).value === par.index && T.near(C.find(lay, "Offset").property(1).value, [3, 4]) &&
  C.find(lay, "Turn").property(1).value === 45 && C.find(lay, "Choice").property(1).value === 2, "colour (hex), checkbox, layer, point, angle and dropdown controls");
T.check(C.find(lay, "Tint", "ADBE Slider Control") === null, "find can require a control type");
lay.transform.opacity.expression = C.ref("Test – Amount") + " * 2";
T.check(T.near(lay.transform.opacity.valueAtTime(0, false), 24), "ref() reads a control in an expression");
T.check(C.ref("Flag", "ADBE Checkbox Control") === "effect(\"Flag\")(\"Checkbox\")", "ref names the control's value property");

// ---- expressions
var ctx = { confirm: function () { return false; } };
lay.transform.rotation.expression = "value";
lay.transform.opacity.expression = "";
var dd = H.expr.decide(ctx, [lay.transform.rotation, lay.transform.opacity]);
T.check(dd.apply.length === 1 && dd.skip.length === 1, "decide keeps expressions Motion Kit didn't write when the user says no");
H.expr.set(lay.transform.opacity, "test", "50");
T.check(H.expr.isOurs(lay.transform.opacity, "test") && !H.expr.isOurs(lay.transform.rotation), "isOurs reads the first-line mark");
T.check(H.expr.str("a\"b") === "\"a\\\"b\"", "str quotes text for expressions");

// ---- shapes
var sh = comp.layers.addShape();
var root = sh.property("ADBE Root Vectors Group");
var g1 = root.addProperty("ADBE Vector Group");
var g2 = g1.property("ADBE Vectors Group").addProperty("ADBE Vector Group");
var rect = g2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
rect.property("ADBE Vector Rect Size").setValue([100, 40]);
g2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
g1.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
root.addProperty("ADBE Vector Graphic - Stroke");
var t1 = SH.groupTransform(g1), t2 = SH.groupTransform(g2);
t1.property("ADBE Vector Position").setValue([200, 100]);
t1.property("ADBE Vector Rotation").setValue(30);
t1.property("ADBE Vector Scale").setValue([150, 100]);
t2.property("ADBE Vector Anchor").setValue([10, 0]);
t2.property("ADBE Vector Skew").setValue(20);
t2.property("ADBE Vector Skew Axis").setValue(15);
var seen = [];
SH.walk(sh, function (it, groups) { seen.push(it.matchName.replace("ADBE Vector ", "") + "@" + groups.length); });
T.check(seen.join(",") === "Group@0,Group@1,Shape - Rect@2,Shape - Ellipse@2,Graphic - Fill@1,Graphic - Stroke@0", "walk visits every item with its enclosing groups: " + seen.join(","));
var found = SH.find(sh, "ADBE Vector Shape - Rect");
T.check(found.length === 1 && found[0].groups.length === 2 && SH.groupsOf(found[0].item.property("ADBE Vector Rect Size")).length === 2, "find and groupsOf");
// A rectangle's corners through two group transforms bound a layer's own sourceRect.
var sh2 = comp.layers.addShape();
var h1 = sh2.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
var h2 = h1.property("ADBE Vectors Group").addProperty("ADBE Vector Group");
var r2 = h2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
r2.property("ADBE Vector Rect Size").setValue([100, 40]);
h2.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
var u1 = SH.groupTransform(h1), u2 = SH.groupTransform(h2);
u1.property("ADBE Vector Position").setValue([200, 100]);
u1.property("ADBE Vector Rotation").setValue(30);
u1.property("ADBE Vector Scale").setValue([150, 100]);
u2.property("ADBE Vector Anchor").setValue([10, 0]);
u2.property("ADBE Vector Skew").setValue(20);
u2.property("ADBE Vector Skew Axis").setValue(15);
var mm = SH.toLayerMatrix(SH.groupsOf(r2.property("ADBE Vector Rect Size")), 0), pc = [];
var rc = [[-50, -20], [50, -20], [50, 20], [-50, 20]];
for (var q = 0; q < 4; q++) { var pq = M.apply(mm, rc[q]); pc.push([pq[0], pq[1], 0]); }
var bb = S.bounds(pc), sr = sh2.sourceRectAtTime(0, false);
// EffectCraft's shape bounds have a 1 px margin and whole-pixel sizes: left - 1, top - 1,
// width + 2 and height + 2 rounded up.
function r3(a) { return U.map(a, function (v) { return v.toFixed(2); }).join(", "); }
var U = H.util;
T.check(T.near([bb.left - 1, bb.top - 1], [sr.left, sr.top], 0.05) && T.near([Math.ceil(bb.width + 2), Math.ceil(bb.height + 2)], [sr.width, sr.height], 0.5),
  "group matrices (position, rotation, scale, anchor, skew) match EffectCraft's bounds: " + r3([bb.left, bb.top, bb.width, bb.height]) + " vs " + r3([sr.left, sr.top, sr.width, sr.height]));
var pathItem = g2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
T.check(SH.paths(sh).length === 1 && SH.paths(sh)[0].prop.matchName === "ADBE Vector Shape" && SH.paths(sh)[0].groups.length === 2, "paths lists path properties with their groups");
T.check(SH.contents(lay) === null && SH.isGroup(g1) && !SH.isGroup(rect), "contents is null for non-shape layers; isGroup");

// ---- UI colours: sent as linear, so EffectCraft's linear-to-sRGB step shows the hex colour
function toSrgb(v) { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
var lin = U.rgba("#2B2B2B");
T.check(U.LINEAR_UI && Math.abs(toSrgb(lin[0]) * 255 - 43) < 0.5 && lin[3] === 1, "rgba sends #2B2B2B as linear " + lin[0].toFixed(4) + " (shows as 43)");

T.done();
