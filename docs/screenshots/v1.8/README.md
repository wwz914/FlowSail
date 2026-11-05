# v1.8 视觉对比（Before / After）

同一场景、同一视口（1280 × 800）、同一主题的示例应用截图，用于 R8-2 ~ R8-5 的验收。
截图由 `scripts/screenshot.mjs` 在真实 dev server 上抓取（Chrome，Playwright，1280 × 800）。

- **Before**：`main` @ `cbeb706`（v1.7 合并后的基线，`@flowsail/*` `0.1.0`），在独立的 `git worktree` 中构建后实拍；
- **After**：v1.8 实现分支（主题变量、键盘可达、选中浮动工具条）。

| 文件 | 场景 | 说明 |
| --- | --- | --- |
| `before-light.png` / `after-light.png` | 默认亮色 | 同一初始文档；After 多了工具栏的主题切换按钮与新的交互提示 |
| `before-dark.png` / `after-dark.png` | 暗色主题 | Before 没有主题变量：把 `<html data-theme="dark">` 后画面与亮色逐字节相同（同一 sha256）；After 用工具栏「暗色主题」切换，画布、节点、面板整体变暗 |
| `before-focus.png` / `after-focus.png` | 键盘焦点 | Before 连续按 Tab 只能到达工具栏 / 节点面板按钮，节点不可聚焦；After 的 Tab 顺序为画布 → 连线 → 节点，Start 节点有可见蓝色焦点环 |
| `before-toolbar.png` / `after-toolbar.png` | 选中节点 | 同一节点（LLM）选中态；Before 没有浮动工具条，After 在选区上方显示「创建副本 / 复制 / 删除」 |

复现：

```sh
pnpm dev
node scripts/screenshot.mjs docs/screenshots/v1.8/after-light.png http://localhost:5173 light
node scripts/screenshot.mjs docs/screenshots/v1.8/after-dark.png http://localhost:5173 dark
SCREENSHOT_ACTIVE=1 node scripts/screenshot.mjs docs/screenshots/v1.8/after-focus.png http://localhost:5173 focus
node scripts/screenshot.mjs docs/screenshots/v1.8/after-toolbar.png http://localhost:5173 toolbar
```

> `pnpm dev` 默认使用 5173；端口被占用时 Vite 会自动换端口，请以终端输出的 URL 为准。
