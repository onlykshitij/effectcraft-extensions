// SPDX-License-Identifier: MIT OR Apache-2.0
// Slider to Path: layers land on the path in comp space (shape group and layer transforms, a
// parented layer), spread 0..100 on open paths and 0..75 on a closed mask path with four layers,
// progress by arc length, wrapping on closed paths, orient along the tangent with an offset,
// zero-length paths and a deleted path layer without NaN, bad selections, one undo step.
// Comp positions are checked with EffectCraft's own sourcePointToComp.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var H = MotionKit.helpers;

var comp = T.comp("Slider Path Test");
var track = comp.layers.addShape();
track.name = "Track";
track.transform.position.setValue([450, 320]);
track.transform.rotation.setValue(20);
var grp = track.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
var gt = grp.property("ADBE Vector Transform Group");
gt.property("ADBE Vector Position").setValue([20, -30]);
gt.property("ADBE Vector Rotation").setValue(-35);
gt.property("ADBE Vector Scale").setValue([110, 90]);
var path = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
var curve = new Shape();
curve.vertices = [[-200, 0], [200, 40]];
curve.outTangents = [[120, -160], [0, 0]];
curve.inTangents = [[0, 0], [-80, 150]];
curve.closed = false;
path.setValue(curve);
grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");

var a = T.solid(comp, "A", 40, 40);
var pivot = comp.layers.addNull();
pivot.name = "Pivot";
pivot.transform.position.setValue([200, 150]);
pivot.transform.rotation.setValue(40);
pivot.transform.scale.setValue([80, 120]);
var b = T.solid(comp, "B", 40, 40);
b.parent = pivot;

// Path space -> comp space, and the point at fraction u of the arc length (dense sampling).
function trackToComp(p) { return track.sourcePointToComp(H.mat.apply(H.shapes.toLayerMatrix([grp], 0), p)); }
function bez(s, i, u) {
  var n = s.vertices.length, a0 = s.vertices[i], b0 = s.vertices[(i + 1) % n];
  var p1 = [a0[0] + s.outTangents[i][0], a0[1] + s.outTangents[i][1]], p2 = [b0[0] + s.inTangents[(i + 1) % n][0], b0[1] + s.inTangents[(i + 1) % n][1]];
  var w = 1 - u;
  return [w * w * w * a0[0] + 3 * w * w * u * p1[0] + 3 * w * u * u * p2[0] + u * u * u * b0[0], w * w * w * a0[1] + 3 * w * w * u * p1[1] + 3 * w * u * u * p2[1] + u * u * u * b0[1]];
}
function along(s, frac) {
  var segs = s.closed ? s.vertices.length : s.vertices.length - 1, N = 2000, pts = [], len = [0];
  for (var i = 0; i < segs; i++) for (var k = (i ? 1 : 0); k <= N; k++) pts.push(bez(s, i, k / N));
  for (var j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.sqrt(Math.pow(pts[j][0] - pts[j - 1][0], 2) + Math.pow(pts[j][1] - pts[j - 1][1], 2)));
  var target = frac * len[len.length - 1];
  for (j = 1; j < pts.length; j++) if (len[j] >= target) {
    var f = (target - len[j - 1]) / (len[j] - len[j - 1] || 1);
    return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f];
  }
  return pts[pts.length - 1];
}
function at(L) { return L.sourcePointToComp([20, 20]); }
function progress(L) { return L.property("ADBE Effect Parade").property("Slider to Path – Path Progress").property(1); }

