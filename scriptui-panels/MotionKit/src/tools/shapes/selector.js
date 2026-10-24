// SPDX-License-Identifier: MIT OR Apache-2.0
// Selector: selects every property of the chosen types in the selected layers (shape items at
// any group depth, masks, layer transform properties) and nothing else. "Paths" are the Path
// properties of path items. The types are toggle chips in the options (Shift-click).

(function () {
  var NAME = "Selector", SH = MK.shapes, U = MK.util;

  var TYPES = [
    ["paths", "Paths"], ["fills", "Fills"], ["strokes", "Strokes"], ["gradientFills", "Gradient Fills"],
    ["gradientStrokes", "Gradient Strokes"], ["groups", "Groups"], ["groupTransforms", "Group Transforms"],
    ["trimPaths", "Trim Paths"], ["repeaters", "Repeaters"], ["masks", "Masks"], ["position", "Position"],
    ["scale", "Scale"], ["rotation", "Rotation"], ["opacity", "Opacity"], ["anchorPoint", "Anchor Point"]
  ];
  var ITEMS = {
    fills: "ADBE Vector Graphic - Fill", strokes: "ADBE Vector Graphic - Stroke", gradientFills: "ADBE Vector Graphic - G-Fill",
    gradientStrokes: "ADBE Vector Graphic - G-Stroke", groups: SH.GROUP, trimPaths: "ADBE Vector Filter - Trim",
    repeaters: "ADBE Vector Filter - Repeater"
  };
  var TRANSFORM = { position: "ADBE Position", scale: "ADBE Scale", rotation: "ADBE Rotate Z", opacity: "ADBE Opacity", anchorPoint: "ADBE Anchor Point" };

  // The properties of the enabled types (`on` is {type: true}) in one layer.
  function collect(layer, on) {
    var out = [], k, i;
    SH.walk(SH.contents(layer), function (it) {
      for (k in ITEMS) if (on[k] && ITEMS[k] === it.matchName) out.push(it);
      if (on.paths && it.matchName === SH.PATH_ITEM) out.push(it.property(SH.PATH));
      if (on.groupTransforms && SH.isGroup(it)) out.push(SH.groupTransform(it));
    });
    var masks = on.masks && layer.property("ADBE Mask Parade");
    if (masks) for (i = 1; i <= masks.numProperties; i++) out.push(masks.property(i));
    var tr = layer.property("ADBE Transform Group");
    for (k in TRANSFORM) if (on[k] && tr && tr.property(TRANSFORM[k])) out.push(tr.property(TRANSFORM[k]));
    return out;
  }

  function label(key) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === key) return TYPES[i][1];
    return key;
  }

  MK.registerTool({
    id: "selector",
    name: NAME,
    category: "Shapes",
    description: "Selects every property of the chosen types (paths, fills, strokes...) in the selected layers.",
    // A cursor arrow over a dashed selection rectangle (the arrow).
    icon: [
      { d: "M3 6 V3 H6 M9.5 3 H12.5 M16 3 H19 V6 M19 9.5 V11 M3 9.5 V12 M3 15 V17 H6 M9 17 H10.5", w: 1.4 },
      { d: "M11.5 8.5 L11.5 21 L14.4 18.2 L16.6 22.6 L18.8 21.6 L16.6 17.3 L20.6 17.3 Z", fill: "accent" }
    ],
    options: [
      {
        key: "types", label: "Select", type: "custom", "default": ["paths"],
        help: "The property types a click selects.",
        validate: function (v) {
          if (!U.isArray(v)) throw new Error("Select must be a list of property types.");
          var out = [];
          for (var i = 0; i < TYPES.length; i++) if (U.indexOf(v, TYPES[i][0]) >= 0) out.push(TYPES[i][0]);
          if (!out.length) throw new Error("Turn on at least one property type to select.");
          return out;
        },
        // Toggle chips: one checkbox per type, five to a row.
        build: function (group, value, api) {
          var boxes = [], row = null;
          for (var i = 0; i < TYPES.length; i++) {
            if (i % 5 === 0) row = api.widgets.row(group);
            boxes.push(row.add("checkbox", undefined, TYPES[i][1]));
          }
          function set(v) { for (var j = 0; j < TYPES.length; j++) boxes[j].value = U.indexOf(v || [], TYPES[j][0]) >= 0; }
          set(value);
          return {
            get: function () { return U.filter(U.map(TYPES, function (t) { return t[0]; }), function (k, j) { return boxes[j].value; }); },
            set: set
          };
        }
      }
    ],
    run: function (ctx, o) {
      if (!ctx.layers.length) ctx.fail("select one or more layers.");
      var on = {}, found = [], i;
      for (i = 0; i < o.types.length; i++) on[o.types[i]] = true;
      for (i = 0; i < ctx.layers.length; i++) found = found.concat(collect(ctx.layers[i], on));
      if (!found.length) ctx.fail("the selected layers have no " + U.map(o.types, label).join(", ") + ".");
      // layer.select keeps the layers and clears the property and keyframe selection.
      app.run("layer.select", { layers: U.map(ctx.layers, function (l) { return l.id; }) });
      for (i = 0; i < found.length; i++) found[i].selected = true;
      return ctx.done("Selected " + found.length + (found.length === 1 ? " property" : " properties") + " in " + ctx.layers.length + (ctx.layers.length === 1 ? " layer." : " layers."));
    }
  });
})();
