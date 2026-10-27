// SPDX-License-Identifier: MIT OR Apache-2.0
// Ease Keyframes: temporal ease on the selected keyframes, set in a curve editor.
//
// The editor shows one segment as a normalised cubic Bezier, as CSS cubic-bezier(x1, y1, x2, y2)
// does: time and value both run 0..1. For a segment from key A to key B with average speed
// avg = (B - A) / (tB - tA), the eases of A (out) and B (in) map to it as
//   x1 = out influence / 100          y1 = x1 * out speed / avg
//   x2 = 1 - in influence / 100       y2 = 1 - (1 - x2) * in speed / avg
// so the options keep the influences (0.1..100 %) and each speed as a multiple of the average
// speed. y stays within 0..1 (speed <= 100 / influence): temporal ease can't overshoot.
//
// Apply: on each selected key, the outgoing ease (all but the last selected key) and the
// incoming ease (all but the first) become KeyframeEase(multiple * average speed of that
// segment, influence) per dimension, and those sides become Bezier. A lone selected key gets both.

(function () {
  var NAME = "Ease Keyframes", U = MK.util, A = MK.anim, BEZ = KeyframeInterpolationType.BEZIER;
  var KEYS = ["outInfluence", "outSpeed", "inInfluence", "inSpeed"];
  var PRESETS = [
    ["Linear", [33.333, 1, 33.333, 1]],
    ["Ease In (slow start)", [33.333, 0, 33.333, 1]],
    ["Ease Out (slow end)", [33.333, 1, 33.333, 0]],
    ["Ease In-Out (33 %)", [33.333, 0, 33.333, 0]],
    ["Strong In-Out (75 %)", [75, 0, 75, 0]],
    ["Snappy Out (out 90 %, in 15 %)", [90, 0, 15, 0]]
  ];
  // The curve editor: size, inner padding (the unit square sits inside it) and grab radius, in px.
  var GW = 220, GH = 140, PAD = 12, GRAB = 12;

  // Influences into 0.1..100, speeds into 0..100 / influence (no overshoot).
  function norm(o) {
    var r = {};
    for (var i = 0; i < 4; i += 2) {
      var inf = U.clamp(U.isNum(Number(o[KEYS[i]])) ? Number(o[KEYS[i]]) : 33.333, 0.1, 100);
      var sp = Number(o[KEYS[i + 1]]);
      r[KEYS[i]] = inf;
      r[KEYS[i + 1]] = U.clamp(U.isNum(sp) ? sp : 0, 0, 100 / inf);
    }
    return r;
  }
  function fromList(a) { return norm({ outInfluence: a[0], outSpeed: a[1], inInfluence: a[2], inSpeed: a[3] }); }
  // [x1, y1, x2, y2] of the normalised curve, and back.
  function handles(o) {
    var x1 = o.outInfluence / 100, k2 = o.inInfluence / 100;
    return [x1, x1 * o.outSpeed, 1 - k2, 1 - k2 * o.inSpeed];
  }
  function fromHandles(h) {
    var x1 = U.clamp(h[0], 0.001, 1), y1 = U.clamp(h[1], 0, 1), k2 = 1 - U.clamp(h[2], 0, 0.999), y2 = U.clamp(h[3], 0, 1);
    return norm({ outInfluence: x1 * 100, outSpeed: y1 / x1, inInfluence: k2 * 100, inSpeed: (1 - y2) / k2 });
  }
  function eases(avg, multiple, influence) {
    return U.map(avg, function (v) { return new KeyframeEase(v * multiple, influence); });
  }
  function usable(p) { return MK.sel.isNumeric(p) && p.numKeys >= 2 && p.isInterpolationTypeValid(BEZ); }

  // The eases of the first selected key that has a key after it, as editor values, or a message.
  function fromSelection() {
    var comp = MK.sel.comp();
    var props = comp ? U.filter(A.withSelectedKeys(MK.sel.props(comp)), usable) : [];
    for (var n = 0; n < props.length; n++) {
      var p = props[n], sel = MK.sel.selectedKeys(p);
      for (var j = 0; j < sel.length; j++) {
        var i = sel[j];
        if (i >= p.numKeys) continue;
        var avg = A.avgSpeed(p, i, i + 1), oe = p.keyOutTemporalEase(i), ie = p.keyInTemporalEase(i + 1), d = 0;
        while (d < avg.length - 1 && Math.abs(avg[d]) < 1e-9) d++;
        var ratio = function (s) { return Math.abs(avg[d]) < 1e-9 ? (Math.abs(s) < 1e-9 ? 0 : 1) : s / avg[d]; };
        return norm({ outInfluence: oe[d].influence, outSpeed: ratio(oe[d].speed), inInfluence: ie[d].influence, inSpeed: ratio(ie[d].speed) });
      }
    }
    return "select a keyframe that has another keyframe after it.";
  }

  function fmt(v, places) { var m = Math.pow(10, places); return String(Math.round(v * m) / m); }

  // The dialog, built but not shown. Returns its controller; tests drive it headless.
  function build() {
    var W = MK.widgets, tool = MK.tools.easeKeys;
    var ctl = { st: norm(MK.options.get(tool)), drag: null, action: null, filling: false, fields: {} };
    var win = new Window("dialog", MK.NAME + ": " + NAME);
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 8;
    win.margins = 14;
    ctl.win = win;
    var top = W.row(win);
    top.alignChildren = ["left", "top"];
    top.spacing = 12;

    var graph = top.add("group");
    graph.preferredSize = [GW, GH];
    graph.helpTip = "Drag the two handles: across is influence, up is speed. The grey line is linear.";
    ctl.graph = graph;
    // Pixel position of a point of the unit square, and back.
    ctl.toPx = function (x, y) { return [PAD + x * (GW - 2 * PAD), GH - PAD - y * (GH - 2 * PAD)]; };
    ctl.handlePx = function (n) {
      var h = handles(ctl.st);
      return n === 1 ? ctl.toPx(h[0], h[1]) : ctl.toPx(h[2], h[3]);
    };
    ctl.pick = function (px, py) {
      var best = null, bd = GRAB;
      for (var n = 1; n <= 2; n++) {
        var d = MK.ui.dist([px, py], ctl.handlePx(n));
        if (d <= bd) { best = n; bd = d; }
      }
      return best;
    };
    ctl.dragTo = function (n, px, py) {
      var h = handles(ctl.st), x = (px - PAD) / (GW - 2 * PAD), y = (GH - PAD - py) / (GH - 2 * PAD);
      if (n === 1) { h[0] = x; h[1] = y; } else { h[2] = x; h[3] = y; }
      ctl.set(fromHandles(h));
    };
    graph.onDraw = function () { draw(this.graphics, ctl); };
    // Same pattern as the panel grid: press picks a handle, moves drag it, a release outside ends
    // it. mousemove is only listened to during a drag: EffectCraft redraws after every event.
    function moved(e) { if (ctl.drag && e.target === graph) ctl.dragTo(ctl.drag, e.clientX, e.clientY); }
    function stop() {
      ctl.drag = null;
      graph.removeEventListener("mousemove", moved);
    }
    graph.addEventListener("mousedown", function (e) {
      if (e.target !== graph) return;
      ctl.drag = ctl.pick(e.clientX, e.clientY);
      if (ctl.drag) graph.addEventListener("mousemove", moved);
    });
    graph.addEventListener("mouseup", function (e) {
      if (ctl.drag && e.target === graph) ctl.dragTo(ctl.drag, e.clientX, e.clientY);
      stop();
    });
    win.addEventListener("mouseup", function (e) { if (e.target !== graph) stop(); });

    var side = top.add("group");
    side.orientation = "column";
    side.alignChildren = ["left", "top"];
    side.spacing = 5;
    var pr = W.row(side);
    W.label(pr, "Preset:", 86);
    ctl.presets = pr.add("dropdownlist", undefined, ["Custom"].concat(U.map(PRESETS, function (p) { return p[0]; })));
    ctl.presets.onChange = function () {
      if (ctl.filling || !ctl.presets.selection || ctl.presets.selection.index < 1) return;
      ctl.set(fromList(PRESETS[ctl.presets.selection.index - 1][1]));
    };
    var labels = ["Out influence", "Out speed", "In influence", "In speed"];
    var units = ["%  (0.1 to 100)", "x average speed", "%  (0.1 to 100)", "x average speed"];
    for (var i = 0; i < 4; i++) {
      var r = W.row(side);
      W.label(r, labels[i] + ":", 86);
      var et = r.add("edittext", undefined, "");
      et.characters = 7;
      et.mkKey = KEYS[i];
      et.onChange = function () {
        var t = U.trim(this.text), v = Number(t), o = U.clone(ctl.st);
        if (t !== "" && U.isNum(v)) o[this.mkKey] = v;
        ctl.set(o);
      };
      W.label(r, units[i]).enabled = false;
      ctl.fields[KEYS[i]] = et;
    }
    ctl.readout = side.add("statictext", undefined, "cubic-bezier(0.000, 0.000, 0.000, 0.000)");
    ctl.readout.helpTip = "The curve as CSS cubic-bezier(x1, y1, x2, y2)";
    var br = W.row(side);
    ctl.btnCopy = br.add("button", undefined, "Copy from Selected Key");
    ctl.btnCopy.helpTip = "Reads the ease between the first selected keyframe and the next one";
    ctl.btnReset = br.add("button", undefined, "Reset");
    ctl.btnCopy.onClick = function () {
      var r = fromSelection();
      if (typeof r === "string") MK.prompts.alert(NAME + ": " + r);
      else ctl.set(r);
    };
    ctl.btnReset.onClick = function () { ctl.set(norm(MK.options.defaults(tool))); };

    var btns = win.add("group");
    btns.alignment = ["right", "top"];
    var cancel = btns.add("button", undefined, "Cancel", { name: "cancel" });
    ctl.btnSave = btns.add("button", undefined, "Save", { name: "save" });
    ctl.btnApply = btns.add("button", undefined, "Apply", { name: "ok" });
    ctl.btnSave.helpTip = "Keep this ease without applying it";
    ctl.btnApply.helpTip = "Keep this ease and apply it to the selected keyframes";
    function commit(action) {
      var s = MK.options.save(tool, ctl.st);
      if (!s.ok) { MK.prompts.alert(s.errors.join("\n")); return; }
      ctl.action = action;
      win.close(1);
    }
    ctl.btnApply.onClick = function () { commit("run"); };
    ctl.btnSave.onClick = function () { commit("save"); };
    cancel.onClick = function () { ctl.action = null; win.close(2); };
    win.defaultElement = ctl.btnApply;
    win.cancelElement = cancel;

    ctl.set = function (o) {
      ctl.st = norm(o);
      ctl.filling = true;
      for (var k = 0; k < 4; k++) ctl.fields[KEYS[k]].text = fmt(ctl.st[KEYS[k]], k % 2 ? 3 : 2);
      var h = handles(ctl.st);
      ctl.readout.text = "cubic-bezier(" + U.map(h, function (v) { return (Math.round(v * 1000) / 1000).toFixed(3); }).join(", ") + ")";
      var pick = 0;
      for (var p = 0; p < PRESETS.length; p++) {
        var q = fromList(PRESETS[p][1]), same = true;
        for (var m = 0; m < 4; m++) if (Math.abs(q[KEYS[m]] - ctl.st[KEYS[m]]) > 0.01) same = false;
        if (same) pick = p + 1;
      }
      ctl.presets.selection = pick;
      ctl.filling = false;
    };
    ctl.set(ctl.st);
    return ctl;
  }

  function draw(g, ctl) {
    var rgba = U.rgba;
    var line = function (pts, hex, w, alpha) {
      g.newPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, rgba(hex, alpha), w));
    };
    g.newPath();
    g.rectPath(0, 0, GW, GH);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, rgba("#1E1E1E")));
    for (var q = 0; q <= 4; q++) {
      line([ctl.toPx(q / 4, 0), ctl.toPx(q / 4, 1)], "#303030", 1);
      line([ctl.toPx(0, q / 4), ctl.toPx(1, q / 4)], "#303030", 1);
    }
    line([ctl.toPx(0, 0), ctl.toPx(1, 1)], "#4A4A4A", 1);
    var h = handles(ctl.st), p0 = ctl.toPx(0, 0), p3 = ctl.toPx(1, 1), p1 = ctl.toPx(h[0], h[1]), p2 = ctl.toPx(h[2], h[3]);
    var accent = MK.ACCENTS.Animate;
    line([p0, p1], accent, 1, 0.8);
    line([p3, p2], accent, 1, 0.8);
    line([p0].concat(MK.icons.geom.cubic(p0, p1, p2, p3, 40)), "#D8D8D8", 2);
    var dots = [p1, p2];
    for (var n = 0; n < 2; n++) {
      g.newPath();
      g.ellipsePath(dots[n][0] - 5, dots[n][1] - 5, 10, 10);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, rgba(ctl.drag === n + 1 ? "#FFFFFF" : accent)));
    }
  }

  MK.registerTool({
    id: "easeKeys",
    name: NAME,
    category: "Animate",
    description: "Sets the ease of the selected keyframes from a curve: influence and speed, or a preset.",
    // An S-curve on axes (the two handles).
    icon: [
      "M3 3 V21 H21",
      "M6 18 C13 18 11 6 19 6",
      { d: "M6 18 L12.5 18 M19 6 L11.5 6", stroke: "accent", w: 1 },
      { d: "O12.5 18 1.9", fill: "accent" },
      { d: "O11.5 6 1.9", fill: "accent" }
    ],
    options: [
      { key: "outInfluence", label: "Out influence", type: "number", "default": 33.333, min: 0.1, max: 100, unit: "%" },
      { key: "outSpeed", label: "Out speed", type: "number", "default": 0, min: 0, max: 1000, help: "Leaving speed as a multiple of the segment's average speed (0 eases fully, 1 is linear)" },
      { key: "inInfluence", label: "In influence", type: "number", "default": 33.333, min: 0.1, max: 100, unit: "%" },
      { key: "inSpeed", label: "In speed", type: "number", "default": 0, min: 0, max: 1000, help: "Arriving speed as a multiple of the segment's average speed" }
    ],
    // The curve editor replaces the generated options dialog. openOptions(true) only builds it.
    openOptions: function (headless) {
      var ctl = build();
      if (headless) return ctl;
      ctl.win.show();
      return ctl.action === "run" ? MK.run("easeKeys") : null;
    },
    run: function (ctx, o) {
      var e = norm(o), withKeys = A.withSelectedKeys(ctx.props), props = U.filter(withKeys, usable);
      if (!props.length) ctx.fail("select keyframes on one or more properties with at least two keyframes (numbers, points or colours).");
      var count = 0;
      for (var n = 0; n < props.length; n++) {
        var p = props[n], sel = MK.sel.selectedKeys(p);
        for (var j = 0; j < sel.length; j++) {
          var i = sel[j], lone = sel.length === 1;
          var doOut = (lone || j < sel.length - 1) && i < p.numKeys, doIn = (lone || j > 0) && i > 1;
          if (!doOut && !doIn) continue;
          var inT = p.keyInInterpolationType(i), outT = p.keyOutInterpolationType(i);
          var inE = doIn ? eases(A.avgSpeed(p, i - 1, i), e.inSpeed, e.inInfluence) : p.keyInTemporalEase(i);
          var outE = doOut ? eases(A.avgSpeed(p, i, i + 1), e.outSpeed, e.outInfluence) : p.keyOutTemporalEase(i);
          p.setTemporalEaseAtKey(i, inE, outE);
          // setTemporalEaseAtKey makes both sides Bezier; the side left alone keeps its type.
          p.setInterpolationTypeAtKey(i, doIn ? BEZ : inT, doOut ? BEZ : outT);
          count++;
        }
      }
      var msg = NAME + ": eased " + count + (count === 1 ? " keyframe" : " keyframes") + " on " + props.length + (props.length === 1 ? " property." : " properties.");
      if (withKeys.length > props.length) ctx.warn("Skipped " + (withKeys.length - props.length) + " that can't ease (one keyframe, or not a number).");
      return ctx.done(msg);
    }
  });
})();
