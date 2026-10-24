// SPDX-License-Identifier: MIT OR Apache-2.0
// Collect Colors: the colours of the selected layers (all layers when none are selected) at the
// current time: shape fills and strokes at any group depth, text fill and stroke, solid
// sources and Color Control values. Gradients are skipped (their stops aren't read).
// Merging: each channel is first quantised to a grid of 2^Step (0-255 scale, Step 0 = off);
// then a colour joins the first kept colour within Tolerance, the RGB distance in 0-255 units
// scaled so that black to white is 100. The result, sorted by hue (greys last, light to dark),
// becomes a "Palette" shape layer of 40 px squares (8 px apart, 8 to a row, from the comp's
// top-left corner) and a "Palette" null with Color Controls "Color 1"...
// Colours are the plain 0-1 values the properties hold (never through U.rgba, which is for
// drawing the UI).

(function () {
  var NAME = "Collect Colors", SH = MK.shapes, U = MK.util;
  var SIZE = 40, GAP = 8, PER_ROW = 8, FULL = 255 * Math.sqrt(3);
  var PAINT = { "ADBE Vector Graphic - Fill": "ADBE Vector Fill Color", "ADBE Vector Graphic - Stroke": "ADBE Vector Stroke Color" };
  var GRADIENT = { "ADBE Vector Graphic - G-Fill": 1, "ADBE Vector Graphic - G-Stroke": 1 };

  // {colors: [[r, g, b] 0-1], gradients: n} from the layers at time t.
  function gather(layers, t) {
    var out = { colors: [], gradients: 0 };
    function add(c) { out.colors.push([c[0], c[1], c[2]]); }
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      SH.walk(SH.contents(L), function (it) {
        if (U.has(PAINT, it.matchName)) add(it.property(PAINT[it.matchName]).valueAtTime(t, false));
        else if (U.has(GRADIENT, it.matchName)) out.gradients++;
      });
      var text = L.property("ADBE Text Properties");
      if (text) {
        var d = text.property("ADBE Text Document").valueAtTime(t, false);
        if (d.applyFill) add(d.fillColor);
        if (d.applyStroke && d.strokeWidth > 0) add(d.strokeColor);
      }
      if (L.matchName === "ADBE AV Layer" && !L.nullLayer && !L.adjustmentLayer && L.source instanceof FootageItem && String(L.source.mainSource) === "[object SolidSource]") add(L.source.mainSource.color);
      var fx = L.property("ADBE Effect Parade");
      for (var k = 1; fx && k <= fx.numProperties; k++) if (fx.property(k).matchName === "ADBE Color Control") add(fx.property(k).property(1).valueAtTime(t, false));
    }
    return out;
  }

  // Quantise, then merge within tolerance. Returns [r, g, b] 0-1 colours.
  function merge(colors, tolerance, step) {
    var q = Math.pow(2, step), kept = [];
    for (var i = 0; i < colors.length; i++) {
      var c = U.map(colors[i], function (v) {
        var x = U.clamp(v, 0, 1) * 255;
        return step ? Math.min(255, Math.round(x / q) * q) : x;
      });
      var near = false;
      for (var k = 0; k < kept.length && !near; k++) {
        var dr = c[0] - kept[k][0], dg = c[1] - kept[k][1], db = c[2] - kept[k][2];
        near = Math.sqrt(dr * dr + dg * dg + db * db) * 100 / FULL <= tolerance;
      }
      if (!near) kept.push(c);
    }
    return U.map(kept, function (c) { return [c[0] / 255, c[1] / 255, c[2] / 255]; });
  }

  // Sort key: hue in degrees, greys (saturation under 5 %) after every hue, light to dark.
  function hueKey(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn;
    if (!mx || d / mx < 0.05) return 1000 + (1 - mx);
    var h = mx === c[0] ? (c[1] - c[2]) / d : mx === c[1] ? 2 + (c[2] - c[0]) / d : 4 + (c[0] - c[1]) / d;
    return (h * 60 + 360) % 360 + (1 - mx) / 1000;
  }

  function paletteShapes(ctx, colors) {
    var L = ctx.comp.layers.addShape();
    L.name = "Palette";
    L.transform.anchorPoint.setValue([0, 0]);
    L.transform.position.setValue([0, 0]);
    var root = SH.contents(L);
    for (var i = 0; i < colors.length; i++) {
      var g = root.addProperty(SH.GROUP);
      g.name = "Color " + (i + 1);
      var rect = SH.inner(g).addProperty("ADBE Vector Shape - Rect");
      rect.property("ADBE Vector Rect Size").setValue([SIZE, SIZE]);
      rect.property("ADBE Vector Rect Position").setValue([GAP + SIZE / 2 + (i % PER_ROW) * (SIZE + GAP), GAP + SIZE / 2 + Math.floor(i / PER_ROW) * (SIZE + GAP)]);
      SH.inner(g).addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(colors[i]);
    }
    ctx.created.push(L);
  }

  function paletteNull(ctx, colors) {
    var n = ctx.comp.layers.addNull();
    n.name = "Palette";
    for (var i = 0; i < colors.length; i++) MK.controls.color(n, "Color " + (i + 1), colors[i]);
    ctx.created.push(n);
  }

  MK.registerTool({
    id: "collectColors",
    name: NAME,
    category: "Shapes",
    description: "Collects the colours of the selected layers (or the whole comp) into a palette layer and a null with Color Controls.",
    // A painter's palette (three swatch dots).
    icon: [
      "M12 3 C6.5 3 2.5 7 2.5 12 C2.5 17 6.5 21 11 21 C13 21 13.6 19.6 13 18.2 C12.4 16.8 13.4 15.2 15.4 15.2 L17.6 15.2 C19.8 15.2 21.5 13.6 21.5 11.4 C21.5 6.6 17.4 3 12 3 Z",
      { d: "O7.6 9.6 1.8", fill: "accent" },
      { d: "O12.4 7 1.8", fill: "accent" },
      { d: "O17 9.8 1.8", fill: "accent" }
    ],
    options: [
      { key: "tolerance", label: "Merge tolerance", type: "number", "default": 6, min: 0, max: 100, help: "Colours closer than this merge (RGB distance, black to white = 100)." },
      { key: "step", label: "Quantise step", type: "number", "default": 0, min: 0, max: 10, integer: true, help: "Rounds each channel to a multiple of 2^Step (0-255 scale) before merging; 0 is off." },
      { key: "shapes", label: "Make a \"Palette\" shape layer", type: "checkbox", "default": true },
      { key: "controls", label: "Make a \"Palette\" null with Color Controls", type: "checkbox", "default": true }
    ],
    run: function (ctx, o) {
      if (!o.shapes && !o.controls) ctx.fail("turn on at least one output in the options (Shift-click).");
      var layers = ctx.layers;
      if (!layers.length) for (var i = 1; i <= ctx.comp.numLayers; i++) layers.push(ctx.comp.layer(i));
      var got = gather(layers, ctx.time);
      if (!got.colors.length) ctx.fail("found no colours in " + (ctx.layers.length ? "the selected layers." : "the comp."));
      var colors = merge(got.colors, o.tolerance, o.step);
      colors.sort(function (a, b) { return hueKey(a) - hueKey(b); });
      if (o.shapes) paletteShapes(ctx, colors);
      if (o.controls) paletteNull(ctx, colors);
      if (got.gradients) ctx.warn("Skipped " + got.gradients + (got.gradients === 1 ? " gradient" : " gradients") + ": gradient stops aren't collected.");
      return ctx.done("Collected " + colors.length + (colors.length === 1 ? " colour" : " colours") + " (from " + got.colors.length + " found).");
    }
  });
})();
