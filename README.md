# FlowSail

> 一个迷你工作流开发套件（mini workflow dev-kit）：可嵌入 React 应用的 AI 工作流画布编辑器内核。

[产品 PRD](docs/PRD.md) · [初期路线图](docs/ROADMAP.md) · [开发约定](AGENTS.md)

**当前状态：早期雏形（v0.0.x）。** 只有静态画布渲染与节点拖拽，公开 API 尚不稳定，尚未提供可安装的发布产物。

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
| 节点 / 连线的静态渲染 | ✅ 可用 |
| 鼠标拖拽移动节点 | ✅ 可用 |
| 节点类型与图标 | 🚧 仅有 `data.label`，类型体系待建 |
| 画布缩放 / 平移 | ❌ 未实现 |
| 锚点与拖拽连线 | ❌ 未实现 |
| 选择 / 多选 / 删除 | ❌ 未实现 |
| 撤销 / 重做 | ❌ 未实现 |
| 节点配置面板、变量引用 | ❌ 未实现 |
| 试运行、运行记录、调试 | ❌ 未实现 |
| 文档导出 / 导入 | ❌ 未实现 |
| 自动化测试 | ❌ 仓库尚无测试套件 |

完整的能力拆解与优先级见 [PRD](docs/PRD.md) 与 [ROADMAP](docs/ROADMAP.md)。

## 快速开始

前置要求：Node.js ≥ 20.19（Vite 7 要求）、pnpm 10（仓库 `packageManager` 固定为 `pnpm@10.23.0`，可用 `corepack enable` 启用）。

```sh
# 1. 安装依赖（首次必须，worktree 是新目录时尤其注意）
pnpm install

# 2. 启动示例应用
pnpm --filter example dev
# → http://localhost:5173
```

打开后能看到两个节点和一条连线，拖动节点可移动。示例源码在 `packages/example/src/App.tsx`，只传入 `nodes` / `edges` 两个 props。

## 仓库结构

```
packages/
  system/     @system   框架无关的数据层：Node / Edge 类型、变更合并纯函数
  react/      react     React 画布实现：ReactFlow 容器、NodeRenderer、EdgeRenderer、zustand store
  example/    example   Vite + React 演示应用（private，不发布）
docs/
  PRD.md                产品需求文档：定位、对标、功能需求、数据模型
  ROADMAP.md            初期基础能力建设清单与阶段规划
```

根目录 `package.json` 名为 `my-flow`（private），只承载共享依赖与构建依赖，**本身不是一个包**。

## 三个包

| 包 | 包名 | 入口 | 说明 |
| --- | --- | --- | --- |
| `packages/system` | `@system` | `src/index.ts`（TS 源码） | 无运行时依赖 |
| `packages/react` | `react`（示例中通过 `reactflow` 别名引入） | `src/index.ts`（TS 源码） | 依赖 React、zustand、d3-drag/d3-selection |
| `packages/example` | `example`（private） | `src/main.tsx` | 仅用于本地演示 |

### 三个容易踩的坑

1. **`packages/react` 的包名是 `react`**，与 npm 上的 react 同名。示例通过 `"reactflow": "workspace:../react"` 引入，因此示例里写 `import { ReactFlow } from 'reactflow'`，实际指向 `packages/react`。改 `packages/react` 的导出，改的就是示例里的 `reactflow`。
2. **两个库包直接暴露 TypeScript 源码**，`main` / `types` 指向 `src/index.ts` 而非 `dist/`。
3. **`@system` 依赖根 `tsconfig.json` 的 `paths`**（`@system` → `packages/system/src`）。`packages/example/tsconfig.app.json` 不继承根配置，因此在示例构建中 `import ... from '@system/types.ts'` 会报 `TS2307`——这是既有问题，见下文。

## 开发与验证

仓库没有自动化测试，验证依赖以下命令：

```sh
pnpm install                       # 安装依赖
pnpm --filter example dev          # 开发服务器 http://localhost:5173
pnpm --filter example lint         # ESLint（当前通过）
pnpm --filter example build        # tsc -b && vite build（当前失败，见下）
npx rollup -c                      # 构建 packages/react（当前失败，见下）
```

**当前基线（`main` 上本来就失败，不代表你的改动有问题）**：

- `pnpm --filter example build`：tsc 报 8 条错误——`@system/types.ts` 无法解析 3 处、`onNodesChange`/`onEdgesChange` 未使用 2 处、`NodeRenderer` 的 `setNodes` 类型不匹配 1 处 + 隐式 any 2 处。
- `npx rollup -c`：`rollup-plugin-typescript2` 与 tsconfig 的 `module: NodeNext` 不兼容，构建直接报错。
- `pnpm test`：根包与两个库包的 `test` 脚本都是 `echo "Error: no test specified" && exit 1`。

**判断标准**：改动前先跑一次同样的命令记下基线，改动后对比，**只有新增的错误才是你的问题**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | 产品定位、目标用户、扣子对标、功能需求（含优先级与验收标准）、数据模型草案、非功能需求、风险 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 现状盘点、M1–M4 阶段任务、依赖关系、优先级总表、明确暂不做的范围 |
| [AGENTS.md](AGENTS.md) | 面向协作代理与贡献者的仓库约定、命名陷阱、既有问题 |

## 路线图概览

| 阶段 | 主题 | 目标 |
| --- | --- | --- |
| **M1** | 工程地基 + 可用画布 | 修类型/Hooks/测试/构建，做出能缩放、能连线的画布 |
| **M2** | 节点体系与配置 | 节点注册表、6 类基础节点、配置面板、变量引用、文档模型 |
| **M3** | 运行与调试 | Runner 接口、试运行、运行记录、节点状态 |
| **M4** | 交付与生态 | 构建产物、在线示例、发布流程、主题与可访问性 |

初期建议从 **修 Hooks 违规 + 引入测试框架 + 打通 `build`/`test`/`lint`** 开始，详见 [ROADMAP §6](docs/ROADMAP.md#6-下一步可直接开工的三件事)。

## 参与开发

- 分支名用 `agent/<短名>` 形式；
- 提交身份使用 `xunmu-spuer` 与其 GitHub noreply 邮箱，不使用仓库 owner 的个人身份；
- PR 由人 review 和 merge，机器人不自行合并；
- 讨论在飞书群 @ 机器人，或在 GitHub issue / PR 下评论并 @ 机器人账号。

更细的约定见 [AGENTS.md](AGENTS.md)。

## 许可证

仓库根 `package.json` 标注为 ISC，但尚未添加独立的 `LICENSE` 文件（待补充）。
