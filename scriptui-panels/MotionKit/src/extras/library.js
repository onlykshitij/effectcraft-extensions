// SPDX-License-Identifier: MIT OR Apache-2.0
// The user library: expression and script items made in the Layout & Style dialog's Library tab.
// Items have ids "lib:<random>", sit in panels like tools and travel with layout export/import.
// An item: {id, name, kind: "expression" | "script", code, target: "apply" | "text",
// source: "inline" | "file", path, icon: "builtin" | "png" | "tool:<id>", png, bg?, accent?, fg?}.

MK.library = (function () {
  var U = MK.util;
  var L = {};
  var MAX_CODE = 200000;

  L.normalize = function (raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = typeof raw.id === "string" ? raw.id : "";
    if (!/^lib:[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    if (raw.kind !== "expression" && raw.kind !== "script") return null;
    var name = U.trim(raw.name);
    var it = {
      id: id, name: name && name.length <= 64 ? name : "Untitled", kind: raw.kind,
      code: typeof raw.code === "string" ? raw.code.substring(0, MAX_CODE) : "",
      target: raw.target === "text" ? "text" : "apply",
      source: raw.source === "file" ? "file" : "inline",
      path: typeof raw.path === "string" ? raw.path : "",
      icon: raw.icon === "png" || (typeof raw.icon === "string" && /^tool:[a-z][A-Za-z0-9]*$/.test(raw.icon)) ? raw.icon : "builtin",
      png: typeof raw.png === "string" ? raw.png : ""
    };
    var cols = ["bg", "accent", "fg"];
    for (var i = 0; i < cols.length; i++) if (U.normHex(raw[cols[i]])) it[cols[i]] = U.normHex(raw[cols[i]]);
    return it;
  };

  // A valid item list (bad entries and repeated ids dropped).
  L.normalizeList = function (raw) {
    var out = [], seen = {};
    if (!U.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) {
      var it = L.normalize(raw[i]);
      if (it && !U.has(seen, it.id)) {
        seen[it.id] = 1;
        out.push(it);
      }
    }
    return out;
  };

  L.list = function () { return L.normalizeList(MK.settings.get("library", [])); };
  L.find = function (items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  };
  L.newId = function (items) {
    for (var n = 0; n < 100; n++) {
      var id = "lib:" + U.randomId(10);
      if (!L.find(items || [], id)) return id;
    }
    return "lib:" + U.randomId(16);
  };
  // A new item (not saved). kind: "expression" or "script".
  L.create = function (kind, fields, items) {
    var f = fields || {};
    return L.normalize({
      id: L.newId(items || L.list()), kind: kind, name: f.name || (kind === "script" ? "New script" : "New expression"),
      code: f.code || "", target: f.target, source: f.source, path: f.path, icon: f.icon, png: f.png,
      bg: f.bg, accent: f.accent, fg: f.fg
    });
  };
  // Adds or replaces an item in the stored library.
  L.save = function (item) {
    var it = L.normalize(item);
    if (!it) MK.fail("That library item isn't valid.");
    var items = L.list(), found = false;
    for (var i = 0; i < items.length; i++) if (items[i].id === it.id) { items[i] = it; found = true; }
    if (!found) items.push(it);
    MK.settings.set("library", items);
    return it;
  };
  L.describe = function (it) {
    if (it.kind === "expression") return it.target === "text" ? "Adds this expression, switched off, to the selected properties for you to edit." : "Applies this expression to the selected properties.";
    return it.source === "file" ? "Runs the script " + it.path + "." : "Runs this script.";
  };
  L.iconOf = function (it) {
    var m = /^tool:(.+)$/.exec(it.icon);
    if (m && MK.tools[m[1]]) return MK.tools[m[1]].icon;
    return it.kind === "script" ? MK.icons.builtin.libScript : MK.icons.builtin.libExpression;
  };
  // The PNG image of an item, or null (missing or unreadable files fall back to the icon).
  L.imageOf = function (it) { return it.icon === "png" ? MK.icons.image(it.png) : null; };

  function applyExpression(it) {
    var comp = MK.sel.comp();
    if (!comp) MK.fail("open a composition first.");
    if (!U.trim(it.code)) MK.fail("this item has no expression text yet. Edit it in Layout & Style ▸ Library.");
    var props = U.filter(MK.sel.props(comp), function (p) { return p.canSetExpression; });
    if (!props.length) MK.fail("select one or more properties that can take expressions.");
    for (var i = 0; i < props.length; i++) {
      props[i].expression = it.code;
      if (it.target === "text") props[i].expressionEnabled = false;
    }
    return { ok: true, message: (it.target === "text" ? "Added " : "Applied ") + it.name + " to " + props.length + (props.length === 1 ? " property." : " properties."), created: [] };
  }

  function runScript(it) {
    if (it.source === "file") {
      if (!U.trim(it.path)) MK.fail("this item has no script file. Pick one in Layout & Style ▸ Library.");
      $.evalFile(it.path);
    } else {
      if (!U.trim(it.code)) MK.fail("this item has no code yet. Edit it in Layout & Style ▸ Library.");
      // Indirect eval: the code runs in the global scope, not inside Motion Kit.
      var globalEval = eval;
      globalEval(it.code);
    }
    return { ok: true, message: "Ran " + it.name + ".", created: [] };
  }

  // Runs an item by id. Returns {ok, message, created}; never throws.
  L.run = function (id) {
    var it = L.find(L.list(), id);
    if (!it) return { ok: false, message: "That library item (" + id + ") no longer exists.", created: [] };
    var r;
    app.beginUndoGroup(MK.NAME + ": " + it.name);
    try {
      r = it.kind === "expression" ? applyExpression(it) : runScript(it);
    } catch (e) {
      r = { ok: false, message: e instanceof MK.UserError ? it.name + ": " + e.message : it.name + " failed: " + U.errText(e), created: [] };
    } finally {
      app.endUndoGroup();
    }
    return r;
  };
  return L;
})();