// Bad selections.
T.select(comp, [a], []);
var bad = MotionKit.run("sliderToPath");
T.check(!bad.ok && /path property/.test(bad.message) && a.transform.position.expression === "", "no path selected: refused (" + bad.message + ")");
T.select(comp, [track], [path]);
bad = MotionKit.run("sliderToPath");
T.check(!bad.ok && /other than the path's layer/.test(bad.message), "only the path's own layer: refused (" + bad.message + ")");

// Two layers on an open path: 0 and 100.
T.select(comp, [track, b, a], [path]);
var r = MotionKit.run("sliderToPath");
T.check(r.ok && /2 layers/.test(r.message), "attaches two layers (the path's layer is left out): " + r.message);
T.check(a.transform.position.expression.indexOf("// Motion Kit: sliderToPath") === 0 && track.transform.position.expression === "", "position expressions on the attached layers only");
T.check(progress(b).value === 0 && progress(a).value === 100, "spread over the open path: B (the upper layer) at 0, A at 100");
T.check(T.near(at(b), trackToComp(curve.vertices[0]), 1e-3), "B (parented to a rotated, scaled null) sits on the path's start in comp space");
T.check(T.near(at(a), trackToComp(curve.vertices[1]), 1e-3), "A sits on the path's end");
progress(a).setValue(50);
var mid = trackToComp(along(curve, 0.5));
T.check(T.near(at(a), mid, 0.5), "progress 50 is half the arc length (" + at(a)[0].toFixed(2) + ", " + at(a)[1].toFixed(2) + " vs " + mid[0].toFixed(2) + ", " + mid[1].toFixed(2) + ")");
progress(b).setValue(25);
T.check(T.near(at(b), trackToComp(along(curve, 0.25)), 0.5), "the parented layer follows its own slider (25 %)");
progress(a).setValue(140);
T.check(T.near(at(a), trackToComp(curve.vertices[1]), 1e-3), "open paths clamp: 140 stays at the end");

// The path animates: the layer follows.
path.setValueAtTime(0, curve);
var c2 = new Shape();
c2.vertices = [[-200, 100], [200, 140]];
c2.outTangents = curve.outTangents;
c2.inTangents = curve.inTangents;
c2.closed = false;
path.setValueAtTime(1, c2);
comp.time = 1;
T.check(T.near(at(a), track.sourcePointToComp(H.mat.apply(H.shapes.toLayerMatrix([grp], 1), c2.vertices[1])), 1e-3), "an animated path carries the layer (t = 1)");
comp.time = 0;

// A closed mask path with four layers and orient along path.
var plate = T.solid(comp, "Plate", 300, 200);
plate.transform.rotation.setValue(-15);
var mask = plate.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
var mp = mask.property("ADBE Mask Shape");
var sq = new Shape();
sq.vertices = [[0, 0], [200, 0], [200, 200], [0, 200]];
sq.closed = true;
mp.setValue(sq);
var riders = [];
for (var i = 0; i < 4; i++) riders.push(T.solid(comp, "R" + (4 - i), 40, 40));
riders.reverse();
T.select(comp, riders.concat([plate]), [mp]);  // a property on an unselected layer replaces the layer selection
r = MotionKit.run("sliderToPath", { orient: true, orientOffset: 90 });
T.check(r.ok && /4 layers/.test(r.message), "four layers on a closed mask path, oriented: " + r.message);
var spread = H.util.map(riders, function (L) { return progress(L).value; });
T.check(spread.join(",") === "0,25,50,75", "closed paths spread 0, 25, 50, 75 (" + spread.join(", ") + ")");
var corners = H.util.map(sq.vertices, function (v) { return plate.sourcePointToComp(v); });
var onCorners = true;
for (i = 0; i < 4; i++) if (!T.near(at(riders[i]), corners[i], 1e-3)) onCorners = false;
T.check(onCorners, "each rider sits on a corner of the square mask in comp space");
T.check(T.near(riders[0].transform.rotation.valueAtTime(0, false), -15 + 90, 1e-3), "orient: rotation follows the first edge (-15 degrees) plus the 90 degree offset");
progress(riders[0]).setValue(30);
T.check(T.near(riders[0].transform.rotation.valueAtTime(0, false), 75 + 90, 1e-3), "on the second edge the rotation is 90 degrees more");
progress(riders[0]).setValue(130);
// pointOnPath interpolates the curve parameter between 32 samples per segment, so a point
// between samples is off by a few hundredths of a pixel.
T.check(T.near(at(riders[0]), plate.sourcePointToComp([200, 40]), 0.1), "closed paths wrap: 130 is 30 % (40 px down the second edge)");
riders[0].property("ADBE Effect Parade").property("Slider to Path – Orient along path").property(1).setValue(0);
T.check(T.near(riders[0].transform.rotation.valueAtTime(0, false), 0), "orient off: rotation is the layer's own again");

// Zero-length path and a deleted path layer: no NaN.
var dot = comp.layers.addShape();
dot.name = "Dot";
var dp = dot.property("ADBE Root Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
var z = new Shape();
z.vertices = [[30, 30], [30, 30]];
z.closed = false;
dp.setValue(z);
var rider = T.solid(comp, "Rider", 40, 40);
T.select(comp, [rider, dot], [dp]);
r = MotionKit.run("sliderToPath", { orient: true });
T.check(r.ok && T.near(at(rider), dot.sourcePointToComp([30, 30]), 1e-3), "a zero-length path puts the layer on its single point");
progress(rider).setValue(60);
var rot = rider.transform.rotation.valueAtTime(0, false);
T.check(T.near(at(rider), dot.sourcePointToComp([30, 30]), 1e-3) && isFinite(rot), "and stays finite at any progress (rotation " + rot + ")");
var still = rider.transform.position.valueAtTime(0, true);
dot.remove();
T.check(T.near(rider.transform.position.valueAtTime(0, false), still) && isFinite(rider.transform.rotation.valueAtTime(0, false)), "a deleted path layer: the layer falls back to its own position, no NaN");

// Several paths selected.
T.select(comp, [a, track, plate], [path, mp]);
T.check(!MotionKit.run("sliderToPath").ok && /only one path/.test(T.lastAlert()), "two paths: refused");

// One undo step.
var lone = T.solid(comp, "Lone", 20, 20);
T.select(comp, [lone, track], [path]);
MotionKit.run("sliderToPath");
T.check(lone.transform.position.expression !== "" && lone.property("ADBE Effect Parade").numProperties === 1, "attached a third time");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(lone.transform.position.expression === "" && lone.property("ADBE Effect Parade").numProperties === 0, "one Undo removes the slider and the expression");

T.done();
