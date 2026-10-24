// SPDX-License-Identifier: MIT OR Apache-2.0
// The panel UI: a header (title, layout list, the edit-mode pencil, the Layout & Style gear, the
// command box) over a grid of custom-drawn cells. MK.layout.pack places the items: tools are
// 1 x 1, widgets declare their span. Each panel polls the settings `rev` and rebuilds when
// another panel (or the dialog) saved something.
//
// Every cell, and every interactive part of a widget, is an `iconbutton` with onDraw and no
// drawOSControl: EffectCraft shows the help tip of a custom-drawn control that isn't a
// container (scriptui_view.rs draw_widget), but not of a custom-drawn group. Input comes only
// through the grid's mouse listeners (mousedown / mousemove / mouseup bubble up from the cell
// under the pointer), never onClick, so a click runs once. Every grid control carries its grid
// position (mkGX, mkGY), which turns an event's clientX / clientY into grid coordinates.
//
// Edit mode (the pencil; per panel, in memory) is the only time dragging reorders: cells get a
// dashed outline and a remove button, and a trailing "+" cell opens the Add list. Out of edit
// mode, buttons run and widgets take input.
//
// The panel is laid out to its content: nothing stretches, so the root's preferred size is the
// header plus the packed grid plus the margins, which EffectCraft reports as the panel bounds.

MK.ui = {};
MK.ui.seq = 0;
MK.ui.POLL_MS = 700;
MK.ui.DRAG_PX = 4;
// Header row height, its icon buttons and the layout list's width range, in px.
MK.ui.HEADER_H = 24;
MK.ui.ICON_BTN = 22;
MK.ui.DD_MIN = 44;
MK.ui.DD_MAX = 120;
// The narrowest header: the layout list at its smallest, the pencil and the gear.
MK.ui.headerMin = function () { return MK.ui.DD_MIN + 2 * MK.ui.ICON_BTN + 2 * 6; };
MK.ui.dist = function (a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); };
// Replaced by tests: how a button opens options, the Layout & Style dialog and the Add list.
MK.ui.openOptions = function (id) { return MK.optionsDialog.open(id); };
MK.ui.openLayoutDialog = function (panelIndex, tab) { return MK.layoutDialog.open(panelIndex, tab); };
MK.ui.openAddList = function (panelIndex) {
  var D = MK.ui.buildAddList(panelIndex);
  D.win.show();
  return D.added;
};

// Cell width and height for a style: icon and name modes are cellSize square; iconName is
// wider, with the name under the icon, or beside it when cellSize is 32 or less.
MK.ui.cellSize = function (style) {
  var s = style.cellSize;
  if (style.buttonMode !== "iconName") return { w: s, h: s, compact: false };
  return s > 32 ? { w: Math.round(s * 1.6), h: s + 12, compact: false } : { w: s + 88, h: s, compact: true };
};

// A grid item's span: a widget's own, 1 x 1 for everything else.
MK.ui.span = function (id) {
  var t = MK.tools[id];
  return t && t.kind === "widget" ? t.span : [1, 1];
};

// Pixel geometry of `items` (plus `extra` trailing 1 x 1 cells) for a style: {cols, rows, sz,
// sp, w, h, rects: [[x, y, w, h], ...]}. The grid is only as wide as the columns it uses.
MK.ui.geometry = function (items, style, extra) {
  var sz = MK.ui.cellSize(style), sp = style.spacing;
  var spans = MK.util.map(items, function (it) { return MK.ui.span(it.id); });
  for (var e = 0; e < (extra || 0); e++) spans.push([1, 1]);
  var pk = MK.layout.pack(spans, style.columns), rects = [];
  for (var i = 0; i < pk.at.length; i++) {
    rects.push([pk.at[i][0] * (sz.w + sp), pk.at[i][1] * (sz.h + sp), pk.spans[i][0] * (sz.w + sp) - sp, pk.spans[i][1] * (sz.h + sp) - sp]);
  }
  return {
    cols: pk.cols, rows: pk.rows, sz: sz, sp: sp, rects: rects,
    w: pk.cols ? pk.cols * (sz.w + sp) - sp : 0, h: pk.rows ? pk.rows * (sz.h + sp) - sp : 0
  };
};

