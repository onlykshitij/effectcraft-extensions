// SPDX-License-Identifier: MIT OR Apache-2.0
// Toggle Stroke Style: the full cycle on every stroke of a layer (gradient strokes too), each
// stroke's dash and gap from its own width, what EffectCraft draws for each style (solid, dashed,
// dotted with the tiny-dash workaround), the first stroke deciding, selected stroke properties,
// styles left out, multipliers, keyframed dashes, bad selections, one Undo.
$.evalFile(new File($.fileName).path + "/testlib.jsx");
var SH = MotionKit.helpers.shapes;

var comp = T.comp("Stroke Test", 300, 100);
function line(name, widths, gradient) {
  var L = comp.layers.addShape();
  L.name = name;
  L.transform.position.setValue([0, 0]);
  var root = SH.contents(L), s = new Shape();
  s.vertices = [[10, 50], [290, 50]];
  s.closed = false;
  root.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(s);
  var out = [];
  for (var i = 0; i < widths.length; i++) {
    var st = root.addProperty("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Width").setValue(widths[i]);
    out.push(st);
  }
  if (gradient) out.push(root.addProperty("ADBE Vector Graphic - G-Stroke"));
  return { layer: L, strokes: out };
}
function dashes(st) { return st.property("ADBE Vector Stroke Dashes") || st.property("dashes"); }
function state(st) {
  var cap = (st.property("ADBE Vector Stroke Line Cap") || st.property("cap")).value;
  var d = dashes(st);
  return [cap, d.property("ADBE Vector Stroke Dash 1").value, d.property("ADBE Vector Stroke Gap 1").value];
}
function is(st, cap, dash, gap) {
  var s = state(st);
  return s[0] === cap && Math.abs(s[1] - dash) < 1e-6 && (gap === undefined || Math.abs(s[2] - gap) < 1e-6);
}

var L = line("Lines", [4, 6], true), S1 = L.strokes[0], S2 = L.strokes[1], G = L.strokes[2];
var other = line("Other", [3]);
T.check(G.property("ADBE Vector Stroke Line Cap") === null && G.property("cap") !== null, "EffectCraft names a gradient stroke's own properties by id only (\"cap\"), so the tool falls back to it");

// The cycle, on every stroke of the selected layer.
T.select(comp, [L.layer], []);
var r = MotionKit.run("strokeStyle");
T.check(r.ok && /3 strokes to solid, round cap/.test(r.message) && is(S1, 2, 0) && is(S2, 2, 0) && is(G, 2, 0), "solid / butt -> solid / round: " + r.message);
T.check(is(other.strokes[0], 1, 0), "an unselected layer's stroke is left alone");
r = MotionKit.run("strokeStyle");
T.check(r.ok && /dashed/.test(r.message) && is(S1, 2, 8, 8) && is(S2, 2, 12, 12) && is(G, 2, 4, 4), "-> dashed: dash and gap twice each stroke's own width");
r = MotionKit.run("strokeStyle");
T.check(r.ok && /dotted/.test(r.message) && is(S1, 2, 0.01, 8) && is(S2, 2, 0.01, 12) && is(G, 2, 0.01, 4), "-> dotted: a 0.01 px dash (EffectCraft draws no dashes at 0), gap twice the width");
r = MotionKit.run("strokeStyle");
T.check(r.ok && /solid, butt cap/.test(r.message) && is(S1, 1, 0) && is(S2, 1, 0) && is(G, 1, 0), "-> back to solid / butt");
app.executeCommand(app.findMenuCommandId("Undo"));
T.check(is(S1, 2, 0.01, 8) && is(G, 2, 0.01, 4), "one Undo goes back to dotted");

