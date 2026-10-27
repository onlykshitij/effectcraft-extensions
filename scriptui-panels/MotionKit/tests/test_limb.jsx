// SPDX-License-Identifier: MIT OR Apache-2.0
// Limb: the rig layers, label and controls; the joint at distance a from the root and b from the
// end (law of cosines), Mid Point Offset, out of reach, Stretch and Stretch Adjust, root == end
// without NaN, Bend Direction, Flip with Flip Range and Flip Balance, the hard and soft ground
// clamp, Mid Point Realism, curvature and point offsets on the path, the controller circle, a
// deleted root, one and two selected layers, a light as the root, bad selection, one undo step.
// Comp positions are checked with EffectCraft's own sourcePointToComp.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("Limb Test");  // 1000 x 600
var x1 = T.solid(comp, "X1", 50, 50), x2 = T.solid(comp, "X2", 50, 50), x3 = T.solid(comp, "X3", 50, 50);

function dist(p, q) { return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1])); }
function cross(o, p, q) { return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]); }
// Distance from p to the line through a and b.
function off(p, a, b) { return Math.abs(cross(a, b, p)) / dist(a, b); }

T.select(comp, [x1, x2, x3], []);
var bad = MotionKit.run("limb");
T.check(!bad.ok && /up to two layers/.test(bad.message) && comp.numLayers === 3, "three layers: refused, nothing added (" + bad.message + ")");

// Nothing selected: the whole rig at the comp centre.
T.select(comp, [], []);
var r = MotionKit.run("limb");
T.check(r.ok && r.created.length === 4 && comp.numLayers === 7, "builds four layers: " + r.message);
var root = comp.layer("Limb Root"), limb = comp.layer("Limb"), joint = comp.layer("Limb Joint"), ctrl = comp.layer("Limb Ctrl");
T.check(root && root.nullLayer && joint && joint.nullLayer && limb instanceof ShapeLayer && ctrl instanceof ShapeLayer && ctrl.guideLayer, "\"Limb Root\" and \"Limb Joint\" nulls, \"Limb\" shape, \"Limb Ctrl\" guide shape");
var lab = limb.label;
T.check(root.label === lab && joint.label === lab && ctrl.label === lab && lab !== x1.label && lab > 0, "all four share a new label colour (" + lab + ")");
var fx = limb.property("ADBE Effect Parade");
function c(name) { return fx.property("Limb – " + name).property(1); }
var names = ["Root", "Controller", "Limb Length", "Mid Point Offset", "Mid Point Realism", "Bend Direction", "Bend Top Curvature", "Bend Bottom Curvature",
  "Flip", "Flip Angle", "Flip Range", "Flip Balance", "Ground Layer", "Ground Level In", "Ground Level Out", "Stretch", "Stretch Adjust",
  "Top Point Offset", "Bottom Point Offset", "Control Size", "Control Colour", "Stroke Width", "Stroke Colour"];
var missing = [];
for (var i = 0; i < names.length; i++) if (!fx.property("Limb – " + names[i])) missing.push(names[i]);
T.check(!missing.length && fx.numProperties === names.length, "every control is on \"Limb\" (" + fx.numProperties + ")" + (missing.length ? " missing: " + missing.join(", ") : ""));
T.check(c("Limb Length").value === 300 && c("Stroke Width").value === 20 && c("Flip Range").value === 20 && c("Stretch Adjust").value === 100 && c("Root").value === root.index && c("Controller").value === ctrl.index,
  "defaults: length 300, stroke 20, flip range 20, stretch adjust 100; Root and Controller name the layers");
T.check(T.near(root.transform.position.value, [500, 180]) && T.near(ctrl.transform.position.value, [500, 420]), "root and controller are centred on the comp, 240 px apart");

var path = limb.property("ADBE Root Vectors Group").property(1).property("ADBE Vector Shape");
var stroke = limb.property("ADBE Root Vectors Group").property(2);
function J() { var p = joint.transform.position.valueAtTime(comp.time, false); return [p[0], p[1]]; }
function P() {
  var s = path.valueAtTime(comp.time, false);
  return { v: [limb.sourcePointToComp(s.vertices[0]), limb.sourcePointToComp(s.vertices[1]), limb.sourcePointToComp(s.vertices[2])], s: s };
}
function moveCtrl(p) { ctrl.transform.position.setValue([p[0], p[1]]); }
var R0 = [500, 180];