// What a button shows: name, icon, image, colours, and whether it is missing or flagged.
MK.ui.look = function (item, style, library) {
  var id = item.id, tool = MK.tools[id];
  var lib = !tool && id.indexOf("lib:") === 0 && MK.library ? MK.library.find(library || MK.library.list(), id) : null;
  var d = MK.describe(id, library);
  var look = {
    id: id, name: item.name || d.name, description: d.description, missing: d.missing, tool: tool, lib: lib,
    accent: item.accent || (lib && lib.accent) || style.accent,
    fg: item.fg || (lib && lib.fg) || style.fg,
    bg: item.bg || (lib && lib.bg) || style.cellBg,
    icon: tool ? tool.icon : lib ? MK.library.iconOf(lib) : MK.icons.builtin.missing,
    image: lib ? MK.library.imageOf(lib) : null,
    dot: false
  };
  if (d.missing) {
    look.fg = "#8A8A8A";
    look.accent = "#8A8A8A";
  }
  if (tool && tool.dot) try { look.dot = !!tool.dot(); } catch (e) {}
  var mode = style.buttonMode;
  look.showIcon = typeof item.showIcon === "boolean" ? item.showIcon : mode !== "name";
  look.showName = typeof item.showName === "boolean" ? item.showName : mode !== "icon";
  if (!look.showIcon && !look.showName) look.showIcon = true;
  return look;
};

// "Animate: Bounce", "Widget: Ease": an entry of MK.catalog in Add lists.
MK.ui.entryLabel = function (e) { return (e.kind === "widget" ? "Widget" : e.category) + ": " + e.name; };

// Shortens text with an ellipsis until it fits maxW.
MK.ui.fit = function (g, text, font, maxW) {
  var t = String(text);
  if (g.measureString(t, font)[0] <= maxW) return t;
  while (t.length > 1 && g.measureString(t + "…", font)[0] > maxW) t = t.substring(0, t.length - 1);
  return t + "…";
};

// Word-wraps text into at most maxLines lines of maxW.
MK.ui.wrap = function (g, text, font, maxW, maxLines) {
  var words = String(text).split(/\s+/), lines = [], cur = "";
  for (var i = 0; i < words.length; i++) {
    var next = cur ? cur + " " + words[i] : words[i];
    if (!cur || g.measureString(next, font)[0] <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = words[i];
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = MK.ui.fit(g, lines[maxLines - 1] + "…", font, maxW);
  }
  for (var j = 0; j < lines.length; j++) lines[j] = MK.ui.fit(g, lines[j], font, maxW);
  return lines;
};

// Drawing helpers for cells and widgets. Colours are hex; everything goes through U.rgba.
MK.ui.gfx = (function () {
  var U = MK.util, X = {};
  function trace(g, pts) {
    g.newPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  // A rounded rectangle, filled and / or outlined (1 px inside the edge).
  X.box = function (g, x, y, w, h, r, fill, border, alpha) {
    if (fill) {
      trace(g, MK.icons.geom.roundRect(x, y, w, h, r));
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(fill, alpha)));
    }
    if (border) {
      trace(g, MK.icons.geom.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)));
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(border, alpha), 1));
    }
  };
  X.circle = function (g, cx, cy, r, fill) {
    g.newPath();
    g.ellipsePath(cx - r, cy - r, 2 * r, 2 * r);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(fill)));
  };
  X.font = function (size, bold) { return ScriptUI.newFont("dialog", bold ? "BOLD" : "REGULAR", size); };
  // Text with its top-left at (x, y). EffectCraft draws every font regular, so bold is the text
  // drawn twice, 0.6 px apart.
  X.text = function (g, str, x, y, size, hex, bold) {
    var f = X.font(size, bold), pen = g.newPen(g.PenType.SOLID_COLOR, U.rgba(hex), 1);
    g.drawString(str, pen, x, y, f);
    if (bold && U.EFFECTCRAFT) g.drawString(str, pen, x + 0.6, y, f);
  };
  X.textW = function (g, str, size, bold) { return g.measureString(String(str), X.font(size, bold))[0]; };
  // A dashed outline 3 px inside a w x h cell (edit mode).
  X.dashes = function (g, w, h, hex) {
    var x0 = 3, y0 = 3, x1 = w - 3, y1 = h - 3, on = 4, off = 3, a;
    g.newPath();
    for (a = x0; a < x1; a += on + off) { g.moveTo(a, y0); g.lineTo(Math.min(a + on, x1), y0); g.moveTo(a, y1); g.lineTo(Math.min(a + on, x1), y1); }
    for (a = y0; a < y1; a += on + off) { g.moveTo(x0, a); g.lineTo(x0, Math.min(a + on, y1)); g.moveTo(x1, a); g.lineTo(x1, Math.min(a + on, y1)); }
    g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(hex, 0.5), 1));
  };
  // An inner widget button: a filled rounded rectangle with a 24-grid icon at 70 % of its side.
  X.button = function (g, w, h, r, icon, fg, accent, hover) {
    X.box(g, 0, 0, w, h, r, hover ? U.mixHex(MK.THEME.button, "#FFFFFF", 0.12) : MK.THEME.button);
    var s = Math.round(Math.min(w, h) * 0.7);
    MK.icons.draw(g, icon, Math.round((w - s) / 2), Math.round((h - s) / 2), s, fg, accent);
  };
  // The 2 px drop indicator at the left or right edge.
  X.dropMark = function (g, w, h, right) {
    g.newPath();
    g.rectPath(right ? w - 2 : 0, 0, 2, h);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#FFFFFF")));
  };
  return X;
})();

