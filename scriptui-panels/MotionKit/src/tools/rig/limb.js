// SPDX-License-Identifier: MIT OR Apache-2.0
// Limb: a two-segment IK limb. "Limb Root" (hip or shoulder) and "Limb Ctrl" (the end) drive a
// stroked path root -> joint -> end on the shape layer "Limb", and "Limb Joint", a null for
// attaching art, follows the joint. All controls sit on "Limb"; Layer Controls on it name the
// root and the controller, and one on the joint and controller names "Limb", so renaming any of
// the layers keeps the rig working.
//
// Maths, in comp space (mkSolve, shared by the path and the joint):
// - Segment lengths a = L (1/2 + o), b = L (1/2 - o) from Limb Length L and Mid Point Offset o.
// - The target is the controller, clamped above the Ground Layer's y + Ground Level: with In < Out
//   the clamp is soft, y0 + (y1 - y0)(1 - e^(-(y - y0)/(y1 - y0))), which leaves y0 at slope 1
//   and never passes y1.
// - d = |target - root| is clamped to |a - b| .. a + b. With Stretch on and d > a + b, both
//   segments scale so the limb is a + b + (d - a - b) * Stretch Adjust long.
// - Law of cosines: the joint lies x = (d^2 + a^2 - b^2) / 2d along root -> end and
//   h = sqrt(a^2 - x^2) to its side. d = 0 picks a straight-down direction, so nothing divides
//   by zero.
// - Side: +1, -1 with Bend Direction. With Flip on it is multiplied by a smooth blend of
//   s = sin(angle - Flip Angle) / sin(Flip Range) (+ 2 Flip Balance - 1), clamped to -1..1 and
//   smoothstepped, where angle is the target's direction from the root: the knee changes side
//   when the controller passes Flip Angle (and the opposite direction), over +-Flip Range.
// - Mid Point Realism r scales h by 1 - r * smoothstep(d / (a + b) from 0.85 to 1), so the joint
//   eases onto the straight line near full extension instead of snapping.
// - Path: root + Top Point Offset, joint, end + Bottom Point Offset. Each segment p -> q gets
//   Bézier handles (q - p) / 3 plus a bulge of (Curvature / 100) * |q - p| / 2 perpendicular to
//   it, on the outside of the bend for positive values.

