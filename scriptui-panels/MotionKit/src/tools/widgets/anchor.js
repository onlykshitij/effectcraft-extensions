// SPDX-License-Identifier: MIT OR Apache-2.0
// Anchor widget (2 x 2): a 3 x 3 grid of squares. Clicking one moves the anchor point of the
// selected layers, or of the selected shape groups, to that point of their bounds without
// moving them, through Move Anchor Point's code (with its saved Include masks option). The
// square used last is highlighted. Shift-click opens Move Anchor Point's options.

(function () {
  var NAME = "Anchor", U = MK.util, T = MK.THEME;
  var KEYS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
  var LABEL = { tl: "top left", t: "top", tr: "top right", l: "left", c: "centre", r: "right", bl: "bottom left", b: "bottom", br: "bottom right" };

  MK.registerTool({
    id: "anchor",
    kind: "widget",
    span: [2, 2],
    name: NAME,
    category: "Rig",
    description: "A 3 x 3 grid: click a point to move the anchor of the selected layers or shape groups there.",
    // Nine squares (the centre one).
    icon: [
      { d: "R3 3 5 5 R9.5 3 5 5 R16 3 5 5 R3 9.5 5 5 R16 9.5 5 5 R3 16 5 5 R9.5 16 5 5 R16 16 5 5", fill: "fg" },
      { d: "R9.5 9.5 5 5", stroke: "accent", w: 1.6 }
    ],
    options: [
      { key: "point", label: "Anchor point", type: "dropdown", "default": "c", items: U.map(KEYS, function (k) { return [k, LABEL[k]]; }) }
    ],
    run: function (ctx, o) { return MK.callTool("moveAnchor", ctx, { point: o.point }); },
    build: function (w) {
      var gap = Math.max(3, Math.round(w.w * 0.05)), side = Math.min(w.w, w.h);
      var sq = Math.max(8, Math.floor((side - 2 * Math.round(side * 0.08) - 2 * gap) / 3));
      var x0 = Math.round((w.w - 3 * sq - 2 * gap) / 2), y0 = Math.round((w.h - 3 * sq - 2 * gap) / 2);
      var at = {}, inset = Math.max(3, Math.round(sq * 0.16));
      w.onShift = function () { w.options("moveAnchor"); };
      w.squares = {};
      // The squares are painted together on the widget (four draw operations, not two per
      // square); the parts on top are invisible and carry the clicks and help tips.
      w.paint = function (g) {
        var c = at.c, k, p;
        g.newPath();
        g.rectPath(c[0], c[1], sq, sq);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(T.anchorEdge)));
        g.newPath();
        for (k in at) if (U.has(at, k)) {
          p = at[k];
          if (k === "c") g.rectPath(p[0] + inset, p[1] + inset, sq - 2 * inset, sq - 2 * inset);
          else g.rectPath(p[0], p[1], sq, sq);
        }
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(T.anchor)));
        // A lighter inner border on the outer squares; the centre is a light frame instead.
        g.newPath();
        for (k in at) if (U.has(at, k) && k !== "c") g.rectPath(at[k][0] + 1.5, at[k][1] + 1.5, sq - 3, sq - 3);
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(T.anchorEdge), 1.5));
        // The point used last.
        p = at[w.values.point];
        if (p) {
          g.newPath();
          g.rectPath(p[0] + 1, p[1] + 1, sq - 2, sq - 2);
          g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(w.style.fg), 2));
        }
      };
      for (var i = 0; i < 9; i++) {
        (function (k, x, y) {
          at[k] = [x, y];
          w.squares[k] = w.part(k, [x, y, sq, sq], {
            tip: "Anchor to the " + LABEL[k] + ": moves the anchor point of the selected layers or shape groups there without moving them. Shift-click: options (Include masks)",
            click: function () {
              w.save({ point: k });
              w.run({ point: k });
            }
          });
        })(KEYS[i], x0 + (i % 3) * (sq + gap), y0 + Math.floor(i / 3) * (sq + gap));
      }
    }
  });
})();
