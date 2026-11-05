# FlowSail

一个迷你工作流开发套件（mini workflow dev-kit）。pnpm monorepo，画布式的节点/连线编辑器。

## 仓库结构

```
packages/system    @flowsail/core   框架无关的数据层：Node/Edge/Workflow 类型、变更合并工具、文档模型与 schema 迁移。无运行时依赖。
packages/react     @flowsail/react  React 画布实现：ReactFlow 组件、NodePanel、ConfigPanel、Toolbar、ValidationPanel、VariablePicker、SchemaPreview、RunPanel、NodeTestPanel、NodeRenderer/NodeCard、EdgeRenderer、节点类型注册表、变量引用与文档校验、Runner 接口与运行期状态、zustand store、viewport/connection 纯函数。
packages/example   example          Vite + React 演示应用（private，不发布，部署到 GitHub Pages）。
```

根目录 `package.json` 名为 `flowsail`（private），只承载共享依赖、根脚本与构建依赖，**本身不是一个包**。

产品与规划文档：[`docs/PRD.md`](docs/PRD.md)（定位、对标、功能需求）、[`docs/ROADMAP.md`](docs/ROADMAP.md)（阶段规划与实施记录）、[`docs/RELEASING.md`](docs/RELEASING.md)（发布、secret、回滚与 Pages 部署）。

## 先读这一段：命名与构建约定

v1.7（R7-1）已经完成包改名与发布入口切换，下面这几条是**当前**的事实，不要按旧名理解：

1. **包名是 `@flowsail/core`（`packages/system`）与 `@flowsail/react`（`packages/react`）**。
   example 直接依赖 `"@flowsail/react": "workspace:*"` 并 `import { ReactFlow } from '@flowsail/react'`；
   旧的 `reactflow` workspace 别名已删除。
2. **两个库包的入口都指向 `dist`**：`main` / `module` / `types` / `exports` 全部指向构建产物，
   `files` 含 `dist`、`LICENSE` 与 `README.md`。因此 example 的 `tsc -b` 与 Vite 消费的是**构建后的产物**，
   不是 TS 源码。根脚本已把顺序固定：`pnpm dev` / `pnpm typecheck` / `pnpm build` 都会先构建两个库包。
3. **库内统一 `import ... from '@flowsail/core'`**：`packages/react/package.json` 声明
   `"@flowsail/core": "workspace:*"`，pnpm 会创建 `packages/react/node_modules/@flowsail/core`。
   **不要写 `@flowsail/core/types.ts` 子路径**；example 需要数据类型时从 `@flowsail/react` 重导出的
   `Node` / `Edge` / `Workflow` 取。
4. **测试直接跑源码**：`vitest.config.ts` 把 `@flowsail/core` alias 到 `packages/system/src/index.ts`，
   避免测试读到过期的 `dist`。构建时 `packages/react/vite.config.ts` 把 `react` / `react-dom` /
   `zustand` / `@flowsail/core` 设为 external。
5. **导入必须带扩展名**：`.ts` / `.tsx` 显式写出（`allowImportingTsExtensions` +
   `verbatimModuleSyntax` + `moduleResolution: nodenext`）。`packages/react/src` 内
   一律 `from './store/index.ts'`、`from '../lib/viewport.ts'` 这种写法。
6. **CSS 是独立产物**：库源码里的 `style.scss` 由 Vite 抽成 `dist/style.css`，JS 不注入样式。
   宿主（含 example）必须显式 `import '@flowsail/react/style.css'`；`sideEffects` 只声明 CSS。
7. **peer 与依赖**：`react` / `react-dom` 是 `@flowsail/react` 的 peer（`>=18 <20`），
   `zustand` 与 `@flowsail/core` 是运行时依赖。`workspace:*` 在 `pnpm pack` / 发布时由工具链
   写成实际版本，不要手工改。
8. **pnpm 构建脚本**：`pnpm-workspace.yaml` 用 `onlyBuiltDependencies` / `allowBuilds` 允许
   `esbuild` 与 `@parcel/watcher`。新增依赖需要安装脚本时同步补充，否则 pnpm 会拦截。

## 当前状态（根脚本）

