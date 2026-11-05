# FlowSail 示例应用

`packages/example` 是 FlowSail 的参考应用（private，不发布）：用 `@flowsail/react` 的
`NodeTypeProvider` + `Toolbar` + `NodePanel` + `ReactFlow` + `ConfigPanel` + `ValidationPanel`
+ `RunPanel` 拼出三栏布局，以受控模式（`workflow` + `onChange`）演示宿主如何持有文档，
并注册一个自定义「通知」节点演示 `nodeTypes` 注入。v1.8 起工具栏还提供亮 / 暗主题切换：
主题状态由宿主保存，`<html data-theme>` 让画布外面板与 `<ReactFlow theme>` 共享同一套变量。

## 本地运行

在仓库根目录执行：

```sh
pnpm install
pnpm dev        # 先构建 @flowsail/core / @flowsail/react，再启动 http://localhost:5173
```

`pnpm dev` 消费的是两个库包的 `dist` 产物（与真实宿主一致）。修改库源码后执行
`pnpm build:libs` 再刷新页面。

## 构建与部署

```sh
pnpm build                              # 根路径构建，输出 packages/example/dist
VITE_BASE=/FlowSail/ pnpm build         # GitHub Pages 子路径构建
pnpm --filter example preview           # 预览构建产物
VITE_BASE=/FlowSail/ pnpm --filter example preview -- --port 4173
```

`.github/workflows/deploy-pages.yml` 在 `main` 推送时自动以 `/FlowSail/` 构建并部署；
线上地址 <https://wwz914.github.io/FlowSail/>。首次启用见
[docs/RELEASING.md](../../docs/RELEASING.md#12-github-pagesq30)。

## 端到端验证

```sh
node scripts/verify-v17.mjs http://localhost:4173/FlowSail/   # 建节点 → 连线 → 配参数 → 试运行
node scripts/verify-v15.mjs http://localhost:4173/FlowSail/   # 试运行 / 分支跳过 / 失败恢复
node scripts/verify-v18.mjs http://localhost:5173              # v1.8：键盘 / 主题 / 工具条 / 反向拖断（20 项）
node scripts/screenshot.mjs docs/screenshots/v1.8/after-dark.png http://localhost:5173 dark
```
