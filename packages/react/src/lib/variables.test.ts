import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@system'
import { BUILTIN_REGISTRY } from './registryContext.tsx'
import {
  checkReferences,
  findOutputField,
  getUpstreamNodeIds,
  groupVariablesByNode,
  hasReference,
  insertReference,
  isTypeCompatible,
  listAvailableVariables,
  parseReferences,
} from './variables.ts'

const startNode: Node = {
  id: 'start',
  type: 'start',
  position: { x: 0, y: 0 },
  data: { label: 'Start' },
}

const llmNode: Node = {
  id: 'llm',
  type: 'llm',
  position: { x: 0, y: 100 },
  data: { label: 'LLM' },
}

const llmDownstream: Node = {
  id: 'llm2',
  type: 'llm',
  position: { x: 0, y: 200 },
  data: { label: 'LLM 2' },
}

const edges: Edge[] = [
  { id: 'e1', source: 'start', target: 'llm' },
  { id: 'e2', source: 'llm', target: 'llm2' },
]

describe('引用解析（R4-5、FR-P3）', () => {
  it('解析出文本里的全部引用', () => {
    const references = parseReferences('前缀 {{start.query}} 后缀 {{llm.text}}')

    expect(references).toHaveLength(2)
    expect(references[0]).toMatchObject({ nodeId: 'start', field: 'query' })
    expect(references[1]).toMatchObject({ nodeId: 'llm', field: 'text' })
  })

  it('没有 `{{` 时不返回引用', () => {
    expect(parseReferences('普通文本')).toEqual([])
    expect(parseReferences('')).toEqual([])
  })

  it('hasReference 判断文本里是否有引用', () => {
    expect(hasReference('{{start.query}}')).toBe(true)
    expect(hasReference('普通文本')).toBe(false)
    expect(hasReference(42)).toBe(false)
  })

  it('insertReference 追加引用字面量', () => {
    expect(insertReference('你好', '{{start.query}}')).toBe('你好 {{start.query}}')
    expect(insertReference('', '{{start.query}}')).toBe('{{start.query}}')
  })

  it('insertReference 不重复插入同一个引用', () => {
    const text = '你好 {{start.query}}'
    expect(insertReference(text, '{{start.query}}')).toBe(text)
  })
})

describe('拓扑上游（R4-5、R4-6）', () => {
  it('沿连线方向回溯出上游节点', () => {
    const upstream = getUpstreamNodeIds('llm2', edges)

    expect(upstream.has('llm')).toBe(true)
    expect(upstream.has('start')).toBe(true)
    expect(upstream.has('llm2')).toBe(false)
  })

  it('没有上游时返回空集合', () => {
    expect(getUpstreamNodeIds('start', edges).size).toBe(0)
  })

  it('成环时不会死循环', () => {
    const cyclic: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
    ]

    const upstream = getUpstreamNodeIds('a', cyclic)
    expect(upstream.has('b')).toBe(true)
  })
})

describe('作用域查找（R4-4）', () => {
  it('找到节点类型声明的输出字段', () => {
    expect(findOutputField(BUILTIN_REGISTRY, startNode, 'query')?.type).toBe('string')
    expect(findOutputField(BUILTIN_REGISTRY, llmNode, 'text')?.type).toBe('string')
  })

  it('未声明的字段查不到', () => {
    expect(findOutputField(BUILTIN_REGISTRY, startNode, 'missing')).toBeUndefined()
  })
})

describe('引用校验（R4-5、FR-P3）', () => {
  const options = {
    nodeId: 'llm2',
    nodes: [startNode, llmNode, llmDownstream],
    edges,
    registry: BUILTIN_REGISTRY,
  }

  it('合法引用通过', () => {
    const checks = checkReferences('{{llm.text}}', options)

    expect(checks).toHaveLength(1)
    expect(checks[0]?.ok).toBe(true)
  })

  it('引用目标节点不存在时报错', () => {
    const checks = checkReferences('{{ghost.text}}', options)

    expect(checks[0]?.ok).toBe(false)
    expect(checks[0]?.code).toBe('unknown-node')
    expect(checks[0]?.message).toContain('不存在')
  })

  it('字段不存在时报错', () => {
    const checks = checkReferences('{{llm.missing}}', options)

    expect(checks[0]?.ok).toBe(false)
    expect(checks[0]?.code).toBe('unknown-field')
  })

  it('目标不是拓扑上游时报错', () => {
    const checks = checkReferences('{{llm2.text}}', options)

    expect(checks[0]?.ok).toBe(false)
    expect(checks[0]?.code).toBe('not-upstream')
  })

  it('类型不匹配时报错', () => {
    const checks = checkReferences(
      '{{start.query}}',
      {
        ...options,
        schema: { key: 'temperature', label: '温度', type: 'number' },
      },
    )

    expect(checks[0]?.ok).toBe(false)
    expect(checks[0]?.code).toBe('type-mismatch')
  })

  it('any 类型的字段与任何参数类型都兼容', () => {
    const plugin: Node = { id: 'plugin', type: 'plugin', position: { x: 0, y: 0 } }
    const checks = checkReferences('{{plugin.result}}', {
      nodeId: 'llm2',
      nodes: [plugin, llmDownstream],
      edges: [{ id: 'e1', source: 'plugin', target: 'llm2' }],
      registry: BUILTIN_REGISTRY,
      schema: { key: 'temperature', label: '温度', type: 'number' },
    })

    expect(checks[0]?.ok).toBe(true)
  })

  it('isTypeCompatible 判断字段与参数类型的兼容性', () => {
    expect(isTypeCompatible('string', 'string')).toBe(true)
    expect(isTypeCompatible('number', 'string')).toBe(false)
    expect(isTypeCompatible('object', 'json')).toBe(true)
    expect(isTypeCompatible('object', 'string')).toBe(false)
    expect(isTypeCompatible('any', 'number')).toBe(true)
  })
})

describe('变量列表（R4-6、FR-P3）', () => {
  it('只列拓扑上游节点的输出字段', () => {
    const options = listAvailableVariables({
      nodeId: 'llm2',
      nodes: [startNode, llmNode, llmDownstream],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    const nodeIds = new Set(options.map((option) => option.nodeId))
    expect(nodeIds.has('start')).toBe(true)
    expect(nodeIds.has('llm')).toBe(true)
    expect(nodeIds.has('llm2')).toBe(false)
  })

  it('引用字面量是 `{{nodeId.field}}` 形式', () => {
    const options = listAvailableVariables({
      nodeId: 'llm',
      nodes: [startNode, llmNode],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    expect(options[0]?.reference).toBe('{{start.query}}')
    expect(options[0]?.type).toBe('string')
    expect(options[0]?.nodeLabel).toBe('Start')
  })

  it('按节点分组后每组字段在一个节点下', () => {
    const options = listAvailableVariables({
      nodeId: 'llm2',
      nodes: [startNode, llmNode, llmDownstream],
      edges,
      registry: BUILTIN_REGISTRY,
    })
    const groups = groupVariablesByNode(options)

    expect(groups.map((group) => group.nodeId)).toEqual(['start', 'llm'])
    expect(groups[0]?.fields.map((field) => field.field)).toEqual(['query', 'variables'])
  })

  it('没有上游节点时列表为空', () => {
    const options = listAvailableVariables({
      nodeId: 'start',
      nodes: [startNode],
      edges: [],
      registry: BUILTIN_REGISTRY,
    })

    expect(options).toEqual([])
  })
})
