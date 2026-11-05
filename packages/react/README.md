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

## 文档

- 仓库与完整文档：<https://github.com/wwz914/FlowSail>
- 安装、嵌入与自定义节点：[仓库 README](https://github.com/wwz914/FlowSail#readme)
- 产品与需求：[PRD](https://github.com/wwz914/FlowSail/blob/main/docs/PRD.md)
- 阶段规划与实施记录：[ROADMAP](https://github.com/wwz914/FlowSail/blob/main/docs/ROADMAP.md)
- 发布流程：[RELEASING](https://github.com/wwz914/FlowSail/blob/main/docs/RELEASING.md)

## 许可证

[MIT](https://github.com/wwz914/FlowSail/blob/main/LICENSE)
