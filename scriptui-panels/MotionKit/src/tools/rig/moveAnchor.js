// SPDX-License-Identifier: MIT OR Apache-2.0
// Move Anchor Point: moves each selected layer's anchor point to a corner, edge midpoint or the
// centre of its bounds at the current time (MK.rig.layerBounds: a shape layer's exact contents,
// else sourceRectAtTime(currentTime, false); or its masks' bounds), without moving the layer.
// With shape groups selected, it moves each group's transform anchor within the group's own
// contents instead.
//
// Maths: Position = where the anchor point lands in the parent's space, so a new anchor A' needs
// Position' = layerToParent(A') under the old transform, at the same time. Every anchor key (or
// the static anchor) shifts by D = A' - A(now); every position key (or the static position)
// becomes layerToParent(A(t) + D, t) at its own time t, evaluated before anything is written.
// layerToParent is toWorld then the parent's fromWorld (EffectCraft's own, so rotation, scale,
// parenting and 3D count); for groups it is the group matrix (MK.shapes.groupMatrix).
// When scale, rotation or skew is animated, Position' - Position turns and scales with them, so
// Position gets a key at every key time of Position, Anchor Point, Scale and Rotation (Skew for
// groups) and at the current time: exact there, close between them.

(function () {
  var NAME = "Move Anchor Point", ID = "moveAnchor";
  var U = MK.util, S = MK.space, SH = MK.shapes, R = MK.rig;
  // The 3 x 3 grid: key -> fractions of the bounds' width and height.
  var KEYS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
  var FRACTION = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] };
  var LABEL = { tl: "top left", t: "top", tr: "top right", l: "left", c: "centre", r: "right", bl: "bottom left", b: "bottom", br: "bottom right" };

  // Transform properties whose animation turns or scales the anchor's offset in Position space.
  var LAYER_TURNS = ["ADBE Scale", "ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z"];
  var GROUP_TURNS = ["ADBE Vector Scale", "ADBE Vector Rotation", "ADBE Vector Skew", "ADBE Vector Skew Axis"];

  function keyTimes(p) {
    var out = [];
    for (var i = 1; i <= p.numKeys; i++) out.push(p.keyTime(i));
    return out;
  }

  function hasExpr(p) { return !!p.expression && p.expressionEnabled !== false; }

  // The properties `names` of transform group `tr` that change over time (keys or an expression).
  function animated(tr, names) {
    return U.filter(U.map(names, function (n) { return tr.property(n); }), function (p) { return p && (p.numKeys > 0 || hasExpr(p)); });
  }

  // The 1-based index of p's key at time tk, or 0.
  function keyAt(p, tk) {
    for (var i = 1; i <= p.numKeys; i++) if (Math.abs(p.keyTime(i) - tk) < 1e-4) return i;
    return 0;
  }

  // Plans the move of anchor property `ap` to `target` (2D, in the anchor's own space) with
  // position property `pp`; toParent(p, t) maps an anchor-space point to position space at
  // time t with the current values; `turns` are the animated properties that change that map's
  // rotation or scale. Returns {write: function that writes the result, keyed: true when
  // Position got keys for `turns`}.
  function plan(ap, pp, target, t, dims, toParent, turns) {
    var a0 = ap.valueAtTime(t, false);
    var dx = target[0] - a0[0], dy = target[1] - a0[1];
    function fit(v) { return dims === 3 ? [v[0], v[1], v[2] || 0] : [v[0], v[1]]; }
    function shifted(a) { return fit([a[0] + dx, a[1] + dy, a[2] || 0]); }
    var anchors = ap.numKeys ? U.map(keyTimes(ap), function (tk, i) { return shifted(ap.keyValue(i + 1)); }) : [shifted(a0)];
    var times = pp.numKeys ? keyTimes(pp) : [t];
    if (turns.length) {
      var all = keyTimes(pp).concat(keyTimes(ap), [t]);
      for (var j = 0; j < turns.length; j++) all = all.concat(keyTimes(turns[j]));
      all.sort(function (x, y) { return x - y; });
      times = U.filter(all, function (tk, i) { return i === 0 || tk - all[i - 1] > 1e-4; });
    }
    var positions = U.map(times, function (tk) { return fit(toParent(shifted(ap.valueAtTime(tk, false)), tk)); });
    var keys = U.map(times, function (tk) { return keyAt(pp, tk); });
    return {
      keyed: turns.length > 0,
      write: function () {
        var i;
        if (ap.numKeys) for (i = 0; i < anchors.length; i++) ap.setValueAtKey(i + 1, anchors[i]);
        else ap.setValue(anchors[0]);
        if (!pp.numKeys && !turns.length) return pp.setValue(positions[0]);
        // Existing keys first, by index, before new keys shift the indices.
        for (i = 0; i < times.length; i++) if (keys[i]) pp.setValueAtKey(keys[i], positions[i]);
        for (i = 0; i < times.length; i++) if (!keys[i]) pp.setValueAtTime(times[i], positions[i]);
      }
    };
  }

  // The layer-space bounds to use: the masks' outlines with "Include masks", else the layer's.
  function layerBounds(L, t, masks) {
    var mp = masks ? L.property("ADBE Mask Parade") : null;
    if (mp && mp.numProperties) {
      var pts = [];
      for (var i = 1; i <= mp.numProperties; i++) pts = pts.concat(R.outline(mp.property(i).property("ADBE Mask Shape").valueAtTime(t, false)));
      if (pts.length) return S.bounds(pts);
    }
    return R.layerBounds(L, t);
  }

  function at(b, f) { return [b.left + b.width * f[0], b.top + b.height * f[1]]; }

  MK.registerTool({
    id: ID,
    name: NAME,
    category: "Rig",
    description: "Moves the anchor point to a corner, edge or the centre of each layer (or shape group) without moving it.",
    // A 3 x 3 dot grid with a crosshair (the crosshair).
    icon: [
      { d: "O5 5 1.3 O12 5 1.3 O19 5 1.3 O5 12 1.3 O19 12 1.3 O5 19 1.3 O12 19 1.3 O19 19 1.3", fill: "fg" },
      { d: "O12 12 3.4", stroke: "accent", w: 1.6 },
      { d: "M12 6.8 L12 17.2 M6.8 12 L17.2 12", stroke: "accent", w: 1.6 }
    ],
    options: [
      {
        key: "point", label: "Anchor point goes to", type: "custom", "default": "c",
        validate: function (v) {
          if (!U.has(FRACTION, v)) throw new Error("the anchor point must be one of " + KEYS.join(", "));
          return v;
        },
        // Nine radio buttons in three rows; they are kept exclusive by hand across the rows.
        build: function (group, value) {
          var cur = U.has(FRACTION, value) ? value : "c", buttons = {};
          function show() { for (var k in buttons) if (U.has(buttons, k)) buttons[k].value = k === cur; }
          for (var r = 0; r < 3; r++) {
            var row = group.add("group");
            row.orientation = "row";
            for (var c = 0; c < 3; c++) {
              (function (k) {
                var rb = row.add("radiobutton", undefined, "");
                rb.helpTip = LABEL[k];
                rb.onClick = function () { cur = k; show(); };
                buttons[k] = rb;
              })(KEYS[r * 3 + c]);
            }
          }
          show();
          return { get: function () { return cur; }, set: function (v) { cur = U.has(FRACTION, v) ? v : "c"; show(); }, buttons: buttons };
        }
      },
      { key: "masks", label: "Include masks (use the mask bounds where a layer has masks)", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var f = FRACTION[o.point], t = ctx.time, skipped = [], todo = [], i;
      var groups = U.filter(ctx.groups, SH.isGroup);
      if (!groups.length && !ctx.layers.length) ctx.fail("select one or more layers or shape groups.");

      if (groups.length) {
        for (i = 0; i < groups.length; i++) {
          var g = groups[i], tr = SH.groupTransform(g);
          var gap = tr.property("ADBE Vector Anchor"), gpp = tr.property("ADBE Vector Position");
          var gb = R.contentBounds(g, t);
          if (hasExpr(gap) || hasExpr(gpp)) skipped.push("\"" + g.name + "\" (its anchor or position has an expression)");
          else if (!gb) skipped.push("\"" + g.name + "\" (it has no shapes)");
          else {
            todo.push(plan(gap, gpp, at(gb, f), t, 2, (function (grp) {
              return function (p, tk) { return MK.mat.apply(SH.groupMatrix(grp, tk), p); };
            })(g), animated(tr, GROUP_TURNS)));
            todo[todo.length - 1].name = "\"" + g.name + "\"";
          }
        }
      } else {
        for (i = 0; i < ctx.layers.length; i++) {
          var L = ctx.layers[i], ap = L.transform.anchorPoint, pp = L.transform.position;
          if (!L.sourceRectAtTime) skipped.push(L.name + " (it has no size)");
          else if (hasExpr(ap) || hasExpr(pp)) skipped.push(L.name + " (its anchor point or position has an expression)");
          else if (pp.dimensionsSeparated) skipped.push(L.name + " (its position has separate dimensions)");
          else {
            todo.push(S.probe(L, function (ev) {
              return plan(ap, pp, at(layerBounds(L, t, o.masks), f), t, L.threeDLayer ? 3 : 2, function (p, tk) {
                return ev("var p = L.toWorld([" + p[0] + "," + p[1] + "," + (p[2] || 0) + "]); L.hasParent ? L.parent.fromWorld(p) : p", tk);
              }, animated(L.transform, LAYER_TURNS));
            }));
            todo[todo.length - 1].name = L.name;
          }
        }
      }
      var keyed = [];
      for (i = 0; i < todo.length; i++) {
        todo[i].write();
        if (todo[i].keyed) keyed.push(todo[i].name);
      }
      var what = groups.length ? (todo.length === 1 ? " group" : " groups") : (todo.length === 1 ? " layer" : " layers");
      var msg = "Moved the anchor point of " + todo.length + what + " to the " + LABEL[o.point] + ".";
      if (keyed.length) {
        msg += " " + (keyed.length === 1 ? keyed[0] + " has" : keyed.join(", ") + " have") + " animated scale or rotation, so Position now has keyframes at those" +
          " keyframes and at the current time. It stays put on them but can drift slightly between them.";
      }
      if (!todo.length) ctx.fail("nothing to move. Skipped " + skipped.join(", ") + ".");
      if (skipped.length) ctx.warn("Skipped " + skipped.join(", ") + ".");
      return ctx.done(msg);
    }
  });
})();
