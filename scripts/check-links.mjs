// R7-5：文档链接 / 锚点检查，进 CI。
// 检查仓库内 Markdown 的相对链接（文件是否存在）与本地锚点（标题 slug 是否匹配）。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.changeset',
  'screenshots',
])

function walk(dir) {
  const entries = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      entries.push(...walk(fullPath))
    } else if (entry.name.endsWith('.md')) {
      entries.push(fullPath)
    }
  }
  return entries
}

// GitHub 标题 slug：小写、去标点（保留字母 / 数字 / 空格 / 连字符 / 下划线）、空格逐个换连字符。
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function headingSlugs(markdown) {
  const slugs = new Set()
  const seen = new Map()
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!match) continue
    const base = slugify(match[2].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    slugs.add(count === 0 ? base : `${base}-${count}`)
  }
  return slugs
}

function stripFencedCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

const linkPattern = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const problems = []
const files = walk(root)

for (const file of files) {
  const markdown = stripFencedCode(readFileSync(file, 'utf8'))
  const dir = dirname(file)
  for (const match of markdown.matchAll(linkPattern)) {
    let target = match[3]
    if (!target || target.startsWith('http:') || target.startsWith('https:') || target.startsWith('mailto:')) {
      continue
    }
    target = target.replace(/^<|>$/g, '')
    const [rawPath, rawHash] = target.split('#')
    const hash = rawHash ? decodeURIComponent(rawHash) : undefined
    const path = rawPath ? decodeURIComponent(rawPath) : ''
    const resolved = path ? resolve(dir, path) : file
    const label = relative(root, file)

    if (!existsSync(resolved)) {
      problems.push(`${label}: 链接目标不存在 → ${target}`)
      continue
    }

    if (hash) {
      const isDirectory = statSync(resolved).isDirectory()
      const targetFile = isDirectory ? join(resolved, 'README.md') : resolved
      if (targetFile.endsWith('.md') && existsSync(targetFile)) {
        const slugs = headingSlugs(stripFencedCode(readFileSync(targetFile, 'utf8')))
        if (!slugs.has(hash)) {
          problems.push(`${label}: 锚点不存在 → ${target}`)
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`文档检查失败（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`PASS 文档链接 / 锚点检查：${files.length} 个 Markdown 文件`)