| 命令 | 说明 |
| --- | --- |
| `pnpm install` | 安装依赖（首次进入 worktree 必须执行） |
| `pnpm dev` | 构建两个库包后启动 example 开发服务器（http://localhost:5173） |
| `pnpm build` | 构建 `@flowsail/core` → `@flowsail/react` → example |
| `pnpm build:libs` | 只构建两个库包（修改库源码后刷新 example 前执行） |
| `pnpm test` | Vitest（jsdom），315 个用例，覆盖数据层、文档模型、视口/连线、选择/历史、渲染、注册表、变量引用、校验、导入导出、Runner 与运行期、主题、键盘可访问性、P1 交互与 Release 正文生成 |
| `pnpm test:coverage` | 同上并跑覆盖率门禁（统计 `packages/system/src` 与 `packages/react/src/lib`，要求 ≥ 70%） |
| `pnpm lint` | 仓库级 ESLint（flat config，覆盖 system / react / example / 脚本） |
| `pnpm typecheck` | 先构建库声明，再 `tsc -b packages/example/tsconfig.json` |
| `pnpm check:size` | 发布产物 gzip 门禁：`@flowsail/react`（JS + CSS）< 60KB |
| `pnpm check:links` | README / docs / AGENTS 的 Markdown 链接与锚点检查 |
| `pnpm check:pack` | `pnpm pack` → 干净目录安装 → 类型检查 / Vite 构建 / jsdom 渲染冒烟 |
| `pnpm changeset` | 新增 changeset；发布流程见 [docs/RELEASING.md](docs/RELEASING.md) |
| `pnpm release:github` | 为当前版本创建 / 更新 GitHub Release（需要 `gh` 登录） |

`pnpm test` 只跑根脚本即可；`packages/system`、`packages/react` 各自的 `test` 脚本
会复用根 `vitest.config.ts`，便于单包调试。

## 怎么验证你的改动

```sh
# 1. 装依赖（首次进入 worktree 时必须做，worktree 是新目录，没有 node_modules）
pnpm install

# 2. 跑开发服务器看真实效果（UI 改动必做；会先构建两个库包）
pnpm dev                            # http://localhost:5173

# 3. 类型检查 / 构建
pnpm typecheck
pnpm build

# 4. 测试与代码风格
pnpm test
pnpm lint

# 5. 发布前门禁（改了产物、文档或发布配置时）
pnpm test:coverage
pnpm check:size
pnpm check:links
pnpm check:pack
```

**UI 改动的验证要求**：改 `packages/react` 或 `packages/example` 的界面后，
必须在 PR 里给出 **Before / After 两张截图**，同一视口、同一场景、同一主题。
截图用 dev server 实际截取，不要用设计稿冒充旧实现。v1.8 的四组对比见
[docs/screenshots/v1.8](docs/screenshots/v1.8/README.md)，键盘走查脚本为
`node scripts/verify-v18.mjs [url]`。

## 发布与在线示例

- 发布流程、所需 secret、版本步骤与回滚：[docs/RELEASING.md](docs/RELEASING.md)
- `0.1.0` / `0.1.1` / `0.2.0` 已发布；后续版本由维护者触发 Release 工作流（或明确授权代理执行），CI 只校验，不自动发布。
- 每个版本在 GitHub 上有一条 Release（tag `vX.Y.Z`），正文取自两个包 CHANGELOG 的本版本条目；
  由 Release 工作流在 npm 发布后自动创建，补发用 `node scripts/release-github.mjs --version x.y.z`。
- 在线示例：<https://wwz914.github.io/FlowSail/>，Pages 已启用，`main` 推送自动部署。
- 每个改动公开包行为的 PR 都要带 changeset；`changeset version` 产出 CHANGELOG 后再触发 Release 工作流。

## 提交时的注意事项

- `.gitignore` 已忽略 `node_modules/`、`dist/`、`*.tsbuildinfo`、`.vite/`、`*.log`、`coverage/`。
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
- 文档模型在 `packages/system/src/document.ts`（`@flowsail/core` 直接导出）：
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
- **交互增强（v1.6，M1 ~ M3 遗留收口）**：框选在 `lib/marquee.ts`（`getMarqueeHits`，
  相交即命中；选框画在 `.flow-viewport` 里随视口变换）；复制粘贴在 `lib/clipboard.ts`
  （`collectClipboard` / `pasteClipboard`，新 id 边生成边登记，避免同批冲突；普通粘贴只复制
  节点，按住 `Alt` 才连同内部连线）；就地重命名走 `store.renameNode`（提交时才入历史）；
  网格吸附 `snapPosition`（默认 8px，按住 `Alt` 关闭）。**运行态仍是视图态**：运行结果回填
  到 `SchemaPreview` 的「最近一次运行」、画布侧错误详情都只读 `useRunStore`，不写回文档。
  会话变量在 `lib/sessionVariables.ts` + `components/SessionVariablePanel.tsx`，
  经 `RunContext.variables` 注入，不属文档。
- **主题与可访问性（v1.8、M4 D-5）**：`style.scss` 顶部的 `:root` / `[data-theme='dark']`
  定义全部 `--flow-*` 变量，组件样式只消费变量；`ReactFlow` 的 `theme` 写到画布根节点
  `data-theme`，省略时跟随宿主祖先；`background` 支持 `false` 与自定义 ReactNode。
  键盘：画布 `role="application"`、节点与连线 `role="button"` + `tabIndex=0` + `aria-label`，
  Enter / Space 选中、方向键按 `DEFAULT_GRID_SIZE` 移动（每次按键压一条历史）。
  **新增颜色不要写字面量，一律加 `--flow-*` token**，并同时补暗色值。
