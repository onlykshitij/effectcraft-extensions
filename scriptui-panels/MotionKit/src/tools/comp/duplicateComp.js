// SPDX-License-Identifier: MIT OR Apache-2.0
// Duplicate Comp: duplicates the comps selected in the Project panel (or the active comp).
// Deep (default) also duplicates every nested precomp, once each however often it is used (a map
// from comp id to copy, filled before recursing, also stops cycles), and points the copies' layers
// at the copies with AVLayer.replaceSource. Copies are named "<name> 2", "<name> 3"... or
// "<name><suffix>". Every expression in the copies that names a duplicated comp with
// comp("<old name>") is rewritten to the copy's name.

(function () {
  var NAME = "Duplicate Comp", U = MK.util;

  // True when an item other than `self` has the name.
  function taken(name, self) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it.name === name && it.id !== self.id) return true;
    }
    return false;
  }

  function newName(name, suffix, self) {
    var base = suffix ? name + suffix : name;
    if (suffix && !taken(base, self)) return base;
    for (var i = 2; i < 100000; i++) if (!taken(base + " " + i, self)) return base + " " + i;
    return base + " " + U.randomId(4);
  }

  // Layer.replaceSource needs EffectCraft's layer.replaceSource command (after 0.14).
  function canReplaceSource() {
    try {
      var cmds = app.run("command.list", {});
      for (var i = 0; i < cmds.length; i++) if (cmds[i].id === "layer.replaceSource") return true;
    } catch (e) {}
    return false;
  }

  // A replace() callback, so "$" in a comp name stays literal.
  function literal(s) { return function () { return s; }; }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }

  // Rewrites comp("old") / comp('old') in every expression under `group`. Returns the count.
  function rewrite(group, renames) {
    var n = 0;
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p instanceof PropertyGroup) {
        n += rewrite(p, renames);
        continue;
      }
      if (!(p instanceof Property) || !p.canSetExpression || !p.expression) continue;
      var e = p.expression, e2 = e;
      for (var k = 0; k < renames.length; k++) e2 = e2.replace(renames[k].re, literal(renames[k].to));
      if (e2 !== e) {
        p.expression = e2;
        n++;
      }
    }
    return n;
  }

  MK.registerTool({
    id: "duplicateComp",
    name: NAME,
    category: "Comp",
    needsComp: false,
    description: "Duplicates the selected comps (or the active comp), with their nested precomps, and fixes comp(\"name\") expressions.",
    // Two stacked frames (the front frame).
    icon: [
      "M4 15 V4 H15",
      "M7 18 V7 H18",
      { d: "R10 10 11 11", stroke: "accent", w: 2 }
    ],
    options: [
      { key: "deep", label: "Deep: also duplicate nested precomps", type: "checkbox", "default": true },
      { key: "suffix", label: "Name suffix", type: "text", "default": "", maxLength: 100, help: "Empty names copies \"<name> 2\", \"<name> 3\"...; otherwise \"<name><suffix>\"." }
    ],
    run: function (ctx, o) {
      var roots = U.filter(app.project.selection, function (it) { return it instanceof CompItem; });
      if (!roots.length && ctx.comp) roots = [ctx.comp];
      if (!roots.length) ctx.fail("select one or more comps in the Project panel, or open a comp.");
      var deep = o.deep && canReplaceSource();
      if (o.deep && !deep) ctx.warn("Nested precomps weren't duplicated: this EffectCraft has no Layer.replaceSource, so the copies still use the original precomps.");

      var copies = {}, list = [], i;
      function dup(c) {
        if (U.has(copies, c.id)) return copies[c.id];
        var d = c.duplicate();
        d.name = newName(c.name, o.suffix, d);
        copies[c.id] = d;
        list.push({ from: c, to: d });
        if (!deep) return d;
        for (var j = 1; j <= d.numLayers; j++) {
          var L = d.layer(j);
          if (L instanceof AVLayer && L.source instanceof CompItem) {
            var nd = dup(L.source);
            if (nd.id !== L.source.id) L.replaceSource(nd, false);
          }
        }
        return d;
      }
      for (i = 0; i < roots.length; i++) dup(roots[i]);

      var renames = U.map(list, function (c) {
        return { re: new RegExp("comp\\(\\s*([\"'])" + escapeRe(c.from.name) + "\\1\\s*\\)", "g"), to: "comp(" + JSON.stringify(c.to.name) + ")" };
      });
      var rewritten = 0;
      for (i = 0; i < list.length; i++) {
        var d = list[i].to;
        for (var j = 1; j <= d.numLayers; j++) rewritten += rewrite(d.layer(j), renames);
        ctx.created.push(d);
      }
      var nested = list.length - roots.length;
      return ctx.done("Duplicated " + roots.length + (roots.length === 1 ? " comp" : " comps") +
        (deep ? " and " + nested + (nested === 1 ? " nested precomp" : " nested precomps") : "") +
        "; rewrote " + rewritten + (rewritten === 1 ? " expression." : " expressions."));
    }
  });
})();
