// SPDX-License-Identifier: MIT OR Apache-2.0
// Panels: the combined panel's packed grid, panels laid out to their content (the root bounds
// EffectCraft reports are the header plus the packed grid), edit mode (no reorder when off,
// reorder when on, the remove button, the "+" cell and its Add list), a click running a tool
// exactly once in the order the host sends events, a help tip on every interactive control of
// every panel, and the work a redraw costs: no pointer-movement events at rest (mousemove only
// during a drag), few path points, and settings checked on every press.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var L = MotionKit.layout, U = MotionKit.helpers.util, UI = MotionKit.ui;
var opened = [];
UI.openOptions = function (id) { opened.push(id); return null; };
function order(p) { return U.map(L.get().panels[p].items, function (x) { return x.id; }).join(","); }
function size(w) {
  w.layout.layout(true);
  return [w.size[0], w.size[1]];
}

var wins = [];
for (var n = 1; n <= 4; n++) wins.push($.evalFile(MKT_DIR + "/dist/extra/Motion Kit " + n + ".jsx"));
wins.push($.evalFile(MKT_DIR + "/dist/Motion Kit.jsx"));
var W5 = wins[4], P5 = W5.mkPanel, W4 = wins[3], P4 = W4.mkPanel;
var style = L.get().panels[4].style, c = style.cellSize, sp = style.spacing, H = UI.HEADER_H;

// ---- the combined panel: widgets packed first, 1 x 1 tools filling the holes beside them
T.check(W5.text === "Motion Kit" && P5.index === 4 && P5.title.text === "Motion Kit", "Motion Kit.jsx is panel 5, titled Motion Kit");
var a = c + sp;
var want = [[0, 0, 2 * c + sp, 2 * c + sp], [2 * a, 0, 2 * c + sp, c], [2 * a, a, 2 * c + sp, c], [0, 2 * a, 2 * c + sp, 2 * c + sp], [2 * a, 2 * a, 2 * c + sp, c], [2 * a, 3 * a, c, c], [3 * a, 3 * a, c, c], [0, 4 * a, c, c]];
T.check(JSON.stringify(P5.geo.rects.slice(0, 8)) === JSON.stringify(want), "ease 2x2, copy/paste 2x1, interpolation 2x1, anchor 2x2, sequencer 2x1, then bounce and elastic beside the anchor");
var kinds = U.map(P5.cells.slice(0, 6), function (x) { return x.type; }).join(",");
T.check(kinds === "group,group,group,group,group,iconbutton" && P5.widgets.length === 5, "widgets are groups of parts; tools are iconbuttons (" + kinds + ")");

// ---- panels fit their content
var s4 = size(W4), s5 = size(W5);
T.check(P4.cols === 4 && P4.geo.w === 4 * c + 3 * sp && P4.geo.h === c, "the 4-tool panel's grid is 4 cells wide, one row");
T.check(s4[0] === 4 * c + 3 * sp + 2 * sp && s4[1] === sp + H + sp + c + sp && s4[0] === 274 && s4[1] === 110, "its root bounds are the header plus the grid plus margins: " + s4.join(" x "));
// Motion Kit.jsx has the view switcher: a second header row (the view and layout lists).
var H2 = 2 * H + UI.HEADER_GAP;
T.check(P5.views && P5.header.preferredSize[1] === H2 && H2 === 52, "Motion Kit.jsx's header has two rows (" + H2 + " px)");
T.check(P5.geo.h === 9 * c + 8 * sp && s5[0] === 274 && s5[1] === sp + H2 + sp + P5.geo.h + sp && s5[1] === 666, "the combined panel's root bounds (9 rows): " + s5.join(" x "));
T.check(P4.header.preferredSize[0] === P4.geo.w && P5.header.preferredSize[0] === P5.geo.w, "the header is exactly as wide as the grid");
L.save(L.removeItem(L.removeItem(L.removeItem(L.removeItem(L.get(), 2, 5), 2, 4), 2, 3), 2, 2));
MotionKit.__tick(wins[2].mkPanel.key);
var s3 = size(wins[2]);
T.check(wins[2].mkPanel.cols === 2 && s3[0] === 2 * c + sp + 2 * sp, "a panel with fewer items than columns is only that many cells wide (" + s3.join(" x ") + ")");
// Nothing reaches past the root: every control lies inside the reported size.
function inside(w) {
  var lim = size(w), ok = true;
  (function walk(x, ox, oy) {
    var b = x === w ? [0, 0, lim[0], lim[1]] : x.bounds, l = ox + b[0], t = oy + b[1];
    if (l + (b[2] - b[0]) > lim[0] + 1e-6 || t + (b[3] - b[1]) > lim[1] + 1e-6) ok = false;
    for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i], l, t);
  })(w, 0, 0);
  return ok;
}
T.check(inside(W4) && inside(W5) && inside(wins[0]), "no control reaches past the panel's bounds (panel 1 with its command box too)");
L.resetAll();
for (var k = 0; k < 5; k++) MotionKit.__tick(wins[k].mkPanel.key);

