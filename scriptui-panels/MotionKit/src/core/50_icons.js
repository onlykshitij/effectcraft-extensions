// SPDX-License-Identifier: MIT OR Apache-2.0
// Duotone vector icons on a 24 x 24 design grid, drawn with ScriptUIGraphics. EffectCraft's
// graphics have lines, rects and ellipses but no curves, so curves and arcs are flattened here.
//
// An icon is an array of layers. A layer is a path string (stroked in the foreground colour) or
// {d, stroke, fill, w, alpha}: stroke / fill are "fg", "accent" or a hex colour, w is the pen
// width in design units (default 1.6). Path commands, absolute design units:
//   M x y, L x y, H x, V y, Q x1 y1 x y, C x1 y1 x2 y2 x y, Z
//   A cx cy r a0 a1          arc, degrees, 0 = +x, clockwise on screen (joins the current point)
//   O cx cy r                circle            E cx cy rx ry      ellipse
//   R x y w h                rectangle         U x y w h r        rounded rectangle
//   P cx cy r n rot          regular polygon   S cx cy r1 r2 n rot  star (n points)
// An icon can also be a function(g, x, y, size, fg, accent) that draws itself; fg and accent
// are [r, g, b, a].

MK.icons = (function () {
  var U = MK.util;
  var CURVE_STEPS = 10;
  var cache = {};

  var G = {};
  G.quad = function (p0, p1, p2, steps) {
    var out = [], n = steps || CURVE_STEPS;
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return out;
  };
  G.cubic = function (p0, p1, p2, p3, steps) {
    var out = [], n = steps || CURVE_STEPS;
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return out;
  };
  // Points along an arc from a0 to a1 degrees (both included).
  G.arc = function (cx, cy, rx, ry, a0, a1) {
    var out = [], n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 15));
    for (var i = 0; i <= n; i++) {
      var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  };
  G.roundRect = function (x, y, w, h, r) {
    var k = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!k) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    return [].concat(G.arc(x + w - k, y + k, k, k, -90, 0), G.arc(x + w - k, y + h - k, k, k, 0, 90),
      G.arc(x + k, y + h - k, k, k, 90, 180), G.arc(x + k, y + k, k, k, 180, 270));
  };
  G.star = function (cx, cy, r1, r2, n, rot) {
    var out = [], m = Math.max(2, Math.round(n));
    for (var i = 0; i < 2 * m; i++) {
      var a = ((rot || 0) - 90 + i * 180 / m) * Math.PI / 180, r = i % 2 ? r2 : r1;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  };
  G.polygon = function (cx, cy, r, n, rot) {
    var out = [], m = Math.max(3, Math.round(n));
    for (var i = 0; i < m; i++) {
      var a = ((rot || 0) - 90 + i * 360 / m) * Math.PI / 180;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  };

  var ARGS = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0, A: 5, O: 3, E: 4, R: 4, U: 5, P: 5, S: 6 };

  // Path string -> [{pts: [[x, y]...], closed}] in design units.
  function compile(d) {
    if (U.has(cache, d)) return cache[d];
    var tok = String(d).match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE]-?\d+)?/g) || [];
    var subs = [], cur = null, pos = [0, 0], i = 0;
    function start(p) { cur = { pts: [p], closed: false }; subs.push(cur); pos = p; }
    function to(p) { if (!cur) start(pos); cur.pts.push(p); pos = p; }
    function shape(pts) { subs.push({ pts: pts, closed: true }); cur = null; }
    while (i < tok.length) {
      var c = tok[i++];
      if (!U.has(ARGS, c)) continue;
      var a = [];
      for (var k = 0; k < ARGS[c]; k++) a.push(Number(tok[i++]));
      if (c === "M") start([a[0], a[1]]);
      else if (c === "L") to([a[0], a[1]]);
      else if (c === "H") to([a[0], pos[1]]);
      else if (c === "V") to([pos[0], a[0]]);
      else if (c === "Q") { var q = G.quad(pos, [a[0], a[1]], [a[2], a[3]]); for (var j = 0; j < q.length; j++) to(q[j]); }
      else if (c === "C") { var cu = G.cubic(pos, [a[0], a[1]], [a[2], a[3]], [a[4], a[5]]); for (var m = 0; m < cu.length; m++) to(cu[m]); }
      else if (c === "A") {
        var ar = G.arc(a[0], a[1], a[2], a[2], a[3], a[4]);
        if (cur) to(ar[0]); else start(ar[0]);
        for (var n = 1; n < ar.length; n++) to(ar[n]);
      } else if (c === "Z") { if (cur) { cur.closed = true; pos = cur.pts[0]; cur = null; } }
      else if (c === "O") shape(G.arc(a[0], a[1], a[2], a[2], 0, 360).slice(0, -1));
      else if (c === "E") shape(G.arc(a[0], a[1], a[2], a[3], 0, 360).slice(0, -1));
      else if (c === "R") shape([[a[0], a[1]], [a[0] + a[2], a[1]], [a[0] + a[2], a[1] + a[3]], [a[0], a[1] + a[3]]]);
      else if (c === "U") shape(G.roundRect(a[0], a[1], a[2], a[3], a[4]));
      else if (c === "P") shape(G.polygon(a[0], a[1], a[2], a[3], a[4]));
      else if (c === "S") shape(G.star(a[0], a[1], a[2], a[3], a[4], a[5]));
    }
    cache[d] = subs;
    return subs;
  }

  function color(spec, fg, accent) {
    if (spec === "fg") return fg;
    if (spec === "accent") return accent;
    var c = U.hexToRgb(spec);
    return c ? [c[0], c[1], c[2], 1] : fg;
  }

  function withAlpha(c, a) { return a === undefined ? c : [c[0], c[1], c[2], c[3] * a]; }

  function tracePath(g, subs, x, y, k) {
    g.newPath();
    for (var i = 0; i < subs.length; i++) {
      var pts = subs[i].pts;
      g.moveTo(x + pts[0][0] * k, y + pts[0][1] * k);
      for (var j = 1; j < pts.length; j++) g.lineTo(x + pts[j][0] * k, y + pts[j][1] * k);
      if (subs[i].closed) g.closePath();
    }
  }

  // Draws `icon` in the size x size square at (x, y). fg and accent are hex colours.
  function draw(g, icon, x, y, size, fgHex, accentHex) {
    var fg = U.rgba(fgHex), accent = U.rgba(accentHex);
    if (typeof icon === "function") return icon(g, x, y, size, fg, accent);
    if (!U.isArray(icon)) icon = BUILTIN.missing;
    var k = size / 24;
    for (var i = 0; i < icon.length; i++) {
      var L = typeof icon[i] === "string" ? { d: icon[i] } : icon[i];
      if (!L || !L.d) continue;
      var subs = compile(L.d);
      if (!subs.length) continue;
      var stroke = L.stroke || (L.fill ? null : "fg");
      if (L.fill) {
        tracePath(g, subs, x, y, k);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, withAlpha(color(L.fill, fg, accent), L.alpha)));
      }
      if (stroke) {
        tracePath(g, subs, x, y, k);
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, withAlpha(color(stroke, fg, accent), L.alpha), Math.max(1, (L.w || 1.6) * k)));
      }
    }
  }

  // Built-in icons that aren't tools.
  var BUILTIN = {
    // A magnifier (the lens).
    command: [{ d: "O10 10 5.5", stroke: "accent", w: 2 }, { d: "M14.2 14.2 L20 20", w: 2.4 }],
    // {} braces (the dot).
    libExpression: [
      "M9 4 Q6 4 6 7 L6 9.6 Q6 12 3.8 12 Q6 12 6 14.4 L6 17 Q6 20 9 20",
      "M15 4 Q18 4 18 7 L18 9.6 Q18 12 20.2 12 Q18 12 18 14.4 L18 17 Q18 20 15 20",
      { d: "O12 12 1.9", fill: "accent" }
    ],
    // A terminal prompt >_ (the cursor).
    libScript: ["U3 4.5 18 15 2.2", "M7 9.5 L10 12 L7 14.5", { d: "R12 14.2 5 2", fill: "accent" }],
    // A "?" in a circle.
    missing: ["O12 12 9", "M9.2 9.6 Q9.2 6.6 12 6.6 Q14.8 6.6 14.8 9.2 Q14.8 11 12.9 11.9 Q12 12.4 12 14.2", { d: "O12 17.4 1.2", fill: "fg" }]
  };

  // PNG icons of library items, loaded once. null when the file is missing or not a PNG.
  var images = {};
  function image(path) {
    var p = String(path || "");
    if (!p) return null;
    if (U.has(images, p)) return images[p];
    var img = null;
    try {
      var f = new File(p);
      if (/\.png$/i.test(p) && f.exists) img = ScriptUI.newImage(f);
    } catch (e) {
      img = null;
    }
    images[p] = img;
    return img;
  }

  return { draw: draw, compile: compile, geom: G, builtin: BUILTIN, image: image };
})();
