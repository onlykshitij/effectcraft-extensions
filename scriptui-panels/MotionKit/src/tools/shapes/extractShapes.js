// SPDX-License-Identifier: MIT OR Apache-2.0
// Extract Shapes: each top-level group of a shape layer goes to its own shape layer, named after
// the group, directly above the original and in the group order (the first group on top, as it
// draws). With groups selected only those are extracted (a nested group counts as its top-level
// group); a selected shape layer with none of its groups selected gives all of them.
// When every group of a layer is extracted, the original is hidden (or deleted). When only some
// are, the original stays visible and the extracted groups are switched off in it (or deleted
// from it); the new layers sit above it, so a group that drew above an extracted one now draws
// below it, and the result says so.
//
// How the contents move: EffectCraft's PropertyGroup.duplicate() and moveTo() work only inside
// one layer, and shape items reach another layer only through the clipboard (Edit ▸ Copy /
// Paste), which doesn't bring the layer's transform, parent, timing, blending mode, 3D, masks
// and effects with their keyframes and expressions. Layer.duplicate() copies all of that
// exactly, so each new layer is a duplicate of the original with the other top-level groups
// deleted. Top-level items that aren't groups (a fill, stroke or modifier for every group) stay
// in each copy.

(function () {
  var NAME = "Extract Shapes", SH = MK.shapes, U = MK.util;

  // Indices of the top-level groups in a shape layer's contents.
  function topGroups(layer) {
    var root = SH.contents(layer), out = [];
    for (var i = 1; i <= root.numProperties; i++) if (SH.isGroup(root.property(i))) out.push(i);
    return out;
  }

  // [{layer, indices, all}]: what to extract, layers in selection order.
  function plan(ctx) {
    var byId = {}, list = [], i;
    function entry(layer) {
      if (!U.has(byId, layer.id)) list.push(byId[layer.id] = { layer: layer, picked: [] });
      return byId[layer.id];
    }
    for (i = 0; i < ctx.groups.length; i++) {
      var g = ctx.groups[i];
      if (!SH.isGroup(g)) continue;
      var top = SH.groupsOf(g)[0] || g, e = entry(MK.sel.layerOf(top));
      if (U.indexOf(e.picked, top.propertyIndex) < 0) e.picked.push(top.propertyIndex);
    }
    for (i = 0; i < ctx.layers.length; i++) if (SH.contents(ctx.layers[i])) entry(ctx.layers[i]);
    var out = [];
    for (i = 0; i < list.length; i++) {
      var tops = topGroups(list[i].layer), idx = list[i].picked.length ? list[i].picked : tops;
      if (!idx.length) continue;
      idx = idx.slice();
      idx.sort(function (a, b) { return a - b; });
      out.push({ layer: list[i].layer, indices: idx, all: idx.length === tops.length });
    }
    return out;
  }

  MK.registerTool({
    id: "extractShapes",
    name: NAME,
    category: "Shapes",
    description: "Moves each top-level shape group to its own shape layer, keeping the layer's transform, parent and timing.",
    // A layer box with a shape popping out of it along an arrow (the shape).
    icon: [
      "R2.5 11.5 10 10",
      "M7.5 16.5 L13.8 10.2",
      "M10.4 10.2 L13.8 10.2 L13.8 13.6",
      { d: "O18 6 4", fill: "accent" }
    ],
    options: [
      { key: "original", label: "Original layer", type: "dropdown", "default": "hide", items: [["hide", "Keep it, hidden"], ["delete", "Delete it"]], help: "When only some groups are extracted, the original stays and those groups are switched off in it (or deleted from it)." }
    ],
    run: function (ctx, o) {
      var jobs = plan(ctx);
      if (!jobs.length) ctx.fail("select shape layers with groups, or top-level groups in a shape layer.");
      var made = 0, order = false, i, k;
      for (i = 0; i < jobs.length; i++) {
        var L = jobs[i].layer, root = SH.contents(L), idx = jobs[i].indices;
        var names = U.map(idx, function (n) { return root.property(n).name; });
        for (k = 0; k < idx.length; k++) {
          var dup = L.duplicate();
          dup.moveBefore(L);
          var droot = SH.contents(dup);
          for (var n = droot.numProperties; n >= 1; n--) if (n !== idx[k] && SH.isGroup(droot.property(n))) droot.property(n).remove();
          dup.name = names[k];
          ctx.created.push(dup);
          made++;
        }
        if (jobs[i].all) {
          if (o.original === "delete") L.remove();
          else L.enabled = false;
          continue;
        }
        // A group left in the original above an extracted one now draws below it.
        var tops = topGroups(L);
        for (k = 0; k < tops.length; k++) if (tops[k] < idx[idx.length - 1] && U.indexOf(idx, tops[k]) < 0) order = true;
        for (k = idx.length - 1; k >= 0; k--) {
          if (o.original === "delete") root.property(idx[k]).remove();
          else root.property(idx[k]).enabled = false;
        }
      }
      if (order) ctx.warn("Groups left in the original layer that were above an extracted group now draw below it.");
      return ctx.done("Extracted " + made + (made === 1 ? " group" : " groups") + " to new layers.");
    }
  });
})();
