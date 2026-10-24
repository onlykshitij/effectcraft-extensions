// SPDX-License-Identifier: MIT OR Apache-2.0
// Layout model: every operation, named layouts, export/import, invalid input, unknown ids,
// span packing, migration of Motion Kit 0.1 (four-panel) layouts, settings validation, options
// validation and the command box search.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var L = MotionKit.layout;
function ids(l, p) { var a = []; for (var i = 0; i < l.panels[p].items.length; i++) a.push(l.panels[p].items[i].id); return a.join(","); }
function js(v) { return JSON.stringify(v); }

// ---- the default layout
var d = L.defaultLayout();
T.check(d.panels.length === 5, "five panels");
T.check(d.panels[0].title === "Animate" && ids(d, 0) === "bounce,elastic,loop,easeKeys,easeCopy,sequencer,cloneKeys,fixKeys", "panel 1 Animate in spec order");
T.check(d.panels[1].title === "Rig" && ids(d, 1) === "limb,parentNull,nullsPoints,sliderToPath,positionTrace,moveAnchor", "panel 2 Rig in spec order");
T.check(d.panels[2].title === "Shapes" && ids(d, 2) === "extractShapes,mergeShapes,selector,strokeStyle,shapesFromVector,collectColors", "panel 3 Shapes in spec order");
T.check(d.panels[3].title === "Comp" && ids(d, 3) === "cropComp,unprecomp,duplicateComp,gifExport", "panel 4 Comp in spec order");
var ALL = "ease,keyCopyPaste,interpolation,anchor,sequencerWidget,bounce,elastic,loop,easeKeys,sequencer,cloneKeys,fixKeys," +
  "limb,parentNull,nullsPoints,sliderToPath,positionTrace,extractShapes,mergeShapes,selector,strokeStyle,shapesFromVector,collectColors," +
  "cropComp,unprecomp,duplicateComp,gifExport";
T.check(d.panels[4].title === "Motion Kit" && ids(d, 4) === ALL, "panel 5 Motion Kit: the widgets, then every tool in category order without easeCopy and moveAnchor");
var s0 = d.panels[0].style, s1 = d.panels[1].style;
T.check(s0.cellSize === 56 && s0.spacing === 10 && s0.panelBg === "#0D1B21" && s0.cellBg === "#0D1B21" && s0.cellBorder === "#2A3B42" &&
  s0.buttonMode === "icon" && s0.hideTitle === false && s0.fg === "#FFFFFF" && s0.accent === "#F27A7A" && s0.radius === 6 && s0.columns === 4, "default style values (the dark theme, icon only)");
T.check(JSON.stringify(d.panels[4].style) === JSON.stringify(s1), "every panel but the first has the same default style");
T.check(s0.showCommandBox === true && s1.showCommandBox === false, "command box on panel 1 only");

// ---- normalize: every value validated, unknown ids kept
var bad = {
  panels: [
    { title: "  ", style: { cellSize: 500, spacing: -3, columns: 99, panelBg: "#abc", cellBg: "nope", cellBorder: "#00ff00", buttonMode: "huge", hideTitle: "yes", fg: 12, accent: "red", radius: 40, showCommandBox: 0 },
      items: ["bounce", { id: "futureTool", name: "Future", showIcon: false, bg: "#zzzzzz", accent: "#112233" }, { id: "" }, null, 5, "bounce"] },
    "junk"
  ]
};
var n = L.normalize(bad);
var ns = n.panels[0].style;
T.check(n.panels.length === 5 && n.panels[0].title === "Panel 1" && n.panels[1].title === "Panel 2" && ids(n, 4) === "", "missing and blank panels get defaults (empty)");
T.check(ns.cellSize === 96 && ns.spacing === 0 && ns.columns === 12 && ns.radius === 16, "numbers clamped (cellSize 96, spacing 0, columns 12, radius 16)");
T.check(ns.panelBg === "#AABBCC" && ns.cellBg === "#0D1B21" && ns.cellBorder === "#00FF00" && ns.fg === "#FFFFFF" && ns.accent === "#F27A7A", "colours normalised or defaulted");
T.check(ns.buttonMode === "icon" && ns.hideTitle === false && ns.showCommandBox === true, "bad enums and booleans defaulted");
T.check(ids(n, 0) === "bounce,futureTool", "bad items dropped, duplicates removed, unknown id kept");
var fut = n.panels[0].items[1];
T.check(fut.name === "Future" && fut.showIcon === false && fut.bg === undefined && fut.accent === "#112233", "item overrides validated");
T.check(js(L.normalize(null)) === js(L.normalize({ panels: [] })), "null normalises to an empty layout");
var desc = MotionKit.describe("futureTool");
T.check(desc.missing && /newer version/.test(desc.description), "unknown id described as missing");