// ---- a click runs exactly once, as EffectCraft sends it: mousedown, the plain click, mouseup
T.alerts = [];
var bounceCell = P5.cells[5];
T.check(bounceCell.mkId === "bounce" && typeof bounceCell.onClick !== "function", "tool cells have no onClick: only the mouse listeners run them");
T.mouse(W5, bounceCell, "mousedown", 20, 20);
__uiDispatch(W5.__wid, bounceCell.__id, "click", "");
T.mouse(W5, P5.cells[5], "mouseup", 20, 20);
T.check(T.alerts.length === 1 && /^Bounce: open a composition first/.test(T.alerts[0]), "a click on a tool runs it once (" + T.alerts.length + " runs)");

// ---- edit mode off: dragging never reorders
var start = order(4);
T.mouse(W5, P5.cells[5], "mousedown", 10, 10);
T.mouse(W5, P5.cells[6], "mousemove", c - 2, 10);
T.mouse(W5, P5.cells[6], "mouseup", c - 2, 10);
var sl = P5.widgets[0].sliders.easeIn, track = sl.track;
T.mouse(W5, track, "mousedown", sl.x0 + 10, 10);
T.mouse(W5, P5.cells[1], "mousemove", 30, 10);
T.mouse(W5, P5.cells[1], "mouseup", 30, 10);
T.check(order(4) === start && !P5.editing && !P5.removeButtons.length && !P5.addCell, "out of edit mode, drags (a button, a slider) never reorder; no remove buttons, no + cell");

// ---- edit mode on: dashed outlines, remove buttons, the + cell; widgets don't take input
// The grid's stroke operations (the frames, and in edit mode the dashed outlines).
function strokes() {
  __uiSnapshot();
  return U.filter(P5.grid.__draw || [], function (op) { return op.op === "stroke"; });
}
var plain = strokes();
T.mouse(W5, P5.pencil, "click", 5, 5);
T.check(P5.editing && P5.removeButtons.length === P5.items().length && P5.addCell && /Remove Ease/.test(P5.removeButtons[0].helpTip), "the pencil turns edit mode on: a remove button per cell and a + cell");
var edited = strokes(), dashes = edited.length === plain.length + 1 ? edited[edited.length - 1].path : [], dashed = true;
for (var i = 0; i < P5.cells.length; i++) {
  var r = P5.geo.rects[i], inCell = U.filter(dashes, function (seg) { return seg.k === "M" && seg.x >= r[0] && seg.x <= r[0] + r[2] && seg.y >= r[1] && seg.y <= r[1] + r[3]; });
  if (inCell.length < 8) dashed = false;
}
T.check(dashed, "every cell gets a dashed outline (one more operation on the grid)");
T.check(!P5.widgets[4].amount.enabled && !P5.widgets[4].step.enabled, "the sequencer's fields are disabled while editing");
var easeBefore = MotionKit.options.get("ease").easeIn;
// Drag the Ease widget, starting on its slider, past Key Copy/Paste (right half).
var t2 = P5.widgets[0].sliders.easeIn.track;
T.mouse(W5, t2, "mousedown", 10, 8);
T.mouse(W5, P5.cells[1], "mousemove", 2 * c + sp - 10, 10);
T.check(P5.drag && P5.drag.moved && P5.drag.slot === 2, "a drag in edit mode shows the drop slot after Key Copy/Paste");
T.mouse(W5, P5.cells[1], "mouseup", 2 * c + sp - 10, 10);
T.check(order(4).indexOf("keyCopyPaste,ease,interpolation,") === 0 && MotionKit.options.get("ease").easeIn === easeBefore, "dropping reorders by the packed geometry; the slider didn't change: " + order(4).substring(0, 40));
T.check(P5.cells[1].mkId === "ease" && P5.editing, "the panel shows the new order and stays in edit mode");
// A 1 x 1 tool moves into a widget's place.
T.mouse(W5, P5.cells[7], "mousedown", 10, 10);
T.mouse(W5, P5.cells[0], "mousemove", 5, 10);
T.mouse(W5, P5.cells[0], "mouseup", 5, 10);
T.check(order(4).indexOf("loop,keyCopyPaste,ease,") === 0, "a tool dropped before the first widget: " + order(4).substring(0, 30));

