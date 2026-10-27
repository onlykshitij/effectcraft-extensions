// SPDX-License-Identifier: MIT OR Apache-2.0
// Collect Colors: every source (shape fills and strokes in nested groups, text fill and stroke,
// solid colour, Color Controls), gradients skipped and reported, merging within the tolerance
// (and not at 0), quantising with Step, hue order with greys last, the "Palette" shape layer
// (40 px squares, 8 px apart, 8 to a row from the top-left) and null, outputs off, all layers
// when none are selected, refusals (naming the comp, and skipped gradients), one Undo.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var SH = MotionKit.helpers.shapes;
var UNDO = app.findMenuCommandId("Undo");

var comp = T.comp("Colors Test");
comp.time = 1;
function fill(into, rgb, stroke) {
  var p = SH.inner(into).addProperty(stroke ? "ADBE Vector Graphic - Stroke" : "ADBE Vector Graphic - Fill");
  p.property(stroke ? "ADBE Vector Stroke Color" : "ADBE Vector Fill Color").setValue(rgb);
  return p;
}
var sh = comp.layers.addShape();
sh.name = "Shapes";
var root = SH.contents(sh);
fill(root, [1, 0, 0]);
var g = root.addProperty("ADBE Vector Group");
fill(g, [250 / 255, 2 / 255, 0]);
fill(g, [0, 0, 1], true);
fill(SH.inner(g).addProperty("ADBE Vector Group"), [0, 1, 0]);
SH.inner(g).addProperty("ADBE Vector Graphic - G-Fill");
var txt = comp.layers.addText("Title");
var td = txt.property("ADBE Text Properties").property("ADBE Text Document"), doc = td.value;
doc.fillColor = [1, 0.5, 0];
doc.applyStroke = true;
doc.strokeColor = [1, 1, 1];
doc.strokeWidth = 2;
td.setValue(doc);
var plate = T.solid(comp, "Plate", 50, 50, [0.5, 0, 0.5]);
var ctrl = comp.layers.addNull();
ctrl.name = "Ctrl";
MotionKit.helpers.controls.color(ctrl, "Tint", [1, 1, 0]);
var far = comp.layers.addShape();
far.name = "Far";
fill(SH.contents(far), [0, 1, 1]);
var picked = [sh, txt, plate, ctrl], n0 = comp.numLayers;

function rgb(p) { var v = p.value; return [v[0], v[1], v[2]]; }
function paletteNull() { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === "Palette" && comp.layer(i).nullLayer) return comp.layer(i); return null; }
function paletteShapes() { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === "Palette" && comp.layer(i).matchName === "ADBE Vector Layer") return comp.layer(i); return null; }
function controls(n) {
  var fx = n.property("ADBE Effect Parade"), out = [];
  for (var i = 1; i <= fx.numProperties; i++) out.push({ name: fx.property(i).name, rgb: rgb(fx.property(i).property(1)) });
  return out;
}
function sameColors(list, want) {
  if (list.length !== want.length) return false;
  for (var i = 0; i < want.length; i++) if (!T.near(list[i].rgb, want[i], 1e-4)) return false;
  return true;
}

