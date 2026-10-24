// SPDX-License-Identifier: MIT OR Apache-2.0
// The panel UI: a header (title, layout list, the Layout & Style button, the command box) and a
// grid of custom-drawn tool buttons. Click runs a tool, Shift-click or right-click opens its
// options, dragging a button more than 4 px reorders it. Each panel polls the settings `rev`
// and rebuilds when another panel (or the dialog) saved something.
//
// Mouse events reach the control under the pointer with clientX/Y relative to it. The grid's
// listeners turn those into grid coordinates from the known cell size and spacing (rows and
// cells are laid out top-left with that spacing), so no layout bounds are needed.

MK.ui = {};
MK.ui.seq = 0;
MK.ui.POLL_MS = 700;
MK.ui.DRAG_PX = 4;
MK.ui.dist = function (a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); };
// Replaced by tests: how a button opens options and the Layout & Style dialog.
MK.ui.openOptions = function (id) { return MK.optionsDialog.open(id); };
MK.ui.openLayoutDialog = function (panelIndex, tab) { return MK.layoutDialog.open(panelIndex, tab); };

// Cell width and height for a style: icon and name modes are cellSize square; iconName is
// wider, with the name under the icon, or beside it when cellSize is 32 or less.
MK.ui.cellSize = function (style) {
  var s = style.cellSize;
  if (style.buttonMode !== "iconName") return { w: s, h: s, compact: false };
  return s > 32 ? { w: Math.round(s * 1.6), h: s + 12, compact: false } : { w: s + 88, h: s, compact: true };
};

MK.ui.columnsFor = function (width, cellW, spacing) {
  if (!(width > 0)) return 4;
  return Math.max(1, Math.floor((width + spacing) / (cellW + spacing)));
};

// What a button shows: name, icon, image, colours, and whether it is missing or flagged.
MK.ui.look = function (item, style, library) {
  var id = item.id, tool = MK.tools[id];
  var lib = !tool && id.indexOf("lib:") === 0 && MK.library ? MK.library.find(library || MK.library.list(), id) : null;
  var d = MK.describe(id, library);
  var cat = tool ? tool.category : lib ? "Library" : null;
  var look = {
    id: id, name: item.name || d.name, description: d.description, missing: d.missing, tool: tool, lib: lib,
    accent: item.accent || (lib && lib.accent) || (cat ? MK.ACCENTS[cat] : "#8A8A8A"),
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

// Paints one button. o: {w, h, compact, look, style, hover, dimmed, dropLeft, dropRight}.
MK.ui.paintCell = function (g, o) {
  var U = MK.util, L = o.look, w = o.w, h = o.h, s = o.style.cellSize;
  var bg = o.hover ? U.mixHex(L.bg, "#FFFFFF", 0.14) : L.bg;
  g.newPath();
  g.rectPath(0, 0, w, h);
  g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(bg, o.dimmed ? 0.45 : 1)));
  if (o.style.cellBorder) {
    g.newPath();
    g.rectPath(0.5, 0.5, w - 1, h - 1);
    g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(o.style.cellBorder), 1));
  }
  var font = ScriptUI.newFont("dialog", "REGULAR", U.clamp(Math.round(s * 0.24), 9, 12));
  var lineH = Math.ceil(g.measureString("Ag", font)[1]);
  var pen = g.newPen(g.PenType.SOLID_COLOR, U.rgba(L.fg), 1);
  var isz = Math.round(s * (o.compact ? 0.6 : 0.55));
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
  if (L.dot) {
    g.newPath();
    g.ellipsePath(w - 9, 3, 6, 6);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(L.accent)));
  }
  if (o.dropLeft || o.dropRight) {
    var x = o.dropLeft ? 0 : w - 2;
    g.newPath();
    g.rectPath(x, 0, 2, h);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba("#FFFFFF")));
  }
};