// Remove: press and release on the same remove button.
var n0 = P5.items().length, rmId = P5.items()[3].id;
T.mouse(W5, P5.removeButtons[3], "mousedown", 5, 5);
T.mouse(W5, P5.cells[3], "mouseup", 5, 5);
T.check(P5.items().length === n0, "releasing off the remove button removes nothing");
T.mouse(W5, P5.removeButtons[3], "mousedown", 5, 5);
T.mouse(W5, P5.removeButtons[3], "mouseup", 5, 5);
T.check(P5.items().length === n0 - 1 && L.findId(L.get().panels[4].items, rmId) < 0 && P5.removeButtons.length === n0 - 1, "✕ removes " + rmId + " and saves");

// Add: the + cell opens the Add list (built here; a modal dialog can't show headless).
var D = null;
UI.openAddList = function (p) {
  D = UI.buildAddList(p);
  D.list.selection = U.indexOf(D.ids, rmId);
  D.addBtn.notify("onClick");
  return D.added;
};
T.mouse(W5, P5.addCell, "mousedown", 10, 10);
T.mouse(W5, P5.addCell, "mouseup", 10, 10);
T.check(D && U.indexOf(D.ids, rmId) >= 0 && U.indexOf(D.ids, "bounce") < 0, "the Add list has what the panel lacks: " + D.ids.join(","));
T.check(P5.items().length === n0 && P5.items()[n0 - 1].id === rmId, "+ adds the chosen item at the end");
var D1 = UI.buildAddList(0);
T.check(U.indexOf(D1.ids, "ease") >= 0 && U.indexOf(D1.ids, "anchor") >= 0 && U.indexOf(D1.ids, "bounce") < 0 && D1.list.items[U.indexOf(D1.ids, "ease")].text === "Widget: Ease", "panel 1's Add list offers the widgets");
T.mouse(W5, P5.pencil, "click", 5, 5);
T.check(!P5.editing && !P5.addCell && !P5.removeButtons.length, "the pencil leaves edit mode");
L.resetAll();
MotionKit.__tick(P5.key);

// ---- an empty panel still shows its title row and the + cell
L.save(L.setStyle(L.get(), 3, { hideTitle: true }));
MotionKit.__tick(P4.key);
T.check(!P4.header, "hideTitle hides the title row");
var empty = L.get();
empty.panels[3].items = [];
L.save(empty);
MotionKit.__tick(P4.key);
T.check(P4.header && P4.addCell && P4.cells.length === 0 && P4.layoutList, "an empty panel shows its title row (with the layout list) and the + cell");
L.resetAll();
for (var k2 = 0; k2 < 5; k2++) MotionKit.__tick(wins[k2].mkPanel.key);

