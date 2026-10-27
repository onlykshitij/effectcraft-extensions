// SPDX-License-Identifier: MIT OR Apache-2.0
// Fix Keys Time: moves keyframes that sit between frames onto the nearest frame of the comp
// (keyframe times are comp time, so the layer's start time counts). Each moved key is rebuilt
// with its value, eases, interpolation and tangents. Keys ending on the same frame merge and
// the later one (by original time) wins. Roving keys stay: EffectCraft times them itself.

(function () {
  var NAME = "Fix Keys Time", U = MK.util, A = MK.anim, K = MK.keys, EPS = 1e-5;

  // Every property with keyframes under a layer or group.
  function keyedIn(group, out, depth) {
    for (var i = 1; depth < 64 && i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p instanceof PropertyGroup) keyedIn(p, out, depth + 1);
      else if (p instanceof Property && p.numKeys > 0) out.push(p);
    }
    return out;
  }

  function allKeys(p) {
    var a = [];
    for (var i = 1; i <= p.numKeys; i++) a.push(i);
    return a;
  }

  // Snaps keys `indices` of prop to the frame grid. Returns {moved, merged}.
  function fix(prop, indices, fd) {
    var all = K.readAll(prop), inScope = {}, r = { moved: 0, merged: 0 }, remove = [], write = [];
    for (var s = 0; s < indices.length; s++) inScope[indices[s]] = true;
    var groups = {}, order = [];
    for (var i = 0; i < all.length; i++) {
      var k = all[i], snap = Math.round(k.time / fd) * fd;
      k.moved = !!inScope[i + 1] && !k.roving && Math.abs(snap - k.time) > EPS;
      k.to = k.moved ? snap : k.time;
      var g = k.to.toFixed(5);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(i);
    }
    for (var n = 0; n < order.length; n++) {
      var grp = groups[order[n]], movers = U.filter(grp, function (j) { return all[j].moved; });
      if (!movers.length) continue;
      // Keys are in time order, so the group's last key is the latest.
      var win = all[grp[grp.length - 1]];
      r.moved += movers.length;
      r.merged += grp.length - 1;
      for (var m = 0; m < grp.length; m++) if (win.moved || all[grp[m]].moved) remove.push(grp[m] + 1);
      if (win.moved) write.push(win);
    }
    // A key roves only between two others, so removing its neighbours ends its roving: roving
    // keys left in place are rewritten too (first, at their own time) and rove again.
    for (var v = 0; remove.length && v < all.length; v++) {
      if (all[v].roving && U.indexOf(remove, v + 1) < 0) {
        remove.push(v + 1);
        write.unshift(all[v]);
      }
    }
    K.remove(prop, remove);
    A.writeAll(prop, write, function (k) { return k.to; });
    return r;
  }

  MK.registerTool({
    id: "fixKeys",
    name: NAME,
    category: "Animate",
    description: "Snaps keyframes that sit between frames onto the nearest frame.",
    // A diamond snapping onto a tick ruler (the target tick).
    icon: [
      "P13.5 7.5 4 4 0",
      "M2 21 H22",
      "M4 21 V18.5 M8.5 21 V18.5 M18 21 V18.5",
      { d: "M13.5 21 V15", stroke: "accent", w: 2 }
    ],
    options: [
      {
        key: "scope", label: "Keyframes", type: "dropdown", "default": "auto",
        items: [["auto", "What's selected: keyframes, else properties, else layers"], ["keys", "The selected keyframes"],
          ["props", "All keyframes of the selected properties"], ["layers", "All keyframes of the selected layers"]]
      }
    ],
    run: function (ctx, o) {
      var withSel = A.withSelectedKeys(ctx.props), keyed = MK.sel.keyed(ctx.props, 1), scope = o.scope, jobs = [];
      if (scope === "auto") scope = withSel.length ? "keys" : keyed.length ? "props" : "layers";
      if (scope === "keys") jobs = U.map(withSel, function (p) { return { prop: p, keys: MK.sel.selectedKeys(p) }; });
      else if (scope === "props") jobs = U.map(keyed, function (p) { return { prop: p, keys: allKeys(p) }; });
      else {
        for (var l = 0; l < ctx.layers.length; l++) {
          var ps = keyedIn(ctx.layers[l], [], 0);
          for (var q = 0; q < ps.length; q++) jobs.push({ prop: ps[q], keys: allKeys(ps[q]) });
        }
      }
      if (!jobs.length) ctx.fail(scope === "keys" ? "select keyframes." : scope === "props" ? "select properties with keyframes." : "select layers with keyframes.");
      var moved = 0, merged = 0, total = 0, touched = 0;
      for (var j = 0; j < jobs.length; j++) {
        var r = fix(jobs[j].prop, jobs[j].keys, ctx.frame);
        moved += r.moved;
        merged += r.merged;
        total += jobs[j].keys.length;
        if (r.moved) touched++;
      }
      if (!moved) return ctx.done(NAME + ": all " + total + " keyframes are already on frames.");
      return ctx.done(NAME + ": moved " + moved + (moved === 1 ? " keyframe" : " keyframes") + " onto frames on " + touched + (touched === 1 ? " property" : " properties") +
        (merged ? " (" + merged + " merged with a key on the same frame)" : "") + ".");
    }
  });
})();
