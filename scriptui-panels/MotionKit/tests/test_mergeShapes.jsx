// SPDX-License-Identifier: MIT OR Apache-2.0
// Merge Shapes: the comp looks the same (EffectCraft renders it before and after; the pixels
// are read with sampleImage through a comp that holds it), each group's matrix equals its
// source's layer-to-comp matrix (a parent with non-uniform scale makes a skew), group order,
// contents copied with keyframes, opacity, warnings for parents and animation, the merged layer
// at the origin with an identity transform, hide or delete, bad selections, one Undo; timing:
// keys move with the source's start time, the merged layer spans the sources' in-out range, and
// a source that shows for less of it or is time-stretched is warned about.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers, SH = H.shapes;
var UNDO = app.findMenuCommandId("Undo");

// The comp's pixels at comp time t: premultiplied 0-255 RGBA means of 10 x 10 px blocks,
// rendered by EffectCraft and read with sampleImage through a comp that holds this one. The
// probe is built in its own undo step and undone, so it leaves the project and the undo
// history as they were.
function pixels(comp, t) {
  var v;
  app.beginUndoGroup("Pixel probe");
  try {
    var host = app.project.items.addComp("Pixel Probe", comp.width, comp.height, 1, comp.duration, comp.frameRate);
    host.layers.add(comp);
    var src = host.layers.addText("x").property("ADBE Text Properties").property("ADBE Text Document");
    src.expression = "var L = thisComp.layer(2), o = [];\n" +
      "for (var y = 5; y < thisComp.height; y += 10) for (var x = 5; x < thisComp.width; x += 10) {\n" +
      "  var c = L.sampleImage([x, y], [5, 5], true, time);\n" +
      "  o.push((c[0] * c[3] * 255).toFixed(3), (c[1] * c[3] * 255).toFixed(3), (c[2] * c[3] * 255).toFixed(3), (c[3] * 255).toFixed(3));\n" +
      "}\no.join(',')";
    v = String(src.valueAtTime(t, false).text).split(",");
  } finally {
    app.endUndoGroup();
  }
  app.executeCommand(UNDO);
  for (var i = 0; i < v.length; i++) v[i] = Number(v[i]);
  return v;
}
function diff(a, b) {
  var m = a.length === b.length ? 0 : Infinity;
  for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
// Equal geometry doesn't give equal pixels here. EffectCraft resamples a rotated or scaled
// layer's buffer into the comp, while the merged layer (identity transform) is drawn straight
// at comp pixels; and a group with non-uniform scale or skew (A, B) changes how EffectCraft
// anti-aliases the other groups of its layer (C's edges move by up to 7.6 of 255 with a
// far-away group scaled 150 x 80, and not at all with one scaled 200 x 200). Both move edges by
// less than a pixel. Half a pixel of a full-contrast edge across a 10 px block moves the block
// mean by at most 0.5 x 10 / 100 x 255 = 12.75, the tolerance. The geometry itself is checked
// exactly above (group matrices); the perturbations below show what real mistakes cost.
var TOL = 12.75;

function addGroup(into, name, kind, size, pos, color) {
  var g = SH.inner(into).addProperty("ADBE Vector Group");
  g.name = name;
  var R = kind === "rect" ? "Rect" : "Ellipse", item = SH.inner(g).addProperty("ADBE Vector Shape - " + R);
  item.property("ADBE Vector " + R + " Size").setValue(size);
  item.property("ADBE Vector " + R + " Position").setValue(pos);
  SH.inner(g).addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(color);
  return g;
}
function names(group) {
  var c = SH.inner(group), out = [];
  for (var i = 1; i <= c.numProperties; i++) out.push(c.property(i).name);
  return out.join(",");
}

var comp = T.comp("Merge Test", 300, 200, 5, 25);
comp.time = 1;
var bg = T.solid(comp, "BG", 300, 200, [0.3, 0.3, 0.3]);
var rig = comp.layers.addNull();
rig.name = "Rig";
rig.transform.position.setValue([90, 70]);
rig.transform.scale.setValue([150, 80]);
// A: parented to a non-uniformly scaled null and rotated, so it is sheared in comp space.
var a = comp.layers.addShape();
a.name = "A";
addGroup(SH.contents(a), "A Box", "rect", [40, 24], [0, 0], [1, 0, 0]);
a.parent = rig;
a.transform.position.setValue([0, 0]);
a.transform.rotation.setValue(30);
// B: anchor, rotation, scale, opacity; root-level items and a group with animated size.
var b = comp.layers.addShape();
b.name = "B";
var be = SH.contents(b).addProperty("ADBE Vector Shape - Ellipse");
be.property("ADBE Vector Ellipse Size").setValue([50, 30]);
SH.contents(b).addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0.4, 1]);
var bg2 = addGroup(SH.contents(b), "B Dot", "ellipse", [16, 16], [30, 0], [1, 1, 0]);
var dotSize = SH.inner(bg2).property(1).property("ADBE Vector Ellipse Size");
dotSize.setValueAtTime(0, [10, 10]);
dotSize.setValueAtTime(2, [22, 22]);
b.transform.anchorPoint.setValue([10, 5]);
b.transform.position.setValue([200, 80]);
b.transform.rotation.setValue(-20);
b.transform.scale.setValue([80, 120]);
b.transform.opacity.setValue(70);
// C: animated position (150, 160 at t = 1), a stroke.
var c = comp.layers.addShape();
c.name = "C";
var cg = addGroup(SH.contents(c), "C Bar", "rect", [60, 20], [0, 0], [0, 0.8, 0.2]);
SH.inner(cg).addProperty("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").setValue(3);
c.transform.position.setValueAtTime(0, [60, 160]);
c.transform.position.setValueAtTime(2, [240, 160]);
var n0 = comp.numLayers;

