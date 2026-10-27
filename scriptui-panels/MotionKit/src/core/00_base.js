// SPDX-License-Identifier: MIT OR Apache-2.0
// Motion Kit core: constants and small utilities every other file uses. build.py wraps all
// sources in one function that declares `var MK = {}`; each file adds to MK.

MK.version = "0.2.0";
MK.NAME = "Motion Kit";
MK.CATEGORIES = ["Animate", "Rig", "Shapes", "Comp"];
// Category colours for what tools make (controls, traces, the curve editor). Panel buttons use
// the style's accent instead.
MK.ACCENTS = { Animate: "#F28C28", Rig: "#2BB3A3", Shapes: "#9B6BF2", Comp: "#3D8BF2", Library: "#9AA0A6" };
// Fixed colours of the panel theme (the others are style fields): inner widget buttons, small
// labels, and the anchor widget's squares and their inner border.
MK.THEME = { button: "#3B5662", label: "#C9D3D6", anchor: "#A88BF7", anchorEdge: "#D9CCFF" };
// Tool load problems (a bad registerTool call); the bundle keeps loading the other tools.
MK.loadErrors = [];

// A message for the user. Tools throw it (ctx.fail) for bad selections; the runner shows it as
// it is, without "failed" wording or a line number.
MK.UserError = function (message) {
  this.message = String(message);
  this.name = "MotionKitError";
};
MK.UserError.prototype.toString = function () { return this.message; };
MK.fail = function (message) { throw new MK.UserError(message); };

// The prompts tools use. Tests replace them to answer questions without a person.
MK.prompts = {
  alert: function (msg) { alert(msg, MK.NAME); },
  // EffectCraft's confirm() shows the question as a notice and answers yes, so there it asks in
  // a dialog (the message wrapped by hand: EffectCraft's static text doesn't wrap).
  confirm: function (msg) {
    if (!MK.util.EFFECTCRAFT) return confirm(msg);
    var w = new Window("dialog", MK.NAME), yes = false, words = String(msg).split(" "), line = "";
    w.orientation = "column";
    w.alignChildren = ["left", "top"];
    for (var i = 0; i <= words.length; i++) {
      if (i < words.length && (line + " " + words[i]).length <= 64) line = line ? line + " " + words[i] : words[i];
      else {
        if (line) w.add("statictext", undefined, line);
        line = i < words.length ? words[i] : "";
      }
    }
    var row = w.add("group");
    row.alignment = ["right", "top"];
    var no = row.add("button", undefined, "No", { name: "cancel" });
    var ok = row.add("button", undefined, "Yes", { name: "ok" });
    ok.onClick = function () { yes = true; w.close(1); };
    no.onClick = function () { w.close(2); };
    w.defaultElement = ok;
    w.cancelElement = no;
    w.show();
    return yes;
  }
};

MK.util = (function () {
  var U = {};
  U.isArray = function (v) { return Object.prototype.toString.call(v) === "[object Array]"; };
  U.isNum = function (v) { return typeof v === "number" && isFinite(v); };
  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  U.clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  U.trim = function (s) { return String(s === undefined || s === null ? "" : s).replace(/^\s+|\s+$/g, ""); };
  U.has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  U.keys = function (o) {
    var out = [];
    for (var k in o) if (U.has(o, k)) out.push(k);
    return out;
  };
  U.indexOf = function (a, v) {
    for (var i = 0; i < a.length; i++) if (a[i] === v) return i;
    return -1;
  };
  U.map = function (a, f) {
    var out = [];
    for (var i = 0; i < a.length; i++) out.push(f(a[i], i));
    return out;
  };
  U.filter = function (a, f) {
    var out = [];
    for (var i = 0; i < a.length; i++) if (f(a[i], i)) out.push(a[i]);
    return out;
  };
  // An Error's message with its line when it has one (for unexpected errors only).
  U.errText = function (e) {
    if (e instanceof MK.UserError) return e.message;
    var m = e && e.message ? e.message : String(e);
    return e && e.line ? m + " (line " + e.line + ")" : m;
  };
  // "#RRGGBB" (upper case) from "#rgb", "rrggbb" or "#RRGGBB"; null when it isn't a colour.
  U.normHex = function (s) {
    var t = U.trim(s).replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.charAt(0) + t.charAt(0) + t.charAt(1) + t.charAt(1) + t.charAt(2) + t.charAt(2);
    return /^[0-9a-fA-F]{6}$/.test(t) ? "#" + t.toUpperCase() : null;
  };
  // [r, g, b] in 0..1, or null.
  U.hexToRgb = function (s) {
    var h = U.normHex(s);
    if (!h) return null;
    var n = parseInt(h.substring(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };
  U.rgbToHex = function (c) {
    var s = "#";
    for (var i = 0; i < 3; i++) {
      var h = Math.round(U.clamp(Number(c[i]) || 0, 0, 1) * 255).toString(16).toUpperCase();
      s += h.length < 2 ? "0" + h : h;
    }
    return s;
  };
  // EffectCraft paints ScriptUI pen and brush colours as linear light (egui::Rgba in
  // scriptui_view.rs), which brightens them; sending each channel's linear value cancels that.
  // shortcut: applies to every EffectCraft version; gate it on app.version once EffectCraft fixes it.
  U.EFFECTCRAFT = typeof BridgeTalk !== "undefined" && BridgeTalk.appName === "effectcraft";
  U.LINEAR_UI = U.EFFECTCRAFT;
  function toLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  // Channels to 4 decimals: every draw call goes into the window snapshot's JSON.
  function r4(v) { return Math.round(v * 10000) / 10000; }
  var rgbaCache = {};
  // [r, g, b, a] for ScriptUI pens and brushes (cached; don't change the array).
  U.rgba = function (hex, alpha) {
    var key = hex + "/" + alpha;
    if (U.has(rgbaCache, key)) return rgbaCache[key];
    var c = U.hexToRgb(hex) || [0.5, 0.5, 0.5];
    if (U.LINEAR_UI) c = [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
    return (rgbaCache[key] = [r4(c[0]), r4(c[1]), r4(c[2]), alpha === undefined ? 1 : r4(alpha)]);
  };
  // Blend two hex colours (t = 0 gives a, 1 gives b).
  U.mixHex = function (a, b, t) {
    var x = U.hexToRgb(a) || [0, 0, 0], y = U.hexToRgb(b) || [0, 0, 0];
    return U.rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  };
  // Random hex digits for ids (not cryptographic).
  U.randomId = function (n) {
    var s = "";
    for (var i = 0; i < (n || 10); i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  };
  // "Name", "Name 2", "Name 3"... the first that `taken(name)` says is free.
  U.uniqueName = function (base, taken) {
    if (!taken(base)) return base;
    var stem = String(base).replace(/ \d+$/, "");
    for (var i = 2; i < 10000; i++) if (!taken(stem + " " + i)) return stem + " " + i;
    return stem + " " + U.randomId(4);
  };
  return U;
})();
