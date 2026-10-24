// SPDX-License-Identifier: MIT OR Apache-2.0
// Layout model: every operation, named layouts, export/import, invalid input, unknown ids,
// settings validation, options validation and the command box search.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var L = MotionKit.layout;
function ids(l, p) { var a = []; for (var i = 0; i < l.panels[p].items.length; i++) a.push(l.panels[p].items[i].id); return a.join(","); }
function js(v) { return JSON.stringify(v); }

// ---- the default layout
var d = L.defaultLayout();
T.check(d.panels.length === 4, "four panels");
T.check(d.panels[0].title === "Animate" && ids(d, 0) === "bounce,elastic,loop,easeKeys,easeCopy,sequencer,cloneKeys,fixKeys", "panel 1 Animate in spec order");
T.check(d.panels[1].title === "Rig" && ids(d, 1) === "limb,parentNull,nullsPoints,sliderToPath,positionTrace,moveAnchor", "panel 2 Rig in spec order");
T.check(d.panels[2].title === "Shapes" && ids(d, 2) === "extractShapes,mergeShapes,selector,strokeStyle,shapesFromVector,collectColors", "panel 3 Shapes in spec order");
T.check(d.panels[3].title === "Comp" && ids(d, 3) === "cropComp,unprecomp,duplicateComp,gifExport", "panel 4 Comp in spec order");
var s0 = d.panels[0].style, s1 = d.panels[1].style;
T.check(s0.cellSize === 44 && s0.spacing === 4 && s0.panelBg === null && s0.cellBg === "#2B2B2B" && s0.cellBorder === null &&
  s0.buttonMode === "iconName" && s0.hideTitle === false && s0.fg === "#D8D8D8" && s0.columns === 4, "default style values");
T.check(s0.showCommandBox === true && s1.showCommandBox === false, "command box on panel 1 only");

// ---- normalize: every value validated, unknown ids kept
var bad = {
  panels: [
    { title: "  ", style: { cellSize: 500, spacing: -3, columns: 99, panelBg: "#abc", cellBg: "nope", cellBorder: "#00ff00", buttonMode: "huge", hideTitle: "yes", fg: 12, showCommandBox: 0 },
      items: ["bounce", { id: "futureTool", name: "Future", showIcon: false, bg: "#zzzzzz", accent: "#112233" }, { id: "" }, null, 5, "bounce"] },
    "junk"
  ]
};
var n = L.normalize(bad);
var ns = n.panels[0].style;
T.check(n.panels.length === 4 && n.panels[0].title === "Panel 1" && n.panels[1].title === "Panel 2", "missing and blank panels get defaults");
T.check(ns.cellSize === 96 && ns.spacing === 0 && ns.columns === 12, "numbers clamped (cellSize 96, spacing 0, columns 12)");
T.check(ns.panelBg === "#AABBCC" && ns.cellBg === "#2B2B2B" && ns.cellBorder === "#00FF00" && ns.fg === "#D8D8D8", "colours normalised or defaulted");
T.check(ns.buttonMode === "iconName" && ns.hideTitle === false && ns.showCommandBox === true, "bad enums and booleans defaulted");
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
T.throws(function () { L.moveItem(d, 4, 0, 0, 0); }, "moveItem refuses a bad panel");

var a1 = L.addItem(d, 3, "parentNull");
T.check(ids(a1, 3) === "cropComp,unprecomp,duplicateComp,gifExport,parentNull", "addItem appends");
var a2 = L.addItem(d, 3, "bounce", 1);
T.check(ids(a2, 3) === "cropComp,bounce,unprecomp,duplicateComp,gifExport", "addItem at an index");
T.check(js(L.addItem(a2, 3, "bounce", 0)) === js(a2), "addItem with an id already there changes nothing");
T.throws(function () { L.addItem(d, 0, ""); }, "addItem needs an id");
var r1 = L.removeItem(d, 3, 0);
T.check(ids(r1, 3) === "unprecomp,duplicateComp,gifExport", "removeItem");
T.throws(function () { L.removeItem(d, 3, 4); }, "removeItem refuses a bad index");

var st1 = L.setStyle(d, 2, { cellSize: 30, buttonMode: "icon", panelBg: "#102030", cellBorder: null, spacing: "wide", fg: "#nothex" });
var ss = st1.panels[2].style;
T.check(ss.cellSize === 30 && ss.buttonMode === "icon" && ss.panelBg === "#102030", "setStyle merges valid values");
T.check(ss.spacing === 4 && ss.fg === "#D8D8D8" && ss.cellBg === "#2B2B2B", "setStyle keeps current values for invalid input");
T.check(d.panels[2].style.cellSize === 44, "setStyle leaves its input alone");
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
T.check(js(L.list()) === "[\"Odd\"]" && L.get().panels[0].style.cellSize === 44, "invalid names dropped, invalid values defaulted");

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
