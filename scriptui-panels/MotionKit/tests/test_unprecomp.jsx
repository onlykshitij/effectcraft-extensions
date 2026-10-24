// SPDX-License-Identifier: MIT OR Apache-2.0
// Unprecomp: the precomp's layers land directly above the precomp layer in their order, under a
// "<Precomp> Transform" null that carries its transform (keys too), parent and timing; parenting
// and track mattes inside are kept; times shift by the start time and are trimmed to the in and
// out points; nothing changes on screen (rendered pixels compared); the warnings; delete; bad
// selections; one Undo.
// Pixels: the comp before (a duplicate made first) and after are nested in a viewer comp and read
// with the expression sampleImage, which renders them; tiles of 10 x 10 px are compared.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

function pixelDiff(x, y, t) {
  var v = app.project.items.addComp("Pixels", x.width, x.height, 1, x.duration, 1 / x.frameDuration);
  var lx = v.layers.add(x), ly = v.layers.add(y);
  var probe = v.layers.addNull().property("ADBE Effect Parade").addProperty("ADBE Point3D Control").property(1);
  var worst = 0, at = -1, cover = 0, s = 10;
  // One row of tiles per expression (an expression that runs too long stops, hence the marker).
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
    T.check(d.cover > 5 && d.max < 0.02, what + " at t = " + times[i] + " (largest tile difference " + d.max.toFixed(4) + (d.row >= 0 ? " in the row at y = " + d.row : "") + ", coverage " + d.cover.toFixed(2) + " tiles)");
  }
}
function names(comp) {
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) out.push(comp.layer(i).name);
  return out.join(", ");
}

// ---- the precomp: a parented layer, a track matte, a trimmed late layer
var pre = app.project.items.addComp("Pre", 200, 120, 1, 3, 25);
var pnull = pre.layers.addNull();
pnull.name = "PNull";
pnull.transform.position.setValue([60, 50]);
pnull.transform.rotation.setValueAtTime(0, 0);
pnull.transform.rotation.setValueAtTime(2, 40);
var kid = pre.layers.addSolid([0.9, 0.2, 0.1], "Kid", 30, 20, 1);
kid.parent = pnull;
kid.transform.position.setValue([70, 55]);
var matte = pre.layers.addSolid([1, 1, 1], "Matte", 50, 50, 1);
matte.transform.position.setValue([140, 70]);
var fill = pre.layers.addSolid([0.1, 0.3, 0.9], "Fill", 80, 60, 1);
fill.transform.position.setValue([140, 60]);
fill.setTrackMatte(matte, TrackMatteType.ALPHA);
var late = pre.layers.addSolid([0.2, 0.8, 0.3], "Late", 20, 20, 1);
late.transform.position.setValue([30, 100]);
late.startTime = 0.2;
late.inPoint = 0.52;
late.outPoint = 2.52;

// ---- the parent comp: a rig null, the precomp layer (keyed, rotated, scaled, trimmed), a layer above
var main = T.comp("Main", 500, 300, 3, 25);
var bg = T.solid(main, "Bg", 500, 300, [0.15, 0.15, 0.15]);
var rig = main.layers.addNull();
rig.name = "Rig";
rig.transform.position.setValue([100, 60]);
rig.transform.rotation.setValue(-10);
var pl = main.layers.add(pre);
pl.parent = rig;
pl.transform.position.setValueAtTime(0, [150, 100]);
pl.transform.position.setValueAtTime(2, [200, 140]);
pl.transform.rotation.setValue(15);
pl.transform.scale.setValue([120, 90]);
pl.startTime = 0.4;
pl.inPoint = 0.6;
pl.outPoint = 2.8;
var top = T.solid(main, "Top", 60, 60, [0.9, 0.8, 0.1]);
top.transform.position.setValue([230, 150]);

// ---- bad selections
T.select(main, [top], []);
var bad = MotionKit.run("unprecomp");
T.check(!bad.ok && /select one or more precomp layers/.test(T.lastAlert()) && main.numLayers === 4, "a solid: refused with an alert, nothing changed");

// ---- one Undo reverts the whole tool
var ref = main.duplicate();
main.openInViewer();
T.select(main, [pl], []);
var r = MotionKit.run("unprecomp");
T.check(r.ok && main.numLayers === 10, "it runs: " + r.message);
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(main.numLayers === 4 && pl.enabled && !main.layer("Pre Transform"), "one Undo removes the copies and the null and turns the precomp layer back on");

