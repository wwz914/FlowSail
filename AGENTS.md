# FlowSail

一个迷你工作流开发套件（mini workflow dev-kit）。pnpm monorepo，画布式的节点/连线编辑器。

## 仓库结构

```
packages/system    @system   框架无关的数据层：Node/Edge/Workflow 类型、变更合并工具、文档模型与 schema 迁移。无运行时依赖。
packages/react     react     React 画布实现：ReactFlow 组件、NodePanel、ConfigPanel、Toolbar、ValidationPanel、VariablePicker、SchemaPreview、RunPanel、NodeTestPanel、NodeRenderer/NodeCard、EdgeRenderer、节点类型注册表、变量引用与文档校验、Runner 接口与运行期状态、zustand store、viewport/connection 纯函数。
packages/example   example   Vite + React 演示应用（private，不发布）。
```

根目录 `package.json` 名为 `my-flow`（private），只承载共享依赖、根脚本与构建依赖，**本身不是一个包**。

产品与规划文档：[`docs/PRD.md`](docs/PRD.md)（定位、对标、功能需求）、[`docs/ROADMAP.md`](docs/ROADMAP.md)（初期基础能力与阶段规划）。

## 先读这一段：命名与解析上的坑

这几处看起来像 bug，其实是有意为之或历史遗留。**改动前先理解，不要顺手"修正"**：

1. **`packages/react` 的包名是 `react`**，与 npm 上的 `react` 同名。它在 example 里通过
   `"reactflow": "workspace:../react"` 引入，因此 example 中写的是
   `import { ReactFlow } from 'reactflow'`，实际指向 `packages/react`。
   → 改 `packages/react` 的导出，改的是 example 里 `reactflow` 这个名字。
2. **两个库包都直接暴露 TypeScript 源码**：`main` / `types` 指向 `src/index.ts`，
   不是 `dist/`。`dist/` 只是 `pnpm build` 的发布产物，示例直接编译源码。
3. **`@system` 通过 workspace 依赖解析**：`packages/react/package.json` 里声明
   `"@system": "workspace:*"`，pnpm 会创建 `packages/react/node_modules/@system`。
   库内统一写 `import ... from '@system'`；**不要写 `@system/types.ts`**——example 的
   `tsconfig.app.json` 不继承根 tsconfig 的 `paths`，子路径形式会报 `TS2307`。
   example 需要数据类型时从 `reactflow` 重导出的 `Node` / `Edge` 取。
4. **构建分两条链路**：`packages/system` 与 `packages/react` 用 Vite library mode 产出 ESM，
   再用 `tsc -p tsconfig.build.json` 产出 `.d.ts`；`packages/example` 仍是 `tsc -b && vite build`。
   根 `pnpm build` 按依赖顺序执行三者。旧的根 `rollup.config.js` 已删除。
5. **导入必须带扩展名**：`.ts` / `.tsx` 显式写出（`allowImportingTsExtensions` +
   `verbatimModuleSyntax` + `moduleResolution: nodenext`）。`packages/react/src` 内
   一律 `from './store/index.ts'`、`from '../lib/viewport.ts'` 这种写法。

## 当前状态（根脚本）

| 命令 | 说明 |
| --- | --- |
| `pnpm install` | 安装依赖（首次进入 worktree 必须执行） |
| `pnpm dev` | 启动 example 开发服务器（http://localhost:5173） |
| `pnpm build` | 构建 system → react → example |
| `pnpm test` | Vitest（jsdom），覆盖 `@system` 纯函数与文档模型、视口/连线计算、选择/删除/历史、节点渲染、节点类型注册表与参数表单、变量引用、文档级校验、导入导出与受控模式 |
| `pnpm lint` | ESLint（example 的 flat config） |
| `pnpm typecheck` | `tsc -b packages/example/tsconfig.json`，覆盖全部库源码 |

`pnpm test` 只跑根脚本即可；`packages/system`、`packages/react` 各自的 `test` 脚本
会复用根 `vitest.config.ts`，便于单包调试。

## 怎么验证你的改动

```sh
# 1. 装依赖（首次进入 worktree 时必须做，worktree 是新目录，没有 node_modules）
pnpm install
# pnpm 会依据 packageManager 字段自动切到 10.23.0；安装后可能有
# "Ignored build scripts: @parcel/watcher, esbuild" 警告，dev server 仍可正常运行。

# 2. 跑开发服务器看真实效果（UI 改动必做）
pnpm dev                            # http://localhost:5173

# 3. 类型检查 / 构建
pnpm typecheck
pnpm build

# 4. 测试与代码风格
pnpm test
pnpm lint
```

**UI 改动的验证要求**：改 `packages/react` 或 `packages/example` 的界面后，
必须在 PR 里给出 **Before / After 两张截图**，同一视口、同一场景、同一主题。
截图用 dev server 实际截取，不要用设计稿冒充旧实现。

## 提交时的注意事项

- `.gitignore` 已忽略 `node_modules/`、`dist/`、`*.tsbuildinfo`、`.vite/`、`*.log`。
  新增构建产物或临时文件时，请同步补充到 `.gitignore`。
  提交时仍建议**用具体路径**（`git add packages/react/src/...`），
  避免误把无关文件带进提交。
