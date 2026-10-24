// SPDX-License-Identifier: MIT OR Apache-2.0
// Clone Keys to Playhead: copies the selected keyframes of every selected property to the
// current time with everything they carry (value, temporal and spatial ease, interpolation,
// roving, spatial tangents). One offset for all properties, from the earliest selected key
// overall, so relative timing is kept across properties. Keys already at a target time are
// replaced. The originals stay selected; the clones aren't.

(function () {
  var NAME = "Clone Keys to Playhead";

  MK.registerTool({
    id: "cloneKeys",
    name: NAME,
    category: "Animate",
    description: "Copies the selected keyframes to the playhead, keeping their timing across properties.",
    // Two keyframe diamonds and a vertical playhead (the playhead).
    icon: [
      "P5.5 13 3.6 4 0",
      "P12 13 3.6 4 0",
      { d: "M18.5 6 V22", stroke: "accent", w: 1.8 },
      { d: "M15.5 2.5 H21.5 L18.5 6.5 Z", fill: "accent" }
    ],
    run: function (ctx) {
      var props = MK.anim.withSelectedKeys(ctx.props);
      if (!props.length) ctx.fail("select the keyframes to clone.");
      // Read everything first: clones may land on the selected keys themselves.
      var sets = [], t0 = Infinity, n = 0;
      for (var i = 0; i < props.length; i++) {
        sets.push(MK.keys.readSelected(props[i]));
        t0 = Math.min(t0, sets[i][0].time);
      }
      var offset = ctx.time - t0;
      if (Math.abs(offset) < 1e-6) return ctx.done(NAME + ": the earliest selected keyframe is already at the playhead, so there is nothing to clone.");
      for (var j = 0; j < props.length; j++) {
        for (var k = 0; k < sets[j].length; k++) sets[j][k].selected = false;
        n += MK.anim.writeAll(props[j], sets[j], function (key) { return key.time + offset; });
      }
      return ctx.done(NAME + ": cloned " + n + (n === 1 ? " keyframe" : " keyframes") + " on " + props.length + (props.length === 1 ? " property" : " properties") +
        " to " + (Math.round(ctx.time * 1000) / 1000) + " s.");
    }
  });
})();