// Paints a cell's frame: the rounded background and the border.
MK.ui.frame = function (g, w, h, style, bg, dimmed) {
  MK.ui.gfx.box(g, 0, 0, w, h, style.radius, bg, style.cellBorder, dimmed ? 0.45 : 1);
};

// Paints one button. o: {w, h, compact, look, style, hover, dimmed, dropLeft, dropRight, editing}.
MK.ui.paintCell = function (g, o) {
  var U = MK.util, L = o.look, w = o.w, h = o.h, s = o.style.cellSize;
  MK.ui.frame(g, w, h, o.style, o.hover ? U.mixHex(L.bg, "#FFFFFF", 0.08) : L.bg, o.dimmed);
  var font = ScriptUI.newFont("dialog", "REGULAR", U.clamp(Math.round(s * 0.24), 9, 12));
  var lineH = Math.ceil(g.measureString("Ag", font)[1]);
  var pen = g.newPen(g.PenType.SOLID_COLOR, U.rgba(L.fg), 1);
  var isz = Math.round(s * (o.compact ? 0.6 : L.showName ? 0.55 : 0.62));
  var drawIcon = function (x, y) {
    if (L.image) {
      try { g.drawImage(L.image, x, y, isz, isz); return; } catch (e) {}
    }
    MK.icons.draw(g, L.icon, x, y, isz, L.fg, L.accent);
  };
  var text = function (str, x, y, maxW) { g.drawString(MK.ui.fit(g, str, font, maxW), pen, x, y, font); };
  if (L.showIcon && L.showName && o.compact) {
    drawIcon(Math.round((s - isz) / 2), Math.round((h - isz) / 2));
    text(L.name, s, Math.round((h - lineH) / 2), w - s - 4);
  } else if (L.showIcon && L.showName && o.style.buttonMode === "iconName") {
    var iy = Math.max(2, Math.round((s - isz) / 2) - 1);
    drawIcon(Math.round((w - isz) / 2), iy);
    var name = MK.ui.fit(g, L.name, font, w - 6);
    g.drawString(name, pen, Math.round((w - g.measureString(name, font)[0]) / 2), iy + isz + 3, font);
  } else if (L.showIcon && L.showName) {
    // name mode with the icon switched on for this button: small icon on top, name below.
    var small = Math.round(s * 0.4);
    MK.icons.draw(g, L.icon, Math.round((w - small) / 2), 3, small, L.fg, L.accent);
    var nm = MK.ui.fit(g, L.name, font, w - 4);
    g.drawString(nm, pen, Math.round((w - g.measureString(nm, font)[0]) / 2), h - lineH - 3, font);
  } else if (L.showIcon) {
    drawIcon(Math.round((w - isz) / 2), Math.round((h - isz) / 2));
  } else {
    var lines = MK.ui.wrap(g, L.name, font, w - 6, Math.max(1, Math.floor((h - 4) / lineH)));
    var y0 = Math.round((h - lines.length * lineH) / 2);
    for (var i = 0; i < lines.length; i++) g.drawString(lines[i], pen, Math.round((w - g.measureString(lines[i], font)[0]) / 2), y0 + i * lineH, font);
  }
  if (L.dot) MK.ui.gfx.circle(g, w - 7, 7, 3, L.accent);
  if (o.editing) MK.ui.gfx.dashes(g, w, h, L.fg);
  if (o.dropLeft || o.dropRight) MK.ui.gfx.dropMark(g, w, h, !o.dropLeft);
};

// A small square header or edit button: an icon from MK.icons.builtin, centred.
MK.ui.paintGlyph = function (g, w, h, icon, hex, back) {
  if (back) MK.ui.gfx.box(g, 0, 0, w, h, Math.min(w, h) / 2, back);
  var s = Math.round(Math.min(w, h) * 0.8);
  MK.icons.draw(g, icon, Math.round((w - s) / 2), Math.round((h - s) / 2), s, hex, hex);
};