// ---- operations are pure
var before = js(d);
var m1 = L.moveItem(d, 0, 0, 0, 2);
T.check(js(d) === before, "moveItem leaves its input alone");
T.check(ids(m1, 0).indexOf("elastic,loop,bounce,") === 0, "moveItem within a panel (index after the move)");
var m2 = L.moveItem(d, 0, 1, 1, 0);
T.check(ids(m2, 0).indexOf("elastic") < 0 && ids(m2, 1).indexOf("elastic,limb") === 0, "moveItem between panels");
var m3 = L.moveItem(d, 0, 7, 0, 99);
T.check(ids(m3, 0).split(",")[7] === "fixKeys", "toIndex clamped to the end");
T.throws(function () { L.moveItem(L.addItem(d, 1, "bounce"), 0, 0, 1, 0); }, "moveItem refuses an id the target panel has");
T.throws(function () { L.moveItem(d, 0, 42, 0, 0); }, "moveItem refuses a bad index");
T.check(ids(L.moveItem(d, 4, 0, 0, 0), 0).indexOf("ease,bounce") === 0, "moveItem from panel 5");
T.throws(function () { L.moveItem(d, 5, 0, 0, 0); }, "moveItem refuses a bad panel");

var a1 = L.addItem(d, 3, "parentNull");
T.check(ids(a1, 3) === "cropComp,unprecomp,duplicateComp,gifExport,parentNull", "addItem appends");
var a2 = L.addItem(d, 3, "bounce", 1);
T.check(ids(a2, 3) === "cropComp,bounce,unprecomp,duplicateComp,gifExport", "addItem at an index");
T.check(js(L.addItem(a2, 3, "bounce", 0)) === js(a2), "addItem with an id already there changes nothing");
T.throws(function () { L.addItem(d, 0, ""); }, "addItem needs an id");
var r1 = L.removeItem(d, 3, 0);
T.check(ids(r1, 3) === "unprecomp,duplicateComp,gifExport", "removeItem");
T.throws(function () { L.removeItem(d, 3, 4); }, "removeItem refuses a bad index");

var st1 = L.setStyle(d, 2, { cellSize: 30, buttonMode: "name", panelBg: "#102030", cellBorder: null, spacing: "wide", fg: "#nothex", accent: "#00ff00", radius: 3 });
var ss = st1.panels[2].style;
T.check(ss.cellSize === 30 && ss.buttonMode === "name" && ss.panelBg === "#102030" && ss.cellBorder === null && ss.accent === "#00FF00" && ss.radius === 3, "setStyle merges valid values");
T.check(ss.spacing === 10 && ss.fg === "#FFFFFF" && ss.cellBg === "#0D1B21", "setStyle keeps current values for invalid input");
T.check(d.panels[2].style.cellSize === 56, "setStyle leaves its input alone");
var si = L.setItem(d, 0, 1, { name: "Spring", showName: false, accent: "#ff0000", bg: "bogus", id: "hack" });
var it = si.panels[0].items[1];
T.check(it.id === "elastic" && it.name === "Spring" && it.showName === false && it.accent === "#FF0000" && it.bg === undefined, "setItem sets overrides, ignores id and bad colours");
var si2 = L.setItem(si, 0, 1, { name: null, accent: "", showName: undefined });
T.check(si2.panels[0].items[1].name === undefined && si2.panels[0].items[1].accent === undefined && si2.panels[0].items[1].showName === undefined, "setItem clears overrides");
T.check(L.renamePanel(d, 1, "  Rigging ").panels[1].title === "Rigging", "renamePanel trims");
T.throws(function () { L.renamePanel(d, 1, "   "); }, "renamePanel refuses an empty title");