- 分支名用 `agent/<短名>` 形式（自动派工的工单会按此命名）。
- 提交身份用 agent 账号 `xunmu-spuer` 与其 GitHub noreply 邮箱，
  不用仓库 owner 的个人身份。

## 代码现状备忘

- `NodeRenderer` 只做 `nodes.map()`，每个节点由 `NodeCard` 组件渲染；拖拽、选择与
  指针捕获的 `useRef` / `useState` 都在 `NodeCard` 顶层，节点数量变化不会触发 Hooks 错误。
- `store/index.ts` 以单份 `workflow`（`id` / `name` / `version` / `meta` / `nodes` /
  `edges` / `viewport`）为唯一事实源，`setNodes` / `setEdges` / `setViewport` 只写文档、
  不入历史；`addNode` / `addEdge` / `deleteSelection` 入历史栈。历史是整份快照
  （容量 `HISTORY_LIMIT = 50`），拖拽开始时取快照、松手时 `pushHistory` 合并为一条；
  `undo` / `redo` 不还原视口。**`pushHistory(snapshot)` 压入的是"编辑前"的快照**——
  想让撤销回到某个状态，就传那个状态的文档，别传当前文档。
- 文档模型在 `packages/system/src/document.ts`（`@system` 直接导出）：
  `createWorkflow` / `normalizeWorkflow` / `migrateWorkflow` / `validateWorkflowDocument` /
  `serializeWorkflow` / `parseWorkflowDocument`。`CURRENT_WORKFLOW_VERSION = 1`；
  `migrate` 按版本逐级升级，版本过新或非整数时拒绝导入并给出可读原因；
  文档里的**未知顶层字段与 `meta` 内字段原样保留**（宿主扩展信息不丢）。
- `ReactFlow.tsx` 对 `nodes` / `edges` props 做**内容差异**同步（非受控主语义，R2-7）：
  props 是初始文档与显式内容变更来源，内部编辑不回写 props；宿主每次渲染传入
  内容相同的新数组不会冲掉内部编辑。内部文档变化通过 store 订阅回调
  `onNodesChange` / `onEdgesChange` / `onSelectionChange`。
- **受控模式（R4-2）**：传入 `workflow` prop 即进入受控模式——内部编辑经 `onChange`
  写回宿主，宿主改文档经 `store.applyExternalDocument` 回流画布。两者都用
  `getDocumentKey` 做**内容指纹去重**（忽略 `selected` 这类视图态），因此宿主每次
  渲染传出的同内容文档不会打断内部编辑。不传 `workflow` 时行为与 v1.3 完全一致。
- 视口数学与节点几何是纯函数，分别在 `lib/viewport.ts`（25%–200% 缩放、锚点缩放、
  fit view）与 `lib/geometry.ts`（节点固定 160×48，输出/输入锚点在上/下边缘中点）。
  连线校验（禁自连、禁重复、单入）在 `lib/connection.ts`。
- 节点类型体系（R3-1、R3-2）：类型定义在 `lib/registry.ts`（`NodeTypeDefinition` /
  `ParamSchema` / `HandleDefinition`），内置 6 类在 `lib/builtinTypes.tsx`，上下文与
  `nodeTypes` prop 的合并在 `lib/registryContext.tsx`。**新增一种节点类型只需新增一个
  定义文件**，不改内核；未注册类型回落为通用卡片，不报错。
- 锚点由注册表的 `handle.offset` 决定横向位置；`Edge` 带 `sourceHandle` /
  `targetHandle`，条件节点有两个具名出口（`true` / `false`），普通节点单入单出。
  `lib/geometry.ts` 的 `getSourceHandlePositionById` / `getTargetHandlePositionById`
  按锚点 id 算端点。
- 配置面板在 `components/ConfigPanel.tsx`：只消费注册表给出的参数 schema，不认识具体
  节点类型；改值经 `store.updateNodeData` 写回 `node.data`，连续输入在 600ms 合并窗口
  内合成一条历史记录（`pushHistory`）。
- **变量引用（R4-5、R4-6）**：语法是 `{{nodeId.field}}`（`lib/variables.ts`）。
  字段作用域的**唯一来源是节点类型注册表**——`NodeTypeDefinition` 的 `inputFields` /
  `outputFields`（`FieldSchema`）。`checkReferences` 依次检查目标节点存在、字段已声明、
  目标在拓扑上游（`getUpstreamNodeIds` 沿连线回溯）、类型与参数类型匹配（`isTypeCompatible`）；
  失败时配置面板标红。`listAvailableVariables` 只列上游节点的输出字段，
  `components/VariablePicker.tsx` 按节点分组展示并写入 `{{nodeId.field}}` 字面量。
  **不要引入第二套变量模型**，也不要改引用语法。
