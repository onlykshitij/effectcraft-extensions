// SPDX-License-Identifier: MIT OR Apache-2.0
// Sequencer: layer in-points staggered for each order (top to bottom, bottom to top, from the
// centre with odd and even counts, selection, seeded random: same seed same order), each curve,
// several items per step, negative and fractional steps rounded to frames, keyframes moving
// with their layer; Keyframes mode moves each layer's selected keys together; the Reseed
// button; bad selections; one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var LIN = KeyframeInterpolationType.LINEAR, BEZ = KeyframeInterpolationType.BEZIER;
var comp = T.comp("Sequencer Test"), F = comp.frameDuration;
var L = [];
for (var n = 1; n <= 5; n++) L.push(T.solid(comp, "L" + n, 40, 40));
// Index 1 is L5 (made last), index 5 is L1.
function byIdx(i) { return comp.layer(i); }
var starts = [1, 0.2, 3, 0, 0.6];
function reset() { for (var i = 1; i <= 5; i++) byIdx(i).startTime = starts[i - 1]; }
reset();
// In-points by layer index, relative to the given base, in frames.
function frames(base) {
  var out = [];
  for (var i = 1; i <= 5; i++) out.push(Math.round((byIdx(i).inPoint - base) / F * 1000) / 1000);
  return out.join(",");
}
function run(opts, layers) {
  T.select(comp, layers || L, []);
  return MotionKit.run("sequencer", opts);
}
var op2 = byIdx(2).transform.opacity;
op2.setValueAtTime(0.6, 0);
op2.setValueAtTime(1, 100);

// ---- orders
var r = run({ order: "topDown", step: 2 });
T.check(r.ok && /placed 5 layers top to bottom/.test(r.message), "runs: " + r.message);
T.check(frames(1) === "0,2,4,6,8", "top to bottom: the top layer keeps its in-point, each next one 2 frames later (" + frames(1) + ")");
T.check(T.near(op2.keyTime(1), 1.08 + 0.4) && T.near(op2.keyTime(2), 1.08 + 0.8), "keyframes move with their layer's start time");
T.check(byIdx(3).startTime === byIdx(3).inPoint && T.near(byIdx(3).outPoint - byIdx(3).inPoint, 10), "the in- and out-points move together");
reset();
run({ order: "bottomUp", step: 2 });
T.check(frames(0.6) === "8,6,4,2,0", "bottom to top: the bottom layer keeps its in-point (" + frames(0.6) + ")");
reset();
run({ order: "selection", step: 3 }, [byIdx(4), byIdx(1), byIdx(5)]);
T.check(frames(0) === "3,5,75,0,6", "selection order: the first selected keeps its time, the others 3 and 6 frames later; unselected layers stay (" + frames(0) + ")");

// ---- random, seeded
function order() {
  var a = [];
  for (var i = 1; i <= 5; i++) a.push([byIdx(i).inPoint, byIdx(i).name]);
  a.sort(function (x, y) { return x[0] - y[0]; });
  var out = [];
  for (var j = 0; j < a.length; j++) out.push(a[j][1]);
  return out.join(",");
}
function spread() {
  var a = [];
  for (var i = 1; i <= 5; i++) a.push(Math.round(byIdx(i).inPoint / F));
  a.sort(function (x, y) { return x - y; });
  var ok = true;
  for (var k = 1; k < 5; k++) if (a[k] - a[0] !== 2 * k) ok = false;
  return ok;
}
reset();
run({ order: "random", seed: 1, step: 2 });
var o1 = order();
T.check(spread(), "random: every layer gets its own slot, 2 frames apart (" + o1 + ")");
reset();
run({ order: "random", seed: 1, step: 2 });
T.check(order() === o1, "the same seed gives the same order");
reset();
run({ order: "random", seed: 7, step: 2 });
var o7 = order();
T.check(spread() && o7 !== o1, "another seed gives another order (" + o7 + ")");

// ---- curves and steps
reset();
run({ order: "topDown", step: 4, curve: "easeIn" });
T.check(frames(1) === "0,1,4,9,16", "ease in: span 16 frames, offsets 16 (i/4)^2 (" + frames(1) + ")");
reset();
run({ order: "topDown", step: 4, curve: "easeOut" });
T.check(frames(1) === "0,7,12,15,16", "ease out (" + frames(1) + ")");
reset();
run({ order: "topDown", step: 4, curve: "easeInOut" });
T.check(frames(1) === "0,2,8,14,16", "ease in-out (" + frames(1) + ")");
reset();
run({ order: "topDown", step: -2, curve: "linear" });
T.check(frames(1) === "0,-2,-4,-6,-8", "a negative step goes earlier (" + frames(1) + ")");
reset();
run({ order: "topDown", step: 1.5 }, [byIdx(1), byIdx(2), byIdx(3)]);
T.check(frames(1).indexOf("0,2,3,") === 0, "a fractional step is rounded to whole frames (1.5 x 2 -> 0, 2, 3)");
// ---- items per step, and the centre order
reset();
r = run({ order: "topDown", step: 2, group: 2, curve: "linear" });
T.check(frames(1) === "0,0,2,2,4" && /2 per step/.test(r.message), "2 items per step: pairs share a time, 2 frames per step (" + frames(1) + ")");
reset();
run({ order: "bottomUp", step: 1, group: 3 });
T.check(frames(0.6) === "1,1,0,0,0", "3 per step from the bottom: the bottom three share the first step, the top two the second (" + frames(0.6) + ")");
reset();
r = run({ order: "centre", step: 3, group: 1 });
T.check(frames(3) === "6,3,0,3,6" && /from the centre/.test(r.message), "from the centre, 5 layers: the middle keeps its time, both sides move alike (" + frames(3) + ")");
reset();
run({ order: "centre", step: 3, group: 1 }, [byIdx(1), byIdx(2), byIdx(3), byIdx(4)]);
T.check(frames(0.2) === "3,0,0,3,10", "from the centre, 4 layers: the two middle ones share the first's time (" + frames(0.2) + ")");
reset();
run({ order: "centre", step: 2, group: 2 });
T.check(frames(3) === "2,0,0,0,2", "from the centre, 2 per step (" + frames(3) + ")");
reset();
run({ order: "centre", step: 4, curve: "easeIn", group: 1 });
T.check(frames(3) === "8,2,0,2,8", "curves apply to the centre order too (" + frames(3) + ")");
reset();
run({ order: "topDown", step: 1.5 }, [byIdx(1), byIdx(2), byIdx(3)]);
var back = MotionKit.run("sequencer", { step: 0 });
T.check(back.ok && frames(1).indexOf("0,0,0,") === 0, "step 0 lines them up on the first");