// ---- named layouts (stored)
var rev0 = MotionKit.settings.rev();
T.check(js(L.list()) === "[\"Default\"]" && L.active() === "Default", "starts with the Default layout");
L.add("Mine", "empty");
T.check(js(L.list()) === "[\"Default\",\"Mine\"]" && L.active() === "Mine" && ids(L.get(), 0) === "", "add empty (becomes active)");
T.check(MotionKit.settings.rev() > rev0, "saving bumps rev");
L.save(L.addItem(L.get(), 0, "loop"));
L.add("Copy", "duplicate");
T.check(L.active() === "Copy" && ids(L.get("Copy"), 0) === "loop", "duplicate copies the active layout");
T.throws(function () { L.add("Copy", "empty"); }, "add refuses a taken name");
L.rename("Mine", "Ours");
T.check(js(L.list()) === "[\"Default\",\"Ours\",\"Copy\"]", "rename keeps the order");
L.switchTo("Ours");
L.rename("Ours", "Team");
T.check(L.active() === "Team", "renaming the active layout keeps it active");
T.throws(function () { L.switchTo("Nope"); }, "switchTo refuses an unknown name");
L.remove("Team");
T.check(js(L.list()) === "[\"Default\",\"Copy\"]" && L.active() === "Default", "remove the active layout picks another");
L.remove("Copy");
T.throws(function () { L.remove("Default"); }, "the last layout can't be deleted");
L.save(L.removeItem(L.get(), 0, 0));
L.resetToDefault("Default");
T.check(js(L.get()) === js(L.defaultLayout()), "resetToDefault");
L.add("Extra", "empty");
L.resetAll();
T.check(js(L.list()) === "[\"Default\"]" && L.active() === "Default", "resetAll");

// ---- export / import
L.save(L.setStyle(L.addItem(L.get(), 1, "futureTool", 0), 1, { cellSize: 60 }));
L.add("Second", "duplicate");
var lib = MotionKit.library.create("expression", { name: "Wiggle", code: "wiggle(2, 20)" });
MotionKit.library.save(lib);
L.save(L.addItem(L.get(), 2, lib.id));
var text = L.exportJson();
var snapshot = js(L.state());
L.resetAll();
MotionKit.settings.set("library", []);
L.importJson(text, "replace");
T.check(js(L.state()) === snapshot, "export then import (replace) round-trips layouts, active and library");
T.check(ids(L.get("Default"), 1).indexOf("futureTool") === 0, "unknown ids survive a round trip");

L.importJson(text, "merge");
var names = L.list();
T.check(js(names) === "[\"Default\",\"Second\",\"Default 2\",\"Second 2\"]", "merge renames layouts on collision: " + js(names));
T.check(MotionKit.library.list().length === 1, "merge skips an identical library item");
var other = JSON.parse(text);
other.library[0].code = "wiggle(5, 50)";
L.importJson(JSON.stringify(other), "merge");
var libs = MotionKit.library.list();
T.check(libs.length === 2 && libs[1].id !== libs[0].id && libs[1].name === "Wiggle 2", "merge gives a clashing library item a new id and name");
var merged = L.get(L.list()[L.list().length - 1]);
T.check(ids(merged, 2).indexOf(libs[1].id) >= 0, "merged layouts point at the renamed library item");

T.throws(function () { L.importJson("{not json", "replace"); }, "invalid JSON is refused");
T.throws(function () { L.importJson("{}", "replace"); }, "JSON without layouts is refused");
T.throws(function () { L.importJson("[1,2]", "replace"); }, "a JSON array is refused");
T.check(js(L.list()).indexOf("Second 2") > 0, "a refused import changes nothing");
L.importJson(JSON.stringify({ panels: [{ title: "Solo", items: ["loop"] }] }), "merge");
T.check(L.list()[L.list().length - 1] === "Imported" && ids(L.get("Imported"), 0) === "loop", "a bare Layout imports as \"Imported\"");

