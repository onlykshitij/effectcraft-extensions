// SPDX-License-Identifier: MIT OR Apache-2.0
// UI smoke test: the six dist panels build, every default item has a cell, buttons draw icon
// only, mouse input (click, Shift-click, right-click, drag reorder in edit mode, a drop
// outside the grid) through EffectCraft's ScriptUI event routing, rev polling, the command box,
// the options dialog, the Layout & Style dialog (all tabs) and the icon renderer.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var L = MotionKit.layout, U = MotionKit.helpers.util;
var opened = [], dialogs = [];
MotionKit.ui.openOptions = function (id) { opened.push(id); return null; };
MotionKit.ui.openLayoutDialog = function (p, tab) { dialogs.push([p, tab]); return false; };
function order(p) { return U.map(L.get().panels[p].items, function (x) { return x.id; }).join(","); }
function cellIds(P) { return U.map(P.cells, function (c) { return c.mkId; }).join(","); }

// ---- the dist panels build, each with a button per default tool
var wins = [];
for (var n = 1; n <= 5; n++) {
  var file = n === 5 ? "Motion Kit.jsx" : "extra/Motion Kit " + n + ".jsx";
  var w = $.evalFile(MKT_DIR + "/dist/" + file);
  T.check(w instanceof Window && w.mkPanel && w.mkPanel.index === n - 1, file + " opens a palette for panel " + n + " (" + w.text + ")");
  wins.push(w);
}
var def = L.defaultLayout();
for (var p = 0; p < 5; p++) {
  var P = wins[p].mkPanel, want = U.map(def.panels[p].items, function (x) { return x.id; }).join(",");
  T.check(cellIds(P) === want, "panel " + (p + 1) + " has a button for every default tool: " + want);
}
var P1 = wins[0].mkPanel, P2 = wins[1].mkPanel;
T.check(P1.title.text === "Animate" && P1.layoutList && P1.pencil && P1.gear && P1.commandBox, "panel 1 header: title, layout list, ✎, ⚙, command box");
T.check(!P2.commandBox, "panel 2 has no command box by default");

// Every button draws its icon and no name: the name is in the help tip. With the hover
// highlight (the default) each button draws EffectCraft's native button, then its own frame;
// with hover 0 the grid draws every cell's frame under the cells, in one operation (onDraw runs
// when the host takes a snapshot).
__uiSnapshot();
// The grid's border operation: true when it has one outline starting inside each cell.
function framed(P) {
  var ops = P.grid.__draw || [], R = P.geo.rects;
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].op !== "stroke" || ops[i].width !== 1) continue;
    var starts = U.filter(ops[i].path, function (seg) { return seg.k === "M"; }), hit = 0;
    for (var c = 0; c < P.cells.length; c++) {
      var r = R[c];
      for (var m = 0; m < starts.length; m++) if (starts[m].x >= r[0] && starts[m].x <= r[0] + r[2] && starts[m].y >= r[1] && starts[m].y <= r[1] + r[3]) { hit++; break; }
    }
    return starts.length === P.cells.length && hit === P.cells.length;
  }
  return false;
}
// True when the cells of panels 1-4 all draw the native button and their own frame (own) or none
// of them does (!own).
function cellFrames(own) {
  for (var q = 0; q < 4; q++) {
    var cells = wins[q].mkPanel.cells;
    if (framed(wins[q].mkPanel) === own) return false;
    for (var c = 0; c < cells.length; c++) {
      var ops = cells[c].__draw || [], self = ops.length > 2 && ops[0].op === "os" && ops[1].op === "fill" && ops[2].op === "stroke";
      if (self !== own) return false;
    }
  }
  return true;
}
var drawn = true, texts = false, iconButtons = true;
for (var q = 0; q < 4; q++) {
  var cells = wins[q].mkPanel.cells;
  for (var c = 0; c < cells.length; c++) {
    var ops = cells[c].__draw || [];
    if (!ops.length) drawn = false;
    if (cells[c].type !== "iconbutton") iconButtons = false;
    for (var o = 0; o < ops.length; o++) if (ops[o].op === "text" && ops[o].text) texts = true;
  }
}
T.check(drawn && !texts && cellFrames(true), "every button draws the native button (the hover highlight), its frame and an icon, without a name");
for (q = 0; q < 4; q++) {
  L.save(L.setStyle(L.get(), q, { hover: 0 }));
  wins[q].mkPanel.rebuild();
}
__uiSnapshot();
T.check(cellFrames(false), "hover 0: no native button; the grid draws every frame");
for (q = 0; q < 4; q++) {
  L.save(L.setStyle(L.get(), q, { hover: 40 }));
  wins[q].mkPanel.rebuild();
}
T.check(iconButtons, "every tool button is a custom-drawn iconbutton (so EffectCraft shows its help tip)");
var look = MotionKit.ui.look({ id: "futureTool" }, def.panels[0].style);
T.check(look.missing && look.fg === "#8A8A8A" && look.icon === MotionKit.helpers.icons.builtin.missing, "a tool that isn't installed draws as the grey \"?\" button");
T.check(/not available/i.test(MotionKit.describe("futureTool").description) && /Shift-click/.test(P1.cells[0].helpTip), "help tips: description, options hint, missing explanation");

