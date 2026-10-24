// SPDX-License-Identifier: MIT OR Apache-2.0
// Duplicate Comp: comp("<old name>") expressions in the copies are rewritten to the copies'
// names (others are left alone), names count up ("Main 2", "Main 3") or take a suffix, Project
// panel selections, Deep duplicates each nested precomp once and points the copies at the
// copies, one Undo, nothing to duplicate.
// Deep needs Layer.replaceSource (EffectCraft after 0.14); without it the deep checks are skipped
// and the tool's warning is checked instead.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

function deselectItems() {
  var sel = app.project.selection;
  for (var i = 0; i < sel.length; i++) sel[i].selected = false;
}
function itemNamed(name) {
  for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i).name === name) return app.project.item(i);
  return null;
}
var canDeep = false;
(function () {
  var cmds = app.run("command.list", {});
  for (var i = 0; i < cmds.length; i++) if (cmds[i].id === "layer.replaceSource") canDeep = true;
})();

// ---- nothing to duplicate: no comp open, nothing selected
deselectItems();
var none = MotionKit.run("duplicateComp");
T.check(!app.project.activeItem && !none.ok && /select one or more comps/.test(T.lastAlert()) && app.project.numItems === 0, "no comp open and none selected: refused with an alert, nothing made");

// ---- Inner inside Pre (used twice) inside Main; Other is separate
var inner = app.project.items.addComp("Inner", 100, 100, 1, 2, 25);
inner.layers.addSolid([0.5, 0.5, 0.5], "IS", 50, 50, 1);
var pre = app.project.items.addComp("Pre", 200, 100, 1, 2, 25);
pre.layers.add(inner);
var ps = pre.layers.addSolid([0.2, 0.4, 0.8], "PS", 20, 20, 1);
ps.transform.opacity.expression = "comp(\"Inner\").layer(1).transform.opacity.value / 2";
var other = app.project.items.addComp("Other", 64, 64, 1, 2, 25);
var main = T.comp("Main", 400, 300, 2, 25);
main.layers.add(pre);
main.layers.add(pre);
var s = T.solid(main, "S", 10, 10);
var EXPR = "var a = comp(\"Pre\").width, b = comp('Main').height, c = comp( \"Other\" ).width;\n[a + c * 0, b]";
s.transform.position.expression = EXPR;
deselectItems();
var n0 = app.project.numItems;

// ---- default: the active comp, Deep
var r = MotionKit.run("duplicateComp");
T.check(r.ok, "it runs: " + r.message);
var m2 = r.created[0];
T.check(m2 && m2.name === "Main 2" && m2.numLayers === 3, "the active comp is duplicated as \"Main 2\"");
var s2 = m2.layer("S");
var e2 = s2.transform.position.expression;
T.check(e2.indexOf("comp(\"Main 2\")") >= 0 && e2.indexOf("comp( \"Other\" )") >= 0, "comp('Main') in the copy now names \"Main 2\"; comp(\"Other\"), not duplicated, is left alone: " + e2.split("\n")[0]);
T.check(s.transform.position.expression === EXPR, "the original's expression is unchanged");
if (canDeep) {
  var p2 = itemNamed("Pre 2"), i2 = itemNamed("Inner 2");
  T.check(app.project.numItems === n0 + 3 && p2 && i2 && /2 nested precomps/.test(r.message), "Deep: Pre and Inner are duplicated once each (Pre is used twice)");
  T.check(m2.layer(2).source.id === p2.id && m2.layer(3).source.id === p2.id, "both precomp layers of Main 2 use Pre 2");
  T.check(p2.layer(2).source.id === i2.id && pre.layer(2).source.id === inner.id, "Pre 2 uses Inner 2; Pre still uses Inner");
  T.check(e2.indexOf("comp(\"Pre 2\")") >= 0, "comp(\"Pre\") in the copy now names \"Pre 2\"");
  T.check(p2.layer("PS").transform.opacity.expression === "comp(\"Inner 2\").layer(1).transform.opacity.value / 2" && ps.transform.opacity.expression.indexOf("comp(\"Inner\")") === 0, "nested copies are rewritten too (comp(\"Inner 2\") in Pre 2), the originals aren't");
  T.check(T.near(s2.transform.position.valueAtTime(0, false), [200, 300]), "the rewritten expression evaluates");
} else {
  writeLn("SKIP Deep checks: this EffectCraft has no layer.replaceSource command (AVLayer.replaceSource throws \"not supported yet\"), so nested precomps can't be re-pointed.");
  T.check(app.project.numItems === n0 + 1 && /weren't duplicated/.test(r.message) && m2.layer(2).source.id === pre.id, "without replaceSource, Deep falls back to a plain duplicate and says so");
  T.check(e2.indexOf("comp(\"Pre\")") >= 0, "comp(\"Pre\"), not duplicated, is left alone");
}

// ---- one Undo removes every copy
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(app.project.numItems === n0 && !itemNamed("Main 2"), "one Undo removes all the copies");

// ---- names count up, or take a suffix
main.openInViewer();
deselectItems();
r = MotionKit.run("duplicateComp", { deep: false });
T.check(r.ok && r.created[0].name === "Main 2" && app.project.numItems === n0 + 1 && r.created[0].layer(2).source.id === pre.id, "Deep off: only the comp is duplicated, its layers use the original Pre");
deselectItems();
r = MotionKit.run("duplicateComp", { deep: false });
T.check(r.ok && r.created[0].name === "Main 3" && r.created[0].layer("S").transform.position.expression.indexOf("comp('Main')") < 0 && r.created[0].layer("S").transform.position.expression.indexOf("comp(\"Main 3\")") >= 0, "\"Main 2\" is taken, so \"Main 3\", with its own name in the expression");
deselectItems();
r = MotionKit.run("duplicateComp", { deep: false, suffix: " copy" });
T.check(r.ok && r.created[0].name === "Main copy", "a custom suffix: \"Main copy\"");
deselectItems();
r = MotionKit.run("duplicateComp", { deep: false, suffix: " copy" });
T.check(r.ok && r.created[0].name === "Main copy 2", "and \"Main copy 2\" when that's taken");

// ---- comps selected in the Project panel win over the active comp
deselectItems();
pre.selected = true;
other.selected = true;
var n1 = app.project.numItems;
r = MotionKit.run("duplicateComp", { deep: false });
T.check(r.ok && r.created.length === 2 && /Duplicated 2 comps/.test(r.message) && itemNamed("Other 2") && itemNamed("Pre 2") && app.project.numItems === n1 + 2, "the two selected comps are duplicated, not the active one: " + r.message);
T.check(itemNamed("Pre 2").layer("PS").transform.opacity.expression === ps.transform.opacity.expression, "Inner wasn't duplicated, so Pre 2 still reads comp(\"Inner\")");

T.done();
