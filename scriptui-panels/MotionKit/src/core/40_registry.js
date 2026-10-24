// SPDX-License-Identifier: MIT OR Apache-2.0
// The tool registry, tool options and the runner. A tool file calls MK.registerTool({...});
// MK.run(id, options) runs it on the active comp and selection, in one undo step, and always
// returns {ok, message, created}. Nothing a tool throws gets past the runner. Widgets (kind
// "widget": a bigger cell with its own controls) are registry entries too and run the same way.

MK.tools = {};
MK.toolOrder = [];

// ---------------------------------------------------------------- options schema

MK.options = (function () {
  var U = MK.util;
  var TYPES = { number: 1, checkbox: 1, dropdown: 1, color: 1, text: 1, custom: 1 };
  var O = {};

  // [[value, label], ...] from a field's items (strings or pairs).
  O.items = function (f) {
    return U.map(f.items || [], function (it) { return U.isArray(it) ? [it[0], String(it[1])] : [it, String(it)]; });
  };

  function itemValues(f) { return U.map(O.items(f), function (it) { return it[0]; }); }

  // {value} when v is valid for field f, else {error}. Lenient mode clamps numbers into range.
  O.check = function (f, v, lenient) {
    var label = f.label || f.key;
    switch (f.type) {
      case "number":
        var n = typeof v === "string" ? Number(U.trim(v)) : v;
        if (typeof n !== "number" || !isFinite(n) || (typeof v === "string" && U.trim(v) === "")) return { error: label + " must be a number." };
        if (f.integer) n = Math.round(n);
        var lo = f.min === undefined ? -Infinity : f.min, hi = f.max === undefined ? Infinity : f.max;
        if (n < lo || n > hi) {
          if (!lenient) return { error: label + " must be " + rangeText(f) + "." };
          n = U.clamp(n, lo, hi);
        }
        return { value: n };
      case "checkbox":
        if (typeof v === "boolean") return { value: v };
        if (lenient && (v === 0 || v === 1)) return { value: !!v };
        return { error: label + " must be on or off." };
      case "dropdown":
        return U.indexOf(itemValues(f), v) >= 0 ? { value: v } : { error: label + " must be one of: " + U.map(O.items(f), function (it) { return it[1]; }).join(", ") + "." };
      case "color":
        var h = U.normHex(v);
        return h ? { value: h } : { error: label + " must be a hex colour such as #FF8800." };
      case "text":
        if (typeof v !== "string") return { error: label + " must be text." };
        if (f.maxLength && v.length > f.maxLength) return lenient ? { value: v.substring(0, f.maxLength) } : { error: label + " can have at most " + f.maxLength + " characters." };
        return { value: v };
      case "custom":
        if (typeof f.validate !== "function") return { value: v };
        try {
          return { value: f.validate(v) };
        } catch (e) {
          return { error: U.errText(e) };
        }
    }
    return { error: "Unknown option type for " + label + "." };
  };

  function rangeText(f) {
    if (f.min !== undefined && f.max !== undefined) return "from " + f.min + " to " + f.max;
    if (f.min !== undefined) return "at least " + f.min;
    return "at most " + f.max;
  }
  O.rangeText = rangeText;

  // A field list's problems (used when a tool registers), [] when fine.
  O.schemaErrors = function (fields) {
    var errs = [], seen = {};
    if (!U.isArray(fields)) return ["options must be an array of fields"];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || typeof f.key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.key)) { errs.push("option " + i + " needs a key"); continue; }
      if (U.has(seen, f.key)) errs.push("option " + f.key + " is listed twice");
      seen[f.key] = 1;
      if (!U.has(TYPES, f.type)) { errs.push("option " + f.key + " has an unknown type " + f.type); continue; }
      if (f.type === "dropdown" && !O.items(f).length) errs.push("option " + f.key + " has no items");
      if (f.type === "custom" && typeof f.build !== "function") errs.push("option " + f.key + " (custom) needs build()");
      var d = O.check(f, f["default"], false);
      if (d.error) errs.push("option " + f.key + " has a bad default: " + d.error);
    }
    return errs;
  };

  O.defaults = function (tool) {
    var out = {};
    for (var i = 0; i < (tool.options || []).length; i++) out[tool.options[i].key] = U.clone(tool.options[i]["default"]);
    return out;
  };

  // Validates raw values: missing or invalid ones get the default (lenient) or are listed in
  // errors (strict). Unknown keys are dropped. Returns {values, errors}.
  O.validate = function (tool, raw, strict) {
    var values = O.defaults(tool), errors = [], src = raw && typeof raw === "object" ? raw : {};
    for (var i = 0; i < (tool.options || []).length; i++) {
      var f = tool.options[i];
      if (!U.has(src, f.key)) continue;
      var r = O.check(f, src[f.key], !strict);
      if (r.error) {
        if (strict) errors.push(r.error);
      } else values[f.key] = r.value;
    }
    return { values: values, errors: errors };
  };

  function all() {
    var a = MK.settings.get("toolOptions", {});
    return a && typeof a === "object" && !U.isArray(a) ? a : {};
  }
  // The saved options of a tool (validated, defaults filled in).
  O.get = function (tool) {
    var t = typeof tool === "string" ? MK.tools[tool] : tool;
    return O.validate(t, all()[t.id], false).values;
  };
  // Validates strictly and saves. Returns {ok, values, errors}.
  O.save = function (tool, raw) {
    var t = typeof tool === "string" ? MK.tools[tool] : tool;
    var r = O.validate(t, raw, true);
    if (r.errors.length) return { ok: false, values: r.values, errors: r.errors };
    var a = all();
    a[t.id] = r.values;
    MK.settings.set("toolOptions", a);
    return { ok: true, values: r.values, errors: [] };
  };
  O.has = function (tool) { return !!((tool.options && tool.options.length) || tool.openOptions); };
  // The saved options with `given` on top (not saved), validated leniently.
  O.merged = function (tool, given) {
    var o = O.get(tool), g = given && typeof given === "object" ? given : {};
    for (var k in g) if (U.has(g, k)) o[k] = g[k];
    return O.validate(tool, o, false).values;
  };
  return O;
})();

