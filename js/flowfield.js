/* flowfield.js — 流场采样器
 * 全局契约： window.FlowField
 *
 *   FlowField.create(opts) -> instance
 *     opts: { noise, scale, speed, swirl, turbulence }
 *           noise      : Noise 实例（必须提供，见 noise.js 契约）
 *           scale      : 噪声空间尺度，默认 0.0016（越小花纹越大）
 *           speed      : 像素/秒 基准速度，默认 90
 *           swirl      : 全局旋转偏置（弧度/单位长度），默认 0.35
 *           turbulence : fbm 层数，默认 3
 *
 *   instance 方法：
 *     configure(partial)        -> 更新任意参数，返回 this
 *     angle(x, y)               -> 弧度，流场在该点的方向
 *     sample(x, y, out?)        -> [vx, vy] 像素/秒；传入 out 数组可零分配复用
 *     probe(x, y)               -> { angle, speed, curl }  调试/可视化用
 *
 * 坐标系为 canvas 像素坐标（y 向下）。
 * 同一 noise seed + 同一参数下，angle/sample 必须纯函数、无副作用。
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    scale: 0.0016,
    speed: 90,
    swirl: 0.35,
    turbulence: 3
  };

  function create(opts) {
    opts = opts || {};
    if (!opts.noise || typeof opts.noise.fbm !== 'function') {
      throw new Error('FlowField.create 需要 { noise: Noise.create(seed) }');
    }

    var noise = opts.noise;
    var cfg = {
      scale: pick(opts.scale, DEFAULTS.scale),
      speed: pick(opts.speed, DEFAULTS.speed),
      swirl: pick(opts.swirl, DEFAULTS.swirl),
      turbulence: pick(opts.turbulence, DEFAULTS.turbulence)
    };

    function pick(v, d) {
      return (typeof v === 'number' && isFinite(v)) ? v : d;
    }

    function configure(partial) {
      if (!partial) return api;
      for (var k in cfg) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) {
          var v = partial[k];
          if (typeof v === 'number' && isFinite(v)) cfg[k] = v;
        }
      }
      return api;
    }

    // 流函数旋度场：ψ = fbm，v = (∂ψ/∂y, -∂ψ/∂x)
    // 数学上无散度，流线长且连贯——这是「墨流」的骨架。
    // 用中心差分求梯度；eps 取噪声空间里的一个小区间。
    function grad(x, y) {
      var s = cfg.scale;
      var e = 0.75;                    // 噪声空间差分步长（像素折算后足够小）
      var xs = x * s, ys = y * s;
      var es = e * s * 40;             // 转成噪声域步长
      var turb = cfg.turbulence;
      var dpx = (noise.fbm(xs + es, ys, turb) - noise.fbm(xs - es, ys, turb)) / (2 * es);
      var dpy = (noise.fbm(xs, ys + es, turb) - noise.fbm(xs, ys - es, turb)) / (2 * es);
      return [dpy, -dpx];              // 旋转 90° → 无散
    }

    // 主方向（弧度）
    function angle(x, y) {
      var g = grad(x, y);
      var len = Math.sqrt(g[0] * g[0] + g[1] * g[1]);
      var a;
      if (len < 1e-9) {
        a = cfg.swirl;                 // 退化点给一个确定方向，避免 NaN
      } else {
        a = Math.atan2(g[1], g[0]);
      }
      // 全局旋度偏置：整体缓慢斜切，让构图有方向感
      a += cfg.swirl * 0.55 * Math.sin((x - y) * 0.0006);
      return a;
    }

    // 速度场（像素/秒），out 可选，零分配
    function sample(x, y, out) {
      var s = cfg.scale;
      var e = 30 * s;
      var xs = x * s, ys = y * s;
      var turb = cfg.turbulence;
      var dpx = (noise.fbm(xs + e, ys, turb) - noise.fbm(xs - e, ys, turb)) / (2 * e);
      var dpy = (noise.fbm(xs, ys + e, turb) - noise.fbm(xs, ys - e, turb)) / (2 * e);
      var vx = dpy, vy = -dpx;
      var len = Math.sqrt(vx * vx + vy * vy);
      // 局部速度倍率：让流有快慢层次（契约：speed * local）
      var local = 0.55 + 0.45 * (0.5 + 0.5 * noise.fbm(xs * 2.1, ys * 2.1, 2));
      var sp = cfg.speed * local;
      if (len < 1e-9) {
        // 退化点：给个确定的弱流，防止粒子卡死
        var a0 = cfg.swirl * 0.55 + 1.1;
        vx = Math.cos(a0) * sp * 0.15;
        vy = Math.sin(a0) * sp * 0.15;
      } else {
        var k = sp / len;
        vx *= k; vy *= k;
      }
      // 全局旋度偏置
      var bias = cfg.swirl * 0.55 * Math.sin((x - y) * 0.0006);
      var cs = Math.cos(bias), sn = Math.sin(bias);
      var rx = vx * cs - vy * sn;
      var ry = vx * sn + vy * cs;
      if (out) { out[0] = rx; out[1] = ry; return out; }
      return [rx, ry];
    }

    function probe(x, y) {
      var a = angle(x, y);
      var v = sample(x, y, null);
      return { angle: a, speed: Math.sqrt(v[0] * v[0] + v[1] * v[1]), curl: cfg.swirl };
    }

    var api = {
      noise: noise,
      config: cfg,
      configure: configure,
      angle: angle,
      sample: sample,
      probe: probe
    };
    return api;
  }

  global.FlowField = { create: create, DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
