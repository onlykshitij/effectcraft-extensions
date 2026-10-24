// SPDX-License-Identifier: MIT OR Apache-2.0
// Widgets in the combined panel, driven through EffectCraft's ScriptUI mouse routing as a user
// would: Ease sliders apply influences and speeds (one undo step, value shown while dragging,
// icon resets, Shift-click opens the curve editor); Key Copy/Paste copies and pastes across
// properties at the playhead, one copied property onto several, refuses other value types,
// and Shift-Paste pastes only the easing; Interpolation sets Linear, Hold and Bezier and keeps
// the eases; an Anchor square moves the anchor without moving the layer; the Sequencer's
// Amount / Step grouping and all three orders (centre with odd and even counts), on layers and
// on keyframes.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var U = MotionKit.helpers.util, BEZ = KeyframeInterpolationType.BEZIER, LIN = KeyframeInterpolationType.LINEAR, HOLD = KeyframeInterpolationType.HOLD;
var opened = [];
MotionKit.ui.openOptions = function (id) { opened.push(id); return null; };
MotionKit.settings.set("keyCopyPaste", null);
var win = $.evalFile(MKT_DIR + "/dist/Motion Kit.jsx"), P = win.mkPanel;
function W(id) {
  for (var i = 0; i < P.widgets.length; i++) if (P.widgets[i] && P.widgets[i].id === id) return P.widgets[i];
  return null;
}
// A click on a control: press and release.
function click(ctl, extra) {
  T.mouse(win, ctl, "mousedown", 5, 5, extra);
  T.mouse(win, ctl, "mouseup", 5, 5, extra);
}
function texts(ctl) {
  __uiSnapshot();
  return U.map(U.filter(ctl.__draw || [], function (op) { return op.op === "text"; }), function (op) { return op.text; }).join("|");
}
function keySel(prop, list) { for (var i = 0; i < list.length; i++) prop.setSelectedAtKey(list[i], true); }

var comp = T.comp("Widget Test"), F = comp.frameDuration;

// ---- Ease
var A = T.solid(comp, "A", 100, 100), op = A.transform.opacity;
op.setValueAtTime(0, 0);
op.setValueAtTime(1, 100);
op.setValueAtTime(2, 0);
T.select(comp, [], []);
keySel(op, [1, 2, 3]);
var e = W("ease"), tr = e.sliders.easeIn.track, tw = tr.mkW;
// x in the track for a value (8 px inset at both ends).
function xFor(v, lo, hi) { return 8 + (tw - 16) * (v - lo) / (hi - lo); }
T.mouse(win, tr, "mousedown", xFor(20, 0.1, 100), 10);
T.mouse(win, tr, "mousemove", xFor(60, 0.1, 100), 10);
T.check(/^60 %$/.test(texts(tr)), "dragging shows the value as text (" + texts(tr) + ")");
T.mouse(win, P.cells[1], "mousemove", 3, 3);
T.check(texts(e.sliders.easeIn.track).indexOf("100") === 0, "the drag keeps following the pointer off the slider (clamped to 100)");
T.mouse(win, tr, "mousemove", xFor(60, 0.1, 100), 10);
T.mouse(win, tr, "mouseup", xFor(60, 0.1, 100), 10);
var o = MotionKit.options.get("ease");
var ie = op.keyInTemporalEase(2)[0], oe = op.keyOutTemporalEase(2)[0];
T.check(o.easeIn === 60 && T.near(ie.influence, 60) && T.near(oe.influence, 33) && T.near(ie.speed, 0) && T.near(oe.speed, 0) && op.keyInInterpolationType(2) === BEZ,
  "releasing applies Ease In 60 %, Ease Out 33 % and speed 0 to the selected keys (in " + ie.influence + ", out " + oe.influence + ")");