var menu = $.evalFile(MKT_DIR + "/dist/extra/Motion Kit Menu.jsx");
var M = menu.mkPanel;
// The registered tools of a category, in registration order.
function catIds(cat) { return U.map(U.filter(MotionKit.catalog(), function (x) { return x.category === cat; }), function (x) { return x.id; }).join(","); }
T.check(M && M.catList.items.length === 5 && M.toolList.items.length === M.ids.length && M.ids.join(",") === catIds("Animate"), "menu panel: categories and the Animate tools (" + M.ids.join(",") + ")");
M.catList.selection = 1;
M.catList.notify("onChange");
T.check(M.ids.join(",") === catIds("Rig") && M.optBtn.enabled, "menu panel: Rig lists the Rig tools");
M.runBtn.notify("onClick");
T.check(/open a composition first/.test(T.lastAlert()), "menu Run runs the tool (no comp: " + T.lastAlert() + ")");
M.optBtn.notify("onClick");
T.check(opened.pop() === M.ids[0], "menu Options opens the tool's options");
T.check($.evalFile(MKT_DIR + "/dist/motionkit-lib.jsx") === null, "motionkit-lib.jsx builds no UI");

// ---- mouse input on panel 1
var W1 = wins[0], cw = P1.sz.w, ch = P1.sz.h, sp = P1.sp;
T.check(P1.cols === 4, "panel 1 lays out the style's " + P1.cols + " columns of " + cw + " x " + ch + " px");
// Every button drawn, none outside the column count (a drop once laid out 6 per row).
function rowsFit(P) {
  for (var r = 0; r < P.cells.length; r++) if (P.cells[r].mkGX + P.sz.w > P.cols * (P.sz.w + P.sp)) return false;
  return P.cells.length === P.items().length;
}
T.check(!/mousemove|mouseover|mouseout/.test(JSON.stringify(__uiJson(W1))), "at rest the panel listens to no pointer movement (no hover state)");