// ---- Keyframes mode
var A = byIdx(1), B = byIdx(3);
var ao = A.transform.opacity, bo = B.transform.opacity, bp = B.transform.position;
A.startTime = 0;
B.startTime = 0;
ao.setValueAtTime(1, 0);
ao.setValueAtTime(1.2, 50);
ao.setValueAtTime(1.6, 100);
bo.setValueAtTime(2, 10);
bo.setValueAtTime(2.4, 90);
bo.setTemporalEaseAtKey(1, [new KeyframeEase(0, 20)], [new KeyframeEase(0, 70)]);
bo.setInterpolationTypeAtKey(1, LIN, BEZ);
bp.setValueAtTime(2.2, [10, 20]);
bp.setValueAtTime(3, [300, 20]);
T.select(comp, [], []);
ao.setSelectedAtKey(2, true);
ao.setSelectedAtKey(3, true);
bo.setSelectedAtKey(1, true);
bo.setSelectedAtKey(2, true);
bp.setSelectedAtKey(1, true);
r = MotionKit.run("sequencer", { mode: "keys", order: "topDown", step: 2, curve: "linear" });
T.check(r.ok && /2 layers' keyframes/.test(r.message), "Keyframes mode runs: " + r.message);
T.check(T.near(ao.keyTime(1), 1) && T.near(ao.keyTime(2), 1.2) && T.near(ao.keyTime(3), 1.6), "the first layer's keys keep their times");
T.check(bo.numKeys === 2 && T.near(bo.keyTime(1), 1.28) && T.near(bo.keyTime(2), 1.68) && T.near(bp.keyTime(1), 1.48) && T.near(bp.keyTime(2), 3),
  "the next layer's selected keys move together: earliest to 2 frames after the first's, spacing kept, unselected keys stay");
T.check(T.near(bo.keyValue(1), 10) && bo.keyInInterpolationType(1) === LIN && bo.keyOutInterpolationType(1) === BEZ && T.near(bo.keyOutTemporalEase(1)[0].influence, 70),
  "moved keys keep their value, interpolation and ease");
T.check(bo.keySelected(1) && bo.keySelected(2) && bp.keySelected(1) && !bp.keySelected(2), "moved keys stay selected");
T.select(comp, [], []);
ao.setSelectedAtKey(1, true);
T.check(!MotionKit.run("sequencer", { mode: "keys" }).ok && /two or more layers/.test(T.lastAlert()), "Keyframes mode with keys on one layer: refused");

// ---- bad selections and undo
T.check(!run({ mode: "layers" }, [A]).ok && /select two or more layers/.test(T.lastAlert()), "one layer: refused with an alert");
reset();
var before = frames(0);
run({ order: "topDown", step: 2 });
T.check(frames(0) !== before, "sequenced again");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(frames(0) === before, "one Undo puts every layer back");

// ---- the Reseed button (options dialog built, not shown)
var od = MotionKit.optionsDialog.build(MotionKit.tools.sequencer, MotionKit.options.get("sequencer"));
var reseed = null, seedEdit = null;
(function walk(x) {
  if (x.type === "button" && x.text === "Reseed") reseed = x;
  if (x.type === "edittext" && x.parent && x.parent.parent === od.inputs.seed.control) seedEdit = x;
  for (var i = 0; i < (x.children || []).length; i++) walk(x.children[i]);
})(od.win);
T.check(reseed && seedEdit && seedEdit.text === "1", "the options show the seed (default 1) with a Reseed button");
T.check(od.inputs.group.control.text === "1" && od.inputs.order.control.items.length === 5 && od.inputs.order.control.items[2].text === "From the centre", "and Items per step, and the centre order");
seedEdit.text = "0";
reseed.notify("onClick");
var s = Number(seedEdit.text);
T.check(s >= 1 && s <= 99999 && Math.round(s) === s, "Reseed picks a new whole-number seed (" + seedEdit.text + ")");
seedEdit.text = "x";
T.check(od.read().errors.length === 1 && /whole number/.test(od.read().errors[0]), "a seed that isn't a number is refused");

T.done();
