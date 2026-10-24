// SPDX-License-Identifier: MIT OR Apache-2.0
// Shapes from Vector: runs EffectCraft's Layer ▸ Create ▸ Create Shapes from Vector Layer on each
// selected vector footage layer (SVG, PDF, Illustrator, EPS). The engine puts the new shape layer
// directly above the source with the source's transform, parent and timing; the source is then
// hidden or deleted. Other layers are skipped and listed.
//
// The command is reached with app.run("layer.create", {op: "shapesFromVector"}), which works
// headless. app.findMenuCommandId("Create Shapes from Vector Layer") finds nothing (the menu
// item is the "Create" command with an op), and app.executeCommand runs a command without
// parameters, so it can't pass the op.

(function () {
  var NAME = "Shapes from Vector", U = MK.util;

  function layerById(comp, id) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i);
    return null;
  }

  MK.registerTool({
    id: "shapesFromVector",
    name: NAME,
    category: "Shapes",
    description: "Turns the selected SVG, PDF or Illustrator layers into editable shape layers.",
    // A pen nib and a star outline (the star).
    icon: [
      "M3.5 20.5 L5.5 13.5 L8.8 11.2 L12.8 15.2 L10.5 18.5 Z",
      "M3.5 20.5 L7.6 16.4",
      { d: "S16.5 8 6 2.6 5 0", stroke: "accent", w: 1.6 }
    ],
    options: [
      { key: "source", label: "Source layer", type: "dropdown", "default": "hide", items: [["hide", "Hide it"], ["delete", "Delete it"]] }
    ],
    run: function (ctx, o) {
      var layers = MK.sel.byIndex(ctx.layers);
      if (!layers.length) ctx.fail("select one or more vector footage layers (SVG, PDF or Illustrator).");
      var skipped = [], made = 0;
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i], r = null;
        // The engine decides what is vector footage and changes nothing for other layers. (Not
        // `L.source instanceof FootageItem`: after an Undo EffectCraft can hand back a stale
        // layer object whose source reads null, see 37_shapes.js.)
        try {
          r = app.run("layer.create", { op: "shapesFromVector", layers: [L.id] });
        } catch (e) {
          skipped.push(L.name + (/not a vector/.test(U.errText(e)) ? "" : " (" + U.errText(e) + ")"));
          continue;
        }
        for (var k = 0; k < r.layers.length; k++) {
          var n = layerById(ctx.comp, r.layers[k]);
          if (n) ctx.created.push(n);
        }
        for (k = 0; k < (r.skipped || []).length; k++) ctx.warn(r.skipped[k]);
        made++;
        if (o.source === "delete") L.remove();
        else L.enabled = false;
      }
      if (!made) ctx.fail("none of the selected layers is vector footage (SVG, PDF or Illustrator): " + skipped.join(", ") + ".");
      return ctx.done("Converted " + made + (made === 1 ? " layer" : " layers") + " to shapes." + (skipped.length ? " Skipped (not vector footage): " + skipped.join(", ") + "." : ""));
    }
  });
})();
