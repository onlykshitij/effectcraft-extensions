// SPDX-License-Identifier: MIT OR Apache-2.0
// Helpers for tools: selection, expression controls, undo, expressions, layer/comp space,
// keyframes, shape contents and 2D matrices. CONTRIBUTING-TOOLS.md documents each one.
// Only EffectCraft scripting calls checked against crates/script/src/prelude.js are used.

// ---------------------------------------------------------------- selection

MK.sel = (function () {
  var U = MK.util;
  var NUMERIC = [PropertyValueType.OneD, PropertyValueType.TwoD, PropertyValueType.ThreeD,
    PropertyValueType.TwoD_SPATIAL, PropertyValueType.ThreeD_SPATIAL, PropertyValueType.COLOR];
  var S = {};

  S.comp = function () {
    var c = app.project.activeItem;
    return c instanceof CompItem ? c : null;
  };
  // Selected properties that are Property objects (not groups), in selection order.
  S.props = function (comp) {
    return U.filter(comp.selectedProperties, function (p) { return p instanceof Property; });
  };
  // Selected property groups (shape groups, effects, masks...).
  S.groups = function (comp) {
    return U.filter(comp.selectedProperties, function (p) { return p instanceof PropertyGroup; });
  };
  // The layer a property belongs to.
  S.layerOf = function (prop) { return prop.propertyGroup(prop.propertyDepth); };
  // True for number, 2D/3D, spatial and colour values (things you can do maths on).
  S.isNumeric = function (prop) { return U.indexOf(NUMERIC, prop.propertyValueType) >= 0; };
  S.isAnimatable = function (prop) { return prop instanceof Property && prop.canVaryOverTime; };
  // Properties with at least `min` keyframes.
  S.keyed = function (props, min) {
    return U.filter(props, function (p) { return S.isAnimatable(p) && p.numKeys >= (min || 1); });
  };
  // 1-based indices of the selected keyframes.
  S.selectedKeys = function (prop) { return prop.numKeys ? prop.selectedKeys : []; };
  // Layers sorted by index (top first).
  S.byIndex = function (layers) {
    var a = layers.slice();
    a.sort(function (x, y) { return x.index - y.index; });
    return a;
  };
  // "Position on Box": a readable property label for messages.
  S.label = function (prop) { return "\"" + prop.name + "\" on " + S.layerOf(prop).name; };
  return S;
})();

// ---------------------------------------------------------------- undo

MK.undo = {
  // Runs fn() in one undo step named "Motion Kit: <name>".
  wrap: function (name, fn) {
    app.beginUndoGroup(MK.NAME + ": " + name);
    try {
      return fn();
    } finally {
      app.endUndoGroup();
    }
  }
};

// ---------------------------------------------------------------- expression controls

