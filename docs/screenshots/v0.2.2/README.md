# v0.2.2 节点类型视觉对比（Before / After）

同一场景、同一视口（1280 × 800）、同一主题的示例应用截图，用于 0.2.2 节点类型视觉重设计的验收。
截图由 `scripts/screenshot.mjs` 在真实 dev server 上抓取（Chrome，Playwright，1280 × 800）。

- **Before**：视觉补丁序列第 1 版（0.2.1，commit `3df40aa`，即 PR #36 的 head），
  在独立 worktree 中启动真实的 example dev server 后实拍；节点为统一的圆角卡片 + 3px 类型色左条，
  图标为实心图形，类型名是彩色胶囊徽标。
- **After**：0.2.2 实现分支。节点仍是 160 × 48 几何，但换成一套 20 × 20 线性图标、
  类型色图标卡、弱化的类型行；开始 / 结束改为终端胶囊造型，类型色在亮 / 暗主题下统一派生。

| 文件 | 场景 | 说明 |
| --- | --- | --- |
| `before-light.png` / `after-light.png` | 默认亮色 | 终端节点（开始 / 结束）与流程节点（大模型 / 条件）在造型上分开；图标与类型行不再混用实心 / 胶囊样式 |
| `before-dark.png` / `after-dark.png` | 暗色主题 | 同一套类型色在暗色画布上提亮图标与图标卡，强调条仍保留原始类型色 |
| `before-condition.png` / `after-condition.png` | 选中条件节点 | 选中仍使用主题蓝外框，但左侧类型条 / 图标卡保留；条件图标改为流程图菱形 |
| `after-detail.png` | 亮色细节（2× DPR） | 放大查看图标卡、类型圆点、变量引用 `{{}}` 与终端胶囊的同屏关系 |

复现：

```sh
pnpm dev
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-light.png http://localhost:5173 light
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-dark.png http://localhost:5173 dark
node scripts/screenshot.mjs docs/screenshots/v0.2.2/after-condition.png http://localhost:5173 condition
```

> Before 截图来自 0.2.1 的基线构建（PR #36 的 head），未用设计稿或模拟图替代。
> 0.2.0 → 0.2.1 的画布 / 面板整体视觉对比见 [../v0.2.1](../v0.2.1/README.md)。
