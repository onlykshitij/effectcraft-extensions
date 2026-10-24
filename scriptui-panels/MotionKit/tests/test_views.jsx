// SPDX-License-Identifier: MIT OR Apache-2.0
// Views: Motion Kit.jsx takes one Window menu entry and switches, in place, between the combined
// panel, panels 1-4 and the menu. Each switch shows the right content, closes the old view,
// keeps help tips and edit mode working, and is remembered (without making other panels
// rebuild). The single panels in dist/extra/ have no switcher, and the run_all staging has them.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var L = MotionKit.layout, U = MotionKit.helpers.util, UI = MotionKit.ui;
function ids(P) { return U.map(P.cells, function (c) { return c.mkId; }).join(","); }
function want(p) { return U.map(L.defaultLayout().panels[p].items, function (x) { return x.id; }).join(","); }
var INTERACTIVE = { iconbutton: 1, button: 1, edittext: 1, dropdownlist: 1, listbox: 1, checkbox: 1, radiobutton: 1, slider: 1 };
function untipped(w) {
  var out = [];
  (function walk(x) {
    if (INTERACTIVE[x.type] && !U.trim(x.helpTip)) out.push(x.type + " " + (x.mkRole || x.text || ""));
    for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
  })(w);
  return out;
}
function pick(P, view) {
  P.viewList.selection = U.indexOf(UI.VIEWS, view);
  P.viewList.notify("onChange");
}

// ---- the files: one to install, the single panels as extras
// (File.exists answers false headless, so each file is loaded: a panel file opens a palette.)
function load(name) {
  try {
    return $.evalFile(MKT_DIR + "/dist/" + name);
  } catch (e) {
    return "missing";
  }
}
var files = ["Motion Kit.jsx", "extra/Motion Kit 1.jsx", "extra/Motion Kit 2.jsx", "extra/Motion Kit 3.jsx", "extra/Motion Kit 4.jsx", "extra/Motion Kit Menu.jsx"], found = load("motionkit-lib.jsx") === null;
for (var f = 0; f < files.length; f++) {
  var w0 = load(files[f]);
  if (!(w0 instanceof Window)) found = false;
  else w0.close();
}
T.check(found && load("Motion Kit 1.jsx") === "missing", "the staging has Motion Kit.jsx, the library and the five extras in dist/extra/ (and no single panel at the top)");
MotionKit.settings.setQuiet(UI.VIEW_KEY, null);

// ---- Motion Kit.jsx opens on the combined view
T.check(MotionKit.settings.get(UI.VIEW_KEY, null) === null, "no view saved");
var win = $.evalFile(MKT_DIR + "/dist/Motion Kit.jsx"), P = win.mkPanel;
T.check(P.index === 4 && P.views.view === "combined" && ids(P) === want(4), "it starts on the combined view");
T.check(P.viewList && P.viewList.items.length === 6 && U.map(P.viewList.items, function (x) { return x.text; }).join(",") === "Combined,Animate,Rig,Shapes,Comp,Menu" &&
  P.viewList.selection.index === 0 && P.layoutList && P.viewList !== P.layoutList, "the header has a view list (Combined, the four panels, Menu) beside the layout list");

// ---- every view: the right content, help tips, edit mode
var rev = MotionKit.settings.rev();
for (var v = 1; v < 5; v++) {
  var old = P, oldKey = P.key;
  pick(P, UI.VIEWS[v]);
  P = win.mkPanel;
  T.check(P !== old && old.closed && !MotionKit.__tick(oldKey) && win.children.length === 1, UI.VIEWS[v] + ": the old view is closed and its controls gone");
  T.check(P.index === v - 1 && ids(P) === want(v - 1) && P.viewList.selection.index === v && P.title.text === L.get().panels[v - 1].title, UI.VIEWS[v] + " shows panel " + v + ": " + ids(P));
  T.check(MotionKit.settings.get(UI.VIEW_KEY) === UI.VIEWS[v] && MotionKit.settings.rev() === rev, "the choice is saved without bumping rev (other panels don't rebuild)");
  T.check(!untipped(win).length, UI.VIEWS[v] + ": every interactive control has a help tip " + untipped(win).join("; "));
  T.mouse(win, P.pencil, "click", 5, 5);
  T.check(P.editing && P.removeButtons.length === P.items().length && P.addCell && !untipped(win).length, UI.VIEWS[v] + ": edit mode works, with help tips");
  T.mouse(win, P.pencil, "click", 5, 5);
  T.check(!P.editing, UI.VIEWS[v] + ": and turns off");
}
T.alerts = [];
T.mouse(win, P.cells[0], "mousedown", 10, 10);
T.mouse(win, P.cells[0], "mouseup", 10, 10);
T.check(/^Crop Comp: open a composition first/.test(T.lastAlert()), "a view's buttons run their tools: " + T.lastAlert());

// The menu view, and back.
pick(P, "menu");
var M = win.mkPanel;
T.check(M.catList && M.toolList && M.runBtn && M.viewList && M.viewList.selection.index === 5 && MotionKit.settings.get(UI.VIEW_KEY) === "menu" && P.closed, "the menu view shows the menu widget, with the view list");
T.check(!untipped(win).length, "menu: every interactive control has a help tip " + untipped(win).join("; "));
M.runBtn.notify("onClick");
T.check(/open a composition first/.test(T.lastAlert()), "menu: Run runs the chosen tool");
pick(M, "combined");
P = win.mkPanel;
T.check(M.closed && P.index === 4 && ids(P) === want(4) && P.widgets.length === 5 && P.viewList.selection.index === 0, "and back to the combined view, widgets and all");
T.mouse(win, P.pencil, "click", 5, 5);
T.check(P.editing && P.removeButtons.length === 27 && !untipped(win).length, "combined: edit mode and help tips");
T.mouse(win, P.pencil, "click", 5, 5);

// ---- the choice persists, and survives rebuilds
pick(P, "shapes");
var again = $.evalFile(MKT_DIR + "/dist/Motion Kit.jsx");
T.check(again.mkPanel.index === 2 && again.mkPanel.views.view === "shapes", "a new Motion Kit.jsx opens on the saved view");
again.close();
L.save(L.renamePanel(L.get(), 2, "Vectors"));
P = win.mkPanel;
MotionKit.__tick(P.key);
T.check(P.viewList && P.viewList.items[3].text === "Vectors" && P.title.text === "Vectors" && P.index === 2, "a settings change rebuilds the view with its switcher (and the new panel title)");
MotionKit.settings.setQuiet(UI.VIEW_KEY, "nonsense");
var odd = $.evalFile(MKT_DIR + "/dist/Motion Kit.jsx");
T.check(odd.mkPanel.index === 4 && odd.mkPanel.views.view === "combined", "an unknown saved view opens the combined one");
odd.close();
win.close();
T.check(win.mkPanel.closed, "closing the window closes the view it shows");

// ---- the extras have no switcher
var one = $.evalFile(MKT_DIR + "/dist/extra/Motion Kit 1.jsx"), menu = $.evalFile(MKT_DIR + "/dist/extra/Motion Kit Menu.jsx");
T.check(!one.mkPanel.views && !one.mkPanel.viewList && one.mkPanel.header.preferredSize[1] === UI.HEADER_H && one.mkPanel.index === 0, "a single panel from dist/extra/ has a one-row header and no view list");
T.check(!menu.mkPanel.viewList && menu.mkPanel.catList, "nor has the extra menu panel");

T.done();
