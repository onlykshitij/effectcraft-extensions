// SPDX-License-Identifier: MIT OR Apache-2.0
// Interpolation widget (2 x 1): Bezier, Hold and Linear buttons set the temporal interpolation
// of the selected keyframes on both sides. Only the types change (MK.keys.setInterp), so a key
// switched to Linear or Hold gets its ease back when it goes back to Bezier.

(function () {
  var NAME = "Interpolation", U = MK.util;
  var TYPES = {
    bezier: { name: "Bezier", type: KeyframeInterpolationType.BEZIER, tip: "Bezier: smooth interpolation on both sides of the selected keyframes; their eases come back" },
    hold: { name: "Hold", type: KeyframeInterpolationType.HOLD, tip: "Hold: the selected keyframes keep their value until the next keyframe" },
    linear: { name: "Linear", type: KeyframeInterpolationType.LINEAR, tip: "Linear: constant speed on both sides of the selected keyframes" }
  };
  var ORDER = ["bezier", "hold", "linear"];
  // A curve with its two handles (the handle dots); a filled square; an outlined square.
  var GLYPHS = {
    bezier: ["M4 19 C11 19 13 5 20 5", { d: "M4 19 L10 19 M20 5 L14 5", stroke: "accent", w: 1.2 }, { d: "O10 19 1.8 O14 5 1.8", fill: "accent" }],
    hold: [{ d: "R5 5 14 14", fill: "accent" }],
    linear: [{ d: "R5.5 5.5 13 13", stroke: "accent" }]
  };

  MK.registerTool({
    id: "interpolation",
    kind: "widget",
    span: [2, 1],
    name: NAME,
    category: "Animate",
    description: "Sets the selected keyframes to Bezier, Hold or Linear interpolation on both sides.",
    // A curve and a square key (the square).
    icon: ["M3 20 C9 20 10 6 16 6", { d: "R16 14 6 6", fill: "accent" }],
    options: [
      { key: "type", label: "Interpolation", type: "dropdown", "default": "bezier", items: [["bezier", "Bezier"], ["hold", "Hold"], ["linear", "Linear"]] }
    ],
    run: function (ctx, o) {
      var t = TYPES[o.type], props = MK.anim.withSelectedKeys(ctx.props), keys = 0, skipped = 0;
      if (!props.length) ctx.fail("select keyframes.");
      for (var n = 0; n < props.length; n++) {
        var sel = MK.sel.selectedKeys(props[n]), ok = false;
        for (var j = 0; j < sel.length; j++) if (MK.keys.setInterp(props[n], sel[j], t.type, t.type)) { keys++; ok = true; }
        if (!ok) skipped++;
      }
      if (!keys) ctx.fail("the selected properties can't take " + t.name + " interpolation.");
      if (skipped) ctx.warn("Skipped " + skipped + (skipped === 1 ? " property that can't" : " properties that can't") + " take it.");
      return ctx.done(NAME + ": set " + keys + (keys === 1 ? " keyframe" : " keyframes") + " to " + t.name + ".");
    },
    build: function (w) {
      var gap = 6, pad = Math.max(4, Math.round(w.h * 0.11));
      var b = Math.max(12, Math.min(w.h - 2 * pad, Math.floor((w.w - 2 * pad - 2 * gap) / 3)));
      var x0 = Math.round((w.w - 3 * b - 2 * gap) / 2), y0 = Math.round((w.h - b) / 2), r = Math.max(2, w.style.radius - 2);
      w.buttons = {};
      for (var i = 0; i < ORDER.length; i++) {
        (function (k, x) {
          w.buttons[k] = w.part(k, [x, y0, b, b], {
            tip: TYPES[k].tip,
            click: function () { w.run({ type: k }); },
            draw: function (g) { MK.ui.gfx.button(g, b, b, r, GLYPHS[k], w); }
          });
        })(ORDER[i], x0 + i * (b + gap));
      }
    }
  });
})();
