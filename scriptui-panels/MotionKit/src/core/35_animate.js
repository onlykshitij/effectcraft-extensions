// SPDX-License-Identifier: MIT OR Apache-2.0
// Keyframe helpers the Animate tools share (Ease Keyframes, Ease Copy, Sequencer, Clone Keys,
// Fix Keys): writing a key without losing its interpolation, moving keys, and the average speed
// of a segment that temporal ease speeds are measured against.

MK.anim = (function () {
  var U = MK.util, K = MK.keys;
  var A = {};

  // MK.keys.write; a key read as selected is selected again.
  A.write = function (prop, k, time, parts) {
    var i = K.write(prop, k, time, parts);
    if (k.selected) prop.setSelectedAtKey(i, true);
    return i;
  };

  // MK.keys.writeAll at newTime(key), reselecting keys read as selected.
  A.writeAll = function (prop, ks, newTime) {
    K.writeAll(prop, ks, newTime);
    for (var j = 0; j < ks.length; j++) if (ks[j].selected) prop.setSelectedAtKey(prop.nearestKeyIndex(newTime(ks[j])), true);
    return ks.length;
  };

  // Moves keys `indices` (1-based) of prop to newTime(key): all are read, removed, then written,
  // so they can't land on each other. A key landing on an unmoved key replaces it. Unmoved
  // roving keys are rewritten in place first: removing a roving key's neighbours ends its roving.
  A.move = function (prop, indices, newTime) {
    var moving = {}, stay = [];
    for (var j = 0; j < indices.length; j++) moving[indices[j]] = true;
    for (var i = 1; i <= prop.numKeys; i++) if (!moving[i] && prop.keyRoving(i)) stay.push(K.read(prop, i));
    var ks = U.map(indices, function (i) { return K.read(prop, i); });
    K.remove(prop, indices.concat(U.map(stay, function (k) { return k.index; })));
    A.writeAll(prop, stay.concat(ks), function (k) { return moving[k.index] ? newTime(k) : k.time; });
    return ks.length;
  };

  // The properties among `props` that have selected keyframes.
  A.withSelectedKeys = function (props) {
    return U.filter(props, function (p) { return MK.sel.isAnimatable(p) && MK.sel.selectedKeys(p).length > 0; });
  };

  // Length of a cubic Bezier through p0..p3 (2D or 3D), by 100 straight pieces.
  function arcLength(p0, p1, p2, p3) {
    var len = 0, prev = p0;
    for (var s = 1; s <= 100; s++) {
      var t = s / 100, u = 1 - t, q = [], d2 = 0;
      for (var d = 0; d < p0.length; d++) {
        q.push(u * u * u * p0[d] + 3 * u * u * t * p1[d] + 3 * u * t * t * p2[d] + t * t * t * p3[d]);
        d2 += (q[d] - prev[d]) * (q[d] - prev[d]);
      }
      len += Math.sqrt(d2);
      prev = q;
    }
    return len;
  }

  // The average speed from key a to key b, one entry per temporal ease dimension, in the units
  // KeyframeEase speeds use: signed per dimension, or the path length per second for spatial
  // and other single-ease array values. Seconds of layer time: EffectCraft measures ease speeds
  // there, so a 200 % stretched layer needs twice the speed (key times are comp time).
  A.avgSpeed = function (prop, a, b) {
    var dims = prop.keyOutTemporalEase(a).length, dt = (prop.keyTime(b) - prop.keyTime(a)) * 100 / (MK.sel.layerOf(prop).stretch || 100);
    var va = prop.keyValue(a), vb = prop.keyValue(b), out = [];
    if (!(dt > 0)) dt = 1;
    if (!U.isArray(va)) return [(vb - va) / dt];
    if (dims === 1) {
      var n = Math.min(va.length, vb.length, prop.isSpatial ? 3 : 4), p0 = [], p3 = [], p1 = [], p2 = [];
      var to = prop.isSpatial ? prop.keyOutSpatialTangent(a) : [], ti = prop.isSpatial ? prop.keyInSpatialTangent(b) : [];
      for (var d = 0; d < n; d++) {
        p0.push(va[d]);
        p3.push(vb[d]);
        p1.push(va[d] + (to[d] || 0));
        p2.push(vb[d] + (ti[d] || 0));
      }
      return [arcLength(p0, p1, p2, p3) / dt];
    }
    for (var e = 0; e < dims; e++) out.push(((vb[e] || 0) - (va[e] || 0)) / dt);
    return out;
  };

  return A;
})();
