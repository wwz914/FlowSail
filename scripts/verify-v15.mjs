// v1.5 完成定义（DoD）的端到端验证脚本（ROADMAP §10.5）：
//   点击「试运行」→ 开始节点进入 running
//   → 大模型节点拿到开始节点的实际输出（{{start.query}} 被替换成运行期真实值）
//   → 条件节点按判断结果走「是 / 否」分支，未走到的分支节点标记为 skipped
//   → 全部结束后节点分别呈现 success
//   → 运行记录面板逐节点列出状态与耗时
//   → 故意把大模型节点的参数改坏后重跑，失败节点在画布上标红、在记录面板里给出可读错误
//   → 点击记录行可定位到该节点
//   → 修好参数重跑成功
//
// 用法：node scripts/verify-v15.mjs [url]
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.flow-node', { timeout: 10000 })
await page.waitForTimeout(600)

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 节点的运行态 class。
async function runState(nodeId) {
  return page.getAttribute(`[data-node-id="${nodeId}"]`, 'class')
}

async function hasRunState(nodeId, state) {
  const className = (await runState(nodeId)) ?? ''
  return className.includes(`is-run-${state}`)
}

// 1. 试运行前，节点没有运行态。
check('运行前节点无运行态', !(await hasRunState('start', 'idle')))

// 2. 点击「试运行」。
await page.click('.flow-toolbar__button:has-text("试运行")')

// 运行期间按钮切换为「取消运行」。
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll('.flow-toolbar__button')).some((button) =>
      (button.textContent ?? '').includes('取消运行'),
    ),
  { timeout: 10000 },
)
check('运行中工具栏出现「取消运行」', true)

// 运行期间节点依次进入 running：观察到任意一个节点处于运行中即可。
const sawRunning = await page
  .waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.flow-node')).some((node) =>
        node.className.includes('is-run-running'),
      ),
    { timeout: 10000 },
  )
  .then(() => true)
  .catch(() => false)
check('运行中节点进入 running', sawRunning)

await page.waitForFunction(
  () => {
    const summary = document.querySelector('.flow-run-panel__summary')
    return summary !== null && /成功|失败|取消/.test(summary.textContent ?? '')
  },
  { timeout: 15000 },
)
await page.waitForTimeout(400)

// 3. 全部结束后节点呈现 success。
check('开始节点成功', await hasRunState('start', 'success'))
check('大模型节点成功', await hasRunState('llm', 'success'))
check('条件节点成功', await hasRunState('condition', 'success'))

// 4. 运行态与运行记录一致：记录里也是 success。
const recordStates = await page.locator('.flow-run-panel__state').allTextContents()
const successCount = recordStates.filter((state) => state.trim() === '成功').length
const skippedCount = recordStates.filter((state) => state.trim() === '跳过').length
// 演示流程有 5 个节点：开始 / 大模型 / 条件 / 结束 四个执行成功，
// 未走到的「是」分支节点被跳过。
check('运行记录列出全部节点', recordStates.length === 5, recordStates.join(','))
check('执行到的节点都是成功', successCount === 4, `成功 ${successCount} 个`)
check('未走到的分支节点被跳过', skippedCount === 1, `跳过 ${skippedCount} 个`)
check(
  '运行记录的状态与画布一致',
  recordStates.every((state) => ['成功', '跳过'].includes(state.trim())),
  recordStates.join(','),
)

// 5. 运行记录显示耗时。
const durations = await page.locator('.flow-run-panel__duration').allTextContents()
check('运行记录显示耗时', durations.length >= 3 && durations.every((d) => /ms$/.test(d.trim())), durations.join(','))

// 6. 运行期变量替换：`{{start.query}}` 被替换成真实值，而不是字面量。
const llmRecord = page.locator('.flow-run-panel__record', { hasText: 'LLM' }).first()
const llmOutput = await llmRecord.textContent()
check('大模型输出不含变量字面量', !(llmOutput ?? '').includes('{{start.query}}'), (llmOutput ?? '').slice(0, 80))

// 7. 条件分支：未走到的分支标记为 skipped。
// 演示流程里条件表达式是 `summary.length > 40`，Mock 摘要较短，因此走「否」分支。
const skipped = await page.locator('.flow-run-panel__state:has-text("跳过")').count()
check('未走到的分支节点标记为跳过', skipped >= 1, `跳过节点数：${skipped}`)
check('跳过的节点在画布上也是 skipped', await hasRunState('llm-yes', 'skipped'))

// 8. 故意改坏大模型节点的参数 → 重跑 → 失败节点标红 + 记录面板给出可读错误。
await page.click('[data-node-id="llm"]')
await page.waitForTimeout(300)
await page.fill('#flow-param-prompt', '摘要：{{start.missing}}')
await page.evaluate(() => document.querySelector('#flow-param-prompt')?.blur())
await page.waitForTimeout(900)

await page.click('.flow-toolbar__button:has-text("试运行")')
await page.waitForFunction(
  () => {
    const summary = document.querySelector('.flow-run-panel__summary')
    return summary !== null && /失败|成功|取消/.test(summary.textContent ?? '')
  },
  { timeout: 15000 },
)
await page.waitForTimeout(400)

check('失败节点在画布上标红', await hasRunState('llm', 'error'))
const panelText = (await page.locator('.flow-run-panel').textContent()) ?? ''
check('记录面板给出可读错误', panelText.includes('missing'), panelText.slice(0, 120))

// 失败会往下游传递：下游节点标记为跳过，而不是跟着失败。
check('失败节点的下游标记为跳过', await hasRunState('condition', 'skipped'))
const failedStates = await page.locator('.flow-run-panel__state:has-text("失败")').count()
check('只有一个节点失败', failedStates === 1, `失败节点数：${failedStates}`)

// 9. 点击记录行定位到失败节点。
await page.locator('.flow-run-panel__row', { hasText: 'LLM' }).first().click()
await page.waitForTimeout(300)
const selectedId = await page.getAttribute('.flow-node.is-selected', 'data-node-id')
check('点击记录行定位到失败节点', selectedId === 'llm', `选中：${selectedId}`)

// 10. 修好参数重跑成功。
await page.fill('#flow-param-prompt', '摘要：{{start.query}}')
await page.evaluate(() => document.querySelector('#flow-param-prompt')?.blur())
await page.waitForTimeout(900)

await page.click('.flow-toolbar__button:has-text("试运行")')
await page.waitForFunction(
  () => {
    const summary = document.querySelector('.flow-run-panel__summary')
    return summary !== null && /成功/.test(summary.textContent ?? '')
  },
  { timeout: 15000 },
)
await page.waitForTimeout(400)
check('修好参数后重跑成功', await hasRunState('llm', 'success'))

const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)

await browser.close()
if (failed.length > 0) process.exit(1)
