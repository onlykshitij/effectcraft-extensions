// SPDX-License-Identifier: MIT OR Apache-2.0
// Toggle Stroke Style: sets the selected strokes (stroke items, or properties inside them; else
// every stroke in the selected shape layers) to the style after the first stroke's current one:
// solid / butt cap -> solid / round cap -> dashed (dash and gap = 2 x width, round cap) ->
// dotted (gap = 2 x width, round cap) -> solid / butt cap. Styles left out are skipped.
// Gradient strokes count too.
//
// EffectCraft draws no dashes when Dash is 0 (the stroke is solid), so dotted uses a dash of
// DOT px with round caps, which draws one round dot per dash. Any Dash 2 / Gap 2 and Dash 3 /
// Gap 3 get the same values, so the pattern stays even.

(function () {
  var NAME = "Toggle Stroke Style", SH = MK.shapes, U = MK.util;
  var KINDS = ["ADBE Vector Graphic - Stroke", "ADBE Vector Graphic - G-Stroke"];
  var STYLES = [["solidButt", "solid, butt cap"], ["solidRound", "solid, round cap"], ["dashed", "dashed"], ["dotted", "dotted"]];
  var DOT = 0.01;

  function isStroke(p) { return !!p && U.indexOf(KINDS, p.matchName) >= 0; }
  // Gradient strokes' own properties have no ADBE match names in EffectCraft 0.14, so fall back
  // to the internal id ("cap", "width", "dashes").
  function sub(stroke, matchName, id) { return stroke.property(matchName) || stroke.property(id); }

  // The stroke a selected property is, or is inside of.
  function strokeOf(p) {
    for (var q = p, n = 0; q && !(q instanceof Layer) && n < 100; q = q.parentProperty, n++) if (isStroke(q)) return q;
    return null;
  }
  function key(p) {
    var chain = [];
    for (var q = p, n = 0; q && !(q instanceof Layer) && n < 100; q = q.parentProperty, n++) chain.unshift(q.propertyIndex);
    return MK.sel.layerOf(p).id + ":" + chain.join(".");
  }

  function strokes(ctx) {
    var out = [], seen = {}, sel = ctx.comp.selectedProperties, i;
    function add(s) { var k = key(s); if (!U.has(seen, k)) { seen[k] = 1; out.push(s); } }
    for (i = 0; i < sel.length; i++) { var s = strokeOf(sel[i]); if (s) add(s); }
    if (out.length) return out;
    for (i = 0; i < ctx.layers.length; i++) SH.walk(SH.contents(ctx.layers[i]), function (it) { if (isStroke(it)) add(it); });
    return out;
  }

  function styleOf(stroke, t) {
    var cap = sub(stroke, "ADBE Vector Stroke Line Cap", "cap").valueAtTime(t, false);
    var dash = sub(stroke, "ADBE Vector Stroke Dashes", "dashes").property("ADBE Vector Stroke Dash 1").valueAtTime(t, false);
    if (dash <= 0) return cap === 1 ? "solidButt" : cap === 2 ? "solidRound" : null;
    return dash < 0.5 ? "dotted" : "dashed";
  }

  function put(p, v, t) {
    if (p.numKeys) p.setValueAtTime(t, v);
    else p.setValue(v);
  }

  function apply(stroke, style, o, t) {
    var w = sub(stroke, "ADBE Vector Stroke Width", "width").valueAtTime(t, false);
    put(sub(stroke, "ADBE Vector Stroke Line Cap", "cap"), style === "solidButt" ? 1 : 2, t);
    var dash = style === "dashed" ? o.dash * w : style === "dotted" ? DOT : 0;
    var dashes = sub(stroke, "ADBE Vector Stroke Dashes", "dashes");
    for (var i = 1; i <= dashes.numProperties; i++) {
      var p = dashes.property(i), m = p.matchName;
      if (m.indexOf("ADBE Vector Stroke Dash") === 0) put(p, dash, t);
      else if (dash && m.indexOf("ADBE Vector Stroke Gap") === 0) put(p, o.gap * w, t);
    }
  }

  var options = U.map(STYLES, function (s) { return { key: s[0], label: "Include " + s[1], type: "checkbox", "default": true }; });
  options.push({ key: "dash", label: "Dash (x width)", type: "number", "default": 2, min: 0.1, max: 50 });
  options.push({ key: "gap", label: "Gap (x width)", type: "number", "default": 2, min: 0.1, max: 50, help: "For dashed and dotted." });

  MK.registerTool({
    id: "strokeStyle",
    name: NAME,
    category: "Shapes",
    description: "Cycles the selected strokes through solid, round-capped, dashed and dotted.",
    // A solid line above a dashed line (the dashed line).
    icon: [
      { d: "M3 8 H21", w: 2.2 },
      { d: "M3 16 H7 M10 16 H14 M17 16 H21", stroke: "accent", w: 2.2 }
    ],
    options: options,
    run: function (ctx, o) {
      var on = U.filter(U.map(STYLES, function (s) { return s[0]; }), function (k) { return o[k]; });
      if (!on.length) ctx.fail("turn on at least one style in the options (Shift-click).");
      var list = strokes(ctx);
      if (!list.length) ctx.fail("select strokes, or shape layers that have strokes.");
      var t = ctx.time, at = -1, i;
      for (i = 0; i < STYLES.length; i++) if (STYLES[i][0] === styleOf(list[0], t)) at = i;
      var next = null;
      for (i = 1; i <= STYLES.length && !next; i++) {
        var cand = STYLES[(at + i + STYLES.length) % STYLES.length];
        if (o[cand[0]]) next = cand;
      }
      for (i = 0; i < list.length; i++) apply(list[i], next[0], o, t);
      return ctx.done("Set " + list.length + (list.length === 1 ? " stroke" : " strokes") + " to " + next[1] + ".");
    }
  });
})();
