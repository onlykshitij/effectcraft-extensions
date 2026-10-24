// SPDX-License-Identifier: MIT OR Apache-2.0
// The panel UI: a header (title, layout list, the edit-mode pencil, the Layout & Style gear, the
// command box) over a grid of custom-drawn cells. MK.layout.pack places the items: tools are
// 1 x 1, widgets declare their span. Each panel polls the settings `rev` and rebuilds when
// another panel (or the dialog) saved something.
//
// Every cell, and every interactive part of a widget, is an `iconbutton` with onDraw:
// EffectCraft shows the help tip of a custom-drawn control that isn't a container
// (scriptui_view.rs draw_widget), but not of a custom-drawn group. Buttons with the hover
// highlight (the style's `hover`) also call drawOSControl, so EffectCraft draws its native
// button under the paint and lightens it under the pointer without telling the script. Input
// comes only through the grid's mouse listeners (mousedown / mouseup bubble up from the cell
// under the pointer), never onClick, so a click runs once. Every grid control carries its grid position
// (mkGX, mkGY), which turns an event's clientX / clientY into grid coordinates.
//
// Speed: EffectCraft re-runs every onDraw, lays the window out and serialises it after each
// event it hands the script and after each scheduled task. So a panel listens to mousemove only
// while a drag needs it (a slider, an edit-mode drag), keeps no hover state, polls every 3 s
// (and checks on each press), and draws nothing that can't be seen.
//
// Edit mode (the pencil; per panel, in memory) is the only time dragging reorders: cells get a
// dashed outline and a remove button, and a trailing "+" cell opens the Add list. Out of edit
// mode, buttons run and widgets take input.
//
// The panel is laid out to its content: nothing stretches, so the root's preferred size is the
// header plus the packed grid plus the margins, which EffectCraft reports as the panel bounds.

MK.ui = {};
MK.ui.seq = 0;
MK.ui.POLL_MS = 3000;
MK.ui.DRAG_PX = 4;
// Header row height, its icon buttons and the layout list's width range, in px.
MK.ui.HEADER_H = 24;
MK.ui.ICON_BTN = 22;
MK.ui.DD_MIN = 44;
MK.ui.DD_MAX = 120;
// The narrowest header: the layout list at its smallest, the pencil and the gear.
MK.ui.headerMin = function () { return MK.ui.DD_MIN + 2 * MK.ui.ICON_BTN + 2 * 6; };
// Header height: one row, or two with the view switcher (title row, then the two lists).
MK.ui.HEADER_GAP = 4;
MK.ui.headerHeight = function (views) { return views ? 2 * MK.ui.HEADER_H + MK.ui.HEADER_GAP : MK.ui.HEADER_H; };

