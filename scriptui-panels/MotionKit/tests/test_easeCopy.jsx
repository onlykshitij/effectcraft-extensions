// SPDX-License-Identifier: MIT OR Apache-2.0
// Ease Copy: the first click copies a keyframe (ease, interpolation, value, expression) and
// shows the button's dot; later clicks paste onto every selected keyframe of every selected
// property, reusing the first dimension's ease across dimension counts; speeds scale to each
// target segment's average speed (direction and units too), older clipboards paste raw speeds;
// each paste option; values only onto the same type; Clear Clipboard in the options; bad
// selections; one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var LIN = KeyframeInterpolationType.LINEAR, BEZ = KeyframeInterpolationType.BEZIER, HOLD = KeyframeInterpolationType.HOLD;
var tool = MotionKit.tools.easeCopy;
MotionKit.settings.set("easeCopy", null);

var comp = T.comp("Ease Copy Test");
var src = T.solid(comp, "Source", 50, 50), dst = T.solid(comp, "Target", 50, 50);
var so = src.transform.opacity;
so.setValueAtTime(1, 0);
so.setValueAtTime(2, 70);
so.setValueAtTime(3, 20);
so.setTemporalEaseAtKey(2, [new KeyframeEase(10, 60)], [new KeyframeEase(-30, 25)]);
so.setInterpolationTypeAtKey(2, BEZ, HOLD);
so.expression = "value * 0.5";

function keys(list) {
  T.select(comp, [], []);
  for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i][1].length; j++) list[i][0].setSelectedAtKey(list[i][1][j], true);
}
function easeIs(e, speed, influence) { return T.near(e.speed, speed, 1e-6) && T.near(e.influence, influence, 1e-6); }

// ---- nothing selected, nothing copied
T.select(comp, [src], []);
var bad = MotionKit.run("easeCopy");
T.check(!bad.ok && /select a keyframe to copy/.test(T.lastAlert()) && !tool.dot(), "no keyframes and an empty clipboard: refused, nothing copied");

// ---- copy
keys([[so, [2, 3]]]);
var r = MotionKit.run("easeCopy");
T.check(r.ok && /copied keyframe 2 of "Opacity" on Source/.test(r.message), "the first click copies the first selected keyframe: " + r.message);
T.check(tool.dot(), "the button shows its dot while something is copied");
var c = MotionKit.settings.get("easeCopy");
T.check(c.value === 70 && easeIs(c.inEase[0], 10, 60) && easeIs(c.outEase[0], -30, 25) && c.inInterp === BEZ && c.outInterp === HOLD && c.expression === "value * 0.5",
  "it keeps the value, both eases, the interpolation types and the expression");
T.check(c.version === 2 && T.near(c.inEase[0].ratio, 10 / 70, 1e-9) && T.near(c.outEase[0].ratio, 0.6, 1e-9),
  "and each speed as a multiple of its segment's average speed (in: 10 of 70 %/s, out: -30 of -50 %/s)");

// ---- paste with the defaults (easing and interpolation)
var rot = dst.transform.rotation, sc = dst.transform.scale, pos = dst.transform.position;
rot.setValueAtTime(1, 0);
rot.setValueAtTime(2, 90);
rot.setValueAtTime(3, 180);
sc.setValueAtTime(1, [100, 100]);
sc.setValueAtTime(2, [150, 150]);
pos.setValueAtTime(1, [0, 0]);
pos.setValueAtTime(2, [100, 0]);
keys([[rot, [2, 3]], [sc, [1]], [pos, [2]]]);
r = MotionKit.run("easeCopy");
T.check(r.ok && /onto 4 keyframes on 3 properties/.test(r.message), "a later click pastes: " + r.message);
T.check(easeIs(rot.keyInTemporalEase(2)[0], 90 / 7, 60) && easeIs(rot.keyOutTemporalEase(2)[0], 54, 25) && rot.keyInInterpolationType(3) === BEZ && rot.keyOutInterpolationType(2) === HOLD,
  "eases and interpolation types land on each selected keyframe, speeds scaled to rotation's 90 degrees/s segments");
