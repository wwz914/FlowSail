// v1.8 键盘走查（R8-3、R8-5）：用真实浏览器验证可访问性与 P1 交互。
//
// 用法（需先 `pnpm dev` 启动示例应用）：
//   node scripts/verify-v18.mjs [url]
//
// 覆盖：Tab 顺序（画布 → 连线 → 节点）、Enter/Space 选中、方向键移动、
// Delete + 撤销、连线选中与删除、Ctrl/Cmd+A、主题切换与对比度抽查、
// 配置面板键盘输入、选中浮动工具条、输入锚点反向拖断。
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173'
const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const results = []

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `：${detail}` : ''}`)
}

async function load() {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
}

async function activeInfo() {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof Element)) return { tag: '', classes: [], nodeId: null, edgeId: null }
    return {
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      nodeId: element.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null,
      edgeId: element.closest('[data-edge-id]')?.getAttribute('data-edge-id') ?? null,
      label: element.getAttribute('aria-label'),
    }
  })
}

async function tabTo(predicate, max = 40) {
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press('Tab')
    const info = await activeInfo()
    if (predicate(info)) return info
  }
  return null
}

const state = () =>
  page.evaluate(() => {
    const store = window.__flowBenchStore
    if (!store) return null
    const current = store.getState()
    return {
      nodes: current.workflow.nodes,
      edges: current.workflow.edges,
      past: current.past.length,
      future: current.future.length,
    }
  })

// 1. Tab 顺序：工具栏之后进入画布，再到连线、节点。
await load()
const canvasInfo = await tabTo((info) => info.classes.includes('react-flow'))
check('Tab 可进入画布（role=application 且有名称）', Boolean(canvasInfo), canvasInfo?.label ?? '')

const edgeInfo = await tabTo((info) => Boolean(info.edgeId))
check('继续 Tab 可达连线', Boolean(edgeInfo), edgeInfo?.label ?? '')

const nodeInfo = await tabTo((info) => Boolean(info.nodeId))
check('继续 Tab 可达节点', Boolean(nodeInfo), nodeInfo?.label ?? '')
check(
  '聚焦节点有可见焦点环',
  Boolean(
    await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof Element)) return false
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
    }),
  ),
)

// 2. Enter 选中，方向键按 8px 移动，Delete 删除后撤销恢复。
const before = await state()
const nodeId = nodeInfo?.nodeId
const nodeBefore = before.nodes.find((node) => node.id === nodeId)
await page.keyboard.press('Enter')
const selected = await state()
check('Enter 选中聚焦节点', selected.nodes.find((node) => node.id === nodeId)?.selected === true)

await page.keyboard.press('ArrowRight')
const moved = (await state()).nodes.find((node) => node.id === nodeId)
check(
  '方向键按网格步长移动节点',
  moved.position.x === nodeBefore.position.x + 8,
  `x: ${nodeBefore.position.x} → ${moved.position.x}`,
)

await page.keyboard.press('Delete')
const deleted = (await state()).nodes.some((node) => node.id === nodeId)
check('Delete 删除聚焦且选中的节点', deleted === false)

await page.keyboard.press('Control+z')
const restored = (await state()).nodes.find((node) => node.id === nodeId)
check('Ctrl+Z 撤销删除', Boolean(restored))

// 3. 连线可选中、可删除。
await load()
const edge = await tabTo((info) => Boolean(info.edgeId))
const edgeId = edge?.edgeId
await page.keyboard.press('Enter')
check(
  'Enter 选中聚焦连线',
  (await state()).edges.find((item) => item.id === edgeId)?.selected === true,
)
await page.keyboard.press('Delete')
check(
  'Delete 删除选中连线',
  (await state()).edges.some((item) => item.id === edgeId) === false,
)

// 4. Ctrl/Cmd+A 全选；浮动工具条出现在选区上方。
await load()
await page.click('[data-node-id="llm"]')
await page.keyboard.press('Control+a')
const all = await state()
check(
  'Ctrl+A 全选节点与连线',
  all.nodes.every((node) => node.selected) && all.edges.every((item) => item.selected),
)

const toolbarVisible = await page.isVisible('.flow-selection-toolbar')
check('选中后出现浮动工具条', toolbarVisible)
const nodeCountBefore = all.nodes.length
await page.click('.flow-selection-toolbar button:has-text("创建副本")')
check(
  '浮动工具条创建副本（含内部连线）',
  (await state()).nodes.length === nodeCountBefore * 2,
)
await page.click('.flow-selection-toolbar button:has-text("复制")')
await page.keyboard.press('Control+v')
check('复制 + Ctrl+V 粘贴出副本', (await state()).nodes.length > nodeCountBefore * 2)
await page.keyboard.press('Control+a')
await page.click('.flow-selection-toolbar button:has-text("删除")')
check('浮动工具条删除选中节点', (await state()).nodes.length === 0)

// 5. 主题切换与对比度抽查。
await load()
// 工具栏按钮用键盘聚焦 + Enter 激活，验证工具条本身可键盘操作。
await page.focus('button:has-text("暗色主题")')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const themeState = await page.evaluate(() => {
  const canvas = document.querySelector('.react-flow')
  const node = document.querySelector('[data-node-id="llm"]')
  if (!(canvas instanceof Element) || !(node instanceof Element)) return null
  const canvasStyle = getComputedStyle(canvas)
  const nodeStyle = getComputedStyle(node)
  return {
    dataTheme: document.documentElement.dataset.theme,
    canvasBackground: canvasStyle.backgroundColor,
    nodeBackground: nodeStyle.backgroundColor,
    nodeText: nodeStyle.color,
  }
})
check('example 工具栏可用键盘切换到暗色主题', themeState?.dataTheme === 'dark')
check(
  '暗色主题使用深色画布背景',
  themeState?.canvasBackground === 'rgb(15, 23, 32)',
  themeState?.canvasBackground ?? '',
)

function luminance(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map((value) => {
    const channel = Number(value) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

if (themeState) {
  const ratio = contrast(themeState.nodeText, themeState.nodeBackground)
  check('暗色主题节点文字 / 背景对比度 ≥ 4.5', ratio >= 4.5, ratio.toFixed(2))
}

// 6. 配置面板键盘输入。
await load()
await page.click('[data-node-id="llm"]')
await page.focus('#flow-param-prompt')
await page.keyboard.press(`${selectAllModifier}+a`)
await page.keyboard.type('键盘输入的提示词')
await page.waitForTimeout(700)
const promptValue = await page.evaluate(() => {
  const store = window.__flowBenchStore.getState()
  return store.workflow.nodes.find((node) => node.id === 'llm')?.data.prompt
})
check('配置面板输入框可用键盘修改参数', promptValue === '键盘输入的提示词')

// 7. 输入锚点反向拖断：从 llm 的输入锚点拖到空白处，连线被摘掉。
await load()
const handle = await page.$('[data-node-id="llm"] .flow-handle--target.is-reconnectable')
if (handle) {
  const box = await handle.boundingBox()
  const canvasBox = await (await page.$('.react-flow')).boundingBox()
  const edgesBefore = (await state()).edges.length
  if (box && canvasBox) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(canvasBox.x + 200, canvasBox.y + 620, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    check(
      '从输入锚点反向拖到空白处摘线',
      (await state()).edges.length === edgesBefore - 1,
      `${edgesBefore} → ${(await state()).edges.length}`,
    )
  }
} else {
  check('输入锚点可反向拖拽', false, '未找到 is-reconnectable 锚点')
}

await browser.close()

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) process.exit(1)
