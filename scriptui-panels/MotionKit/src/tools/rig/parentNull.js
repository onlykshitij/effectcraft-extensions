// SPDX-License-Identifier: MIT OR Apache-2.0
// Add Parent Null: a null at the selected layers' combined bounds (or their average position, or
// the top layer's position) at the current time, and the layers parented to it without moving.
// "Null per layer" makes one null per layer at its anchor point instead. Nulls go above the
// top-most layer they parent and are 3D when all those layers are 3D (positions then use world
// space, so the z depth is kept).

(function () {
  var NAME = "Add Parent Null";
  var U = MK.util, S = MK.space;

  // Where a layer "is": its anchor point in comp space (world space when `world`).
  function anchorOf(layer, t, world) {
    var a = layer.transform.anchorPoint.valueAtTime(t, false);
    return world ? S.toWorld(layer, a, t) : S.toComp(layer, a, t);
  }

  // The corners of a layer's bounds in comp (or world) space.
  function cornersOf(layer, t, world) {
    var c = S.rectCorners(layer, t, false);
    if (!world) return S.toCompPoints(layer, c, t);
    return S.probe(layer, function (ev) {
      return U.map(c, function (p) { return ev("L.toWorld([" + p[0] + "," + p[1] + ",0])", t); });
    });
  }

  function makeNull(ctx, name, at, above, threeD) {
    var n = ctx.comp.layers.addNull();
    n.name = name;
    n.moveBefore(above);
    if (threeD) n.threeDLayer = true;
    n.transform.position.setValue(threeD ? [at[0], at[1], at[2] || 0] : [at[0], at[1]]);
    ctx.created.push(n);
    return n;
  }

  MK.registerTool({
    id: "parentNull",
    name: NAME,
    category: "Rig",
    description: "Adds a null at the selected layers and parents them to it without moving them.",
    // A square null linked to two small layers (the null).
    icon: [
      { d: "M12 8.5 L6 15", w: 1.4 },
      { d: "M12 8.5 L18 15", w: 1.4 },
      "R3 15 6 5",
      "R15 15 6 5",
      { d: "R9 2.5 6 6", fill: "accent" }
    ],
    options: [
      { key: "anchor", label: "Null goes to", type: "dropdown", "default": "bounds", items: [["bounds", "Centre of the layers' bounds"], ["average", "Average of the layers' positions"], ["top", "Top-most layer's position"]] },
      { key: "reparentAll", label: "Re-parent layers that already have a parent", type: "checkbox", "default": false },
      { key: "perLayer", label: "Null per layer (at each layer's anchor point)", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var layers = MK.sel.byIndex(ctx.layers);
      if (!layers.length) ctx.fail("select one or more layers.");
      var t = ctx.time;
      var targets = U.filter(layers, function (l) { return o.reparentAll || !l.parent; });
      if (!targets.length) ctx.fail("every selected layer already has a parent. Turn on \"Re-parent layers that already have a parent\" in the options (Shift-click) to re-parent them.");
      var kept = layers.length - targets.length, i;

      if (o.perLayer) {
        for (i = 0; i < targets.length; i++) {
          var L = targets[i], d3 = !!L.threeDLayer;
          var n = makeNull(ctx, L.name + " Parent", anchorOf(L, t, d3), L, d3);
          L.parent = n;
        }
        return ctx.done("Added " + targets.length + (targets.length === 1 ? " null." : " nulls.") + (kept ? " " + kept + " layers kept their parent." : ""));
      }

      var all3D = true;
      for (i = 0; i < layers.length; i++) if (!layers[i].threeDLayer) all3D = false;
      var at;
      if (o.anchor === "top") at = anchorOf(layers[0], t, all3D);
      else if (o.anchor === "average") {
        var sum = [0, 0, 0];
        for (i = 0; i < layers.length; i++) {
          var p = anchorOf(layers[i], t, all3D);
          sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + (p[2] || 0)];
        }
        at = [sum[0] / layers.length, sum[1] / layers.length, sum[2] / layers.length];
      } else {
        var pts = [];
        for (i = 0; i < layers.length; i++) pts = pts.concat(cornersOf(layers[i], t, all3D));
        at = S.bounds(pts).center;
      }
      var nul = makeNull(ctx, "Parent Null", at, layers[0], all3D);
      for (i = 0; i < targets.length; i++) targets[i].parent = nul;
      return ctx.done("Parented " + targets.length + (targets.length === 1 ? " layer" : " layers") + " to \"Parent Null\"." + (kept ? " " + kept + " kept their parent." : ""));
    }
  });
})();