// Out of edit mode a drag doesn't reorder (a slider drag must never move a cell).
var unedited = order(0);
T.mouse(W1, P1.cells[0], "mousedown", 10, 10);
T.mouse(W1, P1.cells[1], "mousemove", 10, 10);
T.mouse(W1, P1.cells[2], "mousemove", cw - 3, 10);
T.mouse(W1, P1.cells[2], "mouseup", cw - 3, 10);
T.check(order(0) === unedited && !P1.drag, "without edit mode, dragging doesn't reorder");
T.mouse(W1, P1.pencil, "click", 5, 5);
T.check(P1.editing, "the pencil turns edit mode on");
// Drag bounce (0) to after loop (2): press on it, move over elastic, release near loop's right edge.
T.mouse(W1, P1.cells[0], "mousedown", 10, 10);
T.mouse(W1, P1.cells[1], "mousemove", 10, 10);
T.check(P1.drag && P1.drag.moved && P1.drag.slot === 1, "moving more than 4 px starts a drag (drop slot 1)");
T.mouse(W1, P1.cells[2], "mousemove", cw - 3, 10);
T.check(P1.drag.slot === 3, "the drop slot follows the pointer (slot 3)");
__uiSnapshot();
var ind = false, gops = P1.grid.__draw;
for (var k = 0; k < gops.length; k++) {
  var seg = gops[k].path && gops[k].path[0];
  if (gops[k].op === "fill" && seg && seg.k === "R" && seg.w === 2 && seg.x === P1.cells[3].mkGX && seg.y === P1.cells[3].mkGY) ind = true;
}
T.check(ind, "a drop indicator line is drawn at the slot (the left edge of cell 3)");
T.mouse(W1, P1.cells[2], "mouseup", cw - 3, 10);
T.check(order(0).indexOf("elastic,loop,bounce,easeKeys") === 0, "the drop saves the new order: " + order(0));
T.check(cellIds(P1).indexOf("elastic,loop,bounce,") === 0, "and the panel shows it");
T.check(P1.cols === 4 && rowsFit(P1), "after the drop every button is still shown, " + P1.cols + " per row");
L.save(L.setStyle(L.get(), 0, { columns: 3 }));
P1.refresh();
T.check(P1.cols === 3 && rowsFit(P1), "the Columns style re-lays the grid (3 per row)");
L.save(L.setStyle(L.get(), 0, { columns: 4 }));
P1.refresh();

// A drop outside the grid does nothing.
var before = order(0);
T.mouse(W1, P1.cells[0], "mousedown", 10, 10);
T.mouse(W1, P1.cells[1], "mousemove", 10, 10);
T.mouse(W1, P1.title, "mouseup", 5, 5);
T.check(order(0) === before && P1.drag === null, "releasing outside the grid cancels the drag");
T.mouse(W1, P1.pencil, "click", 5, 5);
T.check(!P1.editing, "the pencil turns edit mode off again");

// Click (a move of 4 px or less) runs; Shift-click and right-click open options.
T.alerts = [];
T.mouse(W1, P1.cells[0], "mousedown", 10, 10);
T.mouse(W1, P1.cells[0], "mousemove", 12, 11);
T.mouse(W1, P1.cells[0], "mouseup", 12, 11);
T.check(/^Elastic: open a composition first/.test(T.lastAlert()), "click runs the tool: " + T.lastAlert());
T.mouse(W1, P1.cells[2], "mousedown", 10, 10, { shiftKey: true });
T.mouse(W1, P1.cells[2], "mouseup", 10, 10, { shiftKey: true });
T.check(opened.pop() === "bounce", "Shift-click opens the options");
T.mouse(W1, P1.cells[1], "mousedown", 10, 10, { button: 2 });
T.mouse(W1, P1.cells[1], "mouseup", 10, 10, { button: 2 });
T.check(opened.pop() === "loop", "right-click opens the options");
// Alt-click on Bounce, Elastic or Loop takes what they wrote off the selection (here there's no
// comp, so it says what to select); on any other tool it explains instead of running it.
T.mouse(W1, P1.cells[0], "mousedown", 10, 10, { altKey: true });
T.mouse(W1, P1.cells[0], "mouseup", 10, 10, { altKey: true });
T.check(/^Elastic: open a composition, then select the properties or layers to take Elastic off/.test(T.lastAlert()), "Alt-click on Elastic removes instead of running: " + T.lastAlert());
T.check(/Alt-click removes it/.test(P1.cells[0].helpTip) && !/Alt-click/.test(P1.cells[3].helpTip), "removable tools say so in their help tip");
T.mouse(W1, P1.cells[3], "mousedown", 10, 10, { altKey: true });
T.mouse(W1, P1.cells[3], "mouseup", 10, 10, { altKey: true });
T.check(/^Ease Keyframes: Alt-click removes what a tool added, and only Bounce, Elastic and Loop In\/Out can do that/.test(T.lastAlert()), "Alt-click on another tool explains instead of running it: " + T.lastAlert());
// A button for a tool this version doesn't have (a layout from a newer version).
L.save(L.addItem(L.get(), 0, "futureTool"));
MotionKit.__tick(P1.key);
var miss = P1.cells.length - 1;
T.check(P1.cells[miss].mkId === "futureTool" && /not available/i.test(P1.cells[miss].helpTip), "a missing tool's button explains itself in its help tip");
T.mouse(W1, P1.cells[miss], "mousedown", 10, 10);
T.mouse(W1, P1.cells[miss], "mouseup", 10, 10);
T.check(/^"futureTool": Not available/.test(T.lastAlert()), "clicking a missing tool explains it");
T.mouse(W1, P1.cells[0], "mousedown", 10, 10);
T.mouse(W1, P1.cells[1], "mouseup", 10, 10);
T.check(opened.length === 0 && /^"futureTool"/.test(T.lastAlert()), "pressing one button and releasing on another does nothing");
L.save(L.removeItem(L.get(), 0, miss));
MotionKit.__tick(P1.key);
P1.gear.notify("onClick");
T.check(dialogs.length === 1 && dialogs[0][0] === 0, "⚙ opens Layout & Style for this panel");

