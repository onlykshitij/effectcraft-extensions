// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounce: after the last keyframe the value carries on past it in the direction of the last
// change, falls back and hops again like a ball off a floor, each hop lower and shorter.
//
// Sizes are relative to the keyframes, so one setting gives Position, Scale and Rotation the
// same bounce. R is the keyframes' range (the farthest key from the first). The first hop rises
// Amplitude % of R and lasts Hop Time seconds; each later hop keeps Bounciness % of the height
// before it, and its length shrinks with the square root of its height, as a ball's does under
// constant gravity. A hop of height h and length d is 4 h tau (d - tau) / d^2 high at tau
// seconds into it. Hops stop after Max Jumps or once one would be lower than 0.001 R. Jump
// In/Out mirrors this before the first key, against the first change.

(function () {
  var NAME = "Bounce", C = MK.controls;
  var CTRL = {
    amp: C.name(NAME, "Amplitude"), keep: C.name(NAME, "Bounciness"), time: C.name(NAME, "Hop Time"),
    jumps: C.name(NAME, "Max Jumps"), io: C.name(NAME, "Jump In/Out")
  };
  // Controls of earlier versions, whose Amplitude meant the share of speed each hop kept.
  var OLD = [C.name(NAME, "Gravity"), C.name(NAME, "Hop Gravity")];

  var BODY = [
    "var mkH = Math.max(0, " + C.ref(CTRL.amp) + ".value) / 100;",
    "var mkK = Math.max(0, Math.min(95, " + C.ref(CTRL.keep) + ".value)) / 100;",
    "var mkT = Math.max(0.01, " + C.ref(CTRL.time) + ".value);",
    "var mkJ = Math.round(Math.max(1, Math.min(20, " + C.ref(CTRL.jumps) + ".value)));",
    "var mkIO = " + C.ref(CTRL.io, "ADBE Checkbox Control") + ".value != 0;",
    "function mkLen(v) {",
    "  if (!(v instanceof Array)) return Math.abs(v);",
    "  var s = 0;",
    "  for (var i = 0; i < v.length; i++) s += v[i] * v[i];",
    "  return Math.sqrt(s);",
    "}",
    "// Height of the hops, as a share of the range, tau seconds after the key.",
    "function mkHop(tau) {",
    "  var h = mkH, d = mkT;",
    "  for (var k = 0; k < mkJ; k++) {",
    "    if (h < 0.001) return 0;",
    "    if (tau < d) return 4 * h * tau * (d - tau) / (d * d);",
    "    tau -= d;",
    "    h *= mkK;",
    "    d *= Math.sqrt(mkK);",
    "  }",
    "  return 0;",
    "}",
    "var mkOut = value;",
    "if (numKeys > 1) {",
    "  var mkT0 = key(1).time, mkT1 = key(numKeys).time, mkRange = 0;",
    "  for (var mkI = 2; mkI <= numKeys; mkI++) mkRange = Math.max(mkRange, mkLen(sub(key(mkI).value, key(1).value)));",
    "  if (time > mkT1) {",
    "    var mkD = sub(key(numKeys).value, key(numKeys - 1).value), mkS = mkLen(mkD);",
    "    if (mkS > 0) mkOut = add(value, mul(mkD, mkRange * mkHop(time - mkT1) / mkS));",
    "  } else if (mkIO && time < mkT0) {",
    "    var mkD0 = sub(key(2).value, key(1).value), mkS0 = mkLen(mkD0);",
    "    if (mkS0 > 0) mkOut = sub(value, mul(mkD0, mkRange * mkHop(mkT0 - time) / mkS0));",
    "  }",
    "}",
    "mkOut"
  ].join("\n");

  // A layer with an earlier version's controls gets a fresh control set, and its other Bounce
  // expressions this version's body, so an old Amplitude isn't read with the new meaning.
  function upgrade(layer) {
    if (!C.find(layer, OLD[0]) && !C.find(layer, OLD[1])) return;
    var fx = C.fx(layer), prefix = C.name(NAME, "");
    for (var j = fx.numProperties; j >= 1; j--) if (fx.property(j).name.indexOf(prefix) === 0) fx.property(j).remove();
    var ps = MK.expr.ofTool(layer, "bounce");
    for (var i = 0; i < ps.length; i++) MK.expr.set(ps[i], "bounce", BODY);
  }

  MK.registerTool({
    id: "bounce",
    name: NAME,
    category: "Animate",
    removable: true,
    description: "After the last keyframe the value hops past it and settles like a bouncing ball.",
    // Three shrinking hop arcs on a ground line (the ball).
    icon: [
      "M2 20.5 L22 20.5",
      "M3 20.5 Q7 4.5 11 20.5",
      "M11 20.5 Q14 11 17 20.5",
      "M17 20.5 Q19 15.5 21 20.5",
      { d: "O7 9.6 2.6", fill: "accent" }
    ],
    options: [
      { key: "hopHeight", label: "Amplitude", type: "number", "default": 20, min: 0, max: 200, unit: "% of the keyframes' change", help: "How high the first hop goes: 20 % of a change from 100 to 117 % rises 3.4 % past 117" },
      { key: "bounciness", label: "Bounciness", type: "number", "default": 50, min: 0, max: 95, unit: "%", help: "How much of its height each hop keeps: lower settles sooner" },
      { key: "hopTime", label: "Hop Time", type: "number", "default": 0.4, min: 0.02, max: 5, unit: "s", help: "Length of the first hop; later hops get shorter with their height" },
      { key: "maxJumps", label: "Max Jumps", type: "number", "default": 9, min: 1, max: 20, integer: true },
      { key: "jumpInOut", label: "Jump In/Out: also bounce before the first keyframe", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var props = MK.util.filter(MK.sel.keyed(ctx.props, 2), function (p) { return MK.sel.isNumeric(p) && p.canSetExpression; });
      if (!props.length) ctx.fail("select one or more properties with at least two keyframes (numbers, points or colours).");
      var d = MK.expr.decide(ctx, props);
      for (var i = 0; i < d.apply.length; i++) {
        var layer = MK.sel.layerOf(d.apply[i]);
        upgrade(layer);
        C.slider(layer, CTRL.amp, o.hopHeight);
        C.slider(layer, CTRL.keep, o.bounciness);
        C.slider(layer, CTRL.time, o.hopTime);
        C.slider(layer, CTRL.jumps, o.maxJumps);
        C.checkbox(layer, CTRL.io, o.jumpInOut);
        MK.expr.set(d.apply[i], "bounce", BODY);
      }
      return ctx.done(MK.expr.report(NAME, d.apply.length, ctx.props.length - props.length, d.skip.length, "two keyframes and a numeric value"));
    }
  });
})();
