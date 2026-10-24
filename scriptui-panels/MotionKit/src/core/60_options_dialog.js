// SPDX-License-Identifier: MIT OR Apache-2.0
// Small ScriptUI widgets shared by the dialogs, and the options dialog built from a tool's
// option fields. build() makes the dialog without showing it (tests drive it headless, where a
// modal show() would block); open() shows it and runs the tool after OK.

MK.widgets = (function () {
  var U = MK.util;
  var W = {};
  W.row = function (parent) {
    var g = parent.add("group");
    g.orientation = "row";
    g.alignChildren = ["left", "center"];
    g.spacing = 6;
    return g;
  };
  W.label = function (parent, text, width) {
    var t = parent.add("statictext", undefined, text);
    if (width) t.preferredSize = [width, -1];
    return t;
  };
  // A drawn colour swatch; getHex() gives the colour to show (null draws a "none" cross).
  W.swatch = function (parent, getHex, w, h) {
    var s = parent.add("group");
    s.preferredSize = [w || 22, h || 18];
    s.onDraw = function () {
      var g = this.graphics, sw = this.size ? this.size[0] : w || 22, sh = this.size ? this.size[1] : h || 18;
      if (!(sw > 0)) sw = w || 22;
      if (!(sh > 0)) sh = h || 18;
      var hex = getHex();
      g.newPath();
      g.rectPath(0, 0, sw, sh);
      if (hex) g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(hex)));
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.5, 0.5, 0.5, 1], 1));
      if (!hex) {
        g.newPath();
        g.moveTo(0, sh);
        g.lineTo(sw, 0);
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.8, 0.3, 0.3, 1], 1));
      }
    };
    return s;
  };
  // A #RRGGBB field with a swatch. allowEmpty lets "" mean "none / default" (get() is null).
  // onChange(hexOrNull) runs after a valid edit; an invalid entry goes back to the last value.
  W.colorField = function (parent, hex, allowEmpty, onChange) {
    var cur = U.normHex(hex);
    var row = W.row(parent);
    W.swatch(row, function () { return cur; });
    var et = row.add("edittext", undefined, cur || "");
    et.characters = 8;
    et.helpTip = "Hex colour such as #FF8800" + (allowEmpty ? "; empty for the default" : "");
    et.onChange = function () {
      var t = U.trim(et.text);
      if (allowEmpty && t === "") cur = null;
      else if (U.normHex(t)) cur = U.normHex(t);
      et.text = cur || "";
      if (onChange) onChange(cur);
    };
    return {
      row: row, edit: et,
      get: function () { return cur; },
      set: function (h) { cur = U.normHex(h); et.text = cur || ""; }
    };
  };
  return W;
})();