// Bad selections change nothing.
T.select(comp, [], []);
var r = MotionKit.run("mergeShapes");
T.check(!r.ok && /two or more shape layers/.test(T.lastAlert()) && comp.numLayers === n0, "nothing selected: refused with an alert");
T.select(comp, [a, bg], []);
r = MotionKit.run("mergeShapes");
T.check(!r.ok && comp.numLayers === n0, "one shape layer and a solid: refused");

var before = pixels(comp, 1);
var mats = [H.space.matrix(c, 1), H.space.matrix(b, 1), H.space.matrix(a, 1)];
T.select(comp, [a, c, b], []);
r = MotionKit.run("mergeShapes");
var m = comp.layer("Merged Shapes");
T.check(r.ok && m && r.created.length === 1 && comp.numLayers === n0 + 1, "creates \"Merged Shapes\": " + r.message.split("\n")[0]);
T.check(m.index === 1 && c.index === 2, "above the top-most source");
T.check(T.near(m.transform.anchorPoint.value, [0, 0]) && T.near(m.transform.position.value, [0, 0]) && T.near(m.transform.scale.value, [100, 100]) && m.transform.rotation.value === 0 && !m.parent, "at the comp origin with an identity transform");
var root = SH.contents(m);
T.check(root.numProperties === 3 && root.property(1).name === "C" && root.property(2).name === "B" && root.property(3).name === "A", "one group per layer, named after it, top-most first");
T.check(names(root.property(1)) === "C Bar" && names(root.property(2)) === "Ellipse Path 1,Fill 1,B Dot" && names(root.property(3)) === "A Box", "each group holds its layer's contents (" + names(root.property(2)) + ")");
var ds = SH.inner(SH.inner(root.property(2)).property(3)).property(1).property("ADBE Vector Ellipse Size");
T.check(ds.numKeys === 2 && T.near(ds.valueAtTime(1, false), [16, 16]), "keyframes inside come along");
var close = true;
for (var i = 0; i < 3; i++) {
  var gm = SH.groupMatrix(root.property(i + 1), 1);
  for (var k = 0; k < 6; k++) if (Math.abs(gm[k] - mats[i][k]) > 1e-6 * (k === 2 || k === 5 ? 1000 : 1)) close = false;
}
T.check(close, "each group's matrix equals its layer's layer-to-comp matrix");
var askew = SH.groupTransform(root.property(3)).property("ADBE Vector Skew").value;
T.check(Math.abs(askew) > 1, "A, rotated under a squashed parent, needs a skew (" + askew.toFixed(2) + "°)");
T.check(T.near(SH.groupTransform(root.property(2)).property("ADBE Vector Group Opacity").value, 70), "layer opacity becomes group opacity");
T.check(!a.enabled && !b.enabled && !c.enabled && m.enabled, "the sources are hidden");
T.check(/static transforms/.test(r.message) && /A, C|C, A/.test(r.message) && !/: [^\n]*B[ ,(]/.test(r.message.split("\n")[1]), "warns about A (parent) and C (animated), not B");
T.check(comp.selectedLayers.length === 1 && comp.selectedLayers[0].name === "Merged Shapes", "the merged layer ends up selected");

app.executeCommand(UNDO);
T.check(comp.numLayers === n0 && a.enabled && b.enabled && c.enabled && !comp.layer("Merged Shapes"), "one Undo reverts everything");

// The comp renders the same; the comparison notices a 1 degree turn of one group.
T.select(comp, [a, b, c], []);
r = MotionKit.run("mergeShapes");
var after = pixels(comp, 1);
T.check(diff(before, after) <= TOL, "the comp renders the same (largest block difference " + diff(before, after).toFixed(3) + " of 255)");
var mroot = SH.contents(comp.layer("Merged Shapes"));
var skew = SH.groupTransform(mroot.property(3)).property("ADBE Vector Skew"), sk = skew.value;
skew.setValue(0);
var d1 = diff(before, pixels(comp, 1));
T.check(d1 > 2 * TOL, "without A's skew the comparison fails (" + d1.toFixed(1) + ")");
skew.setValue(sk);
var cpos = SH.groupTransform(mroot.property(1)).property("ADBE Vector Position"), cp = cpos.value;
cpos.setValue([cp[0] + 3, cp[1]]);
var d2 = diff(before, pixels(comp, 1));
T.check(d2 > 2 * TOL, "a 3 px move of C fails it too (" + d2.toFixed(1) + ")");
comp.layer("Merged Shapes").remove();
a.enabled = b.enabled = c.enabled = true;

T.check(!/even width/.test(r.message), "no stroke warning: C's stroke isn't scaled unevenly");

// Delete the sources; a stroke under A's squashed parent is warned about.
SH.inner(SH.contents(a).property(1)).addProperty("ADBE Vector Graphic - Stroke");
T.select(comp, [a, b], []);
r = MotionKit.run("mergeShapes", { sources: "delete" });
T.check(r.ok && comp.numLayers === n0 - 1 && !comp.layer("A") && !comp.layer("B") && SH.contents(comp.layer("Merged Shapes")).numProperties === 2, "delete: the sources are gone");
T.check(/even width[^\n]*: A\./.test(r.message), "warns that A's stroke, under non-uniform scale and skew, will look different");
T.check(!/static transforms[^\n]*B/.test(r.message), "B (static, no parent) isn't warned about");

// Timing. P and Q start at 1 s and end at 3 s, their box Size keyed at comp 1 s (20) and 3 s (80):
// pasted keys keep their layer time (0 and 2 s), so they have to move by the start time.
var tc = T.comp("Merge Timing", 300, 200, 5, 25);
tc.time = 2;
function timedLayer(name, x, start, out) {
  var L = tc.layers.addShape();
  L.name = name;
  L.transform.position.setValue([x, 100]);
  var size = SH.inner(addGroup(SH.contents(L), name + " Box", "rect", [40, 40], [0, 0], [1, 0, 0])).property(1).property("ADBE Vector Rect Size");
  L.startTime = start;
  L.outPoint = out;
  size.setValueAtTime(start, [20, 20]);
  size.setValueAtTime(start + 2, [80, 80]);
  return L;
}
function boxSize(group) { return SH.inner(SH.inner(group).property(1)).property(1).property("ADBE Vector Rect Size"); }
var P = timedLayer("P", 80, 1, 3), Q = timedLayer("Q", 220, 1, 3);
T.select(tc, [P, Q], []);
r = MotionKit.run("mergeShapes");
var mt = tc.layer("Merged Shapes"), ps = boxSize(SH.contents(mt).property(2));
T.check(r.ok && ps.numKeys === 2 && T.near(ps.keyTime(1), 1) && T.near(ps.keyTime(2), 3) && T.near(ps.valueAtTime(2, false), [50, 50]), "keys inside keep their comp times (1 s and 3 s, 50 x 50 at 2 s), not the layer times (" + ps.keyTime(1) + ", " + ps.keyTime(2) + ")");
T.check(T.near(mt.inPoint, 1) && T.near(mt.outPoint, 3) && !/own in and out/.test(r.message), "both run from 1 s to 3 s: so does the merged layer, no timing warning");
app.executeCommand(UNDO);
T.check(tc.numLayers === 2 && P.enabled && Q.enabled && T.near(boxSize(SH.contents(P)).keyTime(1), 1), "one Undo reverts it");
var R = timedLayer("R", 150, 0, 5);
R.stretch = 200;
T.select(tc, [P, R], []);
r = MotionKit.run("mergeShapes");
mt = tc.layer("Merged Shapes");
T.check(r.ok && T.near(mt.inPoint, 0) && T.near(mt.outPoint, R.outPoint) && /own in and out points: P\./.test(r.message), "the merged layer spans both; P, shown for less of it, is warned about");
T.check(/Time stretch and time remapping aren't carried over: R\./.test(r.message), "R's 200 % stretch is warned about");

T.done();
