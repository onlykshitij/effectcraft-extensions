// SPDX-License-Identifier: MIT OR Apache-2.0
// Merge Shapes: two or more shape layers into one new shape layer, "Merged Shapes", at the comp
// origin with an identity transform, above the top-most source. Each source becomes a group
// named after it (top-most first, so the stacking is kept), holding its contents. The group's
// transform is the source's layer-to-comp matrix at the current time (parents included), split
// into rotation, skew and scale: a 2 x 2 matrix A is R(rotation) * U with U upper triangular
// (QR), and U = Skew * Scale, which is what a shape group applies. Layer opacity becomes group
// opacity. Animated transforms, parents and 3D are flattened to the current time, with a warning.
// EffectCraft draws a stroke inside a group with one width (scaled by the group's mean scale),
// while a layer's non-uniform scale or skew stretches its strokes, so such layers are warned
// about.
//
// The contents are copied with EffectCraft's Edit ▸ Copy / Paste of shape items (the only way
// shape items reach another layer; PropertyGroup.duplicate() stays in its layer): the source's
// top-level items are selected and copied, then pasted above a placeholder selected inside the
// new group. This replaces the clipboard and leaves the merged layer selected.

(function () {
  var NAME = "Merge Shapes", SH = MK.shapes, U = MK.util;

  // The 2D affine layer -> comp matrix at t, fitted through three points (3D layers too).
  function compMatrix(layer, t) {
    var p = MK.space.toCompPoints(layer, [[0, 0, 0], [100, 0, 0], [0, 100, 0]], t);
    return [(p[1][0] - p[0][0]) / 100, (p[2][0] - p[0][0]) / 100, p[0][0], (p[1][1] - p[0][1]) / 100, (p[2][1] - p[0][1]) / 100, p[0][1]];
  }

  // Group transform values that make MK.mat.transform([0, 0], position, scale, rotation, skew, 0)
  // equal the matrix m.
  function decompose(m) {
    var rot = Math.atan2(m[3], m[0]), c = Math.cos(rot), s = Math.sin(rot);
    var sx = Math.sqrt(m[0] * m[0] + m[3] * m[3]), u01 = c * m[1] + s * m[4], sy = c * m[4] - s * m[1];
    return { position: [m[2], m[5]], scale: [sx * 100, sy * 100], rotation: rot * 180 / Math.PI, skew: sy ? -Math.atan(u01 / sy) * 180 / Math.PI : 0 };
  }

  function hasStroke(layer) {
    var found = false;
    SH.walk(SH.contents(layer), function (it) { if (/^ADBE Vector Graphic - G?-?Stroke$/.test(it.matchName)) found = true; });
    return found;
  }

  function animated(layer) {
    var tr = layer.property("ADBE Transform Group");
    for (var i = 1; i <= tr.numProperties; i++) if (tr.property(i).isTimeVarying) return true;
    return false;
  }

  // Pastes copies of src's top-level contents into `group` (on the layer `dest`).
  function copyContents(src, dest, group) {
    var from = SH.contents(src);
    if (!from.numProperties) return;
    var spot = SH.inner(group).addProperty("ADBE Vector Shape - Rect");
    spot.name = "Motion Kit placeholder";
    // Selecting a layer with layer.select clears the property and keyframe selection, so Copy
    // takes exactly these shape items.
    app.run("layer.select", { layers: [src.id] });
    for (var i = 1; i <= from.numProperties; i++) from.property(i).selected = true;
    app.run("edit.copy", {});
    app.run("layer.select", { layers: [dest.id] });
    spot.selected = true;
    app.run("edit.paste", {});
    spot.remove();
  }

  MK.registerTool({
    id: "mergeShapes",
    name: NAME,
    category: "Shapes",
    description: "Merges the selected shape layers into one shape layer, one group per layer, without moving anything.",
    // Two shapes with arrows into one box (the box).
    icon: [
      "O6 5 3",
      "R15 2 6 6",
      "M6.5 9.5 L9.8 13.6",
      "M17.5 9.5 L14.2 13.6",
      { d: "U5 14.5 14 7.5 1.5", fill: "accent" }
    ],
    options: [
      { key: "sources", label: "Source layers", type: "dropdown", "default": "hide", items: [["hide", "Hide them"], ["delete", "Delete them"]] }
    ],
    run: function (ctx, o) {
      var src = MK.sel.byIndex(U.filter(ctx.layers, function (l) { return !!SH.contents(l); }));
      if (src.length < 2) ctx.fail("select two or more shape layers.");
      var t = ctx.time, i;
      var merged = ctx.comp.layers.addShape();
      merged.name = "Merged Shapes";
      merged.moveBefore(src[0]);
      merged.transform.anchorPoint.setValue([0, 0]);
      merged.transform.position.setValue([0, 0]);
      ctx.created.push(merged);
      var root = SH.contents(merged), flat = [], lost = [], uneven = [];
      for (i = 0; i < src.length; i++) {
        var L = src[i];
        var g = root.addProperty(SH.GROUP);
        g.name = L.name;
        copyContents(L, merged, g);
        var d = decompose(compMatrix(L, t)), tr = SH.groupTransform(g);
        if (Math.abs(d.skew) > 85) ctx.warn(L.name + ": its parents shear it more than a shape group can (skew limited to 85°).");
        tr.property("ADBE Vector Position").setValue(d.position);
        tr.property("ADBE Vector Scale").setValue(d.scale);
        tr.property("ADBE Vector Rotation").setValue(d.rotation);
        tr.property("ADBE Vector Skew").setValue(U.clamp(d.skew, -85, 85));
        tr.property("ADBE Vector Group Opacity").setValue(L.transform.opacity.valueAtTime(t, false));
        if (L.parent || L.threeDLayer || animated(L)) flat.push(L.name);
        if ((Math.abs(Math.abs(d.scale[0]) - Math.abs(d.scale[1])) > 0.01 || Math.abs(d.skew) > 0.01) && hasStroke(L)) uneven.push(L.name);
        if (L.property("ADBE Effect Parade").numProperties || L.property("ADBE Mask Parade").numProperties || L.blendingMode !== BlendingMode.NORMAL) lost.push(L.name);
      }
      for (i = 0; i < src.length; i++) {
        if (o.sources === "delete") src[i].remove();
        else src[i].enabled = false;
      }
      app.run("layer.select", { layers: [merged.id] });
      if (flat.length) ctx.warn("Merged groups keep only static transforms, flattened at the current time: " + flat.join(", ") + " (parent, animation or 3D).");
      if (uneven.length) ctx.warn("Strokes in shape groups keep an even width, so strokes under non-uniform scale or skew look different: " + uneven.join(", ") + ".");
      if (lost.length) ctx.warn("Masks, effects and blending modes aren't carried over: " + lost.join(", ") + ".");
      return ctx.done("Merged " + src.length + " layers into \"Merged Shapes\".");
    }
  });
})();
