// v1.4 完成定义（DoD）的端到端验证脚本（ROADMAP §9.5）：
//   在大模型节点的 Prompt 里用变量选择器插入开始节点的 {{start.query}}
//   → 面板显示引用合法、选择器只列上游字段
//   → 故意改成一个不存在的字段，面板标红且文档级校验报出"引用失效"
//   → 导出 JSON → 清空画布 → 导入该 JSON，画布与参数完全还原（且能撤销一次）
//
// 用法：node scripts/verify-v14.mjs [url]
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

// 1. 变量选择器只列上游字段。
await page.click('[data-node-id="llm"]')
await page.waitForTimeout(300)
await page.click('.flow-variable-picker__toggle')
await page.waitForTimeout(300)

const pickerFields = await page.locator('.flow-variable-picker__item-name').allTextContents()
check('选择器列出上游字段', pickerFields.includes('query'), pickerFields.join(', '))
check(
  '选择器不列非上游节点字段',
  !pickerFields.includes('text'),
  `列出：${pickerFields.join(', ')}`,
)

// 2. 插入引用。
await page.click('.flow-variable-picker__item:has-text("query")')
await page.waitForTimeout(400)
const promptValue = await page.inputValue('#flow-param-prompt')
check('引用插入参数值', promptValue.includes('{{start.query}}'), promptValue)

// 3. 引用合法时不报红。
const referenceError = await page.locator('.flow-config-panel__error').count()
check('合法引用不标红', referenceError === 0, `错误条数：${referenceError}`)

// 4. 改成不存在的字段 → 标红 + 校验报"引用失效"。
await page.fill('#flow-param-prompt', '你好 {{start.missing}}')
await page.evaluate(() => document.querySelector('#flow-param-prompt')?.blur())
await page.waitForTimeout(900)

const errorText = await page.locator('.flow-config-panel__error').first().textContent()
check('失效引用在面板标红', Boolean(errorText?.includes('missing')), errorText ?? '')

const validationText = await page.locator('.flow-validation-panel').textContent()
check('文档级校验报出引用失效', Boolean(validationText?.includes('引用失效')), validationText ?? '')

// 5. 导出 JSON。
const downloadPromise = page.waitForEvent('download')
await page.click('.flow-toolbar__button:has-text("导出")')
const download = await downloadPromise
const stream = await download.createReadStream()
let exported = ''
for await (const chunk of stream) exported += chunk
const exportedDocument = JSON.parse(exported)
check(
  '导出 JSON 带 schema 版本号',
  typeof exportedDocument.version === 'number' && exportedDocument.version >= 1,
  `version=${exportedDocument.version}`,
)
check('导出 JSON 含文档 id 与 name', Boolean(exportedDocument.id && exportedDocument.name))
check(
  '导出 JSON 含节点与连线',
  exportedDocument.nodes.length > 0 && exportedDocument.edges.length > 0,
  `节点 ${exportedDocument.nodes.length}，连线 ${exportedDocument.edges.length}`,
)

// 6. 清空画布：逐个选中并删除，直到画布上没有节点。
await page.click('[data-node-id="llm"]')
await page.waitForTimeout(200)

for (let guard = 0; guard < 20; guard += 1) {
  const remaining = await page.locator('.flow-node').count()
  if (remaining === 0) break
  await page.locator('.flow-node').first().click()
  await page.waitForTimeout(120)
  await page.keyboard.press('Delete')
  await page.waitForTimeout(200)
}

const nodeCountAfterDelete = await page.locator('.flow-node').count()
check('画布已清空', nodeCountAfterDelete === 0, `剩余节点 ${nodeCountAfterDelete}`)

// 7. 导入还原。
await page.setInputFiles('.flow-toolbar__file', {
  name: 'demo.flowsail.json',
  mimeType: 'application/json',
  buffer: Buffer.from(exported, 'utf-8'),
})
await page.waitForTimeout(1200)

const nodeCountAfterImport = await page.locator('.flow-node').count()
check('导入后节点还原', nodeCountAfterImport === exportedDocument.nodes.length, `节点 ${nodeCountAfterImport}`)

// 8. 参数完整还原。
await page.click('[data-node-id="llm"]')
await page.waitForTimeout(300)
const restoredPrompt = await page.inputValue('#flow-param-prompt')
check(
  '导入后参数还原',
  restoredPrompt === '你好 {{start.missing}}',
  restoredPrompt,
)

// 9. 能撤销一次。
await page.click('.flow-toolbar__button:has-text("撤销")')
await page.waitForTimeout(500)
const nodeCountAfterUndo = await page.locator('.flow-node').count()
check('导入后可撤销一次', nodeCountAfterUndo === 0, `撤销后节点 ${nodeCountAfterUndo}`)

await browser.close()

const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
if (failed.length > 0) process.exit(1)
