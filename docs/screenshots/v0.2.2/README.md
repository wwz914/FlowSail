# v0.2.2 视觉对比（Before / After）

0.2.2 按设计评审选定的方向 A「精炼工作台」重构视觉层。设计稿与评审记录见
[PR #38](https://github.com/wwz914/FlowSail/pull/38)（四版中的 A 版）。

- **Before**：0.2.1（`main` @ `4dd5fbc`）的界面实拍，直接使用 `docs/screenshots/v0.2.1` 的 After 图作为本版基线；
- **After**：0.2.2 分支，`scripts/screenshot.mjs` 在真实 dev server 上抓取（Chrome，1280 × 800，同一场景、同一主题）。

| 文件 | 场景 | 变化 |
| --- | --- | --- |
| `before-light.png` / `after-light.png` | 默认亮色 | 中性灰白画布与面板、纯点阵网格（去掉光晕与网格渐隐）；节点去掉左侧色条，改为 8px 圆角与常显白底锚点，类型名改为弱化文字；主按钮近黑 |
| `before-dark.png` / `after-dark.png` | 暗色主题 | 暗色 token 重校准为中性石墨 + 靛蓝强调；节点、工具栏、配置面板与底部面板同步收敛；暗色主按钮近白 |
| `before-condition.png` / `after-condition.png` | 选中条件节点 | 配置面板 320px、输入 32px、分区更紧凑；选中节点使用靛蓝描边 + 3px 光环；浮动工具条压缩到 28px |
| `before-toolbar.png` / `after-toolbar.png` | 选中大模型节点 | 工具栏改为图标 + 分隔线分组，撤销 / 重做改为图标按钮；配置面板参数表单与底部校验 / 运行两行面板对照 |

复现（需先 `pnpm dev`，端口以终端输出为准）：

```sh
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-light.png http://localhost:5173 light
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-dark.png http://localhost:5173 dark
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-condition.png http://localhost:5173 condition
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-toolbar.png http://localhost:5173 toolbar
```

> 节点仍保持 160 × 48 几何；交互、文案、公开 API 与连线拓扑不变。暗色是方向 A 的派生版本，
> 与亮色共用同一套 `--flow-*` token。