// ---- files: writes are blocked headless, and the message says how to allow them
var msg = T.throws(function () { L.saveToFile("/tmp/motionkit-layout-test.json"); }, "saveToFile fails when EffectCraft blocks writes");
T.check(/Allow Scripts to Write Files/.test(msg), "the message names the preference");
T.check(L.saveToFile(null).cancelled === true, "a cancelled save dialog changes nothing");

// ---- stored values are validated when read
app.settings.saveSetting("MotionKit", "layouts", "{broken json");
app.settings.saveSetting("MotionKit", "activeLayout", "\"Gone\"");
T.check(js(L.list()) === "[\"Default\"]" && L.active() === "Default" && js(L.get()) === js(L.defaultLayout()), "corrupt stored layouts fall back to the default");
app.settings.saveSetting("MotionKit", "layouts", JSON.stringify({ "": {}, "Odd": { panels: [{ style: { cellSize: "big" } }] } }));
T.check(js(L.list()) === "[\"Odd\"]" && L.get().panels[0].style.cellSize === 56, "invalid names dropped, invalid values defaulted");

// ---- migration: a layout saved by Motion Kit 0.1 has four panels and every style key
var V1 = { cellSize: 44, spacing: 4, columns: 4, panelBg: null, cellBg: "#2B2B2B", cellBorder: null, buttonMode: "iconName", hideTitle: false, fg: "#D8D8D8", showCommandBox: true };
function v1Panel(title, items, style) {
  var st = JSON.parse(js(V1));
  for (var k in style || {}) st[k] = style[k];
  return { title: title, style: st, items: items };
}
var old = {
  panels: [v1Panel("Animate", [{ id: "bounce" }, { id: "loop", accent: "#00FF00" }]), v1Panel("Mine", [{ id: "limb" }], { buttonMode: "name", cellSize: 60, fg: "#EEEEEE", showCommandBox: false }),
    v1Panel("Shapes", []), v1Panel("Comp", [{ id: "gifExport" }], { panelBg: "#101010", cellBorder: "#333333" })]
};
app.settings.saveSetting("MotionKit", "layouts", js({ Default: old, Second: { panels: [v1Panel("A", []), v1Panel("B", []), v1Panel("C", []), v1Panel("D", [])] } }));
app.settings.saveSetting("MotionKit", "activeLayout", "\"Default\"");
var mig = L.get();
T.check(mig.panels.length === 5 && js(L.list()) === "[\"Default\",\"Second\"]", "a v1 layout loads with five panels");
T.check(ids(mig, 0) === "bounce,loop" && mig.panels[0].items[1].accent === "#00FF00" && mig.panels[1].title === "Mine" && ids(mig, 3) === "gifExport", "panels 1-4 keep their titles, buttons and overrides");
T.check(mig.panels[4].title === "Motion Kit" && ids(mig, 4) === ALL && ids(L.get("Second"), 4) === ALL, "panel 5 gets its default content, in every v1 layout");
var m0 = mig.panels[0].style, m1 = mig.panels[1].style, m3 = mig.panels[3].style;
T.check(m0.buttonMode === "icon" && m0.cellSize === 56 && m0.spacing === 10 && m0.panelBg === "#0D1B21" && m0.cellBg === "#0D1B21" && m0.cellBorder === "#2A3B42" && m0.fg === "#FFFFFF" && m0.showCommandBox === true,
  "style values equal to the v1 defaults become the new defaults (iconName -> icon)");
T.check(m1.buttonMode === "name" && m1.cellSize === 60 && m1.fg === "#EEEEEE" && m1.spacing === 10 && m1.showCommandBox === false, "values the user changed are kept");
T.check(m3.panelBg === "#101010" && m3.cellBorder === "#333333" && m3.buttonMode === "icon", "changed colours are kept too");
L.save(L.get());
T.check(js(JSON.parse(app.settings.getSetting("MotionKit", "layouts")).Default) === js(L.get()), "saving stores the migrated five-panel layout");
var five = L.normalize({ panels: [v1Panel("A", []), v1Panel("B", []), v1Panel("C", []), v1Panel("D", []), v1Panel("E", [{ id: "loop" }])] });
T.check(five.panels[0].style.buttonMode === "iconName" && ids(five, 4) === "loop", "a five-panel layout isn't migrated: its iconName stays");
L.resetAll();

