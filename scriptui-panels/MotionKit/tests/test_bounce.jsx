// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounce: overshoots past the final value by a share of the keyframes' change, hops lower each
// time, returns to the final value; eased keys; upgrading an earlier version; controls are shared
// per layer; Jump In/Out; Alt-click removal; foreign expressions; bad selections; one undo step.
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
var r = MotionKit.run("bounce", { hopHeight: 25, bounciness: 50, hopTime: 0.4, hopShortening: 20 });
T.check(r.ok && /2 properties/.test(r.message), "bounce added: " + r.message);
T.check(pos.expression.split("\n")[0] === "// Motion Kit: bounce", "expression starts with the Motion Kit mark");
function ctrl(name) { var e = fx.property(name); return e ? e.property(1).value : undefined; }
T.check(fx.numProperties === 6, "one control set for both properties (" + fx.numProperties + " effects)");
T.check(ctrl("Bounce – Amplitude") === 25 && ctrl("Bounce – Bounciness") === 50 && T.near(ctrl("Bounce – Hop Time"), 0.4) && ctrl("Bounce – Hop Shortening") === 20 && ctrl("Bounce – Max Jumps") === 9 && !ctrl("Bounce – Jump In/Out"),
  "controls take the run's options (amplitude 25 %, bounciness 50 %, hop time 0.4 s, shortening 20 %, 9 jumps, in/out off)");
T.check(pos.expressionError === "" && rot.expressionError === "", "expressions compile");

// Between keys: unchanged.
T.check(T.near(pos.valueAtTime(1.5, false), pos.valueAtTime(1.5, true)), "between keys the value is unchanged");

// Expected hops, as a share of the range: the first rises H and lasts T; each keeps K of the
// height before it and Q of the length.
function hop(tau, H, K, T0, Q, maxJ) {
  var h = H, d = T0;
  for (var k = 0; k < maxJ; k++) {
    if (h < 0.001) return 0;
    if (tau < d) return 4 * h * tau * (d - tau) / (d * d);
    tau -= d;
    h *= K;
    d *= Q;
  }
  return 0;
}
var worst = 0, behind = 0, peaks = [], prev = 0, rising = false;
for (var t = 2; t <= 4; t += 0.004) {
  var x = pos.valueAtTime(t, false)[0] - 500;
  worst = Math.max(worst, Math.abs(x - 400 * hop(t - 2, 0.25, 0.5, 0.4, 0.8, 9)));
  if (x < -1e-6) behind++;
  if (x < prev && rising) peaks.push(prev);
  rising = x > prev;
  prev = x;
}
T.check(worst < 0.05, "x after the last key follows the hop formula (max error " + worst.toFixed(4) + " px)");
T.check(behind === 0, "the value never goes back past the final value (the floor)");
T.check(T.near(pos.valueAtTime(2.2, false)[0], 600, 0.01), "the first hop rises 25 % of the 400 px change: 100 px past the final value at t = 2.2");
T.check(peaks.length === 8, "eight hops before they get lower than 0.001 of the range (" + peaks.length + ")");
var halving = true;
for (var i = 1; i < peaks.length; i++) if (!T.near(peaks[i] / peaks[i - 1], 0.5, 0.02)) halving = false;
T.check(halving, "each hop is half as high as the one before (Bounciness 50 %)");
T.check(T.near(pos.valueAtTime(5, false), [500, 300]), "it returns to the final value");
T.check(T.near(pos.valueAtTime(3, false)[1], 300), "only the direction of the last change moves");
T.check(T.near(rot.valueAtTime(2.2, false), 112.5, 1e-3), "1D property: rotation's first hop rises 25 % of its 90° change, at the same time as position's");

// The controls drive it.
fx.property("Bounce – Max Jumps").property(1).setValue(1);
T.check(T.near(pos.valueAtTime(2.2, false)[0], 600, 0.01) && T.near(pos.valueAtTime(2.56, false)[0], 500), "Max Jumps 1 keeps only the first hop");
fx.property("Bounce – Hop Time").property(1).setValue(0.8);
T.check(T.near(pos.valueAtTime(2.4, false)[0], 600, 0.01), "Hop Time 0.8 s: the first hop peaks at t = 2.4");
fx.property("Bounce – Hop Time").property(1).setValue(0.4);
fx.property("Bounce – Jump In/Out").property(1).setValue(1);
T.check(T.near(pos.valueAtTime(0.8, false)[0], 0, 0.01), "Jump In/Out mirrors the hop before the first key, against the first change");
T.check(T.near(pos.valueAtTime(0.5, false)[0], 100), "before the hops the value is the first key's");

// Running again reuses the controls and keeps their values.
var again = MotionKit.run("bounce", { hopHeight: 99 });
T.check(again.ok && fx.numProperties === 6 && ctrl("Bounce – Amplitude") === 25, "a second run reuses the controls (values kept)");
// The options dialog's OK (setControls) writes the chosen options into the layer's controls.
T.check(MotionKit.run("bounce", { hopHeight: 30, hopTime: 0.5 }, false, { setControls: true }).ok && ctrl("Bounce – Amplitude") === 30 && T.near(ctrl("Bounce – Hop Time"), 0.5),
  "a run from the options dialog's OK updates the controls the layer has");
