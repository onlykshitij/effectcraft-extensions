// SPDX-License-Identifier: MIT OR Apache-2.0
// Crop Comp: the new comp is the union of the layers' comp-space bounds over their in-out range
// (checked against EffectCraft's own sourcePointToComp at every frame), padding and even
// rounding, nothing moves (rendered pixels compared, and layer corners in comp space), a parent
// outside the selection (noted as animated when anything up its chain moves), bad selections,
// one Undo.
// Pixels: the comp before (a duplicate made first) and after are nested in a viewer comp and read
// with the expression sampleImage, which renders them; tiles of 10 x 10 px are compared.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("Crop Test", 500, 300, 3, 25);
var a = T.solid(comp, "A", 50, 40, [0.9, 0.2, 0.1]);
a.transform.rotation.setValue(30);
a.transform.position.setValueAtTime(0, [150, 100]);
a.transform.position.setValueAtTime(2, [260, 130]);
var b = T.solid(comp, "B", 30, 20, [0.1, 0.3, 0.9]);
b.transform.scale.setValue([150, 100]);
b.transform.position.setValue([210.3, 165.6]);
var c = T.solid(comp, "C", 20, 20, [0.2, 0.8, 0.3]);
c.transform.position.setValueAtTime(0, [450, 275]);
c.transform.position.setValueAtTime(2.96, [300, 100]);
c.inPoint = 1;
c.outPoint = 2;
var other = T.solid(comp, "Other", 25, 25, [0.8, 0.8, 0.2]);
other.transform.position.setValue([40, 250]);

// Comp-space corners of a layer at comp time t, by EffectCraft (sourcePointToComp).
function corners(L, t) {
  var cc = L.containingComp;
  cc.time = t;
  var r = L.sourceRectAtTime(t, false), out = [];
  var pts = [[r.left, r.top], [r.left + r.width, r.top], [r.left + r.width, r.top + r.height], [r.left, r.top + r.height]];
  for (var i = 0; i < 4; i++) out.push(L.sourcePointToComp(pts[i]));
  return out;
}
// Union of the corners over every frame from in to out.
function frameBounds(layers) {
  var bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (var i = 0; i < layers.length; i++) {
    var L = layers[i];
    for (var t = L.inPoint; t < Math.min(L.outPoint, comp.duration) - 1e-6; t += comp.frameDuration) {
      var cs = corners(L, t);
      for (var k = 0; k < 4; k++) bb = [Math.min(bb[0], cs[k][0]), Math.min(bb[1], cs[k][1]), Math.max(bb[2], cs[k][0]), Math.max(bb[3], cs[k][1])];
    }
  }
  comp.time = 0;
  return bb;
}
// A corner of an inner layer of the precomp, in the parent comp's space at time t.
function nestedCorners(pl, inner, t) {
  pl.source.time = t;
  var cs = corners(inner, t), out = [];
  comp.time = t;
  for (var i = 0; i < 4; i++) out.push(pl.sourcePointToComp(cs[i]));
  return out;
}
function sameCorners(x, y, eps) {
  for (var i = 0; i < 4; i++) if (!T.near(x[i], y[i], eps)) return false;
  return true;
}

// The biggest difference between two comps' rendered pixels at time t (10 x 10 px tile averages,
// premultiplied RGBA 0..1) and the alpha the first one covers, so an empty render can't pass.
// One row of tiles per expression: sampleImage slows down when one expression calls it
// thousands of times, and an expression that runs too long stops, hence the marker.
function pixelDiff(x, y, t) {
  var v = app.project.items.addComp("Pixels", x.width, x.height, 1, x.duration, 1 / x.frameDuration);
  var lx = v.layers.add(x), ly = v.layers.add(y);
  var probe = v.layers.addNull().property("ADBE Effect Parade").addProperty("ADBE Point3D Control").property(1);
  var worst = 0, at = -1, cover = 0, s = 10;
  for (var row = s / 2; row < x.height; row += s) {
    probe.expression = [
      "var A = thisComp.layer(" + lx.index + "), B = thisComp.layer(" + ly.index + "), m = 0, sa = 0;",
      "for (var x = " + s / 2 + "; x < " + x.width + "; x += " + s + ") {",
      "  var p = A.sampleImage([x, " + row + "], [" + s / 2 + ", " + s / 2 + "], true, " + t + "), q = B.sampleImage([x, " + row + "], [" + s / 2 + ", " + s / 2 + "], true, " + t + ");",
      "  for (var k = 0; k < 4; k++) m = Math.max(m, Math.abs(p[k] * (k < 3 ? p[3] : 1) - q[k] * (k < 3 ? q[3] : 1)));",
      "  sa += p[3];",
      "}",
      "[m, sa, 1]"].join("\n");
    var r = probe.valueAtTime(0, false);
    if (r[2] !== 1) throw new Error("the pixel comparison expression didn't finish at row " + row);
    if (r[0] > worst) { worst = r[0]; at = row; }
    cover += r[1];
  }
  v.remove();
  return { max: worst, row: at, cover: cover };
}
function looksSame(ref, now, times, what) {
  for (var i = 0; i < times.length; i++) {
    var d = pixelDiff(ref, now, times[i]);
    T.check(d.cover > 5 && d.max < 0.02,
      what + " at t = " + times[i] + " (largest tile difference " + d.max.toFixed(4) + (d.row >= 0 ? " in the row at y = " + d.row : "") + ", coverage " + d.cover.toFixed(2) + " tiles)");
  }
}

