# FlowSail

一个迷你工作流开发套件（mini workflow dev-kit）。pnpm monorepo，画布式的节点/连线编辑器。

## 仓库结构

```
packages/system    @system   框架无关的数据层：Node/Edge/Workflow 类型、变更合并工具。无运行时依赖。
packages/react     react     React 画布实现：ReactFlow 组件、NodePanel、NodeRenderer/NodeCard、EdgeRenderer、zustand store、viewport/connection 纯函数。
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
| `pnpm test` | Vitest（jsdom），覆盖 `@system` 纯函数、视口/连线计算、选择/删除/历史与节点渲染 |
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
- `store/index.ts` 以单份 `workflow`（`nodes` / `edges` / `viewport`）为唯一事实源，
  `setNodes` / `setEdges` / `setViewport` 只写文档、不入历史；`addNode` / `addEdge` /
  `deleteSelection` 入历史栈。历史是整份快照（容量 `HISTORY_LIMIT = 50`），拖拽开始时
  取快照、松手时 `pushHistory` 合并为一条；`undo` / `redo` 不还原视口。
- `ReactFlow.tsx` 对 `nodes` / `edges` props 做**内容差异**同步（非受控 + 初始值语义，
  R2-7）：宿主每次渲染传入内容相同的新数组不会冲掉内部编辑。内部文档变化通过
  store 订阅回调 `onNodesChange` / `onEdgesChange` / `onSelectionChange`。
- 视口数学与节点几何是纯函数，分别在 `lib/viewport.ts`（25%–200% 缩放、锚点缩放、
  fit view）与 `lib/geometry.ts`（节点固定 160×48，输出/输入锚点在上/下边缘中点）。
  连线校验（禁自连、禁重复、单入）在 `lib/connection.ts`。
- 节点类型元数据（图标、类型名、默认标题、强调色）在 `lib/nodeTypes.tsx`；
  M2 的注册表只接管数据来源，不改卡片渲染结构。
- 交互：滚轮以指针为锚点缩放；空格 + 左键或中键拖拽平移；从节点下方锚点拖到上方锚点
  创建连线，非法目标标红并给出原因；单击/Shift 多选、Delete/Backspace 删除、
  `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` 撤销重做、Esc 取消选择；左下角有缩放比例与适应画布；
  左侧 `NodePanel` 支持点击或拖入创建节点（首版开始 / 大模型 / 结束 3 类）。
- 尚未实现（M2 及以后）：框选、复制粘贴、节点类型注册表、配置面板与变量引用、
  文档序列化/校验、运行调试。
- `packages/react/src/index.ts` 导出 store、`ReactFlow` 与 `Node` / `Edge` / `Workflow` /
  `Viewport` / change 类型；`NodePanel` / `NodeRenderer` / `EdgeRenderer` / 各 `lib`
  内部模块**没有**对外导出。

## 交流约定

- 在飞书群里 @ 机器人，或在 GitHub issue 下评论并 @ 机器人账号。
  注意：必须是**评论**，写在 issue 正文里的 @ 不会被接收。
- 用**自己的账号**（不是机器人账号）发消息，否则会被当作机器人自触发而忽略。
- 工单建立后，会持续订阅它所在的会话。**后续讨论不必再 @ 它**，消息会进到同一个工单。
- 机器人做的每个动作都以 `xunmu-spuer` 名义出现。PR 由人 review 和 merge，
  机器人不会自己合并。