MK.controls = (function () {
  var C = {};
  // The value property of each control type.
  C.PARAM = {
    "ADBE Slider Control": "Slider", "ADBE Checkbox Control": "Checkbox", "ADBE Color Control": "Color",
    "ADBE Point Control": "Point", "ADBE Point3D Control": "3D Point", "ADBE Layer Control": "Layer",
    "ADBE Angle Control": "Angle", "ADBE Dropdown Control": "Menu"
  };
  // "Bounce – Amplitude": the house naming of controls.
  C.name = function (toolName, param) { return toolName + " – " + param; };
  C.fx = function (layer) { return layer.property("ADBE Effect Parade"); };
  // The effect called `name` (of `matchName`, when given) on the layer, or null.
  C.find = function (layer, name, matchName) {
    var fx = C.fx(layer);
    if (!fx) return null;
    for (var i = 1; i <= fx.numProperties; i++) {
      var e = fx.property(i);
      if (e.name === name && (!matchName || e.matchName === matchName)) return e;
    }
    return null;
  };
  // The control called `name`; created with `value` when the layer has none, so one control set
  // drives every property a tool touched on that layer. Returns the effect.
  C.ensure = function (layer, matchName, name, value) {
    var e = C.find(layer, name, matchName);
    if (e) return e;
    var fx = C.fx(layer);
    if (!fx) MK.fail(layer.name + " can't take effects, so it can't hold Motion Kit controls.");
    e = fx.addProperty(matchName);
    e.name = name;
    if (value !== undefined && value !== null) C.set(e, value);
    return e;
  };
  // The control's value property.
  C.prop = function (effect) { return effect.property(1); };
  C.set = function (effect, value) {
    var p = effect.property(1);
    if (effect.matchName === "ADBE Color Control" && typeof value === "string") value = MK.util.hexToRgb(value) || [1, 1, 1];
    if (effect.matchName === "ADBE Checkbox Control") value = value ? 1 : 0;
    if (p.numKeys) p.setValueAtTime(MK.sel.layerOf(p).containingComp.time, value);
    else p.setValue(value);
  };
  C.slider = function (layer, name, v) { return C.ensure(layer, "ADBE Slider Control", name, v); };
  C.checkbox = function (layer, name, v) { return C.ensure(layer, "ADBE Checkbox Control", name, !!v); };
  C.color = function (layer, name, v) { return C.ensure(layer, "ADBE Color Control", name, v); };
  C.point = function (layer, name, v) { return C.ensure(layer, "ADBE Point Control", name, v); };
  C.point3d = function (layer, name, v) { return C.ensure(layer, "ADBE Point3D Control", name, v); };
  C.angle = function (layer, name, v) { return C.ensure(layer, "ADBE Angle Control", name, v); };
  C.layer = function (layer, name, target) { return C.ensure(layer, "ADBE Layer Control", name, target || null); };
  // EffectCraft's Dropdown Menu Control has no script API for its item names (no
  // setPropertyParameters), so the value is a 1-based index.
  C.dropdown = function (layer, name, index) { return C.ensure(layer, "ADBE Dropdown Control", name, index || 1); };
  // Expression text reading a control: effect("Bounce – Amplitude")("Slider").
  C.ref = function (name, matchName) {
    return "effect(" + JSON.stringify(name) + ")(" + JSON.stringify(C.PARAM[matchName || "ADBE Slider Control"]) + ")";
  };
  return C;
})();

// ---------------------------------------------------------------- expressions

MK.expr = (function () {
  var X = {};
  X.MARK = "// " + MK.NAME + ": ";
  // The full expression a tool writes: a first-line mark, then the body.
  X.make = function (toolId, body) { return X.MARK + toolId + "\n" + body; };
  // True when the property's expression was written by Motion Kit (any tool, or `toolId`).
  X.isOurs = function (prop, toolId) {
    var e = String(prop.expression || "");
    return e.indexOf(X.MARK + (toolId || "")) === 0;
  };
  X.hasForeign = function (prop) { return !!prop.expression && !X.isOurs(prop); };
  // A JavaScript string literal, for names and text inside expressions.
  X.str = function (s) { return JSON.stringify(String(s)); };
  // Which properties a tool may write: those that can take an expression, minus (when the user
  // says no) those with an expression Motion Kit didn't write. ctx.confirm asks once.
  // Returns {apply: [props], skip: [props]}.
  X.decide = function (ctx, props) {
    var foreign = MK.util.filter(props, function (p) { return p.canSetExpression && X.hasForeign(p); });
    var replace = !foreign.length || ctx.confirm(foreign.length === 1
      ? MK.sel.label(foreign[0]) + " already has an expression that Motion Kit didn't write. Replace it?"
      : foreign.length + " of the selected properties already have expressions that Motion Kit didn't write. Replace them?");
    var out = { apply: [], skip: [] };
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!p.canSetExpression || (!replace && X.hasForeign(p))) out.skip.push(p);
      else out.apply.push(p);
    }
    return out;
  };
  X.set = function (prop, toolId, body) { prop.expression = X.make(toolId, body); };
  // "Bounce added to 2 properties. Skipped 1 without two keyframes. Kept 1 existing expression."
  // resting: how many of the applied properties stop at their last keyframe (MK.keys.atRest),
  // for tools that carry the arriving speed on; linear: how many last keyframes were made to
  // arrive Linear (MK.keys.offerLinearArrival).
  X.report = function (toolName, applied, invalid, kept, needs, resting, linear) {
    var s = toolName + " added to " + applied + (applied === 1 ? " property." : " properties.");
    if (invalid) s += " Skipped " + invalid + " without " + needs + ".";
    if (kept) s += " Kept " + kept + (kept === 1 ? " existing expression." : " existing expressions.");
    if (resting) s += " " + (resting === applied ? (applied === 1 ? "It stops" : "They stop") : resting + " of them stop") +
      " at the last keyframe (eased or Hold), so nothing moves after it: make that keyframe Linear or ease it less.";
    if (linear) s += " Made " + (linear === 1 ? "one last keyframe" : linear + " last keyframes") + " arrive Linear.";
    return s;
  };
  // decide() then set() on each: body is a string or function(prop) -> string.
  // Returns {applied: [props], skipped: [props]}.
  X.applyAll = function (ctx, props, toolId, body) {
    var d = X.decide(ctx, props);
    for (var i = 0; i < d.apply.length; i++) X.set(d.apply[i], toolId, typeof body === "function" ? body(d.apply[i]) : body);
    return { applied: d.apply, skipped: d.skip };
  };
  return X;
})();

