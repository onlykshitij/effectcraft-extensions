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
var still = MotionKit.run("elastic");
T.check(still.ok && /They stop at the last keyframe/.test(still.message), "eased or Hold last keys: the message says nothing moves after them: " + still.message);

T.done();