// ---- bad selections
T.select(comp, [], []);
var none = MotionKit.run("cropComp");
T.check(!none.ok && /select the layers/.test(T.lastAlert()) && comp.numLayers === 4, "no layers: refused with an alert, nothing changed");
var nul = comp.layers.addNull();
var items0 = app.project.numItems;
T.select(comp, [nul], []);
var onlyNull = MotionKit.run("cropComp");
T.check(!onlyNull.ok && /shows anything/.test(onlyNull.message) && comp.numLayers === 5 && app.project.numItems === items0, "only a null: refused, no comp made (" + onlyNull.message + ")");
nul.remove();

// ---- default run: A, B and C (C is only visible from 1 s to 2 s)
var bb = frameBounds([a, b, c]);
var left = Math.floor(bb[0]), top = Math.floor(bb[1]);
var w = Math.ceil(bb[2]) - left, h = Math.ceil(bb[3]) - top;
w += w % 2;
h += h % 2;
var ref = comp.duplicate();
comp.openInViewer();
var before = { a: [corners(a, 0), corners(a, 1.4)], b: [corners(b, 0)], c: [corners(c, 1.4)] };
var itemsBefore = app.project.numItems;
T.select(comp, [c, a, b], []);
var r = MotionKit.run("cropComp");
T.check(r.ok, "it runs: " + r.message);
var pl = r.created[0], pc = r.created[1];
T.check(pl && pc && pl.source.id === pc.id && pc.name === "C Crop" && app.project.numItems === itemsBefore + 1, "a precomp layer of a new comp named after the top layer, \"C Crop\"");
T.check(comp.numLayers === 2 && pc.numLayers === 3 && pl.index === 2 && comp.layer(1).name === "Other", "the three layers moved into it; it sits where the top selected layer was, below Other");

// ---- one Undo reverts the whole tool
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(comp.numLayers === 4 && comp.layer("A") && !comp.layer("C Crop") && app.project.numItems === itemsBefore, "one Undo brings the layers back and removes the new comp");
T.select(comp, [c, a, b], []);
r = MotionKit.run("cropComp");
pl = r.created[0];
pc = r.created[1];
T.check(r.ok && pc.name === "C Crop" && comp.numLayers === 2, "run again after the Undo: " + r.message);
T.check(pc.width === w && pc.height === h, "sized to the layers' bounds over their in-out range, even pixels: " + pc.width + " x " + pc.height + " (expected " + w + " x " + h + ")");
T.check(bb[2] - bb[0] > 150, "the bounds include A's travel");
T.check(T.near(pl.transform.position.value, [left + w / 2, top + h / 2]) && T.near(pl.transform.anchorPoint.value, [w / 2, h / 2]), "the precomp layer sits at the cropped area's centre");
var ia = pc.layer("A"), ib = pc.layer("B"), ic = pc.layer("C");
T.check(sameCorners(nestedCorners(pl, ia, 0), before.a[0], 1e-3) && sameCorners(nestedCorners(pl, ia, 1.4), before.a[1], 1e-3), "A's corners in the parent comp are unchanged (t = 0 and 1.4, between keys)");
T.check(sameCorners(nestedCorners(pl, ib, 0), before.b[0], 1e-3) && sameCorners(nestedCorners(pl, ic, 1.4), before.c[0], 1e-3), "B's and C's corners are unchanged");
var inside = true;
for (var t = 0; t < 2.96; t += 0.04) {
  var cs = corners(ia, t).concat(corners(ib, t));
  for (var k = 0; k < cs.length; k++) if (cs[k][0] < -1e-3 || cs[k][1] < -1e-3 || cs[k][0] > w + 1e-3 || cs[k][1] > h + 1e-3) inside = false;
}
comp.time = 0;
T.check(inside, "inside the new comp, every frame of A and B is within its frame");
T.check(ia.inPoint === 0 && ic.inPoint === 1 && ic.outPoint === 2, "timing is kept");
looksSame(ref, comp, [0, 1.4, 2.5], "the parent comp renders the same pixels");
var refOther = ref.layer("Other");
refOther.transform.position.setValue([41, 250]);
var moved = pixelDiff(ref, comp, 0);
T.check(moved.max > 0.05, "the pixel comparison notices a 1 px move (" + moved.max.toFixed(4) + ")");
refOther.transform.position.setValue([40, 250]);