// The Add list behind the "+" cell: tools, widgets and library items not in panel
// `panelIndex` yet. build makes the dialog without showing it; Add saves the layout and sets
// `added` to the new id.
MK.ui.buildAddList = function (panelIndex) {
  var U = MK.util, st = MK.layout.state(), items = st.layouts[st.active].panels[panelIndex].items;
  var cat = U.filter(MK.catalog(st.library, true), function (e) { return MK.layout.findId(items, e.id) < 0; });
  var D = { ids: U.map(cat, function (e) { return e.id; }), added: null };
  var win = new Window("dialog", MK.NAME + ": Add to " + st.layouts[st.active].panels[panelIndex].title);
  win.orientation = "column";
  win.alignChildren = ["fill", "top"];
  D.win = win;
  D.list = win.add("listbox", undefined, U.map(cat, MK.ui.entryLabel));
  D.list.preferredSize = [300, 280];
  D.list.helpTip = "Tools, widgets and library items this panel doesn't have yet";
  if (cat.length) D.list.selection = 0;
  var row = win.add("group");
  row.alignment = ["right", "top"];
  var cancel = row.add("button", undefined, "Cancel", { name: "cancel" });
  D.addBtn = row.add("button", undefined, "Add", { name: "ok" });
  D.addBtn.enabled = cat.length > 0;
  D.addBtn.helpTip = "Adds the chosen item at the end of the panel";
  D.add = function () {
    var s = D.list.selection;
    if (!s || !D.ids[s.index]) return false;
    try {
      MK.layout.save(MK.layout.addItem(MK.layout.get(), panelIndex, D.ids[s.index]));
    } catch (e) {
      MK.prompts.alert(U.errText(e));
      return false;
    }
    D.added = D.ids[s.index];
    win.close(1);
    return true;
  };
  D.addBtn.onClick = D.add;
  cancel.onClick = function () { win.close(2); };
  win.defaultElement = D.addBtn;
  win.cancelElement = cancel;
  return D;
};

// The API a widget's build(w) gets for its cell: its size and style, its saved values, and
// part() / field() to add interactive controls. Parts are iconbuttons the panel's mouse
// listeners drive: click({shift}), press(x, y), drag(x, y) and release() (x, y in the part).
MK.ui.widgetApi = function (P, tool, cell, index, rect, look, style) {
  var W = {
    id: tool.id, tool: tool, cell: cell, index: index, w: rect[2], h: rect[3], style: style, look: look,
    editing: P.editing, panel: P, values: MK.options.get(tool),
    // paint(g): the widget's own drawing on its background (labels and such).
    paint: null,
    // onShift(): Shift-click (or right-click) anywhere on the widget; without it, parts get
    // click({shift: true}).
    onShift: null
  };
  // Saves `partial` into the widget's values (toolOptions under its id); the panel rebuilds.
  W.save = function (partial) {
    for (var k in partial) if (MK.util.has(partial, k)) W.values[k] = partial[k];
    var r = MK.options.save(tool, W.values);
    if (r.ok) W.values = r.values;
    P.refresh();
    return W.values;
  };
  // Runs the widget with `options` on top of its values: one undo step, through the runner.
  W.run = function (options) {
    var r = MK.run(tool.id, options);
    P.refresh();
    return r;
  };
  // Opens a tool's options (its own dialog), then catches up with what it saved.
  W.options = function (id) {
    var r = MK.ui.openOptions(id);
    P.refresh();
    return r;
  };
  W.hover = function (ctl) { return P.hoverCtl === ctl; };
  W.part = function (name, r, h) {
    var b = cell.add("iconbutton", [r[0], r[1], r[0] + r[2], r[1] + r[3]]);
    b.preferredSize = [r[2], r[3]];
    b.helpTip = h.tip;
    b.mkRole = "part";
    b.mkPart = name;
    b.mkIndex = index;
    b.mkGX = rect[0] + r[0];
    b.mkGY = rect[1] + r[1];
    b.mkW = r[2];
    b.mkH = r[3];
    b.mkClick = h.click || null;
    b.mkPress = h.press || null;
    b.mkDrag = h.drag || null;
    b.mkRelease = h.release || null;
    b.onDraw = function () { if (h.draw) h.draw(this.graphics, b); };
    return b;
  };
  // A text field; onChange(text) runs when it commits. Disabled in edit mode.
  W.field = function (name, r, text, tip, onChange) {
    var et = cell.add("edittext", [r[0], r[1], r[0] + r[2], r[1] + r[3]], text);
    et.preferredSize = [r[2], r[3]];
    et.helpTip = tip;
    et.enabled = !P.editing;
    et.mkRole = "field";
    et.mkPart = name;
    et.mkIndex = index;
    et.mkGX = rect[0] + r[0];
    et.mkGY = rect[1] + r[1];
    et.onChange = function () { onChange(et.text); };
    return et;
  };
  return W;
};

