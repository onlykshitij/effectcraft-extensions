// SPDX-License-Identifier: MIT OR Apache-2.0
// The Layout & Style dialog. It edits a copy of the stored state ({layouts, active, library});
// OK saves it (one settings write, so every open panel rebuilds), Cancel drops it.
// Tabs: Buttons (five drawn columns: click to select, drag within and between columns, or use
// the arrow buttons), Style (the chosen panel), Button (the selected button's overrides),
// Layouts and Library. build() makes the dialog without showing it; tests drive it headless.

MK.layoutDialog = (function () {
  var U = MK.util, W = MK.widgets;
  var ROW_H = 20, LIST_W = 136, MIN_ROWS = 8;
  var TABS = ["buttons", "style", "button", "layouts", "library"];

  function build(panelIndex, tab) {
    var D = { st: MK.layout.state(), panel: U.clamp(panelIndex || 0, 0, MK.layout.N_PANELS - 1), sel: -1, libSel: -1, action: null, drag: null, syncing: false };
    D.layout = function () { return D.st.layouts[D.st.active]; };
    D.sync = function () { sync(D); };
    D.move = function (fp, fi, tp, ti) { return move(D, fp, fi, tp, ti); };
    D.pc = function (p) { return D.layout().panels[p === undefined ? D.panel : p]; };
    // Applies a pure layout operation to the working copy; problems are shown, not thrown.
    D.edit = function (fn) {
      try {
        D.st = MK.layout.ops.setLayout(D.st, D.st.active, fn(D.layout()));
      } catch (e) {
        MK.prompts.alert(U.errText(e));
        return false;
      }
      D.sync();
      return true;
    };
    D.state = function (fn) {
      try {
        D.st = fn(D.st);
      } catch (e) {
        MK.prompts.alert(U.errText(e));
        return false;
      }
      D.sel = -1;
      D.sync();
      return true;
    };

    var win = new Window("dialog", MK.NAME + ": Layout & Style", undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 12;
    win.spacing = 8;
    D.win = win;
    var tabs = win.add("tabbedpanel");
    tabs.alignChildren = ["fill", "top"];
    D.tabs = tabs;
    var tb = {};
    tb.buttons = tabs.add("tab", undefined, "Buttons");
    tb.style = tabs.add("tab", undefined, "Style");
    tb.button = tabs.add("tab", undefined, "Button");
    tb.layouts = tabs.add("tab", undefined, "Layouts");
    tb.library = tabs.add("tab", undefined, "Library");
    // EffectCraft draws the 22 px tab strip over the top of the tab's content; leave room for it.
    var tabMargins = U.EFFECTCRAFT ? [10, 34, 10, 10] : 10;
    for (var k in tb) if (U.has(tb, k)) { tb[k].orientation = "column"; tb[k].alignChildren = ["fill", "top"]; tb[k].spacing = 8; tb[k].margins = tabMargins; }
    D.tab = tb;

    buttonsTab(D, tb.buttons);
    styleTab(D, tb.style);
    buttonTab(D, tb.button);
    layoutsTab(D, tb.layouts);
    libraryTab(D, tb.library);

    var btns = win.add("group");
    btns.alignment = ["right", "top"];
    var cancel = btns.add("button", undefined, "Cancel", { name: "cancel" });
    var ok = btns.add("button", undefined, "OK", { name: "ok" });
    D.ok = function () {
      try {
        MK.layout.commit(D.st);
      } catch (e) {
        MK.prompts.alert(U.errText(e));
        return false;
      }
      D.action = "ok";
      win.close(1);
      return true;
    };
    D.cancel = function () {
      D.action = null;
      win.close(2);
    };
    ok.onClick = D.ok;
    cancel.onClick = D.cancel;
    win.defaultElement = ok;
    win.cancelElement = cancel;

    D.sync();
    var t = U.indexOf(TABS, tab);
    tabs.selection = t >= 0 ? t : 0;
    return D;
  }

  // ---------------------------------------------------------------- Buttons tab

  function buttonsTab(D, tab) {
    var cols = tab.add("group");
    cols.orientation = "row";
    cols.alignChildren = ["left", "top"];
    cols.spacing = 8;
    D.cols = cols;
    D.lists = [];
    D.titles = [];
    for (var p = 0; p < MK.layout.N_PANELS; p++) {
      var col = cols.add("group");
      col.orientation = "column";
      col.alignChildren = ["fill", "top"];
      col.spacing = 3;
      D.titles.push(col.add("statictext", undefined, ""));
      var list = col.add("group");
      list.preferredSize = [LIST_W, MIN_ROWS * ROW_H];
      list.mkRole = "list";
      list.mkCol = p;
      list.helpTip = "Click to select. Drag to move within or between panels.";
      list.onDraw = drawList(D);
      D.lists.push(list);
    }
    // mousemove only during a drag: EffectCraft redraws the script's windows after every event.
    function moved(e) {
      var d = D.drag, t = e.target;
      if (!d || !t || t.mkRole !== "list") return;
      if (!d.moved && (t.mkCol !== d.panel || MK.ui.dist([e.clientX, e.clientY], [d.x, d.y]) > MK.ui.DRAG_PX)) d.moved = true;
      if (d.moved) {
        d.to = t.mkCol;
        d.slot = U.clamp(Math.round(e.clientY / ROW_H), 0, D.pc(t.mkCol).items.length);
      }
    }
    function stop() { cols.removeEventListener("mousemove", moved); }
    cols.addEventListener("mousedown", function (e) {
      var t = e.target;
      if (!t || t.mkRole !== "list") return;
      var i = Math.floor(e.clientY / ROW_H), n = D.pc(t.mkCol).items.length;
      D.panel = t.mkCol;
      D.sel = i >= 0 && i < n ? i : -1;
      D.drag = D.sel >= 0 ? { from: D.sel, panel: D.panel, y: e.clientY, x: e.clientX, moved: false, to: -1, slot: -1 } : null;
      stop();
      if (D.drag) cols.addEventListener("mousemove", moved);
      D.sync();
    });
    D.win.addEventListener("mouseup", function () {
      stop();
      D.drag = null;
    });
    cols.addEventListener("mouseup", function (e) {
      var d = D.drag, t = e.target;
      D.drag = null;
      stop();
      if (!d || !d.moved || !t || t.mkRole !== "list") return;
      var to = t.mkCol, slot = U.clamp(Math.round(e.clientY / ROW_H), 0, D.pc(to).items.length);
      D.move(d.panel, d.from, to, to === d.panel && slot > d.from ? slot - 1 : slot);
    });

    var row1 = W.row(tab);
    D.btnUp = row1.add("button", undefined, "↑");
    D.btnDown = row1.add("button", undefined, "↓");
    D.btnLeft = row1.add("button", undefined, "←");
    D.btnRight = row1.add("button", undefined, "→");
    D.btnUp.helpTip = "Move up";
    D.btnDown.helpTip = "Move down";
    D.btnLeft.helpTip = "Move to the panel on the left";
    D.btnRight.helpTip = "Move to the panel on the right";
    D.btnRemove = row1.add("button", undefined, "Remove");
    D.btnUp.onClick = function () { if (D.sel > 0) D.move(D.panel, D.sel, D.panel, D.sel - 1); };
    D.btnDown.onClick = function () { if (D.sel >= 0 && D.sel < D.pc().items.length - 1) D.move(D.panel, D.sel, D.panel, D.sel + 1); };
    D.btnLeft.onClick = function () { if (D.sel >= 0 && D.panel > 0) D.move(D.panel, D.sel, D.panel - 1, D.sel); };
    D.btnRight.onClick = function () { if (D.sel >= 0 && D.panel < MK.layout.N_PANELS - 1) D.move(D.panel, D.sel, D.panel + 1, D.sel); };
    D.btnRemove.onClick = function () {
      if (D.sel < 0) return;
      var i = D.sel;
      D.edit(function (l) { return MK.layout.removeItem(l, D.panel, i); });
      D.sel = Math.min(i, D.pc().items.length - 1);
      D.sync();
    };

    var row2 = W.row(tab);
    W.label(row2, "Add:");
    D.addList = row2.add("dropdownlist", undefined, []);
    D.addList.preferredSize = [220, -1];
    D.btnAdd = row2.add("button", undefined, "Add Tool");
    D.btnAdd.helpTip = "Adds the chosen tool, widget or library item after the selected button";
    D.btnAdd.onClick = function () {
      var s = D.addList.selection;
      if (!s || !D.addIds[s.index]) return;
      var at = D.sel >= 0 ? D.sel + 1 : D.pc().items.length, id = D.addIds[s.index];
      if (D.edit(function (l) { return MK.layout.addItem(l, D.panel, id, at); })) {
        D.sel = MK.layout.findId(D.pc().items, id);
        D.sync();
      }
    };

    var row3 = W.row(tab);
    W.label(row3, "Panel title:");
    D.titleEdit = row3.add("edittext", undefined, "");
    D.titleEdit.characters = 18;
    D.btnRename = row3.add("button", undefined, "Rename Panel");
    D.btnRename.onClick = function () {
      var t = D.titleEdit.text;
      D.edit(function (l) { return MK.layout.renamePanel(l, D.panel, t); });
    };
  }

  // Moves a button in the working copy and keeps it selected.
  function move(D, fp, fi, tp, ti) {
    var id = D.pc(fp).items[fi] && D.pc(fp).items[fi].id;
    if (!id) return false;
    if (!D.edit(function (l) { return MK.layout.moveItem(l, fp, fi, tp, ti); })) return false;
    D.panel = tp;
    D.sel = MK.layout.findId(D.pc().items, id);
    D.sync();
    return true;
  }

  function drawList(D) {
    return function () {
      var g = this.graphics, p = this.mkCol, pc = D.pc(p), items = pc.items;
      var h = this.mkRows * ROW_H, d = D.drag;
      g.newPath();
      g.rectPath(0, 0, LIST_W, h);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#1E1E1E")));
      g.newPath();
      g.rectPath(0.5, 0.5, LIST_W - 1, h - 1);
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(p === D.panel ? "#5A8FD8" : "#444444"), 1));
      var font = ScriptUI.newFont("dialog", "REGULAR", 11);
      for (var i = 0; i < items.length; i++) {
        var y = i * ROW_H, look = MK.ui.look(items[i], pc.style, D.st.library);
        if (p === D.panel && i === D.sel) {
          g.newPath();
          g.rectPath(1, y + 1, LIST_W - 2, ROW_H - 2);
          g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#35507A")));
        }
        MK.icons.draw(g, look.icon, 4, y + 2, 16, look.fg, look.accent);
        g.drawString(MK.ui.fit(g, look.name, font, LIST_W - 28), g.newPen(g.PenType.SOLID_COLOR, U.rgba(look.missing ? "#8A8A8A" : "#D8D8D8"), 1), 24, y + 3, font);
      }
      if (d && d.moved && d.to === p && d.slot >= 0) {
        g.newPath();
        g.rectPath(2, d.slot * ROW_H - 1, LIST_W - 4, 2);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#FFFFFF")));
      }
    };
  }

  // ---------------------------------------------------------------- Style tab

  function styleTab(D, tab) {
    var r0 = W.row(tab);
    W.label(r0, "Panel:", 110);
    D.stylePanel = r0.add("dropdownlist", undefined, ["1", "2", "3", "4", "5"]);
    D.stylePanel.onChange = function () {
      if (D.syncing || !D.stylePanel.selection) return;
      D.panel = D.stylePanel.selection.index;
      D.sel = -1;
      D.sync();
    };
    function style(key, v) { D.edit(function (l) { var s = {}; s[key] = v; return MK.layout.setStyle(l, D.panel, s); }); }
    function number(label, key, lo, hi, unit) {
      var r = W.row(tab);
      W.label(r, label, 110);
      var et = r.add("edittext", undefined, "");
      et.characters = 5;
      W.label(r, (unit === undefined ? "px " : unit) + "(" + lo + "–" + hi + ")").enabled = false;
      et.onChange = function () {
        if (D.syncing) return;
        var n = Number(U.trim(et.text));
        if (!U.trim(et.text) || !isFinite(n) || n < lo || n > hi) {
          MK.prompts.alert(label + " must be a number from " + lo + " to " + hi + ".");
          D.sync();
          return;
        }
        style(key, Math.round(n));
      };
      return et;
    }
    function color(label, key, allowEmpty, emptyText) {
      var r = W.row(tab);
      W.label(r, label, 110);
      var cf = W.colorField(r, null, allowEmpty, function (hex) { if (!D.syncing) style(key, hex); });
      if (emptyText) W.label(r, emptyText).enabled = false;
      return cf;
    }
    D.styleCell = number("Cell size", "cellSize", 24, 96);
    D.styleSpacing = number("Spacing", "spacing", 0, 32);
    D.styleCols = number("Columns", "columns", 1, 12, "");
    D.stylePanelBg = color("Panel background", "panelBg", true, "empty: theme colour");
    D.styleCellBg = color("Button colour", "cellBg", false);
    D.styleBorder = color("Button border", "cellBorder", true, "empty: none");
    D.styleFg = color("Icon and text", "fg", false);
    D.styleAccent = color("Accent", "accent", false);
    D.styleRadius = number("Corner radius", "radius", 0, 16);
    D.styleHover = number("Hover highlight", "hover", 0, 100, "% ");
    D.styleHover.helpTip = "How much a button lightens under the pointer. 0 turns it off; 100 is EffectCraft's plain button.";
    var r1 = W.row(tab);
    W.label(r1, "Buttons show", 110);
    D.styleMode = r1.add("dropdownlist", undefined, ["Icon", "Name", "Icon and name"]);
    D.styleMode.onChange = function () {
      if (!D.syncing && D.styleMode.selection) style("buttonMode", MK.layout.MODES[D.styleMode.selection.index]);
    };
    D.styleHide = tab.add("checkbox", undefined, "Hide the title row");
    D.styleHide.onClick = function () { if (!D.syncing) style("hideTitle", D.styleHide.value); };
    D.styleCmd = tab.add("checkbox", undefined, "Show the command box");
    D.styleCmd.onClick = function () { if (!D.syncing) style("showCommandBox", D.styleCmd.value); };
  }

  // ---------------------------------------------------------------- Button tab

  function buttonTab(D, tab) {
    D.btnInfo = tab.add("statictext", undefined, "");
    D.btnInfo.preferredSize = [420, -1];
    function item(partial) {
      if (D.syncing || D.sel < 0) return;
      var i = D.sel;
      D.edit(function (l) { return MK.layout.setItem(l, D.panel, i, partial); });
    }
    var r0 = W.row(tab);
    W.label(r0, "Display name", 110);
    D.btnName = r0.add("edittext", undefined, "");
    D.btnName.characters = 20;
    D.btnName.helpTip = "Empty: the tool's own name";
    D.btnName.onChange = function () { item({ name: U.trim(D.btnName.text) }); };
    D.btnShowIcon = tab.add("checkbox", undefined, "Show icon");
    D.btnShowIcon.onClick = function () { item({ showIcon: D.btnShowIcon.value }); };
    D.btnShowName = tab.add("checkbox", undefined, "Show name");
    D.btnShowName.onClick = function () { item({ showName: D.btnShowName.value }); };
    function color(label, key) {
      var r = W.row(tab);
      W.label(r, label, 110);
      var cf = W.colorField(r, null, true, function (hex) { var p = {}; p[key] = hex; item(p); });
      W.label(r, "empty: default").enabled = false;
      return cf;
    }
    D.btnBg = color("Background", "bg");
    D.btnAccent = color("Accent", "accent");
    D.btnFg = color("Foreground", "fg");
    D.btnReset = tab.add("button", undefined, "Reset Button");
    D.btnReset.alignment = ["left", "top"];
    D.btnReset.onClick = function () { item({ name: null, showIcon: null, showName: null, bg: null, accent: null, fg: null }); };
  }

  // ---------------------------------------------------------------- Layouts tab

  function layoutsTab(D, tab) {
    var body = tab.add("group");
    body.orientation = "row";
    body.alignChildren = ["left", "top"];
    D.layoutList = body.add("listbox", undefined, []);
    D.layoutList.preferredSize = [220, 200];
    D.layoutList.helpTip = "The selected layout is the one the panels show";
    D.layoutList.onChange = function () {
      if (D.syncing || !D.layoutList.selection) return;
      var n = D.layoutNames[D.layoutList.selection.index];
      if (n !== D.st.active) D.state(function (st) { return MK.layout.ops.switchTo(st, n); });
    };
    var side = body.add("group");
    side.orientation = "column";
    side.alignChildren = ["fill", "top"];
    side.spacing = 4;
    var nr = W.row(side);
    W.label(nr, "Name:");
    D.layoutName = nr.add("edittext", undefined, "");
    D.layoutName.characters = 16;
    function b(text, fn) { var x = side.add("button", undefined, text); x.onClick = fn; return x; }
    // The Name field when it holds a new name, else a free one made from `base`.
    function newName(base) {
      var t = U.trim(D.layoutName.text);
      return t && !U.has(D.st.layouts, t) ? t : U.uniqueName(base, function (n) { return U.has(D.st.layouts, n); });
    }
    D.btnLayoutAdd = b("Add Empty", function () { var n = newName("Layout"); D.state(function (st) { return MK.layout.ops.add(st, n, "empty"); }); });
    D.btnLayoutDup = b("Duplicate Current", function () { var n = newName(D.st.active + " copy"); D.state(function (st) { return MK.layout.ops.add(st, n, "duplicate"); }); });
    D.btnLayoutRename = b("Rename", function () { var n = D.layoutName.text, a = D.st.active; D.state(function (st) { return MK.layout.ops.rename(st, a, n); }); });
    D.btnLayoutDelete = b("Delete", function () { var a = D.st.active; D.state(function (st) { return MK.layout.ops.remove(st, a); }); });
    D.btnLayoutReset = b("Reset to Default", function () { var a = D.st.active; D.state(function (st) { return MK.layout.ops.resetToDefault(st, a); }); });
    D.btnLayoutSave = b("Save to File…", function () {
      try {
        var f = MK.layout.writeFile(null, MK.layout.ops.exportJson(D.st));
        if (f) MK.prompts.alert("Saved the layouts to " + f.fsName + ".");
      } catch (e) {
        MK.prompts.alert(U.errText(e));
      }
    });
    var lr = W.row(side);
    D.layoutMode = lr.add("dropdownlist", undefined, ["Replace", "Merge"]);
    D.layoutMode.selection = 1;
    D.layoutMode.helpTip = "Replace: the file's layouts and library replace yours. Merge: they are added.";
    D.btnLayoutLoad = lr.add("button", undefined, "Load from File…");
    D.btnLayoutLoad.onClick = function () {
      var text;
      try {
        text = MK.layout.readFile(null);
      } catch (e) {
        MK.prompts.alert(U.errText(e));
        return;
      }
      if (text === null) return;
      D.importText(text, D.layoutMode.selection && D.layoutMode.selection.index === 0 ? "replace" : "merge");
    };
    D.importText = function (text, mode) { return D.state(function (st) { return MK.layout.ops.importJson(st, text, mode); }); };
    D.btnLayoutResetAll = b("Reset All", function () {
      if (MK.prompts.confirm("Replace every layout with the default one? The library is kept.")) D.state(function (st) { return MK.layout.ops.resetAll(st); });
    });
  }

  // ---------------------------------------------------------------- Library tab

  function libraryTab(D, tab) {
    var body = tab.add("group");
    body.orientation = "row";
    body.alignChildren = ["left", "top"];
    var left = body.add("group");
    left.orientation = "column";
    left.alignChildren = ["fill", "top"];
    D.libList = left.add("listbox", undefined, []);
    D.libList.preferredSize = [180, 220];
    D.libList.onChange = function () {
      if (D.syncing) return;
      D.libSel = D.libList.selection ? D.libList.selection.index : -1;
      D.sync();
    };
    var lb = W.row(left);
    D.btnLibExpr = lb.add("button", undefined, "New Expression");
    D.btnLibScript = lb.add("button", undefined, "New Script");
    D.btnLibDelete = left.add("button", undefined, "Delete Item");
    D.btnLibExpr.onClick = function () { D.libAdd("expression"); };
    D.btnLibScript.onClick = function () { D.libAdd("script"); };
    D.libAdd = function (kind) {
      var it = MK.library.create(kind, {}, D.st.library);
      D.st.library = D.st.library.concat([it]);
      D.libSel = D.st.library.length - 1;
      D.sync();
      return it;
    };
    D.btnLibDelete.onClick = function () {
      var it = D.st.library[D.libSel];
      if (!it) return;
      // Its buttons go too, in every layout.
      var st = MK.util.clone(D.st);
      st.library.splice(D.libSel, 1);
      for (var n in st.layouts) {
        if (!U.has(st.layouts, n)) continue;
        for (var p = 0; p < st.layouts[n].panels.length; p++) {
          st.layouts[n].panels[p].items = U.filter(st.layouts[n].panels[p].items, function (x) { return x.id !== it.id; });
        }
      }
      D.st = MK.layout.normState(st);
      D.libSel = Math.min(D.libSel, D.st.library.length - 1);
      D.sel = -1;
      D.sync();
    };

    var ed = body.add("group");
    ed.orientation = "column";
    ed.alignChildren = ["fill", "top"];
    ed.spacing = 4;
    D.libEditor = ed;
    function set(partial) {
      if (D.syncing) return;
      var it = D.st.library[D.libSel];
      if (!it) return;
      var next = U.clone(it);
      for (var k in partial) if (U.has(partial, k)) { if (partial[k] === null) delete next[k]; else next[k] = partial[k]; }
      var norm = MK.library.normalize(next);
      if (!norm) return;
      D.st.library = D.st.library.slice();
      D.st.library[D.libSel] = norm;
      D.sync();
    }
    D.libSet = set;
    D.libKind = ed.add("statictext", undefined, "");
    var r0 = W.row(ed);
    W.label(r0, "Name", 80);
    D.libName = r0.add("edittext", undefined, "");
    D.libName.characters = 22;
    D.libName.onChange = function () { set({ name: D.libName.text }); };
    var r1 = W.row(ed);
    W.label(r1, "Target", 80);
    D.libTarget = r1.add("dropdownlist", undefined, ["Apply to the selected properties", "Add as text, switched off, to edit"]);
    D.libTarget.onChange = function () { if (D.libTarget.selection) set({ target: D.libTarget.selection.index ? "text" : "apply" }); };
    var r2 = W.row(ed);
    W.label(r2, "Source", 80);
    D.libSource = r2.add("dropdownlist", undefined, ["Inline code", "Linked .jsx file"]);
    D.libSource.onChange = function () { if (D.libSource.selection) set({ source: D.libSource.selection.index ? "file" : "inline" }); };
    var r3 = W.row(ed);
    W.label(r3, "Script file", 80);
    D.libPath = r3.add("edittext", undefined, "");
    D.libPath.characters = 22;
    D.libPath.onChange = function () { set({ path: U.trim(D.libPath.text) }); };
    D.btnLibBrowse = r3.add("button", undefined, "Browse…");
    D.btnLibBrowse.onClick = function () {
      var f = File.openDialog("Choose a script", "Scripts:*.jsx;*.js");
      if (f) set({ path: f.fsName, source: "file" });
    };
    W.label(ed, "Code");
    D.libCode = ed.add("edittext", undefined, "", { multiline: true });
    D.libCode.preferredSize = [320, 120];
    D.libCode.onChange = function () { set({ code: D.libCode.text }); };
    var r4 = W.row(ed);
    W.label(r4, "Icon", 80);
    D.libIcon = r4.add("dropdownlist", undefined, []);
    D.libIcon.onChange = function () {
      if (D.syncing || !D.libIcon.selection) return;
      set({ icon: D.libIconIds[D.libIcon.selection.index] });
    };
    var r5 = W.row(ed);
    W.label(r5, "PNG file", 80);
    D.libPng = r5.add("edittext", undefined, "");
    D.libPng.characters = 22;
    D.libPng.helpTip = "A PNG icon; if it can't be loaded the built-in icon shows";
    D.libPng.onChange = function () { set({ png: U.trim(D.libPng.text), icon: U.trim(D.libPng.text) ? "png" : "builtin" }); };
    D.btnLibPng = r5.add("button", undefined, "Browse…");
    D.btnLibPng.onClick = function () {
      var f = File.openDialog("Choose a PNG icon", "PNG:*.png");
      if (f) set({ png: f.fsName, icon: "png" });
    };
    function color(label, key) {
      var r = W.row(ed);
      W.label(r, label, 80);
      var cf = W.colorField(r, null, true, function (hex) { var p = {}; p[key] = hex; set(p); });
      W.label(r, "empty: default").enabled = false;
      return cf;
    }
    D.libBg = color("Background", "bg");
    D.libAccent = color("Accent", "accent");
    D.libFg = color("Foreground", "fg");
  }

  // ---------------------------------------------------------------- sync: working copy -> controls

  function fillList(list, labels, sel) {
    list.removeAll();
    for (var i = 0; i < labels.length; i++) list.add("item", labels[i]);
    list.selection = sel >= 0 && sel < labels.length ? sel : null;
  }

  function sync(D) {
    D.syncing = true;
    try {
      var l = D.layout(), pc = D.pc();
      if (D.sel >= pc.items.length) D.sel = pc.items.length - 1;
      // Buttons tab
      var rows = MIN_ROWS;
      for (var p = 0; p < l.panels.length; p++) {
        D.titles[p].text = (p + 1) + ". " + l.panels[p].title;
        rows = Math.max(rows, l.panels[p].items.length + 1);
      }
      for (var q = 0; q < D.lists.length; q++) {
        D.lists[q].mkRows = rows;
        D.lists[q].preferredSize = [LIST_W, rows * ROW_H];
      }
      var cat = MK.catalog(D.st.library, true);
      D.addIds = [];
      var labels = [];
      for (var c = 0; c < cat.length; c++) {
        if (MK.layout.findId(pc.items, cat[c].id) >= 0) continue;
        D.addIds.push(cat[c].id);
        labels.push(MK.ui.entryLabel(cat[c]));
      }
      fillList(D.addList, labels, labels.length ? 0 : -1);
      D.addList.enabled = D.btnAdd.enabled = labels.length > 0;
      D.titleEdit.text = pc.title;
      var has = D.sel >= 0;
      D.btnUp.enabled = has && D.sel > 0;
      D.btnDown.enabled = has && D.sel < pc.items.length - 1;
      D.btnLeft.enabled = has && D.panel > 0;
      D.btnRight.enabled = has && D.panel < MK.layout.N_PANELS - 1;
      D.btnRemove.enabled = has;
      // Style tab
      var s = pc.style;
      D.stylePanel.removeAll();
      for (var t = 0; t < l.panels.length; t++) D.stylePanel.add("item", (t + 1) + ". " + l.panels[t].title);
      D.stylePanel.selection = D.panel;
      D.styleCell.text = String(s.cellSize);
      D.styleSpacing.text = String(s.spacing);
      D.styleCols.text = String(s.columns);
      D.stylePanelBg.set(s.panelBg);
      D.styleCellBg.set(s.cellBg);
      D.styleBorder.set(s.cellBorder);
      D.styleFg.set(s.fg);
      D.styleAccent.set(s.accent);
      D.styleRadius.text = String(s.radius);
      D.styleHover.text = String(s.hover);
      D.styleMode.selection = U.indexOf(MK.layout.MODES, s.buttonMode);
      D.styleHide.value = s.hideTitle;
      D.styleCmd.value = s.showCommandBox;
      // Button tab
      var it = has ? pc.items[D.sel] : null;
      var look = it ? MK.ui.look(it, s, D.st.library) : null;
      D.btnInfo.text = it ? "Panel " + (D.panel + 1) + " (" + pc.title + ") ▸ " + look.name + (look.missing ? " (missing)" : "") : "Select a button in the Buttons tab.";
      D.btnName.text = it && it.name ? it.name : "";
      D.btnShowIcon.value = !!(look && look.showIcon);
      D.btnShowName.value = !!(look && look.showName);
      D.btnBg.set(it ? it.bg : null);
      D.btnAccent.set(it ? it.accent : null);
      D.btnFg.set(it ? it.fg : null);
      var ctrls = [D.btnName, D.btnShowIcon, D.btnShowName, D.btnBg.edit, D.btnAccent.edit, D.btnFg.edit, D.btnReset];
      for (var k = 0; k < ctrls.length; k++) ctrls[k].enabled = has;
      // Layouts tab
      D.layoutNames = U.keys(D.st.layouts);
      fillList(D.layoutList, U.map(D.layoutNames, function (n) { return n === D.st.active ? n + "  (active)" : n; }), U.indexOf(D.layoutNames, D.st.active));
      D.btnLayoutDelete.enabled = D.layoutNames.length > 1;
      D.layoutName.text = D.st.active;
      // Library tab
      var lib = D.st.library;
      if (D.libSel >= lib.length) D.libSel = lib.length - 1;
      fillList(D.libList, U.map(lib, function (x) { return (x.kind === "script" ? "Script: " : "Expression: ") + x.name; }), D.libSel);
      var li = D.libSel >= 0 ? lib[D.libSel] : null;
      D.libKind.text = li ? (li.kind === "script" ? "Script item " : "Expression item ") + li.id : "Make an item with New Expression or New Script.";
      D.libName.text = li ? li.name : "";
      D.libTarget.selection = li && li.target === "text" ? 1 : 0;
      D.libSource.selection = li && li.source === "file" ? 1 : 0;
      D.libPath.text = li ? li.path : "";
      D.libCode.text = li ? li.code : "";
      D.libPng.text = li ? li.png : "";
      D.libIconIds = ["builtin", "png"];
      var iconLabels = ["Built-in library icon", "PNG file"];
      for (var m = 0; m < MK.toolOrder.length; m++) {
        D.libIconIds.push("tool:" + MK.toolOrder[m]);
        iconLabels.push("Tool icon: " + MK.tools[MK.toolOrder[m]].name);
      }
      fillList(D.libIcon, iconLabels, li ? U.indexOf(D.libIconIds, li.icon) : -1);
      D.libBg.set(li ? li.bg : null);
      D.libAccent.set(li ? li.accent : null);
      D.libFg.set(li ? li.fg : null);
      var isExpr = li && li.kind === "expression", isScript = li && li.kind === "script";
      D.libTarget.enabled = !!isExpr;
      D.libSource.enabled = D.libPath.enabled = D.btnLibBrowse.enabled = !!isScript;
      var libCtrls = [D.libName, D.libCode, D.libIcon, D.libPng, D.btnLibPng, D.libBg.edit, D.libAccent.edit, D.libFg.edit, D.btnLibDelete];
      for (var n = 0; n < libCtrls.length; n++) libCtrls[n].enabled = !!li;
    } finally {
      D.syncing = false;
    }
    try { D.win.layout.layout(true); } catch (e) {}
  }

  function open(panelIndex, tab) {
    var D = build(panelIndex, tab);
    D.win.show();
    return D.action === "ok";
  }

  return { build: build, open: open, ROW_H: ROW_H };
})();