// ---------------------------------------------------------------- registry

// Registers a tool. Required: id, name, category (Animate, Rig, Shapes or Comp), description
// (one line), icon (a path DSL array or draw function, see 50_icons.js) and run(ctx, opts).
// Optional: options (field list), needsComp (default true), dot() (true shows an accent dot on
// the button), openOptions() (replaces the generated options dialog), api (functions other
// tools and widgets reuse, as MK.tools[id].api).
// A widget also has kind: "widget", span: [cols, rows] and build(w), which adds its controls to
// the panel cell through the widget API `w` (70_panel.js).
// A bad definition is recorded in MK.loadErrors and skipped, so the other tools still load.
MK.registerTool = function (def) {
  var errs = [], U = MK.util;
  var d = def || {};
  if (typeof d.id !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(d.id)) errs.push("id must be lowerCamelCase letters and digits");
  else if (U.has(MK.tools, d.id)) errs.push("id " + d.id + " is already registered");
  if (typeof d.name !== "string" || !U.trim(d.name)) errs.push("name is missing");
  if (U.indexOf(MK.CATEGORIES, d.category) < 0) errs.push("category must be one of " + MK.CATEGORIES.join(", "));
  if (typeof d.description !== "string" || !U.trim(d.description)) errs.push("description is missing");
  if (typeof d.run !== "function") errs.push("run(ctx, opts) is missing");
  if (!(typeof d.icon === "function" || U.isArray(d.icon))) errs.push("icon is missing");
  var widget = d.kind === "widget";
  if (d.kind !== undefined && d.kind !== "tool" && !widget) errs.push("kind must be \"tool\" or \"widget\"");
  if (widget && typeof d.build !== "function") errs.push("a widget needs build(w)");
  if (widget && !(U.isArray(d.span) && d.span.length === 2 && U.isNum(d.span[0]) && U.isNum(d.span[1]) && d.span[0] >= 1 && d.span[1] >= 1)) errs.push("a widget needs span [cols, rows]");
  errs = errs.concat(MK.options.schemaErrors(d.options || []));
  if (errs.length) {
    var msg = "Motion Kit: tool " + (d.id || "?") + " not loaded: " + errs.join("; ");
    MK.loadErrors.push(msg);
    try { $.writeln(msg); } catch (e) {}
    return null;
  }
  var tool = {
    id: d.id, name: d.name, category: d.category, description: d.description, icon: d.icon,
    options: d.options || [], run: d.run, needsComp: d.needsComp !== false, dot: d.dot || null,
    openOptions: d.openOptions || null, api: d.api || {},
    kind: widget ? "widget" : "tool", span: widget ? [Math.round(d.span[0]), Math.round(d.span[1])] : [1, 1], build: widget ? d.build : null
  };
  MK.tools[tool.id] = tool;
  MK.toolOrder.push(tool.id);
  return tool;
};

// ---------------------------------------------------------------- the runner

