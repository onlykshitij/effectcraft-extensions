// SPDX-License-Identifier: MIT OR Apache-2.0
// Slider to Path: the selected layers ride a selected shape or mask path, each at its own
// "Path Progress" slider (0-100 % of the path's arc length).
//
// Uses EffectCraft's own pointOnPath / tangentOnPath (crates/expr/src/prelude.js: arc-length
// lookup over 32 samples per Bézier segment). The point is in the path's own space; the
// enclosing shape groups' matrix (mkX) takes it to the path layer, toComp to comp space and the
// attached layer's parent fromComp to the space its Position is in. Closed paths wrap (110 % is
// 10 %), open paths clamp. "Orient along path" turns Rotation to the tangent's angle (through the
// same spaces as a vector) plus Orient Offset.

(function () {
  var NAME = "Slider to Path", ID = "sliderToPath";
  var U = MK.util, C = MK.controls, R = MK.rig;
  var CTRL = { progress: C.name(NAME, "Path Progress"), orient: C.name(NAME, "Orient along path"), offset: C.name(NAME, "Orient Offset") };

  // The path, its layer (mkL), mkX and mkU, the progress as a fraction.
  function head(pe) {
    return [
      "  var mkL = thisComp.layer(" + MK.expr.str(pe.layer.name) + ");",
      R.matrixCode(pe.groups, false) + "  var mkPath = " + R.ref(pe.prop) + ";",
      "  var mkU = " + C.ref(CTRL.progress) + ".value / 100;",
      "  if (!isFinite(mkU)) mkU = 0;",
      "  mkU = mkPath.isClosed() ? mkU - Math.floor(mkU) : Math.max(0, Math.min(1, mkU));"
    ].join("\n");
  }

  function positionExpr(pe) {
    return [
      R.LIB,
      "var mkOut = value;",
      "try {",
      head(pe),
      "  var mkC = mkL.toComp(mkApply(mkX, mkPath.pointOnPath(mkU)));",
      "  if (hasParent) mkC = parent.fromComp(mkC);",
      "  if (mkFinite(mkC)) mkOut = value.length > 2 ? [mkC[0], mkC[1], value[2]] : [mkC[0], mkC[1]];",
      "} catch (mkE) {}",
      "mkOut"
    ].join("\n");
  }

  function rotationExpr(pe) {
    return [
      R.LIB,
      "var mkOut = value;",
      "try {",
      "if (" + C.ref(CTRL.orient, "ADBE Checkbox Control") + ".value) {",
      head(pe),
      "  var mkT = mkL.toCompVec(mkVec(mkX, mkPath.tangentOnPath(mkU)));",
      "  if (hasParent) mkT = parent.fromCompVec(mkT);",
      "  var mkA = Math.atan2(mkT[1], mkT[0]) * 180 / Math.PI + " + C.ref(CTRL.offset, "ADBE Angle Control") + ".value;",
      "  if (mkFinite(mkT) && (mkT[0] || mkT[1]) && isFinite(mkA)) mkOut = mkA;",
      "}",
      "} catch (mkE) {}",
      "mkOut"
    ].join("\n");
  }

  MK.registerTool({
    id: ID,
    name: NAME,
    category: "Rig",
    description: "Puts the selected layers on the selected path, each moved along it by a Path Progress slider.",
    // A curved path with a dot and a slider track below (the dot).
    icon: [
      "M3 13 C7 3 13 15 21 6",
      { d: "M4 20 L20 20", w: 1.4 },
      { d: "M10.5 17.6 L10.5 22.4", w: 2.2 },
      { d: "O10.5 9.1 2.7", fill: "accent" }
    ],
    options: [
      { key: "spread", label: "Spread several layers evenly along the path", type: "checkbox", "default": true },
      { key: "orient", label: "Orient along path (rotation follows the tangent)", type: "checkbox", "default": false },
      { key: "orientOffset", label: "Orient Offset", type: "number", "default": 0, min: -3600, max: 3600, unit: "°" }
    ],
    run: function (ctx, o) {
      var paths = R.selectedPaths(ctx);
      if (!paths.length) ctx.fail("select a path property (a shape path or a mask path) and the layers to put on it.");
      if (paths.length > 1) ctx.fail("select only one path property.");
      var pe = paths[0];
      var layers = U.filter(MK.sel.byIndex(ctx.layers), function (l) { return l.index !== pe.layer.index; });
      if (!layers.length) ctx.fail("also select one or more layers (other than the path's layer) to put on the path.");
      var noFx = U.filter(layers, function (l) { return !l.property("ADBE Effect Parade"); });
      if (noFx.length) ctx.fail(noFx[0].name + " can't take effects, so it can't hold the Path Progress slider.");

      var props = U.map(layers, function (l) { return l.transform.position; });
      if (o.orient) props = props.concat(U.map(layers, function (l) { return l.transform.rotation; }));
      var d = MK.expr.decide(ctx, props);
      var want = function (p) { return U.indexOf(d.apply, p) >= 0; };
      var n = layers.length, closed = pe.prop.valueAtTime(ctx.time, false).closed, done = 0;
      for (var i = 0; i < n; i++) {
        var L = layers[i], pos = props[i];
        if (!want(pos)) continue;
        var at = !o.spread || n === 1 ? 0 : closed ? 100 * i / n : 100 * i / (n - 1);
        C.slider(L, CTRL.progress, at);
        MK.expr.set(pos, ID, positionExpr(pe));
        if (o.orient && want(props[n + i])) {
          C.checkbox(L, CTRL.orient, true);
          C.angle(L, CTRL.offset, o.orientOffset);
          MK.expr.set(props[n + i], ID, rotationExpr(pe));
        }
        done++;
      }
      if (R.nameClash(pe.layer)) ctx.warn("Another layer is also named \"" + pe.layer.name + "\": rename one, or the expressions may read the wrong path.");
      var msg = "Put " + done + (done === 1 ? " layer" : " layers") + " on the path of " + pe.layer.name + ".";
      if (d.skip.length) msg += " Kept " + d.skip.length + " existing expression" + (d.skip.length === 1 ? "." : "s.");
      return ctx.done(msg);
    }
  });
})();
