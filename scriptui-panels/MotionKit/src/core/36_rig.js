// SPDX-License-Identifier: MIT OR Apache-2.0
// Helpers for the Rig tools: the path properties in the selection (shape paths and mask paths),
// expression text that reads a path or shape group, the shape-group matrix inside expressions,
// Layer Controls that name layers, sampled path outlines and exact shape bounds, and label colours.

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
  // thisComp.layer("Shape").content("Group 1").content("Path 1").path. `from` true starts from
  // thisLayer (for an expression on that same layer); a string starts from that expression
  // variable, such as one holding a Layer Control's layer, which survives renaming the layer.
  // Shape groups, paths and masks are still found by name: EffectCraft 0.14 doesn't rewrite
  // expressions on a rename, so renaming one of them breaks the reference.
  R.ref = function (p, from) {
    var s = "";
    for (var q = p, n = 0; q && !(q instanceof Layer) && n < 200; q = q.parentProperty, n++) {
      var m = q.matchName;
      if (m === R.SHAPE_PATH) s = ".path" + s;
      else if (m === R.MASK_PATH) s = ".maskPath" + s;
      else if (m === "ADBE Mask Atom") s = ".mask(" + MK.expr.str(q.name) + ")" + s;
      else if (q.parentProperty && (q.parentProperty.matchName === "ADBE Vectors Group" || q.parentProperty.matchName === "ADBE Root Vectors Group")) s = ".content(" + MK.expr.str(q.name) + ")" + s;
    }
    return (from === true ? "thisLayer" : typeof from === "string" ? from : "thisComp.layer(" + MK.expr.str(MK.sel.layerOf(p).name) + ")") + s;
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
  // `from` as for R.ref.
  R.matrixCode = function (groups, from) {
    var s = "var mkX = [1, 0, 0, 0, 1, 0];\n";
    for (var i = 0; i < groups.length; i++) s += "mkX = mkMul(mkX, mkGroupM(" + R.ref(groups[i], from) + "));\n";
    return s;
  };

  // Expression text reading a Layer Control's layer (null when it names none) on the
  // expression's own layer.
  R.layerOf = function (controlName) {
    return MK.controls.ref(controlName, "ADBE Layer Control") + ".value";
  };
  // A Layer Control called `name` on `layer` that names `target`, also when it already exists.
  R.layerControl = function (layer, name, target) {
    var e = MK.controls.layer(layer, name, target);
    MK.controls.set(e, target);
    return e;
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

  // The bounds of the shapes under `root` (a shape layer or a shape group) in its own space at
  // comp time t: paths, rectangles, ellipses and stars (their outer points), through nested
  // groups, without strokes; hidden items left out. Null when there are none.
  R.contentBounds = function (root, t) {
    var pts = [];
    SH.walk(root, function (it, groups) {
      if (it.enabled === false) return false;
      var m = SH.toLayerMatrix(groups, t), mn = it.matchName, i;
      var v = function (name) { return it.property(name).valueAtTime(t, false); };
      if (mn === SH.PATH_ITEM) pts = pts.concat(R.outline(v(R.SHAPE_PATH), m));
      else if (mn === "ADBE Vector Shape - Rect" || mn === "ADBE Vector Shape - Ellipse") {
        var rect = mn === "ADBE Vector Shape - Rect";
        var c = v(rect ? "ADBE Vector Rect Position" : "ADBE Vector Ellipse Position"), s = v(rect ? "ADBE Vector Rect Size" : "ADBE Vector Ellipse Size");
        var n = rect ? 4 : 64;
        for (i = 0; i < n; i++) {
          var u = rect ? [[-1, -1], [1, -1], [1, 1], [-1, 1]][i] : [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)];
          pts.push(MK.mat.apply(m, [c[0] + u[0] * s[0] / 2, c[1] + u[1] * s[1] / 2]));
        }
      } else if (mn === "ADBE Vector Shape - Star") {
        var sc = v("ADBE Vector Star Position"), k = Math.max(3, Math.round(v("ADBE Vector Star Points"))), rad = v("ADBE Vector Star Outer Radius"), rot = v("ADBE Vector Star Rotation");
        for (i = 0; i < k; i++) {
          var ang = (rot + 360 * i / k - 90) * Math.PI / 180;
          pts.push(MK.mat.apply(m, [sc[0] + rad * Math.cos(ang), sc[1] + rad * Math.sin(ang)]));
        }
      }
    });
    return MK.space.bounds(pts);
  };

  // A layer's bounds in layer space at comp time t ({left, top, width, height...}). For shape
  // layers, the exact outline of the contents: EffectCraft 0.14's sourceRectAtTime(t, false) adds
  // 1 px on each side, rounds the width up and counts strokes. Other layers use sourceRectAtTime.
  // shortcut: shape layers with a path operator (Repeater, Offset Paths, Trim...) keep
  // sourceRectAtTime, since the outline ignores operators; walk them here if that matters.
  R.layerBounds = function (layer, t) {
    var root = SH.contents(layer), ops = false;
    if (root) SH.walk(layer, function (it) { if (it.matchName.indexOf("ADBE Vector Filter") === 0) ops = true; });
    var b = root && !ops ? R.contentBounds(layer, t) : null;
    return b || MK.space.bounds(MK.space.rectCorners(layer, t, false));
  };
  // The four corners of bounds b, [x, y, 0]: top-left, top-right, bottom-right, bottom-left.
  R.corners = function (b) {
    return [[b.left, b.top, 0], [b.right, b.top, 0], [b.right, b.bottom, 0], [b.left, b.bottom, 0]];
  };

  // A label colour (1-16) no layer of the comp uses yet, or the next one in turn when all are taken.
  R.freeLabel = function (comp) {
    var used = {};
    for (var i = 1; i <= comp.numLayers; i++) used[comp.layer(i).label] = true;
    for (var l = 1; l <= 16; l++) if (!used[l]) return l;
    return 1 + comp.numLayers % 16;
  };

  // "Name", "Name 2"... a layer name the comp doesn't have yet.
  R.layerName = function (comp, base) {
    return U.uniqueName(base, function (n) { return !!comp.layers.byName(n); });
  };
  return R;
})();
