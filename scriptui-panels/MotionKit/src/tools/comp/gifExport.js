// SPDX-License-Identifier: MIT OR Apache-2.0
// GIF Export: adds a render queue item with GIF output for each selected comp (or the active
// comp) and renders them. Scale is the render settings' resolution, the frame rate and time span
// are render settings too, and Loop is the GIF output module's loop flag, which the scripting
// OutputModule doesn't expose, so it goes through app.run("renderQueue.setOutputModule").
// Other queued items are switched off while rendering and switched back on after.
// A GIF never replaces another: when "<comp>.gif" is taken (a file there, or the output of
// another render queue item), the next free "<comp> 2.gif", "<comp> 3.gif"... is used.

(function () {
  var NAME = "GIF Export", U = MK.util;

  // An empty folder: the project's folder, else the Desktop. EffectCraft scripts get no Desktop
  // path (Folder.desktop is null), so then a bare file name lets EffectCraft use its default
  // output folder.
  function folderOf(o) {
    var f = U.trim(o.folder).replace(/[\/\\]+$/, "");
    if (f) return f;
    if (app.project.file) return app.project.file.path;
    if (Folder.desktop) return Folder.desktop.fsName;
    return "";
  }

  // True when `path` is a file, or the output of a render queue item other than number `self`
  // (done or waiting, this run's earlier items too).
  // shortcut: EffectCraft lets a script see files only inside the saved project's folder
  // (elsewhere File.exists is false), so a GIF left elsewhere by an earlier session can still be
  // replaced; check the disk there too once scripts may read it.
  function taken(rq, path, self) {
    if (new File(path).exists) return true;
    for (var i = 1; i <= rq.numItems; i++) {
      for (var m = 1; i !== self && m <= rq.item(i).numOutputModules; m++) {
        var f = rq.item(i).outputModule(m).file;
        if (f && f.fsName === path) return true;
      }
    }
    return false;
  }

  // Runs a settings change; EffectCraft refuses one that changes nothing, which is fine here.
  function change(fn) {
    try {
      fn();
    } catch (e) {
      if (!/nothing to change/.test(String(e && e.message))) throw e;
    }
  }

  MK.registerTool({
    id: "gifExport",
    name: NAME,
    category: "Comp",
    needsComp: false,
    description: "Renders the selected comps (or the active comp) to animated GIFs.",
    // A film strip with a play triangle (the triangle).
    icon: [
      "R3 5 18 14",
      { d: "M6 5 V7.5 M10 5 V7.5 M14 5 V7.5 M18 5 V7.5 M6 16.5 V19 M10 16.5 V19 M14 16.5 V19 M18 16.5 V19", w: 1.4 },
      { d: "M10 9 L15.5 12 L10 15 Z", fill: "accent" }
    ],
    options: [
      { key: "scale", label: "Scale", type: "number", "default": 100, min: 1, max: 400, unit: "%" },
      { key: "fps", label: "Frame rate", type: "number", "default": 0, min: 0, max: 100, unit: "fps", help: "0 uses each comp's frame rate." },
      { key: "loop", label: "Loop", type: "dropdown", "default": "forever", items: [["forever", "Forever"], ["once", "Play once"]] },
      { key: "workArea", label: "Work area only", type: "checkbox", "default": true },
      { key: "folder", label: "Output folder", type: "text", "default": "", help: "Type a folder path (EffectCraft scripts can't show a folder picker). Empty: the project's folder, or EffectCraft's default output folder for an unsaved project." }
    ],
    run: function (ctx, o) {
      var comps = U.filter(app.project.selection, function (it) { return it instanceof CompItem; });
      if (!comps.length && ctx.comp) comps = [ctx.comp];
      if (!comps.length) ctx.fail("select one or more comps in the Project panel, or open a comp.");
      var rq = app.project.renderQueue, folder = folderOf(o), items = [], i;
      for (i = 0; i < comps.length; i++) {
        var c = comps[i];
        var base = (folder ? folder + "/" : "") + String(c.name).replace(/[\\\/:*?"<>|]/g, "_"), n = 2;
        var it = rq.items.add(c);
        var idx = rq.numItems;
        it.outputModule(1).applyTemplate("GIF");
        change(function () { app.run("renderQueue.setOutputModule", { index: idx, loop: o.loop === "forever" }); });
        change(function () { it.setSettings({ resolution: o.scale / 100, timeSpan: o.workArea ? "workArea" : "comp", frameRate: o.fps > 0 ? o.fps : null }); });
        // Read back through the output module: a bare name resolves to EffectCraft's default folder.
        it.outputModule(1).file = new File(base + ".gif");
        while (taken(rq, it.outputModule(1).file.fsName, idx)) it.outputModule(1).file = new File(base + " " + n++ + ".gif");
        items.push(it);
      }

      // Render only ours: switch the other queued items off for the render.
      var others = [];
      for (i = 1; i <= rq.numItems; i++) {
        var q = rq.item(i);
        if (i <= rq.numItems - items.length && q.render && q.status === RQItemStatus.QUEUED) {
          q.render = false;
          others.push(q);
        }
      }
      try {
        rq.render();
      } finally {
        for (i = 0; i < others.length; i++) others[i].render = true;
      }

      var done = [], failed = [];
      for (i = 0; i < items.length; i++) {
        var path = items[i].outputModule(1).file;
        (items[i].status === RQItemStatus.DONE ? done : failed).push(path ? path.fsName : comps[i].name);
      }
      if (!done.length) ctx.fail("the render failed for " + failed.join(", ") + ".");
      if (failed.length) ctx.warn("The render failed for " + failed.join(", ") + ".");
      return ctx.done("Rendered " + done.length + (done.length === 1 ? " GIF: " : " GIFs: ") + done.join(", "));
    }
  });
})();
