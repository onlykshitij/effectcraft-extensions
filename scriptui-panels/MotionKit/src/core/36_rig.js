// SPDX-License-Identifier: MIT OR Apache-2.0
// Helpers for the Rig tools: the path properties in the selection (shape paths and mask paths),
// expression text that reads a path or shape group, the shape-group matrix inside expressions,
// sampled path outlines for bounds, and label colours.

MK.rig = (function () {
  var U = MK.util, SH = MK.shapes;
  var R = {};
  R.SHAPE_PATH = "ADBE Vector Shape";
  R.MASK_PATH = "ADBE Mask Shape";

  // "layerIndex:i:j:k", the property's place in the layer tree, to spot the same property twice.
  function key(p) {
    var parts = [];
    for (var q = p, n = 0; q && !(q instanceof Layer) && n < 200; q = q.parentProperty, n++) parts.unshift(q.propertyIndex);
    return MK.sel.layerOf(p).index + ":" + parts.join(":");
  }

  // The selected path properties, also when the path item ("Path 1") or the mask is the selected
  // group: [{prop, layer, mask, groups}], in selection order, each once. `groups` are the
  // enclosing shape groups, outermost first (none for masks).
  R.selectedPaths = function (ctx) {
    var out = [], seen = {};
    function add(p) {
      if (!p || seen[key(p)]) return;
      seen[key(p)] = true;
      var mask = p.matchName === R.MASK_PATH;
      out.push({ prop: p, layer: MK.sel.layerOf(p), mask: mask, groups: mask ? [] : SH.groupsOf(p) });
    }
    var i;
    for (i = 0; i < ctx.props.length; i++) {
      var m = ctx.props[i].matchName;
      if (m === R.SHAPE_PATH || m === R.MASK_PATH) add(ctx.props[i]);
    }
    for (i = 0; i < ctx.groups.length; i++) {
      var g = ctx.groups[i];
      if (g.matchName === SH.PATH_ITEM) add(g.property(R.SHAPE_PATH));
      else if (g.matchName === "ADBE Mask Atom") add(g.property(R.MASK_PATH));
    }
    return out;
  };

  // Expression text reaching a shape item, shape path, mask or mask path from any layer:
  // thisComp.layer("Shape").content("Group 1").content("Path 1").path. With `self` it starts
  // from thisLayer (for an expression on that same layer).
  R.ref = function (p, self) {
    var s = "";
    for (var q = p, n = 0; q && !(q instanceof Layer) && n < 200; q = q.parentProperty, n++) {
      var m = q.matchName;
      if (m === R.SHAPE_PATH) s = ".path" + s;
      else if (m === R.MASK_PATH) s = ".maskPath" + s;
      else if (m === "ADBE Mask Atom") s = ".mask(" + MK.expr.str(q.name) + ")" + s;
      else if (q.parentProperty && (q.parentProperty.matchName === "ADBE Vectors Group" || q.parentProperty.matchName === "ADBE Root Vectors Group")) s = ".content(" + MK.expr.str(q.name) + ")" + s;
    }
    return (self ? "thisLayer" : "thisComp.layer(" + MK.expr.str(MK.sel.layerOf(p).name) + ")") + s;
  };

  // Expression functions on 2D affine matrices [a, b, c, d, e, f] (x' = a x + b y + c,
  // y' = d x + e y + f), with mkGroupM(group) building a shape group's transform the way
  // MK.mat.transform and EffectCraft's renderer do: position, rotation, skew, scale, -anchor.
  // mkPathOf(v) works around EffectCraft 0.14 handing a path property's own expression `value`
  // (and thisProperty.value) as a raw [points, inTangents, outTangents, closed] list instead of
  // a Path object; it returns a Path either way.
  R.LIB = [
    "function mkMul(m, n) {",
    "  return [m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2],",
    "    m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5]];",
    "}",
    "function mkRot(deg) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, -s, 0, s, c, 0]; }",
    "function mkGroupM(g) {",
    "  var t = g.transform, an = t.anchorPoint.value, po = t.position.value, sc = t.scale.value;",
    "  var m = mkMul([1, 0, po[0], 0, 1, po[1]], mkRot(t.rotation.value));",
    "  var k = Math.tan(-t.skew.value * Math.PI / 180), ax = t.skewAxis.value;",
    "  if (k) m = mkMul(m, mkMul(mkMul(mkRot(ax), [1, k, 0, 0, 1, 0]), mkRot(-ax)));",
    "  m = mkMul(m, [sc[0] / 100, 0, 0, 0, sc[1] / 100, 0]);",
    "  return mkMul(m, [1, 0, -an[0], 0, 1, -an[1]]);",
    "}",
    "function mkApply(m, p) { return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]]; }",
    "function mkVec(m, v) { return [m[0] * v[0] + m[1] * v[1], m[3] * v[0] + m[4] * v[1]]; }",
    "function mkInv(m) {",
    "  var d = m[0] * m[4] - m[1] * m[3];",
    "  if (!d || !isFinite(d)) return [1, 0, 0, 0, 1, 0];",
    "  var a = m[4] / d, b = -m[1] / d, c = -m[3] / d, e = m[0] / d;",
    "  return [a, b, -(a * m[2] + b * m[5]), c, e, -(c * m[2] + e * m[5])];",
    "}",
    "function mkFinite(p) { return isFinite(p[0]) && isFinite(p[1]); }",
    "function mkPathOf(v) { return v && typeof v.points === \"function\" ? v : createPath(v[0], v[1], v[2], !!v[3]); }"
  ].join("\n");

  // Expression code that sets mkX to the matrix from a path's own space to its layer's space,
  // through its enclosing shape groups at the current time (identity for masks). Needs R.LIB.
  R.matrixCode = function (groups, self) {
    var s = "var mkX = [1, 0, 0, 0, 1, 0];\n";
    for (var i = 0; i < groups.length; i++) s += "mkX = mkMul(mkX, mkGroupM(" + R.ref(groups[i], self) + "));\n";
    return s;
  };

  // Points along a Shape value (its vertices and `steps` points per Bézier segment), through the
  // 2D matrix m (default identity). For bounds.
  R.outline = function (shape, m, steps) {
    var v = shape.vertices || [], ins = shape.inTangents || [], outs = shape.outTangents || [];
    var n = v.length, k = steps || 16, pts = [], mat = m || MK.mat.identity();
    var segs = shape.closed ? n : n - 1;
    if (n === 1) pts.push(v[0]);
    for (var i = 0; i < segs; i++) {
      var a = v[i], b = v[(i + 1) % n], o = outs[i] || [0, 0], c = ins[(i + 1) % n] || [0, 0];
      var p1 = [a[0] + o[0], a[1] + o[1]], p2 = [b[0] + c[0], b[1] + c[1]];
      for (var s = 0; s <= k; s++) {
        var u = s / k, w = 1 - u;
        pts.push([w * w * w * a[0] + 3 * w * w * u * p1[0] + 3 * w * u * u * p2[0] + u * u * u * b[0],
          w * w * w * a[1] + 3 * w * w * u * p1[1] + 3 * w * u * u * p2[1] + u * u * u * b[1]]);
      }
    }
    return U.map(pts, function (p) { return MK.mat.apply(mat, p); });
  };

  // A label colour (1-16) no layer of the comp uses yet, or the next one in turn when all are taken.
  R.freeLabel = function (comp) {
    var used = {};
    for (var i = 1; i <= comp.numLayers; i++) used[comp.layer(i).label] = true;
    for (var l = 1; l <= 16; l++) if (!used[l]) return l;
    return 1 + comp.numLayers % 16;
  };

  // True when another layer of the comp has this layer's name, so thisComp.layer(name) in an
  // expression could find the wrong one.
  R.nameClash = function (layer) {
    var c = layer.containingComp;
    for (var i = 1; i <= c.numLayers; i++) if (c.layer(i).name === layer.name && c.layer(i).index !== layer.index) return true;
    return false;
  };

  // "Name", "Name 2"... a layer name the comp doesn't have yet.
  R.layerName = function (comp, base) {
    return U.uniqueName(base, function (n) { return !!comp.layers.byName(n); });
  };
  return R;
})();
