// SPDX-License-Identifier: MIT OR Apache-2.0
// Position Trace: for each selected layer a shape layer "<Layer> Trace" whose stroked path
// shows where the layer's anchor point has been (and, with Frames Offset, will be).
//
// The path starts at the target's comp position at time + Frames Offset frames and steps back
// every Trace Detail frames to time - Frames Trace, so it has floor((Trace + Offset) / Detail) + 1
// vertices, the newest first. Each sample is the target's anchor point taken to comp space at
// its own time (toComp(p, t)), then into the trace layer (fromComp). Trace Smooth r replaces
// each vertex with the mean of its r neighbours on either side (fewer near the two ends, so the
// ends stay put). Taper Out thins the stroke towards the oldest end.

(function () {
  var NAME = "Position Trace", ID = "positionTrace";
  var U = MK.util, C = MK.controls, R = MK.rig;
  var CTRL = {
    target: C.name(NAME, "Target"), frames: C.name(NAME, "Frames Trace"), offset: C.name(NAME, "Frames Offset"),
    smooth: C.name(NAME, "Trace Smooth"), detail: C.name(NAME, "Trace Detail"),
    width: C.name(NAME, "Stroke Width"), color: C.name(NAME, "Stroke Colour")
  };
  // The label colour of trace layers ("Aqua", the closest to the Rig accent), so they read as guides.
  var GUIDE_LABEL = 3;

  // A slider's value in the expression, or `fallback` when it isn't a finite number.
  function num(name, fallback) { return "mkNum(" + C.ref(name) + ".value, " + fallback + ")"; }

  var PATH = [
    R.LIB,
    "function mkNum(v, d) { return isFinite(v) ? v : d; }",
    "var mkOut = mkPathOf(value);",
    "try {",
    "  var mkT = " + C.ref(CTRL.target, "ADBE Layer Control") + ".value;",
    "  if (mkT) {",
    "    var mkFd = thisComp.frameDuration;",
    "    var mkBack = " + num(CTRL.frames, 30) + ", mkFwd = " + num(CTRL.offset, 0) + ";",
    "    var mkDet = Math.max(1, Math.min(10, Math.round(" + num(CTRL.detail, 1) + ")));",
    "    var mkN = Math.max(0, Math.min(2000, Math.floor((mkBack + mkFwd) / mkDet + 1e-9)));",
    "    var mkT0 = time + mkFwd * mkFd, mkRaw = [];",
    "    for (var mkK = 0; mkK <= mkN; mkK++) {",
    "      var mkTi = mkT0 - mkK * mkDet * mkFd;",
    "      var mkP = fromComp(mkT.toComp(mkT.anchorPoint.valueAtTime(mkTi), mkTi));",
    "      mkRaw.push(mkFinite(mkP) ? [mkP[0], mkP[1]] : mkRaw.length ? mkRaw[mkRaw.length - 1] : [0, 0]);",
    "    }",
    "    var mkR = Math.max(0, Math.min(10, Math.round(" + num(CTRL.smooth, 0) + "))), mkPts = [];",
    "    for (mkK = 0; mkK < mkRaw.length; mkK++) {",
    "      var mkW = Math.min(mkR, mkK, mkRaw.length - 1 - mkK), mkSx = 0, mkSy = 0;",
    "      for (var mkJ = mkK - mkW; mkJ <= mkK + mkW; mkJ++) { mkSx += mkRaw[mkJ][0]; mkSy += mkRaw[mkJ][1]; }",
    "      mkPts.push([mkSx / (2 * mkW + 1), mkSy / (2 * mkW + 1)]);",
    "    }",
    "    mkOut = createPath(mkPts, null, null, false);",
    "  }",
    "} catch (mkE) {}",
    "mkOut"
  ].join("\n");

  MK.registerTool({
    id: ID,
    name: NAME,
    category: "Rig",
    description: "Draws the path each selected layer travels as a stroked trail on a new shape layer.",
    // A dotted fading trail behind a dot (the dot).
    icon: [
      { d: "O3.8 17.6 1", fill: "fg", alpha: 0.3 },
      { d: "O7.2 15.2 1.2", fill: "fg", alpha: 0.45 },
      { d: "O10.8 13.1 1.4", fill: "fg", alpha: 0.6 },
      { d: "O14.6 11.4 1.6", fill: "fg", alpha: 0.8 },
      { d: "O19.2 9.6 3", fill: "accent" }
    ],
    options: [
      { key: "frames", label: "Frames Trace", type: "number", "default": 30, min: 0, max: 1000, help: "Frames of history behind the layer" },
      { key: "offset", label: "Frames Offset", type: "number", "default": 0, min: -1000, max: 1000, help: "Frames ahead of the current time" },
      { key: "smooth", label: "Trace Smooth", type: "number", "default": 0, min: 0, max: 10, integer: true },
      { key: "detail", label: "Trace Detail", type: "number", "default": 1, min: 1, max: 10, integer: true, unit: "frames per sample" },
      { key: "width", label: "Stroke Width", type: "number", "default": 4, min: 0, max: 1000, unit: "px" },
      { key: "color", label: "Stroke Colour", type: "color", "default": MK.ACCENTS.Rig },
      { key: "taper", label: "Taper Out (the trail thins towards its oldest end)", type: "checkbox", "default": true }
    ],
    run: function (ctx, o) {
      var layers = MK.sel.byIndex(ctx.layers);
      if (!layers.length) ctx.fail("select one or more layers to trace.");
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var sh = ctx.comp.layers.addShape();
        sh.name = R.layerName(ctx.comp, L.name + " Trace");
        sh.moveBefore(L);
        sh.label = GUIDE_LABEL;
        C.layer(sh, CTRL.target, L);
        C.slider(sh, CTRL.frames, o.frames);
        C.slider(sh, CTRL.offset, o.offset);
        C.slider(sh, CTRL.smooth, o.smooth);
        C.slider(sh, CTRL.detail, o.detail);
        C.slider(sh, CTRL.width, o.width);
        C.color(sh, CTRL.color, o.color);
        var items = sh.property("ADBE Root Vectors Group");
        var path = items.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
        var empty = new Shape();
        empty.closed = false;
        path.setValue(empty);
        MK.expr.set(path, ID, PATH);
        var st = items.addProperty("ADBE Vector Graphic - Stroke");
        MK.expr.set(st.property("ADBE Vector Stroke Width"), ID, "var mkW = " + C.ref(CTRL.width) + ".value;\nisFinite(mkW) ? Math.max(0, mkW) : 4");
        MK.expr.set(st.property("ADBE Vector Stroke Color"), ID, C.ref(CTRL.color, "ADBE Color Control"));
        st.property("ADBE Vector Stroke Line Cap").setValue(2);
        st.property("ADBE Vector Stroke Line Join").setValue(2);
        if (o.taper) {
          var tp = st.property("ADBE Vector Stroke Taper");
          tp.property("Length Units").setValue(2);
          tp.property("End Length").setValue(100);
          tp.property("End Width").setValue(0);
        }
        ctx.created.push(sh);
      }
      return ctx.done("Added " + layers.length + (layers.length === 1 ? " trace." : " traces."));
    }
  });
})();
