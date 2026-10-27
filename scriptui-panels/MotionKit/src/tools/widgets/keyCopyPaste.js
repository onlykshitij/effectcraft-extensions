// SPDX-License-Identifier: MIT OR Apache-2.0
// Key Copy/Paste widget (2 x 1): a "N keys copied" label, Copy and Paste.
//   Copy   the selected keyframes of the selected properties (numbers, points and colours):
//          values, eases, interpolation, spatial tangents and roving, with their times relative
//          to the earliest copied key, kept in settings ("keyCopyPaste").
//   Paste  at the playhead onto the selected properties: a copied property's keys go to the
//          selected property with the same match name, the rest pair up in order; one copied
//          property goes to every selected property. The relative timing is kept, across
//          properties too.
//   Shift-click Paste: only the easing (the first copied key's eases and interpolation) onto
//          the selected keyframes, through Ease Copy's paste code, with speeds as multiples of
//          the segment's average speed (Copy stores each ease's `ratio` as Ease Copy does).

(function () {
  var NAME = "Key Copy/Paste", KEY = "keyCopyPaste", U = MK.util, A = MK.anim, K = MK.keys, T = MK.THEME;

  function clip() {
    var c = MK.settings.get(KEY, null);
    return c && typeof c === "object" && U.isArray(c.props) && c.props.length ? c : null;
  }
  function count(c) {
    var n = 0;
    for (var i = 0; c && i < c.props.length; i++) n += c.props[i].keys.length;
    return n;
  }

  // Sets each ease's ratio: its speed over the average speed of segment a..b (null when there is
  // no segment there), as Ease Copy's clipboard (version 2) has it; a dimension that doesn't move
  // takes the first ratio found.
  function addRatios(eases, p, a, b) {
    var avg = a >= 1 && b <= p.numKeys ? A.avgSpeed(p, a, b) : [], first = null, d;
    for (d = 0; d < eases.length; d++) {
      eases[d].ratio = d < avg.length && Math.abs(avg[d]) > 1e-9 ? eases[d].speed / avg[d] : null;
      if (first === null) first = eases[d].ratio;
    }
    for (d = 0; d < eases.length; d++) if (eases[d].ratio === null) eases[d].ratio = first;
  }

  function copy(ctx) {
    var props = A.withSelectedKeys(ctx.props), usable = U.filter(props, MK.sel.isNumeric);
    if (!usable.length) ctx.fail(props.length ? "only keyframes of numbers, points and colours can be copied." : "select the keyframes to copy.");
    var out = [], t0 = Infinity, i, j;
    for (i = 0; i < usable.length; i++) {
      var ks = K.readSelected(usable[i]);
      for (j = 0; j < ks.length; j++) {
        t0 = Math.min(t0, ks[j].time);
        addRatios(ks[j].inEase, usable[i], ks[j].index - 1, ks[j].index);
        addRatios(ks[j].outEase, usable[i], ks[j].index, ks[j].index + 1);
      }
      out.push({ from: MK.sel.label(usable[i]), matchName: usable[i].matchName, valueType: usable[i].propertyValueType, keys: ks });
    }
    for (i = 0; i < out.length; i++) {
      for (j = 0; j < out[i].keys.length; j++) {
        out[i].keys[j].time -= t0;
        out[i].keys[j].selected = false;
      }
    }
    MK.settings.set(KEY, { props: out });
    if (usable.length < props.length) ctx.warn("Skipped " + (props.length - usable.length) + " that aren't numbers, points or colours.");
    var n = count(clip());
    return ctx.done(NAME + ": copied " + n + (n === 1 ? " keyframe" : " keyframes") + " from " + out.length + (out.length === 1 ? " property." : " properties."));
  }

  // The copied property for each target: the same property (matchName) first, then the copied
  // ones left over, in order. One copied property goes to every target.
  function pair(c, targets) {
    var out = [], used = [], i, j;
    if (c.props.length === 1) return U.map(targets, function () { return c.props[0]; });
    function take(t, k) {
      out[t] = c.props[k];
      used[k] = true;
    }
    for (i = 0; i < targets.length; i++) {
      for (j = 0; j < c.props.length && !out[i]; j++) if (!used[j] && c.props[j].matchName && c.props[j].matchName === targets[i].matchName) take(i, j);
    }
    for (i = 0, j = 0; i < targets.length; i++) {
      while (j < c.props.length && used[j]) j++;
      if (!out[i] && j < c.props.length) take(i, j);
    }
    return out;
  }

  function paste(ctx, c) {
    var targets = U.filter(ctx.props, MK.sel.isAnimatable), n = 0, done = 0, i;
    if (!targets.length) ctx.fail("select the properties to paste onto.");
    var srcs = pair(c, targets);
    for (i = 0; i < targets.length; i++) {
      var src = srcs[i];
      if (!src) {
        ctx.warn("Skipped " + MK.sel.label(targets[i]) + ": only " + c.props.length + " properties were copied.");
        continue;
      }
      if (src.valueType !== targets[i].propertyValueType) {
        ctx.warn("Skipped " + MK.sel.label(targets[i]) + ": it holds another kind of value than " + src.from + ".");
        continue;
      }
      n += K.writeAll(targets[i], src.keys, function (k) { return ctx.time + k.time; });
      done++;
    }
    if (!done) ctx.fail("nothing to paste onto: " + ctx.warnings.join(" "));
    return ctx.done(NAME + ": pasted " + n + (n === 1 ? " keyframe" : " keyframes") + " onto " + done + (done === 1 ? " property" : " properties") + " at " + (Math.round(ctx.time * 1000) / 1000) + " s.");
  }

  // Shift-Paste: Ease Copy's paste with the first copied key as its clipboard (version 2: eases
  // with ratios; a clipboard copied before ratios pastes raw speeds), easing and interpolation only.
  function pasteEase(ctx, c) {
    var props = A.withSelectedKeys(ctx.props), k = c.props[0].keys[0];
    if (!props.length) ctx.fail("select the keyframes to paste the easing onto.");
    var ec = { version: 2, value: null, inEase: k.inEase, outEase: k.outEase, inInterp: k.inInterp, outInterp: k.outInterp, expression: "" };
    return MK.tools.easeCopy.api.paste(ctx, ec, { values: false, easing: true, interp: true, expression: false }, props, NAME);
  }

  // Copy: a keyframe on a page with a second page behind it (the keyframe). Paste: a page above
  // a keyframe, with an arrow down onto it (the keyframe).
  var COPY = ["M9 5.5 V3.5 Q9 2 10.5 2 H19 Q20.5 2 20.5 3.5 V14.5 Q20.5 16 19 16 H16.5", "U3.5 6.5 12 15.5 1.8", { d: "P9.5 14.2 3.8 4 0", fill: "accent" }];
  var PASTE = ["U7 2 10 8.5 1.5", "M12 12 V14", "M10 12.4 L12 14.4 L14 12.4", { d: "P12 19 3.8 4 0", fill: "accent" }];

  MK.registerTool({
    id: "keyCopyPaste",
    kind: "widget",
    span: [2, 1],
    name: NAME,
    category: "Animate",
    description: "Copies the selected keyframes, then pastes them at the playhead onto the selected properties.",
    // A keyframe with a page (the keyframe).
    icon: ["U8 3 12 15 1.8", "M4 9 V20 Q4 21.5 5.5 21.5 H13", { d: "P11 13 4 4 0", fill: "accent" }],
    options: [
      { key: "action", label: "Action", type: "dropdown", "default": "copy", items: [["copy", "Copy"], ["paste", "Paste"], ["pasteEase", "Paste the easing only"]] }
    ],
    api: { clipboard: clip, count: count },
    run: function (ctx, o) {
      if (o.action === "copy") return copy(ctx);
      var c = clip();
      if (!c) ctx.fail("copy keyframes first.");
      return o.action === "pasteEase" ? pasteEase(ctx, c) : paste(ctx, c);
    },
    build: function (w) {
      var pad = Math.max(4, Math.round(w.h * 0.11)), gap = 5, labelW = Math.round(w.w * 0.32);
      var b = Math.max(12, Math.min(w.h - 2 * pad, Math.floor((w.w - 2 * pad - labelW - gap) / 2)));
      var x0 = w.w - pad - 2 * b - gap, y0 = Math.round((w.h - b) / 2), r = Math.max(2, w.style.radius - 2);
      var n = count(clip());
      w.paint = function (g) {
        var size = U.clamp(Math.round(w.h * 0.19), 9, 12), y = Math.round(w.h / 2 - size * 1.25);
        MK.ui.gfx.text(g, n + (n === 1 ? " key" : " keys"), pad, y, size, T.label);
        MK.ui.gfx.text(g, "copied", pad, y + Math.round(size * 1.25), size, T.label);
      };
      w.copy = w.part("copy", [x0, y0, b, b], {
        tip: "Copy keys: the selected keyframes of the selected properties, with their values, eases, interpolation, spatial tangents and timing",
        click: function () { w.run({ action: "copy" }); },
        draw: function (g) { MK.ui.gfx.button(g, b, b, r, COPY, w); }
      });
      w.paste = w.part("paste", [x0 + b + gap, y0, b, b], {
        tip: "Paste keys at the playhead onto the selected properties, in order. Shift-click: paste only the easing onto the selected keyframes",
        click: function (e) { w.run({ action: e.shift ? "pasteEase" : "paste" }); },
        draw: function (g) { MK.ui.gfx.button(g, b, b, r, PASTE, w); }
      });
    }
  });
})();
