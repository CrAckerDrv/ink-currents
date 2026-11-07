/* noise.js — 确定性噪声引擎
 * 全局契约： window.Noise
 *   Noise.create(seed)        -> 噪声实例
 *   实例方法：
 *     n2(x, y)                -> [-1, 1] 二维 simplex 风格噪声
 *     fbm(x, y, octaves, lac, gain) -> [-1,1] 分形叠加（默认 4 层）
 *     curl(x, y, eps)         -> [dx, dy] 基于噪声梯度的无散度流场向量
 *     rand()                  -> [0,1) 确定性随机
 *     range(a, b)             -> [a,b) 确定性随机
 *   所有函数对同一 seed 必须完全确定性（同参数同结果）。
 */
(function (global) {
  'use strict';

  var GRAD2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function create(seed) {
    var s = (seed === undefined || seed === null) ? 1337 : seed;
    var rand = mulberry32(s >>> 0);

    // 构建置换表
    var p = new Uint8Array(512);
    var perm = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];

    function dot(gi, x, y) {
      var g = GRAD2[gi & 7];
      return g[0] * x + g[1] * y;
    }

    // 二维 simplex 噪声
    function n2(x, y) {
      var F2 = 0.5 * (Math.sqrt(3) - 1);
      var G2 = (3 - Math.sqrt(3)) / 6;

      var skew = (x + y) * F2;
      var iIdx = Math.floor(x + skew);
      var jIdx = Math.floor(y + skew);

      var unskew = (iIdx + jIdx) * G2;
      var x0 = x - (iIdx - unskew);
      var y0 = y - (jIdx - unskew);

      var i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;

      var ii = iIdx & 255, jj = jIdx & 255;

      var gi0 = p[p[ii + p[jj]]] % 8;
      var gi1 = p[p[ii + i1 + p[jj + j1]]] % 8;
      var gi2 = p[p[ii + 1 + p[jj + 1]]] % 8;

      var t0 = 0.5 - x0 * x0 - y0 * y0;
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      var t2 = 0.5 - x2 * x2 - y2 * y2;

      var n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(gi0, x0, y0));
      var n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(gi1, x1, y1));
      var n2v = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(gi2, x2, y2));

      return 70 * (n0 + n1 + n2v);
    }

    function fbm(x, y, octaves, lacunarity, gain) {
      var oct = octaves || 4;
      var lac = lacunarity === undefined ? 2 : lacunarity;
      var g = gain === undefined ? 0.5 : gain;
      var amp = 1, freq = 1, sum = 0, norm = 0;
      for (var o = 0; o < oct; o++) {
        sum += amp * n2(x * freq, y * freq);
        norm += amp;
        amp *= g;
        freq *= lac;
      }
      return norm ? sum / norm : 0;
    }

    // 用两个噪声场构造近似无散的旋度场
    function curl(x, y, eps) {
      var e = eps || 0.001;
      var n1 = fbm(x, y + e, 3);
      var n2a = fbm(x, y - e, 3);
      var n3 = fbm(x + e, y, 3);
      var n4 = fbm(x - e, y, 3);
      var dy = (n1 - n2a) / (2 * e);
      var dx = (n3 - n4) / (2 * e);
      // 旋转 90° 得到旋度方向
      return [dy, -dx];
    }

    return {
      seed: s,
      n2: n2,
      fbm: fbm,
      curl: curl,
      rand: rand,
      range: function (a, b) { return a + (b - a) * rand(); }
    };
  }

  global.Noise = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