// ---- padding, odd sizes, a parent outside the selection
var p = comp.layers.addNull();
p.name = "Holder";
p.transform.position.setValue([350, 75]);
p.transform.rotation.setValue(-20);
var d = T.solid(comp, "D", 34, 20, [0.5, 0.1, 0.7]);
d.parent = p;
d.transform.position.setValue([16.3, 35.1]);
var db = frameBounds([d]);
var ref2 = comp.duplicate();
comp.openInViewer();
T.select(comp, [d], []);
r = MotionKit.run("cropComp", { padding: 10, even: false });
var pc2 = r.created[1];
var w2 = Math.ceil(db[2]) - Math.floor(db[0]) + 20, h2 = Math.ceil(db[3]) - Math.floor(db[1]) + 20;
T.check(r.ok && pc2.width === w2 && pc2.height === h2 && w2 % 2 === 1 && h2 % 2 === 1, "10 px padding without even rounding keeps odd sizes: " + pc2.width + " x " + pc2.height + " (expected " + w2 + " x " + h2 + ")");
T.check(/unparented/.test(r.message) && !pc2.layer(1).parent, "a parent outside the selection: unparented first, with a note");
looksSame(ref2, comp, [0, 2], "the parent comp still renders the same");
T.select(comp, [comp.layer("D Crop")], []);
r = MotionKit.run("cropComp", { padding: 3 });
T.check(r.ok && r.created[1].width % 2 === 0 && r.created[1].height % 2 === 0, "even rounding: " + r.created[1].width + " x " + r.created[1].height);
T.check(r.created[1].name === "D Crop Crop", "cropping a crop names it after that layer");

// ---- the note about a parent's animation looks up the whole chain, keys and expressions
var mover = comp.layers.addNull();
mover.name = "Mover";
mover.transform.position.setValueAtTime(0, [100, 100]);
mover.transform.position.setValueAtTime(2, [300, 100]);
var mid = comp.layers.addNull();
mid.name = "Middle";
mid.parent = mover;
var e = T.solid(comp, "E", 20, 20, [0.9, 0.9, 0.2]);
e.parent = mid;
T.select(comp, [e], []);
r = MotionKit.run("cropComp");
T.check(r.ok && /E was parented to Middle[^\n]*won't follow that parent's animation/.test(r.message), "a static parent under an animated one: the note says E won't follow it");
app.executeCommand(app.findMenuCommandId("Undo"));
mover.transform.position.removeKey(2);
mover.transform.position.removeKey(1);
mid.transform.rotation.expression = "time * 90";
T.select(comp, [e], []);
r = MotionKit.run("cropComp");
T.check(r.ok && /won't follow/.test(r.message), "a parent turned by an expression: noted too");
app.executeCommand(app.findMenuCommandId("Undo"));
mid.transform.rotation.expression = "";
mid.transform.opacity.setValueAtTime(0, 0);
mid.transform.opacity.setValueAtTime(1, 100);
T.select(comp, [e], []);
r = MotionKit.run("cropComp");
T.check(r.ok && /E was parented to Middle, which isn't selected; it was unparented first\./.test(r.message), "a parent whose opacity alone is animated (children don't inherit it): no animation note");

T.done();
