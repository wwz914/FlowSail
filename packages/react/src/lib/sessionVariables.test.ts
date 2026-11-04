import { describe, expect, it } from 'vitest'
import {
  SYSTEM_VARIABLES,
  buildRunVariables,
  validateSessionVariables,
  type SessionVariable,
} from './sessionVariables.ts'

describe('会话变量（R6-7）', () => {
  it('合法变量没有校验问题', () => {
    expect(
      validateSessionVariables([
        { name: 'query', value: '你好' },
        { name: 'user_id', value: '42' },
      ]),
    ).toEqual([])
  })

  it('空名报错', () => {
    const issues = validateSessionVariables([{ name: '  ', value: 'x' }])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('不能为空')
  })

  it('非法变量名报错', () => {
    expect(validateSessionVariables([{ name: '1abc', value: 'x' }])[0]?.message).toContain('不合法')
    expect(validateSessionVariables([{ name: 'a-b', value: 'x' }])[0]?.message).toContain('不合法')
  })

  it('与系统内置变量冲突时报错', () => {
    const issues = validateSessionVariables([{ name: 'now', value: 'x' }])
    expect(issues[0]?.message).toContain('系统内置变量冲突')
  })

  it('重复变量名报错', () => {
    const issues = validateSessionVariables([
      { name: 'a', value: '1' },
      { name: 'a', value: '2' },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('重复')
  })

  it('buildRunVariables 注入系统变量 now', () => {
    const fixed = new Date('2026-11-04T00:00:00.000Z')
    const variables = buildRunVariables([], fixed)
    expect(variables.now).toBe('2026-11-04T00:00:00.000Z')
  })

  it('buildRunVariables 合并用户变量，且系统变量优先', () => {
    const fixed = new Date('2026-11-04T00:00:00.000Z')
    const user: SessionVariable[] = [
      { name: 'query', value: 'hello' },
      // 试图覆盖系统变量：被忽略。
      { name: 'now', value: 'hacked' },
    ]
    const variables = buildRunVariables(user, fixed)
    expect(variables.query).toBe('hello')
    expect(variables.now).toBe('2026-11-04T00:00:00.000Z')
  })

  it('空白变量名被跳过', () => {
    const variables = buildRunVariables([{ name: '   ', value: 'x' }], new Date(0))
    expect(Object.keys(variables)).toEqual(['now'])
  })

  it('SYSTEM_VARIABLES 至少声明了 now', () => {
    expect(SYSTEM_VARIABLES.now).toBeTruthy()
  })
})