// What EffectCraft draws: one 10 px stroke, sampled along the line ('#' covered, '.' empty).
var D = line("Draw", [10]);
other.layer.enabled = L.layer.enabled = false;
var probe = comp.layers.addText("x").property("ADBE Text Properties").property("ADBE Text Document");
probe.expression = "var L = thisComp.layer(\"Draw\"), o = ''; for (var x = 20; x < 140; x += 2) o += L.sampleImage([x, 50], [0.5, 0.5], true, time)[3] > 0.5 ? '#' : '.'; o";
function looks() { return String(probe.valueAtTime(0, false).text); }
function gaps(s) { return (s.match(/#\.+(?=#)/g) || []).length; }
T.select(comp, [D.layer], []);
var drawn = [looks()];
for (var k = 0; k < 4; k++) { MotionKit.run("strokeStyle"); drawn.push(looks()); }
T.check(gaps(drawn[0]) === 0 && gaps(drawn[1]) === 0 && gaps(drawn[4]) === 0, "solid styles draw an unbroken line");
T.check(gaps(drawn[2]) >= 2 && /#{6,}/.test(drawn[2]), "dashed draws long dashes with gaps: " + drawn[2]);
T.check(gaps(drawn[3]) >= 4 && !/#{7,}/.test(drawn[3]), "dotted draws round dots one width wide: " + drawn[3]);
probe.parentProperty.parentProperty.remove();
D.layer.remove();
other.layer.enabled = L.layer.enabled = true;

// The first stroke decides; a selected property inside a stroke selects that stroke.
dashes(S1).property("ADBE Vector Stroke Dash 1").setValue(20);
dashes(S2).property("ADBE Vector Stroke Dash 1").setValue(0);
T.select(comp, [L.layer], []);
r = MotionKit.run("strokeStyle");
T.check(r.ok && is(S1, 2, 0.01, 8) && is(S2, 2, 0.01, 12), "S1 dashed decides: everything goes to dotted");
T.select(comp, [L.layer], [S2.property("ADBE Vector Stroke Width")]);
r = MotionKit.run("strokeStyle");
T.check(r.ok && /1 stroke to solid, butt/.test(r.message) && is(S2, 1, 0) && is(S1, 2, 0.01, 8) && is(G, 2, 0.01, 4), "Stroke Width of S2 selected: only S2 changes");
T.select(comp, [L.layer, other.layer], [other.strokes[0], S1]);
r = MotionKit.run("strokeStyle");
T.check(r.ok && /2 strokes to solid, round/.test(r.message) && is(S1, 2, 0) && is(other.strokes[0], 2, 0) && is(S2, 1, 0), "two selected strokes on two layers; the first selected (Other's, solid / butt) decides");

// Styles left out, multipliers; an unknown state starts the cycle.
T.select(comp, [L.layer], []);
r = MotionKit.run("strokeStyle", { solidRound: false, dotted: false, dash: 3, gap: 1 });
T.check(r.ok && is(S1, 2, 12, 4) && is(S2, 2, 18, 6), "only butt and dashed: solid -> dashed with 3x dash and 1x gap");
r = MotionKit.run("strokeStyle", { solidRound: false, dotted: false });
T.check(r.ok && is(S1, 1, 0), "-> solid / butt, skipping round and dotted");
(S1.property("ADBE Vector Stroke Line Cap")).setValue(3);
r = MotionKit.run("strokeStyle", { solidButt: false });
T.check(r.ok && is(S1, 2, 0) && is(S2, 2, 0), "a projecting cap isn't in the cycle: the first included style (round)");
r = MotionKit.run("strokeStyle", { solidButt: false, solidRound: false, dashed: false, dotted: false });
T.check(!r.ok && /at least one style/.test(r.message), "no styles: refused");

// A keyframed dash gets a key at the current time.
comp.time = 1;
var dash1 = dashes(S1).property("ADBE Vector Stroke Dash 1");
dash1.setValueAtTime(0, 0);
r = MotionKit.run("strokeStyle");
T.check(r.ok && dash1.numKeys === 2 && T.near(dash1.valueAtTime(1, false), 8) && T.near(dash1.valueAtTime(0, false), 0), "keyframed Dash: a new key at the current time, the old one kept");

// Bad selections.
var sol = T.solid(comp, "Solid", 50, 50);
T.select(comp, [sol], []);
r = MotionKit.run("strokeStyle");
T.check(!r.ok && /select strokes/.test(T.lastAlert()), "a solid: refused");

T.done();
