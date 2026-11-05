import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildReleaseNotes,
  extractVersionSection,
  listVersions,
  parseChangeGroups,
} from './release-github.mjs'

const coreChangelog = readFileSync(join(process.cwd(), 'packages/system/CHANGELOG.md'), 'utf8')
const reactChangelog = readFileSync(join(process.cwd(), 'packages/react/CHANGELOG.md'), 'utf8')

function sections(version) {
  return [
    { name: '@flowsail/core', section: extractVersionSection(coreChangelog, version) },
    { name: '@flowsail/react', section: extractVersionSection(reactChangelog, version) },
  ]
}

describe('release-github', () => {
  it('从 CHANGELOG 截取指定版本，不包含旧版本', () => {
    const section = extractVersionSection(coreChangelog, '0.2.0')
    expect(section).toContain('v1.8：主题与可访问性')
    expect(section).not.toContain('补充 npm 包页面 README')

    expect(extractVersionSection(coreChangelog, '9.9.9')).toBeNull()
    expect(listVersions(coreChangelog)).toEqual(['0.2.0', '0.1.1', '0.1.0'])
  })

  it('按 changeset 分组解析条目', () => {
    const groups = parseChangeGroups(extractVersionSection(reactChangelog, '0.2.0'))
    expect(groups.map((group) => group.title)).toEqual(['Minor Changes', 'Patch Changes'])
    expect(groups[0].blocks).toHaveLength(1)
    expect(groups[1].blocks[0]).toContain('Updated dependencies')
  })

  it('合并两个包时去重相同条目并跳过依赖联动', () => {
    const notes = buildReleaseNotes({
      version: '0.2.0',
      packages: sections('0.2.0'),
      repository: 'wwz914/FlowSail',
      previousVersion: '0.1.1',
    })

    expect(notes).toContain('`@flowsail/core@0.2.0` · `@flowsail/react@0.2.0`')
    expect(notes).toContain('### 新功能与改进')
    expect(notes).toContain('新增 `--flow-*` 主题变量')
    expect(notes.match(/v1\.8：主题与可访问性/g)).toHaveLength(1)
    expect(notes).not.toContain('Updated dependencies')
    expect(notes).toContain('pnpm add @flowsail/react@0.2.0')
    expect(notes).toContain('compare/v0.1.1...v0.2.0')
  })

  it('首个版本不输出对比链接', () => {
    const notes = buildReleaseNotes({
      version: '0.1.0',
      packages: sections('0.1.0'),
      repository: 'wwz914/FlowSail',
      previousVersion: undefined,
    })

    expect(notes).toContain('首个公开版本 0.1.0')
    expect(notes).not.toContain('/compare/')
  })
})