// ---------------------------------------------------------------- 2D matrices

// Affine 2D matrices as [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f. The order and
// sign conventions match EffectCraft's renderer (crates/geom Mat3).
MK.mat = (function () {
  var M = {};
  M.identity = function () { return [1, 0, 0, 0, 1, 0]; };
  M.mul = function (m, n) {
    return [m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2],
      m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5]];
  };
  M.translate = function (x, y) { return [1, 0, x, 0, 1, y]; };
  M.scale = function (sx, sy) { return [sx, 0, 0, 0, sy, 0]; };
  M.rotate = function (deg) {
    var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [c, -s, 0, s, c, 0];
  };
  // Shear by `deg` along the axis at `axisDeg`.
  M.skew = function (deg, axisDeg) {
    var k = Math.tan(deg * Math.PI / 180);
    return M.mul(M.mul(M.rotate(axisDeg), [1, k, 0, 0, 1, 0]), M.rotate(-axisDeg));
  };
  M.apply = function (m, p) { return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]]; };
  // Applies only the linear part (for tangents and directions).
  M.applyVec = function (m, v) { return [m[0] * v[0] + m[1] * v[1], m[3] * v[0] + m[4] * v[1]]; };
  M.invert = function (m) {
    var det = m[0] * m[4] - m[1] * m[3];
    if (!det || !isFinite(det)) return null;
    var a = m[4] / det, b = -m[1] / det, d = -m[3] / det, e = m[0] / det;
    return [a, b, -(a * m[2] + b * m[5]), d, e, -(d * m[2] + e * m[5])];
  };
  // The 2D layer / shape group transform: position + R(rot) * Skew * S(scale) * (p - anchor).
  M.transform = function (anchor, position, scalePct, rotation, skew, skewAxis) {
    var m = M.translate(position[0], position[1]);
    m = M.mul(m, M.rotate(rotation || 0));
    if (skew) m = M.mul(m, M.skew(-skew, skewAxis || 0));
    m = M.mul(m, M.scale(scalePct[0] / 100, scalePct[1] / 100));
    return M.mul(m, M.translate(-anchor[0], -anchor[1]));
  };
  return M;
})();

// ---------------------------------------------------------------- layer and comp space

