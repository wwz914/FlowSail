# @flowsail/core

FlowSail 的框架无关数据层：工作流文档模型、schema 迁移、`Node` / `Edge` / `Workflow` 类型，
以及不可变的变更合并纯函数。没有运行时依赖，可在浏览器、Node.js 与 SSR 中直接使用。

FlowSail 是一个可嵌入 React 应用的工作流画布编辑器；本包是它的数据层，
画布与交互在 [`@flowsail/react`](https://www.npmjs.com/package/@flowsail/react)。

## 安装

```sh
npm install @flowsail/core
# 或 pnpm add @flowsail/core / yarn add @flowsail/core
```

## 最小用法

```ts
import {
  createWorkflow,
  parseWorkflowDocument,
  serializeWorkflow,
  type Node,
} from '@flowsail/core'

const start: Node = {
  id: 'start',
  type: 'start',
  position: { x: 80, y: 40 },
  data: { label: 'Start' },
}

const workflow = createWorkflow({ id: 'demo', name: '示例流程' })
const json = serializeWorkflow({ ...workflow, nodes: [start] })

// 导入时校验 schema 并给出可读错误；版本过新或非整数会被拒绝。
const result = parseWorkflowDocument(json)
if (result.ok && result.document) {
  console.log(result.document.nodes[0]?.id)
} else {
  console.error(result.errors)
}
```

主要导出：

- `createWorkflow` / `normalizeWorkflow`：新建与补齐文档；未知字段原样保留；
- `migrateWorkflow`：按 `Workflow.version` 逐级升级，拒绝版本过新的文档；
- `serializeWorkflow` / `parseWorkflowDocument`：JSON 序列化、解析与结构校验；
- `validateWorkflowDocument`：文档级结构校验；
- `applyNodeChanges` / `applyEdgeChanges`：纯函数式变更合并；
- `Node` / `Edge` / `Workflow` / `Viewport` / `WorkflowMeta` 等类型。

## 文档

- 仓库与完整文档：<https://github.com/wwz914/FlowSail>
- 产品与需求：[PRD](https://github.com/wwz914/FlowSail/blob/main/docs/PRD.md)
- 版本索引与下一阶段规划：[ROADMAP](https://github.com/wwz914/FlowSail/blob/main/docs/ROADMAP.md)
- 发布流程：[RELEASING](https://github.com/wwz914/FlowSail/blob/main/docs/RELEASING.md)

## 许可证

[MIT](https://github.com/wwz914/FlowSail/blob/main/LICENSE)
