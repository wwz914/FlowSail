#!/usr/bin/env node
// 每个版本在 GitHub 创建一条 Release，正文取自两个 npm 包 CHANGELOG 的本版本条目。
// Release 使用独立的 `vX.Y.Z` tag（changesets 生成的包 tag 仍然保留），这样 Releases
// 页面上每个版本只有一条记录，点进去就能看到这一版的更新内容。
//
// 用法：
//   node scripts/release-github.mjs --dry-run          # 只打印正文，不访问 GitHub
//   node scripts/release-github.mjs                    # 读取 package.json 当前版本并创建 / 更新
//   node scripts/release-github.mjs --version 0.1.1    # 补发历史版本（tag 已存在时只更新正文）
//   node scripts/release-github.mjs --version 0.1.0 --target <commit>
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Vitest 会把 import.meta.url 改写成非 file URL；退回到工作目录（仓库根）。
function repositoryRoot() {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..')
  } catch {
    return process.cwd()
  }
}

const ROOT = repositoryRoot()
const EXAMPLE_URL = 'https://wwz914.github.io/FlowSail/'
const PACKAGES = [
  { name: '@flowsail/core', dir: 'packages/system' },
  { name: '@flowsail/react', dir: 'packages/react' },
]
const GROUP_TITLES = {
  'Minor Changes': '新功能与改进',
  'Patch Changes': '修复与杂项',
}

/** 截取 CHANGELOG 中某个版本标题（`## x.y.z`）下的正文。 */
export function extractVersionSection(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${version}`)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i
      break
    }
  }
  const section = lines.slice(start + 1, end)
  while (section.length && section[0].trim() === '') section.shift()
  while (section.length && section[section.length - 1].trim() === '') section.pop()
  return section.join('\n')
}

/** 列出 CHANGELOG 中出现过的版本号，顺序与文件一致（新版本在前）。 */
export function listVersions(changelog) {
  return [...changelog.matchAll(/^##\s+(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*$/gm)].map((match) => match[1])
}

function parseBlocks(lines) {
  const blocks = []
  let block = null
  const flush = () => {
    if (!block) return
    while (block.length && block[block.length - 1].trim() === '') block.pop()
    if (block.length) blocks.push(block.join('\n'))
    block = null
  }
  for (const line of lines) {
    if (line.startsWith('- ')) {
      flush()
      block = [line]
    } else if (block) {
      block.push(line)
    }
  }
  flush()
  return blocks
}

/** 把版本段落拆成 `### Minor Changes` / `### Patch Changes` 等分组及条目块。 */
export function parseChangeGroups(section) {
  const groups = []
  let current = null
  for (const line of section.split(/\r?\n/)) {
    const heading = /^###\s+(.+)$/.exec(line)
    if (heading) {
      current = { title: heading[1].trim(), lines: [] }
      groups.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }
  return groups
    .map((group) => ({ title: group.title, blocks: parseBlocks(group.lines) }))
    .filter((group) => group.blocks.length > 0)
}

function mergeChanges(packages) {
  const order = []
  const merged = new Map()
  for (const pkg of packages) {
    for (const group of parseChangeGroups(pkg.section)) {
      let entry = merged.get(group.title)
      if (!entry) {
        entry = { title: GROUP_TITLES[group.title] ?? group.title, blocks: [], seen: new Set() }
        merged.set(group.title, entry)
        order.push(group.title)
      }
      for (const block of group.blocks) {
        // changesets 自动生成的依赖联动条目对使用者没有信息量，跳过。
        if (/^- Updated dependencies\b/.test(block)) continue
        const key = block.replace(/[ \t]+$/gm, '').trim()
        if (!key || entry.seen.has(key)) continue
        entry.seen.add(key)
        entry.blocks.push(block.trimEnd())
      }
    }
  }
  return order.map((title) => merged.get(title)).filter((group) => group.blocks.length > 0)
}

/** 生成一条 GitHub Release 的 Markdown 正文。 */
export function buildReleaseNotes({ version, packages, repository, previousVersion, exampleUrl = EXAMPLE_URL }) {
  const names = packages.map((pkg) => pkg.name)
  const lines = [
    `两个 npm 包同步发布：${names.map((name) => `\`${name}@${version}\``).join(' · ')}。`,
    '',
  ]

  const groups = mergeChanges(packages)
  if (groups.length > 0) {
    lines.push('## 变更', '')
    for (const group of groups) {
      lines.push(`### ${group.title}`, '')
      for (const block of group.blocks) {
        lines.push(block, '')
      }
    }
  }

  lines.push('## 安装与体验', '')
  lines.push('```sh')
  lines.push(`pnpm add @flowsail/react@${version}`)
  lines.push('```', '')
  lines.push('- `@flowsail/core` 会作为依赖一并安装；两个包版本保持一致。')
  lines.push(`- 在线示例：${exampleUrl}`)
  for (const name of names) {
    lines.push(`- [\`${name}@${version}\`](https://www.npmjs.com/package/${name}/v/${version})`)
  }
  if (previousVersion) {
    lines.push(`- 完整变更：https://github.com/${repository}/compare/v${previousVersion}...v${version}`)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function parseArgs(argv) {
  const args = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--version') args.version = argv[++i]
    else if (arg === '--target') args.target = argv[++i]
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return args
}

function readPackage(pkg) {
  const pkgDir = join(ROOT, pkg.dir)
  return {
    ...pkg,
    version: JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version,
    changelog: readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8'),
  }
}

function detectRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote)
  if (!match) throw new Error(`无法从 origin 解析 GitHub 仓库：${remote}`)
  return `${match[1]}/${match[2]}`
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

