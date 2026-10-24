// SPDX-License-Identifier: MIT OR Apache-2.0
// Loop In/Out: a loopOut / loopIn expression on the selected keyframed properties. "Both" uses
// loopIn before the first key and loopOut after the last. Motion Kit expressions are replaced;
// other expressions only when the user agrees.

(function () {
  var NAME = "Loop In/Out";

  function body(o) {
    var type = MK.expr.str(o.type), n = o.type === "continue" ? "" : ", " + o.keyframes;
    var outE = "loopOut(" + type + n + ")", inE = "loopIn(" + type + n + ")";
    if (o.side === "out") return outE;
    if (o.side === "in") return inE;
    return [
      "var mkOut = value;",
      "if (numKeys > 1 && time < key(1).time) mkOut = " + inE + ";",
      "else if (numKeys > 1 && time > key(numKeys).time) mkOut = " + outE + ";",
      "mkOut"
    ].join("\n");
  }

  // A circular arrow (the arrowhead): an arc from -60 to 210 degrees and a head along its end.
  var a = 210 * Math.PI / 180, ex = 12 + 7 * Math.cos(a), ey = 12 + 7 * Math.sin(a);
  var tx = -Math.sin(a), ty = Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
  function f(v) { return Math.round(v * 100) / 100; }
  var HEAD = "M" + f(ex + 3.4 * tx) + " " + f(ey + 3.4 * ty) + " L" + f(ex + 2.8 * nx) + " " + f(ey + 2.8 * ny) +
    " L" + f(ex - 2.8 * nx) + " " + f(ey - 2.8 * ny) + " Z";

  MK.registerTool({
    id: "loop",
    name: NAME,
    category: "Animate",
    removable: true,
    description: "Repeats the keyframes before the first key, after the last, or both.",
    icon: [{ d: "A12 12 7 -60 210", w: 1.8 }, { d: HEAD, fill: "accent" }],
    options: [
      { key: "type", label: "Type", type: "dropdown", "default": "cycle", items: [["cycle", "Cycle"], ["pingpong", "Ping-pong"], ["offset", "Offset"], ["continue", "Continue"]] },
      { key: "side", label: "Side", type: "dropdown", "default": "out", items: [["out", "Out: after the last key"], ["in", "In: before the first key"], ["both", "Both"]] },
      { key: "keyframes", label: "Keyframes", type: "number", "default": 0, min: 0, max: 9999, integer: true, help: "How many keyframes the loop uses; 0 uses all. Continue ignores it." }
    ],
    run: function (ctx, o) {
      var numericOnly = o.type === "offset" || o.type === "continue";
      var props = MK.util.filter(MK.sel.keyed(ctx.props, 2), function (p) { return p.canSetExpression && (!numericOnly || MK.sel.isNumeric(p)); });
      if (!props.length) ctx.fail("select one or more properties with at least two keyframes" + (numericOnly ? " and a numeric value (for " + o.type + ")." : "."));
      var r = MK.expr.applyAll(ctx, props, "loop", body(o));
      return ctx.done(MK.expr.report(NAME, r.applied.length, ctx.props.length - props.length, r.skipped.length, numericOnly ? "two keyframes and a numeric value" : "two keyframes"));
    }
  });
})();