// ---- rev polling: an edit saved elsewhere shows up in every open panel
L.save(L.moveItem(L.get(), 1, 0, 1, 5));
T.check(P2.rev !== MotionKit.settings.rev(), "panel 2 is behind after another panel saved");
T.check(MotionKit.__tick(P2.key) && cellIds(P2) === "parentNull,nullsPoints,sliderToPath,positionTrace,moveAnchor,limb", "its poll task rebuilds it");
L.save(L.setStyle(L.get(), 1, { hideTitle: true, buttonMode: "icon", cellSize: 30 }));
MotionKit.__tick(P2.key);
T.check(P2.body.children[0] === P2.grid && !P2.header && P2.sz.w === 30 && P2.sz.h === 30, "hideTitle drops the title row; icon mode cells are cellSize square");
L.add("Alt", "empty");
MotionKit.__tick(P1.key);
T.check(P1.cells.length === 0 && P1.layoutList.selection.text === "Alt", "switching layouts elsewhere: the panel follows (empty layout)");
P1.layoutList.selection = 0;
P1.layoutList.notify("onChange");
T.check(L.active() === "Default" && P1.cells.length === 8, "the header's layout list switches back");

// Every button mode paints: icon only, name only, icon and name (wide), compact (name beside).
var modes = [["icon", 44, false], ["name", 44, true], ["iconName", 44, true], ["iconName", 28, true]];
for (var mi = 0; mi < modes.length; mi++) {
  L.save(L.setStyle(L.get(), 3, { buttonMode: modes[mi][0], cellSize: modes[mi][1], cellBorder: "#555555", panelBg: "#202020" }));
  MotionKit.__tick(wins[3].mkPanel.key);
  __uiSnapshot();
  var cl = wins[3].mkPanel.cells[0], anyText = false;
  for (var z = 0; z < cl.__draw.length; z++) if (cl.__draw[z].op === "text") anyText = true;
  var sz = MotionKit.ui.cellSize(L.get().panels[3].style);
  T.check(anyText === modes[mi][2] && cl.preferredSize[0] === sz.w && cl.preferredSize[1] === sz.h, "mode " + modes[mi][0] + " at " + modes[mi][1] + " px: " + sz.w + " x " + sz.h + (anyText ? " with" : " without") + " a name");
}
T.check(MotionKit.ui.cellSize({ cellSize: 28, buttonMode: "iconName" }).compact && !MotionKit.ui.cellSize({ cellSize: 40, buttonMode: "iconName" }).compact, "names go beside the icon at 32 px or less");

