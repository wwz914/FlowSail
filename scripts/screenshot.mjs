// 截图脚本：同一视口、同一场景下抓取示例应用的 Before / After 证据。
//
// 用法（需先 `pnpm dev` 启动示例应用）：
//   npm i -D playwright        # 首次需要
//   node scripts/screenshot.mjs <输出文件> [url]
//
// 场景固定为「选中条件节点」，让右侧配置面板展开，用于对比参数表单。
// 用系统已安装的 Chrome，无需另外下载 Playwright 自带的浏览器。
import { chromium } from 'playwright'

const output = process.argv[2] ?? 'screenshot.png'
const url = process.argv[3] ?? 'http://localhost:5173'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const condition = await page.$('[data-node-id="condition"]')
if (condition) {
  await condition.click()
  await page.waitForTimeout(400)
}

await page.screenshot({ path: output, fullPage: false })
await browser.close()
console.log(`saved ${output}`)