// Default: tolerance 6 merges the near-red into red; hue order, white last.
T.select(comp, picked, []);
var r = MotionKit.run("collectColors");
T.check(r.ok && /Collected 7 colours \(from 8 found\)/.test(r.message), "8 colours found, 7 after merging: " + r.message.split("\n")[0]);
T.check(/Skipped 1 gradient: gradient stops aren't collected/.test(r.message), "the gradient fill is skipped and reported");
var pn = paletteNull(), ps = paletteShapes();
T.check(pn && ps && r.created.length === 2 && comp.numLayers === n0 + 2, "a \"Palette\" shape layer and a \"Palette\" null");
var cs = controls(pn);
var order = [[1, 0, 0], [1, 0.5, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [0.5, 0, 0.5], [1, 1, 1]];
T.check(sameColors(cs, order), "red, orange (text fill), yellow (Color Control), green (nested), blue (stroke), purple (solid), white (text stroke) last");
T.check(cs[0].name === "Color 1" && cs[6].name === "Color 7", "controls named Color 1 to Color 7");
var sroot = SH.contents(ps), squares = true;
for (var i = 0; i < 7; i++) {
  var gi = sroot.property(i + 1), rect = SH.inner(gi).property("ADBE Vector Shape - Rect");
  if (!rect || !T.near(rect.property("ADBE Vector Rect Size").value, [40, 40]) || !T.near(rect.property("ADBE Vector Rect Position").value, [28 + 48 * i, 28])) squares = false;
  if (!T.near(rgb(SH.inner(gi).property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color")), order[i], 1e-4)) squares = false;
}
T.check(squares && sroot.numProperties === 7, "seven 40 px squares in a row, 8 px apart from the top-left, in the same colours");
T.check(T.near(ps.transform.position.value, [0, 0]) && T.near(ps.transform.anchorPoint.value, [0, 0]), "the shape layer sits at the comp origin");
app.executeCommand(UNDO);
T.check(comp.numLayers === n0, "one Undo removes both palette layers");

// Tolerance 0 keeps the near-red; just over its distance merges it again.
T.select(comp, picked, []);
r = MotionKit.run("collectColors", { tolerance: 0, shapes: false });
T.check(r.ok && /Collected 8 colours/.test(r.message) && !paletteShapes() && controls(paletteNull()).length === 8, "tolerance 0: 8 colours, and only the null");
app.executeCommand(UNDO);
var dist = Math.sqrt(5 * 5 + 2 * 2) * 100 / (255 * Math.sqrt(3));
T.select(comp, picked, []);
r = MotionKit.run("collectColors", { tolerance: dist * 0.99, controls: false });
T.check(/Collected 8 colours/.test(r.message) && !paletteNull(), "just under the near-red's distance (" + dist.toFixed(3) + "): kept apart, and only the shape layer");
app.executeCommand(UNDO);
T.select(comp, picked, []);
r = MotionKit.run("collectColors", { tolerance: dist * 1.01 });
T.check(/Collected 7 colours/.test(r.message), "just over it: merged");
app.executeCommand(UNDO);

// Step 4 snaps channels to multiples of 16: the near-red becomes red, purple's 127.5 becomes 128.
T.select(comp, picked, []);
r = MotionKit.run("collectColors", { tolerance: 0, step: 4 });
cs = controls(paletteNull());
T.check(/Collected 7 colours/.test(r.message) && T.near(cs[5].rgb, [128 / 255, 0, 128 / 255], 1e-6), "step 4: near-red quantised onto red, purple to 128/255");
app.executeCommand(UNDO);

// Nothing selected: every layer, Far's cyan too.
T.select(comp, [], []);
r = MotionKit.run("collectColors");
T.check(r.ok && /Collected 8 colours \(from 9 found\)/.test(r.message) && T.near(controls(paletteNull())[4].rgb, [0, 1, 1]), "no selection: the whole comp, cyan between green and blue");
app.executeCommand(UNDO);

// Eight to a row.
var many = comp.layers.addNull();
for (i = 0; i < 10; i++) {
  var h = i / 10 * 6, k = h - Math.floor(h), sector = Math.floor(h);
  var c = [[1, k, 0], [1 - k, 1, 0], [0, 1, k], [0, 1 - k, 1], [k, 0, 1], [1, 0, 1 - k]][sector];
  MotionKit.helpers.controls.color(many, "Hue " + i, c);
}
T.select(comp, [many], []);
r = MotionKit.run("collectColors", { tolerance: 0 });
sroot = SH.contents(paletteShapes());
var p9 = SH.inner(sroot.property(9)).property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Position").value;
var p10 = SH.inner(sroot.property(10)).property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Position").value;
T.check(sroot.numProperties === 10 && T.near(p9, [28, 76]) && T.near(p10, [76, 76]), "the ninth square starts a second row");
app.executeCommand(UNDO);

// Refusals.
var empty = comp.layers.addNull();
T.select(comp, [empty], []);
r = MotionKit.run("collectColors");
T.check(!r.ok && /found no colours in the selected layers\.$/.test(T.lastAlert()), "a plain null: refused");
// Nothing selected and only a gradient: the message names the comp and the skipped gradient.
var gc = T.comp("Gradient Only");
SH.inner(gc.layers.addShape().property("ADBE Root Vectors Group").addProperty("ADBE Vector Group")).addProperty("ADBE Vector Graphic - G-Fill");
T.select(gc, [], []);
r = MotionKit.run("collectColors");
T.check(!r.ok && /found no colours in the comp, only 1 gradient \(gradient stops aren't collected\)\./.test(T.lastAlert()), "nothing selected, only a gradient: " + T.lastAlert());
comp.openInViewer();
T.select(comp, picked, []);
r = MotionKit.run("collectColors", { shapes: false, controls: false });
T.check(!r.ok && /at least one output/.test(r.message) && !paletteNull() && !paletteShapes(), "both outputs off: refused");

T.done();