// The context a tool's run(ctx, opts) gets.
MK.makeContext = function (tool) {
  var comp = MK.sel.comp();
  var ctx = {
    tool: tool,
    comp: comp,
    layers: comp ? comp.selectedLayers : [],
    props: comp ? MK.sel.props(comp) : [],
    groups: comp ? MK.sel.groups(comp) : [],
    time: comp ? comp.time : 0,
    frame: comp ? comp.frameDuration : 1 / 30,
    created: [],
    warnings: []
  };
  ctx.fail = function (msg) { MK.fail(msg); };
  ctx.warn = function (msg) { ctx.warnings.push(String(msg)); };
  ctx.confirm = function (msg) { return !!MK.prompts.confirm(msg); };
  ctx.done = function (msg) { return { ok: true, message: String(msg || ""), created: ctx.created }; };
  return ctx;
};

MK.toResult = function (r, ctx) {
  var out = { ok: true, message: "", created: ctx.created };
  if (r && typeof r === "object") {
    out.ok = r.ok !== false;
    out.message = r.message === undefined ? "" : String(r.message);
    if (MK.util.isArray(r.created)) out.created = r.created;
  }
  if (ctx.warnings.length) out.message += (out.message ? "\n" : "") + ctx.warnings.join("\n");
  return out;
};

// Runs a tool or library item like a button click: saved options, overridden by `options`
// (not saved). Problems come back as {ok: false, message} and are shown with alert unless
// `quiet` is set. Never throws.
MK.run = function (id, options, quiet) {
  var r;
  try {
    if (typeof id === "string" && id.indexOf("lib:") === 0) r = MK.library.run(id);
    else r = MK.runTool(id, options);
  } catch (e) {
    r = { ok: false, message: MK.util.errText(e), created: [] };
  }
  if (!r.ok && r.message && !quiet) try { MK.prompts.alert(r.message); } catch (e2) {}
  return r;
};

MK.runTool = function (id, options) {
  var tool = MK.tools[id];
  if (!tool) return { ok: false, message: "\"" + id + "\" isn't a tool in this version of Motion Kit (" + MK.version + ").", created: [] };
  var opts = MK.options.merged(tool, options);
  var ctx = MK.makeContext(tool);
  if (tool.needsComp && !ctx.comp) return { ok: false, message: tool.name + ": open a composition first.", created: [] };
  var r;
  app.beginUndoGroup(MK.NAME + ": " + tool.name);
  try {
    r = MK.toResult(tool.run(ctx, opts), ctx);
  } catch (e) {
    r = { ok: false, message: e instanceof MK.UserError ? tool.name + ": " + e.message : tool.name + " failed: " + MK.util.errText(e), created: ctx.created };
  } finally {
    app.endUndoGroup();
  }
  return r;
};

// Runs tool `id`'s code inside another tool's or widget's run, with the same ctx (so one undo
// step): its saved options with `options` on top. A widget reuses tools this way.
MK.callTool = function (id, ctx, options) {
  var tool = MK.tools[id];
  return tool.run(ctx, MK.options.merged(tool, options));
};

// Every runnable entry, for the command box, the menu panel and the Add list:
// [{id, name, category, description, kind: "tool" | "widget" | "library"}]. `library` defaults
// to the stored one. Widgets only with `widgets` (they live in panels, not in the menu).
MK.catalog = function (library, widgets) {
  var out = [];
  for (var i = 0; i < MK.toolOrder.length; i++) {
    var t = MK.tools[MK.toolOrder[i]];
    if (t.kind === "widget" && !widgets) continue;
    out.push({ id: t.id, name: t.name, category: t.category, description: t.description, kind: t.kind });
  }
  var lib = library || (MK.library ? MK.library.list() : []);
  for (var j = 0; j < lib.length; j++) out.push({ id: lib[j].id, name: lib[j].name, category: "Library", description: MK.library.describe(lib[j]), kind: "library" });
  return out;
};

// Name and one-line description of an id (tool, library item or missing).
MK.describe = function (id, library) {
  var t = MK.tools[id];
  if (t) return { name: t.name, description: t.description, category: t.category, missing: false };
  if (id.indexOf("lib:") === 0 && MK.library) {
    var it = MK.library.find(library || MK.library.list(), id);
    if (it) return { name: it.name, description: MK.library.describe(it), category: "Library", missing: false };
  }
  return { name: id, description: "Not available in this version of Motion Kit (" + MK.version + "). The button is kept so a layout from a newer version isn't lost.", category: null, missing: true };
};