// ---- views: Motion Kit.jsx shows one of these in its single Window menu entry. The panel
// configs 1-4 and the combined config 5 are grids; "menu" is the menu widget. The choice is
// kept per file, without bumping rev.
MK.ui.VIEWS = ["combined", "animate", "rig", "shapes", "comp", "menu"];
MK.ui.VIEW_KEY = "view:Motion Kit.jsx";
MK.ui.viewLabels = function () {
  var l = MK.layout.state(), p = l.layouts[l.active].panels;
  return ["Combined", p[0].title, p[1].title, p[2].title, p[3].title, "Menu"];
};
// The view list: a dropdown in `parent` (at `bounds`, or laid out) that switches `views`
// ({view, change(next)}).
MK.ui.viewList = function (parent, bounds, views) {
  var list = parent.add("dropdownlist", bounds, MK.ui.viewLabels());
  list.selection = Math.max(0, MK.util.indexOf(MK.ui.VIEWS, views.view));
  list.helpTip = "View: which Motion Kit panel this one shows (all tools, one category, or the menu)";
  list.onChange = function () {
    var v = list.selection ? MK.ui.VIEWS[list.selection.index] : null;
    if (v && v !== views.view) views.change(v);
  };
  return list;
};
// Shows view `view` in `host` in place of what it showed, and remembers it. Returns the new
// controller (host.mkPanel).
MK.ui.showView = function (host, view) {
  var i = MK.util.indexOf(MK.ui.VIEWS, view), v = i < 0 ? "combined" : view;
  if (host.mkPanel) host.mkPanel.close();
  host.onClose = host.mkBaseClose;
  for (var n = 0; n < 1000 && host.children.length; n++) host.remove(host.children[host.children.length - 1]);
  var sw = { view: v, change: function (next) { MK.ui.showView(host, next); } };
  if (v === "menu") MK.ui.buildMenu(host, sw);
  else MK.ui.buildPanel(host, v === "combined" ? MK.layout.N_PANELS - 1 : MK.util.indexOf(MK.ui.VIEWS, v) - 1, sw);
  try {
    if (MK.settings.get(MK.ui.VIEW_KEY, "combined") !== v) MK.settings.setQuiet(MK.ui.VIEW_KEY, v);
  } catch (e) {
    MK.prompts.alert(MK.util.errText(e));
  }
  try { host.layout.layout(true); } catch (e2) {}
  return host.mkPanel;
};
MK.ui.startViews = function (host) {
  host.mkBaseClose = host.onClose;
  return MK.ui.showView(host, MK.settings.get(MK.ui.VIEW_KEY, "combined"));
};
MK.ui.dist = function (a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); };
// Replaced by tests: how a button opens options, the Layout & Style dialog and the Add list.
MK.ui.openOptions = function (id) { return MK.optionsDialog.open(id); };
// "Bounce, Elastic and Loop": the tools Alt-click can remove, for messages.
MK.ui.removableNames = function () {
  var n = MK.util.map(MK.util.filter(MK.toolOrder, function (id) { return MK.tools[id].removable; }), function (id) { return MK.tools[id].name; });
  return n.length > 1 ? n.slice(0, -1).join(", ") + " and " + n[n.length - 1] : n.join("");
};
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
  // Points go into every window snapshot: 0.1 px is plenty and keeps the JSON short.
  function r1(v) { return Math.round(v * 10) / 10; }
  // One path of rounded rectangles [[x, y, w, h], ...] (corners get a point every 45 degrees,
  // plenty at these radii), built once per geometry and handed to fillPath / strokePath again
  // on every redraw.
  // shortcut: the cache keeps every geometry drawn (a few per layout); clear it if layouts
  // ever change continuously.
  var boxes = {};
  function boxPath(g, rects, r) {
    var key = r + ":" + rects.join(";");
    if (!U.has(boxes, key)) {
      g.newPath();
      for (var i = 0; i < rects.length; i++) {
        var pts = MK.icons.geom.roundRect(rects[i][0], rects[i][1], rects[i][2], rects[i][3], r, 45);
        g.moveTo(r1(pts[0][0]), r1(pts[0][1]));
        for (var j = 1; j < pts.length; j++) g.lineTo(r1(pts[j][0]), r1(pts[j][1]));
        g.closePath();
      }
      boxes[key] = g.currentPath;
    }
    return boxes[key];
  }
  // Rounded rectangles [[x, y, w, h], ...], filled and / or outlined (1 px inside the edge),
  // in one draw operation each.
  X.boxes = function (g, rects, r, fill, border, alpha) {
    if (!rects.length) return;
    if (fill) g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(fill, alpha)), boxPath(g, rects, r));
    if (border) {
      var inner = U.map(rects, function (q) { return [q[0] + 0.5, q[1] + 0.5, q[2] - 1, q[3] - 1]; });
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(border, alpha), 1), boxPath(g, inner, Math.max(0, r - 0.5)));
    }
  };
  X.box = function (g, x, y, w, h, r, fill, border, alpha) { X.boxes(g, [[x, y, w, h]], r, fill, border, alpha); };
  // The four corners outside a w x h box rounded with radius r, as one path (cached).
  function corners(g, w, h, r) {
    var k = Math.min(r, w / 2, h / 2), key = "c" + w + "x" + h + ":" + k;
    if (!U.has(boxes, key)) {
      var A = MK.icons.geom.arc, c = [[0, 0, k, k, 180], [w, 0, w - k, k, -90], [w, h, w - k, h - k, 0], [0, h, k, h - k, 90]];
      g.newPath();
      for (var i = 0; i < 4; i++) {
        var pts = A(c[i][2], c[i][3], k, k, c[i][4], c[i][4] + 90, 45);
        g.moveTo(c[i][0], c[i][1]);
        for (var j = 0; j < pts.length; j++) g.lineTo(r1(pts[j][0]), r1(pts[j][1]));
        g.closePath();
      }
      boxes[key] = g.currentPath;
    }
    return boxes[key];
  }
  // EffectCraft's native button fill at rest (egui's inactive fill in its dark theme).
  // shortcut: assumes the dark theme; read the theme's fill if EffectCraft gets a light one.
  var NATIVE = 23 / 255, under = {};
  // The brush that, at `alpha` over the native rest fill, comes out as `hex`. Channels brighter
  // than 23 + alpha * 232 can't be reached and come out darker.
  function underlay(g, hex, alpha) {
    var key = hex + "/" + alpha;
    if (!U.has(under, key)) under[key] = U.rgbToHex(U.map(U.hexToRgb(hex) || [0, 0, 0], function (v) { return (v - NATIVE * (1 - alpha)) / alpha; }));
    return g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(under[key], alpha));
  }
  // Hover highlight: EffectCraft's native button, which lightens under the pointer by itself
  // (no script event, no redraw), covered at 1 - hover % by a w x h box that rests at `fill`,
  // rounded with radius r when the corners are `outer` (left native when null). The corners
  // and the 1 px edge (`border`, rounded, when given) are opaque: they hide the native
  // button's outline. Draws nothing and returns false when hover is 0 or there is no fill.
  X.hoverBox = function (g, w, h, r, fill, outer, hover, border) {
    if (!(hover > 0) || !fill) return false;
    g.drawOSControl();
    var a = 1 - hover / 100, round = r > 0 && outer !== fill;
    if (round && outer) g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(outer)), corners(g, w, h, r));
    if (a > 0) g.fillPath(underlay(g, fill, a), round ? boxPath(g, [[0, 0, w, h]], r) : rect(g, 0, w, h));
    if (border || round) X.box(g, 0, 0, w, h, r, null, border || fill);
    else g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(fill), 1), rect(g, 0.5, w - 1, h - 1));
    return true;
  };
  // A one-segment rectangle path at (o, o).
  function rect(g, o, w, h) {
    g.newPath();
    g.rectPath(o, o, w, h);
    return g.currentPath;
  }
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
  // Dashed outlines 3 px inside cells [[x, y, w, h], ...] (edit mode), in one operation.
  X.dashes = function (g, rects, hex) {
    var on = 4, off = 3, a;
    g.newPath();
    for (var i = 0; i < rects.length; i++) {
      var x0 = rects[i][0] + 3, y0 = rects[i][1] + 3, x1 = rects[i][0] + rects[i][2] - 3, y1 = rects[i][1] + rects[i][3] - 3;
      for (a = x0; a < x1; a += on + off) { g.moveTo(a, y0); g.lineTo(Math.min(a + on, x1), y0); g.moveTo(a, y1); g.lineTo(Math.min(a + on, x1), y1); }
      for (a = y0; a < y1; a += on + off) { g.moveTo(x0, a); g.lineTo(x0, Math.min(a + on, y1)); g.moveTo(x1, a); g.lineTo(x1, Math.min(a + on, y1)); }
    }
    g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(hex, 0.5), 1));
  };
  // An inner button of widget `wd`: a filled rounded rectangle (with the hover highlight out
  // of edit mode) with a 24-grid icon at 70 % of its side.
  X.button = function (g, w, h, r, icon, wd) {
    if (!X.hoverBox(g, w, h, r, MK.THEME.button, wd.look.bg, wd.editing ? 0 : wd.style.hover)) X.box(g, 0, 0, w, h, r, MK.THEME.button);
    var s = Math.round(Math.min(w, h) * 0.7);
    MK.icons.draw(g, icon, Math.round((w - s) / 2), Math.round((h - s) / 2), s, wd.style.fg, wd.style.accent);
  };
  // The 2 px drop indicator: a white bar at x, from y, h tall.
  X.dropMark = function (g, x, y, h) {
    g.newPath();
    g.rectPath(x, y, 2, h);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#FFFFFF")));
  };
  return X;
})();