// Space conversion goes through EffectCraft's own expression engine (thisLayer.toComp and
// friends) on a temporary 3D Point Control, so parenting, 3D, cameras and expressions on the
// transforms all count, at any time. The probe is added and removed inside the tool's undo step.
MK.space = (function () {
  var U = MK.util;
  var S = {};

  function num(v) { return U.isNum(v) ? v : 0; }
  function vec(p) { return "[" + num(p[0]) + "," + num(p[1]) + "," + num(p[2]) + "]"; }

  function host(layer) {
    var fx = layer.property("ADBE Effect Parade");
    if (fx) return { fx: fx, temp: null, ref: "thisLayer" };
    // Cameras and lights take no effects: a temporary null reads them by index.
    var temp = layer.containingComp.layers.addNull();
    return { fx: temp.property("ADBE Effect Parade"), temp: temp, ref: "thisComp.layer(" + layer.index + ")" };
  }

  // Calls fn(evaluate) where evaluate(code, t) runs `code` as an expression on the layer at comp
  // time t and returns its value (up to three numbers). In code, `L` is the layer.
  S.probe = function (layer, fn) {
    var h = host(layer);
    var effect = h.fx.addProperty("ADBE Point3D Control");
    try {
      effect.name = "Motion Kit probe";
      var p = effect.property(1);
      return fn(function (code, t) {
        p.expression = "var L = " + h.ref + ";\n" + code;
        return p.valueAtTime(t, false);
      });
    } finally {
      try { effect.remove(); } catch (e1) {}
      if (h.temp) try { h.temp.remove(); } catch (e2) {}
    }
  };

  function convert(layer, fnName, pts, t) {
    return S.probe(layer, function (ev) {
      return U.map(pts, function (p) { return ev("L." + fnName + "(" + vec(p) + ")", t); });
    });
  }

  // Layer space -> comp space (and back), [x, y, z] in, [x, y, z] out, at comp time t
  // (default: the comp's current time).
  S.toComp = function (layer, p, t) { return S.toCompPoints(layer, [p], t)[0]; };
  S.fromComp = function (layer, p, t) { return convert(layer, "fromComp", [p], tm(layer, t))[0]; };
  S.toWorld = function (layer, p, t) { return convert(layer, "toWorld", [p], tm(layer, t))[0]; };
  S.fromWorld = function (layer, p, t) { return convert(layer, "fromWorld", [p], tm(layer, t))[0]; };
  function tm(layer, t) { return t === undefined ? layer.containingComp.time : t; }

  // True when the layer and all its parents are 2D: then layer -> comp is affine.
  S.is2D = function (layer) {
    for (var l = layer, n = 0; l && n < 200; l = l.parent, n++) if (l.threeDLayer) return false;
    return true;
  };

  // The 2D affine matrix layer -> comp at time t (only for S.is2D layers).
  S.matrix = function (layer, t) {
    var r = S.probe(layer, function (ev) {
      var tt = tm(layer, t);
      return [ev("var o = L.toComp([0,0,0]), x = L.toComp([1,0,0]); [o[0], o[1], x[0]]", tt),
        ev("var o = L.toComp([0,0,0]), x = L.toComp([1,0,0]), y = L.toComp([0,1,0]); [x[1], y[0], y[1]]", tt)];
    });
    var ox = r[0][0], oy = r[0][1];
    return [r[0][2] - ox, r[1][1] - ox, ox, r[1][0] - oy, r[1][2] - oy, oy];
  };

  // Many points layer -> comp at once (one matrix for 2D layers, one probe either way).
  S.toCompPoints = function (layer, pts, t) {
    var tt = tm(layer, t);
    if (S.is2D(layer)) {
      var m = S.matrix(layer, tt);
      return U.map(pts, function (p) { var q = MK.mat.apply(m, [num(p[0]), num(p[1])]); return [q[0], q[1], 0]; });
    }
    return convert(layer, "toComp", pts, tt);
  };

  // The four corners of sourceRectAtTime(t, extents) in layer space: top-left, top-right,
  // bottom-right, bottom-left. Layers without a rectangle (cameras, lights) give their anchor.
  S.rectCorners = function (layer, t, extents) {
    var r = null;
    try { if (layer.sourceRectAtTime) r = layer.sourceRectAtTime(tm(layer, t), !!extents); } catch (e) {}
    if (!r) {
      var a = layer.transform.anchorPoint.valueAtTime(tm(layer, t), false);
      return [[a[0], a[1], 0], [a[0], a[1], 0], [a[0], a[1], 0], [a[0], a[1], 0]];
    }
    var x0 = r.left, y0 = r.top, x1 = r.left + r.width, y1 = r.top + r.height;
    return [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
  };
  S.rectCornersInComp = function (layer, t, extents) {
    return S.toCompPoints(layer, S.rectCorners(layer, t, extents), t);
  };
  // The anchor point in comp space (where the layer "is").
  S.anchorInComp = function (layer, t) {
    return S.toComp(layer, layer.transform.anchorPoint.valueAtTime(tm(layer, t), false), t);
  };
  // A comp-space point in the layer's parent space (the space its Position is in).
  S.compToParent = function (layer, p, t) {
    return layer.parent ? S.fromComp(layer.parent, p, t) : [num(p[0]), num(p[1]), num(p[2])];
  };
  // {left, top, right, bottom, width, height, center: [x, y, z]} of points (z averaged).
  S.bounds = function (pts) {
    if (!pts.length) return null;
    var b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }, z = 0;
    for (var i = 0; i < pts.length; i++) {
      b.left = Math.min(b.left, pts[i][0]);
      b.right = Math.max(b.right, pts[i][0]);
      b.top = Math.min(b.top, pts[i][1]);
      b.bottom = Math.max(b.bottom, pts[i][1]);
      z += num(pts[i][2]);
    }
    b.width = b.right - b.left;
    b.height = b.bottom - b.top;
    b.center = [(b.left + b.right) / 2, (b.top + b.bottom) / 2, z / pts.length];
    return b;
  };
  return S;
})();

