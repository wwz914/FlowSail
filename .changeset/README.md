# Changesets

本目录存放 [Changesets](https://github.com/changesets/changesets) 的发布记录。

- 每个改动公开包行为的 PR 都应附带一个 changeset：`pnpm changeset`
- 合并后由维护者执行 `pnpm version` 生成 CHANGELOG 与版本号，再手动触发 `Release` 工作流发布
- 发布流程、secret 与回滚见 [docs/RELEASING.md](../docs/RELEASING.md)
