// SPDX-License-Identifier: MIT OR Apache-2.0
// Unprecomp: brings a precomp layer's layers back into the parent comp, directly above it.
// A null "<Precomp> Transform" takes the precomp layer's transform (keys and expressions too),
// parent, timing and 3D switch, and the copied layers without a parent inside are parented to it
// without compensation: their values are in the precomp's space, which is the null's layer space
// once the null has the same anchor, position, scale and rotation. Layer times shift by the
// precomp layer's start time and are trimmed to its in and out points.
// All the layers are copied with one Copy and Paste (EffectCraft's edit.copy / edit.paste through
// app.run), which keeps parenting and track mattes between them; Layer.copyToComp copies one
// layer at a time and drops both.

(function () {
  var NAME = "Unprecomp", U = MK.util;
  var SKIP = { "ADBE Opacity": 1 };

  function layerIds(comp) {
    var out = [];
    for (var i = 1; i <= comp.numLayers; i++) out.push(comp.layer(i).id);
    return out;
  }

  function copyProp(from, to) {
    if (!to) return;
    if (from.numKeys) for (var k = 1; k <= from.numKeys; k++) MK.keys.write(to, MK.keys.read(from, k));
    else to.setValue(from.value);
    if (from.expression) to.expression = from.expression;
  }

  // Anchor, position, scale, orientation and rotations of `from` onto `to` (same start time).
  function copyTransform(from, to) {
    var a = from.transform, b = to.transform;
    if (a.position.dimensionsSeparated) b.position.dimensionsSeparated = true;
    for (var i = 1; i <= a.numProperties; i++) {
      var p = a.property(i);
      if (SKIP[p.matchName] || !(p instanceof Property)) continue;
      if (p.matchName === "ADBE Position" && p.dimensionsSeparated) continue;
      copyProp(p, b.property(p.matchName));
    }
    if (a.position.dimensionsSeparated) {
      var n = from.threeDLayer ? 3 : 2;
      for (var d = 0; d < n; d++) copyProp(a.property("ADBE Position_" + d), b.property("ADBE Position_" + d));
    }
  }

  // What the copied layers can't show: the precomp layer's own opacity, effects and so on.
  function lost(pl) {
    var out = [], op = pl.transform.opacity;
    if (op.numKeys || op.expression || Math.abs(op.value - 100) > 1e-6) out.push("opacity");
    if (pl.property("ADBE Effect Parade").numProperties) out.push("effects");
    if (pl.property("ADBE Mask Parade").numProperties) out.push("masks");
    if (pl.blendingMode !== BlendingMode.NORMAL) out.push("blending mode");
    if (pl.hasTrackMatte) out.push("track matte");
    if (pl.timeRemapEnabled) out.push("time remapping");
    if (Math.abs(pl.stretch - 100) > 1e-6) out.push("time stretch");
    return out;
  }

  function unprecomp(ctx, comp, pl, o) {
    var src = pl.source, i;
    var copied = [];
    if (src.numLayers) {
      selectOnly(comp, pl);
      var before = {}, ids = layerIds(comp);
      for (i = 0; i < ids.length; i++) before[ids[i]] = true;
      app.run("edit.copy", { comp: src.id, layers: layerIds(src) });
      comp.openInViewer();
      app.run("edit.paste", { comp: comp.id });
      for (i = 1; i <= comp.numLayers; i++) if (!before[comp.layer(i).id]) copied.push(comp.layer(i));
      if (copied.length !== src.numLayers) MK.fail("pasting " + src.name + "'s layers gave " + copied.length + " of " + src.numLayers + " layers.");
      // Directly above the precomp layer, in their order.
      for (i = 0; i < copied.length; i++) copied[i].moveBefore(pl);
    }

    var nul = comp.layers.addNull();
    nul.name = U.uniqueName(src.name + " Transform", function (n) { return !!comp.layer(n); });
    nul.moveBefore(copied.length ? copied[0] : pl);
    if (pl.threeDLayer) nul.threeDLayer = true;
    nul.startTime = pl.startTime;
    nul.inPoint = pl.inPoint;
    nul.outPoint = pl.outPoint;
    if (pl.parent) nul.setParentWithJump(pl.parent);
    copyTransform(pl, nul);

    for (i = 0; i < copied.length; i++) {
      var L = copied[i];
      L.startTime = L.startTime + pl.startTime;
      // The precomp only showed them between its in and out points.
      var a = Math.max(L.inPoint, pl.inPoint), b = Math.min(L.outPoint, pl.outPoint);
      if (b - a > 1e-9) {
        L.inPoint = a;
        L.outPoint = b;
      } else L.enabled = false;
      // Under a 3D null, a 2D layer would ignore the 3D transform: make them all 3D.
      if (pl.threeDLayer && L instanceof AVLayer && !L.threeDLayer) L.threeDLayer = true;
      if (!L.parent) L.setParentWithJump(nul);
    }

    var miss = lost(pl), plName = pl.name;
    if (o.original === "delete") {
      // Layers parented to the precomp layer follow the null instead: same layer space, no jump.
      for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).parent && comp.layer(i).parent.id === pl.id) comp.layer(i).setParentWithJump(nul);
      pl.remove();
    } else pl.enabled = false;
    ctx.created.push(nul);
    for (i = 0; i < copied.length; i++) ctx.created.push(copied[i]);
    if (miss.length) ctx.warn("Not carried over from \"" + plName + "\": " + miss.join(", ") + ".");
    return copied.length;
  }

  // Exactly this layer selected, so Paste lands above it.
  function selectOnly(comp, layer) {
    var sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) sel[i].selected = false;
    layer.selected = true;
  }

  MK.registerTool({
    id: "unprecomp",
    name: NAME,
    category: "Comp",
    description: "Brings the layers of the selected precomp layers back into this comp, under a null that carries the precomp layer's transform.",
    // An open box with layers lifting out (the layers).
    icon: [
      "M4 12 V20 H20 V12",
      { d: "M6.5 9 L12 6.5 L17.5 9 L12 11.5 Z", fill: "accent" },
      { d: "M6.5 5 L12 2.5 L17.5 5", stroke: "accent", w: 1.6 },
      { d: "M12 13.5 V18 M10 15.5 L12 13.5 L14 15.5", w: 1.4 }
    ],
    options: [
      { key: "original", label: "Original precomp layer", type: "dropdown", "default": "disable", items: [["disable", "Turn it off"], ["delete", "Delete it"]] }
    ],
    run: function (ctx, o) {
      var pls = U.filter(MK.sel.byIndex(ctx.layers), function (l) { return l instanceof AVLayer && l.source instanceof CompItem; });
      if (!pls.length) ctx.fail("select one or more precomp layers.");
      var n = 0, names = [];
      for (var i = 0; i < pls.length; i++) {
        names.push("\"" + pls[i].source.name + "\"");
        n += unprecomp(ctx, ctx.comp, pls[i], o);
      }
      return ctx.done("Unprecomposed " + names.join(", ") + ": " + n + (n === 1 ? " layer" : " layers") + " brought into this comp.");
    }
  });
})();