var p = P(), j = J();
T.check(path.expressionError === "" && p.s.vertices.length === 3 && !p.s.closed, "the path has three vertices: root, joint, end");
T.check(T.near(dist(j, R0), 150, 1e-6) && T.near(dist(j, [500, 420]), 150, 1e-6), "the joint is 150 from the root and 150 from the end (" + dist(j, R0).toFixed(6) + ", " + dist(j, [500, 420]).toFixed(6) + ")");
T.check(T.near(p.v[0], R0, 1e-6) && T.near(p.v[1], j, 1e-6) && T.near(p.v[2], [500, 420], 1e-6), "the path goes root -> joint -> controller, and the joint null is on it");
T.check(T.near(j[1], 180 + 120, 1e-6) && T.near(j[0], 500 - Math.sqrt(150 * 150 - 120 * 120), 1e-6) && cross(R0, [500, 420], j) > 0, "law of cosines: 120 down the line and 90 to the side");
T.check(stroke.property("ADBE Vector Stroke Width").valueAtTime(0, false) === 20 && stroke.property("ADBE Vector Stroke Line Cap").value === 2 && stroke.property("ADBE Vector Stroke Line Join").value === 2, "stroke width from the control, round caps and joins");

// Mid Point Offset.
c("Mid Point Offset").setValue(20);
j = J();
T.check(T.near(dist(j, R0), 210, 1e-6) && T.near(dist(j, [500, 420]), 90, 1e-6), "Mid Point Offset 20 %: the joint sits at 70 % of the length, segments of 210 and 90");
c("Mid Point Offset").setValue(0);

// Out of reach, then Stretch.
moveCtrl([500, 680]);
p = P();
T.check(T.near(p.v[2], [500, 480], 1e-6) && T.near(J(), [500, 330], 1e-6), "out of reach: the end stops at full length (300) and the limb is straight");
c("Stretch").setValue(1);
p = P();
T.check(T.near(p.v[2], [500, 680], 1e-6) && T.near(dist(J(), R0), 250, 1e-6), "Stretch: the end reaches the controller and both segments stretch (250 each)");
c("Stretch Adjust").setValue(50);
T.check(T.near(P().v[2], [500, 580], 1e-6), "Stretch Adjust 50 %: half the extra distance (400 long)");
c("Stretch").setValue(0);
c("Stretch Adjust").setValue(100);

// Root == end: no NaN, the joint still 150 from the root.
moveCtrl(R0);
p = P();
j = J();
T.check(isFinite(j[0]) && isFinite(j[1]) && T.near(dist(j, R0), 150, 1e-6) && T.near(p.v[2], R0, 1e-6) && T.near(p.v[1], j, 1e-6), "root == end: no NaN, the joint folds to 150 from the root (" + j[0] + ", " + j[1] + ")");
c("Mid Point Offset").setValue(20);
p = P();
T.check(T.near(dist(p.v[2], R0), 120, 1e-6) && T.near(dist(J(), R0), 210, 1e-6) && T.near(dist(J(), p.v[2]), 90, 1e-6), "root == end with unequal segments: the end stays |a - b| = 120 away");
c("Mid Point Offset").setValue(0);

