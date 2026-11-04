// v1.7 在线示例主链路验证（ROADMAP §12.3 R7-4）：
//   在按 GitHub Pages 子路径构建的示例上完成「建节点 → 连线 → 配参数 → 试运行」，
//   并确认所有静态资源都从子路径加载、没有 404。
//
// 用法：node scripts/verify-v17.mjs [url]
// 需要先以 Pages 子路径构建并启动预览：
//   VITE_BASE=/FlowSail/ pnpm build
//   VITE_BASE=/FlowSail/ pnpm --filter example preview -- --port 4173
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4173/FlowSail/'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const failedRequests = []
page.on('requestfailed', (request) => failedRequests.push(request.url()))
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.flow-node', { timeout: 10000 })
await page.waitForTimeout(500)

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 从左侧节点面板创建一个节点。
const beforeNodes = await page.locator('.flow-node').count()
await page.click('.flow-node-panel__item[data-node-type="llm"]')
await page.waitForTimeout(400)
const afterNodes = await page.locator('.flow-node').count()
check('从节点面板创建节点', afterNodes === beforeNodes + 1, `${beforeNodes} → ${afterNodes}`)

const newNodeId = await page.locator('.flow-node.is-selected').getAttribute('data-node-id')
check('新节点被选中', Boolean(newNodeId), newNodeId ?? '')

// 2. 从 llm 的下方锚点拖到新节点的上方锚点。
const beforeEdges = await page.locator('.flow-edge').count()
const source = page.locator('[data-node-id="llm"] .flow-handle--source')
const target = page.locator(`[data-node-id="${newNodeId}"] .flow-handle--target`)
const sourceBox = await source.boundingBox()
const targetBox = await target.boundingBox()
check('源锚点与目标锚点可见', Boolean(sourceBox && targetBox))

if (sourceBox && targetBox) {
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  await page.waitForTimeout(500)
}
const afterEdges = await page.locator('.flow-edge').count()
check('从锚点拖拽创建连线', afterEdges === beforeEdges + 1, `${beforeEdges} → ${afterEdges}`)

// 3. 选中新节点，改一个参数。
await page.click(`[data-node-id="${newNodeId}"]`)
await page.waitForTimeout(300)
const promptSelector = '#flow-param-prompt'
await page.fill(promptSelector, '把输入改写成一句话：{{start.query}}')
await page.waitForTimeout(800)
const savedPrompt = await page.inputValue(promptSelector)
check('配置面板可编辑参数', savedPrompt === '把输入改写成一句话：{{start.query}}', savedPrompt)

// 4. 试运行并等待成功记录。
await page.click('.flow-toolbar__button:has-text("试运行")')
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll('.flow-run-panel__state')).some((element) =>
      (element.textContent ?? '').includes('成功'),
    ),
  { timeout: 15000 },
)
const runPanelText = (await page.locator('.flow-run-panel').textContent()) ?? ''
check('试运行可完成', runPanelText.includes('成功'))

// 5. 页面资源全部从 Pages 子路径加载。
check('没有资源加载失败', failedRequests.length === 0, failedRequests.slice(0, 3).join(', '))
check(
  '资源使用 /FlowSail/ 子路径',
  (await page.locator('script[src]').first().getAttribute('src'))?.startsWith('/FlowSail/') ?? false,
  (await page.locator('script[src]').first().getAttribute('src')) ?? '',
)

await browser.close()

const failed = checks.filter((item) => !item.ok)
if (failed.length > 0) {
  console.error(`\n${failed.length} 项失败`)
  process.exit(1)
}
console.log(`\nPASS 在线示例主链路（${checks.length} 项）`)
