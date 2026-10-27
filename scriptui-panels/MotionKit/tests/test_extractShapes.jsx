// SPDX-License-Identifier: MIT OR Apache-2.0
// Extract Shapes: the comp looks the same (EffectCraft renders it before and after; the pixels
// are read with sampleImage through a comp that holds it), one layer per group in group order
// directly above the original, transform, parent, timing, blending mode and 3D kept, the
// original hidden or deleted, a subset of groups (a nested group counts as its top-level group),
// root-level paints kept in every copy, root-level paths kept only in the original (which stays
// visible), bad selections, one Undo.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var SH = MotionKit.helpers.shapes;
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
// The largest difference between two block lists, from block row `row` (default 0) down.
function diff(a, b, row) {
  var m = a.length === b.length ? 0 : Infinity;
  for (var i = (row || 0) * 30 * 4; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
// EffectCraft rasterises a shape layer into a buffer that starts at its content bounds, then
// resamples it into the comp. A rotated or scaled layer holding fewer groups is therefore
// sampled at a slightly different sub-pixel phase, and block means move by up to about 1.5 of
// 255 along edges; a 1 px move changes them by about 16. A layer that isn't resampled (whole
// pixel position, no rotation or scale: Stack, block rows 14 and below) renders identically.
var TOL = 3, EXACT = 0.01;

function addGroup(layer, name, kind, size, pos, color, into) {
  var g = SH.inner(into || SH.contents(layer)).addProperty("ADBE Vector Group");
  g.name = name;
  var c = SH.inner(g);
  if (kind === "path") {
    var s = new Shape();
    s.vertices = [[pos[0], pos[1] - size[1] / 2], [pos[0] + size[0] / 2, pos[1] + size[1] / 2], [pos[0] - size[0] / 2, pos[1] + size[1] / 2]];
    s.closed = true;
    c.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(s);
  } else if (kind) {
    var R = kind === "rect" ? "Rect" : "Ellipse", item = c.addProperty("ADBE Vector Shape - " + R);
    item.property("ADBE Vector " + R + " Size").setValue(size);
    item.property("ADBE Vector " + R + " Position").setValue(pos);
  }
  if (color) c.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(color);
  return g;
}
function tv(L, m) { return L.property("ADBE Transform Group").property(m).valueAtTime(1, false); }

var comp = T.comp("Extract Test", 300, 200, 5, 25);
comp.time = 1;
var bg = T.solid(comp, "BG", 300, 200, [0.3, 0.3, 0.3]);
var rig = comp.layers.addNull();
rig.name = "Rig";
rig.transform.position.setValue([160, 90]);
rig.transform.rotation.setValue(-10);
var art = comp.layers.addShape();
art.name = "Art";
// Art: rotated, scaled and parented, with groups that don't overlap (a stroke, a group
// transform, a nested group, group opacity).
var circle = addGroup(art, "Circle", "ellipse", [50, 50], [-60, 0], [1, 0, 0]);
SH.inner(circle).addProperty("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").setValue(4);
var box = addGroup(art, "Box", "rect", [50, 30], [10, 0], [0, 0, 1]);
SH.groupTransform(box).property("ADBE Vector Rotation").setValue(20);
SH.groupTransform(box).property("ADBE Vector Scale").setValue([120, 100]);
var tri = addGroup(art, "Tri");
addGroup(art, "Tri Shape", "path", [40, 40], [75, 0], null, tri);
SH.inner(tri).addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0.8, 0]);
SH.groupTransform(tri).property("ADBE Vector Group Opacity").setValue(60);
art.parent = rig;
art.transform.anchorPoint.setValue([10, 5]);
art.transform.position.setValue([0, 10]);
art.transform.rotation.setValue(15);
art.transform.scale.setValue([110, 90]);
art.startTime = 0.2;
art.outPoint = 4;
// Stack: two overlapping rectangles on whole pixels, so the stacking order shows.
var stack = comp.layers.addShape();
stack.name = "Stack";
stack.transform.position.setValue([150, 160]);
addGroup(stack, "Top", "rect", [40, 20], [0, 0], [1, 0.5, 0]);
addGroup(stack, "Bottom", "rect", [40, 20], [20, 6], [0.5, 0, 1]);
var n0 = comp.numLayers;

// Bad selections change nothing.
T.select(comp, [], []);
var r = MotionKit.run("extractShapes");
T.check(!r.ok && /select shape layers/.test(T.lastAlert()) && comp.numLayers === n0, "nothing selected: refused with an alert, nothing added");
T.select(comp, [bg], []);
r = MotionKit.run("extractShapes");
T.check(!r.ok && comp.numLayers === n0, "a solid isn't a shape layer: refused");