// Bend Direction and Flip.
moveCtrl([500, 420]);
c("Bend Direction").setValue(1);
T.check(cross(R0, [500, 420], J()) < 0 && T.near(J()[0], 590, 1e-6), "Bend Direction moves the knee to the other side");
c("Bend Direction").setValue(0);
moveCtrl([500, -60]);
T.check(cross(R0, [500, -60], J()) > 0, "without Flip the knee keeps its side when the controller goes above the root");
c("Flip").setValue(1);
T.check(cross(R0, [500, -60], J()) < 0, "Flip: past the Flip Angle (0, pointing right) the knee changes side");
moveCtrl([500, 420]);
T.check(cross(R0, [500, 420], J()) > 0, "and back on the first side below it");
var e10 = [R0[0] + 240 * Math.cos(Math.PI / 18), R0[1] + 240 * Math.sin(Math.PI / 18)];
moveCtrl(e10);
var s = Math.sin(Math.PI / 18) / Math.sin(Math.PI / 9), v = (s + 1) / 2, blend = 2 * v * v * (3 - 2 * v) - 1;
T.check(T.near(off(J(), R0, e10), 90 * blend, 1e-6), "10 degrees inside the 20 degree Flip Range the knee is blended toward the line (" + off(J(), R0, e10).toFixed(3) + " of 90)");
var em10 = [R0[0] + 240 * Math.cos(-Math.PI / 18), R0[1] + 240 * Math.sin(-Math.PI / 18)];
moveCtrl(em10);
T.check(cross(R0, em10, J()) < 0, "at -10 degrees it leans to the other side");
c("Flip Balance").setValue(1);
T.check(cross(R0, em10, J()) > 0, "Flip Balance 1 favours the first side there");
c("Flip Balance").setValue(0.5);
c("Flip").setValue(0);

// Ground.
var ground = comp.layers.addNull();
ground.name = "Ground";
ground.transform.position.setValue([300, 400 + 50]);  // a null's anchor is its centre (50, 50)
c("Ground Layer").setValue(ground);
moveCtrl([560, 520]);
T.check(T.near(P().v[2], [560, 450], 1e-6), "Ground Layer: the end can't go below the ground (y 450)");
moveCtrl([560, 300]);
T.check(T.near(P().v[2], [560, 300], 1e-6), "above the ground the end follows the controller");
c("Ground Level In").setValue(-50);
moveCtrl([560, 550]);
var soft = 400 + 50 * (1 - Math.exp(-150 / 50));
T.check(T.near(P().v[2], [560, soft], 1e-6), "Ground Level In -50: a soft clamp that eases into the ground (" + P().v[2][1].toFixed(3) + ")");
c("Ground Layer").setValue(0);
c("Ground Level In").setValue(0);

// Mid Point Realism.
var e95 = [500, 180 + 285];
moveCtrl(e95);
var h = Math.sqrt(150 * 150 - 142.5 * 142.5);
T.check(T.near(off(J(), R0, e95), h, 1e-6), "at 95 % reach the knee is " + h.toFixed(3) + " off the line");
c("Mid Point Realism").setValue(100);
var t = (0.95 - 0.85) / 0.15;
T.check(T.near(off(J(), R0, e95), h * (1 - t * t * (3 - 2 * t)), 1e-6), "Mid Point Realism 100 pulls it toward the line near full reach (" + off(J(), R0, e95).toFixed(3) + ")");
moveCtrl([500, 420]);
T.check(T.near(dist(J(), R0), 150, 1e-6), "and leaves it alone at 80 % reach");
c("Mid Point Realism").setValue(0);

// Curvature and point offsets.
c("Bend Top Curvature").setValue(50);
c("Top Point Offset").setValue([10, -5]);
c("Bottom Point Offset").setValue([0, 30]);
p = P();
j = J();
var d0 = [j[0] - 510, j[1] - 175];
T.check(T.near(p.v[0], [510, 175], 1e-6) && T.near(p.v[2], [500, 450], 1e-6) && T.near(p.v[1], j, 1e-6), "Top and Bottom Point Offset move where the path attaches, not the joint");
T.check(T.near(p.s.outTangents[0], [d0[0] / 3 - d0[1] / 4, d0[1] / 3 + d0[0] / 4], 1e-6), "Bend Top Curvature 50 bulges the first segment's handle sideways by a quarter of its length");
T.check(T.near(p.s.outTangents[1], [(500 - j[0]) / 3, (450 - j[1]) / 3], 1e-6), "the second segment stays straight");
c("Bend Top Curvature").setValue(0);
c("Top Point Offset").setValue([0, 0]);
c("Bottom Point Offset").setValue([0, 0]);