function gh(args) {
  const result = run('gh', args)
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} 失败：${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout.trim()
}

function releaseUrl(repo, tag) {
  const result = run('gh', ['api', `repos/${repo}/releases/tags/${tag}`, '--jq', '.html_url'])
  if (result.status === 0) return result.stdout.trim()
  if (/404|Not Found/i.test(result.stderr)) return null
  throw new Error(`查询 Release ${tag} 失败：${result.stderr.trim() || result.stdout.trim()}`)
}

function tagExistsOnRemote(tag) {
  const result = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
  if (result.status !== 0) {
    throw new Error(`查询远端 tag ${tag} 失败：${result.stderr.trim()}`)
  }
  return result.stdout.trim().length > 0
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('用法：node scripts/release-github.mjs [--version x.y.z] [--target <ref>] [--dry-run]')
    return
  }

  const packages = PACKAGES.map(readPackage)
  const versions = new Set(packages.map((pkg) => pkg.version))
  if (!args.version && versions.size !== 1) {
    throw new Error(
      `两个包版本不一致（${packages.map((pkg) => `${pkg.name}@${pkg.version}`).join('、')}）；` +
        '发布前先让 changeset 同时 bump 两个包。',
    )
  }
  const version = args.version ?? packages[0].version

  const sections = packages.map((pkg) => {
    const section = extractVersionSection(pkg.changelog, version)
    if (!section) {
      throw new Error(
        `${pkg.name} 的 CHANGELOG.md 缺少 ${version} 段落；先执行 pnpm changeset version 再发布。`,
      )
    }
    return { name: pkg.name, section }
  })

  const allVersions = listVersions(packages[0].changelog)
  const index = allVersions.indexOf(version)
  const previousVersion = index >= 0 ? allVersions[index + 1] : undefined
  const notes = buildReleaseNotes({
    version,
    packages: sections,
    repository: detectRepository(),
    previousVersion,
  })

  const tag = `v${version}`
  if (args.dryRun) {
    console.log(`[dry-run] GitHub Release ${tag}（target: ${args.target ?? '当前 HEAD'}）\n`)
    console.log(notes)
    return
  }

  const repo = detectRepository()
  const existing = releaseUrl(repo, tag)
  const dir = mkdtempSync(join(tmpdir(), 'flowsail-release-'))
  const notesFile = join(dir, 'notes.md')
  try {
    writeFileSync(notesFile, notes, 'utf8')
    if (existing) {
      gh(['release', 'edit', tag, '--title', tag, '--notes-file', notesFile])
      console.log(`GitHub Release 已更新：${existing}`)
      return
    }
    const createArgs = ['release', 'create', tag, '--title', tag, '--notes-file', notesFile]
    if (!tagExistsOnRemote(tag)) {
      // GitHub 只接受完整 commit SHA 作为 target_commitish；短 SHA / branch 名会被拒。
      const target = args.target ?? 'HEAD'
      const sha = execFileSync('git', ['rev-parse', '--verify', `${target}^{commit}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim()
      createArgs.push('--target', sha)
    }
    gh(createArgs)
    console.log(`GitHub Release 已创建：${releaseUrl(repo, tag) ?? tag}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function isMainModule() {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isMainModule()) {
  try {
    main()
  } catch (error) {
    console.error(`创建 GitHub Release 失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
