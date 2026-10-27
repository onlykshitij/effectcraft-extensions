// SPDX-License-Identifier: MIT OR Apache-2.0
// GIF Export: queues a GIF render item per comp and renders it; the file exists, starts with a
// GIF header, has the scaled size, frame rate and time span (read back by importing it), loops
// or not (the NETSCAPE2.0 block); other queued items aren't rendered; the default folder is the
// project's; an existing GIF is never replaced (the next free "<comp> 2.gif"); nothing to export.
// Rendering is allowed headless. Reading files is only allowed in the project's folder, so the
// test saves its project next to itself first; if that fails, the file checks are skipped.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

// ---- nothing to export: no comp open, nothing selected
var none = MotionKit.run("gifExport");
T.check(!app.project.activeItem && !none.ok && /select one or more comps/.test(T.lastAlert()) && app.project.renderQueue.numItems === 0, "no comp open and none selected: refused with an alert, nothing queued");

var canRead = true, why = "";
try {
  app.project.save(new File(MKT_DIR + "/test_gifExport.ecproj"));
} catch (e) {
  canRead = false;
  why = e.message;
}

var waiting = app.project.items.addComp("Waiting", 32, 32, 1, 1, 10);
var q0 = app.project.renderQueue.items.add(waiting);
q0.outputModule(1).file = new File(MKT_DIR + "/waiting.png");
var comp = T.comp("G Comp", 64, 48, 1, 10);
var s = T.solid(comp, "S", 20, 20, [0.9, 0.3, 0.1]);
s.transform.position.setValueAtTime(0, [10, 24]);
s.transform.position.setValueAtTime(0.9, [54, 24]);
comp.workAreaStart = 0;
comp.workAreaDuration = 0.5;

// GIF bytes as a string (characters are bytes).
function bytes(path) {
  var f = new File(path);
  f.encoding = "BINARY";
  f.open("r");
  var b = f.read();
  f.close();
  return b;
}
function word(b, i) { return b.charCodeAt(i) + 256 * b.charCodeAt(i + 1); }

// ---- half size, 5 fps, work area, play once, into a given folder
var rq = app.project.renderQueue;
var r = MotionKit.run("gifExport", { folder: MKT_DIR, scale: 50, fps: 5, loop: "once", workArea: true });
var path = MKT_DIR + "/G Comp.gif";
T.check(r.ok && r.message.indexOf(path) >= 0, "it renders: " + r.message);
var item = rq.item(rq.numItems);
T.check(rq.numItems === 2 && item.comp.id === comp.id && item.status === RQItemStatus.DONE, "one render queue item for the comp, done");
var om = app.run("renderQueue.list", {}).items[rq.numItems - 1].output;
T.check(item.outputModule(1).file.fsName === path && /gif/i.test(om.format) && om.gif_loop === false, "GIF output (format " + om.format + ", loop off) to the chosen folder");
T.check(q0.status === RQItemStatus.QUEUED && q0.render, "the item already waiting in the queue wasn't rendered and is still queued");
if (canRead) {
  T.check(new File(path).exists, "the GIF file exists");
  var b = bytes(path);
  T.check(b.substring(0, 6) === "GIF89a", "it starts with a GIF header");
  T.check(word(b, 6) === 32 && word(b, 8) === 24, "50 %: 32 x 24 px (from the header)");
  T.check(b.indexOf("NETSCAPE2.0") < 0, "play once: no looping block");
  var g = app.project.importFile(new ImportOptions(new File(path)));
  T.check(g.width === 32 && g.height === 24 && T.near(g.frameRate, 5) && T.near(g.duration, 0.6), "imported back: 32 x 24, 5 fps, 3 frames (the 0.5 s work area)");
} else {
  writeLn("SKIP reading the GIF: the project couldn't be saved next to the test, so EffectCraft won't let the script read files there (" + why + ")");
}

// ---- defaults: the project's folder, full size, the comp's rate, the whole comp, loop forever.
// G Comp.gif is there already, so this one is G Comp 2.gif.
T.select(comp, [], []);
r = MotionKit.run("gifExport", { folder: "", scale: 100, fps: 0, loop: "forever", workArea: false });
var path2 = MKT_DIR + "/G Comp 2.gif";
T.check(r.ok && rq.item(rq.numItems).status === RQItemStatus.DONE, "it renders again: " + r.message);
if (canRead) {
  T.check(rq.item(rq.numItems).outputModule(1).file.fsName === path2 && r.message.indexOf(path2) >= 0, "an empty folder means the project's folder; G Comp.gif is taken, so G Comp 2.gif");
  T.check(word(bytes(path), 6) === 32, "G Comp.gif isn't replaced: still the 32 px wide first render");
  var b2 = bytes(path2);
  T.check(b2.substring(0, 6) === "GIF89a" && word(b2, 6) === 64 && word(b2, 8) === 48 && b2.indexOf("NETSCAPE2.0") > 0, "64 x 48 px with a looping block");
  var g2 = app.project.importFile(new ImportOptions(new File(path2)));
  T.check(T.near(g2.frameRate, 10) && T.near(g2.duration, 1), "imported back: the comp's 10 fps over its whole second");
  // With the queue items gone, the files on disk alone still keep both names taken.
  for (var qi = rq.numItems; qi >= 1; qi--) if (rq.item(qi).comp.id === comp.id) rq.item(qi).remove();
  r = MotionKit.run("gifExport", { folder: MKT_DIR });
  T.check(r.ok && r.message.indexOf(MKT_DIR + "/G Comp 3.gif") >= 0, "no queue items left, the files alone: G Comp 3.gif (" + r.message + ")");
} else {
  T.check(rq.item(rq.numItems).outputModule(1).file.fsName !== rq.item(rq.numItems - 1).outputModule(1).file.fsName, "the queue's earlier G Comp output isn't reused");
}

// ---- comps selected in the Project panel
var other = app.project.items.addComp("Other: one", 16, 16, 1, 0.3, 10);
var sel = app.project.selection;
for (var i = 0; i < sel.length; i++) sel[i].selected = false;
other.selected = true;
comp.selected = true;
var n = rq.numItems;
r = MotionKit.run("gifExport", { folder: MKT_DIR });
T.check(r.ok && rq.numItems === n + 2 && /Rendered 2 GIFs/.test(r.message), "two selected comps, two GIFs: " + r.message);
T.check(r.message.indexOf(MKT_DIR + "/Other_ one.gif") >= 0, "characters a file name can't have become \"_\"");

T.done();
