// SPDX-License-Identifier: MIT OR Apache-2.0
// Elastic: after the last keyframe the value overshoots and wobbles back with a damped sine,
//   value + v * Amplitude * sin(2 pi Frequency t) / exp(Decay t)
// where t is the time since the last key and v the velocity arriving there. Jump In/Out mirrors
// it before the first key with the leaving velocity.

(function () {
  var NAME = "Elastic", C = MK.controls;
  var CTRL = {
    amp: C.name(NAME, "Amplitude"), freq: C.name(NAME, "Frequency"),
    decay: C.name(NAME, "Decay"), io: C.name(NAME, "Jump In/Out")
  };

  var BODY = [
    "var mkA = " + C.ref(CTRL.amp) + ".value;",
    "var mkF = " + C.ref(CTRL.freq) + ".value;",
    "var mkD = Math.max(0, " + C.ref(CTRL.decay) + ".value);",
    "var mkIO = " + C.ref(CTRL.io, "ADBE Checkbox Control") + ".value != 0;",
    "function mkWave(t) { return mkA * Math.sin(2 * Math.PI * mkF * t) / Math.exp(mkD * t); }",
    "var mkOut = value;",
    "if (numKeys > 1) {",
    "  var mkT0 = key(1).time, mkT1 = key(numKeys).time;",
    "  if (time > mkT1) mkOut = add(value, mul(velocityAtTime(mkT1 - 0.002), mkWave(time - mkT1)));",
    "  else if (mkIO && time < mkT0) mkOut = sub(value, mul(velocityAtTime(mkT0 + 0.002), mkWave(mkT0 - time)));",
    "}",
    "mkOut"
  ].join("\n");

  MK.registerTool({
    id: "elastic",
    name: NAME,
    category: "Animate",
    description: "After the last keyframe the value overshoots and wobbles back like a spring.",
    // A zigzag spring off a wall (the weight at its end).
    icon: [
      "M3 6 L3 18",
      "M3 12 L5.5 12 L7 8 L9.5 16 L12 8 L14.5 16 L16 12 L17.5 12",
      { d: "U17.5 8.5 4.5 7 1.4", fill: "accent" }
    ],
    options: [
      { key: "amplitude", label: "Amplitude", type: "number", "default": 0.06, min: 0, max: 10, help: "Overshoot per unit of arriving speed" },
      { key: "frequency", label: "Frequency", type: "number", "default": 2.5, min: 0, max: 100, unit: "Hz" },
      { key: "decay", label: "Decay", type: "number", "default": 6, min: 0, max: 100, help: "How fast the wobble dies away" },
      { key: "jumpInOut", label: "Jump In/Out: also wobble before the first keyframe", type: "checkbox", "default": false }
    ],
    run: function (ctx, o) {
      var props = MK.util.filter(MK.sel.keyed(ctx.props, 2), function (p) { return MK.sel.isNumeric(p) && p.canSetExpression; });
      if (!props.length) ctx.fail("select one or more properties with at least two keyframes (numbers, points or colours).");
      var d = MK.expr.decide(ctx, props), resting = 0;
      for (var i = 0; i < d.apply.length; i++) {
        var layer = MK.sel.layerOf(d.apply[i]);
        if (MK.keys.atRest(d.apply[i], d.apply[i].numKeys, true)) resting++;
        C.slider(layer, CTRL.amp, o.amplitude);
        C.slider(layer, CTRL.freq, o.frequency);
        C.slider(layer, CTRL.decay, o.decay);
        C.checkbox(layer, CTRL.io, o.jumpInOut);
        MK.expr.set(d.apply[i], "elastic", BODY);
      }
      return ctx.done(MK.expr.report(NAME, d.apply.length, ctx.props.length - props.length, d.skip.length, "two keyframes and a numeric value", resting));
    }
  });
})();
