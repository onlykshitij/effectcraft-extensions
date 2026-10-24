// SPDX-License-Identifier: MIT OR Apache-2.0
// The settings store: JSON values in app.settings, section "MotionKit". Keys: layouts,
// activeLayout, toolOptions, library, rev, plus any key a tool keeps its own data under.
// Every save bumps `rev`; open panels poll it and rebuild, so an edit in one panel shows in all.

MK.settings = (function () {
  var SECTION = "MotionKit";

  function raw(key) {
    try {
      return app.settings.haveSetting(SECTION, key) ? app.settings.getSetting(SECTION, key) : null;
    } catch (e) {
      return null;
    }
  }

  // The parsed value, or `fallback` when it is missing or not valid JSON.
  function get(key, fallback) {
    var t = raw(key);
    if (t === null || t === "") return fallback;
    try {
      return JSON.parse(t);
    } catch (e) {
      return fallback;
    }
  }

  function rev() {
    var r = get("rev", 0);
    return MK.util.isNum(r) ? r : 0;
  }

  // Save several keys, then bump rev once. Returns the new rev.
  function setMany(map) {
    var keys = MK.util.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var text = JSON.stringify(map[keys[i]]);
      try {
        app.settings.saveSetting(SECTION, keys[i], text === undefined ? "null" : text);
      } catch (e) {
        MK.fail("Motion Kit couldn't save its settings (" + keys[i] + "): " + MK.util.errText(e));
      }
    }
    var r = rev() + 1;
    app.settings.saveSetting(SECTION, "rev", String(r));
    return r;
  }

  function set(key, value) {
    var m = {};
    m[key] = value;
    return setMany(m);
  }

  return { SECTION: SECTION, get: get, set: set, setMany: setMany, rev: rev };
})();
