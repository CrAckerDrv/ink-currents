# Ink Currents — 生成艺术

一件跑在浏览器里的流体生成作品：噪声流场驱动数千条粒子，在画布上慢慢织出墨丝的走向。
没有任何图片、字体或第三方依赖，整个仓库就是一个可直接访问的静态站点。

## 打开

```bash
# 在仓库根目录起一个静态服务器
python -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/index.html
```

也可以直接双击 `index.html`（`file://` 协议下同样可用）。

## 玩法

| 操作 | 效果 |
| --- | --- |
| 按住画面拖动 | 在指针处制造涡旋，把周围的墨丝卷起来 |
| `Space` | 暂停 / 继续 |
| `R` | 换一个随机种子（整幅构图重来） |
| `S` | 把当前画面导出为 PNG |
| `H` | 隐藏界面，只看画 |

右上角的下拉框切换 5 套色板，切换时颜色是逐帧插值的，不会硬切。

## URL 参数：把某一张画固定下来

```
index.html?seed=20251107&palette=sumi&motion=on
```

- `seed` — 正整数，同一种子永远画出同一幅画
- `palette` — `abyss` / `canyon` / `garden` / `sumi` / `aurora`
- `motion` — `on` / `off`，强制开启动或静止（覆盖系统的减少动效偏好）

## 结构

```
.
├── index.html          画布 + 覆盖层 UI（样式、无障碍标签、纸感图层）
├── js/
│   ├── palette.js      色板引擎：Palette.get / blend / rgb
│   ├── noise.js        确定性噪声：simplex n2、fbm、curl、可复现随机
│   ├── flowfield.js    流场采样器：流函数旋度场，数学上无散度
│   └── main.js         合成层：粒子池、批量化绘制、交互、主循环
└── test/               验证用的页面与脚本（不参与运行）
```

四支脚本通过全局对象通信，没有打包步骤：

- `Noise.create(seed)` → `n2 / fbm / curl / rand / range`
- `FlowField.create({ noise, scale, speed, swirl, turbulence })` → `angle / sample / probe`
- `Palette.get(name)` → `{ bg, colors, accent }`，颜色均为 `[r,g,b]` 整数三元组

## 为什么这么画

- **流函数而不是角度噪声**：方向取自标量场 ψ 的旋度 `v = (∂ψ/∂y, -∂ψ/∂x)`，数学上无散度。
  这样流线长而连贯，不会像直接拿噪声值当角度那样把画面搅成均匀噪点。
- **两级粒子**：细「发丝」负责细节，粗「绸带」负责体块，两者速度不同，画面才有前后层次。
- **按桶批量 stroke**：每帧把上万条线段先按「类别 × 色相 × 浓淡」分桶，每桶只做一次
  `beginPath/stroke`。canvas2d 的状态切换开销比线段本身大得多，批量化后 3400 个粒子仍能跑满 60fps。
- **拖尾 = 半透明底色覆盖**：每帧用背景色以 `trail` 透明度覆盖全屏，旧的墨迹自然衰减，得到长尾。
- **跟着纸的明暗自动调色**：按背景亮度算一个 `gain`。深色底上把墨线提亮一档并让最浓档掺 `accent`，
  才会出现荧光般的点睛亮点；浅色宣纸上反过来把最浓档压向深墨，否则浅纸上的灰线会被纸吞掉。
- **静态图 = 动画跑到一半的定格**：`renderStill()` 不是另写一套绘制代码，而是重撒粒子后
  直接跑 130 帧 `step()` 再停住。减少动效的用户看到的和动画版是同一幅画。

## 无障碍与降级

- 画布标了 `role="img"` 与 `aria-label`，控件是原生 `button` / `select`，都带可见的焦点环。
- 状态栏是 `role="status" aria-live="polite"`，切换色板、暂停、导出都会播报。
- 系统开启「减少动效」时自动改为渲染一张静态图（不是空白，也不是卡住的动画），
  需要动效可以用 `?motion=on` 覆盖。
- 画布尺寸跟随窗口，DPR 上限 2，避免 4K 屏上过度绘制。

## 验证

```bash
node test/contract.test.js     # 20268 项契约断言，全绿
```

`test/` 下还有几个无头浏览器验证页，用 devtools 协议或 headless 模式驱动：

- `probe.html` — 手动泵帧，量画布的覆盖率 / 浓墨比 / 平均亮度，支持 `?palette=` 与 `?seed=`
- `palettes.html` — 逐个色板独立测量并做控件回归
- `interact.html` — 指针涡旋、快捷键、暂停冻结、aria 状态的回归测试
- `contract.test.js` — 噪声确定性、值域、流场契约（速度模 = `speed × local`）等断言
