// SPDX-License-Identifier: MIT OR Apache-2.0
// Crop Comp: precomposes the selected layers into "<top layer> Crop", a comp just big enough for
// what they show over their whole in-out range, and places it so nothing moves.
// Bounds: the four sourceRectAtTime corners of each layer taken to comp space with the
// expression engine's own toComp(point, t) (parents, 3D and expressions count) every N frames
// from in to out. The loop runs inside one probe expression per chunk of frames, because a probe
// per frame would be slow; expressions that run too long stop, so each chunk returns a marker.
// Inside the new comp the unparented layers move by (-left, -top); in the parent comp the
// precomp layer's anchor is the new comp's centre and its position is that centre in comp space.

(function () {
  var NAME = "Crop Comp", U = MK.util;
  var CHUNK = 60; // frames per probe expression

  function itemNamed(name) {
    for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i).name === name) return true;
    return false;
  }

  // Expression: the min (or max) comp x and y of the layer's rectangle corners at each time in
  // `times`; z is 1 when the loop finished.
  function boundsCode(times, max) {
    var f = max ? "Math.max" : "Math.min", init = max ? "-Infinity" : "Infinity";
    return [
      "var mkX = " + init + ", mkY = " + init + ", mkT = [" + times.join(",") + "];",
      "for (var mkI = 0; mkI < mkT.length; mkI++) {",
      "  var mkR = L.sourceRectAtTime(mkT[mkI], false);",
      "  var mkC = [[mkR.left, mkR.top], [mkR.left + mkR.width, mkR.top], [mkR.left + mkR.width, mkR.top + mkR.height], [mkR.left, mkR.top + mkR.height]];",
      "  for (var mkK = 0; mkK < 4; mkK++) {",
      "    var mkQ = L.toComp([mkC[mkK][0], mkC[mkK][1], 0], mkT[mkI]);",
      "    mkX = " + f + "(mkX, mkQ[0]); mkY = " + f + "(mkY, mkQ[1]);",
      "  }",
      "}",
      "[mkX, mkY, 1]"
    ].join("\n");
  }

  // The layer's frame times inside the comp: every `step` frames from its in point, plus its
  // last frame. Empty when it shows nothing inside the comp's duration.
  function frameTimes(layer, comp, step) {
    var fd = comp.frameDuration, t0 = Math.max(layer.inPoint, 0), t1 = Math.min(layer.outPoint, comp.duration);
    var out = [];
    if (!(t1 - t0 > 1e-9)) return out;
    for (var t = t0; t < t1 - 1e-9; t += step * fd) out.push(t);
    var last = Math.max(t0, t1 - fd);
    if (out[out.length - 1] < last - 1e-9) out.push(last);
    return out;
  }

  // [left, top, right, bottom] of the layer in comp space over `times`.
  function layerBounds(layer, times) {
    return MK.space.probe(layer, function (ev) {
      var b = [Infinity, Infinity, -Infinity, -Infinity];
      for (var i = 0; i < times.length; i += CHUNK) {
        var part = times.slice(i, i + CHUNK);
        var lo = ev(boundsCode(part, false), 0), hi = ev(boundsCode(part, true), 0);
        if (lo[2] !== 1 || hi[2] !== 1 || !U.isNum(lo[0]) || !U.isNum(lo[1]) || !U.isNum(hi[0]) || !U.isNum(hi[1])) {
          MK.fail("couldn't measure " + layer.name + " (its bounds expression didn't finish). Try a larger \"Sample every\" in the options.");
        }
        b = [Math.min(b[0], lo[0]), Math.min(b[1], lo[1]), Math.max(b[2], hi[0]), Math.max(b[3], hi[1])];
      }
      return b;
    });
  }

  function shiftProp(p, d) {
    function add(v) {
      if (typeof v === "number") return v + d[0];
      var o = [v[0] + d[0], v[1] + d[1]];
      if (v.length > 2) o.push(v[2]);
      return o;
    }
    if (p.numKeys) for (var k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, add(p.keyValue(k)));
    else p.setValue(add(p.value));
  }

  // Moves a layer by d in its comp, keys included (X and Y Position when separated).
  function shiftLayer(layer, d) {
    var tr = layer.transform, pos = tr.position;
    if (pos.dimensionsSeparated) {
      shiftProp(tr.property("ADBE Position_0"), [d[0]]);
      shiftProp(tr.property("ADBE Position_1"), [d[1]]);
    } else shiftProp(pos, d);
    return !!(pos.expression || (pos.dimensionsSeparated && (tr.property("ADBE Position_0").expression || tr.property("ADBE Position_1").expression)));
  }

  MK.registerTool({
    id: "cropComp",
    name: NAME,
    category: "Comp",
    description: "Precomposes the selected layers into a comp cropped to their bounds, without moving them.",
    // Crop marks around a frame (the corners).
    icon: [
      "R7 7 10 10",
      { d: "M3 9 V3 H9 M15 3 H21 V9 M21 15 V21 H15 M9 21 H3 V15", stroke: "accent", w: 2 }
    ],
    options: [
      { key: "padding", label: "Padding", type: "number", "default": 0, min: 0, max: 5000, unit: "px" },
      { key: "even", label: "Round the size to even pixels", type: "checkbox", "default": true },
      { key: "step", label: "Sample every", type: "number", "default": 1, min: 1, max: 1000, integer: true, unit: "frames", help: "How often the layers' bounds are measured between their in and out points." }
    ],
    run: function (ctx, o) {
      var comp = ctx.comp, layers = MK.sel.byIndex(ctx.layers), i;
      if (!layers.length) ctx.fail("select the layers to crop into a new comp.");
      var ids = {};
      for (i = 0; i < layers.length; i++) ids[layers[i].id] = true;
      var times = [], visible = 0, threeD = false;
      for (i = 0; i < layers.length; i++) {
        var L = layers[i];
        // Cameras, lights and nulls draw nothing.
        times.push(L instanceof AVLayer && !L.nullLayer ? frameTimes(L, comp, o.step) : []);
        if (times[i].length) visible++;
        if (L.threeDLayer) threeD = true;
      }
      if (!visible) ctx.fail("none of the selected layers shows anything inside the comp's duration.");

      // Precomposing drops parents outside the selection, so unparent those first (compensated
      // at the current time, which is exact unless the parent is animated).
      for (i = 0; i < layers.length; i++) {
        var par = layers[i].parent;
        if (par && !ids[par.id]) {
          layers[i].parent = null;
          ctx.warn(layers[i].name + " was parented to " + par.name + ", which isn't selected; it was unparented first" + (par.transform.position.numKeys || par.transform.rotation.numKeys || par.transform.scale.numKeys ? " and won't follow that parent's animation." : "."));
        }
      }

      var b = [Infinity, Infinity, -Infinity, -Infinity];
      for (i = 0; i < layers.length; i++) {
        if (!times[i].length) continue;
        var lb = layerBounds(layers[i], times[i]);
        b = [Math.min(b[0], lb[0]), Math.min(b[1], lb[1]), Math.max(b[2], lb[2]), Math.max(b[3], lb[3])];
      }
      // Whole pixels, so the layers move by whole pixels and nothing is resampled.
      var left = Math.floor(b[0] + 1e-6) - o.padding, top = Math.floor(b[1] + 1e-6) - o.padding;
      var w = Math.ceil(b[2] - 1e-6) + o.padding - left, h = Math.ceil(b[3] - 1e-6) + o.padding - top;
      if (o.even) {
        w += w % 2;
        h += h % 2;
      }
      w = U.clamp(w, 1, 30000);
      h = U.clamp(h, 1, 30000);

      var name = U.uniqueName(layers[0].name + " Crop", itemNamed);
      var indices = U.map(layers, function (l) { return l.index; });
      var pc = comp.layers.precompose(indices, name, true);
      // anchor 0 (top left) keeps the layers where they are. The CompItem.width / height setters
      // re-centre the layers in EffectCraft 0.14 (fixed later, #1942), so set the size this way.
      app.run("comp.settings", { comp: pc.id, width: w, height: h, anchor: 0 });
      w = pc.width;
      h = pc.height;
      var exprs = [];
      for (i = 1; i <= pc.numLayers; i++) {
        var inner = pc.layer(i);
        if (!inner.parent && shiftLayer(inner, [-left, -top])) exprs.push(inner.name);
      }
      var pl = null;
      for (i = 1; i <= comp.numLayers && !pl; i++) {
        var c = comp.layer(i);
        if (c instanceof AVLayer && c.source && c.source.id === pc.id) pl = c;
      }
      pl.transform.anchorPoint.setValue([w / 2, h / 2]);
      pl.transform.position.setValue([left + w / 2, top + h / 2]);
      ctx.created.push(pl);
      ctx.created.push(pc);

      if (exprs.length) ctx.warn("Position expressions on " + exprs.join(", ") + " were kept; if they set an absolute position, those layers moved by " + (-left) + ", " + (-top) + " px.");
      if (threeD) ctx.warn("3D layers now render with the new comp's own default camera, so their perspective can differ.");
      return ctx.done("Cropped " + layers.length + (layers.length === 1 ? " layer" : " layers") + " into \"" + pc.name + "\" (" + w + " x " + h + " px at " + left + ", " + top + ").");
    }
  });
})();