T.check(T.near(op.keyOutTemporalEase(1)[0].influence, 33) && T.near(op.keyInTemporalEase(3)[0].influence, 60), "every selected key: the first gets its out ease, the last its in ease");
e = W("ease");
var st = e.sliders.speed.track;
T.mouse(win, st, "mousedown", 8 + (st.mkW - 16) / 2, 10);
T.mouse(win, st, "mouseup", 8 + (st.mkW - 16) / 2, 10);
T.check(MotionKit.options.get("ease").speed === 100 && T.near(op.keyInTemporalEase(2)[0].speed, 100) && T.near(op.keyOutTemporalEase(2)[0].speed, -100),
  "Speed 100 % is the segments' average speed at the key (in 100, out -100 per second)");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(T.near(op.keyInTemporalEase(2)[0].speed, 0) && T.near(op.keyInTemporalEase(2)[0].influence, 60), "one Undo takes back one release");
e = W("ease");
click(e.sliders.easeIn.icon);
T.check(MotionKit.options.get("ease").easeIn === 33 && W("ease").sliders.easeIn.value() === 33, "clicking the slider's icon resets it to 33 %");
e = W("ease");
click(e.sliders.easeOut.track, { shiftKey: true });
click(P.cells[0], { shiftKey: true });
T.check(opened.join(",") === "easeKeys,easeKeys" && MotionKit.options.get("ease").easeOut === 33, "Shift-click on a slider or anywhere on the widget opens the curve editor, changing nothing");
opened = [];
T.select(comp, [A], []);
T.alerts = [];
e = W("ease");
T.mouse(win, e.sliders.easeOut.track, "mousedown", 20, 10);
T.mouse(win, e.sliders.easeOut.track, "mouseup", 20, 10);
T.check(/^Ease: select keyframes/.test(T.lastAlert()), "no keyframes selected: the release explains (" + T.lastAlert() + ")");

// ---- Key Copy/Paste
var B = T.solid(comp, "B", 100, 100), C = T.solid(comp, "C", 100, 100);
var pa = A.transform.position, ra = A.transform.rotation;
pa.setValueAtTime(1, [100, 100]);
pa.setValueAtTime(2, [300, 100]);
pa.setTemporalEaseAtKey(2, [new KeyframeEase(0, 70)], [new KeyframeEase(0, 40)]);
ra.setValueAtTime(1.4, 10);
ra.setValueAtTime(2.4, 50);
ra.setInterpolationTypeAtKey(2, LIN, HOLD);
T.select(comp, [], []);
keySel(pa, [1, 2]);
keySel(ra, [1, 2]);
var kc = W("keyCopyPaste");
T.check(texts(P.cells[1]).indexOf("0 keys|copied") === 0, "the label starts at \"0 keys / copied\"");
click(kc.copy);
var clip = MotionKit.settings.get("keyCopyPaste");
T.check(clip.props.length === 2 && clip.props[0].keys.length === 2 && T.near(clip.props[1].keys[0].time, 0.4), "Copy keeps both properties' keys, timed from the earliest");
T.check(texts(P.cells[1]).indexOf("4 keys|copied") === 0, "the label counts them: " + texts(P.cells[1]));
var pb = B.transform.position, rb = B.transform.rotation;
comp.time = 4;
T.select(comp, [B], [pb, rb]);
click(W("keyCopyPaste").paste);
T.check(pb.numKeys === 2 && T.near(pb.keyTime(1), 4) && T.near(pb.keyTime(2), 5) && T.near(pb.keyValue(2), [300, 100]), "the first copied property's keys go to the first selected property, at the playhead");
T.check(rb.numKeys === 2 && T.near(rb.keyTime(1), 4.4) && T.near(rb.keyTime(2), 5.4) && T.near(rb.keyValue(2), 50), "the second to the second, keeping the timing across properties");
T.check(T.near(pb.keyInTemporalEase(2)[0].influence, 70) && T.near(pb.keyOutTemporalEase(2)[0].influence, 40) && rb.keyInInterpolationType(2) === LIN && rb.keyOutInterpolationType(2) === HOLD,
  "eases and interpolation come along");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(pb.numKeys === 0 && rb.numKeys === 0, "one Undo takes the paste back");
