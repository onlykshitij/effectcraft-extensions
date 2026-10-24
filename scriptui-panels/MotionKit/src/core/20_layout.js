// SPDX-License-Identifier: MIT OR Apache-2.0
// The layout model. A Layout is {panels: [PanelCfg x 5]}; PanelCfg is {title, style, items};
// an item is {id, name?, showIcon?, showName?, bg?, accent?, fg?}. Panel and item indices are
// 0-based; panel 5 (index 4) is the combined "Motion Kit" panel. The operations are pure: they
// validate their input and return a new Layout.
// Named layouts live in settings (layouts, activeLayout) with the user library; the `ops`
// functions work on a state object {layouts, active, library} so the Layout & Style dialog
// can edit a copy and save it on OK. pack() places items with spans on the panel grid.

MK.layout = (function () {
  var U = MK.util;
  var N_PANELS = 5;
  var MODES = ["icon", "name", "iconName"];
  var DEFAULT_PANELS = [
    ["Animate", ["bounce", "elastic", "loop", "easeKeys", "easeCopy", "sequencer", "cloneKeys", "fixKeys"]],
    ["Rig", ["limb", "parentNull", "nullsPoints", "sliderToPath", "positionTrace", "moveAnchor"]],
    ["Shapes", ["extractShapes", "mergeShapes", "selector", "strokeStyle", "shapesFromVector", "collectColors"]],
    ["Comp", ["cropComp", "unprecomp", "duplicateComp", "gifExport"]]
  ];
  // Panel 5: the widgets, then every tool of panels 1-4 except the two the widgets replace
  // (Key Copy/Paste covers easeCopy, Anchor covers moveAnchor).
  DEFAULT_PANELS.push(["Motion Kit", ["ease", "keyCopyPaste", "interpolation", "anchor", "sequencerWidget"].concat(U.filter(
    [].concat(DEFAULT_PANELS[0][1], DEFAULT_PANELS[1][1], DEFAULT_PANELS[2][1], DEFAULT_PANELS[3][1]),
    function (id) { return id !== "easeCopy" && id !== "moveAnchor"; }))]);
  var ITEM_COLORS = ["bg", "accent", "fg"];

  function defaultStyle(p) {
    return {
      cellSize: 56, spacing: 10, columns: 4, panelBg: "#0D1B21", cellBg: "#0D1B21", cellBorder: "#2A3B42",
      buttonMode: "icon", hideTitle: false, fg: "#FFFFFF", accent: "#F27A7A", radius: 6, hover: 40, showCommandBox: p === 0
    };
  }
  // Motion Kit 0.1 (four panels) saved every style key; the values it used as defaults become
  // this version's defaults when such a layout loads. Values a user changed are kept.
  var V1_STYLE = { cellSize: 44, spacing: 4, panelBg: null, cellBg: "#2B2B2B", cellBorder: null, buttonMode: "iconName", fg: "#D8D8D8" };

  // One rule per style key: the valid form of `v`, or undefined to keep the fallback.
  var STYLE_RULES = {
    cellSize: function (v) { return U.isNum(v) ? U.clamp(Math.round(v), 24, 96) : undefined; },
    spacing: function (v) { return U.isNum(v) ? U.clamp(Math.round(v), 0, 32) : undefined; },
    columns: function (v) { return U.isNum(v) ? U.clamp(Math.round(v), 1, 12) : undefined; },
    panelBg: function (v) { return v === null ? null : U.normHex(v) || undefined; },
    cellBg: function (v) { return U.normHex(v) || undefined; },
    cellBorder: function (v) { return v === null ? null : U.normHex(v) || undefined; },
    buttonMode: function (v) { return U.indexOf(MODES, v) >= 0 ? v : undefined; },
    hideTitle: function (v) { return typeof v === "boolean" ? v : undefined; },
    fg: function (v) { return U.normHex(v) || undefined; },
    accent: function (v) { return U.normHex(v) || undefined; },
    radius: function (v) { return U.isNum(v) ? U.clamp(Math.round(v), 0, 16) : undefined; },
    // Hover highlight strength in %: 0 is off, 100 the plain native button.
    hover: function (v) { return U.isNum(v) ? U.clamp(Math.round(v), 0, 100) : undefined; },
    showCommandBox: function (v) { return typeof v === "boolean" ? v : undefined; }
  };

  function applyStyle(base, s) {
    var out = U.clone(base);
    if (!s || typeof s !== "object") return out;
    for (var k in STYLE_RULES) {
      if (!U.has(STYLE_RULES, k) || !U.has(s, k)) continue;
      var v = STYLE_RULES[k](s[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function normId(id) {
    var s = typeof id === "string" ? U.trim(id) : "";
    return s && s.length <= 128 ? s : null;
  }

  function normText(s, max) {
    var t = typeof s === "string" ? U.trim(s) : "";
    return t && t.length <= max ? t : null;
  }

  // A valid item, or null to drop it. Unknown ids are kept: they draw as "missing".
  function normItem(it) {
    var id = normId(typeof it === "string" ? it : it && it.id);
    if (!id) return null;
    var out = { id: id };
    if (!it || typeof it !== "object") return out;
    var name = normText(it.name, 64);
    if (name) out.name = name;
    if (typeof it.showIcon === "boolean") out.showIcon = it.showIcon;
    if (typeof it.showName === "boolean") out.showName = it.showName;
    for (var i = 0; i < ITEM_COLORS.length; i++) {
      var c = U.normHex(it[ITEM_COLORS[i]]);
      if (c) out[ITEM_COLORS[i]] = c;
    }
    return out;
  }

  // v1 is true for a layout saved by Motion Kit 0.1 (exactly four panels).
  function normPanel(pc, p, v1) {
    var o = pc && typeof pc === "object" ? pc : {};
    if (v1 && p >= 4) return defaultPanel(p);
    var items = [], seen = {};
    var list = U.isArray(o.items) ? o.items : [];
    for (var i = 0; i < list.length; i++) {
      var it = normItem(list[i]);
      if (it && !U.has(seen, it.id)) {
        seen[it.id] = 1;
        items.push(it);
      }
    }
    var style = o.style && typeof o.style === "object" ? U.clone(o.style) : {};
    if (v1) for (var k in V1_STYLE) if (U.has(V1_STYLE, k) && style[k] === V1_STYLE[k]) delete style[k];
    return { title: normText(o.title, 64) || "Panel " + (p + 1), style: applyStyle(defaultStyle(p), style), items: items };
  }

  function defaultPanel(p) {
    return { title: DEFAULT_PANELS[p][0], style: defaultStyle(p), items: U.map(DEFAULT_PANELS[p][1], function (id) { return { id: id }; }) };
  }

  // Any value -> a valid Layout (a fresh object; the input is never changed).
  function normalize(l) {
    var src = l && typeof l === "object" && U.isArray(l.panels) ? l.panels : [];
    var panels = [];
    for (var p = 0; p < N_PANELS; p++) panels.push(normPanel(src[p], p, src.length === 4));
    return { panels: panels };
  }

  function defaultLayout() {
    var panels = [];
    for (var p = 0; p < N_PANELS; p++) panels.push(defaultPanel(p));
    return { panels: panels };
  }

  function emptyLayout() { return normalize({ panels: [] }); }

  function defaultIds() {
    var out = [];
    for (var p = 0; p < DEFAULT_PANELS.length; p++) out = out.concat(DEFAULT_PANELS[p][1]);
    return out;
  }

  function panelAt(l, p) {
    if (!(p === Math.floor(p) && p >= 0 && p < N_PANELS)) MK.fail("Panel " + p + " doesn't exist (0 to " + (N_PANELS - 1) + ").");
    return l.panels[p];
  }

  function itemIndex(items, i) {
    if (!(i === Math.floor(i) && i >= 0 && i < items.length)) MK.fail("There is no button " + i + " in that panel.");
    return i;
  }

  // First-fit packing for the panel grid: spans [[cols, rows], ...] in item order go into a grid
  // `columns` wide, each at the first free area scanning row by row, so later 1 x 1 items fill
  // the holes beside bigger ones. Widths are clamped to the column count. The grid uses only
  // as many columns as the items' widths add up to. Returns {cols, rows, at: [[col, row]...],
  // spans: [[cols, rows]...]} (the clamped spans).
  function pack(spans, columns) {
    var max = Math.max(1, Math.round(columns) || 1), list = [], total = 0, i;
    for (i = 0; i < spans.length; i++) {
      var s = U.isArray(spans[i]) ? spans[i] : [1, 1];
      var w = U.clamp(Math.round(s[0]) || 1, 1, max), h = Math.max(1, Math.round(s[1]) || 1);
      list.push([w, h]);
      total += w;
    }
    var cols = Math.min(max, total), busy = {}, at = [], rows = 0;
    function free(c, r, w, h) {
      for (var y = r; y < r + h; y++) for (var x = c; x < c + w; x++) if (busy[y + ":" + x]) return false;
      return true;
    }
    for (i = 0; i < list.length; i++) {
      var sw = list[i][0], sh = list[i][1], done = false;
      for (var r = 0; !done; r++) {
        for (var c = 0; c + sw <= cols && !done; c++) {
          if (!free(c, r, sw, sh)) continue;
          for (var y = r; y < r + sh; y++) for (var x = c; x < c + sw; x++) busy[y + ":" + x] = true;
          at.push([c, r]);
          rows = Math.max(rows, r + sh);
          done = true;
        }
      }
    }
    return { cols: cols, rows: rows, at: at, spans: list };
  }

  function findId(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  }

  // ---- operations (pure)

  // Moves an item; `toIndex` is its index after the move.
  function moveItem(layout, fromPanel, fromIndex, toPanel, toIndex) {
    var l = normalize(layout);
    var src = panelAt(l, fromPanel).items, dst = panelAt(l, toPanel).items;
    var item = src.splice(itemIndex(src, fromIndex), 1)[0];
    if (fromPanel !== toPanel && findId(dst, item.id) >= 0) MK.fail("That panel already has this button.");
    var at = U.isNum(toIndex) ? U.clamp(Math.round(toIndex), 0, dst.length) : dst.length;
    dst.splice(at, 0, item);
    return l;
  }

  // Adds a button (at the end unless `index` is given). A panel holds each id once.
  function addItem(layout, panel, id, index) {
    var l = normalize(layout);
    var items = panelAt(l, panel).items;
    var it = normItem(id);
    if (!it) MK.fail("A button needs a tool id.");
    if (findId(items, it.id) >= 0) return l;
    var at = U.isNum(index) ? U.clamp(Math.round(index), 0, items.length) : items.length;
    items.splice(at, 0, it);
    return l;
  }

  function removeItem(layout, panel, index) {
    var l = normalize(layout);
    var items = panelAt(l, panel).items;
    items.splice(itemIndex(items, index), 1);
    return l;
  }

  // Merges `partial` into the panel's style; invalid values keep the current ones.
  function setStyle(layout, panel, partial) {
    var l = normalize(layout);
    var pc = panelAt(l, panel);
    pc.style = applyStyle(pc.style, partial);
    return l;
  }

  // Merges overrides into one button. null, undefined or "" removes an override; invalid values
  // keep the current one. The id can't change.
  function setItem(layout, panel, index, partial) {
    var l = normalize(layout);
    var items = panelAt(l, panel).items;
    var it = items[itemIndex(items, index)];
    var p = partial && typeof partial === "object" ? partial : {};
    var keys = ["name", "showIcon", "showName"].concat(ITEM_COLORS);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!U.has(p, key)) continue;
      var v = p[key];
      if (v === null || v === undefined || v === "") {
        delete it[key];
        continue;
      }
      var probe = { id: it.id };
      probe[key] = v;
      var ok = normItem(probe);
      if (U.has(ok, key)) it[key] = ok[key];
    }
    return l;
  }

  function renamePanel(layout, panel, title) {
    var l = normalize(layout);
    var t = normText(title, 64);
    if (!t) MK.fail("A panel title needs 1 to 64 characters.");
    panelAt(l, panel).title = t;
    return l;
  }

  // ---- named layouts: pure functions of a state {layouts: {name: Layout}, active, library}

  function normName(s) { return normText(s, 64); }

  function names(st) { return U.keys(st.layouts); }

  function normState(st) {
    var out = { layouts: {}, active: null, library: [] };
    var src = st && st.layouts && typeof st.layouts === "object" && !U.isArray(st.layouts) ? st.layouts : {};
    for (var k in src) {
      if (!U.has(src, k)) continue;
      var n = normName(k);
      if (n && !U.has(out.layouts, n)) out.layouts[n] = normalize(src[k]);
    }
    if (!names(out).length) out.layouts.Default = defaultLayout();
    out.active = typeof st.active === "string" && U.has(out.layouts, st.active) ? st.active : names(out)[0];
    out.library = MK.library ? MK.library.normalizeList(st && st.library) : [];
    return out;
  }

  function needLayout(st, name) {
    if (!U.has(st.layouts, name)) MK.fail("There is no layout named \"" + name + "\".");
  }

  function freshName(st, name) {
    var n = normName(name);
    if (!n) MK.fail("A layout name needs 1 to 64 characters.");
    if (U.has(st.layouts, n)) MK.fail("There is already a layout named \"" + n + "\".");
    return n;
  }

  var ops = {
    // mode "empty" (five empty panels) or "duplicate" (a copy of the active layout). The new
    // layout becomes the active one.
    add: function (state, name, mode) {
      var st = normState(state), n = freshName(st, name);
      st.layouts[n] = mode === "duplicate" ? U.clone(st.layouts[st.active]) : emptyLayout();
      st.active = n;
      return st;
    },
    rename: function (state, oldName, newName) {
      var st = normState(state);
      needLayout(st, oldName);
      if (normName(newName) === oldName) return st;
      var n = freshName(st, newName), out = {};
      // Keep the list order.
      for (var k in st.layouts) if (U.has(st.layouts, k)) out[k === oldName ? n : k] = st.layouts[k];
      st.layouts = out;
      if (st.active === oldName) st.active = n;
      return st;
    },
    remove: function (state, name) {
      var st = normState(state);
      needLayout(st, name);
      if (names(st).length < 2) MK.fail("The last layout can't be deleted.");
      delete st.layouts[name];
      if (st.active === name) st.active = names(st)[0];
      return st;
    },
    switchTo: function (state, name) {
      var st = normState(state);
      needLayout(st, name);
      st.active = name;
      return st;
    },
    resetToDefault: function (state, name) {
      var st = normState(state);
      needLayout(st, name);
      st.layouts[name] = defaultLayout();
      return st;
    },
    // Back to the single Default layout. The library is kept.
    resetAll: function (state) {
      var st = normState(state);
      st.layouts = { Default: defaultLayout() };
      st.active = "Default";
      return st;
    },
    setLayout: function (state, name, layout) {
      var st = normState(state);
      needLayout(st, name);
      st.layouts[name] = normalize(layout);
      return st;
    },
    exportJson: function (state) {
      var st = normState(state);
      return JSON.stringify({ format: "motionkit", version: 1, active: st.active, layouts: st.layouts, library: st.library }, null, 2);
    },
    // mode "replace": everything comes from the text. "merge": its layouts and library items are
    // added, renamed when a name is taken (library items get new ids when theirs is taken by a
    // different item, and the merged layouts follow).
    importJson: function (state, text, mode) {
      var data;
      try {
        data = JSON.parse(String(text));
      } catch (e) {
        MK.fail("That isn't a Motion Kit layout file (the JSON doesn't parse: " + U.errText(e) + ").");
      }
      if (!data || typeof data !== "object" || U.isArray(data)) MK.fail("That isn't a Motion Kit layout file.");
      if (U.isArray(data.panels)) data = { layouts: { Imported: data } };
      if (!data.layouts || typeof data.layouts !== "object" || !U.keys(data.layouts).length) MK.fail("That file has no Motion Kit layouts.");
      var inc = normState({ layouts: data.layouts, active: data.active, library: data.library });
      if (mode !== "merge") return inc;
      var st = normState(state), idMap = {};
      for (var i = 0; i < inc.library.length; i++) {
        var item = inc.library[i], same = MK.library.find(st.library, item.id);
        if (same && JSON.stringify(same) === JSON.stringify(item)) continue;
        if (same) {
          var nid = MK.library.newId(st.library.concat(inc.library));
          idMap[item.id] = nid;
          item.id = nid;
        }
        item.name = U.uniqueName(item.name, function (n) {
          for (var j = 0; j < st.library.length; j++) if (st.library[j].name === n) return true;
          return false;
        });
        st.library.push(item);
      }
      for (var k in inc.layouts) {
        if (!U.has(inc.layouts, k)) continue;
        var l = inc.layouts[k];
        for (var p = 0; p < l.panels.length; p++) {
          var its = l.panels[p].items;
          for (var q = 0; q < its.length; q++) if (U.has(idMap, its[q].id)) its[q].id = idMap[its[q].id];
        }
        st.layouts[U.uniqueName(k, function (n) { return U.has(st.layouts, n); })] = l;
      }
      return st;
    }
  };

  // ---- the stored state

  function state() {
    return normState({ layouts: MK.settings.get("layouts", null), active: MK.settings.get("activeLayout", null), library: MK.settings.get("library", []) });
  }

  function commit(st) {
    var s = normState(st);
    MK.settings.setMany({ layouts: s.layouts, activeLayout: s.active, library: s.library });
    return s;
  }

  function stored(op) {
    return function () {
      var args = [state()].concat(Array.prototype.slice.call(arguments));
      return commit(op.apply(null, args));
    };
  }

  // ---- files

  var GATE_HINT = "turn on Preferences ▸ Scripting & Expressions ▸ Allow Scripts to Write Files and Access Network, then try again";

  function toFile(f) {
    if (!f) return null;
    return f instanceof File ? f : new File(String(f));
  }

  // Writes text to `file` (a File or path; null asks with a save dialog). Returns the File, or
  // null when the user cancels.
  function writeFile(file, text) {
    var f = toFile(file) || File.saveDialog("Save Motion Kit layouts", "JSON:*.json");
    if (!f) return null;
    try {
      f.encoding = "UTF-8";
      if (!f.open("w")) throw new Error(f.error || "it can't be opened");
      f.write(text);
      f.close();
    } catch (e) {
      var m = U.errText(e);
      if (/Allow Scripts to Write Files/.test(m)) MK.fail("EffectCraft doesn't let scripts write files yet: " + GATE_HINT + ".");
      MK.fail("Couldn't write " + f.fsName + ": " + m + ". If EffectCraft blocks file writes, " + GATE_HINT + ".");
    }
    return f;
  }

  // The text of `file` (null asks with an open dialog), or null when the user cancels.
  function readFile(file) {
    var f = toFile(file) || File.openDialog("Load Motion Kit layouts", "JSON:*.json");
    if (!f) return null;
    var text;
    try {
      f.encoding = "UTF-8";
      if (!f.open("r")) throw new Error(f.error || "it can't be opened");
      text = f.read();
      f.close();
    } catch (e) {
      var m = U.errText(e);
      if (/Allow Scripts to Write Files/.test(m)) MK.fail("EffectCraft only lets scripts read files in the project's folder: " + GATE_HINT + ".");
      MK.fail("Couldn't read " + f.fsName + ": " + m + ".");
    }
    return text;
  }

  return {
    MODES: MODES,
    N_PANELS: N_PANELS,
    defaultStyle: defaultStyle,
    defaultLayout: defaultLayout,
    emptyLayout: emptyLayout,
    defaultIds: defaultIds,
    normalize: normalize,
    pack: pack,
    normItem: normItem,
    findId: findId,
    moveItem: moveItem,
    addItem: addItem,
    removeItem: removeItem,
    setStyle: setStyle,
    setItem: setItem,
    renamePanel: renamePanel,
    ops: ops,
    normState: normState,
    state: state,
    commit: commit,
    list: function () { return names(state()); },
    active: function () { return state().active; },
    get: function (name) {
      var st = state();
      var n = name === undefined ? st.active : name;
      needLayout(st, n);
      return st.layouts[n];
    },
    // Saves `layout` as the active layout's content.
    save: function (layout) {
      var st = state();
      return commit(ops.setLayout(st, st.active, layout));
    },
    switchTo: stored(ops.switchTo),
    add: stored(ops.add),
    rename: stored(ops.rename),
    remove: stored(ops.remove),
    resetToDefault: stored(ops.resetToDefault),
    resetAll: stored(ops.resetAll),
    exportJson: function () { return ops.exportJson(state()); },
    importJson: stored(ops.importJson),
    writeFile: writeFile,
    readFile: readFile,
    // Save Layouts to a file / load them. null `file` asks with a dialog. Return {ok, message}.
    saveToFile: function (file) {
      var f = writeFile(file, ops.exportJson(state()));
      if (!f) return { ok: false, cancelled: true, message: "Cancelled." };
      return { ok: true, message: "Saved the layouts to " + f.fsName + "." };
    },
    loadFromFile: function (file, mode) {
      var text = readFile(file);
      if (text === null) return { ok: false, cancelled: true, message: "Cancelled." };
      commit(ops.importJson(state(), text, mode));
      return { ok: true, message: mode === "merge" ? "Merged the layouts." : "Loaded the layouts." };
    }
  };
})();
