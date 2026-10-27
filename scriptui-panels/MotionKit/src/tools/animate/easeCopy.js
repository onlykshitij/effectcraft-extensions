// SPDX-License-Identifier: MIT OR Apache-2.0
// Ease Copy: the first click copies the first selected keyframe (value, in and out temporal
// ease, interpolation types) and its property's expression into the settings; later clicks
// paste them onto every selected keyframe of every selected property, until the clipboard is
// cleared (Shift-click > Clear Clipboard). Eases pasted onto a property with another number of
// ease dimensions reuse the first dimension's ease; values only paste onto the same value type.
// Speeds are kept as multiples of their segment's average speed (MK.anim.avgSpeed) and pasted
// as that multiple of the target segment's, so an ease fits any distance, direction and unit.

(function () {
  var NAME = "Ease Copy", KEY = "easeCopy", U = MK.util, A = MK.anim, BEZ = KeyframeInterpolationType.BEZIER;
  // Clipboard version 2 adds `ratio` to each ease; older clipboards paste their raw speeds.
  var VERSION = 2;

  function clip() {
    var c = MK.settings.get(KEY, null);
    return c && typeof c === "object" && U.isArray(c.inEase) && U.isArray(c.outEase) ? c : null;
  }
  function describe(c) { return c ? "keyframe " + c.key + " of " + c.from : "empty"; }

  // The segment on one side of key i ([a, b]), or null at the first key's in or the last's out.
  function segment(p, i, inSide) {
    if (inSide) return i > 1 ? [i - 1, i] : null;
    return i < p.numKeys ? [i, i + 1] : null;
  }
  // Sets each ease's ratio: its speed over the segment's average speed in that dimension. A
  // dimension that doesn't move takes the first ratio found; with none (no segment, or nothing
  // moves) ratios are null and the raw speed is pasted.
  function addRatios(eases, p, seg) {
    var avg = seg && MK.sel.isNumeric(p) ? A.avgSpeed(p, seg[0], seg[1]) : [], first = null;
    for (var d = 0; d < eases.length; d++) {
      eases[d].ratio = d < avg.length && Math.abs(avg[d]) > 1e-9 ? eases[d].speed / avg[d] : null;
      if (first === null) first = eases[d].ratio;
    }
    for (var e = 0; e < eases.length; e++) if (eases[e].ratio === null) eases[e].ratio = first;
    return eases;
  }
  // The eases for one side of key i of p: each ratio times the target segment's average speed
  // (one per ease dimension of p, reusing the first copied ease), or the raw speeds for a
  // clipboard without ratios (older ones, Key Copy/Paste's Shift-Paste) or no segment there.
  function scaled(eases, p, i, inSide, relative) {
    var seg = segment(p, i, inSide);
    if (!relative || !seg || !MK.sel.isNumeric(p)) return eases;
    var avg = A.avgSpeed(p, seg[0], seg[1]);
    return U.map(avg, function (v, d) {
      var e = eases[d < eases.length ? d : 0];
      return { speed: U.isNum(e.ratio) && U.isNum(v) ? e.ratio * v : e.speed, influence: e.influence };
    });
  }

  function copy(ctx, props) {
    var p = props[0], i = MK.sel.selectedKeys(p)[0], k = MK.keys.read(p, i);
    MK.settings.set(KEY, {
      version: VERSION, from: MK.sel.label(p), key: i, valueType: p.propertyValueType,
      // Values of numbers, points and colours only: other types don't survive JSON.
      value: MK.sel.isNumeric(p) ? k.value : null,
      inEase: addRatios(k.inEase, p, segment(p, i, true)), outEase: addRatios(k.outEase, p, segment(p, i, false)),
      inInterp: k.inInterp, outInterp: k.outInterp,
      expression: p.canSetExpression ? String(p.expression || "") : ""
    });
    var more = props.length > 1 ? " (keyframes were selected on " + props.length + " properties; this is the first)" : "";
    return ctx.done(NAME + ": copied " + describe(clip()) + more + ". Click again to paste onto selected keyframes.");
  }

  // Pastes clipboard `c` (the copy() form) onto the selected keys of `props`. `name` starts the
  // message (default "Ease Copy"); the Key Copy/Paste widget's Shift-Paste uses this too.
  function paste(ctx, c, o, props, name) {
    var keys = 0, wrongType = 0, noInterp = 0, exprs = 0, rel = c.version >= VERSION;
    for (var n = 0; n < props.length; n++) {
      var p = props[n], sel = MK.sel.selectedKeys(p);
      var canEase = p.isInterpolationTypeValid(BEZ);
      var canInterp = p.isInterpolationTypeValid(c.inInterp) && p.isInterpolationTypeValid(c.outInterp);
      var sameType = c.value !== null && c.value !== undefined && p.propertyValueType === c.valueType;
      if (o.values && !sameType) wrongType++;
      if (o.interp && !canInterp) noInterp++;
      for (var j = 0; j < sel.length; j++) {
        var i = sel[j], inT = p.keyInInterpolationType(i), outT = p.keyOutInterpolationType(i);
        if (o.values && sameType) p.setValueAtKey(i, c.value);
        if (o.easing && canEase) MK.keys.setEase(p, i, scaled(c.inEase, p, i, true, rel), scaled(c.outEase, p, i, false, rel));
        if (o.interp && canInterp) p.setInterpolationTypeAtKey(i, c.inInterp, c.outInterp);
        // setTemporalEaseAtKey makes both sides Bezier: without Interpolation, put the types back.
        else if (o.easing && canEase) p.setInterpolationTypeAtKey(i, inT, outT);
        keys++;
      }
      if (o.expression && c.expression && p.canSetExpression) {
        p.expression = c.expression;
        exprs++;
      }
    }
    var what = U.filter([o.values && "values", o.easing && "easing", o.interp && "interpolation", o.expression && "expression"], function (x) { return !!x; });
    var msg = (name || NAME) + ": pasted " + what.join(", ") + " onto " + keys + (keys === 1 ? " keyframe" : " keyframes") + " on " + props.length + (props.length === 1 ? " property." : " properties.");
    if (wrongType) msg += " Values skipped on " + wrongType + " of another type.";
    if (noInterp) msg += " Interpolation skipped on " + noInterp + " that can't take it.";
    if (o.expression && !c.expression) msg += " The copied property had no expression.";
    else if (o.expression && exprs < props.length) msg += " " + (props.length - exprs) + " can't take an expression.";
    return ctx.done(msg);
  }

  // The options dialog's clipboard line: what is copied, and a button that clears it.
  function clipboardField(group) {
    var row = MK.widgets.row(group);
    var text = row.add("statictext", undefined, "");
    text.preferredSize = [220, -1];
    var btn = row.add("button", undefined, "Clear Clipboard");
    function show() {
      text.text = "Copied: " + describe(clip());
      btn.enabled = !!clip();
    }
    btn.onClick = function () {
      MK.settings.set(KEY, null);
      show();
    };
    show();
    return { button: btn, text: text, get: function () { return 0; }, set: function () {} };
  }

  MK.registerTool({
    id: "easeCopy",
    name: NAME,
    category: "Animate",
    description: "First click copies a keyframe's ease and interpolation; later clicks paste them onto selected keyframes.",
    // An S-curve on a card behind a second card (the front card's corner).
    icon: [
      "M11 16 H2 V2 H16 V11",
      "M4.5 13.5 C9 13.5 9 4.5 13.5 4.5",
      "U11 11 11 11 1.5",
      { d: "M22 16.5 V22 H16.5 Z", fill: "accent" }
    ],
    dot: function () { return !!clip(); },
    api: { paste: paste },
    options: [
      { key: "values", label: "Paste values (same value type only)", type: "checkbox", "default": false },
      { key: "easing", label: "Paste easing", type: "checkbox", "default": true },
      { key: "interp", label: "Paste interpolation type", type: "checkbox", "default": true },
      { key: "expression", label: "Paste the expression", type: "checkbox", "default": false },
      { key: "clipboard", label: "Clipboard", type: "custom", "default": 0, build: clipboardField, validate: function () { return 0; } }
    ],
    run: function (ctx, o) {
      var props = MK.anim.withSelectedKeys(ctx.props), c = clip();
      if (!c) {
        if (!props.length) ctx.fail("select a keyframe to copy its ease and interpolation from.");
        return copy(ctx, props);
      }
      if (!props.length) ctx.fail("select keyframes to paste onto (copied: " + describe(c) + "; Shift-click to clear it).");
      if (!o.values && !o.easing && !o.interp && !o.expression) ctx.fail("turn on at least one of Values, Easing, Interpolation or Expression (Shift-click).");
      return paste(ctx, c, o, props);
    }
  });
})();
