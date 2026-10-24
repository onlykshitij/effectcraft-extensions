// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounce: after the last keyframe the value carries on past it in the direction of travel,
// falls back and hops again like a ball off a floor, each hop lower and shorter.
//
// Maths (per property, any number of dimensions): v is the velocity arriving at the last key,
// s = |v| its speed and d = v / s the direction. Hop k leaves the final value at speed
// s * A^k (A = Amplitude, the energy kept per bounce), lasts 2 s_k / g (g = Gravity) and is
// s_k tau - g tau^2 / 2 high at tau seconds into it. Hops stop after Max Jumps or once a hop
// would be lower than 0.001 of the keyframes' value range. Jump In/Out mirrors this before the
// first key with the leaving velocity.

(function () {
  var NAME = "Bounce", C = MK.controls;
  var CTRL = {
    amp: C.name(NAME, "Amplitude"), grav: C.name(NAME, "Gravity"),
    jumps: C.name(NAME, "Max Jumps"), io: C.name(NAME, "Jump In/Out")
  };

  var BODY = [
    "var mkA = Math.max(0, Math.min(1, " + C.ref(CTRL.amp) + ".value));",
    "var mkG = Math.max(0.001, " + C.ref(CTRL.grav) + ".value);",
    "var mkJ = Math.round(Math.max(1, Math.min(20, " + C.ref(CTRL.jumps) + ".value)));",
    "var mkIO = " + C.ref(CTRL.io, "ADBE Checkbox Control") + ".value != 0;",
    "function mkLen(v) {",
    "  if (!(v instanceof Array)) return Math.abs(v);",
    "  var s = 0;",
    "  for (var i = 0; i < v.length; i++) s += v[i] * v[i];",
    "  return Math.sqrt(s);",
    "}",
    "// Height of the hops tau seconds after the key, for arrival speed sp.",
    "function mkHop(sp, tau, minH) {",
    "  var s = sp * mkA;",
    "  for (var k = 0; k < mkJ; k++) {",
    "    if (!(s > 0) || s * s / (2 * mkG) < minH) return 0;",
    "    var d = 2 * s / mkG;",
    "    if (tau < d) return s * tau - 0.5 * mkG * tau * tau;",
    "    tau -= d;",
    "    s *= mkA;",
    "  }",
    "  return 0;",
    "}",
    "var mkOut = value;",
    "if (numKeys > 1) {",
    "  var mkT0 = key(1).time, mkT1 = key(numKeys).time, mkRange = 0;",
    "  for (var mkI = 2; mkI <= numKeys; mkI++) mkRange = Math.max(mkRange, mkLen(sub(key(mkI).value, key(1).value)));",
    "  if (time > mkT1) {",
    "    var mkV = velocityAtTime(mkT1 - 0.002), mkS = mkLen(mkV);",
    "    if (mkS > 0) mkOut = add(value, mul(mkV, mkHop(mkS, time - mkT1, 0.001 * mkRange) / mkS));",
    "  } else if (mkIO && time < mkT0) {",
    "    var mkV0 = velocityAtTime(mkT0 + 0.002), mkS0 = mkLen(mkV0);",
    "    if (mkS0 > 0) mkOut = sub(value, mul(mkV0, mkHop(mkS0, mkT0 - time, 0.001 * mkRange) / mkS0));",
    "  }",
    "}",
    "mkOut"
  ].join("\n");

  MK.registerTool({
    id: "bounce",
    name: NAME,
    category: "Animate",
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
      { key: "amplitude", label: "Amplitude", type: "number", "default": 0.7, min: 0, max: 1, help: "Energy kept per bounce" },
      { key: "gravity", label: "Gravity", type: "number", "default": 5000, min: 1, max: 1000000, unit: "units/s²", help: "Higher gravity: shorter, quicker hops" },
      { key: "maxJumps", label: "Max Jumps", type: "number", "default": 9, min: 1, max: 20, integer: true },
      { key: "jumpInOut", label: "Jump In/Out: also bounce before the first keyframe", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var props = MK.util.filter(MK.sel.keyed(ctx.props, 2), function (p) { return MK.sel.isNumeric(p) && p.canSetExpression; });
      if (!props.length) ctx.fail("select one or more properties with at least two keyframes (numbers, points or colours).");
      var d = MK.expr.decide(ctx, props);
      for (var i = 0; i < d.apply.length; i++) {
        var layer = MK.sel.layerOf(d.apply[i]);
        C.slider(layer, CTRL.amp, o.amplitude);
        C.slider(layer, CTRL.grav, o.gravity);
        C.slider(layer, CTRL.jumps, o.maxJumps);
        C.checkbox(layer, CTRL.io, o.jumpInOut);
        MK.expr.set(d.apply[i], "bounce", BODY);
      }
      return ctx.done(MK.expr.report(NAME, d.apply.length, ctx.props.length - props.length, d.skip.length, "two keyframes and a numeric value"));
    }
  });
})();
