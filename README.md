# FlowSail

> 一个迷你工作流开发套件（mini workflow dev-kit）：可嵌入 React 应用的 AI 工作流画布编辑器内核。

[产品 PRD](docs/PRD.md) · [初期路线图](docs/ROADMAP.md) · [开发约定](AGENTS.md)

**当前状态：M1 已收口（v0.0.x）。** 画布可缩放/平移、从锚点连线、选择/删除、撤销重做，并可从左侧面板创建节点；测试与构建链路已打通。公开 API 仍不稳定，尚未提供可安装的发布产物。

---

## 它是什么

FlowSail 想做一个**轻量、可嵌入、与执行后端解耦**的工作流编辑器，对标[扣子（Coze）工作流编辑器](https://www.coze.cn/open/docs/guides/workflow)：

- 数据层框架无关：`@system` 只包含类型与纯函数；
- 视图层是标准 React 组件，支持受控用法，样式不全局污染；
- 工作流文档是纯 JSON，可被任意宿主后端消费或执行；
- 节点类型可注册扩展，执行器（Runner）由宿主注入。

它**不是**：模型托管平台、插件市场、后端服务，也不是扣子的像素级复刻。

## 现在能做什么

| 能力 | 状态 |
| --- | --- |
| 节点 / 连线渲染（贝塞尔曲线 + 箭头） | ✅ 可用 |
| 鼠标拖拽移动节点 | ✅ 可用 |
| 画布缩放（25%–200%）/ 空格或中键平移 / 适应画布 | ✅ 可用 |
| 锚点与拖拽连线（自连、重复、单入校验） | ✅ 可用 |
| 节点卡片（图标 + 标题 + 类型徽标，常态/悬停/选中） | ✅ 可用（首版 3 类内置类型） |
| 选择 / 多选 / 删除（节点与连线） | ✅ 可用 |
| 撤销 / 重做（快照历史，拖拽合并） | ✅ 可用 |
| 节点创建入口（左侧面板点击或拖入画布） | ✅ 可用 |
| 节点类型注册表、配置面板、变量引用 | ❌ 未实现（M2） |
| 试运行、运行记录、调试 | ❌ 未实现 |
| 文档导出 / 导入 | ❌ 未实现 |
| 自动化测试（Vitest） | ✅ 覆盖数据层、视口/连线计算、选择/删除/历史与节点渲染 |

完整的能力拆解与优先级见 [PRD](docs/PRD.md) 与 [ROADMAP](docs/ROADMAP.md)。

## 快速开始

前置要求：Node.js ≥ 20.19（Vite 7 要求）、pnpm 10（仓库 `packageManager` 固定为 `pnpm@10.23.0`，可用 `corepack enable` 启用）。

```sh
# 1. 安装依赖（首次必须，worktree 是新目录时尤其注意）
pnpm install

# 2. 启动示例应用
pnpm dev
# → http://localhost:5173
```

打开后能看到 Start / LLM / End 三个节点和一条已连好的连线，可以：

- 滚轮缩放（以指针为锚点），左下角查看比例、点击比例重置为 100%；
- 按住空格 + 左键或中键拖动画布，左下角「适应」一键框住全部节点；
- 拖动节点（多选时整体移动），连线实时跟随；
- 从节点下方圆点拖到另一个节点上方圆点创建连线（非法连接会标红并提示原因）；
- 单击节点/连线选中，Shift 追加选择，Delete / Backspace 删除，`Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Shift+Z` 重做；
- 左侧「节点」面板点击创建节点，或把面板项拖到画布按落点创建（删空画布后也能继续创建）。

示例源码在 `packages/example/src/App.tsx`，只传入 `nodes` / `edges` 两个 props。

## 仓库结构

```
packages/
  system/     @system   框架无关的数据层：Node / Edge / Workflow 类型、变更合并纯函数
  react/      react     React 画布实现：ReactFlow 容器、NodePanel、NodeCard、EdgeRenderer、zustand store
  example/    example   Vite + React 演示应用（private，不发布）
docs/
  PRD.md                产品需求文档：定位、对标、功能需求、数据模型
  ROADMAP.md            初期基础能力建设清单与阶段规划
```

根目录 `package.json` 名为 `my-flow`（private），只承载共享依赖、根脚本与构建依赖，**本身不是一个包**。

## 三个包

| 包 | 包名 | 入口 | 说明 |
| --- | --- | --- | --- |
| `packages/system` | `@system` | `src/index.ts`（TS 源码） | 无运行时依赖 |
| `packages/react` | `react`（示例中通过 `reactflow` 别名引入） | `src/index.ts`（TS 源码） | 依赖 React、zustand |
| `packages/example` | `example`（private） | `src/main.tsx` | 仅用于本地演示 |

### 三个容易踩的坑

1. **`packages/react` 的包名是 `react`**，与 npm 上的 react 同名。示例通过 `"reactflow": "workspace:../react"` 引入，因此示例里写 `import { ReactFlow } from 'reactflow'`，实际指向 `packages/react`。改 `packages/react` 的导出，改的就是示例里的 `reactflow`。
2. **两个库包直接暴露 TypeScript 源码**，`main` / `types` 指向 `src/index.ts` 而非 `dist/`；`dist/` 是 `pnpm build` 的发布产物，示例不消费它。
3. **`@system` 通过 workspace 依赖解析**（`packages/react/node_modules/@system`），库内统一写 `import ... from '@system'`，不要写 `@system/types.ts` 子路径；示例需要类型时从 `reactflow` 重导出的 `Node` / `Edge` 取。

## 开发与验证

```sh
pnpm install       # 安装依赖
pnpm dev           # 开发服务器 http://localhost:5173
pnpm lint          # ESLint
pnpm test          # Vitest（jsdom）
pnpm typecheck     # tsc -b，覆盖全部库源码
pnpm build         # 构建 system → react → example
```

两个库包用 Vite library mode 产出 ESM、用 `tsc -p tsconfig.build.json` 产出 `.d.ts`；旧的手动 `npx rollup -c` 链路已移除。

**判断标准**：改动前先跑一次同样的命令记下基线，改动后对比，**只有新增的错误才是你的问题**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | 产品定位、目标用户、扣子对标、功能需求（含优先级与验收标准）、数据模型草案、非功能需求、风险 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 现状盘点、M1–M4 阶段任务、依赖关系、优先级总表、明确暂不做的范围 |
| [AGENTS.md](AGENTS.md) | 面向协作代理与贡献者的仓库约定、命名陷阱、当前状态 |

## 路线图概览

| 阶段 | 主题 | 目标 |
| --- | --- | --- |
| **M1** | 工程地基 + 可用画布 | 修类型/Hooks/测试/构建，做出能缩放、连线、选择、删除、撤销的画布 |
| **M2** | 节点体系与配置 | 节点注册表、6 类基础节点、配置面板、变量引用、文档模型 |
| **M3** | 运行与调试 | Runner 接口、试运行、运行记录、节点状态 |
| **M4** | 交付与生态 | 构建产物、在线示例、发布流程、主题与可访问性 |

M1 已完成：工程地基（G-1 ~ G-6）与画布交互 C-1 ~ C-3、C-5 ~ C-11（C-11 先落地 3 类内置
节点的卡片视觉）；C-4 的锚点与命中机制已落地，6 类节点的锚点定义随 M2 节点体系补齐。
第二轮的实施记录见 [ROADMAP §7.9](docs/ROADMAP.md#79-实施结果2026-11-03)，M2 及之后的阶段见 [ROADMAP](docs/ROADMAP.md)。

## 参与开发

- 分支名用 `agent/<短名>` 形式；
- 提交身份使用 `xunmu-spuer` 与其 GitHub noreply 邮箱，不使用仓库 owner 的个人身份；
- PR 由人 review 和 merge，机器人不自行合并；
- 讨论在飞书群 @ 机器人，或在 GitHub issue / PR 下评论并 @ 机器人账号。

更细的约定见 [AGENTS.md](AGENTS.md)。

## 许可证

仓库根 `package.json` 标注为 ISC，但尚未添加独立的 `LICENSE` 文件（待补充）。
