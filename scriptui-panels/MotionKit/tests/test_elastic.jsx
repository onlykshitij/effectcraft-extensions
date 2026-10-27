// SPDX-License-Identifier: MIT OR Apache-2.0
// Elastic: a damped sine after the last key that follows the formula and decays; Jump In/Out.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("Elastic Test");
var box = T.solid(comp, "Box", 80, 80);
var pos = box.transform.position, scl = box.transform.scale;
pos.setValueAtTime(1, [100, 300]);
pos.setValueAtTime(2, [500, 300]);
scl.setValueAtTime(1, [100, 100]);
scl.setValueAtTime(2, [200, 200]);
var fx = box.property("ADBE Effect Parade");

T.select(comp, [box], []);
var bad = MotionKit.run("elastic");
T.check(!bad.ok && fx.numProperties === 0, "no selected properties: refused, nothing added (" + bad.message + ")");

T.select(comp, [box], [pos, scl]);
var r = MotionKit.run("elastic");
T.check(r.ok && /2 properties/.test(r.message), "elastic added: " + r.message);
T.check(fx.numProperties === 4 && T.near(fx.property("Elastic – Amplitude").property(1).value, 0.06) &&
  fx.property("Elastic – Frequency").property(1).value === 2.5 && fx.property("Elastic – Decay").property(1).value === 6,
  "controls with the defaults (0.06, 2.5 Hz, 6)");
T.check(pos.expression.indexOf("// Motion Kit: elastic") === 0 && pos.expressionError === "", "marked expression that compiles");

function wave(tau) { return 0.06 * Math.sin(2 * Math.PI * 2.5 * tau) / Math.exp(6 * tau); }
var worst = 0, lo = 0, hi = 0, ext = [], prev = 0, prevD = 0;
for (var t = 2.002; t <= 4; t += 0.002) {
  var x = pos.valueAtTime(t, false)[0] - 500;
  worst = Math.max(worst, Math.abs(x - 400 * wave(t - 2)));
  lo = Math.min(lo, x);
  hi = Math.max(hi, x);
  var dx = x - prev;
  if (dx * prevD < 0) ext.push(Math.abs(prev));
  prevD = dx;
  prev = x;
}
T.check(worst < 1e-3, "follows value + v * A * sin(2 pi f t) / exp(d t) (max error " + worst.toExponential(2) + ")");
T.check(hi > 10 && lo < -1, "it overshoots and swings back past the final value (" + hi.toFixed(2) + ", " + lo.toFixed(2) + ")");
var decays = ext.length >= 3;
for (var i = 1; i < ext.length; i++) if (!(ext[i] < ext[i - 1])) decays = false;
T.check(decays, "each swing is smaller than the last (" + ext.length + " swings)");
T.check(T.near(pos.valueAtTime(5, false), [500, 300], 1e-4), "it settles on the final value");
T.check(T.near(scl.valueAtTime(2.1, false), [200 + 100 * wave(0.1), 200 + 100 * wave(0.1)], 1e-3), "2D: scale wobbles along its velocity");
T.check(T.near(pos.valueAtTime(1.5, false), [300, 300]), "between keys the value is unchanged");
T.check(T.near(pos.valueAtTime(0.9, false), [100, 300]), "before the first key nothing happens with Jump In/Out off");

fx.property("Elastic – Jump In/Out").property(1).setValue(1);
T.check(T.near(pos.valueAtTime(0.9, false)[0], 100 - 400 * wave(0.1), 1e-3), "Jump In/Out mirrors the wobble before the first key");
fx.property("Elastic – Decay").property(1).setValue(0);
T.check(T.near(pos.valueAtTime(2.1, false)[0], 500 + 400 * 0.06 * Math.sin(2 * Math.PI * 2.5 * 0.1), 1e-3), "the Decay control drives it");

// Key i of prop eased to a stop on both sides (Easy Ease: speed 0), as the timeline's Easy Ease does.
function easeStop(prop, i) {
  var z = [], e = prop.keyInTemporalEase(i);
  for (var k = 0; k < e.length; k++) z.push(new KeyframeEase(0, 33.33));
  prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(i, z, z);
}
// Position eased to a stop and scale on Hold: both stop at the last key, so the note counts both.
easeStop(pos, pos.numKeys);
scl.setInterpolationTypeAtKey(scl.numKeys, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
T.select(comp, [box], [pos, scl]);
T.answer = false;
var still = MotionKit.run("elastic");
T.check(still.ok && /They stop at the last keyframe/.test(still.message), "eased or Hold last keys, Linear declined: the message says nothing moves after them: " + still.message);
T.answer = true;
var lin = MotionKit.run("elastic");
T.check(lin.ok && /1 of them stop/.test(lin.message) && /Made one last keyframe arrive Linear/.test(lin.message) && pos.keyInInterpolationType(pos.numKeys) === KeyframeInterpolationType.LINEAR &&
  scl.keyInInterpolationType(scl.numKeys) === KeyframeInterpolationType.HOLD, "on yes the eased key arrives Linear; the Hold one is left alone: " + lin.message);

// A Hold segment (the key before holds) or an unchanged last segment also arrives at rest: the
// note says so, and there's no Linear question (a Linear arrival wouldn't help).
var held = T.solid(comp, "Held", 40, 40), hp = held.transform.position;
hp.setValueAtTime(0, [100, 100]);
hp.setValueAtTime(1, [300, 100]);
hp.setValueAtTime(2, [700, 100]);
hp.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);
var same = held.transform.rotation;
same.setValueAtTime(0, 0);
same.setValueAtTime(1, 45);
same.setValueAtTime(2, 45);
T.select(comp, [held], [hp, same]);
T.confirms = [];
var hr = MotionKit.run("elastic");
T.check(hr.ok && /They stop at the last keyframe/.test(hr.message) && T.confirms.length === 0 && T.near(hp.valueAtTime(2.1, false)[0], 700), "after a Hold segment or no change: the note, no Linear question: " + hr.message);

// A camera in the selection is skipped up front (it can't hold controls); the solid still gets Elastic.
var cam = comp.layers.addCamera("Cam", [200, 200]), cp = cam.transform.position;
cp.setValueAtTime(0, [0, 0, -500]);
cp.setValueAtTime(1, [100, 0, -500]);
var solo = T.solid(comp, "Solo", 40, 40), sp = solo.transform.position;
sp.setValueAtTime(0, [0, 0]);
sp.setValueAtTime(1, [400, 0]);
T.select(comp, [cam, solo], [cp, sp]);
var cr = MotionKit.run("elastic");
T.check(cr.ok && /Skipped 1 on cameras or lights/.test(cr.message) && sp.expression.indexOf("// Motion Kit: elastic") === 0 && cp.expression === "", "a camera is skipped and named; the solid gets Elastic: " + cr.message);
T.select(comp, [cam], [cp]);
var co = MotionKit.run("elastic");
T.check(!co.ok && /cameras and lights can't hold Elastic's controls/.test(co.message) && cp.expression === "", "only a camera selected: refused, nothing changed: " + co.message);

T.done();