// ---- packing: first fit, row by row, later items fill holes
var P = L.pack;
function at(r) { return js(r.at); }
var pk = P([[2, 2], [2, 1], [2, 1], [2, 2], [2, 1], [1, 1], [1, 1], [1, 1]], 4);
T.check(pk.cols === 4 && pk.rows === 5 && at(pk) === "[[0,0],[2,0],[2,1],[0,2],[2,2],[2,3],[3,3],[0,4]]", "the combined layout: 1 x 1 items fill the holes beside the 2 x 2 widgets (" + at(pk) + ")");
var hole = P([[1, 1], [2, 2], [3, 1], [1, 1]], 3);
T.check(at(hole) === "[[0,0],[1,0],[0,2],[0,1]]" && hole.rows === 3, "a later 1 x 1 goes back to a hole left above a wide item (" + at(hole) + ")");
var wide = P([[6, 2], [1, 1]], 4);
T.check(js(wide.spans) === "[[4,2],[1,1]]" && at(wide) === "[[0,0],[0,2]]" && wide.cols === 4, "an item wider than the columns is clamped to them");
T.check(js(P([], 4)) === js({ cols: 0, rows: 0, at: [], spans: [] }), "an empty layout packs to nothing");
var few = P([[1, 1], [1, 1], [1, 1]], 4);
T.check(few.cols === 3 && few.rows === 1, "fewer items than columns: the grid is only as wide as they are");
T.check(P([[2, 1], [1, 1]], 4).cols === 3 && P([[1, 1], [1, 1]], 1).cols === 1 && at(P([[1, 1], [1, 1]], 1)) === "[[0,0],[0,1]]", "the column count is the items' total width, capped by the setting");
T.check(js(P([[0, -1], "x", [1.6, 1.4]], 4).spans) === "[[1,1],[1,1],[2,1]]", "bad spans become 1 x 1; others round");

// ---- options validation
var O = MotionKit.options, bounce = MotionKit.tools.bounce;
var v1 = O.validate(bounce, { amplitude: 2, maxJumps: 3.6, gravity: "x", jumpInOut: true, extra: 1 }, false).values;
T.check(v1.amplitude === 1 && v1.maxJumps === 4 && v1.gravity === 5000 && v1.jumpInOut === true && v1.extra === undefined, "lenient options clamp, round and default");
var v2 = O.validate(bounce, { amplitude: 2 }, true);
T.check(v2.errors.length === 1 && /Amplitude must be from 0 to 1/.test(v2.errors[0]), "strict options report the range");
T.check(!O.save(bounce, { amplitude: -1 }).ok && O.get(bounce).amplitude === 0.7, "invalid options aren't saved");
T.check(O.save(bounce, { amplitude: "0.5" }).ok && O.get(bounce).amplitude === 0.5, "valid options are saved (text numbers accepted)");
app.settings.saveSetting("MotionKit", "toolOptions", "[1, 2]");
T.check(O.get(bounce).amplitude === 0.7, "corrupt stored options fall back to defaults");

// ---- registry checks
var before2 = MotionKit.loadErrors.length;
MotionKit.registerTool({ id: "Bad id", name: "", category: "Nowhere", run: 3 });
MotionKit.registerTool({ id: "badOptions", name: "Bad", category: "Rig", description: "x", icon: [], run: function () {}, options: [{ key: "n", type: "number", "default": 5, min: 0, max: 1 }] });
T.check(MotionKit.loadErrors.length === before2 + 2 && !MotionKit.tools.badOptions, "bad tool definitions are recorded and skipped");
MotionKit.loadErrors.length = before2;

// ---- command box search
var S = MotionKit.commandBox.search;
T.check(S("bou")[0].id === "bounce", "search: prefix match");
T.check(S("IN out").length === 1 && S("IN out")[0].id === "loop", "search: every word, any case");
T.check(S("rig null")[0].id === "parentNull", "search: category words count");
T.check(S("zzz").length === 0 && S("   ").length === 0, "search: no match and empty query");

T.done();
