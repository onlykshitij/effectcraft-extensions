// SPDX-License-Identifier: MIT OR Apache-2.0
// Shapes from Vector: an SVG footage layer becomes a shape layer directly above it with the
// artwork's colours, in the same place, with its parent, transform and timing; the source is
// hidden or deleted; other layers are listed as skipped; non-vector layers alone are refused;
// one Undo. Scripts can't write files headless (Allow Scripts to Write Files is off), so the
// SVG is the fixture fixture_shapesFromVector_art.jsx instead of one written by the test.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var SH = MotionKit.helpers.shapes;

var item = app.project.importFile(new ImportOptions(new File(new File($.fileName).path + "/fixture_shapesFromVector_art.jsx")));
T.check(item instanceof FootageItem && item.width === 200 && item.height === 100, "the fixture imports as 200 x 100 vector footage");
var comp = T.comp("Vector Test", 300, 200);
comp.time = 1;
var rig = comp.layers.addNull();
rig.name = "Rig";
rig.transform.position.setValue([150, 90]);
rig.transform.rotation.setValue(10);
var art = comp.layers.add(item);
art.name = "Art";
art.parent = rig;
art.transform.position.setValue([10, 5]);
art.transform.scale.setValue([90, 90]);
art.startTime = 0.4;
art.outPoint = 3;
var plate = T.solid(comp, "Plate", 40, 40);
var n0 = comp.numLayers;

// Refusals change nothing.
T.select(comp, [], []);
var r = MotionKit.run("shapesFromVector");
T.check(!r.ok && /select one or more vector footage layers/.test(T.lastAlert()) && comp.numLayers === n0, "nothing selected: refused");
T.select(comp, [plate, rig], []);
r = MotionKit.run("shapesFromVector");
T.check(!r.ok && /none of the selected layers is vector footage/.test(r.message) && /Plate/.test(r.message) && /Rig/.test(r.message) && comp.numLayers === n0 && plate.enabled, "only a solid and a null: refused, both named");

// Convert, skipping the solid.
var pts = [[20, 20], [80, 60], [170, 50]], want = [];
for (var i = 0; i < pts.length; i++) want.push(art.sourcePointToComp(pts[i]));
T.select(comp, [art, plate], []);
r = MotionKit.run("shapesFromVector");
var made = r.created[0];
T.check(r.ok && r.created.length === 1 && made.matchName === "ADBE Vector Layer" && comp.numLayers === n0 + 1, "one shape layer: " + r.message);
T.check(/Skipped \(not vector footage\): Plate\./.test(r.message), "the solid is listed as skipped");
T.check(made.index === art.index - 1, "directly above the source");
T.check(made.parent && made.parent.name === "Rig" && made.startTime === art.startTime && made.inPoint === art.inPoint && made.outPoint === art.outPoint, "parent and timing kept");
T.check(!art.enabled && made.enabled, "the source is hidden");
var at = true;
for (i = 0; i < pts.length; i++) if (!T.near(made.sourcePointToComp(pts[i]), want[i], 1e-3)) at = false;
T.check(at, "the artwork stays in place: SVG points land where the footage drew them");
var fills = [], strokes = [];
SH.walk(made, function (it) {
  if (it.matchName === "ADBE Vector Graphic - Fill") fills.push(it.property("ADBE Vector Fill Color").value.slice(0, 3).join(","));
  if (it.matchName === "ADBE Vector Graphic - Stroke") strokes.push(it.property("ADBE Vector Stroke Color").value.slice(0, 3).join(","));
});
T.check(fills.join(" ").indexOf("1,0,0") >= 0 && fills.join(" ").indexOf("0,1,0") >= 0 && strokes.join(" ").indexOf("0,0,1") >= 0, "the shapes have the artwork's colours (fills " + fills.join(" / ") + ", stroke " + strokes.join(" / ") + ")");

app.executeCommand(app.findMenuCommandId("Undo"));
T.check(comp.numLayers === n0 && art.enabled, "one Undo removes the shape layer and shows the source");

// Delete the source.
T.select(comp, [art], []);
r = MotionKit.run("shapesFromVector", { source: "delete" });
T.check(r.ok && comp.numLayers === n0 && !comp.layer("Art") && r.created[0].parent.name === "Rig", "delete: the source is gone, the shape layer keeps the parent");

T.done();
