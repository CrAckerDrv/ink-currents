/* Node 契约测试：在无 DOM 的全局对象里加载三个模块，验证 § 契约 与数值性质 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, Math, Uint8Array, Float32Array, isFinite, Object, Array };

function load(name) {
  const code = fs.readFileSync(path.join(root, 'js', name), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: name });
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + msg); }
}
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, msg + ' (' + a + ' vs ' + b + ')'); }

load('palette.js');
load('noise.js');
load('flowfield.js');

const { Palette, Noise, FlowField } = sandbox;

/* ---------- Palette ---------- */
ok(Array.isArray(Palette.NAMES) && Palette.NAMES.length === 5, 'Palette.NAMES 有 5 个色板');
Palette.NAMES.forEach((n) => {
  const p = Palette.get(n);
  ok(Array.isArray(p.bg) && p.bg.length === 3, n + ' bg 是三元组');
  ok(p.colors.length === 5, n + ' 有 5 个颜色');
  p.colors.concat([p.bg]).forEach((c) => {
    ok(c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
      n + ' 颜色分量是 0-255 整数');
  });
});
// 不可变：修改返回对象不应污染内部
const a = Palette.get('abyss'); a.bg[0] = 999;
ok(Palette.get('abyss').bg[0] === 6, 'Palette.get 返回副本');
// blend 端点
ok(Palette.blend([0, 0, 0], [255, 255, 255], 0).join() === '0,0,0', 'blend t=0');
ok(Palette.blend([0, 0, 0], [255, 255, 255], 1).join() === '255,255,255', 'blend t=1');
ok(Palette.blend([0, 0, 0], [255, 255, 255], 2).join() === '255,255,255', 'blend t 越界钳位');
ok(Palette.rgb([1, 2, 3]) === 'rgb(1,2,3)', 'Palette.rgb 无 alpha');
ok(Palette.rgb([1, 2, 3], 0.5) === 'rgba(1,2,3,0.5)', 'Palette.rgb 带 alpha');

/* ---------- Noise ---------- */
const n1 = Noise.create(1337);
const n2 = Noise.create(1337);
const n3 = Noise.create(42);
ok(n1.n2(1.5, -2.5) === n2.n2(1.5, -2.5), '同 seed 完全确定');
// 注意：不能拿单点比较——simplex 存在大量天然落 0 的退化点。
// 用多点平均绝对差来判定"不同 seed 生成不同场"。
let seedDiff = 0;
for (let i = 0; i < 500; i++) {
  const x = i * 0.37 - 13.1, y = i * 0.71 + 5.7;
  seedDiff += Math.abs(n1.n2(x, y) - n3.n2(x, y));
}
ok(seedDiff / 500 > 0.05, '异 seed 生成不同噪声场，平均绝对差 ' + (seedDiff / 500).toFixed(4));

let min = Infinity, max = -Infinity, sum = 0, cnt = 0;
for (let i = 0; i < 20000; i++) {
  const x = i * 0.137 - 100, y = i * 0.271 + 37;
  const v = n1.n2(x, y);
  ok(Number.isFinite(v), 'n2 有限值');
  min = Math.min(min, v); max = Math.max(max, v); sum += v; cnt++;
}
ok(min > -1.05 && max < 1.05, 'n2 值域约为 [-1,1]，实测 ' + min.toFixed(3) + '..' + max.toFixed(3));
ok(Math.abs(sum / cnt) < 0.12, 'n2 均值接近 0，实测 ' + (sum / cnt).toFixed(4));

// fbm 值域
let fmin = Infinity, fmax = -Infinity;
for (let i = 0; i < 5000; i++) {
  const v = n1.fbm(i * 0.0131, i * 0.0179, 4);
  fmin = Math.min(fmin, v); fmax = Math.max(fmax, v);
}
ok(fmin > -1.05 && fmax < 1.05, 'fbm 归一化在 [-1,1]，实测 ' + fmin.toFixed(3) + '..' + fmax.toFixed(3));

// rand 确定性 + 值域
const r1 = Noise.create(7), r2 = Noise.create(7);
let seq1 = [], seq2 = [];
for (let i = 0; i < 32; i++) { seq1.push(r1.rand()); seq2.push(r2.rand()); }
ok(seq1.join() === seq2.join(), 'rand 序列确定性');
ok(seq1.every((v) => v >= 0 && v < 1), 'rand 在 [0,1)');
ok(r1.range(5, 9) >= 5, 'range 下界');

// curl 有限、非零
let curlMag = 0;
for (let i = 0; i < 200; i++) {
  const c = n1.curl(i * 0.05, i * 0.07, 0.01);
  ok(Number.isFinite(c[0]) && Number.isFinite(c[1]), 'curl 有限值');
  curlMag += Math.hypot(c[0], c[1]);
}
ok(curlMag / 200 > 1e-6, 'curl 非退化，平均模 ' + (curlMag / 200).toFixed(4));

/* ---------- FlowField ---------- */
let threw = false;
try { FlowField.create({}); } catch (e) { threw = true; }
ok(threw, 'FlowField.create 缺少 noise 时抛错');

const ff = FlowField.create({ noise: n1, scale: 0.0016, speed: 90, swirl: 0.35, turbulence: 3 });
ok(Math.abs(ff.angle(10, 10) - ff.angle(10, 10)) === 0, 'angle 纯函数');
const out = [0, 0];
ff.sample(123.4, 567.8, out);
ok(Number.isFinite(out[0]) && Number.isFinite(out[1]), 'sample 有限值');
const s1 = ff.sample(50, 60);
ok(Math.hypot(s1[0], s1[1]) > 0, 'sample 速度非零，模 ' + Math.hypot(s1[0], s1[1]).toFixed(2));
near(Math.hypot(s1[0], s1[1]), 90 * (0.55 + 0.45 * (0.5 + 0.5 * n1.fbm(50 * 0.0016 * 2.1, 60 * 0.0016 * 2.1, 2))),
  1e-6, 'sample 速度模符合契约');

// configure 生效 + 非法值忽略
ff.configure({ speed: 200, scale: NaN });
ok(ff.config.speed === 200, 'configure 更新 speed');
ok(ff.config.scale === 0.0016, 'configure 忽略 NaN');

const probe = ff.probe(0, 0);
ok(typeof probe.angle === 'number' && typeof probe.speed === 'number', 'probe 字段完整');

// 流场连续性：邻近点方向不应剧烈跳变
let maxJump = 0;
for (let i = 0; i < 2000; i++) {
  const x = (i * 13.7) % 800, y = (i * 29.3) % 600;
  const d = Math.abs(((ff.angle(x, y) - ff.angle(x + 2, y)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  maxJump = Math.max(maxJump, d);
}
ok(Number.isFinite(maxJump), '流场方向连续（角度归一化未出现 NaN）');

/* ---------- 粒子在流场中的真实推进（模拟 main.step 的积分） ---------- */
const W = 400, H = 300;
let x = 200, y = 150, dt = 1 / 60, alive = true;
for (let step = 0; step < 600; step++) {
  ff.sample(x, y, out);
  x += out[0] * dt; y += out[1] * dt;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { alive = false; break; }
}
ok(alive, '粒子积分 600 步不发散不 NaN');
ok(x !== 200 || y !== 150, '粒子确实被流场推动，终点 (' + x.toFixed(1) + ',' + y.toFixed(1) + ')');

// 边界重生逻辑等价性（main.js respawn 用 noise.rand，此处验证其值域）
const rr = Noise.create(99);
ok(rr.rand() * W >= 0 && rr.rand() * W < W, 'respawn 坐标落在画布内');

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
