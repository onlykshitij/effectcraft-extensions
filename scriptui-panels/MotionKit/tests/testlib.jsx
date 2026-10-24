// SPDX-License-Identifier: MIT OR Apache-2.0
// Shared test helpers. Each test starts with
//   $.evalFile(new File($.fileName).path + "/testlib.jsx");
// which loads dist/motionkit-lib.jsx from the folder next to the test (run_all.sh copies the
// tests and the dist folder under test into one staging folder, because EffectCraft only lets a
// script load files from its own folder unless file access is allowed).
// A failed check throws, so the CLI exits 1 with the message.

var MKT_DIR = new File($.fileName).path;
$.evalFile(MKT_DIR + "/dist/motionkit-lib.jsx");

var T = {
  passed: 0,
  alerts: [],
  confirms: [],
  answer: true,
  check: function (ok, what) {
    if (!ok) throw new Error("FAIL: " + what);
    T.passed++;
    writeLn("ok   " + what);
  },
  // Numbers or arrays equal within eps (default 1e-3).
  near: function (a, b, eps) {
    var e = eps === undefined ? 1e-3 : eps;
    if (a instanceof Array || b instanceof Array) {
      if (!(a instanceof Array && b instanceof Array)) return false;
      var n = Math.min(a.length, b.length);
      for (var i = 0; i < n; i++) if (!(Math.abs(a[i] - b[i]) <= e)) return false;
      return true;
    }
    return Math.abs(a - b) <= e;
  },
  // Expects fn to throw; returns the message.
  throws: function (fn, what) {
    try {
      fn();
    } catch (e) {
      T.check(true, what + " (" + e.message + ")");
      return e.message;
    }
    T.check(false, what + ": expected an error");
    return "";
  },
  comp: function (name, w, h, dur, fps) {
    var c = app.project.items.addComp(name || "MK Test", w || 1000, h || 600, 1, dur || 10, fps || 25);
    c.openInViewer();
    return c;
  },
  solid: function (comp, name, w, h, color) {
    return comp.layers.addSolid(color || [0.8, 0.2, 0.2], name, w || 100, h || 100, 1);
  },
  // Selects exactly these layers and properties.
  select: function (comp, layers, props) {
    var sp = comp.selectedProperties;
    for (var i = 0; i < sp.length; i++) sp[i].selected = false;
    var sl = comp.selectedLayers;
    for (var j = 0; j < sl.length; j++) sl[j].selected = false;
    for (var k = 0; k < (layers || []).length; k++) layers[k].selected = true;
    for (var m = 0; m < (props || []).length; m++) props[m].selected = true;
  },
  // Collects alerts and answers confirms with T.answer instead of printing.
  quiet: function () {
    MotionKit.prompts.alert = function (m) { T.alerts.push(String(m)); };
    MotionKit.prompts.confirm = function (m) { T.confirms.push(String(m)); return T.answer; };
  },
  lastAlert: function () { return T.alerts.length ? T.alerts[T.alerts.length - 1] : ""; },
  // A synthetic mouse event through EffectCraft's own ScriptUI event routing (the function the
  // host calls for real pointer input). x, y are relative to the control.
  mouse: function (win, ctrl, type, x, y, extra) {
    var v = { x: x, y: y, button: 0, shiftKey: false };
    for (var k in extra || {}) v[k] = extra[k];
    __uiDispatch(win.__wid, ctrl.__id, type, JSON.stringify(v));
  },
  done: function () { writeLn("all checks passed (" + T.passed + ")"); }
};
T.quiet();
T.check(MotionKit.loadErrors.length === 0, "Motion Kit loaded without tool errors " + MotionKit.loadErrors.join("; "));