// The controller circle.
var ell = ctrl.property("ADBE Root Vectors Group").property(1).property("ADBE Vector Ellipse Size");
T.check(T.near(ell.valueAtTime(0, false), [40, 40]), "the controller is a 40 px circle (Control Size)");
c("Control Size").setValue(64);
T.check(T.near(ell.valueAtTime(0, false), [64, 64]), "and follows Control Size");
T.check(T.near(ctrl.property("ADBE Root Vectors Group").property(2).property("ADBE Vector Stroke Color").valueAtTime(0, false), MotionKit.helpers.util.hexToRgb("#2BB3A3"), 1e-3), "drawn in Control Colour");

// Renaming keeps the rig; a deleted root leaves the joint where it is, no NaN.
root.name = "Hip";
limb.name = "Leg";
T.check(T.near(dist(J(), [500, 180]), 150, 1e-6), "renaming the root and the limb keeps the rig working");
limb.name = "Limb";
var still = joint.transform.position.valueAtTime(0, true);
root.remove();
j = J();
T.check(T.near(j, [still[0], still[1]]) && isFinite(j[0]), "a deleted root: the joint falls back to its own position, no NaN");

// One layer: it is the root.
var hip = T.solid(comp, "Hip 2", 40, 40);
hip.transform.position.setValue([200, 100]);
T.select(comp, [hip], []);
r = MotionKit.run("limb", { length: 200 });
T.check(r.ok && r.created.length === 3 && comp.layer("Limb Ctrl 2") && comp.layer("Limb 2"), "one layer: it is the root; the limb, joint and controller are new (names made unique): " + r.message);
var j2 = comp.layer("Limb Joint 2").transform.position.valueAtTime(0, false);
T.check(T.near(comp.layer("Limb Ctrl 2").transform.position.value, [200, 260]) && T.near(dist([j2[0], j2[1]], [200, 100]), 100, 1e-6), "the controller starts 0.8 lengths below the root; the joint is 100 from it");

// Two layers: root and end controller, in selection order.
var sh = T.solid(comp, "Shoulder", 30, 30), hand = T.solid(comp, "Hand", 30, 30);
sh.transform.position.setValue([700, 200]);
hand.transform.position.setValue([850, 300]);
T.select(comp, [], []);
sh.selected = true;
hand.selected = true;
var n0 = comp.numLayers;
r = MotionKit.run("limb", { length: 240 });
var limb3 = comp.layer("Limb 3"), j3 = comp.layer("Limb Joint 3").transform.position.valueAtTime(0, false);
T.check(r.ok && comp.numLayers === n0 + 2 && limb3.property("ADBE Effect Parade").property("Limb – Root").property(1).value === sh.index && hand.label === limb3.label,
  "two layers: the first is the root, the second the controller; only the limb and joint are new, all share the label");
var d3 = dist([700, 200], [850, 300]);
T.check(T.near(dist([j3[0], j3[1]], [700, 200]), 120, 1e-6) && T.near(dist([j3[0], j3[1]], [850, 300]), 120, 1e-6), "the joint is 120 from both (they are " + d3.toFixed(1) + " apart)");

// One undo step.
n0 = comp.numLayers;
T.select(comp, [], []);
MotionKit.run("limb");
T.check(comp.numLayers === n0 + 4, "a fourth rig");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(comp.numLayers === n0, "one Undo removes all of it");

// A light as the root: it has no anchor point, so its origin (its position) is the root.
var lamp = comp.layers.addLight("Lamp", [500, 300]);
lamp.transform.position.setValue([300, 200, 0]);
T.select(comp, [lamp], []);
r = MotionKit.run("limb", { length: 200 });
// r.created: the limb, the controller, the joint.
var lampCtrl = r.created[1], jl = r.created[2].transform.position.valueAtTime(0, false);
T.check(r.ok && lampCtrl && T.near(lampCtrl.transform.position.value, [300, 360]), "a light as the root: the controller starts below it (" + r.message + ")");
T.check(T.near(dist([jl[0], jl[1]], [300, 200]), 100, 1e-6) && T.near(dist([jl[0], jl[1]], [300, 360]), 100, 1e-6), "and the joint is 100 from the light and from the controller");

T.done();