- **文档级校验（R4-7）**：`lib/validation.ts` 的 `validateDocument` 产出问题列表
  （孤立节点 / 悬空连线 / 必填缺失 / 引用失效 / 类型未注册）；孤立节点是**警告**，
  其余是**错误**。`components/ValidationPanel.tsx` 展示列表，点击问题定位并选中节点，
  面板可折叠、不阻塞编辑。
- **导入导出（R4-3）**：`lib/serialization.ts` 的 `exportWorkflow` / `importWorkflow` /
  `downloadWorkflow` / `readFileText`。导入校验结构与节点类型是否注册，不通过时给可读错误
  并拒绝导入。**导入成功后可撤销一次**——`replaceDocument`（`lib/actions.ts`）压入的是
  **导入前**的快照。
- **工具栏（R4-9、R5-9）**：`components/Toolbar.tsx` 提供撤销 / 重做 / 适应画布 /
  试运行 / 取消运行 / 导出 / 导入；按钮态随可用性禁用。`lib/actions.ts` 用模块级引用登记
  画布容器（`registerCanvasContainer`），让"适应画布"能拿到容器尺寸——**不要把 DOM 引用塞进
  store 状态**。
- 交互：滚轮以指针为锚点缩放；空格 + 左键或中键拖拽平移；从节点下方锚点拖到上方锚点
  创建连线，非法目标标红并给出原因；单击/Shift 多选、Delete/Backspace 删除、
  `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` 撤销重做、Esc 取消选择；左下角有缩放比例与适应画布；
  左侧 `NodePanel` 列出注册表里的全部类型（内置 6 类 + 宿主自定义），支持点击或拖入创建。
- `ReactFlow` 的 `showNodePanel` / `showConfigPanel` 默认开启（画布上的浮动覆盖层）；
  宿主自建三栏布局时关掉这两个，改用导出的 `NodePanel` / `ConfigPanel`（`variant="inline"`）
  并用 `NodeTypeProvider` 让面板与画布共享同一份注册表。
- **运行调试（v1.5，M3 已收口）**：`Runner` 接口在 `lib/runner.ts`
  （`run(workflow, hooks, signal, context)`；`hooks` 含 `onRunStart` / `onRunEnd` /
  `onNodeStart` / `onNodeEnd` / `onNodeSkip`）。`lib/execution.ts` 提供内置 Mock Runner
  （`createMockRunner`，按拓扑顺序执行、单节点延迟可配）与运行期变量替换
  （`resolveRuntimeValue` / `resolveRuntimeParams`）；`lib/runController.ts` 是试运行控制器
  （`startRun` / `cancelRun` / `isRunLocked`）；`lib/runStore.ts` 存运行态与运行记录
  （`useRunStore`，**画布与记录面板读同一份数据**，因此状态不会漂移）。
  **运行态与运行记录是视图态，不写回 `Workflow` 文档、不进历史栈**（ROADMAP Q20）。
  节点运行态五态为 `idle` / `running` / `success` / `error` / `skipped`。
- 尚未实现（v1.6 及以后）：框选、复制粘贴、节点重命名、网格吸附、会话变量、性能基准脚本、
  自动布局、小地图、主题与可访问性、发布流程与包改名、异常策略、资源与性能观测、
  循环与并行分支的执行语义。
  v1.6 的范围见 [docs/ROADMAP.md §11](docs/ROADMAP.md#11-v16-范围m3-及以前的遗留收口--编辑器手感)
  （收口 M1 ~ M3 至今未做的部分：框选 / 复制粘贴 / 重命名 / 网格吸附 / 运行结果回填 / 画布侧错误详情），
  v1.5 的范围与实施记录见 [docs/ROADMAP.md §10](docs/ROADMAP.md#10-v15-范围) 与 §10.10，
  v1.4 的范围与实施记录见 [§9](docs/ROADMAP.md#9-v14-范围) 与 §9.10，v1.3 的实施记录见 §8.10。
- `packages/react/src/index.ts` 导出 store、`ReactFlow`、`NodePanel`、`ConfigPanel`、
  `Toolbar`、`ValidationPanel`、`VariablePicker`、`SchemaPreview`、`RunPanel`、
  `NodeTestPanel`、`NodeTypeProvider`、注册表与参数校验工具、变量引用与文档校验工具、
  导入导出工具、`Runner` / `NodeExecutor` 接口与运行期工具（`startRun` / `cancelRun` /
  `setRunner` / `useRunStore` 等），以及 `Node` / `Edge` / `Workflow` / `WorkflowMeta` /
  `Viewport` / change 类型与文档模型函数；
  `NodeRenderer` / `EdgeRenderer` / 各 `lib` 内部模块**没有**对外导出。

## 交流约定

- 在飞书群里 @ 机器人，或在 GitHub issue 下评论并 @ 机器人账号。
  注意：必须是**评论**，写在 issue 正文里的 @ 不会被接收。
- 用**自己的账号**（不是机器人账号）发消息，否则会被当作机器人自触发而忽略。
- 工单建立后，会持续订阅它所在的会话。**后续讨论不必再 @ 它**，消息会进到同一个工单。
- 机器人做的每个动作都以 `xunmu-spuer` 名义出现。PR 由人 review 和 merge，
  机器人不会自己合并。
