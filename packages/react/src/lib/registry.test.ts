import { describe, expect, it } from 'vitest'
import {
  createRegistry,
  listNodeTypes,
  mergeRegistries,
  registryFrom,
  resolveNodeType,
} from './registry.ts'
import { BUILTIN_NODE_TYPE_DEFINITIONS } from './builtinTypes.tsx'
import { BUILTIN_REGISTRY } from './registryContext.tsx'

describe('节点类型注册表（R3-1、R3-2）', () => {
  it('内置注册表包含 6 类节点', () => {
    const types = listNodeTypes(BUILTIN_REGISTRY).map((definition) => definition.type)
    expect(types).toEqual(['start', 'end', 'llm', 'plugin', 'condition', 'code'])
  })

  it('每类内置节点都有图标、默认数据与参数 schema', () => {
    for (const definition of BUILTIN_NODE_TYPE_DEFINITIONS) {
      expect(definition.icon).toBeTruthy()
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.defaultData).toBeDefined()
      expect(Array.isArray(definition.params)).toBe(true)
    }
  })

  it('查找注册类型返回完整定义', () => {
    const condition = resolveNodeType(BUILTIN_REGISTRY, 'condition')
    expect(condition.label).toBe('条件')
    expect(condition.outputs?.map((handle) => handle.id)).toEqual(['true', 'false'])
    expect(condition.outputs?.map((handle) => handle.label)).toEqual(['是', '否'])
  })

  it('未注册类型回落为通用定义且不报错', () => {
    const fallback = resolveNodeType(BUILTIN_REGISTRY, 'unknown-type')
    expect(fallback.type).toBe('unknown-type')
    expect(fallback.label).toBe('unknown-type')
    expect(fallback.color).toBeTruthy()
  })

  it('宿主自定义类型可以覆盖同名内置类型', () => {
    const custom = registryFrom([
      { type: 'llm', label: '我的模型', color: '#000000' },
    ])
    const merged = mergeRegistries(BUILTIN_REGISTRY, custom)
    expect(resolveNodeType(merged, 'llm').label).toBe('我的模型')
    // 其他内置类型不受影响
    expect(resolveNodeType(merged, 'code').label).toBe('代码')
  })

  it('空注册表查找任何类型都回落', () => {
    const empty = createRegistry()
    expect(resolveNodeType(empty, 'llm').label).toBe('llm')
    expect(listNodeTypes(empty)).toHaveLength(0)
  })

  it('新增一种节点类型只需一个定义文件，不改内核', () => {
    const custom = registryFrom([
      {
        type: 'notify',
        label: '通知',
        color: '#123456',
        icon: null,
        defaultData: { label: 'Notify' },
        inputs: [{ id: 'in', offset: 0.5 }],
        outputs: [{ id: 'out', offset: 0.5 }],
        params: [{ key: 'channel', label: '渠道', type: 'string' }],
      },
    ])
    const merged = mergeRegistries(BUILTIN_REGISTRY, custom)
    const notify = resolveNodeType(merged, 'notify')
    expect(notify.params?.[0]?.key).toBe('channel')
    expect(notify.outputs?.[0]?.id).toBe('out')
  })
})
