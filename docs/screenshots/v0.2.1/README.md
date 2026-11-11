# v0.2.1 视觉对比（Before / After）

同一场景、同一视口（1280 × 800）、同一主题的示例应用截图，用于 0.2.1 视觉打磨的验收。
截图由 `scripts/screenshot.mjs` 在真实 dev server 上抓取（Chrome，Playwright，1280 × 800）。

- **Before**：`main` @ `7de4300`（v1.8 合并后的基线，`@flowsail/*` `0.2.0`），在工单 worktree 中实拍；
- **After**：0.2.1 实现分支（节点类型色、画布层次、工具栏与面板细节、示例初始布局）。

| 文件 | 场景 | 说明 |
| --- | --- | --- |
| `before-light.png` / `after-light.png` | 默认亮色 | 节点从统一的蓝色描边改为「类型色强调条 + 图标底色」，标题与类型徽标分两行；画布增加柔和光晕与网格渐隐，工具栏分组、示例布局与提示条同步收紧 |
| `before-dark.png` / `after-dark.png` | 暗色主题 | 同一套 `--flow-*` 变量下的暗色值重新校准；类型色在深色画布上仍然清晰 |
| `before-condition.png` / `after-condition.png` | 选中条件节点 | 选中态改为类型色左条 + 主题蓝外框；浮动工具条与节点留出间距；配置面板的字段、空状态和分组层级重做 |
| `before-toolbar.png` / `after-toolbar.png` | 选中大模型节点 | 选中浮动工具条、配置面板与画布节点在同一张图里对照；工具栏的主按钮、分组与右侧宿主操作（主题切换）分层 |

复现：

```sh
pnpm dev
node scripts/screenshot.mjs docs/screenshots/v0.2.1/after-light.png http://localhost:5173 light
node scripts/screenshot.mjs docs/screenshots/v0.2.1/after-dark.png http://localhost:5173 dark
node scripts/screenshot.mjs docs/screenshots/v0.2.1/after-condition.png http://localhost:5173 condition
node scripts/screenshot.mjs docs/screenshots/v0.2.1/after-toolbar.png http://localhost:5173 toolbar
```

> `pnpm dev` 默认使用 5173；端口被占用时 Vite 会自动换端口，请以终端输出的 URL 为准。
> Before 截图来自 0.2.0 的基线构建，未用设计稿或模拟图替代。
