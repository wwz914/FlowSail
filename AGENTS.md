# FlowSail

一个迷你工作流开发套件（mini workflow dev-kit）。pnpm monorepo，画布式的节点/连线编辑器。

## 仓库结构

```
packages/system    @system   框架无关的数据层：Node/Edge 类型、变更合并工具。无运行时依赖。
packages/react     react     React 画布实现：ReactFlow 组件、NodeRenderer、EdgeRenderer、zustand store。
packages/example   example   Vite + React 演示应用（private，不发布）。
```

根目录 `package.json` 名为 `my-flow`（private），只承载共享依赖与构建依赖，**本身不是一个包**。

## 先读这一段：命名与解析上的坑

这几处看起来像 bug，其实是有意为之或历史遗留。**改动前先理解，不要顺手"修正"**：

1. **`packages/react` 的包名是 `react`**，与 npm 上的 `react` 同名。它在 example 里通过
   `"reactflow": "workspace:../react"` 引入，因此 example 中写的是
   `import { ReactFlow } from 'reactflow'`，实际指向 `packages/react`。
   → 改 `packages/react` 的导出，改的是 example 里 `reactflow` 这个名字。
2. **两个库包都直接暴露 TypeScript 源码**：`main` / `types` 指向 `src/index.ts`，
   不是 `dist/`。所以 `packages/system` 没有构建产物，示例直接编译它的源码。
3. **`@system` 靠根 `tsconfig.json` 的 `paths` 解析**（`@system` → `packages/system/src`）。
   注意 `packages/example/tsconfig.app.json` **不继承**根 tsconfig，
   因此在 example 的构建里 `import ... from '@system/types.ts'` 会报
   `TS2307: Cannot find module '@system/types.ts'`。这是既有问题，见下。
4. **只有 `packages/react` 有 rollup 构建脚本**（仓库根的 `rollup.config.js`，入口
   `packages/react/src/index.ts`），但**根 package.json 里没有对应的 npm script**，
   需要手动 `npx rollup -c`。`@system` 完全没有构建配置。
5. **导入必须带扩展名**：`.ts` / `.tsx` 显式写出（`allowImportingTsExtensions` +
   `verbatimModuleSyntax` + `moduleResolution: nodenext`）。`packages/react/src` 内
   一律 `from './store/index.ts'`、`from '../index.ts'` 这种写法。

## 已知既有问题（不要试图在无关任务里修）

当前 `main` 分支上，以下命令**本来就是失败的**。它们失败不代表你的改动引入了问题：

| 命令 | 现状 |
| --- | --- |
| `pnpm test` | 根 / `system` / `react` 的 `test` 脚本都是 `echo "Error: no test specified" && exit 1`。**本仓库没有测试套件。** |
| `pnpm --filter example build` | `tsc -b && vite build`，tsc 阶段失败（见下） |
| `pnpm --filter example lint` | eslint 报 1 个错：`src/App.tsx` 的 `useState` 未使用 |
| `pnpm --filter react build` | 无此 script |

`pnpm --filter example build` 的既有 tsc 错误（`packages/example` 与 `packages/react` 共 8 处）：

```
src/App.tsx(1,1): TS6133 'useState' 已声明未使用
../react/src/ReactFlow.tsx(6,33): TS2307 Cannot find module '@system/types.ts'
../react/src/ReactFlow.tsx(19,3): TS6133 'onNodesChange' 已声明未使用
../react/src/ReactFlow.tsx(20,3): TS6133 'onEdgesChange' 已声明未使用
../react/src/components/NodeRenderer.tsx(2,27): TS2307 Cannot find module '@system/types.ts'
../react/src/components/NodeRenderer.tsx(25,26): TS2345 '(nds: any) => any' 不能赋给 'Node[]'
../react/src/components/NodeRenderer.tsx(25,27): TS7006 'nds' 隐式 any
../react/src/components/EdgeRenderer.tsx(2,33): TS2307 Cannot find module '@system/types.ts'
```

**判断标准**：改动前先跑一次同样的命令记下基线，改动后对比。**只有新增的错误才是你的问题。**

## 怎么验证你的改动

仓库没有自动化测试，所以验证靠下面几项：

```sh
# 1. 装依赖（首次进入 worktree 时必须做，worktree 是新目录，没有 node_modules）
pnpm install
# pnpm 会依据 packageManager 字段自动切到 10.23.0；安装后可能有
# "Ignored build scripts: @parcel/watcher, esbuild" 警告，dev server 仍可正常运行。

# 2. 跑开发服务器看真实效果（UI 改动必做）
pnpm --filter example dev          # http://localhost:5173

# 3. 类型检查（会有既有错误，见上表；对比基线即可）
pnpm --filter example build

# 4. 代码风格
pnpm --filter example lint
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

- `packages/react/src/components/NodeRenderer.tsx` 在 `nodes.map()` 回调里调用
  `useRef` / `useEffect`。这违反了 React Hooks 规则（hook 必须在组件顶层调用），
  节点数量变化时可能触发 "Rendered more hooks than during the previous render"。
  这是既有问题；只有当任务本身就涉及节点渲染时才动它。
- `packages/react/src/store/index.ts` 中 `setNodes` 的类型声明是 `(nodes: Node[]) => void`，
  但实现同时接受 updater 函数，`NodeRenderer` 正在用函数式写法调用它。
  类型声明与实际用法不一致，是既有类型错误的来源。
- `packages/react/src/ReactFlow.tsx` 通过 `useEffect` 把 `nodes` / `edges` props
  同步进 zustand store；`NodeRenderer` 渲染时读的是 props，而拖拽时写的是 store。
  两条数据路径并存，改动时留意。
- `packages/react/src/index.ts` 只导出 `store/index.ts` 和 `ReactFlow.tsx`，
  `NodeRenderer` / `EdgeRenderer` **没有**对外导出。

## 交流约定

- 在飞书群里 @ 机器人，或在 GitHub issue 下评论并 @ 机器人账号。
  注意：必须是**评论**，写在 issue 正文里的 @ 不会被接收。
- 用**自己的账号**（不是机器人账号）发消息，否则会被当作机器人自触发而忽略。
- 工单建立后，会持续订阅它所在的会话。**后续讨论不必再 @ 它**，消息会进到同一个工单。
- 机器人做的每个动作都以 `xunmu-spuer` 名义出现。PR 由人 review 和 merge，
  机器人不会自己合并。