// Builds panel `index` (0-3) of the active layout into `host` (a Panel or a palette Window).
// Returns the controller {host, index, rebuild(), items(), cells, grid, ...}.
MK.ui.buildPanel = function (host, index) {
  var U = MK.util;
  var P = { host: host, index: index, rev: -1, cols: 4, cells: [], drag: null, hover: -1, closed: false, filling: false };
  P.key = "p" + (++MK.ui.seq);

  P.layout = function () { return P.state.layouts[P.state.active]; };
  P.items = function () { return P.layout().panels[P.index].items; };

  function width() {
    var b = host.bounds;
    var m = U.isArray(host.margins) ? host.margins[0] + host.margins[2] : 2 * (Number(host.margins) || 0);
    return b && b[2] - b[0] > 0 ? b[2] - b[0] - m : 0;
  }

  function clear() {
    for (var n = 0; n < 1000 && host.children.length; n++) host.remove(host.children[host.children.length - 1]);
  }

  function header(pc) {
    var st = P.state;
    var hdr = host.add("group");
    hdr.orientation = "row";
    hdr.alignChildren = ["left", "center"];
    hdr.alignment = ["fill", "top"];
    hdr.spacing = 4;
    P.title = hdr.add("statictext", undefined, pc.title);
    var names = U.keys(st.layouts);
    P.filling = true;
    var dd = hdr.add("dropdownlist", undefined, names);
    dd.selection = U.indexOf(names, st.active);
    dd.helpTip = "Layout";
    P.filling = false;
    dd.onChange = function () {
      if (P.filling || !dd.selection) return;
      var n = dd.selection.text;
      if (n === P.state.active) return;
      try {
        MK.layout.switchTo(n);
      } catch (e) {
        MK.prompts.alert(U.errText(e));
      }
      P.rebuild();
    };
    P.layoutList = dd;
    var gear = hdr.add("button", undefined, "⚙");
    gear.preferredSize = [28, 22];
    gear.helpTip = "Layout & Style… (move buttons between panels, colours, layouts, library)";
    gear.onClick = function () {
      MK.ui.openLayoutDialog(P.index);
      P.refresh();
    };
    P.gear = gear;
    if (pc.style.showCommandBox && MK.commandBox) P.commandBox = MK.commandBox.attach(hdr, { after: function () { P.refresh(); } });
  }

  function grid(pc) {
    var sz = MK.ui.cellSize(pc.style), sp = pc.style.spacing, items = pc.items;
    P.sz = sz;
    P.sp = sp;
    P.cols = MK.ui.columnsFor(width(), sz.w, sp);
    var g = host.add("group");
    g.orientation = "column";
    g.alignChildren = ["left", "top"];
    g.alignment = ["fill", "top"];
    g.spacing = sp;
    g.margins = 0;
    g.mkRole = "grid";
    P.grid = g;
    P.cells = [];
    if (pc.style.panelBg) {
      g.onDraw = function () {
        var gr = this.graphics, b = this.size;
        gr.newPath();
        gr.rectPath(0, 0, b[0] || P.cols * (sz.w + sp), b[1] || 1000);
        gr.fillPath(gr.newBrush(gr.BrushType.SOLID_COLOR, U.rgba(pc.style.panelBg)));
      };
    }
    if (!items.length) {
      var t = g.add("statictext", undefined, "No buttons yet. Click ⚙ to add tools.");
      t.mkRole = "empty";
    }
    var row = null;
    for (var i = 0; i < items.length; i++) {
      var r = Math.floor(i / P.cols), c = i % P.cols;
      if (c === 0) {
        row = g.add("group");
        row.orientation = "row";
        row.alignChildren = ["left", "top"];
        row.spacing = sp;
        row.margins = 0;
        row.mkRole = "row";
        row.mkRow = r;
      }
      var cell = row.add("group");
      cell.preferredSize = [sz.w, sz.h];
      cell.mkRole = "cell";
      cell.mkIndex = i;
      cell.mkRow = r;
      cell.mkCol = c;
      cell.mkId = items[i].id;
      var look = MK.ui.look(items[i], pc.style, P.state.library);
      cell.helpTip = look.name + " – " + look.description +
        (look.tool && MK.options.has(look.tool) ? "\nShift-click or right-click for options." : "") + "\nDrag to reorder.";
      cell.onDraw = paint;
      P.cells.push(cell);
    }
    g.addEventListener("mousedown", down);
    g.addEventListener("mousemove", move);
    g.addEventListener("mouseup", up);
    g.addEventListener("mouseout", out);
  }

  function paint() {
    var i = this.mkIndex, items = P.items(), pc = P.layout().panels[P.index], d = P.drag;
    if (!items[i]) return;
    var dragging = d && d.moved;
    MK.ui.paintCell(this.graphics, {
      w: P.sz.w, h: P.sz.h, compact: P.sz.compact, style: pc.style,
      look: MK.ui.look(items[i], pc.style, P.state.library),
      hover: !dragging && P.hover === i, dimmed: dragging && d.from === i,
      dropLeft: dragging && d.slot === i, dropRight: dragging && d.slot === items.length && i === items.length - 1
    });
  }

  // Event position -> grid coordinates, or null when it isn't over the grid.
  function gridXY(e) {
    var t = e.target, x = e.clientX, y = e.clientY;
    if (t && t.mkRole === "cell") return [x + t.mkCol * (P.sz.w + P.sp), y + t.mkRow * (P.sz.h + P.sp)];
    if (t && t.mkRole === "row") return [x, y + t.mkRow * (P.sz.h + P.sp)];
    if (t === P.grid) return [x, y];
    return null;
  }
  P.gridXY = gridXY;

  // The button under a grid point, or -1.
  function cellAt(xy) {
    var cw = P.sz.w + P.sp, ch = P.sz.h + P.sp;
    var c = Math.floor(xy[0] / cw), r = Math.floor(xy[1] / ch);
    if (c < 0 || r < 0 || c >= P.cols || xy[0] - c * cw >= P.sz.w || xy[1] - r * ch >= P.sz.h) return -1;
    var i = r * P.cols + c;
    return i < P.items().length ? i : -1;
  }
  P.cellAt = cellAt;

  // The insertion slot (0..n) nearest a grid point, or -1 when it is off the grid.
  function slotAt(xy) {
    var n = P.items().length, ch = P.sz.h + P.sp, rows = Math.ceil(n / P.cols);
    var r = Math.floor(xy[1] / ch);
    if (xy[1] < -P.sp || r >= rows + 1 || xy[0] < -P.sp) return -1;
    r = U.clamp(r, 0, rows - 1);
    var c = U.clamp(Math.round(xy[0] / (P.sz.w + P.sp)), 0, P.cols);
    return Math.min(r * P.cols + c, n);
  }
  P.slotAt = slotAt;

  function down(e) {
    var xy = gridXY(e);
    if (!xy) return;
    var i = cellAt(xy);
    P.drag = { from: i, start: xy, moved: false, slot: -1, options: e.shiftKey || e.button === 2 };
  }

  function move(e) {
    var xy = gridXY(e), d = P.drag;
    P.hover = xy ? cellAt(xy) : -1;
    if (!d || d.from < 0 || !xy) return;
    if (!d.moved && MK.ui.dist(xy, d.start) > MK.ui.DRAG_PX) d.moved = true;
    if (d.moved) d.slot = slotAt(xy);
  }

  function out(e) {
    if (e.target && e.target.mkRole === "cell" && e.target.mkIndex === P.hover) P.hover = -1;
  }

  function up(e) {
    e.mkOnGrid = true;
    var d = P.drag, xy = gridXY(e);
    P.drag = null;
    if (!d) return;
    if (d.moved) {
      if (xy) P.drop(d.from, slotAt(xy));
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
    if (xy && cellAt(xy) === d.from) P.activate(d.from, options);
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

  P.rebuild = function () {
    if (P.closed) return;
    P.state = MK.layout.state();
    P.rev = MK.settings.rev();
    var pc = P.layout().panels[P.index];
    P.drag = null;
    P.hover = -1;
    P.commandBox = null;
    clear();
    host.orientation = "column";
    host.alignChildren = ["fill", "top"];
    host.spacing = 6;
    host.margins = 6;
    if (pc.style.panelBg) try { host.graphics.backgroundColor = host.graphics.newBrush(host.graphics.BrushType.SOLID_COLOR, U.rgba(pc.style.panelBg)); } catch (e) {}
    // A hidden title row comes back for an empty panel, or nothing could add buttons.
    if (!pc.style.hideTitle || !pc.items.length) header(pc);
    grid(pc);
    try { host.layout.layout(true); } catch (e2) {}
  };

  // Rebuilds when settings changed since the last build (or the width fits other columns).
  P.refresh = function () {
    if (P.closed) return;
    if (MK.settings.rev() !== P.rev) P.rebuild();
    else if (P.sz && MK.ui.columnsFor(width(), P.sz.w, P.sp) !== P.cols) P.rebuild();
  };

  P.close = function () {
    if (P.closed) return;
    P.closed = true;
    if (P.taskId) try { app.cancelTask(P.taskId); } catch (e) {}
    delete MK.ui.live[P.key];
  };

  // A drop outside the grid does nothing: forget the drag.
  host.addEventListener("mouseup", function (e) {
    if (!e.mkOnGrid) P.drag = null;
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

// The entry point: builds the UI for a dist file. panel is MK_PANEL (1-4, "menu", or null for
// no UI). In an installed panel `thisObj` is the Panel; from File > Scripts it is not, and a
// palette window opens.
MK.ui.start = function (thisObj, panel) {
  if (panel === null) return null;
  var isPanel = typeof Panel !== "undefined" && thisObj instanceof Panel;
  if (!isPanel && panel === undefined) return null;
  var p = panel === undefined ? 1 : panel;
  var host = isPanel ? thisObj : new Window("palette", MK.NAME + (p === "menu" ? " Menu" : " " + p), undefined, { resizeable: true });
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
