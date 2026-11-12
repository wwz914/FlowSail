# FlowSail 视觉方向 · 2026-11

在 0.2.1（`main` @ `4dd5fbc`）的当前界面基础上，产出四版完整界面视觉方向，供评审选择；**选定方向后再进入 UI 重构**。

- 评审入口：[`index.html`](index.html)（四版对比 + 现状基线 + 方向说明）
- 单版页面：[A 精炼工作台](direction-a-precision.html) · [B 暖纸手作](direction-b-paper.html) · [C 深色智能](direction-c-obsidian.html) · [D 工程蓝图](direction-d-blueprint.html)
- 截图：[`screenshots/`](screenshots)（Chrome，1280 × 800）

## 共同场景

四版使用完全相同的布局、文案、流程拓扑与节点几何，只改变视觉语言，便于横向比较：

- 1280 × 800，选中「条件」节点：配置面板展开、节点浮动工具条可见；
- 流程：开始 → 大模型 → 条件 →（是）大模型 /（否）结束；
- 节点仍是 160 × 48，锚点位置、连线拓扑、面板结构与交互语义都不变；
- 现状基线为 0.2.1 的 `after-condition.png`（`main` @ `4dd5fbc`）。C 是深色方向，其余三版是亮色。

## 四个方向

| 方向 | 关键词 | 一句话 |
| --- | --- | --- |
| A 精炼工作台 / Precision | 中性灰、细线、靛蓝强调、近黑主按钮 | 在现状上做减法，最克制的一版 |
| B 暖纸手作 / Paper | 奶油纸面、衬线标题、圆形图标、陶土色 | 更亲和、更像一张可以慢慢写的纸 |
| C 深色智能 / Obsidian | 近黑画布、紫青渐变、光晕、玻璃面板 | 强调 AI 工作流工具的沉浸感 |
| D 工程蓝图 / Blueprint | 图纸网格、等宽标注、直角连线、方形锚点 | 更像开发者工具，突出流程结构 |

## 查看方式

直接双击 HTML 即可，无外部依赖、无构建步骤：

```sh
open docs/design-drafts/2026-11-ui-directions/index.html
```

页面按 1280 × 800 设计；窗口更窄时画布区域会裁切，建议全屏或按设计尺寸查看。

截图由本机 Chrome 对上述 HTML 在 1280 × 800 下实拍：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --hide-scrollbars --window-size=1280,800 \
  --screenshot=docs/design-drafts/2026-11-ui-directions/screenshots/direction-a.png \
  "file://$PWD/docs/design-drafts/2026-11-ui-directions/direction-a-precision.html"
```

## 范围与限制

- 这些是**视觉设计稿**，不是已实现的功能；接入实现时仍要遵守现有 `--flow-*` token、亮 / 暗主题、键盘可访问性与 160 × 48 节点几何。
- D 的直角连线、虚线选中框、方形锚点属于视觉提案，落地前需要评估对连线交互与命中判定的影响。
- B 的衬线字体依赖系统字体（Georgia / Songti SC），实现时需要给出跨平台字体回退。
- 选定方向后，在 PR 或飞书回复 A / B / C / D 与要保留的细节；后续单独开工单做 UI 重构，并提供 Before / After 实拍。
