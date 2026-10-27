// SPDX-License-Identifier: MIT OR Apache-2.0
// Fix Keys Time: keys left between frames (here by changing the comp's frame rate) snap to the
// nearest comp frame, with the layer's start time counted; value, ease and interpolation are
// kept; keys landing on one frame merge and the later one wins; each scope (selected keys,
// selected properties, selected layers including effects); roving keys stay, also between keys
// that move; the report;
// bad selections; one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var LIN = KeyframeInterpolationType.LINEAR, BEZ = KeyframeInterpolationType.BEZIER;
var comp = T.comp("Fix Test");
var A = T.solid(comp, "A", 40, 40), B = T.solid(comp, "B", 40, 40), C = T.solid(comp, "C", 40, 40);
var ao = A.transform.opacity, ar = A.transform.rotation, bo = B.transform.opacity;
ao.setValueAtTime(1, 10);
ao.setValueAtTime(1.04, 20);
ao.setValueAtTime(2, 30);
ao.setTemporalEaseAtKey(2, [new KeyframeEase(0, 20)], [new KeyframeEase(15, 80)]);
ao.setInterpolationTypeAtKey(2, LIN, BEZ);
ar.setValueAtTime(1.12, 0);
ar.setValueAtTime(2.2, 45);
B.startTime = 0.04;
bo.setValueAtTime(1.08, 5);
bo.setValueAtTime(2.04, 50);
var slider = MotionKit.helpers.controls.slider(B, "Test – Slider", 0).property(1);
slider.setValueAtTime(1.08, 1);
slider.setValueAtTime(2, 2);
var cp = C.transform.position;
cp.setValueAtTime(0, [0, 0]);
cp.setValueAtTime(1, [100, 0]);
cp.setValueAtTime(2, [100, 100]);
cp.setInterpolationTypeAtKey(2, BEZ, BEZ);
cp.setRovingAtKey(2, true);
// 25 fps -> 30 fps: keys at 1.04, 1.08, 1.12 and 2.04 s now sit between frames.
comp.frameRate = 30;
var F = comp.frameDuration;
function onFrame(t) { return Math.abs(t / F - Math.round(t / F)) < 1e-4; }
function keys(list) {
  T.select(comp, [], []);
  for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i][1].length; j++) list[i][0].setSelectedAtKey(list[i][1][j], true);
}
T.check(!onFrame(ao.keyTime(2)) && !onFrame(bo.keyTime(1)) && T.near(bo.keyTime(1), 1.08, 1e-9), "set-up: keys between frames, B's keys in comp time (start time 0.04)");

// ---- bad selection
T.select(comp, [], []);
var bad = MotionKit.run("fixKeys");
T.check(!bad.ok && /select layers with keyframes/.test(T.lastAlert()), "nothing selected: refused with an alert");

// ---- selected keys only (the default scope picks them)
keys([[ao, [2]]]);
var r = MotionKit.run("fixKeys");
T.check(r.ok && /moved 1 keyframe onto frames on 1 property/.test(r.message), "reports what moved: " + r.message);
T.check(ao.numKeys === 3 && T.near(ao.keyTime(2), 31 * F, 1e-9) && T.near(ao.keyValue(2), 20), "the selected key snaps to the nearest frame (31) with its value");
var ie = ao.keyInTemporalEase(2)[0], oe = ao.keyOutTemporalEase(2)[0];
T.check(ao.keyInInterpolationType(2) === LIN && ao.keyOutInterpolationType(2) === BEZ && T.near(oe.speed, 15) && T.near(oe.influence, 80), "and keeps its interpolation and ease");
T.check(ao.keySelected(2), "it stays selected");
T.check(!onFrame(ar.keyTime(1)) && !onFrame(bo.keyTime(1)), "keys that weren't selected stay where they were");

// ---- all keys of the selected properties
T.select(comp, [], [ar]);
r = MotionKit.run("fixKeys", { scope: "props" });
T.check(T.near(ar.keyTime(1), 34 * F, 1e-9) && T.near(ar.keyTime(2), 2.2, 1e-9) && /moved 1 keyframe/.test(r.message), "properties: 1.12 s -> frame 34; 2.2 s was on a frame already");

