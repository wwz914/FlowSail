import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@system'
import { BUILTIN_REGISTRY } from './registryContext.tsx'
import {
  findDanglingEdges,
  findMissingRequired,
  findOrphanNodes,
  getNodeIssues,
  getParamIssues,
  validateDocument,
} from './validation.ts'

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
  data: { label: 'LLM', prompt: '你好 {{start.query}}' },
}

const edges: Edge[] = [{ id: 'e1', source: 'start', target: 'llm' }]

describe('孤立节点与悬空连线（R4-7、FR-P6）', () => {
  it('找出没有任何连线相连的节点', () => {
    const orphan: Node = { id: 'lonely', type: 'start', position: { x: 0, y: 300 } }
    const orphans = findOrphanNodes([startNode, llmNode, orphan], edges)

    expect(orphans.map((node) => node.id)).toEqual(['lonely'])
  })

  it('找出指向不存在节点的连线', () => {
    const dangling = findDanglingEdges(
      [startNode],
      [{ id: 'e1', source: 'start', target: 'ghost' }],
    )

    expect(dangling).toHaveLength(1)
    expect(dangling[0]?.missing).toEqual(['ghost'])
  })

  it('连线都有效时没有悬空连线', () => {
    expect(findDanglingEdges([startNode, llmNode], edges)).toEqual([])
  })
})

describe('文档级校验（R4-7、FR-P6）', () => {
  it('文档干净时不报问题', () => {
    const result = validateDocument({
      nodes: [startNode, llmNode],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    expect(result.issues).toEqual([])
    expect(result.errorCount).toBe(0)
    expect(result.warningCount).toBe(0)
  })

  it('孤立节点报为警告，不阻塞编辑', () => {
    const orphan: Node = { id: 'lonely', type: 'start', position: { x: 0, y: 300 } }
    const result = validateDocument({
      nodes: [startNode, llmNode, orphan],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    const orphanIssue = result.issues.find((issue) => issue.code === 'orphan-node')
    expect(orphanIssue?.severity).toBe('warning')
    expect(orphanIssue?.nodeId).toBe('lonely')
    expect(result.errorCount).toBe(0)
  })

  it('悬空连线报为错误', () => {
    const result = validateDocument({
      nodes: [startNode],
      edges: [{ id: 'e1', source: 'start', target: 'ghost' }],
      registry: BUILTIN_REGISTRY,
    })

    const issue = result.issues.find((entry) => entry.code === 'dangling-edge')
    expect(issue?.severity).toBe('error')
    expect(issue?.edgeId).toBe('e1')
  })

  it('必填参数缺失时报错', () => {
    const plugin: Node = {
      id: 'plugin',
      type: 'plugin',
      position: { x: 0, y: 0 },
      data: { label: 'Plugin' },
    }
    const result = validateDocument({
      nodes: [plugin],
      edges: [],
      registry: BUILTIN_REGISTRY,
    })

    const issue = result.issues.find((entry) => entry.code === 'missing-required')
    expect(issue?.severity).toBe('error')
    expect(issue?.paramKey).toBe('tool')
    expect(issue?.nodeId).toBe('plugin')
  })

  it('引用失效时报错', () => {
    const broken: Node = {
      id: 'llm',
      type: 'llm',
      position: { x: 0, y: 100 },
      data: { label: 'LLM', prompt: '你好 {{start.missing}}' },
    }
    const result = validateDocument({
      nodes: [startNode, broken],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    const issue = result.issues.find((entry) => entry.code === 'invalid-reference')
    expect(issue?.severity).toBe('error')
    expect(issue?.paramKey).toBe('prompt')
  })

  it('未注册的节点类型报为警告', () => {
    const alien: Node = { id: 'alien', type: 'unknown-type', position: { x: 0, y: 0 } }
    const result = validateDocument({
      nodes: [alien],
      edges: [],
      registry: BUILTIN_REGISTRY,
    })

    const issue = result.issues.find((entry) => entry.code === 'unknown-node-type')
    expect(issue?.severity).toBe('warning')
    expect(issue?.nodeId).toBe('alien')
  })

  it('按节点与参数筛出问题', () => {
    const result = validateDocument({
      nodes: [startNode, llmNode],
      edges,
      registry: BUILTIN_REGISTRY,
    })

    const orphanIssues = getNodeIssues(result.issues, 'llm')
    expect(orphanIssues).toEqual([])
    expect(getParamIssues(result.issues, 'llm', 'prompt')).toEqual([])
  })

  it('findMissingRequired 列出缺失的必填参数', () => {
    const schemas = [
      { key: 'tool', label: '工具标识', type: 'string' as const, required: true },
      { key: 'timeout', label: '超时', type: 'number' as const },
    ]

    expect(findMissingRequired(schemas, {}).map((schema) => schema.key)).toEqual(['tool'])
    expect(findMissingRequired(schemas, { tool: 'x' })).toEqual([])
  })
})
