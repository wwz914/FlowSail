# 发布与部署

本文覆盖 v1.7 引入的 npm 发布（R7-2）与 GitHub Pages 在线示例（R7-4），以及每个版本的
GitHub Release。发布与部署都只由维护者手动触发；CI 不会自行发布或部署。

**当前状态（2026-11-05）**：`@flowsail/core` 与 `@flowsail/react` 的 `0.1.0` / `0.1.1` / `0.2.0` 已发布到 npm；
GitHub Pages 已启用，在线示例可访问。每个版本在 GitHub 上都有一条 Release（正文取自两个包的 CHANGELOG），
Releases 页面：<https://github.com/wwz914/FlowSail/releases>。下面的"首次准备"保留为记录，后续版本直接走
[§2 发布前检查](#2-发布前检查r7-5-门禁)、[§3 版本与 CHANGELOG](#3-版本与-changelog) 与
[§4.3 每个版本一条 GitHub Release](#43-每个版本一条-github-release) 即可。

v1.8 已补齐两个包内的 `README.md`，并让 `files` 与 `check:pack` 显式包含它：
- **`0.1.1`（patch，PR #30，已发布）**：只含包内 README、`files` 与冒烟断言，已修复 npm 页面空壳；
  发布 commit `2935566`（PR #32），两个包的 tarball 均含 `package/README.md`；
- **`0.2.0`（minor，PR #31，已发布）**：主题变量与亮 / 暗、键盘可访问性、P1 交互；
  版本 commit 由收尾 PR #33 生成，Release 工作流 [42010164055](https://github.com/wwz914/FlowSail/actions/runs/42010164055) 于 2026-11-05 发布，tag `@flowsail/core@0.2.0` / `@flowsail/react@0.2.0` 指向 `3c39a40`；
- PR #30 / #32 先行修复包页面并发布 `0.1.1`；PR #31 已合并，`0.2.0` 的发布记录见 §6。

- 包：`@flowsail/core`（数据层）与 `@flowsail/react`（React 画布）
- 版本：`0.1.0` 起步、当前 `0.2.0`，changesets 管理；公开 API 在 `1.0.0` 前仍可能变动
- 许可证：MIT（根目录与两个包内各有一份 `LICENSE`）

---

## 1. 首次发布前的一次性准备

### 1.1 npm 组织与凭据（Q29）

1. 在 npm 创建或确认 `@flowsail` scope，并让负责发布的账号拥有该 scope 的发布权限。
2. 生成 **Granular Access Token**（或 Automation token），权限至少覆盖
   `@flowsail/core` 与 `@flowsail/react` 的 read & write。
3. 在 GitHub 仓库 `Settings → Secrets and variables → Actions` 添加 secret `NPM_TOKEN`。
4. 可选：给 `Release` 工作流使用的 `npm` environment 配置 required reviewers，
   让发布必须经过人工批准。

> 首次真实发布由负责人执行，或在明确授权后由代理执行（ROADMAP Q29）。没有
> `NPM_TOKEN` 时，`Release` 工作流只能跑 `dry_run`。

### 1.2 GitHub Pages（Q30）

在线示例使用 GitHub Pages 的项目站点：

- 地址：<https://wwz914.github.io/FlowSail/>
- 一次性设置：仓库管理员进入 `Settings → Pages → Build and deployment`，
  把 Source 设为 **GitHub Actions**。
- 未启用时，`Deploy example to GitHub Pages` 工作流会以明确的报错停止，
  不会发布半成品。`actions/configure-pages` 的自动启用需要管理员 PAT，
  本仓库不保存这类凭据，因此不启用自动创建。

启用后，`main` 分支每次推送都会自动构建并部署 `packages/example/dist`；
也可以在 Actions 里手动触发 `Deploy example to GitHub Pages`。

---

## 2. 发布前检查（R7-5 门禁）

在干净工作区执行：

```sh
pnpm install
pnpm lint                 # system / react / example 与脚本
pnpm test:coverage        # 覆盖率 ≥ 70%（packages/system/src 与 packages/react/src/lib）
pnpm typecheck            # 先构建库声明，再检查 example 从 dist 解析类型
pnpm build                # core → react → example
pnpm check:size           # @flowsail/react gzip JS + CSS < 60KB
pnpm check:links          # Markdown 链接与锚点
pnpm check:pack           # tarball 安装到干净目录并完成构建 / jsdom 渲染（React 19）
```

改了画布 / 面板（v1.8 起）还需在 dev server 上跑键盘走查：

```sh
pnpm dev                  # 终端输出的 URL（默认 5173，被占用会自动顺延）
node scripts/verify-v18.mjs http://localhost:5173   # 20 项键盘 / 主题 / P1 交互检查
```

CI 会额外跑 React 18 与 React 19 的 pack smoke，以及 Pages 子路径构建。
全部通过后才进入版本步骤。

---

## 3. 版本与 CHANGELOG

每个改动公开包行为的 PR 都附带一个 changeset：

```sh
pnpm changeset            # 选择 @flowsail/core / @flowsail/react 与 bump 类型，写说明
```

合并到 `main` 后，由维护者在本地执行版本步骤：

```sh
git checkout main && git pull
pnpm changeset version    # 同步两个包版本、内部依赖与 CHANGELOG.md
git diff                  # 检查版本号、CHANGELOG 与 workspace 依赖
git add .changeset packages/*/package.json packages/*/CHANGELOG.md
git commit -m "chore: release v0.1.0"
git push
```

`changeset version` 会删除已消费的 changeset 文件。`0.1.0`、`0.1.1` 与 `0.2.0` 的 changeset 均已消费，两个包当前是
`0.2.0`。后续版本继续按本节执行。发布前确认：

- 两个包的 `version` 一致（本版`fixed` 未启用，靠 changeset 同时 bump 保持一致）；
- tarball 含 `package/README.md`（`pnpm check:pack` 会断言），npm 页面显示包内 README；
- `packages/react/package.json` 的 `@flowsail/core` 仍是 `workspace:*`
  （`pnpm pack` 会在 tarball 中写成实际版本，见 §4）；
- CHANGELOG 面向使用者，写清破坏性变更与迁移方式；同一段内容会作为该版本
  GitHub Release 的正文（见 [§4.3](#43-每个版本一条-github-release)）。

版本策略：`0.x` 阶段破坏性变更用 minor；修复与新能力用 patch / minor；
`1.0.0` 是否发布由负责人决定（Q31）。

---

## 4. 触发发布

### 4.1 推荐：Release 工作流

1. 打开 Actions → **Release** → **Run workflow**。
2. `provenance` 保持 `true`（公开仓库 + `id-token: write` 可生成 npm provenance）。
3. 首次可先勾选 `dry_run: true` 跑一遍：执行 lint / test / typecheck / build /
   体积门禁 / pack smoke，并打印本版本的 Release 正文，但不发布。
4. 确认无误后以 `dry_run: false` 再跑一次，工作流会：
   - `pnpm changeset publish` 发布两个包；
   - 推送 changeset 生成的 git tag（`@flowsail/core@x.y.z`、`@flowsail/react@x.y.z`）；
   - 创建 / 更新该版本的 GitHub Release（tag `vX.Y.Z`，见 [§4.3](#43-每个版本一条-github-release)）。

发布后检查 npm 页面、`npm view @flowsail/react version` 与 tag 是否一致。

### 4.2 本地手动发布（备用）

```sh
pnpm install
pnpm build
pnpm check:size
npm login                # 有 @flowsail 发布权限的账号
pnpm changeset publish   # 会自动打包、改写 workspace 协议、发布并打 tag
git push origin --tags
```

`pnpm changeset publish` 使用 npm 的发布链路；`pnpm pack` 的 tarball 就是把
`workspace:*` 解析成实际版本的产物，可用 `pnpm check:pack` 在本地复核。

### 4.3 每个版本一条 GitHub Release

Release 工作流在 npm 发布成功后执行 `node scripts/release-github.mjs`，为当前版本创建
一条 GitHub Release（[Releases 页面](https://github.com/wwz914/FlowSail/releases)）：

- **tag**：`vX.Y.Z`，指向本次发布 commit；changesets 生成的包 tag 继续保留，两者并存；
- **标题**：`vX.Y.Z`；
- **正文**：合并 `@flowsail/core` 与 `@flowsail/react` 的 `CHANGELOG.md` 中本版本条目
  （相同条目去重，跳过 changeset 的依赖联动行），附安装命令、在线示例、npm 页面与
  上一版本的 compare 链接；
- **幂等**：`vX.Y.Z` 已有 Release 时只更新标题与正文，不会重复创建；
- **预检**：发布前先跑一次 `--dry-run` 打印正文，确认 CHANGELOG 段落齐全；
  `dry_run: true` 的发布到这一步结束，不会创建 Release；

补发历史版本或修复正文（本地已登录 `gh`，或设置 `GH_TOKEN`）：

```sh
# 当前 package.json 版本
node scripts/release-github.mjs
# 历史版本：tag 已存在时只更新正文，不存在时按 --target 创建
node scripts/release-github.mjs --version 0.1.0 --target dfc7d69
```

脚本会校验两个包版本一致（未传 `--version` 时）以及对应版本的 CHANGELOG 段落存在，
失败时明确报错，不会创建空正文的 Release。

---

## 5. 回滚与补救

npm 的不可变发布策略决定了回滚手段有限，按影响从小到大处理：

1. **标记问题版本**：`npm deprecate @flowsail/react@x.y.z "原因与替代版本"`
   （推荐；不删除已下载的包）。
2. **72 小时内撤包**：`npm unpublish @flowsail/react@x.y.z --force`。
   仅在严重错误且确认没有下游依赖时使用；npm 对撤包有窗口与频率限制。
3. **发布修复版**：新增 changeset → `changeset version` → 重新触发 Release；
   这是最主要的恢复路径。
4. **代码与 tag**：回滚引入问题的 commit，删除对应 git tag
   （`git tag -d <tag> && git push origin :refs/tags/<tag>`），并在 CHANGELOG 里说明。
5. **GitHub Release**：删除 tag 前先用 `gh release delete vX.Y.Z --yes` 删除对应
   Release；只修正更新内容时，重跑 `node scripts/release-github.mjs --version x.y.z`。

在线示例的回滚：Pages 部署以 `main` 的构建产物为准。回滚示例只需把
`main` 恢复到上一可用 commit 并重新运行部署工作流；也可以在 Actions 里
对失败部署执行 re-run。示例站点没有后端状态，不需要数据回滚。

---

## 6. 发布记录

| 版本 | 日期 | 内容 | 执行人 | changeset / PR | GitHub Release |
| --- | --- | --- | --- | --- | --- |
| 0.1.0 | 2026-11-04 | 首个公开版本：包改名、dist 入口、MIT、changesets、在线示例 | 维护者（Q29） | PR #28 | [v0.1.0](https://github.com/wwz914/FlowSail/releases/tag/v0.1.0) |
| 0.1.1 | 2026-11-05 | 两个包内 README、`files` 与 `check:pack` 断言；修复 npm 页面空壳 | 维护者 | PR #30 / #32（`2935566`） | [v0.1.1](https://github.com/wwz914/FlowSail/releases/tag/v0.1.1) |
| 0.2.0 | 2026-11-05 | 主题变量与亮 / 暗、键盘可达与可访问性、P1 交互补全 | 代理（负责人授权，Q29） | `.changeset/v18-theme-a11y.md`，PR #31 + 收尾 PR #33 | [v0.2.0](https://github.com/wwz914/FlowSail/releases/tag/v0.2.0) |

> `0.1.1` 发布后已复核：registry tarball 含 `package/README.md`，干净工程从 registry 安装后 `tsc --noEmit` 与 `vite build` 通过。发布记录与实现证据见
> [ROADMAP §13.10](./ROADMAP.md#1310-实施结果2026-11-05)。
>
> `0.2.0` 发布复核（2026-11-05）：`npm view @flowsail/react version` / `@flowsail/core version` 均为 `0.2.0`；两个 tag 指向发布 commit `3c39a40`。首次运行时 changeset 创建 annotated tag 需要 git 身份，Actions 默认没有配置，导致 tag 未生成；已在 `release.yml` 的 Publish 前补 `git config user.name/user.email`，并手工补推本次两个 tag。
>
> `v0.1.0` / `v0.1.1` / `v0.2.0` 的 GitHub Release 已于 2026-11-05 用 `scripts/release-github.mjs` 补齐：
> `v0.1.0` 指向 `dfc7d69`，`v0.1.1` 沿用已有 tag 并更新正文，`v0.2.0` 指向发布 commit `3c39a40`；
> 后续版本由 Release 工作流自动创建。
