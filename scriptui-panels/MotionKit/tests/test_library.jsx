// SPDX-License-Identifier: MIT OR Apache-2.0
// User library: expression items (apply / add as text), script items (inline, linked file,
// errors), validation, and items as buttons.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var Lib = MotionKit.library;

T.check(Lib.normalizeList([{ id: "lib:a", kind: "expression", name: "A" }, { id: "lib:a", kind: "script" }, { id: "x", kind: "script" }, { id: "lib:b", kind: "macro" }, null]).length === 1,
  "invalid and repeated items are dropped");
var n = Lib.normalize({ id: "lib:c", kind: "script", name: "", source: "ftp", icon: "tool:", bg: "red", accent: "#abc" });
T.check(n.name === "Untitled" && n.source === "inline" && n.icon === "builtin" && n.bg === undefined && n.accent === "#AABBCC", "item fields are validated");

var comp = T.comp("Library Test", 1200, 600);
var lay = T.solid(comp, "Target", 100, 100);
var rot = lay.transform.rotation, op = lay.transform.opacity;

var ex = Lib.save(Lib.create("expression", { name: "Tenth Width", code: "thisComp.width / 10" }));
T.check(/^lib:[0-9a-f]{10}$/.test(ex.id) && Lib.list().length === 1, "a saved expression item gets a lib: id");
T.select(comp, [lay], []);
var none = MotionKit.run(ex.id);
T.check(!none.ok && /select one or more properties/.test(none.message), "no properties selected: refused (" + none.message + ")");
T.select(comp, [lay], [rot, op]);
var r = MotionKit.run(ex.id);
T.check(r.ok && r.message === "Applied Tenth Width to 2 properties.", "applies to every selected property: " + r.message);
T.check(rot.expression === "thisComp.width / 10" && T.near(rot.valueAtTime(0, false), 120) && op.expression === rot.expression, "the expression works");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(rot.expression === "" && op.expression === "", "one undo step");

var tx = Lib.save(Lib.create("expression", { name: "Draft", code: "value * 2", target: "text" }));
T.select(comp, [lay], [rot]);
r = MotionKit.run(tx.id);
T.check(r.ok && rot.expression === "value * 2" && !rot.expressionEnabled && T.near(rot.valueAtTime(0, false), 0), "add as text: the expression is there, switched off, for the user to edit");
var empty = Lib.save(Lib.create("expression", { name: "Empty" }));
T.check(!MotionKit.run(empty.id).ok, "an item without expression text is refused");

var sc = Lib.save(Lib.create("script", { name: "Set Global", code: "var mkScoped = 7; $.global.mkRan = (typeof MK === 'undefined') ? 'global' : 'inside';" }));
r = MotionKit.run(sc.id);
T.check(r.ok && $.global.mkRan === "global" && $.global.mkScoped === 7, "inline script runs in the global scope: " + r.message);
var boom = Lib.save(Lib.create("script", { name: "Boom", code: "throw new Error('boom')" }));
r = MotionKit.run(boom.id);
T.check(!r.ok && /Boom failed: boom/.test(r.message) && /boom/.test(T.lastAlert()), "a failing script is reported, not thrown: " + r.message);
var file = Lib.save(Lib.create("script", { name: "Linked", source: "file", path: MKT_DIR + "/fixture_script.jsx" }));
r = MotionKit.run(file.id);
T.check(r.ok && $.global.mkFileRan === 1, "a linked .jsx runs with $.evalFile");
var gone = Lib.save(Lib.create("script", { name: "Gone", source: "file", path: MKT_DIR + "/no_such_script.jsx" }));
T.check(!MotionKit.run(gone.id).ok, "a missing linked file is reported");
T.check(!MotionKit.run("lib:doesnotexist").ok, "an unknown library id is reported");

// Items are buttons.
var L = MotionKit.layout;
L.save(L.addItem(L.get(), 0, ex.id, 0));
var look = MotionKit.ui.look(L.get().panels[0].items[0], L.get().panels[0].style);
T.check(look.name === "Tenth Width" && look.accent === "#9AA0A6" && !look.missing && look.icon === MotionKit.helpers.icons.builtin.libExpression, "a library button: its name, grey accent, braces icon");
T.check(MotionKit.ui.look({ id: sc.id }, L.get().panels[0].style).icon === MotionKit.helpers.icons.builtin.libScript, "script items show the prompt icon");
var styled = Lib.save(Lib.normalize({ id: sc.id, kind: "script", name: "Set Global", code: "1", icon: "tool:loop", accent: "#FF0000", bg: "#000000" }));
var sl = MotionKit.ui.look({ id: sc.id }, L.get().panels[0].style);
T.check(sl.icon === MotionKit.tools.loop.icon && sl.accent === "#FF0000" && sl.bg === "#000000", "an item's own icon and colours");
T.check(MotionKit.commandBox.search("tenth")[0].id === ex.id, "the command box finds library items");
T.done();
