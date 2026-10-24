// SPDX-License-Identifier: MIT OR Apache-2.0
// The command box: a text field in the panel header. Typing lists the tools and library items
// whose name contains every typed word (any case); Enter runs the first match.
// EffectCraft's ScriptUI sends scripts no key events, so there is no Up/Down choice or Esc:
// more words narrow the matches, and the x button clears the field. EffectCraft also commits a
// text field when it loses focus, so leaving the field with text in it runs the first match too.

MK.commandBox = (function () {
  var U = MK.util;
  var SHOWN = 3;

  // Matching catalog entries, best first: names starting with the first word, then by name.
  function search(query, catalog) {
    var words = U.filter(U.trim(query).toLowerCase().split(/\s+/), function (w) { return !!w; });
    if (!words.length) return [];
    var list = catalog || MK.catalog(), out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i], hay = (e.name + " " + e.id + " " + e.category).toLowerCase(), all = true;
      for (var j = 0; j < words.length && all; j++) if (hay.indexOf(words[j]) < 0) all = false;
      if (all) out.push(e);
    }
    out.sort(function (a, b) {
      var sa = a.name.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1, sb = b.name.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  // Adds the box to `parent`. opts.after(result) runs after a tool ran. With opts.width the box
  // is exactly that wide: the field and the clear button, with the matches on a line below.
  function attach(parent, opts) {
    var o = opts || {};
    var box = parent.add("group");
    box.orientation = "column";
    box.alignChildren = ["left", "top"];
    box.spacing = 2;
    box.margins = 0;
    var row = box.add("group");
    row.orientation = "row";
    row.alignChildren = ["left", "center"];
    row.spacing = 2;
    row.margins = 0;
    var et = row.add("edittext", undefined, "");
    et.characters = 12;
    et.helpTip = "Find a tool: type words of its name, then press Enter to run the first match.";
    var hint = (o.width ? box : row).add("statictext", undefined, "");
    hint.preferredSize = [o.width || 150, 16];
    hint.enabled = false;
    hint.helpTip = "The matching tools; Enter runs the first";
    var clr = row.add("button", undefined, "×");
    clr.preferredSize = [22, 22];
    clr.helpTip = "Clear";
    if (o.width) et.preferredSize = [Math.max(40, o.width - 24), 22];
    var C = { box: box, row: row, edit: et, hint: hint, clear: clr, matches: [] };
    C.filter = function (text) {
      C.matches = search(text);
      var names = U.map(C.matches.slice(0, SHOWN), function (m) { return m.name; });
      hint.text = !U.trim(text) ? "" : names.length ? "↵ " + names.join(", ") + (C.matches.length > SHOWN ? ", …" : "") : "no match";
      return C.matches;
    };
    // Runs the first match and clears the field. Returns the run result or null.
    C.runFirst = function () {
      var m = C.matches[0];
      et.text = "";
      C.filter("");
      if (!m) return null;
      var r = MK.run(m.id);
      if (o.after) o.after(r);
      return r;
    };
    et.onChanging = function () { C.filter(et.text); };
    et.onChange = function () {
      if (!U.trim(et.text)) return;
      C.filter(et.text);
      C.runFirst();
    };
    clr.onClick = function () {
      et.text = "";
      C.filter("");
    };
    return C;
  }

  return { search: search, attach: attach };
})();
