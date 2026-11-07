/* main.js — 合成层：把噪声 / 流场 / 色板拼成一件活的画
 *
 * 依赖（加载顺序）：window.Noise、window.FlowField、window.Palette
 *
 * 美术设计：
 *   1. 两级粒子。hair = 大量细发丝，快、细、亮；ribbon = 少量宽绸带，
 *      慢、粗、淡、寿命长。粗淡的底 + 细亮的面 = 纵深与体积。
 *   2. 按 (类别 × 色相 × 浓淡) 分桶批量描边，减少 canvas 状态切换。
 *   3. 拖尾靠半透明背景覆盖实现；每帧覆盖量决定丝线长度记忆。
 *   4. 色彩与浓淡都是空间场（低频噪声），所以色块成片、有留白。
 *   5. prefers-reduced-motion 时只画一帧静态累积图。
 */
(function (global) {
  'use strict';

  var Noise = global.Noise;
  var FlowField = global.FlowField;
  var Palette = global.Palette;

  if (!Noise || !FlowField || !Palette) {
    console.error('[art] 模块缺失：需要 Noise / FlowField / Palette 先加载');
    return;
  }

  /* ---------------- 参数 ---------------- */
  var CFG = {
    maxParticles: 3400,
    pxPerParticle: 230,      // 每多少 CSS 像素一个粒子
    trail: 0.024,            // 背景覆盖量：越小拖尾越长
    segAlpha: 0.5,           // 单段线基础透明度
    paletteLerp: 0.035,
    reseedMs: 32000,
    fadeFrames: 32,
    colorScale: 0.00042,     // 色彩场频率：极低频 → 大片色区
    densityScale: 0.0026,    // 浓淡场频率
    ribbonRatio: 0.17,       // 绸带占全部粒子的比例
    pointerRadius: 250
  };

  var NCOL = 5;              // 色相数（= 色板颜色数）
  var TIERS = 3;             // 浓淡档
  var CLASSES = 2;           // 0 = hair, 1 = ribbon
  var NBUCKET = CLASSES * NCOL * TIERS;

  var TIER_MUL = [0.34, 0.68, 1.0];
  var CLASS_WIDTH = [0.85, 2.7];
  var CLASS_ALPHA = [1.0, 0.42];

  /* ---------------- DOM ---------------- */
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  var statusEl = document.getElementById('status');
  var seedLabelEl = document.getElementById('seedLabel');
  var paletteSel = document.getElementById('palette');
  var els = {
    seed: document.getElementById('seedBtn'),
    pause: document.getElementById('pauseBtn'),
    save: document.getElementById('saveBtn'),
    hide: document.getElementById('hideBtn')
  };

  var reduceMotion = false;
  try {
    reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* 老浏览器忽略 */ }

  /* ---------------- 状态 ---------------- */
  var state = {
    seed: (Math.random() * 1e9) | 0,
    from: Palette.get('abyss'),
    to: Palette.get('abyss'),
    mix: 1,
    paused: false,
    pointer: { x: 0, y: 0, on: false, power: 0 },
    fade: 0,
    frames: 0,
    lastSeedAt: 0
  };

  var W = 0, H = 0, DPR = 1;
  var noise, field, colorNoise;

  /* ---------------- 粒子池（TypedArray，热循环零分配） ---------------- */
  var N = CFG.maxParticles;
  var ppx = new Float32Array(N);
  var ppy = new Float32Array(N);
  var pvx = new Float32Array(N);
  var pvy = new Float32Array(N);
  var age = new Float32Array(N);
  var life = new Float32Array(N);
  var bucketOf = new Uint8Array(N);
  var cls = new Uint8Array(N);
  var alive = 0;

  var buckets = [];
  for (var bi = 0; bi < NBUCKET; bi++) buckets.push([]);

  var tmpV = [0, 0];
  var styleCache = new Array(NBUCKET);
  var glowCache = new Array(NBUCKET);

  /* ---------------- 场 ---------------- */
  function rebuild(seed) {
    state.seed = seed >>> 0;
    noise = Noise.create(state.seed);
    colorNoise = Noise.create((state.seed ^ 0x9e3779b9) >>> 0);

    field = FlowField.create({
      noise: noise,
      scale: 0.0010 + (state.seed % 977) / 977 * 0.0012,
      speed: 80 + (state.seed % 61),
      swirl: 0.10 + (state.seed % 71) / 71 * 0.45,
      turbulence: 3
    });

    for (var i = 0; i < alive; i++) respawn(i, true);
    updateStatus('种子 ' + state.seed);
    if (seedLabelEl) seedLabelEl.textContent = ('000000' + state.seed).slice(-6);
  }

  function colorIndexAt(x, y) {
    var v = colorNoise.fbm(x * CFG.colorScale, y * CFG.colorScale, 3);
    var t = v * 0.5 + 0.5;
    var k = (t * NCOL) | 0;
    return k < 0 ? 0 : k >= NCOL ? NCOL - 1 : k;
  }

  function tierAt(x, y) {
    var d = noise.fbm(x * CFG.densityScale + 31.7, y * CFG.densityScale - 12.3, 3);
    var t = d * 0.5 + 0.5;
    // 偏态：多数偏淡，少数极浓 → 有浓淡而不是一层灰雾
    if (t < 0.46) return 0;
    if (t < 0.78) return 1;
    return 2;
  }

  function bucketIndex(c, col, tier) {
    return (c * NCOL + col) * TIERS + tier;
  }

  function respawn(i, scatter) {
    if (!noise) return;
    var x = noise.rand() * W;
    var y = noise.rand() * H;
    var c = noise.rand() < CFG.ribbonRatio ? 1 : 0;

    ppx[i] = x;
    ppy[i] = y;
    pvx[i] = 0;
    pvy[i] = 0;
    cls[i] = c;
    life[i] = c === 1 ? (900 + noise.rand() * 1400) : (380 + noise.rand() * 900);
    age[i] = scatter ? noise.rand() * life[i] : 0;
    bucketOf[i] = bucketIndex(c, colorIndexAt(x, y), tierAt(x, y));
  }

  /* ---------------- 颜色 ---------------- */
  var curColors = new Array(NCOL);
  var curAccent = [255, 255, 255];

  // 颜色只在色板混合进度真的变化时重算：静止时每帧 blend 是纯浪费
  var lastMix = -1, lastFrom = null, lastTo = null;
  var colorsVersion = 0;
  function refreshColors() {
    var a = state.from, b = state.to, t = state.mix;
    if (a === lastFrom && b === lastTo && t === lastMix) return;
    lastFrom = a; lastTo = b; lastMix = t;
    for (var i = 0; i < NCOL; i++) curColors[i] = Palette.blend(a.colors[i], b.colors[i], t);
    curAccent = Palette.blend(a.accent, b.accent, t);
    colorsVersion++;
  }

  function curBg() {
    return Palette.blend(state.from.bg, state.to.bg, state.mix);
  }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    DPR = Math.min(global.devicePixelRatio || 1, 2);
    W = Math.max(320, canvas.clientWidth || global.innerWidth);
    H = Math.max(320, canvas.clientHeight || global.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    alive = Math.min(N, Math.max(140, Math.round((W * H) / CFG.pxPerParticle)));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = Palette.rgb(curBg());
    ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < alive; i++) respawn(i, true);
    state.fade = CFG.fadeFrames;
  }

  /* ---------------- 样式表 ---------------- */
  var styleKey = '';
  function buildStyles(alpha, bgLum) {
    // 只有颜色或透明度真的变了才重建 30 条 rgba 字符串（每帧重建是纯浪费）
    var key = Math.round(alpha * 10000) + ':' + colorsVersion + ':' + (bgLum > 0.5 ? 1 : 0);
    if (key === styleKey) return;
    styleKey = key;
    for (var c = 0; c < CLASSES; c++) {
      for (var col = 0; col < NCOL; col++) {
        var rgb = curColors[col] || curColors[0];
        for (var t = 0; t < TIERS; t++) {
          var idx = bucketIndex(c, col, t);
          var a = alpha * TIER_MUL[t] * CLASS_ALPHA[c];
          // 浓淡两端的处理要跟着纸的明暗反转：
          //   暗底 —— 最浓档向 accent 提亮，才有「荧光点睛」
          //   浅底（宣纸）—— 最浓档向深墨压暗，否则浅色纸上的墨丝会被吞掉
          var light = bgLum > 0.5;
          var mixT = t === TIERS - 1 ? (c === 0 ? 0.42 : 0.22) : 0;
          var rc = light
            ? Palette.blend(rgb, [16, 16, 20], t === TIERS - 1 ? 0.56 : 0.20)
            : Palette.blend(rgb, curAccent, mixT);
          styleCache[idx] = 'rgba(' + rc[0] + ',' + rc[1] + ',' + rc[2] + ',' + a.toFixed(3) + ')';
          glowCache[idx] = 'rgba(' + rc[0] + ',' + rc[1] + ',' + rc[2] + ',' + (a * 0.22).toFixed(4) + ')';
        }
      }
    }
  }

  /* ---------------- 每帧步进 ---------------- */
  function step(dt) {
    var bg = curBg();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ',' + CFG.trail + ')';
    ctx.fillRect(0, 0, W, H);

    refreshColors();

    var fade = state.fade > 0 ? 1 - state.fade / CFG.fadeFrames : 1;
    // 背景越暗，墨线越要提亮，否则深色底上的细节会被吞掉
    var bgLum = (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114) / 255;
    // 暗底要提亮、浅底要压暗，两头都需要更高的不透明度才看得见「墨」
    var gain = bgLum > 0.5 ? 1 + bgLum * 1.55 : 1 + (1 - bgLum) * 1.15;
    buildStyles(CFG.segAlpha * (0.18 + 0.82 * fade) * gain, bgLum);

    var i;
    for (i = 0; i < NBUCKET; i++) buckets[i].length = 0;

    var pt = state.pointer;
    var ptrOn = pt.on && pt.power > 0.01;
    var ptx = pt.x, pty = pt.y, pw = pt.power;
    var R = CFG.pointerRadius;
    var vx, vy, x, y, ox, oy, dx, dy, dist, nx, ny, fall, mul;

    for (i = 0; i < alive; i++) {
      x = ppx[i]; y = ppy[i];

      field.sample(x, y, tmpV);
      mul = cls[i] === 1 ? 0.42 : 1.0;
      vx = tmpV[0] * mul;
      vy = tmpV[1] * mul;

      if (ptrOn) {
        dx = x - ptx; dy = y - pty;
        dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (dist < R) {
          fall = 1 - dist / R;
          fall *= fall * pw;
          nx = dx / dist; ny = dy / dist;
          vx += (-ny * 340 + nx * 130) * fall;
          vy += (nx * 340 + ny * 130) * fall;
        }
      }

      // 惯性平滑：丝线不抖
      pvx[i] += (vx - pvx[i]) * 0.14;
      pvy[i] += (vy - pvy[i]) * 0.14;

      ox = x; oy = y;
      x += pvx[i] * dt;
      y += pvy[i] * dt;
      age[i] += dt * 60;

      if (x < -8 || x > W + 8 || y < -8 || y > H + 8 || age[i] > life[i]) {
        respawn(i, false);
        continue;
      }

      ppx[i] = x; ppy[i] = y;
      buckets[bucketOf[i]].push(ox, oy, x, y);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 第一遍：绸带（粗、淡、慢）——画面的体块
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = CLASS_WIDTH[1];
    for (i = 0; i < NBUCKET; i++) {
      if ((i / (NCOL * TIERS)) | 0 !== 1) continue;
      var rb = buckets[i];
      if (rb.length < 4) continue;
      ctx.strokeStyle = styleCache[i];
      ctx.beginPath();
      for (var k = 0; k < rb.length; k += 4) {
        ctx.moveTo(rb[k], rb[k + 1]);
        ctx.lineTo(rb[k + 2], rb[k + 3]);
      }
      ctx.stroke();
    }

    // 第二遍：发丝（细、亮、快）——画面的细节
    ctx.lineWidth = CLASS_WIDTH[0];
    for (i = 0; i < NCOL * TIERS; i++) {
      var hs = buckets[i];
      if (hs.length < 4) continue;
      ctx.strokeStyle = styleCache[i];
      ctx.beginPath();
      for (var m = 0; m < hs.length; m += 4) {
        ctx.moveTo(hs[m], hs[m + 1]);
        ctx.lineTo(hs[m + 2], hs[m + 3]);
      }
      ctx.stroke();
    }

    // 第三遍：浓绸带的加法辉光，交汇处自然发亮
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = CLASS_WIDTH[1] * 2.4;
    for (i = NCOL * TIERS; i < NBUCKET; i++) {
      if (((i - NCOL * TIERS) % TIERS) !== TIERS - 1) continue;
      var gb = buckets[i];
      if (gb.length < 4) continue;
      ctx.strokeStyle = glowCache[i];
      ctx.beginPath();
      for (var q = 0; q < gb.length; q += 4) {
        ctx.moveTo(gb[q], gb[q + 1]);
        ctx.lineTo(gb[q + 2], gb[q + 3]);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (pt.on) pt.power *= 0.988;
    if (state.fade > 0) state.fade--;
  }

  /* ---------------- 静态图（reduced-motion） ---------------- */
  // 直接跑动画的步进器若干帧再停在画面上：
  // 让静态版和动画版是「同一幅画」，而不是另画一张看起来差不多的
  function renderStill() {
    ctx.globalCompositeOperation = 'source-over';
    refreshColors();
    ctx.fillStyle = Palette.rgb(curBg());
    ctx.fillRect(0, 0, W, H);
    styleKey = '';                       // 重新算样式，色板可能刚切换

    for (var i = 0; i < alive; i++) respawn(i, true);
    state.fade = 0;                      // 静态图不要入场淡入

    var STILL_FRAMES = 130;
    for (var f = 0; f < STILL_FRAMES; f++) step(1 / 60);

    // 稍微压一遍拖尾，让最浓的丝线沉下来
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(' + curBg().join(',') + ',' + (CFG.trail * 0.5).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- 主循环 ---------------- */
  var lastT = 0;
  function frame(now) {
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;

    if (state.mix < 1) state.mix = Math.min(1, state.mix + CFG.paletteLerp);

    if (!state.paused) step(dt);

    state.frames++;
    if (!state.lastSeedAt) state.lastSeedAt = now;
    if (now - state.lastSeedAt > CFG.reseedMs) {
      state.lastSeedAt = now;
      reseed();
    }

    global.requestAnimationFrame(frame);
  }

  /* ---------------- 交互 ---------------- */
  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', function (e) {
    var p = pointerPos(e);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.on = true;
    state.pointer.power = 1;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!state.pointer.on) return;
    var p = pointerPos(e);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.power = Math.max(state.pointer.power, 0.55);
  });

  function releasePointer() {
    state.pointer.on = false;
    state.pointer.power = 0;
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', releasePointer);

  /* ---------------- 控件 ---------------- */
  function updateStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function switchPalette(name) {
    var blended = Palette.get(name);
    state.from = {
      bg: curBg(),
      colors: curColors.filter(Boolean).map(function (c) { return [c[0], c[1], c[2]]; }),
      accent: state.to.accent
    };
    if (state.from.colors.length !== NCOL) state.from.colors = blended.colors.map(function (c) { return [c[0], c[1], c[2]]; });
    state.to = blended;
    state.mix = 0;
    state.fade = CFG.fadeFrames;
    updateStatus('色板 · ' + state.to.label);
    if (reduceMotion) renderStill();
    try { localStorage.setItem('art.palette', name); } catch (e) {}
  }

  if (paletteSel) {
    Palette.list().forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.label;
      paletteSel.appendChild(opt);
    });
    var saved = null;
    try { saved = localStorage.getItem('art.palette'); } catch (e) {}
    var initial = saved && Palette.NAMES.indexOf(saved) >= 0 ? saved : Palette.NAMES[0];
    paletteSel.value = initial;
    state.from = Palette.get(initial);
    state.to = Palette.get(initial);
    paletteSel.addEventListener('change', function () {
      switchPalette(paletteSel.value);
    });
  }

  function togglePause() {
    state.paused = !state.paused;
    if (els.pause) {
      els.pause.textContent = state.paused ? '继续' : '暂停';
      els.pause.setAttribute('aria-pressed', String(state.paused));
    }
    updateStatus(state.paused ? '已暂停' : '运行中');
  }

  function reseed() {
    rebuild((Math.random() * 1e9) | 0);
    state.fade = CFG.fadeFrames;
    if (reduceMotion) renderStill();
  }

  function save() {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ink-currents-' + state.seed + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      updateStatus('已导出 PNG');
    }, 'image/png');
  }

  function toggleUI() {
    document.body.classList.toggle('bare');
    var bare = document.body.classList.contains('bare');
    if (els.hide) els.hide.setAttribute('aria-pressed', String(bare));
    // 界面隐藏后不能留下「看不见但可聚焦」的控件（WCAG 2.4.3）
    var ov = document.querySelector('.overlay');
    if (ov) {
      if (bare) ov.setAttribute('aria-hidden', 'true');
      else ov.removeAttribute('aria-hidden');
    }
    if (bare && document.activeElement && ov && ov.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  if (els.seed) els.seed.addEventListener('click', reseed);
  if (els.pause) els.pause.addEventListener('click', togglePause);
  if (els.save) els.save.addEventListener('click', save);
  if (els.hide) els.hide.addEventListener('click', toggleUI);

  global.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    // 焦点在表单控件/按钮/链接上时不要抢键：否则空格会「激活按钮 + 切换暂停」双重触发
    if (e.target && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'r' || e.key === 'R') reseed();
    else if (e.key === 's' || e.key === 'S') save();
    else if (e.key === 'h' || e.key === 'H') toggleUI();
  });

  /* ---------------- 启动 ---------------- */
  var resizeTimer = 0;
  global.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduceMotion) renderStill();
    }, 170);
  });

  /* ---------------- 启动：URL 参数可固定种子与色板 ---------------- */
  // 例：index.html?seed=12345&palette=sumi&motion=on
  (function applyParams() {
    var qs;
    try { qs = global.location.search; } catch (e) { return; }
    if (!qs) return;
    var params = {};
    qs.replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });

    if (params.seed && /^\d+$/.test(params.seed)) {
      state.seed = parseInt(params.seed, 10) >>> 0;
    }
    if (params.palette && Palette.NAMES.indexOf(params.palette) >= 0) {
      var p = Palette.get(params.palette);
      state.from = p;
      state.to = p;
      state.mix = 1;
      if (paletteSel) paletteSel.value = params.palette;
    }
    if (params.motion === 'on') reduceMotion = false;
    if (params.motion === 'off') reduceMotion = true;
  })();

  rebuild(state.seed);
  resize();

  if (reduceMotion) {
    renderStill();
    updateStatus('静态模式 · 系统偏好减少动效');
  } else {
    updateStatus('运行中 · 种子 ' + state.seed);
    global.requestAnimationFrame(frame);
  }

  // 暴露给自动化测试
  global.Art = {
    state: state,
    step: step,
    resize: resize,
    rebuild: rebuild,
    renderStill: renderStill,
    canvas: canvas
  };
})(window);