// ---- command box
var cb = P1.commandBox;
cb.edit.text = "elas";
cb.edit.notify("onChanging");
T.check(cb.matches.length === 1 && /Elastic/.test(cb.hint.text), "typing filters the matches: " + cb.hint.text);
T.alerts = [];
cb.edit.notify("onChange");
T.check(/^Elastic: open a composition first/.test(T.lastAlert()) && cb.edit.text === "", "Enter runs the first match and clears the box");
cb.edit.text = "zzz";
cb.edit.notify("onChanging");
T.check(cb.hint.text === "no match", "no match says so");
cb.clear.notify("onClick");
T.check(cb.edit.text === "" && cb.hint.text === "", "× clears it");

// ---- closing a panel stops its poll task
var key4 = wins[3].mkPanel.key;
wins[3].close();
T.check(!MotionKit.__tick(key4) && wins[3].mkPanel.closed, "onClose cancels the panel's poll task");

// ---- the options dialog (built, not shown: a modal show() blocks headless)
var od = MotionKit.optionsDialog.build(MotionKit.tools.bounce, MotionKit.options.get("bounce"));
T.check(od.inputs.hopHeight.control.text === "20" && od.inputs.jumpInOut.control.type === "checkbox", "fields show the saved values");
od.inputs.hopHeight.control.text = "500";
T.alerts = [];
var okBtn = null, saveBtn = null, defBtn = null;
(function walk(x) {
  if (x.type === "button" && x.text === "OK") okBtn = x;
  if (x.type === "button" && x.text === "Save") saveBtn = x;
  if (x.type === "button" && x.text === "Defaults") defBtn = x;
  for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
})(od.win);
okBtn.notify("onClick");
T.check(od.action === null && /Amplitude must be from 0 to 200/.test(T.lastAlert()), "OK with a bad value explains and stays open");
od.inputs.hopHeight.control.text = "35";
od.inputs.jumpInOut.control.value = true;
okBtn.notify("onClick");
T.check(od.action === "run" && MotionKit.options.get("bounce").hopHeight === 35 && MotionKit.options.get("bounce").jumpInOut === true, "OK saves the options and asks to run");
var od2 = MotionKit.optionsDialog.build(MotionKit.tools.loop, MotionKit.options.get("loop"));
od2.inputs.type.control.selection = 1;
od2.inputs.side.control.selection = 2;
(function walk(x) { if (x.type === "button" && x.text === "Save") saveBtn = x; for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]); })(od2.win);
saveBtn.notify("onClick");
T.check(od2.action === "save" && MotionKit.options.get("loop").type === "pingpong" && MotionKit.options.get("loop").side === "both", "Save keeps dropdown choices without running");
defBtn.notify("onClick");
T.check(od.inputs.hopHeight.control.text === "20" && od.inputs.jumpInOut.control.value === false, "Defaults resets the fields");