// Builds panel `index` (0-4) of the active layout into `host` (a Panel or a palette Window).
// Returns the controller {host, index, rebuild(), items(), cells, grid, ...}.
MK.ui.buildPanel = function (host, index) {
  var U = MK.util, G = MK.ui.gfx;
  var P = { host: host, index: index, rev: -1, cols: 4, cells: [], widgets: [], drag: null, hover: -1, hoverCtl: null, closed: false, filling: false, editing: false };
  P.key = "p" + (++MK.ui.seq);

  P.layout = function () { return P.state.layouts[P.state.active]; };
  P.items = function () { return P.layout().panels[P.index].items; };

  function clear() {
    for (var n = 0; n < 1000 && host.children.length; n++) host.remove(host.children[host.children.length - 1]);
  }

  // The title row, exactly `width` wide: title, layout list, pencil and gear at fixed places.
  // The list shrinks, then the title, so it never gets wider than `width`.
  function header(parent, pc, width) {
    var H = MK.ui.HEADER_H, B = MK.ui.ICON_BTN, GAP = 6, st = P.state, style = pc.style;
    var hdr = parent.add("group");
    hdr.orientation = "stack";
    hdr.margins = 0;
    hdr.preferredSize = [width, H];
    hdr.mkRole = "header";
    P.header = hdr;
    var avail = width - 2 * B - 2 * GAP, need = Math.ceil(pc.title.length * 14 * 0.7) + 2;
    var dd = avail >= MK.ui.DD_MIN ? Math.min(MK.ui.DD_MAX, Math.max(MK.ui.DD_MIN, avail - need - GAP)) : 0;
    var tw = Math.max(0, avail - (dd ? dd + GAP : 0));
    P.title = hdr.add("statictext", [0, 0, tw, H], pc.title);
    P.title.helpTip = pc.title + ": panel " + (P.index + 1) + " of the \"" + st.active + "\" layout";
    P.title.onDraw = function () {
      var g = this.graphics, t = MK.ui.fit(g, pc.title.toUpperCase(), G.font(14, true), tw - 2);
      if (tw > 12) G.text(g, t, 0, Math.round((H - 17) / 2), 14, style.fg, true);
    };
    P.layoutList = null;
    if (dd) {
      var names = U.keys(st.layouts);
      P.filling = true;
      var list = hdr.add("dropdownlist", [tw + GAP, 1, tw + GAP + dd, H - 1], names);
      list.selection = U.indexOf(names, st.active);
      list.helpTip = "Layout: pick one to switch every panel to it";
      P.filling = false;
      list.onChange = function () {
        if (P.filling || !list.selection) return;
        var n = list.selection.text;
        if (n === P.state.active) return;
        try {
          MK.layout.switchTo(n);
        } catch (e) {
          MK.prompts.alert(U.errText(e));
        }
        P.rebuild();
      };
      P.layoutList = list;
    }
    var y = Math.round((H - B) / 2);
    P.pencil = hdr.add("iconbutton", [width - 2 * B - GAP, y, width - B - GAP, y + B]);
    P.pencil.helpTip = P.editing ? "Done: leave edit mode" : "Edit this panel: drag to reorder, ✕ removes, + adds";
    P.pencil.onDraw = function () { MK.ui.paintGlyph(this.graphics, B, B, MK.icons.builtin.pencil, P.editing ? style.accent : style.fg); };
    P.pencil.onClick = function () { P.setEditing(!P.editing); };
    P.gear = hdr.add("iconbutton", [width - B, y, width, y + B]);
    P.gear.helpTip = "Layout & Style… (move buttons between panels, colours, layouts, library)";
    P.gear.onDraw = function () { MK.ui.paintGlyph(this.graphics, B, B, MK.icons.builtin.gear, style.fg); };
    P.gear.onClick = function () {
      MK.ui.openLayoutDialog(P.index);
      P.refresh();
    };
  }

  function grid(parent, pc, geo) {
    var items = pc.items, style = pc.style, n = items.length;
    var g = parent.add("group");
    g.orientation = "stack";
    g.margins = 0;
    g.preferredSize = [geo.w, geo.h];
    g.mkRole = "grid";
    P.grid = g;
    P.geo = geo;
    P.sz = geo.sz;
    P.sp = geo.sp;
    P.cols = geo.cols;
    P.cells = [];
    P.widgets = [];
    for (var i = 0; i < n; i++) {
      var r = geo.rects[i], look = MK.ui.look(items[i], style, P.state.library), cell;
      if (look.tool && look.tool.kind === "widget") cell = widgetCell(g, i, r, look, style);
      else {
        cell = g.add("iconbutton", [r[0], r[1], r[0] + r[2], r[1] + r[3]]);
        cell.helpTip = look.name + " – " + look.description +
          (look.tool && MK.options.has(look.tool) ? "\nShift-click or right-click for options." : "") + (P.editing ? "\nDrag to reorder." : "");
        cell.onDraw = paint;
      }
      cell.preferredSize = [r[2], r[3]];
      cell.mkRole = "cell";
      cell.mkIndex = i;
      cell.mkId = items[i].id;
      cell.mkGX = r[0];
      cell.mkGY = r[1];
      P.cells.push(cell);
    }
    P.addCell = null;
    if (geo.rects.length > n) {
      var ra = geo.rects[n], add = g.add("iconbutton", [ra[0], ra[1], ra[0] + ra[2], ra[1] + ra[3]]);
      add.preferredSize = [ra[2], ra[3]];
      add.helpTip = "Add a tool or widget to this panel";
      add.mkRole = "add";
      add.mkGX = ra[0];
      add.mkGY = ra[1];
      add.mkClick = function () {
        MK.ui.openAddList(P.index);
        P.refresh();
      };
      add.onDraw = function () {
        var gr = this.graphics;
        if (P.hoverCtl === add) MK.ui.frame(gr, ra[2], ra[3], style, U.mixHex(style.cellBg, "#FFFFFF", 0.08));
        G.dashes(gr, ra[2], ra[3], style.fg);
        var s = Math.round(Math.min(ra[2], ra[3]) * 0.4);
        MK.icons.draw(gr, MK.icons.builtin.plus, Math.round((ra[2] - s) / 2), Math.round((ra[3] - s) / 2), s, style.fg, style.accent);
      };
      P.addCell = add;
    }
    // Remove buttons go last, so they sit on top of their cells.
    P.removeButtons = [];
    if (P.editing) {
      for (var j = 0; j < n; j++) {
        var rr = geo.rects[j], x = rr[0] + rr[2] - 17, y = rr[1] + 3;
        var rm = g.add("iconbutton", [x, y, x + 14, y + 14]);
        rm.preferredSize = [14, 14];
        rm.helpTip = "Remove " + MK.ui.look(items[j], style, P.state.library).name + " from this panel";
        rm.mkRole = "remove";
        rm.mkIndex = j;
        rm.mkGX = x;
        rm.mkGY = y;
        rm.mkClick = removeAt(j);
        rm.onDraw = function () { MK.ui.paintGlyph(this.graphics, 14, 14, MK.icons.builtin.close, "#FFFFFF", P.hoverCtl === this ? style.accent : MK.THEME.button); };
        P.removeButtons.push(rm);
      }
    }
    g.addEventListener("mousedown", down);
    g.addEventListener("mousemove", move);
    g.addEventListener("mouseup", up);
    g.addEventListener("mouseout", out);
  }

  function removeAt(i) {
    return function () {
      try {
        MK.layout.save(MK.layout.removeItem(P.layout(), P.index, i));
      } catch (e) {
        MK.prompts.alert(U.errText(e));
      }
      P.refresh();
    };
  }

  // Drag state shown on cell i: hover, dimmed while dragged, drop marks (insertion slot s is the
  // left edge of item s, or the right edge of the last item).
  function state(i) {
    var d = P.drag, dragging = d && d.moved, n = P.items().length;
    return {
      hover: !dragging && P.hover === i && !P.editing, dimmed: dragging && d.from === i, editing: P.editing,
      dropLeft: dragging && d.slot === i, dropRight: dragging && d.slot === n && i === n - 1
    };
  }

  function paint() {
    var i = this.mkIndex, items = P.items(), pc = P.layout().panels[P.index];
    if (!items[i]) return;
    var s = state(i), r = P.geo.rects[i];
    MK.ui.paintCell(this.graphics, {
      w: r[2], h: r[3], compact: P.sz.compact, style: pc.style, look: MK.ui.look(items[i], pc.style, P.state.library),
      hover: s.hover, dimmed: s.dimmed, editing: s.editing, dropLeft: s.dropLeft, dropRight: s.dropRight
    });
  }

  // A widget's cell: a group with the frame, the widget's parts on top. A widget that fails to
  // build shows its frame and says why in its help tip.
  function widgetCell(g, i, r, look, style) {
    var cell = g.add("group", [r[0], r[1], r[0] + r[2], r[1] + r[3]]);
    cell.orientation = "stack";
    cell.margins = 0;
    cell.helpTip = look.name + " – " + look.description;
    var W = MK.ui.widgetApi(P, look.tool, cell, i, r, look, style);
    P.widgets[i] = W;
    try {
      look.tool.build(W);
    } catch (e) {
      cell.helpTip = look.name + " couldn't be built: " + U.errText(e);
    }
    cell.onDraw = function () {
      var gr = this.graphics, s = state(i);
      MK.ui.frame(gr, r[2], r[3], style, look.bg, s.dimmed);
      if (W.paint) W.paint(gr);
      if (s.editing) G.dashes(gr, r[2], r[3], look.fg);
      if (s.dropLeft || s.dropRight) G.dropMark(gr, r[2], r[3], !s.dropLeft);
    };
    return cell;
  }

  // Event position -> grid coordinates, or null when it isn't over the grid.
  function gridXY(e) {
    var t = e.target;
    if (t && t.mkGX !== undefined) return [t.mkGX + e.clientX, t.mkGY + e.clientY];
    if (t === P.grid) return [e.clientX, e.clientY];
    return null;
  }
  P.gridXY = gridXY;

  // The item under a grid point, or -1.
  function cellAt(xy) {
    var R = P.geo.rects;
    for (var i = 0; i < P.items().length; i++) {
      if (xy[0] >= R[i][0] && xy[0] < R[i][0] + R[i][2] && xy[1] >= R[i][1] && xy[1] < R[i][1] + R[i][3]) return i;
    }
    return -1;
  }
  P.cellAt = cellAt;

  // The insertion slot (0..n) for a drop at a grid point, or -1 off the grid: before the item
  // under the pointer when it is in that item's left half, else after it. Over a hole, the
  // nearest item decides.
  function slotAt(xy) {
    var n = P.items().length, R = P.geo.rects, sp = P.sp;
    if (!n || xy[0] < -sp || xy[1] < -sp || xy[0] > P.geo.w + sp || xy[1] > P.geo.h + sp) return -1;
    var best = 0, bd = Infinity;
    for (var i = 0; i < n; i++) {
      var r = R[i], dx = Math.max(r[0] - xy[0], 0, xy[0] - r[0] - r[2]), dy = Math.max(r[1] - xy[1], 0, xy[1] - r[1] - r[3]);
      if (dx * dx + dy * dy < bd) {
        bd = dx * dx + dy * dy;
        best = i;
      }
    }
    return xy[0] < R[best][0] + R[best][2] / 2 ? best : best + 1;
  }
  P.slotAt = slotAt;

  function isWidget(i) { return !!P.widgets[i]; }

  function down(e) {
    var xy = gridXY(e), t = e.target;
    if (!xy) return;
    var i = cellAt(xy), opt = e.shiftKey || e.button === 2;
    if (t.mkRole === "remove" || t.mkRole === "add") {
      P.drag = { button: t };
      return;
    }
    if (P.editing) {
      P.drag = i >= 0 ? { from: i, start: xy, moved: false, slot: -1 } : null;
      return;
    }
    if (t.mkRole === "field") {
      P.drag = null;
      return;
    }
    if (t.mkRole === "part") {
      P.drag = { part: t, shift: opt };
      if (!opt && t.mkPress) t.mkPress(xy[0] - t.mkGX, xy[1] - t.mkGY);
      return;
    }
    P.drag = { from: i, start: xy, moved: false, slot: -1, options: opt };
  }

  function move(e) {
    var xy = gridXY(e), d = P.drag;
    P.hover = xy ? cellAt(xy) : -1;
    P.hoverCtl = e.target;
    if (!d || !xy) return;
    if (d.part) {
      if (!d.shift && d.part.mkDrag) d.part.mkDrag(xy[0] - d.part.mkGX, xy[1] - d.part.mkGY);
      return;
    }
    // Only edit mode reorders, so a press that wanders off a button never moves it.
    if (!P.editing || d.from === undefined || d.from < 0) return;
    if (!d.moved && MK.ui.dist(xy, d.start) > MK.ui.DRAG_PX) d.moved = true;
    if (d.moved) d.slot = slotAt(xy);
  }

  function out(e) {
    if (e.target === P.hoverCtl) P.hoverCtl = null;
    if (e.target && e.target.mkRole === "cell" && e.target.mkIndex === P.hover) P.hover = -1;
  }

  // Ends a part's press: a slider's release, or a click when released on the same part.
  function endPart(d, t) {
    var W = P.widgets[d.part.mkIndex];
    if (d.shift && W && W.onShift) {
      if (t === d.part) W.onShift();
      return;
    }
    if (!d.shift && d.part.mkRelease) d.part.mkRelease();
    else if (t === d.part && d.part.mkClick) d.part.mkClick({ shift: d.shift });
  }

  function up(e) {
    e.mkOnGrid = true;
    var d = P.drag, xy = gridXY(e), t = e.target;
    P.drag = null;
    if (!d) return;
    if (d.button) {
      if (t === d.button) d.button.mkClick();
      return;
    }
    if (d.part) {
      endPart(d, t);
      return;
    }
    if (P.editing) {
      if (d.moved && xy) P.drop(d.from, slotAt(xy));
      return;
    }
    var options = d.options || e.shiftKey || e.button === 2;
    if (d.from < 0) {
      // Shift-click on empty space: the dialog, also reachable when the title row is hidden.
      if (options) {
        MK.ui.openLayoutDialog(P.index);
        P.refresh();
      }
      return;
    }
    if (!xy || cellAt(xy) !== d.from) return;
    if (isWidget(d.from)) {
      if (options && P.widgets[d.from].onShift) P.widgets[d.from].onShift();
      return;
    }
    P.activate(d.from, options);
  }

  // Runs button i (or opens its options).
  P.activate = function (i, options) {
    var item = P.items()[i];
    if (!item) return null;
    var d = MK.describe(item.id, P.state.library), r = null;
    if (d.missing) MK.prompts.alert("\"" + item.id + "\": " + d.description);
    else if (options && MK.tools[item.id]) r = MK.ui.openOptions(item.id);
    else r = MK.run(item.id);
    P.refresh();
    return r;
  };

  // Commits a drag: the button `from` goes to insertion slot `slot`.
  P.drop = function (from, slot) {
    if (slot < 0) return false;
    var to = slot > from ? slot - 1 : slot;
    if (to === from) return false;
    try {
      MK.layout.save(MK.layout.moveItem(P.layout(), P.index, from, P.index, to));
    } catch (e) {
      MK.prompts.alert(U.errText(e));
    }
    P.rebuild();
    return true;
  };

  P.setEditing = function (on) {
    P.editing = !!on;
    P.rebuild();
  };

  P.rebuild = function () {
    if (P.closed) return;
    P.state = MK.layout.state();
    P.rev = MK.settings.rev();
    var pc = P.layout().panels[P.index], style = pc.style, n = pc.items.length;
    P.drag = null;
    P.hover = -1;
    P.hoverCtl = null;
    P.commandBox = null;
    P.header = null;
    clear();
    host.orientation = "column";
    host.alignChildren = ["left", "top"];
    host.spacing = 0;
    host.margins = 0;
    // The body paints the panel background: EffectCraft doesn't paint a panel's own onDraw.
    var body = host.add("group");
    body.orientation = "column";
    body.alignChildren = ["left", "top"];
    body.spacing = style.spacing;
    body.margins = style.spacing;
    body.mkRole = "body";
    if (style.panelBg) {
      body.onDraw = function () {
        var g = this.graphics;
        g.newPath();
        g.rectPath(0, 0, 10000, 10000);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(style.panelBg)));
      };
    }
    P.body = body;
    // An empty panel always shows its "+" cell and title row, or nothing could add buttons.
    var geo = MK.ui.geometry(pc.items, style, P.editing || !n ? 1 : 0);
    var showHeader = !style.hideTitle || !n;
    // The header is as wide as the grid, but keeps room for its buttons and the layout list.
    var width = Math.max(geo.w, showHeader ? MK.ui.headerMin() : 0);
    if (showHeader) header(body, pc, width);
    if (showHeader && style.showCommandBox && MK.commandBox) P.commandBox = MK.commandBox.attach(body, { width: width, after: function () { P.refresh(); } });
    grid(body, pc, geo);
    try { host.layout.layout(true); } catch (e2) {}
  };

  // Rebuilds when settings changed since the last build.
  P.refresh = function () {
    if (P.closed) return;
    if (MK.settings.rev() !== P.rev) P.rebuild();
  };

  P.close = function () {
    if (P.closed) return;
    P.closed = true;
    if (P.taskId) try { app.cancelTask(P.taskId); } catch (e) {}
    delete MK.ui.live[P.key];
  };

  // A release outside the grid: a drag is dropped, a slider being dragged still commits.
  host.addEventListener("mouseup", function (e) {
    if (e.mkOnGrid) return;
    var d = P.drag;
    P.drag = null;
    if (d && d.part && !d.shift && d.part.mkRelease) d.part.mkRelease();
  });
  var prevClose = host.onClose;
  host.onClose = function () {
    P.close();
    if (typeof prevClose === "function") return prevClose.apply(this, arguments);
  };

  MK.ui.live[P.key] = P;
  P.rebuild();
  try {
    P.taskId = app.scheduleTask("try { MotionKit.__tick(\"" + P.key + "\"); } catch (e) {}", MK.ui.POLL_MS, true);
  } catch (e3) {
    P.taskId = null;
  }
  host.mkPanel = P;
  return P;
};

