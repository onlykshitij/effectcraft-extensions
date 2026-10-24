// SPDX-License-Identifier: MIT OR Apache-2.0
// Sequencer widget (2 x 1): Amount and Step fields above three order buttons. In the chosen
// order, item k is offset by Amount x floor(k / Step) frames (Motion Kit's own definition):
// Amount is frames per step (negative or fractional too; results round to whole frames) and
// Step is how many items share each step. Orders: top to bottom (layer index), bottom to top,
// and from the centre (the middle item or two keep their time, the others move by their
// distance from the middle, alike on both sides). With keyframes selected on the selected
// layers it sequences those keyframes, otherwise the layers. It runs the Sequencer tool's code,
// so that tool's saved curve applies; Shift-click opens its options (random order, curves).

(function () {
  var NAME = "Sequencer", U = MK.util, T = MK.THEME;
  var ORDERS = [
    // Bars stepping right going down, the top one first (accent).
    ["topDown", "Sequence top to bottom (by layer index)", [{ d: "M4 6 H12", stroke: "accent", w: 3 }, { d: "M8 12 H16", w: 3 }, { d: "M12 18 H20", w: 3 }]],
    // Bars stepping right going up, the bottom one first.
    ["bottomUp", "Sequence bottom to top", [{ d: "M12 6 H20", w: 3 }, { d: "M8 12 H16", w: 3 }, { d: "M4 18 H12", stroke: "accent", w: 3 }]],
    // The middle bar first, the outer ones later on both sides.
    ["centre", "Sequence from the centre out: the middle keeps its time, both sides move alike", [{ d: "M11 6 H19", w: 3 }, { d: "M5 12 H13", stroke: "accent", w: 3 }, { d: "M11 18 H19", w: 3 }]]
  ];

  MK.registerTool({
    id: "sequencerWidget",
    kind: "widget",
    span: [2, 1],
    name: NAME,
    category: "Animate",
    description: "Staggers the selected layers, or their selected keyframes: Amount frames per step, Step items per step.",
    // Bars offset from the centre (the middle bar).
    icon: [{ d: "U9 3.5 11 3 1", fill: "fg" }, { d: "U4 10.5 11 3 1", fill: "accent" }, { d: "U9 17.5 11 3 1", fill: "fg" }],
    options: [
      { key: "amount", label: "Amount", type: "number", "default": 1, min: -1000, max: 1000, unit: "frames per step" },
      { key: "step", label: "Step", type: "number", "default": 1, min: 1, max: 1000, integer: true, unit: "items per step" },
      { key: "order", label: "Order", type: "dropdown", "default": "topDown", items: [["topDown", "Top to bottom"], ["bottomUp", "Bottom to top"], ["centre", "From the centre"]] }
    ],
    run: function (ctx, o) {
      var keys = MK.anim.withSelectedKeys(ctx.props).length > 0;
      return MK.callTool("sequencer", ctx, { mode: keys ? "keys" : "layers", order: o.order, step: o.amount, group: o.step });
    },
    build: function (w) {
      // Labels, then the two fields side by side, then the three order buttons.
      var pad = Math.max(3, Math.round(w.h * 0.06)), gap = 3, size = U.clamp(Math.round(w.h * 0.16), 8, 11), labelH = size + 1;
      var fieldH = Math.min(22, Math.floor((w.h - 2 * pad - labelH - gap) / 2)), btnH = w.h - 2 * pad - labelH - fieldH - gap;
      var fw = Math.floor((w.w - 2 * pad - 2 * gap) / 2), xa = pad, xs = pad + fw + 2 * gap;
      var r = Math.max(2, w.style.radius - 2);
      w.onShift = function () { w.options("sequencer"); };
      w.paint = function (g) {
        MK.ui.gfx.text(g, "Amount", xa + 1, pad - 2, size, T.label);
        MK.ui.gfx.text(g, "Step", xs + 1, pad - 2, size, T.label);
      };
      // A field commits a valid value (the widget's options validate it) or shows the saved one again.
      function field(key, x, tip) {
        var et = w.field(key, [x, pad + labelH, fw, fieldH], String(w.values[key]), tip, function (text) {
          var f = w.tool.options[key === "amount" ? 0 : 1], c = MK.options.check(f, text, false);
          if (c.error) {
            et.text = String(w.values[key]);
            MK.prompts.alert(NAME + ": " + c.error);
            return;
          }
          var p = {};
          p[key] = c.value;
          w.save(p);
        });
        return et;
      }
      w.amount = field("amount", xa, "Amount: frames per step (negative or fractional too; results round to whole frames)");
      w.step = field("step", xs, "Step: how many items in a row share each step (1 or more)");
      var by = pad + labelH + fieldH + gap, bw = Math.floor((w.w - 2 * pad - 2 * gap) / 3);
      w.buttons = {};
      for (var i = 0; i < ORDERS.length; i++) {
        (function (o, x) {
          w.buttons[o[0]] = w.part(o[0], [x, by, bw, btnH], {
            tip: o[1] + ": item k moves Amount x floor(k / Step) frames. Shift-click: all sequencer options",
            click: function () { w.run({ order: o[0] }); },
            draw: function (g, p) { MK.ui.gfx.button(g, bw, btnH, r, o[2], w.style.fg, w.style.accent, w.hover(p)); }
          });
        })(ORDERS[i], pad + i * (bw + gap));
      }
    }
  });
})();