// ---- all keys of the selected layers, effects included, start time counted
T.select(comp, [B], []);
r = MotionKit.run("fixKeys");
T.check(/moved 3 keyframes onto frames on 2 properties/.test(r.message), "layers (the fallback when no keys or properties are selected): " + r.message);
T.check(T.near(bo.keyTime(1), 32 * F, 1e-9) && T.near(bo.keyTime(2), 61 * F, 1e-9) && T.near(slider.keyTime(1), 32 * F, 1e-9) && T.near(slider.keyTime(2), 2, 1e-9),
  "the layer's keys snap to comp frames (1.08 -> 32, 2.04 -> 61), effect keys too");
T.check(T.near(bo.keyValue(1), 5) && T.near(bo.keyValue(2), 50), "values are kept");
r = MotionKit.run("fixKeys");
T.check(r.ok && /already on frames/.test(r.message), "a second run finds nothing to fix: " + r.message);

// ---- roving keys stay roving
var rt = cp.keyTime(2);
T.select(comp, [C], []);
r = MotionKit.run("fixKeys");
T.check(cp.keyRoving(2) && T.near(cp.keyTime(2), rt) && /already on frames/.test(r.message), "a roving key is left to EffectCraft (" + rt.toFixed(4) + " s)");
// Its neighbours move: removing them would end its roving, so it is rewritten and roves again.
var comp4 = T.comp("Fix Roving", 200, 200, 10, 25);
var RL = T.solid(comp4, "R", 20, 20), rp = RL.transform.position;
rp.setValueAtTime(0.44, [0, 0]);
rp.setValueAtTime(1, [100, 0]);
rp.setValueAtTime(2.08, [100, 100]);
rp.setInterpolationTypeAtKey(2, BEZ, BEZ);
rp.setRovingAtKey(2, true);
comp4.frameRate = 30;
T.select(comp4, [RL], []);
r = MotionKit.run("fixKeys");
T.check(/moved 2 keyframes/.test(r.message) && rp.numKeys === 3 && onFrame(rp.keyTime(1)) && onFrame(rp.keyTime(3)), "the keys around a roving key snap: " + r.message);
T.check(rp.keyRoving(2) && rp.keyTime(2) > rp.keyTime(1) && rp.keyTime(3) > rp.keyTime(2) && T.near(rp.keyValue(2), [100, 0]),
  "and the roving key between them still roves (" + rp.keyTime(2).toFixed(4) + " s)");

// ---- merging: the later key wins
var comp2 = T.comp("Fix Merge", 200, 200, 10, 25);
var M = T.solid(comp2, "M", 20, 20), mo = M.transform.opacity;
mo.setValueAtTime(1, 10);
mo.setValueAtTime(1.04, 20);
mo.setValueAtTime(1.12, 30);
mo.setValueAtTime(1.96, 5);
mo.setValueAtTime(2, 6);
comp2.frameRate = 10;
T.select(comp2, [M], []);
r = MotionKit.run("fixKeys");
T.check(/moved 3 keyframes/.test(r.message) && /2 merged/.test(r.message), "moved and merged counts: " + r.message);
T.check(mo.numKeys === 3 && T.near(mo.keyTime(1), 1, 1e-9) && T.near(mo.keyValue(1), 20), "1.04 s lands on 1.0 s's frame and wins (it is later)");
T.check(T.near(mo.keyTime(2), 1.1, 1e-9) && T.near(mo.keyValue(2), 30), "1.12 s moves to 1.1 s");
T.check(T.near(mo.keyTime(3), 2, 1e-9) && T.near(mo.keyValue(3), 6), "1.96 s lands on 2.0 s's key, which is later and wins");

// ---- one undo step
var comp3 = T.comp("Fix Undo", 200, 200, 10, 25);
var U3 = T.solid(comp3, "U", 20, 20), uo = U3.transform.opacity;
uo.setValueAtTime(1.04, 1);
uo.setValueAtTime(2.04, 2);
comp3.frameRate = 30;
T.select(comp3, [U3], []);
MotionKit.run("fixKeys");
T.check(onFrame(uo.keyTime(1)) && onFrame(uo.keyTime(2)), "fixed");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(T.near(uo.keyTime(1), 1.04, 1e-9) && T.near(uo.keyTime(2), 2.04, 1e-9), "one Undo puts the keys back");

T.done();