T.check(easeIs(rot.keyOutTemporalEase(3)[0], -30, 25), "a side with no segment (the last key's out) gets the raw speed");
var se = sc.keyInTemporalEase(1), sx = sc.keyOutTemporalEase(1);
T.check(se.length === 3 && easeIs(se[0], 10, 60) && easeIs(se[2], 10, 60) && easeIs(sx[0], 30, 25) && easeIs(sx[1], 30, 25) && easeIs(sx[2], 0, 25),
  "scale (3 ease dimensions) reuses the copied first dimension's ease, scaled per dimension (50, 50, 0 %/s)");
T.check(pos.keyOutTemporalEase(2).length === 1 && easeIs(pos.keyInTemporalEase(2)[0], 100 / 7, 60), "position (one spatial ease) gets it too, along its 100 px/s path");
T.check(rot.keyInInterpolationType(1) === LIN && T.near(rot.keyValue(2), 90) && rot.expression === "", "unselected keys, values and the expression stay as they were");
T.check(tool.dot(), "the clipboard stays for more pastes");

// ---- values (same type only) and the expression
var op = dst.transform.opacity;
op.setValueAtTime(1, 10);
op.setValueAtTime(2, 20);
keys([[op, [2]], [sc, [2]]]);
r = MotionKit.run("easeCopy", { values: true, expression: true });
T.check(T.near(op.keyValue(2), 70) && T.near(sc.keyValue(2), [150, 150]) && /Values skipped on 1 of another type/.test(r.message), "values paste onto the same type only: " + r.message);
T.check(op.expression === "value * 0.5" && sc.expression === "value * 0.5", "the expression pastes onto each property");

// ---- easing without interpolation keeps the target's types; interpolation alone keeps eases
var sk = T.solid(comp, "Extra", 20, 20).transform.opacity;
sk.setValueAtTime(1, 0);
sk.setValueAtTime(2, 10);
keys([[sk, [1]]]);
MotionKit.run("easeCopy", { interp: false });
T.check(sk.keyOutInterpolationType(1) === LIN && sk.keyInInterpolationType(1) === LIN, "Easing without Interpolation keeps the target's Linear types");
sk.setInterpolationTypeAtKey(1, LIN, BEZ);
T.check(easeIs(sk.keyOutTemporalEase(1)[0], 6, 25), "but stores the ease (0.6 x 10 %/s), which shows once the side is Bezier (EffectCraft reports a Linear side's ease as linear)");
var ra = dst.transform.anchorPoint;
ra.setValueAtTime(1, [25, 25]);
ra.setValueAtTime(2, [30, 30]);
var rd = ra.keyInTemporalEase(2).length, mine = [];
for (var d = 0; d < rd; d++) mine.push(new KeyframeEase(5, 40));
ra.setTemporalEaseAtKey(2, mine, mine);
ra.setInterpolationTypeAtKey(2, LIN, LIN);
keys([[ra, [2]]]);
MotionKit.run("easeCopy", { easing: false });
T.check(ra.keyInInterpolationType(2) === BEZ && ra.keyOutInterpolationType(2) === HOLD && easeIs(ra.keyInTemporalEase(2)[0], 5, 40), "Interpolation without Easing: types pasted, eases kept");
T.check(!MotionKit.run("easeCopy", { values: false, easing: false, interp: false, expression: false }).ok && /at least one/.test(T.lastAlert()), "with every paste option off it says so");

// ---- no keyframes selected while something is copied
T.select(comp, [dst], []);
T.check(!MotionKit.run("easeCopy").ok && /select keyframes to paste onto/.test(T.lastAlert()), "pasting needs selected keyframes");

// ---- one undo step
keys([[rot, [1]]]);
MotionKit.run("easeCopy");
T.check(rot.keyOutInterpolationType(1) === HOLD, "pasted onto rotation key 1");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(rot.keyOutInterpolationType(1) === LIN, "one Undo reverts the paste");