// ---------------------------------------------------------------- keyframes

MK.keys = (function () {
  var K = {};
  function eases(a) { return MK.util.map(a, function (e) { return { speed: e.speed, influence: e.influence }; }); }

  // Everything about key i (1-based) as a plain object. Times are comp time.
  K.read = function (prop, i) {
    var k = {
      index: i, time: prop.keyTime(i), value: prop.keyValue(i),
      inInterp: prop.keyInInterpolationType(i), outInterp: prop.keyOutInterpolationType(i),
      inEase: eases(prop.keyInTemporalEase(i)), outEase: eases(prop.keyOutTemporalEase(i)),
      continuous: prop.keyTemporalContinuous(i), autoBezier: prop.keyTemporalAutoBezier(i),
      roving: prop.keyRoving(i), selected: prop.keySelected(i), spatial: prop.isSpatial
    };
    if (k.spatial) {
      k.inTangent = prop.keyInSpatialTangent(i);
      k.outTangent = prop.keyOutSpatialTangent(i);
      k.spatialContinuous = prop.keySpatialContinuous(i);
      k.spatialAutoBezier = prop.keySpatialAutoBezier(i);
    }
    return k;
  };
  // True when key i arrives (arriving) or leaves with no speed: Hold, or Bezier with every ease
  // speed 0 (Easy Ease). Tools that carry the speed on past the key have nothing to use there.
  K.atRest = function (prop, i, arriving) {
    var interp = arriving ? prop.keyInInterpolationType(i) : prop.keyOutInterpolationType(i);
    if (interp === KeyframeInterpolationType.HOLD) return true;
    if (interp !== KeyframeInterpolationType.BEZIER) return false;
    var e = arriving ? prop.keyInTemporalEase(i) : prop.keyOutTemporalEase(i);
    for (var k = 0; k < e.length; k++) if (Math.abs(e[k].speed) > 1e-6) return false;
    return true;
  };
  // Asks to make the last keyframe of each property that eases to a stop (Bezier, speed 0)
  // arrive Linear, so a tool that carries the arriving speed on has one to use. Hold arrivals
  // are left alone: the value jumps there. Returns how many keyframes it changed.
  K.offerLinearArrival = function (props, toolName) {
    var eased = MK.util.filter(props, function (p) { return p.keyInInterpolationType(p.numKeys) === KeyframeInterpolationType.BEZIER && K.atRest(p, p.numKeys, true); });
    if (!eased.length) return 0;
    var what = eased.length === 1 ? MK.sel.label(eased[0]) + " eases to a stop at its last keyframe" : eased.length + " properties ease to a stop at their last keyframe";
    if (!MK.prompts.confirm(toolName + ": " + what + ", so there's no speed left to carry on. Make that keyframe arrive Linear?")) return 0;
    for (var i = 0; i < eased.length; i++) {
      var n = eased[i].numKeys;
      eased[i].setInterpolationTypeAtKey(n, KeyframeInterpolationType.LINEAR, eased[i].keyOutInterpolationType(n));
    }
    return eased.length;
  };
  K.readAll = function (prop) {
    var out = [];
    for (var i = 1; i <= prop.numKeys; i++) out.push(K.read(prop, i));
    return out;
  };
  K.readSelected = function (prop) {
    return MK.util.map(MK.sel.selectedKeys(prop), function (i) { return K.read(prop, i); });
  };
  // KeyframeEase objects for setTemporalEaseAtKey: `list` resized to `dims`, reusing the first
  // entry when the counts differ (a 1D ease pasted on a 3D property and so on).
  K.fit = function (list, dims) {
    var out = [];
    for (var d = 0; d < dims; d++) {
      var e = list[d < list.length ? d : 0] || { speed: 0, influence: 33.333 };
      out.push(new KeyframeEase(e.speed, MK.util.clamp(e.influence, 0.1, 100)));
    }
    return out;
  };
  // Sets eases on key i, fitting them to the property's ease dimensions.
  K.setEase = function (prop, i, inEase, outEase) {
    var dims = prop.keyInTemporalEase(i).length;
    prop.setTemporalEaseAtKey(i, K.fit(inEase || outEase, dims), K.fit(outEase || inEase, dims));
  };
  // Writes a key read with K.read at comp time `time` (default its own), with its value,
  // interpolation, eases, spatial tangents and roving. Returns the new key's index.
  // `parts` limits what is written: {value, ease, interp, spatial, roving}, all true by default.
  K.write = function (prop, k, time, parts) {
    var want = function (n) { return !parts || parts[n] !== false; };
    var t = time === undefined ? k.time : time;
    if (want("value") || !prop.numKeys) prop.setValueAtTime(t, k.value);
    else prop.addKey(t);
    var i = prop.nearestKeyIndex(t);
    if (want("ease") && k.inEase && k.outEase) {
      K.setEase(prop, i, k.inEase, k.outEase);
      if (k.continuous !== undefined) prop.setTemporalContinuousAtKey(i, k.continuous);
      if (k.autoBezier !== undefined) prop.setTemporalAutoBezierAtKey(i, k.autoBezier);
    }
    // After the ease: EffectCraft's setTemporalEaseAtKey switches both sides to Bezier.
    if (want("interp") && k.inInterp !== undefined && prop.isInterpolationTypeValid(k.inInterp) && prop.isInterpolationTypeValid(k.outInterp)) {
      prop.setInterpolationTypeAtKey(i, k.inInterp, k.outInterp);
    }
    if (want("spatial") && k.spatial && prop.isSpatial && k.inTangent) {
      prop.setSpatialTangentsAtKey(i, k.inTangent, k.outTangent);
      if (k.spatialContinuous !== undefined) prop.setSpatialContinuousAtKey(i, k.spatialContinuous);
      if (k.spatialAutoBezier !== undefined) prop.setSpatialAutoBezierAtKey(i, k.spatialAutoBezier);
    }
    // Roving only applies between other keys; EffectCraft refuses it elsewhere.
    if (want("roving") && k.roving) try { prop.setRovingAtKey(i, true); } catch (e) {}
    return i;
  };
  // Writes keys read with K.read, each at newTime(key) (default its own time). Roving is set once
  // all are written, since a key only roves between two others. Returns the count.
  K.writeAll = function (prop, ks, newTime) {
    var at = function (k) { return newTime ? newTime(k) : k.time; };
    for (var j = 0; j < ks.length; j++) K.write(prop, ks[j], at(ks[j]), { roving: false });
    for (var r = 0; r < ks.length; r++) {
      if (ks[r].roving) try { prop.setRovingAtKey(prop.nearestKeyIndex(at(ks[r])), true); } catch (e) {}
    }
    return ks.length;
  };
  // Sets both interpolation types of key i when the property takes them; false when it can't.
  // Only the types change: EffectCraft keeps a key's temporal ease while it is Linear or Hold,
  // so switching back to Bezier brings the ease back (setTemporalEaseAtKey would overwrite it).
  K.setInterp = function (prop, i, inType, outType) {
    if (!prop.isInterpolationTypeValid(inType) || !prop.isInterpolationTypeValid(outType)) return false;
    prop.setInterpolationTypeAtKey(i, inType, outType);
    return true;
  };
  // Removes keys by 1-based index (any order).
  K.remove = function (prop, indices) {
    var a = indices.slice();
    a.sort(function (x, y) { return y - x; });
    for (var i = 0; i < a.length; i++) prop.removeKey(a[i]);
  };
  return K;
})();

