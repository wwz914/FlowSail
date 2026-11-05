---
'@flowsail/core': minor
'@flowsail/react': minor
---

v1.8：主题与可访问性、P1 交互补全（两个包保持版本一致）。

- 新增 `--flow-*` 主题变量：默认亮色，`data-theme="dark"` 提供暗色；`ReactFlow` 新增 `theme` / `background` prop，宿主可覆盖任意变量
- 键盘可达：画布 / 节点 / 连线可 Tab 到达，Enter / Space 选中、方向键按网格移动、可见焦点环与 `aria-label`
- `Ctrl/Cmd+A` 全选、选中浮动工具条（创建副本 / 复制 / 删除）、从输入锚点反向拖断 / 改接连线
- example 工具栏增加亮 / 暗主题切换