// Live panels by key; the scheduled task calls MotionKit.__tick(key).
MK.ui.live = {};
MK.ui.tick = function (key) {
  var P = MK.ui.live[key];
  if (!P) return false;
  try {
    P.refresh();
  } catch (e) {
    try { $.writeln("Motion Kit: panel refresh failed: " + MK.util.errText(e)); } catch (e2) {}
  }
  return true;
};

// The entry point: builds the UI for a dist file. panel is MK_PANEL (1-4, "all" for the
// combined panel 5, "menu", or null for no UI). In an installed panel `thisObj` is the Panel;
// from File > Scripts it is not, and a palette window opens.
MK.ui.start = function (thisObj, panel) {
  if (panel === null) return null;
  var isPanel = typeof Panel !== "undefined" && thisObj instanceof Panel;
  if (!isPanel && panel === undefined) return null;
  var p = panel === undefined ? 1 : panel === "all" ? MK.layout.N_PANELS : panel;
  var title = p === "menu" ? MK.NAME + " Menu" : p === MK.layout.N_PANELS ? MK.NAME : MK.NAME + " " + p;
  var host = isPanel ? thisObj : new Window("palette", title, undefined, { resizeable: true });
  if (p === "menu") MK.ui.buildMenu(host);
  else MK.ui.buildPanel(host, MK.util.clamp((Math.round(Number(p)) || 1) - 1, 0, MK.layout.N_PANELS - 1));
  if (host instanceof Window) {
    host.center();
    host.show();
  } else {
    try { host.layout.layout(true); } catch (e) {}
  }
  return host;
};