// Whole layers: one layer per group, in group order, directly above each original.
var before = pixels(comp, 1), at = art.index;
var filled = 0;
for (var i = 3; i < before.length; i += 4) if (before[i] > 0) filled++;
T.check(filled === before.length / 4, "the reference render covers the frame (" + before.length / 4 + " blocks)");
T.select(comp, [art, stack], []);
r = MotionKit.run("extractShapes");
T.check(r.ok && r.created.length === 5 && comp.numLayers === n0 + 5, "two layers with five groups, five new layers: " + r.message);
T.check(comp.layer(1).name === "Top" && comp.layer(2).name === "Bottom" && stack.index === 3, "Stack: Top above Bottom, directly above Stack");
at = art.index - 3;
var made = [comp.layer(at), comp.layer(at + 1), comp.layer(at + 2)];
T.check(made[0].name === "Circle" && made[1].name === "Box" && made[2].name === "Tri", "Art: named after the groups, first group on top, directly above the original");
var one = true;
for (i = 0; i < 3; i++) {
  var root = SH.contents(made[i]);
  if (root.numProperties !== 1 || root.property(1).name !== made[i].name) one = false;
}
T.check(one, "each new layer holds only its own group");
T.check(SH.inner(SH.contents(made[2]).property(1)).property(1).name === "Tri Shape", "nested groups come along");
var same = true;
var TR = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
for (i = 0; i < 3; i++) {
  for (var k = 0; k < TR.length; k++) if (!T.near(tv(made[i], TR[k]), tv(art, TR[k]))) same = false;
  if (!made[i].parent || made[i].parent.name !== "Rig" || made[i].startTime !== art.startTime || made[i].inPoint !== art.inPoint || made[i].outPoint !== art.outPoint) same = false;
}
T.check(same, "transform, parent and timing kept");
T.check(!art.enabled && !stack.enabled && made[0].enabled, "the originals are kept, hidden");
var after = pixels(comp, 1);
T.check(diff(before, after) <= TOL, "the comp renders the same (largest block difference " + diff(before, after).toFixed(3) + " of 255)");
T.check(diff(before, after, 14) <= EXACT, "Stack's area, which isn't resampled, renders identically (" + diff(before, after, 14).toFixed(3) + ")");

// One Undo reverts the whole tool.
app.executeCommand(UNDO);
at = art.index;
T.check(comp.numLayers === n0 && art.enabled && stack.enabled && comp.layer(1).name === "Stack", "one Undo removes the new layers and shows the originals again");

// The comparison notices a 1 px move, and swapped stacking.
T.select(comp, [art, stack], []);
MotionKit.run("extractShapes");
var moved = comp.layer(art.index - 2), mp = tv(moved, "ADBE Position");
moved.transform.position.setValue([mp[0] + 1, mp[1]]);
var d1 = diff(before, pixels(comp, 1));
T.check(d1 > 3 * TOL, "the comparison sees a 1 px move of one group (" + d1.toFixed(1) + ")");
moved.transform.position.setValue([mp[0], mp[1]]);
comp.layer(2).moveBefore(comp.layer(1));
var d2 = diff(before, pixels(comp, 1));
T.check(d2 > 3 * TOL, "and Bottom drawn over Top (" + d2.toFixed(1) + ")");
for (i = 0; i < 5; i++) comp.layer(i < 2 ? 1 : art.index - 1).remove();
art.enabled = true;
stack.enabled = true;
T.check(comp.numLayers === n0 && diff(before, pixels(comp, 1)) <= TOL, "back to the original scene");

// Some groups: the original stays visible with those groups switched off.
T.select(comp, [art], [SH.contents(art).property(2)]);
r = MotionKit.run("extractShapes");
var aroot = SH.contents(art);
T.check(r.ok && r.created.length === 1 && comp.layer(art.index - 1).name === "Box", "one selected group: one new layer above the original");
T.check(art.enabled && aroot.numProperties === 3 && !aroot.property(2).enabled && aroot.property(1).enabled && aroot.property(3).enabled, "the original stays visible, its Box group switched off");
T.check(/draw below/.test(r.message), "warns that Circle, above Box in the original, now draws below it");
app.executeCommand(UNDO);
T.check(comp.numLayers === n0 && SH.contents(art).property(2).enabled, "Undo");

// A nested group selected counts as its top-level group; delete takes it out of the original.
T.select(comp, [art], [SH.inner(SH.contents(art).property(3)).property(1)]);
r = MotionKit.run("extractShapes", { original: "delete" });
aroot = SH.contents(art);
T.check(r.ok && r.created.length === 1 && r.created[0].name === "Tri", "a nested group extracts its top-level group (Tri)");
T.check(aroot.numProperties === 2 && aroot.property(1).name === "Circle" && aroot.property(2).name === "Box" && /draw below/.test(r.message), "delete removes Tri from the original (and warns: Circle and Box now draw below it)");
app.executeCommand(UNDO);
T.select(comp, [art], [SH.contents(art).property(1)]);
r = MotionKit.run("extractShapes");
T.check(r.ok && r.created[0].name === "Circle" && !/draw below/.test(r.message), "extracting the top group changes no stacking, so no warning");
app.executeCommand(UNDO);