// ---- the default run
T.select(main, [pl], []);
r = MotionKit.run("unprecomp");
T.check(r.ok && r.created.length === 6, "it runs again: " + r.message);
var nul = r.created[0];
T.check(nul.name === "Pre Transform" && nul.nullLayer, "a null named \"Pre Transform\"");
T.check(names(main) === "Top, Pre Transform, Late, Fill, Matte, Kid, PNull, Pre, Rig, Bg", "the copies sit directly above the precomp layer in their order, under the null: " + names(main));
T.check(!pl.enabled && pl.source.id === pre.id && pre.numLayers === 5, "the precomp layer is turned off; the precomp itself is untouched");
T.check(nul.parent && nul.parent.name === "Rig", "the null takes the precomp layer's parent");
var np = nul.transform.position, pp = pl.transform.position;
T.check(np.numKeys === 2 && T.near(np.keyValue(1), pp.keyValue(1)) && T.near(np.keyValue(2), pp.keyValue(2)) && T.near(np.keyTime(2), pp.keyTime(2)), "the null has the precomp layer's position keys");
T.check(T.near(nul.transform.rotation.value, 15) && T.near(nul.transform.scale.value, [120, 90]) && T.near(nul.transform.anchorPoint.value, pl.transform.anchorPoint.value), "and its rotation, scale and anchor point");
T.check(T.near(nul.startTime, 0.4) && T.near(nul.inPoint, 0.6) && T.near(nul.outPoint, 2.8), "and its timing");
var cKid = main.layer("Kid"), cNull = main.layer("PNull"), cFill = main.layer("Fill"), cMatte = main.layer("Matte"), cLate = main.layer("Late");
T.check(cKid.parent && cKid.parent.index === cNull.index, "parenting inside the precomp is kept (Kid follows the copied PNull)");
T.check(cNull.parent.index === nul.index && cFill.parent.index === nul.index && cMatte.parent.index === nul.index && cLate.parent.index === nul.index, "the copied top-level layers follow the null");
T.check(cFill.hasTrackMatte && cFill.trackMatteLayer.index === cMatte.index, "the track matte is kept (Fill uses the copied Matte)");
T.check(T.near(cLate.startTime, 0.6) && T.near(cLate.inPoint, 0.92) && T.near(cLate.outPoint, 2.8), "times shift by the start time and are trimmed to the precomp layer's out point (Late: " + cLate.startTime + ", " + cLate.inPoint + "-" + cLate.outPoint + ")");
T.check(T.near(cKid.startTime, 0.4) && T.near(cKid.inPoint, 0.6) && T.near(cKid.outPoint, 2.8) && cNull.transform.rotation.numKeys === 2 && T.near(cNull.transform.rotation.keyTime(2), 2.4), "the others are trimmed to its in and out points, keys move with them");
T.check(!/Not carried over/.test(r.message), "nothing to warn about");
looksSame(ref, main, [0.32, 0.8, 1.6, 2.6], "the comp renders the same pixels");

// ---- warnings, and Delete
var pl2 = main.layers.add(pre);
pl2.transform.opacity.setValue(50);
pl2.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
pl2.blendingMode = BlendingMode.ADD;
var pl3 = main.layers.add(pre);
var n0 = main.numLayers, pl2Name = pl2.name;
T.select(main, [pl2, pl3], []);
r = MotionKit.run("unprecomp", { original: "delete" });
T.check(r.ok && main.numLayers === n0 - 2 + 2 * 6, "two precomp layers at once, originals deleted: " + r.message);
T.check(new RegExp("Not carried over from \"" + pl2Name + "\": opacity, effects, blending mode\\.").test(r.message) && r.message.split("Not carried").length === 2, "the first layer's opacity, effects and blending mode are reported as not carried over; nothing for the plain one");
T.check(main.layer("Pre Transform 2") && main.layer("Pre Transform 3"), "each gets its own null, numbered");

// ---- a 3D precomp layer: a 3D null, and the copied layers become 3D so they follow it in 3D
var m3 = T.comp("Main 3D", 500, 300, 3, 25);
T.solid(m3, "Bg", 500, 300, [0.15, 0.15, 0.15]);
var p3 = m3.layers.add(pre);
p3.threeDLayer = true;
p3.transform.property("ADBE Rotate Y").setValue(35);
p3.transform.position.setValue([260, 150, 80]);
var ref3 = m3.duplicate();
m3.openInViewer();
T.select(m3, [p3], []);
r = MotionKit.run("unprecomp");
var n3 = r.created[0];
T.check(r.ok && n3.threeDLayer && T.near(n3.transform.property("ADBE Rotate Y").value, 35) && T.near(n3.transform.position.value, [260, 150, 80]), "a 3D precomp layer gives a 3D null with its 3D transform");
T.check(m3.layer("Fill").threeDLayer && m3.layer("PNull").threeDLayer && m3.layer("Kid").threeDLayer && m3.layer("Matte").threeDLayer, "the copied layers become 3D");
looksSame(ref3, m3, [1], "the 3D comp renders the same pixels");

T.done();
