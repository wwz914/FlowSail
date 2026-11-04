// R7-5：发布前体积门禁。
// 统计 @flowsail/react 的 ESM 产物（JS + CSS）gzip 后大小，上限见 PRD §9（60KB）。
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const LIMIT = 60 * 1024

const artifacts = [
  { label: '@flowsail/core dist/index.js', path: 'packages/system/dist/index.js' },
  { label: '@flowsail/react dist/index.js', path: 'packages/react/dist/index.js' },
  { label: '@flowsail/react dist/style.css', path: 'packages/react/dist/style.css' },
]

let missing = false
const rows = []
for (const artifact of artifacts) {
  const fullPath = `${root}/${artifact.path}`
  if (!existsSync(fullPath)) {
    console.error(`缺少构建产物：${artifact.path}（先运行 pnpm build:libs）`)
    missing = true
    continue
  }
  const bytes = gzipSync(readFileSync(fullPath), { level: 9 }).byteLength
  rows.push({ ...artifact, bytes })
}
if (missing) process.exit(1)

const reactBytes = rows
  .filter((row) => row.label.startsWith('@flowsail/react'))
  .reduce((sum, row) => sum + row.bytes, 0)
const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0)

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`
const pad = (text, width) => String(text).padEnd(width)

console.log('发布产物 gzip 体积（R7-5）')
console.log('-'.repeat(58))
for (const row of rows) {
  console.log(`  ${pad(row.label, 36)} ${kb(row.bytes).padStart(10)}`)
}
console.log('-'.repeat(58))
console.log(`  ${pad('@flowsail/react 合计（预算 60KB）', 36)} ${kb(reactBytes).padStart(10)}`)
console.log(`  ${pad('全部产物合计', 36)} ${kb(totalBytes).padStart(10)}`)

if (reactBytes >= LIMIT) {
  console.error(`\nFAIL @flowsail/react gzip ${kb(reactBytes)} 超过 60KB 预算`)
  process.exit(1)
}
console.log(`\nPASS @flowsail/react gzip ${kb(reactBytes)} < 60KB`)
