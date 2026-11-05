# @flowsail/core

## 0.2.0

### Minor Changes

- 98def78: v1.8：主题与可访问性、P1 交互补全（两个包保持版本一致）。
  
  - 新增 `--flow-*` 主题变量：默认亮色，`data-theme="dark"` 提供暗色；`ReactFlow` 新增 `theme` / `background` prop，宿主可覆盖任意变量
  - 键盘可达：画布 / 节点 / 连线可 Tab 到达，Enter / Space 选中、方向键按网格移动、可见焦点环与 `aria-label`
  - `Ctrl/Cmd+A` 全选、选中浮动工具条（创建副本 / 复制 / 删除）、从输入锚点反向拖断 / 改接连线
  - example 工具栏增加亮 / 暗主题切换

## 0.1.1

### Patch Changes

- d55f335: 补充 npm 包页面 README：两个包内新增 `README.md`（包定位、安装、最小用法、仓库 / 文档 / 许可证链接），`files` 显式包含 README，`check:pack` 校验 tarball 中的 README。

## 0.1.0

### Minor Changes

- 发布首个公开版本 0.1.0。
  
  - `@flowsail/core`：工作流文档模型、schema 迁移、Node / Edge / Workflow 类型与变更合并纯函数
  - `@flowsail/react`：可嵌入的 React 工作流画布编辑器（6 类内置节点、配置面板、变量引用、文档校验、Runner 接口与试运行）
  - 包入口改指 `dist`，提供 `exports` / `types`，React 18 / 19 作为 peer dependency
  - 采用 MIT 许可证
