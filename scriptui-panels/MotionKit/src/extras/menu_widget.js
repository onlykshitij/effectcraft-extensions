// SPDX-License-Identifier: MIT OR Apache-2.0
// The menu widget (MK_PANEL "menu"): a compact panel with a category list, a tool list, Run and
// Options buttons and the command box. No grid. It follows library changes through `rev`.

MK.ui.buildMenu = function (host) {
  var U = MK.util;
  var CATS = MK.CATEGORIES.concat(["Library"]);
  var M = { host: host, key: "m" + (++MK.ui.seq), rev: -1, cat: 0, id: null, closed: false, filling: false };

  function entries(cat) { return U.filter(MK.catalog(), function (e) { return e.category === cat; }); }

  M.rebuild = function () {
    if (M.closed) return;
    M.rev = MK.settings.rev();
    for (var n = 0; n < 1000 && host.children.length; n++) host.remove(host.children[host.children.length - 1]);
    host.orientation = "column";
    host.alignChildren = ["fill", "top"];
    host.spacing = 4;
    host.margins = 6;
    var r1 = host.add("group");
    r1.orientation = "row";
    r1.alignChildren = ["left", "center"];
    r1.spacing = 4;
    M.filling = true;
    M.catList = r1.add("dropdownlist", undefined, CATS);
    M.catList.selection = M.cat;
    M.toolList = r1.add("dropdownlist", undefined, []);
    M.toolList.preferredSize = [150, -1];
    M.filling = false;
    M.catList.onChange = function () {
      if (M.filling || !M.catList.selection) return;
      M.cat = M.catList.selection.index;
      M.id = null;
      M.fillTools();
    };
    M.toolList.onChange = function () {
      if (M.filling || !M.toolList.selection) return;
      M.id = M.ids[M.toolList.selection.index] || null;
      M.sync();
    };
    var r2 = host.add("group");
    r2.orientation = "row";
    r2.spacing = 4;
    M.runBtn = r2.add("button", undefined, "Run");
    M.optBtn = r2.add("button", undefined, "Options…");
    M.gear = r2.add("button", undefined, "⚙");
    M.gear.preferredSize = [28, 22];
    M.gear.helpTip = "Layout & Style…";
    M.runBtn.onClick = function () { if (M.id) MK.run(M.id); M.refresh(); };
    M.optBtn.onClick = function () { if (M.id) MK.ui.openOptions(M.id); M.refresh(); };
    M.gear.onClick = function () { MK.ui.openLayoutDialog(0, "library"); M.refresh(); };
    M.commandBox = MK.commandBox.attach(host, { after: function () { M.refresh(); } });
    M.fillTools();
    try { host.layout.layout(true); } catch (e) {}
  };

  M.fillTools = function () {
    var list = entries(CATS[M.cat]);
    M.ids = U.map(list, function (e) { return e.id; });
    M.filling = true;
    M.toolList.removeAll();
    for (var i = 0; i < list.length; i++) M.toolList.add("item", list[i].name);
    var at = U.indexOf(M.ids, M.id);
    if (at < 0) at = list.length ? 0 : -1;
    M.toolList.selection = at >= 0 ? at : null;
    M.id = at >= 0 ? M.ids[at] : null;
    M.filling = false;
    M.sync();
  };

  M.sync = function () {
    var t = M.id && MK.tools[M.id];
    M.runBtn.enabled = !!M.id;
    M.optBtn.enabled = !!(t && MK.options.has(t));
    var d = M.id ? MK.describe(M.id) : null;
    M.toolList.helpTip = d ? d.name + " – " + d.description : "";
  };

  M.refresh = function () { if (!M.closed && MK.settings.rev() !== M.rev) M.rebuild(); };
  M.close = function () {
    if (M.closed) return;
    M.closed = true;
    if (M.taskId) try { app.cancelTask(M.taskId); } catch (e) {}
    delete MK.ui.live[M.key];
  };
  var prevClose = host.onClose;
  host.onClose = function () {
    M.close();
    if (typeof prevClose === "function") return prevClose.apply(this, arguments);
  };
  MK.ui.live[M.key] = M;
  M.rebuild();
  try {
    M.taskId = app.scheduleTask("try { MotionKit.__tick(\"" + M.key + "\"); } catch (e) {}", MK.ui.POLL_MS, true);
  } catch (e2) {
    M.taskId = null;
  }
  host.mkPanel = M;
  return M;
};