// ---- the Layout & Style dialog (built, not shown)
var stored = JSON.stringify(L.state());
var LD = MotionKit.layoutDialog, RH = LD.ROW_H;
var D = LD.build(0);
T.check(D.tabs.children.length === 5 && D.lists.length === 5 && D.titles[0].text === "1. Animate" && D.titles[4].text === "5. Motion Kit", "five tabs; five columns titled by panel");
T.mouse(D.win, D.lists[0], "mousedown", 20, RH + 5);
T.mouse(D.win, D.lists[0], "mouseup", 20, RH + 5);
T.check(D.panel === 0 && D.sel === 1 && D.btnUp.enabled && D.btnRemove.enabled, "clicking a row selects it");
D.btnDown.notify("onClick");
T.check(D.sel === 2 && D.pc(0).items[2].id === "loop", "↓ moves it down");
D.btnRight.notify("onClick");
T.check(D.panel === 1 && D.pc(1).items[2].id === "loop" && D.pc(0).items.length === 7, "→ moves it to the next panel");
D.btnLeft.notify("onClick");
D.btnUp.notify("onClick");
T.check(D.panel === 0 && D.pc(0).items[1].id === "loop", "← and ↑ move it back");
// Drag from column 1 row 0 to column 3 between its rows 0 and 1.
T.mouse(D.win, D.lists[0], "mousedown", 20, 5);
T.mouse(D.win, D.lists[2], "mousemove", 20, RH + 2);
T.check(D.drag && D.drag.moved && D.drag.to === 2 && D.drag.slot === 1, "dragging over another column shows the drop slot");
T.mouse(D.win, D.lists[2], "mouseup", 20, RH + 2);
T.check(D.pc(2).items[1].id === "elastic" && D.panel === 2 && D.sel === 1, "dropping moves a button between panels");
D.btnRemove.notify("onClick");
T.check(MotionKit.layout.findId(D.pc(2).items, "elastic") < 0, "Remove takes it out");
var at = U.indexOf(D.addIds, "elastic");
T.check(at >= 0 && U.indexOf(D.addIds, "extractShapes") < 0 && U.indexOf(D.addIds, "ease") >= 0, "Add lists tools and widgets not yet in the panel");
D.addList.selection = at;
D.btnAdd.notify("onClick");
T.check(D.pc(2).items[D.sel].id === "elastic", "Add puts it after the selection");
D.titleEdit.text = "Shape Tools";
D.btnRename.notify("onClick");
T.check(D.pc(2).title === "Shape Tools" && D.titles[2].text === "3. Shape Tools", "Rename Panel");

// Style tab (for the chosen panel).
D.styleCell.text = "60";
D.styleCell.notify("onChange");
T.check(D.pc(2).style.cellSize === 60, "Style: cell size");
T.alerts = [];
D.styleCell.text = "500";
D.styleCell.notify("onChange");
T.check(D.pc(2).style.cellSize === 60 && /24 to 96/.test(T.lastAlert()) && D.styleCell.text === "60", "Style: an out-of-range size is refused");
D.styleCellBg.edit.text = "#123";
D.styleCellBg.edit.notify("onChange");
T.check(D.pc(2).style.cellBg === "#112233" && D.styleCellBg.edit.text === "#112233", "Style: hex colour with swatch");
D.stylePanelBg.edit.text = "";
D.stylePanelBg.edit.notify("onChange");
T.check(D.pc(2).style.panelBg === null, "Style: empty panel background is the theme colour");
D.styleMode.selection = 0;
D.styleMode.notify("onChange");
D.styleHide.value = true;
D.styleHide.notify("onClick");
D.styleCmd.value = true;
D.styleCmd.notify("onClick");
var s2 = D.pc(2).style;
T.check(s2.buttonMode === "icon" && s2.hideTitle && s2.showCommandBox, "Style: button mode, hide title, command box");
D.stylePanel.selection = 0;
D.stylePanel.notify("onChange");
T.check(D.panel === 0 && D.styleCell.text === "56", "Style: the panel list switches which panel is edited");
D.styleAccent.edit.text = "#00ccff";
D.styleAccent.edit.notify("onChange");
D.styleRadius.text = "12";
D.styleRadius.notify("onChange");
D.styleHover.text = "0";
D.styleHover.notify("onChange");
T.check(D.pc(0).style.accent === "#00CCFF" && D.pc(0).style.radius === 12 && D.pc(0).style.hover === 0, "Style: accent colour, corner radius and hover highlight");

// Button tab.
T.mouse(D.win, D.lists[0], "mousedown", 20, 5);
T.mouse(D.win, D.lists[0], "mouseup", 20, 5);
D.btnName.text = "Hop";
D.btnName.notify("onChange");
D.btnAccent.edit.text = "#00ff00";
D.btnAccent.edit.notify("onChange");
D.btnShowName.value = false;
D.btnShowName.notify("onClick");
var it0 = D.pc(0).items[0];
T.check(it0.name === "Hop" && it0.accent === "#00FF00" && it0.showName === false && /Hop/.test(D.btnInfo.text), "Button: name, accent and show-name overrides");
D.btnReset.notify("onClick");
it0 = D.pc(0).items[0];
T.check(it0.name === undefined && it0.accent === undefined && it0.showName === undefined, "Button: Reset clears the overrides");