// Whole layer, delete the original.
T.select(comp, [art], []);
r = MotionKit.run("extractShapes", { original: "delete" });
T.check(r.ok && comp.numLayers === n0 + 2 && comp.layer(at + 2).name === "Tri" && !comp.layer("Art") && diff(before, pixels(comp, 1)) <= TOL, "delete: the original is gone, the comp still renders the same");
app.executeCommand(UNDO);
T.check(comp.numLayers === n0 && comp.layer(at).name === "Art", "Undo brings the original back");

// 3D, blending mode, timing and root-level paints.
var fl = comp.layers.addShape();
fl.name = "Flags";
addGroup(fl, "One", "rect", [20, 20], [-30, 0], [1, 1, 0]);
addGroup(fl, "Two", "ellipse", [20, 20], [30, 0], [0, 1, 1]);
SH.contents(fl).addProperty("ADBE Vector Graphic - Stroke");
fl.threeDLayer = true;
fl.blendingMode = BlendingMode.ADD;
fl.startTime = 1;
fl.outPoint = 3;
T.select(comp, [fl], []);
r = MotionKit.run("extractShapes");
var c1 = r.created[0], c2 = r.created[1];
T.check(r.ok && c1.threeDLayer && c2.threeDLayer && c1.blendingMode === BlendingMode.ADD && c2.blendingMode === BlendingMode.ADD, "3D and blending mode kept");
T.check(c1.startTime === 1 && c1.inPoint === fl.inPoint && c2.outPoint === 3, "start time, in and out points kept");
var r1 = SH.contents(c1), r2 = SH.contents(c2);
T.check(r1.numProperties === 2 && r1.property(1).name === "One" && r1.property(2).matchName === "ADBE Vector Graphic - Stroke" &&
  r2.numProperties === 2 && r2.property(1).name === "Two" && r2.property(2).matchName === "ADBE Vector Graphic - Stroke", "a root-level stroke stays in every copy");

// A path outside any group (with a 50 % fill) stays only in the original: in every copy it would
// draw again, and two 50 % fills over each other make 75 %.
var lc = T.comp("Loose Test", 300, 200, 5, 25);
lc.time = 1;
var lo = lc.layers.addShape();
lo.name = "Loose";
lo.transform.position.setValue([150, 100]);
addGroup(lo, "Left", "rect", [40, 40], [-80, 0], [1, 0, 0]);
addGroup(lo, "Right", "rect", [40, 40], [80, 0], [0, 0, 1]);
var lp = SH.contents(lo).addProperty("ADBE Vector Shape - Rect");
lp.property("ADBE Vector Rect Size").setValue([60, 60]);
var lf = SH.contents(lo).addProperty("ADBE Vector Graphic - Fill");
lf.property("ADBE Vector Fill Color").setValue([0, 1, 0]);
lf.property("ADBE Vector Fill Opacity").setValue(50);
var lbefore = pixels(lc, 1), lroot = SH.contents(lo);
T.select(lc, [lo], []);
r = MotionKit.run("extractShapes");
var noLoose = r.created.length === 2;
for (i = 0; i < r.created.length; i++) {
  var cr = SH.contents(r.created[i]);
  if (cr.numProperties !== 2 || cr.property(2).matchName !== "ADBE Vector Graphic - Fill") noLoose = false;
}
T.check(r.ok && noLoose, "every group extracted: the copies hold their group and the root fill, not the loose path");
T.check(lo.enabled && !lroot.property(1).enabled && !lroot.property(2).enabled && lroot.property(3).enabled && /paths outside any group/.test(r.message), "the original keeps the path and stays visible, its groups switched off, and says so: " + r.message.split("\n")[1]);
T.check(diff(lbefore, pixels(lc, 1)) <= TOL, "the comp renders the same, the path drawn once (largest block difference " + diff(lbefore, pixels(lc, 1)).toFixed(3) + ")");
app.executeCommand(UNDO);
T.select(lc, [lo], [SH.contents(lo).property(1)]);
r = MotionKit.run("extractShapes");
T.check(r.ok && SH.contents(r.created[0]).numProperties === 2 && SH.contents(lo).property(3).enabled && diff(lbefore, pixels(lc, 1)) <= TOL && !/draw below/.test(r.message), "one group (Left): the copy has no loose path either, the original keeps it, the comp renders the same");
app.executeCommand(UNDO);
comp.openInViewer();

// A shape layer without groups.
var flat = comp.layers.addShape();
SH.contents(flat).addProperty("ADBE Vector Shape - Rect");
var n1 = comp.numLayers;
T.select(comp, [flat], []);
r = MotionKit.run("extractShapes");
T.check(!r.ok && comp.numLayers === n1, "a shape layer without groups: refused");

T.done();
