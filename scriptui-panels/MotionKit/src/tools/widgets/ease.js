// SPDX-License-Identifier: MIT OR Apache-2.0
// Ease widget (2 x 2): three sliders for the temporal ease of the selected keyframes.
//   Ease In   influence of the incoming ease, 0.1 to 100 %
//   Ease Out  influence of the outgoing ease, 0.1 to 100 %
//   Speed     the speed at the key as a percentage of the segment's average speed, 0 to 200 %
//             (0 stops at the key). This is Motion Kit's own definition.
// Releasing a slider applies all three through Ease Keyframes' code (speed / 100 is its speed
// multiple; it caps the multiple at 100 / influence, so an ease never overshoots). Clicking a
// slider's icon resets that slider; Shift-click anywhere opens the Ease Keyframes curve editor.

(function () {
  var NAME = "Ease", U = MK.util, T = MK.THEME;
  var SLIDERS = [
    { key: "easeIn", lo: 0.1, hi: 100, icon: ["M14.5 6 L8.5 12 L14.5 18"], tip: "Ease In: influence of the incoming ease (0.1 to 100 %)" },
    { key: "easeOut", lo: 0.1, hi: 100, icon: ["M9.5 6 L15.5 12 L9.5 18"], tip: "Ease Out: influence of the outgoing ease (0.1 to 100 %)" },
    { key: "speed", lo: 0, hi: 200, icon: ["M7 4 H17 L7 20 H17 Z"], tip: "Speed: speed at the key as a percentage of the segment's average speed (0 to 200 %, 0 stops at the key)" }
  ];
  var INSET = 8;

  function snap(s, v) {
    var c = U.clamp(v, s.lo, s.hi);
    return s.key === "speed" ? Math.round(c) : Math.max(s.lo, Math.round(c * 10) / 10);
  }

  MK.registerTool({
    id: "ease",
    kind: "widget",
    span: [2, 2],
    name: NAME,
    category: "Animate",
    description: "Ease In, Ease Out and Speed sliders; releasing one applies all three to the selected keyframes.",
    // Three slider tracks (the thumbs).
    icon: ["M3 6 H21", "M3 12 H21", "M3 18 H21", { d: "O9 6 2.4 O16 12 2.4 O6 18 2.4", fill: "accent" }],
    options: [
      { key: "easeIn", label: "Ease In", type: "number", "default": 33, min: 0.1, max: 100, unit: "%" },
      { key: "easeOut", label: "Ease Out", type: "number", "default": 33, min: 0.1, max: 100, unit: "%" },
      { key: "speed", label: "Speed", type: "number", "default": 0, min: 0, max: 200, unit: "% of the average speed" }
    ],
    run: function (ctx, o) {
      return MK.callTool("easeKeys", ctx, { inInfluence: o.easeIn, outInfluence: o.easeOut, inSpeed: o.speed / 100, outSpeed: o.speed / 100 });
    },
    build: function (w) {
      var pad = Math.round(w.h * 0.07), rowH = (w.h - 2 * pad) / 3, iconW = 20, defaults = MK.options.defaults(w.tool);
      var trackX = pad + iconW, trackW = w.w - trackX - pad + INSET / 2;
      // The value being dragged: {key, value}.
      var live = null;
      w.onShift = function () { w.options("easeKeys"); };
      w.sliders = {};
      for (var i = 0; i < SLIDERS.length; i++) {
        (function (s, cy) {
          var th = Math.round(rowH) - 2, ty = Math.round(cy - th / 2);
          function value(x, pw) { return snap(s, s.lo + (s.hi - s.lo) * (x - INSET) / Math.max(1, pw - 2 * INSET)); }
          function current() { return live && live.key === s.key ? live.value : w.values[s.key]; }
          var icon = w.part(s.key + "Reset", [pad - 2, Math.round(cy - 10), iconW, 20], {
            tip: s.tip.replace(/ \(.*$/, "") + ". Click to reset it to " + defaults[s.key] + " %.",
            click: function () {
              var p = {};
              p[s.key] = defaults[s.key];
              w.save(p);
            },
            draw: function (g, b) { MK.icons.draw(g, s.icon, 1, 1, 18, w.hover(b) ? w.style.fg : T.label, w.style.accent); }
          });
          var track = w.part(s.key, [trackX, ty, trackW, th], {
            tip: s.tip + ". Drag, then release to apply all three to the selected keyframes. Shift-click: the curve editor.",
            press: function (x) { live = { key: s.key, value: value(x, trackW) }; },
            drag: function (x) { if (live && live.key === s.key) live.value = value(x, trackW); },
            release: function () {
              if (!live || live.key !== s.key) return;
              var p = {};
              p[s.key] = live.value;
              live = null;
              w.save(p);
              w.run();
            },
            draw: function (g, b) {
              var ly = Math.round(th * 0.62), v = current(), x = INSET + (trackW - 2 * INSET) * (v - s.lo) / (s.hi - s.lo);
              g.newPath();
              g.moveTo(INSET, ly);
              g.lineTo(trackW - INSET, ly);
              g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(T.label, 0.55), 2));
              MK.ui.gfx.circle(g, x, ly, w.hover(b) || live ? 7 : 6, w.style.fg);
              if (live && live.key === s.key) {
                var t = String(v) + " %", tw = MK.ui.gfx.textW(g, t, 10);
                MK.ui.gfx.text(g, t, Math.round(U.clamp(x - tw / 2, 0, trackW - tw)), Math.max(0, ly - 21), 10, T.label);
              }
            }
          });
          w.sliders[s.key] = { icon: icon, track: track, value: current };
        })(SLIDERS[i], pad + rowH * (i + 0.5));
      }
    }
  });
})();