// Library tab.
var libItem = D.libAdd("expression");
D.libName.text = "Wobble";
D.libName.notify("onChange");
D.libCode.text = "wiggle(1, 5)";
D.libCode.notify("onChange");
D.libPng.text = "/no/such/icon.png";
D.libPng.notify("onChange");
var li = D.st.library[D.libSel];
T.check(li.name === "Wobble" && li.code === "wiggle(1, 5)" && li.icon === "png" && /^lib:/.test(li.id), "Library: a new expression item with a PNG icon");
T.check(MotionKit.library.imageOf(li) === null && MotionKit.ui.look({ id: li.id }, def.panels[0].style, D.st.library).icon === MotionKit.helpers.icons.builtin.libExpression, "an unreadable PNG falls back to the built-in icon");
D.libIcon.selection = U.indexOf(D.libIconIds, "tool:bounce");
D.libIcon.notify("onChange");
T.check(D.st.library[D.libSel].icon === "tool:bounce", "Library: any tool icon can be picked");
D.btnLibScript.notify("onClick");
T.check(D.st.library.length === 2 && D.st.library[1].kind === "script" && D.libTarget.enabled === false && D.libPath.enabled, "Library: a script item (script fields on, target off)");
D.addList.selection = U.indexOf(D.addIds, li.id);
D.btnAdd.notify("onClick");
T.check(MotionKit.layout.findId(D.pc(0).items, li.id) >= 0, "library items go in panels like tools");
D.btnLibDelete.notify("onClick");
T.check(D.st.library.length === 1, "Library: Delete Item");

// Layouts tab.
D.layoutName.text = "Second";
D.btnLayoutAdd.notify("onClick");
T.check(D.st.active === "Second" && D.layoutNames.join(",") === "Default,Alt,Second" && D.pc(0).items.length === 0, "Layouts: Add Empty (becomes the edited layout)");
D.layoutList.selection = 0;
D.layoutList.notify("onChange");
T.check(D.st.active === "Default", "Layouts: picking one in the list switches to it");
D.btnLayoutDup.notify("onClick");
T.check(D.st.active === "Default copy" && D.pc(0).items.length === D.st.layouts.Default.panels[0].items.length, "Layouts: Duplicate Current");
D.layoutName.text = "Spare";
D.btnLayoutRename.notify("onClick");
T.check(D.st.active === "Spare", "Layouts: Rename");
D.btnLayoutDelete.notify("onClick");
T.check(D.layoutNames.join(",") === "Default,Alt,Second", "Layouts: Delete");
D.btnLayoutReset.notify("onClick");
T.check(JSON.stringify(D.layout()) === JSON.stringify(L.defaultLayout()), "Layouts: Reset to Default");
D.importText(L.exportJson(), "merge");
T.check(U.indexOf(D.layoutNames, "Default 2") >= 0, "Layouts: Load from a file's text, merged");
T.check(JSON.stringify(L.state()) === stored, "nothing is saved before OK");
D.cancel();
T.check(JSON.stringify(L.state()) === stored, "Cancel discards every edit");

var D2 = LD.build(1, "style");
T.check(D2.tabs.selection === D2.tab.style && D2.panel === 1, "the dialog can open on a tab for a panel");
T.mouse(D2.win, D2.lists[1], "mousedown", 20, 5);
T.mouse(D2.win, D2.lists[1], "mouseup", 20, 5);
D2.btnRight.notify("onClick");
D2.ok();
T.check(D2.action === "ok" && order(2).indexOf("parentNull") === 0 && JSON.stringify(L.state()) === JSON.stringify(MotionKit.layout.normState(D2.st)), "OK saves the edited state");
MotionKit.__tick(P1.key);
T.check(P1.rev === MotionKit.settings.rev(), "open panels pick it up on their next poll");