// One copied property goes onto every selected one.
T.select(comp, [], []);
keySel(ra, [1, 2]);
click(W("keyCopyPaste").copy);
comp.time = 6;
var oc = C.transform.opacity, rc = C.transform.rotation;
T.select(comp, [C], [oc, rc]);
click(W("keyCopyPaste").paste);
T.check(oc.numKeys === 2 && rc.numKeys === 2 && T.near(oc.keyTime(1), 6) && T.near(rc.keyTime(2), 7) && T.near(oc.keyValue(2), 50), "one copied property pastes onto every selected property");
T.alerts = [];
T.select(comp, [C], [C.transform.anchorPoint]);
click(W("keyCopyPaste").paste);
T.check(C.transform.anchorPoint.numKeys === 0 && /another kind of value/.test(T.lastAlert()), "another value type is refused: " + T.lastAlert());
// Shift-Paste: only the easing, onto the selected keyframes.
T.select(comp, [], []);
keySel(pa, [2]);
click(W("keyCopyPaste").copy);
T.select(comp, [], []);
keySel(op, [2]);
var v2 = op.keyValue(2), t2 = op.keyTime(2), n2 = op.numKeys;
click(W("keyCopyPaste").paste, { shiftKey: true });
T.check(T.near(op.keyInTemporalEase(2)[0].influence, 70) && T.near(op.keyOutTemporalEase(2)[0].influence, 40) && op.keyValue(2) === v2 && op.keyTime(2) === t2 && op.numKeys === n2,
  "Shift-Paste puts only the copied easing on the selected keyframes");

// ---- Interpolation
op.setTemporalEaseAtKey(2, [new KeyframeEase(0, 60)], [new KeyframeEase(0, 70)]);
op.setInterpolationTypeAtKey(3, LIN, LIN);
T.select(comp, [], []);
keySel(op, [2]);
var ip = W("interpolation");
click(ip.buttons.linear);
T.check(op.keyInInterpolationType(2) === LIN && op.keyOutInterpolationType(2) === LIN, "Linear sets both sides");
click(W("interpolation").buttons.hold);
T.check(op.keyInInterpolationType(2) === HOLD && op.keyOutInterpolationType(2) === HOLD, "Hold sets both sides");
click(W("interpolation").buttons.bezier);
T.check(op.keyInInterpolationType(2) === BEZ && op.keyOutInterpolationType(2) === BEZ && T.near(op.keyInTemporalEase(2)[0].influence, 60) && T.near(op.keyOutTemporalEase(2)[0].influence, 70),
  "Bezier brings back the key's eases (60 % in, 70 % out)");
T.check(op.keyInInterpolationType(3) === LIN && op.keyOutInterpolationType(3) === LIN, "unselected keys are left alone");

// ---- Anchor
var D = T.solid(comp, "D", 200, 100);
D.transform.position.setValue([500, 300]);
D.transform.rotation.setValue(30);
D.transform.scale.setValue([150, 80]);
function corners() { return [D.sourcePointToComp([0, 0]), D.sourcePointToComp([200, 100])]; }
var before = corners();
comp.time = 0;
T.select(comp, [D], []);
var an = W("anchor");
click(an.squares.tl);
T.check(T.near(D.transform.anchorPoint.value, [0, 0]) && T.near(corners()[0], before[0]) && T.near(corners()[1], before[1]), "a square moves the anchor to that point without moving the layer");
T.check(MotionKit.options.get("anchor").point === "tl", "the square used last is remembered");
__uiSnapshot();
var hi = W("anchor").squares.tl.__draw, lit = false;
for (var h = 0; h < hi.length; h++) if (hi[h].op === "stroke" && hi[h].width === 2) lit = true;
T.check(lit, "and highlighted");
click(W("anchor").squares.br, { shiftKey: true });
T.check(opened.pop() === "moveAnchor" && T.near(D.transform.anchorPoint.value, [0, 0]), "Shift-click opens Move Anchor Point's options and moves nothing");

