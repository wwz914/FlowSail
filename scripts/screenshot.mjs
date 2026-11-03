// 截图脚本：同一视口、同一场景下抓取示例应用的 Before / After 证据。
//
// 用法（需先 `pnpm dev` 启动示例应用）：
//   npm i -D playwright        # 首次需要
//   node scripts/screenshot.mjs <输出文件> [url] [场景]
//
// 场景：
//   condition（默认）选中条件节点，用于对比参数表单；
//   reference   选中大模型节点并展开变量选择器，用于对比变量引用能力；
//   invalid     把 Prompt 改成失效引用，用于对比标红与文档级校验。
// 用系统已安装的 Chrome，无需另外下载 Playwright 自带的浏览器。
import { chromium } from 'playwright'

const output = process.argv[2] ?? 'screenshot.png'
const url = process.argv[3] ?? 'http://localhost:5173'
const scenario = process.argv[4] ?? 'condition'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

if (scenario === 'reference') {
  const llm = await page.$('[data-node-id="llm"]')
  if (llm) {
    await llm.click()
    await page.waitForTimeout(400)
  }

  // 展开变量选择器，露出上游节点暴露的字段。
  const toggle = await page.$('.flow-variable-picker__toggle')
  if (toggle) {
    await toggle.click()
    await page.waitForTimeout(400)
  }
}

if (scenario === 'invalid') {
  const llm = await page.$('[data-node-id="llm"]')
  if (llm) {
    await llm.click()
    await page.waitForTimeout(400)
  }

  const prompt = await page.$('#flow-param-prompt')
  if (prompt) {
    await prompt.fill('你好 {{start.missing}}')
    // 失焦，让连续输入的合并窗口结束、校验刷新。
    await page.evaluate(() => {
      const input = document.querySelector('#flow-param-prompt')
      input?.blur()
    })
    await page.waitForTimeout(800)
  }
}

if (scenario === 'condition') {
  const condition = await page.$('[data-node-id="condition"]')
  if (condition) {
    await condition.click()
    await page.waitForTimeout(400)
  }
}

await page.screenshot({ path: output, fullPage: false })
await browser.close()
console.log(`saved ${output}`)