(function () {
  var NAME = "Limb", ID = "limb";
  var C = MK.controls, S = MK.space, R = MK.rig;
  var SL = "ADBE Slider Control", CB = "ADBE Checkbox Control", AN = "ADBE Angle Control", PT = "ADBE Point Control", LC = "ADBE Layer Control", CO = "ADBE Color Control";

  function n(param) { return C.name(NAME, param); }
  // A control on the limb layer mkK, read in an expression.
  function k(param, type) { return "mkK." + C.ref(n(param), type || SL) + ".value"; }

  var SOLVE = [
    "function mkF(v, d) { v = Number(v); return isFinite(v) ? v : d; }",
    // Cameras and lights have no anchor point, so mkPos uses their origin.
    "function mkPos(L) { var p = L.toComp(L.anchorPoint ? L.anchorPoint.value : [0, 0, 0]); return [mkF(p[0], 0), mkF(p[1], 0)]; }",
    "function mkClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }",
    "function mkSolve(mkK) {",
    "  var mkRootL = " + k("Root", LC) + ", mkCtrlL = " + k("Controller", LC) + ";",
    "  if (!mkRootL || !mkCtrlL) return null;",
    "  var mkR = mkPos(mkRootL), mkC = mkPos(mkCtrlL);",
    "  var mkLen = Math.max(0, mkF(" + k("Limb Length") + ", 300));",
    "  var mkOff = mkClamp(mkF(" + k("Mid Point Offset") + ", 0), -50, 50) / 100;",
    "  var mkA = mkLen * (0.5 + mkOff), mkB = mkLen * (0.5 - mkOff);",
    "  var mkG = " + k("Ground Layer", LC) + ";",
    "  if (mkG) {",
    "    var mkGy = mkPos(mkG)[1], mkY0 = mkGy + mkF(" + k("Ground Level In") + ", 0), mkY1 = mkGy + mkF(" + k("Ground Level Out") + ", 0);",
    "    if (mkY1 < mkY0) { var mkTmp = mkY0; mkY0 = mkY1; mkY1 = mkTmp; }",
    "    if (mkC[1] > mkY0) mkC = [mkC[0], mkY1 > mkY0 ? mkY0 + (mkY1 - mkY0) * (1 - Math.exp(-(mkC[1] - mkY0) / (mkY1 - mkY0))) : mkY0];",
    "  }",
    "  var mkDx = mkC[0] - mkR[0], mkDy = mkC[1] - mkR[1], mkD = Math.sqrt(mkDx * mkDx + mkDy * mkDy);",
    "  var mkU = mkD > 1e-6 ? [mkDx / mkD, mkDy / mkD] : [0, 1];",
    "  var mkHi = mkA + mkB, mkLo = Math.abs(mkA - mkB);",
    "  if (mkD > mkHi) {",
    "    if (" + k("Stretch", CB) + " && mkHi > 1e-6) {",
    "      var mkTot = mkHi + (mkD - mkHi) * Math.max(0, mkF(" + k("Stretch Adjust") + ", 100)) / 100;",
    "      mkA *= mkTot / mkHi;",
    "      mkB *= mkTot / mkHi;",
    "      mkHi = mkTot;",
    "      mkLo = Math.abs(mkA - mkB);",
    "    }",
    "    mkD = Math.min(mkD, mkHi);",
    "  }",
    "  if (mkD < mkLo) mkD = mkLo;",
    "  var mkE = [mkR[0] + mkU[0] * mkD, mkR[1] + mkU[1] * mkD];",
    "  var mkSide = " + k("Bend Direction", CB) + " ? -1 : 1;",
    "  if (" + k("Flip", CB) + ") {",
    "    var mkAng = Math.atan2(mkU[1], mkU[0]) - mkF(" + k("Flip Angle", AN) + ", 0) * Math.PI / 180;",
    "    var mkRange = Math.sin(mkClamp(mkF(" + k("Flip Range", AN) + ", 20), 0, 90) * Math.PI / 180);",
    "    var mkS = Math.sin(mkAng);",
    "    mkS = mkRange > 1e-6 ? mkS / mkRange : (mkS >= 0 ? 1 : -1);",
    "    mkS = mkClamp(mkS + 2 * mkClamp(mkF(" + k("Flip Balance") + ", 0.5), 0, 1) - 1, -1, 1);",
    "    var mkV = (mkS + 1) / 2;",
    "    mkSide *= 2 * mkV * mkV * (3 - 2 * mkV) - 1;",
    "  }",
    "  var mkX = mkD > 1e-6 ? (mkD * mkD + mkA * mkA - mkB * mkB) / (2 * mkD) : 0;",
    "  var mkH = Math.sqrt(Math.max(0, mkA * mkA - mkX * mkX));",
    "  var mkT = mkHi > 1e-6 ? mkClamp((mkD / mkHi - 0.85) / 0.15, 0, 1) : 1;",
    "  mkH *= 1 - mkClamp(mkF(" + k("Mid Point Realism") + ", 0), 0, 100) / 100 * mkT * mkT * (3 - 2 * mkT);",
    "  var mkJ = [mkR[0] + mkU[0] * mkX - mkU[1] * mkH * mkSide, mkR[1] + mkU[1] * mkX + mkU[0] * mkH * mkSide];",
    "  if (!(mkFinite(mkR) && mkFinite(mkJ) && mkFinite(mkE))) return null;",
    "  return { root: mkR, joint: mkJ, end: mkE, side: mkSide };",
    "}"
  ].join("\n");

  // The path on "Limb" (thisLayer is the limb layer).
  var PATH = [
    R.LIB,
    SOLVE,
    "function mkSeg(p, q, c, side) {",
    "  var mkDx = q[0] - p[0], mkDy = q[1] - p[1], mkK = mkClamp(mkF(c, 0), -100, 100) / 200 * side;",
    "  var mkBx = -mkDy * mkK, mkBy = mkDx * mkK;",
    "  return [fromCompVec([mkDx / 3 + mkBx, mkDy / 3 + mkBy]), fromCompVec([-mkDx / 3 + mkBx, -mkDy / 3 + mkBy])];",
    "}",
    "var mkOut = mkPathOf(value);",
    "try {",
    "  var mkK = thisLayer, mkS = mkSolve(mkK);",
    "  if (mkS) {",
    "    var mkTop = " + k("Top Point Offset", PT) + ", mkBot = " + k("Bottom Point Offset", PT) + ";",
    "    var mkP0 = [mkS.root[0] + mkF(mkTop[0], 0), mkS.root[1] + mkF(mkTop[1], 0)];",
    "    var mkP2 = [mkS.end[0] + mkF(mkBot[0], 0), mkS.end[1] + mkF(mkBot[1], 0)];",
    "    var mkS1 = mkSeg(mkP0, mkS.joint, " + k("Bend Top Curvature") + ", mkS.side);",
    "    var mkS2 = mkSeg(mkS.joint, mkP2, " + k("Bend Bottom Curvature") + ", mkS.side);",
    "    var mkPts = [fromComp(mkP0), fromComp(mkS.joint), fromComp(mkP2)];",
    "    var mkIn = [[0, 0], mkS1[1], mkS2[1]], mkOutT = [mkS1[0], mkS2[0], [0, 0]], mkOk = true;",
    "    for (var mkI = 0; mkI < 3; mkI++) mkOk = mkOk && mkFinite(mkPts[mkI]) && mkFinite(mkIn[mkI]) && mkFinite(mkOutT[mkI]);",
    "    if (mkOk) mkOut = createPath([[mkPts[0][0], mkPts[0][1]], [mkPts[1][0], mkPts[1][1]], [mkPts[2][0], mkPts[2][1]]],",
    "      [[0, 0], [mkIn[1][0], mkIn[1][1]], [mkIn[2][0], mkIn[2][1]]], [[mkOutT[0][0], mkOutT[0][1]], [mkOutT[1][0], mkOutT[1][1]], [0, 0]], false);",
    "  }",
    "} catch (mkE) {}",
    "mkOut"
  ].join("\n");

  // The joint null's position: the solved joint, in its parent's space.
  var JOINT = [
    R.LIB,
    SOLVE,
    "var mkOut = value;",
    "try {",
    "  var mkL = " + C.ref(n("Limb Layer"), LC) + ".value, mkS = mkL ? mkSolve(mkL) : null;",
    "  if (mkS) {",
    "    var mkP = hasParent ? parent.fromComp(mkS.joint) : mkS.joint;",
    "    if (mkFinite(mkP)) mkOut = [mkP[0], mkP[1]];",
    "  }",
    "} catch (mkE) {}",
    "mkOut"
  ].join("\n");

  // The controller circle reads Control Size and Control Colour from the limb layer.
  function fromLimb(param, type, wrap) {
    return [
      "var mkOut = value;",
      "try {",
      "  var mkK = " + C.ref(n("Limb Layer"), LC) + ".value;",
      "  if (mkK) { var mkV = " + k(param, type) + "; " + wrap + " }",
      "} catch (mkE) {}",
      "mkOut"
    ].join("\n");
  }
  var CTRL_SIZE = fromLimb("Control Size", SL, "if (isFinite(mkV)) mkOut = [Math.max(0, mkV), Math.max(0, mkV)];");
  var CTRL_COLOR = fromLimb("Control Colour", CO, "if (mkV && isFinite(mkV[0])) mkOut = mkV;");

  function addNull(ctx, name, at) {
    var l = ctx.comp.layers.addNull();
    l.name = R.layerName(ctx.comp, name);
    l.transform.position.setValue([at[0], at[1]]);
    ctx.created.push(l);
    return l;
  }

  // The end controller: a guide shape layer drawn as a stroked circle.
  function addCtrl(ctx, at, limb) {
    var l = ctx.comp.layers.addShape();
    l.name = R.layerName(ctx.comp, "Limb Ctrl");
    l.transform.position.setValue([at[0], at[1]]);
    l.guideLayer = true;
    C.layer(l, n("Limb Layer"), limb);
    var items = l.property("ADBE Root Vectors Group");
    var el = items.addProperty("ADBE Vector Shape - Ellipse");
    MK.expr.set(el.property("ADBE Vector Ellipse Size"), ID, CTRL_SIZE);
    var st = items.addProperty("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Width").setValue(3);
    MK.expr.set(st.property("ADBE Vector Stroke Color"), ID, CTRL_COLOR);
    ctx.created.push(l);
    return l;
  }

  MK.registerTool({
    id: ID,
    name: NAME,
    category: "Rig",
    description: "Builds a two-segment IK limb (root, joint, end controller) with bend, flip, ground and stretch controls.",
    // Two bones joined at a knee (the joint dot).
    icon: [
      { d: "M5 3.5 L9.5 13 L19.5 19.5", w: 2.2 },
      { d: "O5 3.5 1.7 O19.5 19.5 1.7", fill: "fg" },
      { d: "O9.5 13 2.8", fill: "accent" }
    ],
    options: [
      { key: "length", label: "Limb Length", type: "number", "default": 300, min: 1, max: 100000, unit: "px" },
      { key: "strokeWidth", label: "Stroke Width", type: "number", "default": 20, min: 0, max: 1000, unit: "px" },
      { key: "strokeColor", label: "Stroke Colour", type: "color", "default": "#E8E8E8" },
      { key: "controlSize", label: "Control Size", type: "number", "default": 40, min: 1, max: 1000, unit: "px" },
      { key: "controlColor", label: "Control Colour", type: "color", "default": MK.ACCENTS.Rig }
    ],
    run: function (ctx, o) {
      var given = ctx.layers;
      if (given.length > 2) ctx.fail("select up to two layers: the root (hip or shoulder) and then the end controller.");
      var len = o.length, comp = ctx.comp, centre = [comp.width / 2, comp.height / 2];
      var rootAt = given.length ? S.anchorInComp(given[0]) : [centre[0], centre[1] - 0.4 * len];
      var ctrlAt = [rootAt[0], rootAt[1] + 0.8 * len];
      var label = R.freeLabel(comp);

      var root = given[0] || addNull(ctx, "Limb Root", rootAt);
      var limb = comp.layers.addShape();
      limb.name = R.layerName(comp, "Limb");
      ctx.created.push(limb);
      var ctrl = given[1] || addCtrl(ctx, ctrlAt, limb);

      C.layer(limb, n("Root"), root);
      C.layer(limb, n("Controller"), ctrl);
      C.slider(limb, n("Limb Length"), len);
      C.slider(limb, n("Mid Point Offset"), 0);
      C.slider(limb, n("Mid Point Realism"), 0);
      C.checkbox(limb, n("Bend Direction"), false);
      C.slider(limb, n("Bend Top Curvature"), 0);
      C.slider(limb, n("Bend Bottom Curvature"), 0);
      C.checkbox(limb, n("Flip"), false);
      C.angle(limb, n("Flip Angle"), 0);
      C.angle(limb, n("Flip Range"), 20);
      C.slider(limb, n("Flip Balance"), 0.5);
      C.layer(limb, n("Ground Layer"), null);
      C.slider(limb, n("Ground Level In"), 0);
      C.slider(limb, n("Ground Level Out"), 0);
      C.checkbox(limb, n("Stretch"), false);
      C.slider(limb, n("Stretch Adjust"), 100);
      C.point(limb, n("Top Point Offset"), [0, 0]);
      C.point(limb, n("Bottom Point Offset"), [0, 0]);
      C.slider(limb, n("Control Size"), o.controlSize);
      C.color(limb, n("Control Colour"), o.controlColor);
      C.slider(limb, n("Stroke Width"), o.strokeWidth);
      C.color(limb, n("Stroke Colour"), o.strokeColor);

      var items = limb.property("ADBE Root Vectors Group");
      var path = items.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
      var start = new Shape();
      start.vertices = [];
      start.closed = false;
      path.setValue(start);
      MK.expr.set(path, ID, PATH);
      var st = items.addProperty("ADBE Vector Graphic - Stroke");
      MK.expr.set(st.property("ADBE Vector Stroke Width"), ID, "var mkW = " + C.ref(n("Stroke Width")) + ".value;\nisFinite(mkW) ? Math.max(0, mkW) : 20");
      MK.expr.set(st.property("ADBE Vector Stroke Color"), ID, C.ref(n("Stroke Colour"), CO));
      st.property("ADBE Vector Stroke Line Cap").setValue(2);
      st.property("ADBE Vector Stroke Line Join").setValue(2);

      var joint = addNull(ctx, "Limb Joint", rootAt);
      C.layer(joint, n("Limb Layer"), limb);
      MK.expr.set(joint.transform.position, ID, JOINT);

      var all = [root, limb, joint, ctrl];
      for (var i = 0; i < all.length; i++) all[i].label = label;
      return ctx.done("Built \"" + limb.name + "\": root " + root.name + ", controller " + ctrl.name + ", joint " + joint.name + ".");
    }
  });
})();