// Paints the frames of the cells at `rects`: backgrounds that differ from the panel's (bgs[i],
// one operation per colour), then every border in one operation. Cell `dim` (being dragged)
// gets a faint border instead; cells whose bgs[i] is null frame themselves.
MK.ui.frames = function (g, rects, bgs, style, dim) {
  var G = MK.ui.gfx, byBg = {}, order = [], plain = [];
  for (var i = 0; i < rects.length; i++) {
    if (i === dim || bgs[i] === null) continue;
    plain.push(rects[i]);
    if (bgs[i] === style.panelBg) continue;
    if (!MK.util.has(byBg, bgs[i])) {
      byBg[bgs[i]] = [];
      order.push(bgs[i]);
    }
    byBg[bgs[i]].push(rects[i]);
  }
  for (var k = 0; k < order.length; k++) G.boxes(g, byBg[order[k]], style.radius, order[k]);
  if (style.cellBorder) {
    G.boxes(g, plain, style.radius, null, style.cellBorder);
    if (dim >= 0 && rects[dim]) G.boxes(g, [rects[dim]], style.radius, null, style.cellBorder, 0.45);
  }
};

// Paints one button's content: icon and / or name, and the dot. With o.hover (the hover
// highlight strength) the button draws its own frame; otherwise the grid paints it.
// o: {w, h, compact, look, style, hover}.
MK.ui.paintCell = function (g, o) {
  var U = MK.util, L = o.look, w = o.w, h = o.h, s = o.style.cellSize;
  MK.ui.gfx.hoverBox(g, w, h, o.style.radius, L.bg, o.style.panelBg, o.hover, o.style.cellBorder);
  var font = null, lineH = 0, pen = null;
  if (L.showName) {
    font = ScriptUI.newFont("dialog", "REGULAR", U.clamp(Math.round(s * 0.24), 9, 12));
    lineH = Math.ceil(g.measureString("Ag", font)[1]);
    pen = g.newPen(g.PenType.SOLID_COLOR, U.rgba(L.fg), 1);
  }
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
// listeners drive: click({shift}), press(x, y), drag(x, y) and release() (x, y in the part;
// release returns false when the press turned out to be a click).
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
// `views` ({view, change(next)}) adds the view switcher. Returns the controller {host, index,
// rebuild(), items(), cells, grid, ...}.
MK.ui.buildPanel = function (host, index, views) {
  var U = MK.util, G = MK.ui.gfx;
  var P = { host: host, index: index, rev: -1, cols: 4, cells: [], widgets: [], drag: null, held: null, closed: false, filling: false, editing: false, views: views || null };
  P.key = "p" + (++MK.ui.seq);

  P.layout = function () { return P.state.layouts[P.state.active]; };
  P.items = function () { return P.layout().panels[P.index].items; };

  function clear() {
    for (var n = 0; n < 1000 && host.children.length; n++) host.remove(host.children[host.children.length - 1]);
  }

  // The title row, exactly `width` wide: title, layout list, pencil and gear at fixed places.
  // The list shrinks, then the title, so it never gets wider than `width`. With the view
  // switcher the title row has the title and the buttons, and a second row the view list and
  // the layout list, half each.
  function header(parent, pc, width) {
    var H = MK.ui.HEADER_H, B = MK.ui.ICON_BTN, GAP = 6, st = P.state, style = pc.style;
    var hdr = parent.add("group");
    hdr.orientation = "stack";
    hdr.margins = 0;
    hdr.preferredSize = [width, MK.ui.headerHeight(P.views)];
    hdr.mkRole = "header";
    P.header = hdr;
    var avail = width - 2 * B - 2 * GAP, need = Math.ceil(pc.title.length * 14 * 0.7) + 2;
    var dd = P.views ? Math.floor((width - GAP) / 2) : avail >= MK.ui.DD_MIN ? Math.min(MK.ui.DD_MAX, Math.max(MK.ui.DD_MIN, avail - need - GAP)) : 0;
    var tw = P.views ? avail : Math.max(0, avail - (dd ? dd + GAP : 0));
    // Where the layout list goes: beside the title, or on the second row after the view list.
    var lx = P.views ? width - dd : tw + GAP, ly = P.views ? H + MK.ui.HEADER_GAP : 0;
    P.viewList = P.views ? MK.ui.viewList(hdr, [0, ly + 1, dd, ly + H - 1], P.views) : null;
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
      var list = hdr.add("dropdownlist", [lx, ly + 1, lx + dd, ly + H - 1], names);
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
    P.pencil.onDraw = function () {
      G.hoverBox(this.graphics, B, B, 0, style.panelBg, null, style.hover);
      MK.ui.paintGlyph(this.graphics, B, B, MK.icons.builtin.pencil, P.editing ? style.accent : style.fg);
    };
    P.pencil.onClick = function () { P.setEditing(!P.editing); };
    P.gear = hdr.add("iconbutton", [width - B, y, width, y + B]);
    P.gear.helpTip = "Layout & Style… (move buttons between panels, colours, layouts, library)";
    P.gear.onDraw = function () {
      G.hoverBox(this.graphics, B, B, 0, style.panelBg, null, style.hover);
      MK.ui.paintGlyph(this.graphics, B, B, MK.icons.builtin.gear, style.fg);
    };
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
    var bgs = [];
    // The frames, edit-mode outlines and the drop mark of every cell, under the cells: one
    // draw operation each instead of a few per cell.
    g.onDraw = function () {
      var gr = this.graphics, d = P.drag, dragging = d && d.moved, R = geo.rects.slice(0, n);
      MK.ui.frames(gr, R, bgs, style, dragging ? d.from : -1);
      if (P.editing) G.dashes(gr, R, style.fg);
      if (dragging && d.slot >= 0 && n) {
        var at = R[Math.min(d.slot, n - 1)];
        G.dropMark(gr, d.slot < n ? at[0] : at[0] + at[2] - 2, at[1], at[3]);
      }
    };
    for (var i = 0; i < n; i++) {
      var r = geo.rects[i], look = MK.ui.look(items[i], style, P.state.library), cell;
      var widget = look.tool && look.tool.kind === "widget";
      // Tool buttons with the hover highlight draw their own frame (over the native button).
      bgs.push(widget || P.editing || !style.hover ? look.bg : null);
      if (widget) cell = widgetCell(g, i, r, look, style);
      else {
        cell = g.add("iconbutton", [r[0], r[1], r[0] + r[2], r[1] + r[3]]);
        cell.helpTip = look.name + " – " + look.description +
          (look.tool && MK.options.has(look.tool) ? "\nShift-click or right-click for options." : "") +
          (look.tool && look.tool.removable ? "\nAlt-click removes it from the selected properties or layers." : "") + (P.editing ? "\nDrag to reorder." : "");
        cell.onDraw = paint;
        // What it shows only changes with the settings, which rebuild the panel.
        cell.mkLook = look;
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
        G.dashes(gr, [[0, 0, ra[2], ra[3]]], style.fg);
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
        rm.onDraw = function () { MK.ui.paintGlyph(this.graphics, 14, 14, MK.icons.builtin.close, "#FFFFFF", MK.THEME.button); };
        P.removeButtons.push(rm);
      }
    }
    g.addEventListener("mousedown", down);
    g.addEventListener("mouseup", up);
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

  function paint() {
    var r = P.geo.rects[this.mkIndex];
    var style = P.layout().panels[P.index].style;
    MK.ui.paintCell(this.graphics, { w: r[2], h: r[3], compact: P.sz.compact, style: style, look: this.mkLook, hover: P.editing ? 0 : style.hover });
  }

  // A widget's cell: a group holding the widget's parts, over the frame the grid paints. A
  // widget that fails to build says why in its help tip.
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
    if (W.paint) cell.onDraw = function () { W.paint(this.graphics); };
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

  // The same control across a rebuild (which makes new ones): same role, item and part.
  function same(a, b) { return !!a && !!b && a.mkRole === b.mkRole && a.mkIndex === b.mkIndex && a.mkPart === b.mkPart; }

  // At rest a panel listens to mousedown and mouseup on its grid only: EffectCraft sends, and
  // redraws the panel after, just the events listeners want. While a press lasts the host also
  // hears the release (outside the grid too) and, when a drag needs it, the grid hears mousemove.
  function hold(moves) {
    letGo();
    host.addEventListener("mouseup", outside);
    if (moves) P.grid.addEventListener("mousemove", move);
    P.held = { moves: moves, grid: P.grid };
  }
  function letGo() {
    if (!P.held) return;
    host.removeEventListener("mouseup", outside);
    if (P.held.moves) P.held.grid.removeEventListener("mousemove", move);
    P.held = null;
  }
  P.follows = function () { return !!(P.held && P.held.moves); };

  function down(e) {
    var xy = gridXY(e), t = e.target;
    if (!xy) return;
    // Catch up with settings saved elsewhere first. The press then goes to whatever is at the
    // same place in the rebuilt grid.
    if (MK.settings.rev() !== P.rev) P.rebuild();
    var i = cellAt(xy), opt = e.shiftKey || e.button === 2;
    if (t.mkRole === "remove" || t.mkRole === "add") {
      P.drag = { button: t };
      hold(false);
      return;
    }
    if (P.editing) {
      P.drag = i >= 0 ? { from: i, start: xy, moved: false, slot: -1 } : null;
      if (P.drag) hold(true);
      return;
    }
    if (t.mkRole === "field") {
      P.drag = null;
      return;
    }
    if (t.mkRole === "part") {
      P.drag = { part: t, shift: opt };
      if (!opt && t.mkPress) t.mkPress(xy[0] - t.mkGX, xy[1] - t.mkGY);
      hold(!opt && !!t.mkDrag);
      return;
    }
    P.drag = { from: i, start: xy, moved: false, slot: -1, options: opt, remove: !!e.altKey };
    hold(false);
  }

  function move(e) {
    var xy = gridXY(e), d = P.drag;
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

  // Ends a part's press: a slider's release, or a click when released on the same part.
  function endPart(d, t) {
    var W = P.widgets[d.part.mkIndex];
    if (d.shift && W && W.onShift) {
      if (same(t, d.part)) W.onShift();
      return;
    }
    // A release handler returns false when nothing was dragged: then it is a click.
    if (!d.shift && d.part.mkRelease && d.part.mkRelease() !== false) return;
    if (same(t, d.part) && t.mkClick) t.mkClick({ shift: d.shift });
  }

  function up(e) {
    letGo();
    var d = P.drag, xy = gridXY(e), t = e.target;
    P.drag = null;
    if (!d) return;
    if (d.button) {
      if (same(t, d.button) && t.mkClick) t.mkClick();
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
    P.activate(d.from, options, d.remove || !!e.altKey);
  }
  // Runs button i, opens its options, or (remove: Alt-click) takes what it wrote off the
  // selection. Alt-click on a tool that can't do that explains instead of running it.
  P.activate = function (i, options, remove) {
    var item = P.items()[i];
    if (!item) return null;
    var d = MK.describe(item.id, P.state.library), r = null, tool = MK.tools[item.id];
    if (d.missing) MK.prompts.alert("\"" + item.id + "\": " + d.description);
    else if (remove && tool && tool.removable) r = MK.remove(item.id);
    else if (remove) MK.prompts.alert(d.name + ": Alt-click removes what a tool added, and only " + MK.ui.removableNames() + " can do that.");
    else if (options && tool) r = MK.ui.openOptions(item.id);
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
    letGo();
    P.drag = null;
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
    // With the view switcher the header always shows: it is the only way to another view.
    var showHeader = !style.hideTitle || !n || !!P.views;
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
  function outside() {
    letGo();
    var d = P.drag;
    P.drag = null;
    if (d && d.part && !d.shift && d.part.mkRelease) d.part.mkRelease();
  }
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

// The entry point: builds the UI for a dist file. panel is MK_PANEL (1-4, "all" for
// Motion Kit.jsx with its view switcher, "menu", or null for no UI). In an installed panel `thisObj` is the Panel;
// from File > Scripts it is not, and a palette window opens.
MK.ui.start = function (thisObj, panel) {
  if (panel === null) return null;
  var isPanel = typeof Panel !== "undefined" && thisObj instanceof Panel;
  if (!isPanel && panel === undefined) return null;
  var p = panel === undefined ? 1 : panel === "all" ? MK.layout.N_PANELS : panel;
  var title = p === "menu" ? MK.NAME + " Menu" : p === MK.layout.N_PANELS ? MK.NAME : MK.NAME + " " + p;
  var host = isPanel ? thisObj : new Window("palette", title, undefined, { resizeable: true });
  if (panel === "all") MK.ui.startViews(host);
  else if (p === "menu") MK.ui.buildMenu(host);
  else MK.ui.buildPanel(host, MK.util.clamp((Math.round(Number(p)) || 1) - 1, 0, MK.layout.N_PANELS - 1));
  if (host instanceof Window) {
    host.center();
    host.show();
  } else {
    try { host.layout.layout(true); } catch (e) {}
  }
  return host;
};