// ---- Clear Clipboard in the options dialog (built, not shown)
var od = MotionKit.optionsDialog.build(tool, MotionKit.options.get("easeCopy"));
var clearBtn = null, info = null;
(function walk(x) {
  if (x.type === "button" && x.text === "Clear Clipboard") clearBtn = x;
  if (x.type === "statictext" && /^Copied:/.test(x.text)) info = x;
  for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
})(od.win);
T.check(clearBtn && clearBtn.enabled && /keyframe 2 of "Opacity" on Source/.test(info.text), "the options show what is copied: " + (info && info.text));
T.check(od.inputs.easing.control.value === true && od.inputs.values.control.value === false, "and the paste checkboxes (defaults: easing on, values off)");
clearBtn.notify("onClick");
T.check(!tool.dot() && MotionKit.settings.get("easeCopy") === null && info.text === "Copied: empty" && !clearBtn.enabled, "Clear Clipboard empties it and the dot goes");
keys([[rot, [3]]]);
r = MotionKit.run("easeCopy");
T.check(r.ok && /copied keyframe 3 of "Rotation" on Target/.test(r.message), "the next click copies again");
MotionKit.settings.set("easeCopy", null);

// ---- speeds fit the target segment: a fade-in arriving at 1.5 x its average speed, pasted onto
// a fade-out and a small Scale change, arrives at 1.5 x theirs, with no dip or overshoot
MotionKit.settings.set("easeCopy", null);
var fin = T.solid(comp, "Fade In", 20, 20).transform.opacity, fout = T.solid(comp, "Fade Out", 20, 20).transform.opacity, grow = T.solid(comp, "Grow", 20, 20).transform.scale;
fin.setValueAtTime(0, 0);
fin.setValueAtTime(1, 100);
fin.setTemporalEaseAtKey(2, [new KeyframeEase(150, 50)], [new KeyframeEase(150, 50)]);
fout.setValueAtTime(0, 100);
fout.setValueAtTime(1, 0);
grow.setValueAtTime(0, [100, 100]);
grow.setValueAtTime(1, [110, 110]);
keys([[fin, [2]]]);
MotionKit.run("easeCopy");
keys([[fout, [2]], [grow, [2]]]);
MotionKit.run("easeCopy");
var gi = grow.keyInTemporalEase(2), lo = Infinity, hi = -Infinity, glo = Infinity, ghi = -Infinity;
for (var t = 0; t <= 1.0001; t += 0.02) {
  lo = Math.min(lo, fout.valueAtTime(t, false));
  hi = Math.max(hi, fout.valueAtTime(t, false));
  glo = Math.min(glo, grow.valueAtTime(t, false)[0]);
  ghi = Math.max(ghi, grow.valueAtTime(t, false)[0]);
}
T.check(easeIs(fout.keyInTemporalEase(2)[0], -150, 50) && easeIs(gi[0], 15, 50) && easeIs(gi[1], 15, 50), "the fade-out arrives at -150 %/s, the scale at 15 %/s");
T.check(lo >= -1e-6 && hi <= 100 + 1e-6 && glo >= 100 - 1e-6 && ghi <= 110 + 1e-6, "and both stay within their keys (fade-out " + lo.toFixed(3) + ".." + hi.toFixed(3) + ", scale " + glo.toFixed(3) + ".." + ghi.toFixed(3) + ")");

// ---- a clipboard from before version 2 (no ratios) pastes its raw speeds, as it used to
MotionKit.settings.set("easeCopy", { from: "\"Opacity\" on Old", key: 2, valueType: so.propertyValueType, value: 70,
  inEase: [{ speed: 10, influence: 60 }], outEase: [{ speed: -30, influence: 25 }], inInterp: BEZ, outInterp: BEZ, expression: "" });
keys([[fout, [1]]]);
r = MotionKit.run("easeCopy");
T.check(r.ok && /pasted/.test(r.message) && easeIs(fout.keyOutTemporalEase(1)[0], -30, 25), "an older clipboard pastes its speeds as they are");
MotionKit.settings.set("easeCopy", null);

T.done();