// ---- what a redraw costs: EffectCraft redraws after every event a listener wants
// The pointer events the controls of window w ask EffectCraft for, from its serialised tree.
function wanted(w) {
  var all = {}, controls = 0, listening = 0;
  (function walk(o) {
    controls++;
    if (o.mouse && o.mouse.length) listening++;
    for (var i = 0; i < (o.mouse || []).length; i++) all[o.mouse[i]] = true;
    for (var j = 0; j < (o.children || []).length; j++) walk(o.children[j]);
  })(JSON.parse(JSON.stringify(__uiJson(w))));
  return { kinds: U.keys(all).sort().join(","), controls: controls, listening: listening };
}
var idle = true;
for (var w5 = 0; w5 < 5; w5++) if (/mousemove|mouseover|mouseout/.test(wanted(wins[w5]).kinds)) idle = false;
var at = wanted(W5);
T.check(idle && at.kinds === "mousedown,mouseup", "at rest no panel asks for mousemove, mouseover or mouseout (combined panel: " + at.kinds + ")");
T.check(at.listening < at.controls && !wanted(W5).kinds.match(/move/) && P5.header && !/mouse/.test(JSON.stringify(__uiJson(P5.header))), "only the grid listens at rest: the header gets no pointer events at all");
var es = P5.widgets[0].sliders.easeOut;
T.mouse(W5, es.track, "mousedown", es.x0 + 20, 10);
T.check(/mousemove/.test(wanted(W5).kinds) && P5.follows(), "a slider press adds mousemove for the drag");
T.mouse(W5, es.track, "mousemove", es.x0 + 25, 10);
T.mouse(W5, P5.title, "mouseup", 5, 5);
T.check(wanted(W5).kinds === "mousedown,mouseup" && !P5.follows(), "a release, even outside the grid, removes it again");
T.mouse(W5, P5.cells[5], "mousedown", 10, 10);
T.check(wanted(W5).kinds === "mousedown,mouseup", "pressing a button (no drag to follow) adds no mousemove");
T.mouse(W5, P5.cells[5], "mouseup", 10, 10);
P5.setEditing(true);
T.mouse(W5, P5.cells[5], "mousedown", 10, 10);
T.check(/mousemove/.test(wanted(W5).kinds), "an edit-mode press adds mousemove for the drag");
T.mouse(W5, P5.cells[5], "mouseup", 10, 10);
T.check(wanted(W5).kinds === "mousedown,mouseup", "and its release removes it");
P5.setEditing(false);
L.resetAll();
MotionKit.__tick(P5.key);
__uiSnapshot();
var points = 0;
(function walk(x) {
  for (var d = 0; d < (x.__draw || []).length; d++) points += (x.__draw[d].path || []).length;
  for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
})(W5);
T.check(points > 300 && points < 1500, "the combined panel draws " + points + " path points (under 1,500)");
// The hover highlight: header buttons, tool buttons, widget buttons and anchor squares draw
// EffectCraft's native button, which lightens under the pointer without an event; sliders don't.
function native(x) {
  for (var i = 0; i < (x.__draw || []).length; i++) if (x.__draw[i].op === "os") return true;
  return false;
}
function hovering() {
  var ws = P5.widgets, list = [P5.pencil, P5.gear, P5.cells[5], ws[1].copy, ws[1].paste], k;
  for (k in ws[2].buttons) list.push(ws[2].buttons[k]);
  for (k in ws[3].squares) list.push(ws[3].squares[k]);
  for (k in ws[4].buttons) list.push(ws[4].buttons[k]);
  return [U.filter(list, native).length, list.length];
}
var hv = hovering();
T.check(hv[0] === hv[1] && hv[1] === 20 && !native(P5.widgets[0].sliders.easeIn.part), "the hover highlight is on every button and anchor square, not on the sliders (" + hv.join(" of ") + ")");
P5.setEditing(true);
__uiSnapshot();
hv = hovering();
T.check(hv[0] === 2, "edit mode: only the header buttons keep it (" + hv.join(" of ") + ")");
P5.setEditing(false);
L.save(L.setStyle(L.get(), 4, { hover: 0 }));
MotionKit.__tick(P5.key);
__uiSnapshot();
hv = hovering();
T.check(hv[0] === 0, "hover 0 turns it off everywhere (" + hv.join(" of ") + ")");
L.resetAll();
MotionKit.__tick(P5.key);
// Settings saved elsewhere are picked up on the next press, without waiting for the poll.
T.check(UI.POLL_MS === 3000, "panels poll the settings every 3 s");
L.save(L.moveItem(L.get(), 4, 5, 4, 7));
T.check(P5.rev !== MotionKit.settings.rev() && P5.cells[5].mkId === "bounce", "another panel saved: this one is behind");
T.mouse(W5, P5.cells[5], "mousedown", 10, 10);
T.check(P5.rev === MotionKit.settings.rev() && P5.cells[5].mkId === "elastic", "a press checks the settings first and rebuilds");
T.alerts = [];
T.mouse(W5, P5.cells[5], "mouseup", 10, 10);
T.check(/^Elastic: open a composition first/.test(T.lastAlert()), "and the click acts on what is there now: " + T.lastAlert());
L.resetAll();
MotionKit.__tick(P5.key);

// ---- help tips: every interactive control in every panel, in and out of edit mode
var INTERACTIVE = { iconbutton: 1, button: 1, edittext: 1, dropdownlist: 1, listbox: 1, checkbox: 1, radiobutton: 1, slider: 1 };
function untipped(w) {
  var out = [];
  (function walk(x) {
    if (INTERACTIVE[x.type] && !U.trim(x.helpTip)) out.push(x.type + " " + (x.mkRole || "") + " " + (x.mkPart || x.text || ""));
    for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
  })(w);
  return out;
}
var missing = [], count = 0;
for (var p = 0; p < 5; p++) {
  missing = missing.concat(untipped(wins[p]));
  wins[p].mkPanel.setEditing(true);
  missing = missing.concat(untipped(wins[p]));
  wins[p].mkPanel.setEditing(false);
}
(function walk(x) { if (INTERACTIVE[x.type]) count++; for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]); })(W5);
T.check(!missing.length && count > 40, "all " + count + " interactive controls of the combined panel, and every other panel's, have a help tip " + missing.join("; "));
var tips = {};
(function walk(x) { if (x.mkPart) tips[x.mkPart] = x.helpTip; for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]); })(W5);
T.check(/^Ease In: influence of the incoming ease/.test(tips.easeIn) && /^Paste keys at the playhead/.test(tips.paste) && /^Linear/.test(tips.linear) &&
  /top left/.test(tips.tl) && /^Amount: frames per step/.test(tips.amount), "widget parts say what they do");
T.check(/^Bounce – /.test(P5.cells[5].helpTip) && /Shift-click/.test(P5.cells[5].helpTip), "a tool's tip: its full name, its description, then the options hint");

T.done();
