/* palette.js — 色板引擎
 * 全局契约： window.Palette
 *   Palette.NAMES           -> string[]
 *   Palette.get(name)       -> { name, bg:[r,g,b], colors:[[r,g,b],...], accent:[r,g,b] }
 *   Palette.list()          -> [{name, ...}]
 *   Palette.blend(a,b,t)    -> [r,g,b] 线性插值
 *   Palette.rgb(rgb,a)      -> css 字符串
 * 所有颜色为 0-255 整数三元组。
 */
(function (global) {
  'use strict';

  var RAW = {
    // 深海：靛蓝底 + 生物荧光
    abyss: {
      label: '深海',
      bg: [6, 10, 22],
      colors: [[26, 92, 158], [12, 156, 168], [96, 214, 199], [196, 244, 231], [232, 118, 84]],
      accent: [96, 214, 199]
    },
    // 峡谷：赭石与落日
    canyon: {
      label: '峡谷',
      bg: [24, 14, 12],
      colors: [[124, 46, 34], [196, 98, 45], [232, 160, 74], [250, 214, 160], [86, 132, 116]],
      accent: [232, 160, 74]
    },
    // 午夜花园：紫罗兰 + 月光绿
    garden: {
      label: '午夜花园',
      bg: [14, 12, 28],
      colors: [[86, 52, 148], [148, 96, 208], [214, 180, 248], [142, 226, 172], [250, 240, 250]],
      accent: [148, 226, 172]
    },
    // 墨：宣纸灰阶 + 一点朱砂
    sumi: {
      label: '墨',
      bg: [242, 239, 232],
      colors: [[38, 38, 42], [92, 96, 104], [150, 154, 160], [206, 208, 210], [186, 56, 48]],
      accent: [186, 56, 48]
    },
    // 极光：冷青 + 洋红
    aurora: {
      label: '极光',
      bg: [8, 10, 20],
      colors: [[34, 211, 204], [74, 144, 226], [154, 108, 246], [238, 108, 186], [236, 248, 255]],
      accent: [238, 108, 186]
    }
  };

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  function clone(rgb) {
    return [rgb[0], rgb[1], rgb[2]];
  }

  function get(name) {
    var key = RAW[name] ? name : 'abyss';
    var src = RAW[key];
    return {
      name: key,
      label: src.label,
      bg: clone(src.bg),
      colors: src.colors.map(clone),
      accent: clone(src.accent)
    };
  }

  function list() {
    return Object.keys(RAW).map(function (k) {
      return get(k);
    });
  }

  function blend(a, b, t) {
    var tt = t < 0 ? 0 : t > 1 ? 1 : t;
    return [
      clamp255(a[0] + (b[0] - a[0]) * tt),
      clamp255(a[1] + (b[1] - a[1]) * tt),
      clamp255(a[2] + (b[2] - a[2]) * tt)
    ];
  }

  function rgb(c, alpha) {
    if (alpha === undefined) {
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  }

  global.Palette = {
    NAMES: Object.keys(RAW),
    get: get,
    list: list,
    blend: blend,
    rgb: rgb
  };
})(typeof window !== 'undefined' ? window : globalThis);
