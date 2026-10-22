// SPDX-License-Identifier: MIT OR Apache-2.0
// Self-check for TextBox.jsx: effectcraft-cli script "$PWD/test_textbox.jsx" --empty
// The path must be absolute, or $.evalFile has no folder to find TextBox.jsx in.
// Builds a comp, drives the palette's controls, then checks the boxes it made.
var comp = app.project.items.addComp("TextBox Test", 1280, 720, 1, 5, 30);
comp.openInViewer();
var bg = comp.layers.addSolid([0.95, 0.95, 0.95], "BG", 1280, 720, 1);
var a = comp.layers.addText("Hello box");
a.property("ADBE Transform Group").property("ADBE Position").setValue([300, 250]);
var b = comp.layers.addText("Rotated, scaled");
var bt = b.property("ADBE Transform Group");
bt.property("ADBE Position").setValue([800, 500]);
bt.property("ADBE Rotate Z").setValue(-12);
bt.property("ADBE Scale").setValue([150, 150]);
a.selected = true;
b.selected = true;
bg.selected = true; // not a text layer: must be skipped

var win = $.evalFile("TextBox.jsx");
var found = [];
(function walk(c) {
  found.push(c);
  for (var i = 0; i < (c.children || []).length; i++) walk(c.children[i]);
})(win);
function control(type, text) {
  for (var i = 0; i < found.length; i++) if (found[i].type === type && (text === undefined || found[i].text === text)) return found[i];
  throw new Error("no " + type + " " + text);
}
var edits = [];
for (var i = 0; i < found.length; i++) if (found[i].type === "edittext") edits.push(found[i]);
var hex = edits[0], padX = edits[1], roundness = edits[3];
hex.text = "#ff8800"; hex.notify("onChange");
padX.text = "30"; padX.notify("onChange");
control("checkbox", "Same").value = true; control("checkbox", "Same").notify("onClick");
roundness.text = "50"; roundness.notify("onChange");
control("button", "Create").notify("onClick");

function check(ok, what) { if (!ok) throw new Error("FAIL: " + what); writeLn("ok   " + what); }
function near(x, y) { return Math.abs(x - y) < 0.01; }

check(hex.text === "#FF8800", "hex field normalized: " + hex.text);
check(comp.numLayers === 5, "two boxes added, solid skipped: " + comp.numLayers + " layers");
var pairs = [[a, comp.layer(a.index + 1)], [b, comp.layer(b.index + 1)]];
for (var p = 0; p < pairs.length; p++) {
  var t = pairs[p][0], box = pairs[p][1];
  check(box.name === t.name + " Box", "box below its text: " + box.name);
  check(box.parent && box.parent.index === t.index, box.name + " parented to text");
  var r = t.sourceRectAtTime(0, false);
  var rect = box.property("ADBE Root Vectors Group").property(1);
  var size = rect.property("ADBE Vector Rect Size").valueAtTime(0, false);
  var pos = rect.property("ADBE Vector Rect Position").valueAtTime(0, false);
  var rnd = rect.property("ADBE Vector Rect Roundness").valueAtTime(0, false);
  var col = box.property("ADBE Root Vectors Group").property(2).property("ADBE Vector Fill Color").valueAtTime(0, false);
  writeLn("     text rect " + [r.left, r.top, r.width, r.height] + " -> size " + size + " pos " + pos + " round " + rnd + " color " + col);
  check(near(size[0], r.width + 60) && near(size[1], r.height + 60), box.name + " size = text + 2 x 30 padding");
  check(near(pos[0], r.left + r.width / 2) && near(pos[1], r.top + r.height / 2), box.name + " centered on text");
  check(near(rnd, Math.min(size[0], size[1]) / 4), box.name + " roundness 50%");
  check(near(col[0], 1) && near(col[1], 136 / 255) && near(col[2], 0), box.name + " color #FF8800");
}

// Live: editing the text resizes the box with no rerun.
var before = pairs[0][1].property("ADBE Root Vectors Group").property(1).property("ADBE Vector Rect Size").valueAtTime(0, false)[0];
a.property("ADBE Text Properties").property("ADBE Text Document").setValue("Hello box, now much longer");
var after = pairs[0][1].property("ADBE Root Vectors Group").property(1).property("ADBE Vector Rect Size").valueAtTime(0, false)[0];
check(after > before + 50, "box grows with the text: " + before + " -> " + after);
writeLn("all checks passed");
