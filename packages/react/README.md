# @flowsail/react

FlowSail 的可嵌入 React 工作流画布编辑器：节点 / 连线编辑、6 类内置节点、
配置面板、变量引用、文档校验、导入导出与试运行，并以受控文档的形式把状态交给宿主。

`react` / `react-dom`（`>=18 <20`）是 peer dependency；数据层在
[`@flowsail/core`](https://www.npmjs.com/package/@flowsail/core)。

## 安装

```sh
npm install @flowsail/react react react-dom
# 或 pnpm add @flowsail/react react react-dom
```

样式是独立产物，不会由 JS 注入，宿主必须显式引入一次：

```ts
import '@flowsail/react/style.css'
```

## 最小用法（受控画布）

```tsx
import { useState } from 'react'
import {
  ReactFlow,
  createWorkflow,
  type Edge,
  type Node,
  type Workflow,
} from '@flowsail/react'
import '@flowsail/react/style.css'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 80, y: 40 }, data: { label: 'Start' } },
  { id: 'end', type: 'end', position: { x: 80, y: 200 }, data: { label: 'End' } },
]

const edges: Edge[] = [
  { id: 'e1', source: 'start', target: 'end', sourceHandle: 'out', targetHandle: 'in' },
]

export default function App() {
  const [workflow, setWorkflow] = useState<Workflow>(() => ({
    ...createWorkflow({ name: '示例流程' }),
    nodes,
    edges,
  }))

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow workflow={workflow} onChange={setWorkflow} />
    </div>
  )
}
```

不传 `workflow` 时为非受控用法：画布内部维护文档，`nodes` / `edges` 只作为初始值与显式内容变更来源。

## 自定义节点与试运行

- 通过 `nodeTypes` 注册自定义节点类型（图标、锚点、参数 schema、变量作用域）；
  同名类型覆盖内置定义，未注册类型回落为通用卡片。
- 通过 `setRunner` 注入 `Runner`，`Toolbar` 的「试运行」会按拓扑顺序执行并展示运行态与记录；
  库内自带 Mock Runner 供演示与测试。
- 宿主自建三栏布局时，用导出的 `NodePanel` / `ConfigPanel` / `ValidationPanel` / `RunPanel` /
  `Toolbar` 组合，并用 `NodeTypeProvider` 让面板与画布共享同一份注册表。

## 主题与可访问性

默认亮色。`theme` prop 取 `light` / `dark`，写到画布根节点的 `data-theme`：

```tsx
<ReactFlow workflow={workflow} onChange={setWorkflow} theme="dark" />
```

省略 `theme` 时跟随最近的 `data-theme`（默认亮色）。宿主可以把属性放在 `<html>` 或任意祖先上，
让画布之外的 `NodePanel` / `ConfigPanel` / `Toolbar` 等面板共享同一套主题：

```ts
document.documentElement.dataset.theme = 'dark'
```

主题由一组 `--flow-*` CSS 变量驱动，宿主可在自己的样式里覆盖：

```css
:root {
  --flow-accent: #0b7285;
  --flow-node-selected-bg: #e6fcf5;
}

[data-theme='dark'] {
  --flow-accent: #66d9e8;
}
```

主要变量（完整列表见[仓库里的 `style.scss`](https://github.com/wwz914/FlowSail/blob/main/packages/react/src/style.scss) 顶部）：

- 画布：`--flow-bg`、`--flow-grid-dot`
- 表面与文字：`--flow-surface`、`--flow-surface-subtle`、`--flow-surface-hover`、`--flow-text`、
  `--flow-text-secondary`、`--flow-text-strong`、`--flow-text-muted`、`--flow-text-faint`
- 边框：`--flow-border`、`--flow-border-subtle`、`--flow-border-input`、`--flow-border-strong`
- 强调 / 焦点：`--flow-accent`、`--flow-accent-strong`、`--flow-accent-bg`、`--flow-accent-text`、
  `--flow-focus`、`--flow-node-selected-bg`
- 状态：`--flow-success`、`--flow-success-bg`、`--flow-danger`、`--flow-danger-bg`、
  `--flow-warning`、`--flow-warning-bg`、`--flow-running-bg`、`--flow-skipped`、`--flow-skipped-bg`
- 其他：`--flow-edge`、`--flow-code-bg`、`--flow-shadow`、`--flow-shadow-strong`

背景默认是点阵网格；`background={false}` 关闭，传入 ReactNode 作为自定义背景：

```tsx
<ReactFlow workflow={workflow} onChange={setWorkflow} background={<MyBackdrop />} />
```

键盘与可访问性：

- Tab 顺序为画布 → 连线 → 节点；画布、节点与连线都有 `aria-label` 和可见焦点环；
- Enter / Space 选中节点或连线，Delete 删除，方向键按 8px 网格移动选中节点（每次按键入一条历史）；
- `Ctrl/Cmd+A` 全选；节点与连线都带 `role` 与 `aria-pressed`，运行状态同时用文字与 `aria-label` 表达。

本版只覆盖键盘关键路径与对比度抽查，**不宣称完整 WCAG 2.x AA 合规**。

## 文档

- 仓库与完整文档：<https://github.com/wwz914/FlowSail>
- 安装、嵌入与自定义节点：[仓库 README](https://github.com/wwz914/FlowSail#readme)
- 产品与需求：[PRD](https://github.com/wwz914/FlowSail/blob/main/docs/PRD.md)
- 阶段规划与实施记录：[ROADMAP](https://github.com/wwz914/FlowSail/blob/main/docs/ROADMAP.md)
- 发布流程：[RELEASING](https://github.com/wwz914/FlowSail/blob/main/docs/RELEASING.md)

## 许可证

[MIT](https://github.com/wwz914/FlowSail/blob/main/LICENSE)