MK.optionsDialog = (function () {
  var U = MK.util, W = MK.widgets;
  var LABEL_W = 130;

  function field(box, f, value) {
    var label = f.label || f.key;
    var c;
    if (f.type === "checkbox") {
      c = box.add("checkbox", undefined, label);
      c.value = !!value;
      if (f.help) c.helpTip = f.help;
      return { control: c, get: function () { return c.value; }, set: function (v) { c.value = !!v; } };
    }
    if (f.type === "custom") {
      var g = box.add("panel", undefined, label);
      g.alignChildren = ["fill", "top"];
      var api = f.build(g, U.clone(value), { tool: f, widgets: W }) || {};
      return { control: g, get: function () { return api.get ? api.get() : value; }, set: function (v) { if (api.set) api.set(v); } };
    }
    var row = W.row(box);
    W.label(row, label, LABEL_W);
    if (f.type === "number") {
      c = row.add("edittext", undefined, String(value));
      c.characters = 8;
      if (f.min !== undefined || f.max !== undefined) W.label(row, MK.options.rangeText(f) + (f.unit ? " " + f.unit : "")).enabled = false;
      else if (f.unit) W.label(row, f.unit);
      if (f.help) c.helpTip = f.help;
      return { control: c, get: function () { return c.text; }, set: function (v) { c.text = String(v); } };
    }
    if (f.type === "dropdown") {
      var items = MK.options.items(f);
      c = row.add("dropdownlist", undefined, U.map(items, function (it) { return it[1]; }));
      var pick = function (v) {
        for (var i = 0; i < items.length; i++) if (items[i][0] === v) { c.selection = i; return; }
        c.selection = 0;
      };
      pick(value);
      if (f.help) c.helpTip = f.help;
      return { control: c, get: function () { return c.selection ? items[c.selection.index][0] : items[0][0]; }, set: pick };
    }
    if (f.type === "color") {
      var cf = W.colorField(row, value, false);
      return { control: cf.edit, get: cf.get, set: cf.set };
    }
    // text
    c = row.add("edittext", undefined, String(value), f.multiline ? { multiline: true } : undefined);
    if (f.multiline) c.preferredSize = [280, 90];
    else c.characters = 24;
    if (f.help) c.helpTip = f.help;
    return { control: c, get: function () { return c.text; }, set: function (v) { c.text = String(v); } };
  }

  // The dialog for `tool` filled with `values`. Returns {win, inputs, read(), action, values}:
  // action becomes "run" (OK), "save" (Save) or stays null (Cancel).
  function build(tool, values) {
    var win = new Window("dialog", MK.NAME + ": " + tool.name + " Options");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 8;
    win.margins = 14;
    var about = win.add("statictext", undefined, tool.description, { multiline: true });
    about.preferredSize = [360, -1];
    var box = win.add("panel", undefined, "Options");
    box.orientation = "column";
    box.alignChildren = ["fill", "top"];
    box.spacing = 6;
    var inputs = {};
    for (var i = 0; i < tool.options.length; i++) inputs[tool.options[i].key] = field(box, tool.options[i], values[tool.options[i].key]);
    var btns = win.add("group");
    btns.alignment = ["right", "top"];
    var defaults = btns.add("button", undefined, "Defaults", { name: "defaults" });
    var cancel = btns.add("button", undefined, "Cancel", { name: "cancel" });
    var save = btns.add("button", undefined, "Save", { name: "save" });
    var ok = btns.add("button", undefined, "OK", { name: "ok" });
    save.helpTip = "Keep these options without running";
    ok.helpTip = "Keep these options and run " + tool.name;

    var ctl = { win: win, inputs: inputs, action: null, values: null };
    ctl.read = function () {
      var raw = {};
      for (var k in inputs) if (U.has(inputs, k)) raw[k] = inputs[k].get();
      return MK.options.validate(tool, raw, true);
    };
    function commit(action) {
      var r = ctl.read();
      if (r.errors.length) {
        MK.prompts.alert(r.errors.join("\n"));
        return false;
      }
      ctl.values = MK.options.save(tool, r.values).values;
      ctl.action = action;
      win.close(1);
      return true;
    }
    ok.onClick = function () { commit("run"); };
    save.onClick = function () { commit("save"); };
    cancel.onClick = function () { ctl.action = null; win.close(2); };
    defaults.onClick = function () {
      var d = MK.options.defaults(tool);
      for (var k in inputs) if (U.has(inputs, k)) inputs[k].set(d[k]);
    };
    win.defaultElement = ok;
    win.cancelElement = cancel;
    return ctl;
  }

  // Opens a tool's options (its own openOptions, or the built dialog). A tool without options
  // just runs. Returns the run result, or null when nothing ran.
  function open(id) {
    var tool = MK.tools[id];
    if (!tool) return MK.run(id);
    if (tool.openOptions) return tool.openOptions() || null;
    if (!MK.options.has(tool)) return MK.run(id);
    var ctl = build(tool, MK.options.get(tool));
    ctl.win.show();
    return ctl.action === "run" ? MK.run(id, null, false, { setControls: true }) : null;
  }

  return { build: build, open: open };
})();