- **P1 交互（v1.8）**：`Ctrl/Cmd+A` 走 `store.selectAll`；`components/SelectionToolbar.tsx`
  按屏幕坐标浮在选区上方，复制与 Ctrl/Cmd+C 共用 `lib/clipboard.ts` 的模块级剪贴板；
  输入锚点反向拖拽复用连线预览与 `findTargetNode`，松手时 `removeEdge`（空白）或
  `reconnectEdge`（合法节点），`validateConnection` 用 `ignoreEdgeId` 忽略被摘下的连线。
- 性能基准：`node scripts/benchmark.mjs [url]`（需先 `pnpm dev`）构造 300 节点 / 500 连线，
  度量拖拽与缩放帧率并与 ≥ 50fps 目标对照。示例应用只在开发环境暴露
  `window.__flowBenchStore` 供脚本使用。
- **v1.7（2026-11-04 合并并首发 `0.1.0`）**：M4 交付主线——包改名与可发布产物、changeset 发布流程、
  README 安装 / 嵌入路径、GitHub Pages 在线示例、发布前质量门禁；实现记录见
  [docs/ROADMAP.md §12.10](docs/ROADMAP.md#1210-实施结果2026-11-04)，发布与在线示例见
  [docs/ROADMAP.md §12.9](docs/ROADMAP.md#129-与待确定事项的关系)。**发包时两个包内没有
  `README.md`，npm 页面为空**；v1.8 的 R8-1 以 `0.1.1` 补丁修复。
- **v1.8（2026-11-05 合并（PR #31）并发布 `0.2.0`）**：M4 收口——两个包内 README 与 `0.1.1` patch
  （PR #30 / #32）、主 PR #31、`--flow-*` 主题变量与亮 / 暗（D-5）、键盘可达与可访问性、
  P1 交互补全（`Ctrl/Cmd+A`、选中浮动工具条、输入锚点反向拖断 / 改接）；
  实现记录见 [docs/ROADMAP.md §13.10](docs/ROADMAP.md#1310-实施结果2026-11-05)，
  键盘走查见 [docs/v1.8-keyboard-walkthrough.md](docs/v1.8-keyboard-walkthrough.md)，
  视觉对比见 [docs/screenshots/v1.8](docs/screenshots/v1.8/README.md)。
  PRD Q9（扣子能力清单复核）已于同日完成：官方文档未证实小地图、自动布局具备，
  见 [docs/PRD.md §4.5](docs/PRD.md#45-q9-复核记录2026-11-05)。
  仍不在范围：自动布局、小地图、异常策略、资源与性能观测、循环 / 并行分支的执行语义。
  v1.6 的范围与实施记录见 [docs/ROADMAP.md §11](docs/ROADMAP.md#11-v16-范围m3-及以前的遗留收口--编辑器手感)
  与 §11.10，v1.5 见 [§10](docs/ROADMAP.md#10-v15-范围) 与 §10.10，
  v1.4 见 [§9](docs/ROADMAP.md#9-v14-范围) 与 §9.10，v1.3 的实施记录见 §8.10。
- `packages/react/src/index.ts` 导出 store、`ReactFlow`、`NodePanel`、`ConfigPanel`、
  `Toolbar`、`SelectionToolbar`、`ValidationPanel`、`VariablePicker`、`SchemaPreview`、`RunPanel`、
  `NodeTestPanel`、`SessionVariablePanel`、`NodeTypeProvider`、注册表与参数校验工具、
  变量引用与文档校验工具、框选（`getMarqueeHits` / `snapPosition`）、复制粘贴
  （`collectClipboard` / `pasteClipboard` / `copySelection` / `getClipboardContent` /
  `setClipboardContent`）、会话变量（`validateSessionVariables` /
  `buildRunVariables`）、导入导出工具、`Runner` / `NodeExecutor` 接口与运行期工具
  （`startRun` / `cancelRun` / `setRunner` / `useRunStore` 等），以及 `Node` / `Edge` /
  `Workflow` / `WorkflowMeta` / `Viewport` / change 类型与文档模型函数；
  `NodeRenderer` / `EdgeRenderer` / 各 `lib` 内部模块**没有**对外导出。

## 交流约定

- 在飞书群里 @ 机器人，或在 GitHub issue 下评论并 @ 机器人账号。
  注意：必须是**评论**，写在 issue 正文里的 @ 不会被接收。
- 用**自己的账号**（不是机器人账号）发消息，否则会被当作机器人自触发而忽略。
- 工单建立后，会持续订阅它所在的会话。**后续讨论不必再 @ 它**，消息会进到同一个工单。
- 机器人做的每个动作都以 `xunmu-spuer` 名义出现。PR 由人 review 和 merge，
  机器人不会自己合并。