// ---- Sequencer
var seqComp = T.comp("Widget Sequencer");
var Ls = [];
for (var n = 0; n < 5; n++) Ls.push(T.solid(seqComp, "S" + n, 20, 20));
function reset() { for (var i = 1; i <= 5; i++) seqComp.layer(i).startTime = 0; }
// In-points in frames, by layer index.
function frames(count) {
  var out = [];
  for (var i = 1; i <= (count || 5); i++) out.push(Math.round(seqComp.layer(i).inPoint / F));
  return out.join(",");
}
var sq = W("sequencerWidget");
T.check(sq.amount.text === "1" && sq.step.text === "1", "the fields start at Amount 1, Step 1");
sq.amount.text = "2";
sq.amount.notify("onChange");
W("sequencerWidget").step.text = "2";
W("sequencerWidget").step.notify("onChange");
T.check(MotionKit.options.get("sequencerWidget").amount === 2 && MotionKit.options.get("sequencerWidget").step === 2 && W("sequencerWidget").step.text === "2", "the fields save Amount and Step");
T.select(seqComp, Ls, []);
click(W("sequencerWidget").buttons.topDown);
T.check(frames() === "0,0,2,2,4", "top to bottom, Amount 2, Step 2: item k moves 2 x floor(k / 2) frames (" + frames() + ")");
reset();
click(W("sequencerWidget").buttons.bottomUp);
T.check(frames() === "4,2,2,0,0", "bottom to top (" + frames() + ")");
reset();
W("sequencerWidget").step.text = "1";
W("sequencerWidget").step.notify("onChange");
click(W("sequencerWidget").buttons.centre);
T.check(frames() === "4,2,0,2,4", "from the centre, odd count: the middle keeps its time, both sides alike (" + frames() + ")");
reset();
T.select(seqComp, [Ls[0], Ls[1], Ls[2], Ls[3]], []);
click(W("sequencerWidget").buttons.centre);
T.check(frames() === "0,2,0,0,2", "from the centre, even count: the two middle items keep their time (" + frames() + ")");
reset();
W("sequencerWidget").amount.text = "-1.5";
W("sequencerWidget").amount.notify("onChange");
W("sequencerWidget").step.text = "2";
W("sequencerWidget").step.notify("onChange");
T.select(seqComp, Ls, []);
click(W("sequencerWidget").buttons.centre);
T.check(frames() === "-1,0,0,0,-1", "centre with Step 2 and a negative, fractional Amount (-1.5 rounds to -1 frame): " + frames());
reset();
T.alerts = [];
W("sequencerWidget").step.text = "0";
W("sequencerWidget").step.notify("onChange");
T.check(/Step must be from 1/.test(T.lastAlert()) && W("sequencerWidget").step.text === "2" && MotionKit.options.get("sequencerWidget").step === 2, "a bad Step is refused and the field shows the saved value");
W("sequencerWidget").amount.text = "x";
W("sequencerWidget").amount.notify("onChange");
T.check(/Amount must be a number/.test(T.lastAlert()) && MotionKit.options.get("sequencerWidget").amount === -1.5, "a bad Amount too");
// Keyframes selected on the selected layers: the keyframes move, not the layers.
W("sequencerWidget").amount.text = "3";
W("sequencerWidget").amount.notify("onChange");
W("sequencerWidget").step.text = "1";
W("sequencerWidget").step.notify("onChange");
var kp = [];
for (var q = 1; q <= 3; q++) {
  var pr = seqComp.layer(q).transform.opacity;
  pr.setValueAtTime(1, 0);
  pr.setValueAtTime(2, 100);
  kp.push(pr);
}
T.select(seqComp, [seqComp.layer(1), seqComp.layer(2), seqComp.layer(3)], []);
for (var s = 0; s < 3; s++) keySel(kp[s], [1, 2]);
click(W("sequencerWidget").buttons.topDown);
T.check(frames() === "0,0,0,0,0" && T.near(kp[0].keyTime(1), 1) && T.near(kp[1].keyTime(1), 1 + 3 * F) && T.near(kp[2].keyTime(2), 2 + 6 * F), "with keyframes selected it sequences the keyframes");
click(W("sequencerWidget").buttons.topDown, { shiftKey: true });
T.check(opened.pop() === "sequencer", "Shift-click opens the full Sequencer options");

T.done();
