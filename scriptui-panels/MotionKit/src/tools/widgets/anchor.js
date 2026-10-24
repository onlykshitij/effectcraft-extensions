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
      var at = {}, inset = Math.max(3, Math.round(sq * 0.16)), hover = w.editing ? 0 : w.style.hover, hg = Math.floor(gap / 2);
      w.onShift = function () { w.options("moveAnchor"); };
      w.squares = {};
      // Paints squares `keys`, shifted by (dx, dy). Without the hover highlight they are painted
      // together on the widget (four draw operations, not two per square) and the parts on top
      // are invisible. With it, each part paints its square over the native button, reaching
      // half the gap around it: the squares are too bright to sit on the native button, so the
      // highlight is the ring in the gap.
      function squares(g, keys, dx, dy) {
        var k, p, i, edges = false;
        if (U.indexOf(keys, "c") >= 0) {
          g.newPath();
          g.rectPath(at.c[0] + dx, at.c[1] + dy, sq, sq);
          g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(T.anchorEdge)));
        }
        g.newPath();
        for (i = 0; i < keys.length; i++) {
          k = keys[i];
          p = at[k];
          if (k === "c") g.rectPath(p[0] + dx + inset, p[1] + dy + inset, sq - 2 * inset, sq - 2 * inset);
          else g.rectPath(p[0] + dx, p[1] + dy, sq, sq);
        }
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, U.rgba(T.anchor)));
        // A lighter inner border on the outer squares; the centre is a light frame instead.
        g.newPath();
        for (i = 0; i < keys.length; i++) if (keys[i] !== "c") {
          edges = true;
          g.rectPath(at[keys[i]][0] + dx + 1.5, at[keys[i]][1] + dy + 1.5, sq - 3, sq - 3);
        }
        if (edges) g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(T.anchorEdge), 1.5));
        // The point used last.
        p = U.indexOf(keys, w.values.point) >= 0 ? at[w.values.point] : null;
        if (p) {
          g.newPath();
          g.rectPath(p[0] + dx + 1, p[1] + dy + 1, sq - 2, sq - 2);
          g.strokePath(g.newPen(g.PenType.SOLID_COLOR, U.rgba(w.style.fg), 2));
        }
      }
      if (!hover) w.paint = function (g) { squares(g, KEYS, 0, 0); };
      for (var i = 0; i < 9; i++) {
        (function (k, x, y) {
          var e = hover ? hg : 0;
          at[k] = [x, y];
          w.squares[k] = w.part(k, [x - e, y - e, sq + 2 * e, sq + 2 * e], {
            tip: "Anchor to the " + LABEL[k] + ": moves the anchor point of the selected layers or shape groups there without moving them. Shift-click: options (Include masks)",
            click: function () {
              w.save({ point: k });
              w.run({ point: k });
            },
            draw: hover ? function (g) {
              MK.ui.gfx.hoverBox(g, sq + 2 * e, sq + 2 * e, 0, w.look.bg, null, hover);
              squares(g, [k], e - x, e - y);
            } : null
          });
        })(KEYS[i], x0 + (i % 3) * (sq + gap), y0 + Math.floor(i / 3) * (sq + gap));
      }
    }
  });
})();
