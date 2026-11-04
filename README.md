# FlowSail

> 一个迷你工作流开发套件（mini workflow dev-kit）：可嵌入 React 应用的 AI 工作流画布编辑器内核。

[产品 PRD](docs/PRD.md) · [初期路线图](docs/ROADMAP.md) · [发布与部署](docs/RELEASING.md) · [开发约定](AGENTS.md)

**当前状态：v1.7（M4 交付主线，包版本 `0.1.0`）。** M1 ~ M3 的编辑器能力在 v1.6 已全部落地；v1.7 把仓库里的编辑器变成**能安装、能发布、能上手**的交付物：包改名为 `@flowsail/core` / `@flowsail/react`，入口指向构建产物 `dist`，补上 `exports` / `types` / `files` / `sideEffects` 与 MIT 许可证，引入 changesets 发布流程、README 安装与嵌入路径、GitHub Pages 在线示例，以及 lint / 覆盖率 / 体积 / React 18/19 / pack 安装冒烟等发布前门禁。

- **在线示例**：<https://wwz914.github.io/FlowSail/>（`main` 自动部署；首次需仓库管理员在 `Settings → Pages` 启用 GitHub Actions，见 [docs/RELEASING.md](docs/RELEASING.md#12-github-pagesq30)）
- **npm 首发**：`0.1.0` 的发布链路已就绪，真实发布由维护者执行或明确授权后执行（[Q29](docs/ROADMAP.md#129-与待确定事项的关系)）。
- **公开 API 仍不稳定**：`1.0.0` 之前可能按 minor 版本调整；稳定版计划另议（Q31）。

主题与可访问性（D-5）留在 v1.8；自动布局、小地图、循环 / 并行执行语义等 P2 能力尚未实现。

---

## 安装

前置要求：React 18 或 19（`>=18 <20`），Node.js ≥ 20.19（构建工具链要求），包管理器 pnpm / npm / yarn 均可。

```sh
pnpm add @flowsail/react @flowsail/core react react-dom
```

- `@flowsail/core`：框架无关的数据层（`Node` / `Edge` / `Workflow` 类型、文档模型、schema 迁移、变更合并纯函数）。
- `@flowsail/react`：React 画布编辑器与面板；`react` / `react-dom` 是 peer dependency。

样式是独立文件，需要显式引入一次：

```ts
import '@flowsail/react/style.css'
```

## 嵌入一个受控画布

`workflow` + `onChange` 是推荐的受控用法：文档由宿主持有，画布的内部编辑写回 `onChange`。
下面是最小可运行示例（`src/App.tsx`）：

```tsx
import { useState } from 'react'
import {
  ConfigPanel,
  NodePanel,
  ReactFlow,
  Toolbar,
  createWorkflow,
  type Edge,
  type Node,
  type Workflow,
} from '@flowsail/react'
import '@flowsail/react/style.css'

const initialWorkflow: Workflow = {
  ...createWorkflow({ id: 'hello', name: 'Hello Flow' }),
  nodes: [
    { id: 'start', type: 'start', position: { x: 80, y: 40 }, data: { label: '开始' } },
    {
      id: 'llm',
      type: 'llm',
      position: { x: 80, y: 200 },
      data: { label: '大模型', prompt: '总结这封邮件：{{start.query}}' },
    },
  ] satisfies Node[],
  edges: [
    { id: 'e1', source: 'start', target: 'llm', sourceHandle: 'out', targetHandle: 'in' },
  ] satisfies Edge[],
}

export default function App() {
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar title="FlowSail" />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <NodePanel variant="inline" />
        <ReactFlow
          workflow={workflow}
          onChange={setWorkflow}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <ConfigPanel variant="inline" />
      </div>
    </div>
  )
}
```

打开后即可：从左侧节点面板创建节点、从下方锚点拖线上方锚点连线、右侧改参数、顶部工具栏撤销 / 重做 / 适应画布 / 导出 / 导入。

> 不使用受控模式时，可以只传 `nodes` / `edges` 作为初始文档；内部编辑不写回 props，
> 变更通过 `onNodesChange` / `onEdgesChange` / `onSelectionChange` 通知宿主。
> 两种用法通过是否传 `workflow` 区分，行为互不干扰。

## 自定义节点

节点类型由注册表描述，新增一种类型不需要改内核。`NodeTypeProvider` 让面板与画布共享注册表，
`ReactFlow` 的 `nodeTypes` prop 也可以直接注入（同名类型覆盖内置定义）：

```tsx
import { NodeTypeProvider, ReactFlow, type NodeTypeDefinition } from '@flowsail/react'

const httpNode: NodeTypeDefinition = {
  type: 'http',
  label: 'HTTP',
  color: '#0b7285',
  icon: <span aria-hidden>H</span>,
  defaultData: { label: 'HTTP' },
  inputs: [{ id: 'in', label: '输入', offset: 0.5 }],
  outputs: [{ id: 'out', label: '输出', offset: 0.5 }],
  params: [
    { key: 'url', label: 'URL', type: 'string', required: true, default: 'https://example.com' },
  ],
  outputFields: [{ name: 'status', type: 'number', description: 'HTTP 状态码' }],
}

export function Root() {
  return (
    <NodeTypeProvider nodeTypes={[httpNode]}>
      <ReactFlow nodeTypes={[httpNode]} />
    </NodeTypeProvider>
  )
}
```

- `params` 只驱动配置面板表单（`string` / `number` / `boolean` / `select` / `json`）。
- `outputFields` 是变量引用 `{{nodeId.field}}` 的**唯一作用域来源**；变量选择器、引用校验与
  文档级校验都读它，不要另建一套变量模型。
- 未注册的节点类型会回落为通用卡片，不报错。

## 注入 Runner 与试运行

编辑器只负责编排、呈现与定位，执行由宿主注入的 Runner 决定。默认是内置 Mock Runner；
宿主可以用 `setRunner` 全局替换，或通过 `Runner` 接口接入真实后端 / 沙箱：

```tsx
import { setRunner, type Runner } from '@flowsail/react'

const runner: Runner = {
  async run(workflow, hooks) {
    hooks.onRunStart?.(workflow)

    // 逐个节点执行：调用 onNodeStart / onNodeEnd / onNodeSkip，
    // 并从 RunContext.variables 读取宿主传入的流程级输入。
    const result = {
      ok: true,
      cancelled: false,
      errors: {},
      outputs: {},
      duration: 0,
    }
    hooks.onRunEnd?.(result)
    return result
  },
}

setRunner(runner)
```

节点运行态有 `idle` / `running` / `success` / `error` / `skipped` 五态；运行态与运行记录是
**视图态**，不写回 `Workflow` 文档、不进历史栈（ROADMAP Q20）。完整契约见导出的
`Runner` / `RunnerHooks` / `RunResult` / `NodeRunInput` 类型。

## 包与产物

| 包 | 版本 | 入口 | 说明 |
| --- | --- | --- | --- |
| `@flowsail/core` | `0.1.0` | `dist/index.js` + `dist/index.d.ts` | 无运行时依赖 |
| `@flowsail/react` | `0.1.0` | `dist/index.js` + `dist/style.css` | peer：React 18/19；依赖 `@flowsail/core` 与 `zustand` |
| `packages/example` | private | `src/main.tsx` | Vite + React 演示应用，不发布 |

两个库包都用 Vite library mode 产出 ESM，用 `tsc -p tsconfig.build.json` 产出 `.d.ts`；
发布 tarball 只含 `dist` 与 `LICENSE`，业务工程不会拿到 TS 源码。

## 现在能做什么

| 能力 | 状态 |
| --- | --- |
| 节点 / 连线渲染（贝塞尔曲线 + 箭头）、拖拽移动 | ✅ |
| 画布缩放（25%–200%）/ 空格或中键平移 / 适应画布 | ✅ |
| 锚点拖拽连线、自连 / 重复 / 单入校验 | ✅ |
| 选择 / 多选 / 删除（节点与连线）、框选、复制粘贴 | ✅ |
| 撤销 / 重做（快照历史，拖拽与连续输入合并） | ✅ |
| 节点创建面板、节点类型注册表、6 类内置节点 | ✅ |
| 条件分支（具名多出口 + 可编辑分支标签） | ✅ |
| 配置面板与参数表单（string / number / boolean / select / json） | ✅ |
| 工作流文档模型（`id` / `name` / `version` / `meta`）与 schema 迁移 | ✅ |
| 变量引用 `{{nodeId.field}}`、变量选择器、引用校验 | ✅ |
| 文档级校验（孤立节点、悬空连线、必填缺失、引用失效、类型未注册） | ✅ |
| 文档导入 / 导出（JSON，导入可撤销一次） | ✅ |
| 受控 `workflow` + `onChange` API | ✅ |
| 顶部工具栏（撤销 / 重做 / 适应画布 / 导出 / 导入） | ✅ |
| `Runner` 接口、试运行 / 取消、运行记录、节点运行态、单节点测试 | ✅ |
| 画布内重命名、8px 网格吸附、运行结果回填、错误详情 | ✅ |
| 自动化测试（Vitest，295 个用例）与覆盖率 / 体积 / pack 冒烟门禁 | ✅ |

完整能力拆解与优先级见 [PRD](docs/PRD.md) 与 [ROADMAP](docs/ROADMAP.md)。

## 仓库内开发

```sh
corepack enable
pnpm install

pnpm dev          # 先构建两个库包，再启动示例 http://localhost:5173
pnpm build        # core → react → example（产物在各自 dist/）
pnpm test         # Vitest（jsdom），295 个用例
pnpm test:coverage # 覆盖率门禁（≥ 70%）
pnpm lint         # ESLint，覆盖 system / react / example / 脚本
pnpm typecheck    # 先构建库声明，再检查 example 从 dist 解析类型
```

发布前门禁与发布步骤：

```sh
pnpm check:size   # @flowsail/react gzip（JS + CSS）< 60KB
pnpm check:links  # README / docs / AGENTS 的链接与锚点
pnpm check:pack   # 打包 tarball，在干净目录安装、类型检查、构建并渲染
```

`pnpm dev` 使用构建后的 `dist`（与真实宿主一致）；修改 `packages/system` 或
`packages/react` 的源码后，重新执行 `pnpm build:libs` 再刷新页面即可。

### 仓库结构

```
packages/
  system/     @flowsail/core    数据层：类型、文档模型、schema 迁移、变更合并纯函数
  react/      @flowsail/react   React 画布：ReactFlow、面板、注册表、变量引用、校验、Runner、store
  example/    example（private） Vite + React 演示应用，部署到 GitHub Pages
docs/
  PRD.md                        产品需求文档
  ROADMAP.md                    阶段规划与实施记录
  RELEASING.md                  发布、secret、回滚与 Pages 部署
```

根 `package.json` 名为 `flowsail`（private），只承载共享依赖、根脚本与构建依赖，不是一个发布包。

### 验证改动的顺序

```sh
pnpm lint && pnpm test:coverage && pnpm typecheck && pnpm build
pnpm check:size && pnpm check:links && pnpm check:pack
```

**UI 改动的验证要求**：改 `packages/react` 或 `packages/example` 的界面后，PR 里必须给出
**Before / After 两张截图**，同一视口、同一场景、同一主题，用 dev server 实际截取。

## 发布与在线示例

- 发布流程、secret、版本步骤与回滚：[docs/RELEASING.md](docs/RELEASING.md)
- 变更记录：每个包的 `CHANGELOG.md`（changesets 生成）
- 在线示例：<https://wwz914.github.io/FlowSail/>（GitHub Pages，`main` 自动部署）

仓库以版本对齐节奏，不保留 v1.2：v1.0 → v1.1 → v1.3 → v1.4 → v1.5 → v1.6 → **v1.7** → v1.8。

## 路线图概览

| 阶段 | 版本 | 主题 | 状态 |
| --- | --- | --- | --- |
| M1 | v1.0 ~ v1.1 | 工程地基 + 可用画布 | ✅ 已合并 |
| M2 | v1.3 ~ v1.4 | 节点体系、配置面板、文档模型、变量引用、校验 | ✅ 已合并 |
| M3 | v1.5 | Runner、试运行、运行记录、节点运行态 | ✅ 已合并 |
| 遗留收口 | v1.6 | 框选、复制粘贴、重命名、网格吸附、运行结果回填 | ✅ 已合并 |
| M4 | **v1.7** | **交付主线：打包、发布、文档、在线示例、质量门禁** | ✅ 本版 |
| D-5 | v1.8 | 主题与可访问性、P1 交互补全 | 规划中 |

## 参与开发

- 分支名用 `agent/<短名>` 形式；
- 提交身份使用 `xunmu-spuer` 与其 GitHub noreply 邮箱，不使用仓库 owner 的个人身份；
- PR 由人 review 和 merge，机器人不自行合并；
- 讨论在飞书群 @ 机器人，或在 GitHub issue / PR 下评论并 @ 机器人账号。

更细的约定见 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE) © 2026 FlowSail contributors。两个发布包内各带一份 `LICENSE`。