// ---------------------------------------------------------------- shape contents

MK.shapes = (function () {
  var S = {};
  S.GROUP = "ADBE Vector Group";
  S.PATH_ITEM = "ADBE Vector Shape - Group";
  S.PATH = "ADBE Vector Shape";
  // By the Contents group, not `instanceof ShapeLayer`: after an Undo, EffectCraft can reuse a
  // removed layer's id and hand back that layer's old wrapper type.
  S.contents = function (layer) { return (layer && layer.property("ADBE Root Vectors Group")) || null; };
  S.isGroup = function (p) { return p && p.matchName === S.GROUP; };
  // The contents (child list) of a group, or the root contents itself.
  S.inner = function (p) { return S.isGroup(p) ? p.property("ADBE Vectors Group") : p; };
  S.groupTransform = function (g) { return g.property("ADBE Vector Transform Group"); };
  // Visits every item under `root` (a shape layer, its contents, a group or a group's contents) depth first:
  // fn(item, groups) where groups lists the enclosing shape groups, outermost first. Return false
  // from fn to skip a group's insides.
  S.walk = function (root, fn) {
    (function visit(list, groups, depth) {
      if (!list || depth > 64) return;
      for (var i = 1; i <= list.numProperties; i++) {
        var it = list.property(i);
        if (fn(it, groups) === false) continue;
        if (S.isGroup(it)) visit(S.inner(it), groups.concat([it]), depth + 1);
      }
    })(root instanceof Layer ? S.contents(root) : S.inner(root), [], 0);
  };
  // Every item of a match name under root: [{item, groups}].
  S.find = function (root, matchName) {
    var out = [];
    S.walk(root, function (it, groups) { if (it.matchName === matchName) out.push({ item: it, groups: groups }); });
    return out;
  };
  // The path properties (ADBE Vector Shape) of a shape layer: [{prop, groups}].
  S.paths = function (layer) {
    return MK.util.map(S.find(S.contents(layer), S.PATH_ITEM), function (r) { return { prop: r.item.property(S.PATH), groups: r.groups }; });
  };
  // The shape groups enclosing a property, outermost first (walks parentProperty).
  S.groupsOf = function (prop) {
    var out = [];
    for (var p = prop.parentProperty, n = 0; p && n < 200 && !(p instanceof Layer); p = p.parentProperty, n++) if (S.isGroup(p)) out.unshift(p);
    return out;
  };
  // One group's transform as a 2D matrix (group space -> its parent's space) at comp time t.
  S.groupMatrix = function (group, t) {
    var tr = S.groupTransform(group);
    var v = function (m) { return tr.property(m).valueAtTime(t, false); };
    return MK.mat.transform(v("ADBE Vector Anchor"), v("ADBE Vector Position"), v("ADBE Vector Scale"),
      v("ADBE Vector Rotation"), v("ADBE Vector Skew"), v("ADBE Vector Skew Axis"));
  };
  // Item space -> layer space through the enclosing groups.
  S.toLayerMatrix = function (groups, t) {
    var m = MK.mat.identity();
    for (var i = 0; i < groups.length; i++) m = MK.mat.mul(m, S.groupMatrix(groups[i], t));
    return m;
  };
  return S;
})();
