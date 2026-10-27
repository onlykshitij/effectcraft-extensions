// SPDX-License-Identifier: MIT OR Apache-2.0
// Sequencer: staggers the selected layers (their start times) or the selected keyframes of each
// layer (moved together, spacing kept). Items are put in order (top to bottom, bottom to top,
// from the centre, seeded random, or selection order). Item k of the order is in step group
// g = floor(k / group) ("group" items share each step); from the centre, k is the distance from
// the middle item(s) instead, so both sides move alike. With G the last group, the span is
// step * G frames and group g sits span * curve(g / G) frames, rounded to whole frames (halves
// away from zero, so a negative step mirrors the positive one), after
// group 0 (linear: step * g). Group 0 takes the time of the first item in the order, or from
// the centre of the middle item (the first of the two when the count is even). A layer's time
// is its in-point; a keyframe item's time is its earliest selected keyframe.

(function () {
  var NAME = "Sequencer", U = MK.util, A = MK.anim;
  var CURVES = {
    linear: function (t) { return t; },
    easeIn: function (t) { return t * t; },
    easeOut: function (t) { return 1 - (1 - t) * (1 - t); },
    easeInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  };
  // Rounds to a whole number of frames, halves away from zero (Math.round takes -0.5 to 0).
  function whole(v) { return v < 0 ? -Math.round(-v) : Math.round(v); }
  var ORDER_TEXT = { topDown: "top to bottom", bottomUp: "bottom to top", centre: "from the centre", random: "random", selection: "selection order" };

  // The step group of each of n items in order: floor(k / group), with k the distance from the
  // middle for the centre order (two middle items when n is even).
  function groups(n, group, centre) {
    var out = [];
    for (var k = 0; k < n; k++) {
      var d = !centre ? k : k < n / 2 ? Math.floor((n - 1) / 2) - k : k - Math.ceil((n - 1) / 2);
      out.push(Math.floor(d / group));
    }
    return out;
  }

  // Fisher-Yates with the Park-Miller generator (exact in doubles), so a seed always gives the
  // same order.
  function shuffle(a, seed) {
    var s = Math.floor(Math.abs(seed)) % 2147483646 + 1, out = a.slice();
    for (var i = out.length - 1; i > 0; i--) {
      s = s * 16807 % 2147483647;
      var j = Math.floor((s - 1) / 2147483646 * (i + 1)), t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  // [{layer, time, props}] in selection order.
  function items(ctx, mode) {
    if (mode === "layers") return U.map(ctx.layers, function (l) { return { layer: l, time: l.inPoint, props: [] }; });
    var out = [], seen = {}, props = A.withSelectedKeys(ctx.props);
    for (var n = 0; n < props.length; n++) {
      var p = props[n], l = MK.sel.layerOf(p), k = "L" + l.index;
      if (!seen[k]) out.push(seen[k] = { layer: l, time: Infinity, props: [] });
      seen[k].props.push(p);
      seen[k].time = Math.min(seen[k].time, p.keyTime(MK.sel.selectedKeys(p)[0]));
    }
    return out;
  }

  // The seed field: a number and a Reseed button.
  function seedField(group, value) {
    var row = MK.widgets.row(group);
    var et = row.add("edittext", undefined, String(value));
    et.characters = 8;
    et.helpTip = "The same seed always gives the same random order";
    var btn = row.add("button", undefined, "Reseed");
    btn.onClick = function () { et.text = String(1 + Math.floor(Math.random() * 99999)); };
    return { edit: et, button: btn, get: function () { return et.text; }, set: function (v) { et.text = String(v); } };
  }

  MK.registerTool({
    id: "sequencer",
    name: NAME,
    category: "Animate",
    description: "Staggers the selected layers, or each layer's selected keyframes, a few frames apart.",
    // Four staggered horizontal bars (the first bar).
    icon: [
      { d: "M3.5 5 H10.5", stroke: "accent", w: 3 },
      { d: "M7.5 10 H14.5", w: 3 },
      { d: "M11.5 15 H18.5", w: 3 },
      { d: "M14 20 H21", w: 3 }
    ],
    options: [
      { key: "mode", label: "Mode", type: "dropdown", "default": "layers", items: [["layers", "Layers: move their start times"], ["keys", "Keyframes: move each layer's selected keys"]] },
      { key: "order", label: "Order", type: "dropdown", "default": "topDown", items: [["topDown", "Top to bottom"], ["bottomUp", "Bottom to top"], ["centre", "From the centre"], ["random", "Random"], ["selection", "Selection order"]] },
      {
        key: "seed", label: "Random seed", type: "custom", "default": 1, build: seedField,
        validate: function (v) {
          var n = Number(v);
          if (v === "" || v === null || !U.isNum(n)) MK.fail("Random seed must be a whole number.");
          return Math.round(U.clamp(Math.abs(n), 0, 2147483646));
        }
      },
      { key: "step", label: "Step", type: "number", "default": 2, min: -1000, max: 1000, unit: "frames", help: "Frames between items, negative or fractional too; the result is rounded to whole frames" },
      { key: "group", label: "Items per step", type: "number", "default": 1, min: 1, max: 1000, integer: true, help: "How many items in a row share each step" },
      { key: "curve", label: "Curve", type: "dropdown", "default": "linear", items: [["linear", "Linear"], ["easeIn", "Ease in"], ["easeOut", "Ease out"], ["easeInOut", "Ease in-out"]] }
    ],
    run: function (ctx, o) {
      var list = items(ctx, o.mode), keys = o.mode === "keys";
      if (list.length < 2) ctx.fail(keys ? "select keyframes on two or more layers." : "select two or more layers.");
      for (var c = 0; c < list.length; c++) if (list[c].layer.locked) ctx.fail("unlock " + list[c].layer.name + " first.");
      if (o.order !== "selection") list.sort(function (x, y) { return x.layer.index - y.layer.index; });
      if (o.order === "bottomUp") list.reverse();
      if (o.order === "random") list = shuffle(list, o.seed);
      var n = list.length, g = groups(n, o.group, o.order === "centre"), last = Math.max.apply(null, g);
      var base = list[o.order === "centre" ? Math.floor((n - 1) / 2) : 0].time, curve = CURVES[o.curve], moved = 0;
      for (var i = 0; i < n; i++) {
        var it = list[i], delta = base + (last ? whole(o.step * last * curve(g[i] / last)) : 0) * ctx.frame - it.time;
        if (Math.abs(delta) < 1e-9) continue;
        if (keys) {
          for (var q = 0; q < it.props.length; q++) A.move(it.props[q], MK.sel.selectedKeys(it.props[q]), function (k) { return k.time + delta; });
        } else it.layer.startTime = it.layer.startTime + delta;
        moved++;
      }
      return ctx.done(NAME + ": placed " + n + (keys ? " layers' keyframes" : " layers") + " " + ORDER_TEXT[o.order] + ", " + o.step + " frames apart" +
        (o.group > 1 ? ", " + o.group + " per step" : "") + " (" + o.curve + "); moved " + moved + ".");
    }
  });
})();
