// SPDX-License-Identifier: MIT OR Apache-2.0
// Clone Keys to Playhead: the selected keys of several properties land at the playhead with one
// shared offset (relative timing kept), carrying value, eases, interpolation (Linear and Hold
// too), spatial tangents and roving; keys at target times are replaced; the originals stay;
// bad selections; one undo step.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var LIN = KeyframeInterpolationType.LINEAR, BEZ = KeyframeInterpolationType.BEZIER, HOLD = KeyframeInterpolationType.HOLD;
var comp = T.comp("Clone Test");
var lay = T.solid(comp, "Box", 50, 50);
var pos = lay.transform.position, op = lay.transform.opacity, rot = lay.transform.rotation;
pos.setValueAtTime(1, [100, 100]);
pos.setValueAtTime(1.4, [300, 100]);
pos.setValueAtTime(2, [300, 300]);
pos.setInterpolationTypeAtKey(2, BEZ, BEZ);
pos.setTemporalEaseAtKey(2, [new KeyframeEase(50, 70)], [new KeyframeEase(120, 15)]);
pos.setSpatialTangentsAtKey(2, [-60, 10, 0], [20, 80, 0]);
pos.setInterpolationTypeAtKey(3, LIN, HOLD);
// Explicit tangents everywhere, so no auto-Bezier tangent depends on the keys around it.
pos.setSpatialTangentsAtKey(1, [0, 0, 0], [50, 0, 0]);
pos.setSpatialTangentsAtKey(3, [0, -50, 0], [0, 0, 0]);
op.setValueAtTime(1.2, 30);
op.setValueAtTime(1.6, 80);
op.setValueAtTime(5.2, 5);
rot.setValueAtTime(0, 0);
rot.setValueAtTime(8, 90);

function keys(list) {
  T.select(comp, [], []);
  for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i][1].length; j++) list[i][0].setSelectedAtKey(list[i][1][j], true);
}
function idxAt(p, t) {
  for (var i = 1; i <= p.numKeys; i++) if (Math.abs(p.keyTime(i) - t) < 1e-6) return i;
  return 0;
}

// ---- bad selection
T.select(comp, [lay], []);
var bad = MotionKit.run("cloneKeys");
T.check(!bad.ok && /select the keyframes to clone/.test(T.lastAlert()) && pos.numKeys === 3, "no selected keyframes: refused, nothing added");

// ---- clone three position keys and one opacity key to 5 s
keys([[pos, [1, 2, 3]], [op, [1]]]);
comp.time = 5;
var r = MotionKit.run("cloneKeys");
T.check(r.ok && /cloned 4 keyframes on 2 properties to 5 s/.test(r.message), "runs: " + r.message);
var a = idxAt(pos, 5), b = idxAt(pos, 5.4), c = idxAt(pos, 6), d = idxAt(op, 5.2);
T.check(pos.numKeys === 6 && a && b && c, "position keys cloned to 5, 5.4 and 6 s: the earliest selected key overall lands on the playhead");
T.check(d && op.numKeys === 3 && T.near(op.keyValue(d), 30), "opacity's key (0.2 s after the earliest) lands at 5.2 s and replaces the key there");
T.check(T.near(pos.keyValue(a), [100, 100]) && T.near(pos.keyValue(b), [300, 100]) && T.near(pos.keyValue(c), [300, 300]), "values are copied");
T.check(pos.keyInInterpolationType(a) === LIN && pos.keyOutInterpolationType(a) === LIN && pos.keyOutInterpolationType(c) === HOLD && pos.keyInInterpolationType(b) === BEZ,
  "interpolation is copied, Linear and Hold included");
var ie = pos.keyInTemporalEase(b)[0], oe = pos.keyOutTemporalEase(b)[0];
T.check(T.near(ie.speed, 50) && T.near(ie.influence, 70) && T.near(oe.speed, 120) && T.near(oe.influence, 15), "temporal eases are copied");
T.check(T.near(pos.keyInSpatialTangent(b), [-60, 10]) && T.near(pos.keyOutSpatialTangent(b), [20, 80]), "spatial tangents are copied");
var worst = 0;
for (var t = 0; t <= 1; t += 0.05) worst = Math.max(worst, Math.abs(pos.valueAtTime(5 + t, false)[0] - pos.valueAtTime(1 + t, false)[0]) + Math.abs(pos.valueAtTime(5 + t, false)[1] - pos.valueAtTime(1 + t, false)[1]));
T.check(worst < 1e-6, "the cloned motion is the same motion, 4 s later (max difference " + worst + ")");
T.check(pos.keySelected(1) && pos.keySelected(2) && !pos.keySelected(a) && !pos.keySelected(c), "the originals stay selected, the clones aren't");
T.check(pos.numKeys === 6 && T.near(pos.keyTime(1), 1) && T.near(pos.keyValue(3), [300, 300]), "the originals are untouched");

// ---- playhead inside the selection: clones overwrite the keys they started from
keys([[op, [1, 2]]]);
comp.time = 1.6;
MotionKit.run("cloneKeys");
T.check(op.numKeys === 4 && T.near(op.valueAtTime(1.6, false), 30) && T.near(op.valueAtTime(2, false), 80), "cloning onto its own keys reads them first (1.2, 1.6 -> 1.6, 2.0)");

// ---- roving keys stay roving
var rp = T.solid(comp, "Rover", 20, 20).transform.position;
rp.setValueAtTime(0, [0, 0]);
rp.setValueAtTime(1, [100, 0]);
rp.setValueAtTime(2, [100, 100]);
rp.setInterpolationTypeAtKey(2, BEZ, BEZ);
rp.setRovingAtKey(2, true);
keys([[rp, [1, 2, 3]]]);
comp.time = 4;
MotionKit.run("cloneKeys");
T.check(rp.numKeys === 6 && rp.keyRoving(5) && !rp.keyRoving(4) && T.near(rp.keyTime(4), 4) && T.near(rp.keyTime(6), 6), "a roving key's clone is roving between the cloned ends");

// ---- nothing to do at the same time
keys([[rot, [1]]]);
comp.time = 0;
r = MotionKit.run("cloneKeys");
T.check(r.ok && /already at the playhead/.test(r.message) && rot.numKeys === 2, "with the earliest key already at the playhead nothing changes");

// ---- one undo step
keys([[rot, [1, 2]]]);
comp.time = 1;
MotionKit.run("cloneKeys");
T.check(rot.numKeys === 4, "rotation keys cloned");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(rot.numKeys === 2 && T.near(rot.keyTime(2), 8), "one Undo removes every clone");

T.done();