// ---- icons: every icon parses, stays in its square, and the geometry helpers flatten curves
var G = MotionKit.helpers.icons.geom;
var q = G.quad([0, 0], [5, 10], [10, 0]);
var q2 = G.quad([0, 0], [5, 10], [10, 0], 6);
T.check(q.length === 5 && T.near(q[4], [10, 0]) && q2.length === 6 && T.near(q2[2], [5, 5]), "quadratic flattened to 5 segments by default, any count on request, through the curve's midpoint");
var cu = G.cubic([0, 0], [0, 10], [10, 10], [10, 0], 8);
T.check(cu.length === 8 && T.near(cu[7], [10, 0]) && T.near(cu[3], [5, 7.5]), "cubic flattened (8 segments here)");
var arc = G.arc(0, 0, 10, 10, 0, 90);
T.check(T.near(arc[0], [10, 0]) && T.near(arc[arc.length - 1], [0, 10]), "arc runs from a0 to a1 clockwise on screen");
var rr = G.roundRect(0, 0, 20, 10, 3);
var inside = true;
for (var ri = 0; ri < rr.length; ri++) if (rr[ri][0] < -1e-9 || rr[ri][0] > 20 + 1e-9 || rr[ri][1] < -1e-9 || rr[ri][1] > 10 + 1e-9) inside = false;
T.check(rr.length > 8 && inside, "rounded rect stays in its box");
function recorder() {
  var g = { ops: [], pts: [], BrushType: { SOLID_COLOR: 0 }, PenType: { SOLID_COLOR: 0 } };
  g.newPath = function () {};
  g.moveTo = g.lineTo = function (x, y) { g.pts.push([x, y]); };
  g.ellipsePath = function (x, y, w, h) { g.pts.push([x, y], [x + w, y + h]); };
  g.closePath = function () {};
  g.newPen = g.newBrush = function (t, c, w) { return { c: c, w: w }; };
  g.fillPath = function () { g.ops.push("fill"); };
  g.strokePath = function () { g.ops.push("stroke"); };
  return g;
}
var icons = [];
for (var ti = 0; ti < MotionKit.toolOrder.length; ti++) icons.push([MotionKit.toolOrder[ti], MotionKit.tools[MotionKit.toolOrder[ti]].icon]);
var bi = MotionKit.helpers.icons.builtin;
for (var bk in bi) if (U.has(bi, bk)) icons.push([bk, bi[bk]]);
for (var ii = 0; ii < icons.length; ii++) {
  var g = recorder();
  MotionKit.helpers.icons.draw(g, icons[ii][1], 10, 20, 24, "#D8D8D8", "#F28C28");
  var ok = g.ops.length > 0 && g.pts.length > 2, accent = false;
  for (var pi = 0; pi < g.pts.length; pi++) if (!(g.pts[pi][0] >= 10 && g.pts[pi][0] <= 34 && g.pts[pi][1] >= 20 && g.pts[pi][1] <= 44)) ok = false;
  T.check(ok, "icon " + icons[ii][0] + " draws inside its 24 px square (" + g.ops.length + " paths)");
}

// ---- a run that worked with warnings shows its message (what it skipped); quiet runs don't
MotionKit.registerTool({
  id: "warnProbe", name: "Warn Probe", category: "Rig", description: "Warns when asked.", icon: ["M3 3 H21"], needsComp: false,
  options: [{ key: "warn", label: "Warn", type: "checkbox", "default": true }],
  run: function (ctx, o) {
    if (o.warn) ctx.warn("Skipped 1 thing.");
    return ctx.done("Warn Probe: did 2 things.");
  }
});
T.alerts = [];
var wr = MotionKit.run("warnProbe");
T.check(wr.ok && wr.warnings.length === 1 && T.alerts.length === 1 && T.alerts[0] === "Warn Probe: did 2 things.\nSkipped 1 thing.", "a run that worked with a warning shows its message: " + T.alerts.join(" // "));
MotionKit.run("warnProbe", null, true);
MotionKit.run("warnProbe", { warn: false });
T.check(T.alerts.length === 1, "quiet runs, and runs without warnings, show nothing");

T.done();
