// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounce: overshoots past the final value, hops lower each time, returns to the final value;
// controls are shared per layer; Jump In/Out; foreign expressions; bad selections; one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("Bounce Test");
var ball = T.solid(comp, "Ball", 50, 50);
var pos = ball.transform.position, rot = ball.transform.rotation;
pos.setValueAtTime(1, [100, 300]);
pos.setValueAtTime(2, [500, 300]);
rot.setValueAtTime(1, 0);
rot.setValueAtTime(2, 90);
var fx = ball.property("ADBE Effect Parade");

// Bad selection: a property with one key. Nothing changes.
var op = ball.transform.opacity;
op.setValueAtTime(1, 100);
T.select(comp, [ball], [op]);
var bad = MotionKit.run("bounce");
T.check(!bad.ok && /at least two keyframes/.test(bad.message) && /two keyframes/.test(T.lastAlert()), "one-key property refused with an alert: " + bad.message);
T.check(fx.numProperties === 0 && op.expression === "", "a refused run changes nothing");

T.select(comp, [ball], [pos, rot]);
var r = MotionKit.run("bounce", { gravity: 2000 });
T.check(r.ok && /2 properties/.test(r.message), "bounce added: " + r.message);
T.check(pos.expression.split("\n")[0] === "// Motion Kit: bounce", "expression starts with the Motion Kit mark");
function ctrl(name) { var e = fx.property(name); return e ? e.property(1).value : undefined; }
T.check(fx.numProperties === 4, "one control set for both properties (" + fx.numProperties + " effects)");
T.check(T.near(ctrl("Bounce – Amplitude"), 0.7) && ctrl("Bounce – Gravity") === 2000 && ctrl("Bounce – Max Jumps") === 9 && !ctrl("Bounce – Jump In/Out"),
  "controls take the run's options (amplitude 0.7, gravity 2000, 9 jumps, in/out off)");
T.check(pos.expressionError === "" && rot.expressionError === "", "expressions compile");

// Between keys: unchanged.
T.check(T.near(pos.valueAtTime(1.5, false), pos.valueAtTime(1.5, true)), "between keys the value is unchanged");

// Expected hops: arriving speed 400 px/s, A = 0.7, g = 2000.
function hop(speed, tau, A, g, maxJ, minH) {
  var s = speed * A;
  for (var k = 0; k < maxJ; k++) {
    if (!(s > 0) || s * s / (2 * g) < minH) return 0;
    var d = 2 * s / g;
    if (tau < d) return s * tau - 0.5 * g * tau * tau;
    tau -= d;
    s *= A;
  }
  return 0;
}
var worst = 0, behind = 0, peaks = [], prev = 0, rising = false;
for (var t = 2; t <= 4; t += 0.004) {
  var x = pos.valueAtTime(t, false)[0] - 500;
  worst = Math.max(worst, Math.abs(x - hop(400, t - 2, 0.7, 2000, 9, 0.4)));
  if (x < -1e-6) behind++;
  if (x < prev && rising) peaks.push(prev);
  rising = x > prev;
  prev = x;
}
T.check(worst < 0.05, "x after the last key follows the hop formula (max error " + worst.toFixed(4) + " px)");
T.check(behind === 0, "the value never goes back past the final value (the floor)");
T.check(T.near(pos.valueAtTime(2.14, false)[0], 519.6, 0.01), "first hop peaks 19.6 px past the final value at t = 2.14");
T.check(peaks.length === 6, "six hops before they get lower than 0.001 of the range (" + peaks.length + ")");
var shrinking = true;
for (var i = 1; i < peaks.length; i++) if (!(peaks[i] < peaks[i - 1])) shrinking = false;
T.check(shrinking && peaks[0] === Math.max.apply(null, peaks), "the first hop is the biggest overshoot and each hop is lower");
T.check(T.near(pos.valueAtTime(5, false), [500, 300]), "it returns to the final value");
T.check(T.near(pos.valueAtTime(3, false)[1], 300), "only the direction of travel moves");
T.check(T.near(rot.valueAtTime(2 + 63 / 2000, false), 90 + 63 * 63 / 4000, 1e-3), "1D property: first hop of rotation is 0.99 degrees");

// The controls drive it.
fx.property("Bounce – Max Jumps").property(1).setValue(1);
T.check(T.near(pos.valueAtTime(2.14, false)[0], 519.6, 0.01) && T.near(pos.valueAtTime(2.378, false)[0], 500), "Max Jumps 1 keeps only the first hop");
fx.property("Bounce – Jump In/Out").property(1).setValue(1);
T.check(T.near(pos.valueAtTime(0.86, false)[0], 100 - 19.6, 0.01), "Jump In/Out mirrors the hop before the first key");
T.check(T.near(pos.valueAtTime(0.5, false)[0], 100), "before the hops the value is the first key's");

// Running again reuses the controls and keeps their values.
var again = MotionKit.run("bounce", { gravity: 9999 });
T.check(again.ok && fx.numProperties === 4 && ctrl("Bounce – Gravity") === 2000, "a second run reuses the controls (values kept)");

// A second layer gets its own controls.
var ball2 = T.solid(comp, "Ball 2", 50, 50);
ball2.transform.scale.setValueAtTime(0, [100, 100]);
ball2.transform.scale.setValueAtTime(1, [150, 150]);
T.select(comp, [ball2], [ball2.transform.scale]);
T.check(MotionKit.run("bounce").ok && ball2.property("ADBE Effect Parade").numProperties === 4, "each layer gets its own control set");

// Expressions Motion Kit didn't write: ask, keep them on "no".
op.setValueAtTime(2, 50);
op.expression = "value * 1";
T.select(comp, [ball], [op]);
T.answer = false;
var kept = MotionKit.run("bounce");
T.check(kept.ok && /Kept 1/.test(kept.message) && op.expression === "value * 1" && T.confirms.length === 1, "a foreign expression is kept when the user says no");
T.answer = true;
MotionKit.run("bounce");
T.check(op.expression.indexOf("// Motion Kit: bounce") === 0, "and replaced when the user says yes");

// One undo step.
var ball3 = T.solid(comp, "Ball 3", 50, 50);
var p3 = ball3.transform.position;
p3.setValueAtTime(0, [0, 0]);
p3.setValueAtTime(1, [100, 0]);
T.select(comp, [ball3], [p3]);
MotionKit.run("bounce");
T.check(ball3.property("ADBE Effect Parade").numProperties === 4 && p3.expression !== "", "bounce on a third layer");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(ball3.property("ADBE Effect Parade").numProperties === 0 && p3.expression === "", "one Undo removes the controls and the expression");

T.done();
