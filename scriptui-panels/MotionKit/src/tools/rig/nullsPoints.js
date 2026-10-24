// SPDX-License-Identifier: MIT OR Apache-2.0
// Nulls <-> Points: one null per vertex of the selected shape or mask paths, named
// "<Layer> Point N", at the vertex's comp position.
//
// "Points follow nulls" (default) replaces the path with an expression that rebuilds it from the
// nulls: each null's anchor goes to comp space, back into the path layer (fromComp) and through
// the inverse of the enclosing shape groups' transforms (mkX) into the path's own space. Tangents
// and closedness come from the original path. With "Tangents follow too" each tangent is also
// mapped by its null's own axes (toCompVec, the identity when the null is made), taken through
// path space -> comp -> null -> back, so rotating or scaling a null turns and scales its handles.
// "Nulls follow points" goes the other way: each null's position reads its vertex from the
// (possibly animated) path, through mkX and toComp, into the null's parent space.

(function () {
  var NAME = "Nulls ↔ Points", ID = "nullsPoints";
  var U = MK.util, S = MK.space, R = MK.rig;

  function list(a) { return "[" + U.map(a, MK.expr.str).join(", ") + "]"; }

  // The path expression for "Points follow nulls".
  function pathExpr(pe, names, tangents) {
    return [
      R.LIB,
      "var mkNames = " + list(names) + ";",
      "var mkTan = " + (tangents ? "true" : "false") + ";",
      "var mkV = mkPathOf(value), mkP = mkV.points(), mkIn = mkV.inTangents(), mkOutT = mkV.outTangents();",
      "var mkPts = [], mkI = [], mkO = [], mkToItem = [1, 0, 0, 0, 1, 0], mkIC = [1, 0, 0, 0, 1, 0];",
      "try {",
      R.matrixCode(pe.groups, true) + "  mkToItem = mkInv(mkX);",
      "  var mkLx = toCompVec([1, 0]), mkLy = toCompVec([0, 1]);",
      "  mkIC = mkMul([mkLx[0], mkLy[0], 0, mkLx[1], mkLy[1], 0], [mkX[0], mkX[1], 0, mkX[3], mkX[4], 0]);",
      "} catch (mkE0) {}",
      "var mkCI = mkInv(mkIC);",
      "for (var mkK = 0; mkK < mkP.length; mkK++) {",
      "  var mkQ = mkP[mkK], mkA = mkIn[mkK] || [0, 0], mkB = mkOutT[mkK] || [0, 0];",
      "  if (mkK < mkNames.length) {",
      "    try {",
      "      var mkN = thisComp.layer(mkNames[mkK]);",
      "      var mkC = mkApply(mkToItem, fromComp(mkN.toComp(mkN.anchorPoint.value)));",
      "      if (mkFinite(mkC)) mkQ = mkC;",
      "      if (mkTan) {",
      "        var mkNx = mkN.toCompVec([1, 0]), mkNy = mkN.toCompVec([0, 1]);",
      "        var mkM = mkMul(mkCI, mkMul([mkNx[0], mkNy[0], 0, mkNx[1], mkNy[1], 0], mkIC));",
      "        var mkA2 = mkVec(mkM, mkA), mkB2 = mkVec(mkM, mkB);",
      "        if (mkFinite(mkA2) && mkFinite(mkB2)) { mkA = mkA2; mkB = mkB2; }",
      "      }",
      "    } catch (mkE) {}",
      "  }",
      "  mkPts.push([mkQ[0], mkQ[1]]);",
      "  mkI.push([mkA[0], mkA[1]]);",
      "  mkO.push([mkB[0], mkB[1]]);",
      "}",
      "createPath(mkPts, mkI, mkO, mkV.isClosed())"
    ].join("\n");
  }

  // The null position expression for "Nulls follow points": vertex k of the path.
  function nullExpr(pe, k) {
    return [
      R.LIB,
      "var mkOut = value;",
      "try {",
      "  var mkL = thisComp.layer(" + MK.expr.str(pe.layer.name) + ");",
      R.matrixCode(pe.groups, false) + "  var mkP = " + R.ref(pe.prop) + ".points();",
      "  if (mkP.length > " + k + ") {",
      "    var mkC = mkL.toComp(mkApply(mkX, mkP[" + k + "]));",
      "    if (hasParent) mkC = parent.fromComp(mkC);",
      "    if (mkFinite(mkC)) mkOut = [mkC[0], mkC[1]];",
      "  }",
      "} catch (mkE) {}",
      "mkOut"
    ].join("\n");
  }

  MK.registerTool({
    id: ID,
    name: NAME,
    category: "Rig",
    description: "Makes a null per path vertex: the path follows the nulls, or the nulls follow the path.",
    // A polyline with small squares on its vertices (the squares).
    icon: [
      "M3.5 18 L9 7 L15 15 L20.5 5",
      { d: "R1.5 16 4 4 R7 5 4 4 R13 13 4 4 R18.5 3 4 4", fill: "accent" }
    ],
    options: [
      { key: "mode", label: "Mode", type: "dropdown", "default": "points", items: [["points", "Points follow nulls"], ["nulls", "Nulls follow points"]] },
      { key: "tangents", label: "Tangents follow too (rotate and scale with each null)", type: "checkbox", "default": false },
      { key: "parent", label: "Group nulls under a parent null", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var paths = R.selectedPaths(ctx);
      if (!paths.length) ctx.fail("select one or more path properties (a shape path or a mask path).");
      var follow = o.mode === "points", t = ctx.time, i, k;
      var empty = U.filter(paths, function (pe) { return !pe.prop.valueAtTime(t, false).vertices.length; });
      paths = U.filter(paths, function (pe) { return pe.prop.valueAtTime(t, false).vertices.length > 0; });
      if (!paths.length) ctx.fail("the selected paths have no vertices.");
      var kept = 0;
      if (follow) {
        var d = MK.expr.decide(ctx, U.map(paths, function (pe) { return pe.prop; }));
        kept = d.skip.length;
        paths = U.filter(paths, function (pe) { return U.indexOf(d.apply, pe.prop) >= 0; });
      }
      var made = 0;
      for (i = 0; i < paths.length; i++) {
        var pe = paths[i], shape = pe.prop.valueAtTime(t, false);
        var m = pathToLayer(pe, t);
        var at = S.toCompPoints(pe.layer, U.map(shape.vertices, function (v) { return MK.mat.apply(m, v); }), t);
        var nulls = [], names = [], num = 1;
        for (k = 0; k < at.length; k++) {
          while (ctx.comp.layers.byName(pe.layer.name + " Point " + num)) num++;
          var n = ctx.comp.layers.addNull();
          n.name = pe.layer.name + " Point " + num;
          n.moveBefore(pe.layer);
          n.transform.position.setValue([at[k][0], at[k][1]]);
          nulls.push(n);
          names.push(n.name);
          ctx.created.push(n);
        }
        if (o.parent) {
          var pn = ctx.comp.layers.addNull();
          pn.name = R.layerName(ctx.comp, pe.layer.name + " Points");
          pn.moveBefore(nulls[0]);
          var c = S.bounds(at).center;
          pn.transform.position.setValue([c[0], c[1]]);
          for (k = 0; k < nulls.length; k++) nulls[k].parent = pn;
          ctx.created.push(pn);
        }
        if (follow) MK.expr.set(pe.prop, ID, pathExpr(pe, names, o.tangents));
        else {
          for (k = 0; k < nulls.length; k++) MK.expr.set(nulls[k].transform.position, ID, nullExpr(pe, k));
          if (R.nameClash(pe.layer)) ctx.warn("Another layer is also named \"" + pe.layer.name + "\": rename one, or the nulls may follow the wrong path.");
        }
        made += nulls.length;
      }
      var msg = "Added " + made + (made === 1 ? " null" : " nulls") + " for " + paths.length + (paths.length === 1 ? " path" : " paths") +
        (follow ? "; the path follows them." : "; they follow the path.");
      if (empty.length) msg += " Skipped " + empty.length + " empty " + (empty.length === 1 ? "path." : "paths.");
      if (kept) msg += " Kept " + kept + " path" + (kept === 1 ? "" : "s") + " with an existing expression.";
      return ctx.done(msg);
    }
  });

  // Path space -> layer space: the enclosing shape groups at time t (identity for masks).
  function pathToLayer(pe, t) { return pe.mask ? MK.mat.identity() : MK.shapes.toLayerMatrix(pe.groups, t); }
})();
