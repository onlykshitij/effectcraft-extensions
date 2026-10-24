// SPDX-License-Identifier: MIT OR Apache-2.0
// Selector: exactly the properties of the chosen types in the selected layers (nested groups
// included, other layers left out, the previous selection dropped), every type, the chips in
// the options dialog, option validation, nothing found or no layers: refused, selection kept.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var SH = MotionKit.helpers.shapes, U = MotionKit.helpers.util;

var comp = T.comp("Selector Test");
function group(into, name) {
  var g = SH.inner(into).addProperty("ADBE Vector Group");
  g.name = name;
  return g;
}
function add(into, matchName) { return SH.inner(into).addProperty(matchName); }

// Shape layer: G1 {path, rect, fill, stroke, G2 {path, gradient fill, gradient stroke, trim}, repeater}, root fill.
var sh = comp.layers.addShape();
sh.name = "Shapes";
var root = SH.contents(sh);
var g1 = group(root, "G1");
add(g1, "ADBE Vector Shape - Group");
add(g1, "ADBE Vector Shape - Rect");
add(g1, "ADBE Vector Graphic - Fill");
add(g1, "ADBE Vector Graphic - Stroke");
var g2 = group(g1, "G2");
add(g2, "ADBE Vector Shape - Group");
add(g2, "ADBE Vector Graphic - G-Fill");
add(g2, "ADBE Vector Graphic - G-Stroke");
add(g2, "ADBE Vector Filter - Trim");
add(g1, "ADBE Vector Filter - Repeater");
add(root, "ADBE Vector Graphic - Fill");
// A solid with two masks.
var sol = T.solid(comp, "Solid", 200, 100);
sol.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
sol.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
// Another shape layer that isn't selected.
var other = comp.layers.addShape();
other.name = "Other";
add(group(SH.contents(other), "O"), "ADBE Vector Shape - Group");

// "matchName@layer" of every selected property, sorted.
function picked() {
  var sp = comp.selectedProperties, out = [];
  for (var i = 0; i < sp.length; i++) out.push(sp[i].matchName + "@" + MotionKit.helpers.sel.layerOf(sp[i]).name);
  out.sort();
  return out.join(", ");
}
function count(list, m) { return U.filter(list.split(", "), function (s) { return s.indexOf(m + "@") === 0; }).length; }

// Default: paths, in nested groups too; the previously selected property is dropped.
T.select(comp, [sh, other], [sol.transform.opacity]);
T.select(comp, [sh], [sh.transform.position]);
var r = MotionKit.run("selector");
T.check(r.ok && picked() === "ADBE Vector Shape@Shapes, ADBE Vector Shape@Shapes", "default (Paths): both Path properties, the nested one too, and nothing else: " + picked());
T.check(comp.selectedLayers.length === 1 && comp.selectedLayers[0].name === "Shapes", "the layer selection is kept");
T.check(/Selected 2 properties in 1 layer/.test(r.message), r.message);

// Shape item types.
r = MotionKit.run("selector", { types: ["fills", "strokes", "gradientFills", "gradientStrokes", "groups", "groupTransforms", "trimPaths", "repeaters"] });
var p = picked();
T.check(r.ok && count(p, "ADBE Vector Graphic - Fill") === 2 && count(p, "ADBE Vector Graphic - Stroke") === 1, "fills (G1 and the root one) and strokes");
T.check(count(p, "ADBE Vector Graphic - G-Fill") === 1 && count(p, "ADBE Vector Graphic - G-Stroke") === 1, "gradient fills and strokes");
T.check(count(p, "ADBE Vector Group") === 2 && count(p, "ADBE Vector Transform Group") === 2, "groups and their transforms");
T.check(count(p, "ADBE Vector Filter - Trim") === 1 && count(p, "ADBE Vector Filter - Repeater") === 1, "trim paths and repeaters");
T.check(p.split(", ").length === 11 && count(p, "ADBE Vector Shape") === 0, "and nothing else (" + p.split(", ").length + ")");

// Masks and layer transform properties, over two layers.
T.select(comp, [sh, sol], []);
r = MotionKit.run("selector", { types: ["masks", "position", "scale", "rotation", "opacity", "anchorPoint"] });
p = picked();
T.check(r.ok && count(p, "ADBE Mask Atom") === 2 && p.indexOf("ADBE Mask Atom@Solid") >= 0, "masks of the solid");
var TR = ["ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity", "ADBE Anchor Point"], all = true;
for (var i = 0; i < TR.length; i++) if (p.indexOf(TR[i] + "@Shapes") < 0 || p.indexOf(TR[i] + "@Solid") < 0) all = false;
T.check(all && p.split(", ").length === 12 && comp.selectedLayers.length === 2, "transform properties of both layers: " + p);
T.check(p.indexOf("@Other") < 0, "nothing from the unselected layer");

// Nothing of the chosen types: refused, the selection stays.
T.select(comp, [sol], [sol.transform.position]);
r = MotionKit.run("selector", { types: ["trimPaths"] });
T.check(!r.ok && /have no Trim Paths/.test(T.lastAlert()) && picked() === "ADBE Position@Solid", "no trim paths in the solid: refused, selection unchanged");
T.select(comp, [], []);
r = MotionKit.run("selector");
T.check(!r.ok && /select one or more layers/.test(r.message), "no layers: refused");

// Options: the chips, defaults and validation.
var tool = MotionKit.tools.selector;
T.check(MotionKit.options.validate(tool, { types: ["scale", "paths", "bogus"] }, true).values.types.join() === "paths,scale", "validation keeps known types, in chip order");
T.check(MotionKit.options.validate(tool, { types: [] }, true).errors.length === 1 && MotionKit.options.validate(tool, { types: "paths" }, true).errors.length === 1, "an empty list or a non-list is refused");
var d = MotionKit.optionsDialog.build(tool, { types: ["fills", "masks"] });
var chips = d.inputs.types;
T.check(chips.get().join() === "fills,masks", "the chips show the saved types");
chips.set(["opacity"]);
T.check(d.read().values.types.join() === "opacity", "toggled chips are read back");
var boxes = 0;
(function walk(c) { for (var k = 0; k < c.children.length; k++) { if (c.children[k].type === "checkbox") boxes++; walk(c.children[k]); } })(d.win);
T.check(boxes === 15, "one chip per type (" + boxes + ")");

T.done();