T.check(MotionKit.run("bounce").ok && ctrl("Bounce – Amplitude") === 30, "and the next plain run keeps them");
fx.property("Bounce – Amplitude").property(1).setValue(25);
fx.property("Bounce – Hop Time").property(1).setValue(0.4);

// A second layer gets its own controls. Scale changes 50 % where position moves hundreds of
// pixels, and the default Amplitude (20 %) still bounces it by a fifth of that change.
var ball2 = T.solid(comp, "Ball 2", 50, 50), sc2 = ball2.transform.scale;
sc2.setValueAtTime(0, [100, 100]);
sc2.setValueAtTime(1, [150, 150]);
T.select(comp, [ball2], [sc2]);
T.check(MotionKit.run("bounce").ok && ball2.property("ADBE Effect Parade").numProperties === 6, "each layer gets its own control set");
T.check(T.near(sc2.valueAtTime(1.2, false)[0], 160, 0.01), "scale's first hop rises 20 % of its 50 % change: 160 at t = 1.2");

// An eased last key bounces just the same, and Bounce asks nothing: the hops come from the
// change between the keys, not the speed arriving.
var z = [], e2 = sc2.keyInTemporalEase(2);
for (var k = 0; k < e2.length; k++) z.push(new KeyframeEase(0, 33.33));
sc2.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
sc2.setTemporalEaseAtKey(2, z, z);
T.confirms = [];
var eased = MotionKit.run("bounce");
T.check(eased.ok && T.confirms.length === 0 && T.near(sc2.valueAtTime(1.2, false)[0], 160, 0.01), "an eased last key still bounces, without a question: " + eased.message);

// A layer bounced by an earlier version (Hop Gravity, and an Amplitude that was a share of speed)
// gets a fresh control set, and its other Bounce expressions this version's body.
var old = T.solid(comp, "Old", 50, 50), ofx = old.property("ADBE Effect Parade");
var oa = ofx.addProperty("ADBE Slider Control"); oa.name = "Bounce – Amplitude"; oa.property(1).setValue(0.7);
var og = ofx.addProperty("ADBE Slider Control"); og.name = "Bounce – Hop Gravity"; og.property(1).setValue(10);
old.transform.rotation.setValueAtTime(0, 0);
old.transform.rotation.setValueAtTime(1, 90);
old.transform.rotation.expression = "// Motion Kit: bounce\nvalue";
old.transform.position.setValueAtTime(0, [0, 0]);
old.transform.position.setValueAtTime(1, [100, 0]);
T.select(comp, [old], [old.transform.position]);
T.check(MotionKit.run("bounce").ok && !ofx.property("Bounce – Hop Gravity") && ofx.property("Bounce – Amplitude").property(1).value === 20 && ofx.numProperties === 6 &&
  old.transform.rotation.expression.indexOf("Bounciness") > 0 && T.near(old.transform.rotation.valueAtTime(1.2, false), 108, 1e-3),
  "an earlier version's controls are replaced and its other Bounce expressions upgraded");

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

// Alt-click (MotionKit.remove): takes Bounce off the selected property; the controls stay while
// another property on the layer uses them. With only the layer selected it takes off the rest
// and deletes the controls, leaving other expressions. One undo step.
T.select(comp, [ball], [pos]);
var off = MotionKit.remove("bounce");
T.check(off.ok && pos.expression === "" && rot.expression.indexOf("// Motion Kit: bounce") === 0 && fx.numProperties === 6 && /removed from 1 property\.$/.test(off.message),
  "Alt-click takes Bounce off the selected property; the controls stay for the others: " + off.message);
ball.transform.anchorPoint.expression = "value";
T.select(comp, [ball], []);
var rest = MotionKit.remove("bounce");
T.check(rest.ok && rot.expression === "" && op.expression === "" && fx.numProperties === 0 && ball.transform.anchorPoint.expression === "value" && /removed from 2 properties, with its controls/.test(rest.message),
  "with only the layer selected it takes off the rest and deletes the controls, leaving other expressions: " + rest.message);
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(rot.expression.indexOf("// Motion Kit: bounce") === 0 && op.expression.indexOf("// Motion Kit: bounce") === 0 && fx.numProperties === 6, "one Undo brings both back");
ball.transform.anchorPoint.expression = "";
T.select(comp, [ball2], [ball2.transform.position]);
var none = MotionKit.remove("bounce");
T.check(!none.ok && /the selected properties have no Bounce to remove/.test(none.message), "nothing to remove says so: " + none.message);
T.check(!MotionKit.remove("elastic").ok, "Elastic's removal leaves Bounce alone (nothing of Elastic's there)");

// One undo step.
var ball3 = T.solid(comp, "Ball 3", 50, 50);
var p3 = ball3.transform.position;
p3.setValueAtTime(0, [0, 0]);
p3.setValueAtTime(1, [100, 0]);
T.select(comp, [ball3], [p3]);
MotionKit.run("bounce");
T.check(ball3.property("ADBE Effect Parade").numProperties === 6 && p3.expression !== "", "bounce on a third layer");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(ball3.property("ADBE Effect Parade").numProperties === 0 && p3.expression === "", "one Undo removes the controls and the expression");

T.done();
