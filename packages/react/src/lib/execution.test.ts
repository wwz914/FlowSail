import { describe, expect, it } from 'vitest'
import type { Edge, Node, Workflow } from '@flowsail/core'
import { createWorkflow } from '@flowsail/core'
import { BUILTIN_REGISTRY } from './registryContext.tsx'
import {
  buildMockFields,
  createMockRunner,
  findStartNode,
  reachableNodeIds,
  resolveRuntimeParams,
  resolveRuntimeValue,
  shouldFollowBranch,
  topologicalSort,
} from './execution.ts'
import type { NodeRunState, RunError } from './runner.ts'

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
  data: { label: 'LLM', prompt: '摘要：{{start.query}}' },
}

const conditionNode: Node = {
  id: 'condition',
  type: 'condition',
  position: { x: 0, y: 200 },
  data: { label: 'Condition', expression: 'summary.length > 40' },
}

const endNode: Node = {
  id: 'end',
  type: 'end',
  position: { x: 0, y: 300 },
  data: { label: 'End' },
}

const llmYesNode: Node = {
  id: 'llm-yes',
  type: 'llm',
  position: { x: -200, y: 300 },
  data: { label: 'LLM (是)', prompt: '翻成英文：{{llm.text}}' },
}

const edges: Edge[] = [
  { id: 'e1', source: 'start', target: 'llm', sourceHandle: 'out', targetHandle: 'in' },
  { id: 'e2', source: 'llm', target: 'condition', sourceHandle: 'out', targetHandle: 'in' },
  {
    id: 'e3',
    source: 'condition',
    target: 'end',
    sourceHandle: 'false',
    targetHandle: 'in',
  },
  {
    id: 'e4',
    source: 'condition',
    target: 'llm-yes',
    sourceHandle: 'true',
    targetHandle: 'in',
  },
]

function createDocument(nodes: Node[], edgeList: Edge[]): Workflow {
  return { ...createWorkflow(), nodes, edges: edgeList }
}

describe('拓扑排序（R5-2）', () => {
  it('按连线方向排节点，上游在前', () => {
    const ordered = topologicalSort([endNode, conditionNode, llmNode, startNode], edges)

    expect(ordered.map((node) => node.id)).toEqual(['start', 'llm', 'condition', 'end'])
  })

  it('没有连线时保持文档顺序', () => {
    const ordered = topologicalSort([llmNode, startNode], [])

    expect(ordered.map((node) => node.id)).toEqual(['llm', 'start'])
  })

  it('遇到环时把剩余节点按文档顺序补在末尾，不丢弃', () => {
    const cyclic: Edge[] = [
      { id: 'c1', source: 'a', target: 'b' },
      { id: 'c2', source: 'b', target: 'a' },
    ]
    const a: Node = { id: 'a', type: 'llm', position: { x: 0, y: 0 }, data: {} }
    const b: Node = { id: 'b', type: 'llm', position: { x: 0, y: 100 }, data: {} }

    const ordered = topologicalSort([a, b], cyclic)

    expect(ordered).toHaveLength(2)
    expect(ordered.map((node) => node.id).sort()).toEqual(['a', 'b'])
  })

  it('忽略指向不存在节点的连线', () => {
    const ordered = topologicalSort(
      [startNode, llmNode],
      [
        { id: 'e1', source: 'start', target: 'llm' },
        { id: 'e2', source: 'start', target: 'ghost' },
      ],
    )

    expect(ordered.map((node) => node.id)).toEqual(['start', 'llm'])
  })
})

describe('入口节点（R5-2）', () => {
  it('找出没有入边的节点', () => {
    expect(findStartNode([startNode, llmNode, conditionNode, endNode], edges)?.id).toBe('start')
  })

  it('没有入边的节点就是入口', () => {
    const result = findStartNode(
      [llmNode, conditionNode],
      [{ id: 'e1', source: 'llm', target: 'condition' }],
    )

    expect(result?.id).toBe('llm')
  })

  it('每个节点都有入边时没有入口', () => {
    const a: Node = { id: 'a', type: 'llm', position: { x: 0, y: 0 }, data: {} }
    const b: Node = { id: 'b', type: 'llm', position: { x: 0, y: 100 }, data: {} }

    const result = findStartNode(
      [a, b],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    )

    expect(result).toBeUndefined()
  })
})

describe('可达节点（R5-2）', () => {
  it('沿连线找出全部可达节点', () => {
    const reachable = reachableNodeIds('start', edges)

    expect([...reachable].sort()).toEqual(['condition', 'end', 'llm', 'llm-yes', 'start'])
  })

  it('不可达的节点不在集合里', () => {
    const orphan: Node = {
      id: 'orphan',
      type: 'llm',
      position: { x: 0, y: 0 },
      data: {},
    }

    expect(reachableNodeIds('start', edges).has(orphan.id)).toBe(false)
  })
})

describe('运行期变量替换（R5-3、FR-P3）', () => {
  it('把引用换成上游的实际输出值', () => {
    const outputs = new Map([['start', { query: '一封长邮件' }]])

    const result = resolveRuntimeValue('摘要：{{start.query}}', outputs)

    expect(result.value).toBe('摘要：一封长邮件')
    expect(result.error).toBeUndefined()
  })

  it('上游没有产出该字段时给出可读错误', () => {
    const outputs = new Map([['start', { query: 'x' }]])

    const result = resolveRuntimeValue('{{start.missing}}', outputs)

    expect(result.value).toBeUndefined()
    expect(result.error?.code).toBe('invalid-reference')
    expect(result.error?.message).toContain('missing')
  })

  it('上游节点完全没运行时给出可读错误', () => {
    const result = resolveRuntimeValue('{{start.query}}', new Map())

    expect(result.error?.code).toBe('invalid-reference')
    expect(result.error?.message).toContain('start')
  })

  it('没有引用的文本原样返回', () => {
    const result = resolveRuntimeValue('普通文本', new Map())

    expect(result.value).toBe('普通文本')
    expect(result.error).toBeUndefined()
  })

  it('逐个替换参数值，任一失败则整组失败', () => {
    const outputs = new Map([['start', { query: 'hi' }]])

    const ok = resolveRuntimeParams(
      [
        { key: 'prompt', value: '你好 {{start.query}}' },
        { key: 'model', value: 'gpt-4o' },
      ],
      outputs,
    )

    expect(ok.error).toBeUndefined()
    expect(ok.params).toEqual({ prompt: '你好 hi', model: 'gpt-4o' })

    const failed = resolveRuntimeParams(
      [
        { key: 'prompt', value: '你好 {{start.query}}' },
        { key: 'code', value: '{{start.ghost}}' },
      ],
      outputs,
    )

    expect(failed.error?.code).toBe('invalid-reference')
    expect(failed.error?.message).toContain('code')
  })
})

describe('Mock 产出（R5-2、Q21）', () => {
  it('产出落在类型声明的输出字段上', () => {
    const fields = buildMockFields(BUILTIN_REGISTRY, llmNode, { prompt: 'x' })

    expect(Object.keys(fields)).toEqual(['text'])
    expect(typeof fields.text).toBe('string')
  })

  it('条件节点产出布尔结果', () => {
    const fields = buildMockFields(BUILTIN_REGISTRY, conditionNode, {
      expression: 'summary.length > 40',
    })

    expect(typeof fields.result).toBe('boolean')
  })

  it('插件节点产出对象', () => {
    const plugin: Node = {
      id: 'plugin',
      type: 'plugin',
      position: { x: 0, y: 0 },
      data: {},
    }

    const fields = buildMockFields(BUILTIN_REGISTRY, plugin, {})

    expect(typeof fields.result).toBe('object')
  })
})

describe('分支判定（R5-2、R5-5）', () => {
  it('结果为 true 时走 true 出口', () => {
    expect(shouldFollowBranch('true', true)).toBe(true)
    expect(shouldFollowBranch('false', true)).toBe(false)
  })

  it('结果为 false 时走 false 出口', () => {
    expect(shouldFollowBranch('true', false)).toBe(false)
    expect(shouldFollowBranch('false', false)).toBe(true)
  })

  it('非条件出口一律放行', () => {
    expect(shouldFollowBranch('out', false)).toBe(true)
    expect(shouldFollowBranch(undefined, false)).toBe(true)
  })
})

describe('Mock Runner（R5-2、FR-R1）', () => {
  it('按拓扑顺序执行并回报每个节点的状态', async () => {
    const runner = createMockRunner()
    const states: Array<[string, NodeRunState]> = []
    const errors: Record<string, RunError> = {}

    const result = await runner.run(
      createDocument([startNode, llmNode, conditionNode, endNode], edges),
      {
        onNodeStart: (node) => states.push([node.id, 'running']),
        onNodeEnd: (node, output, error) => {
          states.push([node.id, error ? 'error' : 'success'])
          if (error) errors[node.id] = error
        },
        onNodeSkip: (node) => states.push([node.id, 'skipped']),
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    expect(result.ok).toBe(true)
    expect(Object.keys(errors)).toEqual([])
    expect(states.filter(([, state]) => state === 'running').map(([id]) => id)).toEqual([
      'start',
      'llm',
      'condition',
      'end',
    ])
  })

  it('把上游的实际输出替换进参数', async () => {
    const runner = createMockRunner()
    let llmPrompt: unknown

    await runner.run(
      createDocument([startNode, llmNode], [edges[0]!]),
      {
        onNodeStart: (node, input) => {
          if (node.id === 'llm') llmPrompt = input.params.prompt
        },
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY, variables: { query: '一封很长的邮件' } },
    )

    expect(llmPrompt).toBe('摘要：一封很长的邮件')
  })

  it('取值失败时把该节点标记为失败并给出可读错误', async () => {
    const brokenLlm: Node = {
      ...llmNode,
      data: { label: 'LLM', prompt: '{{start.ghost}}' },
    }
    const runner = createMockRunner()
    const errors: Record<string, RunError> = {}

    const result = await runner.run(
      createDocument([startNode, brokenLlm], [edges[0]!]),
      {
        onNodeEnd: (node, _output, error) => {
          if (error) errors[node.id] = error
        },
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    expect(result.ok).toBe(false)
    expect(errors.llm?.code).toBe('invalid-reference')
    expect(errors.llm?.message).toContain('ghost')
  })

  it('取消后停止执行并标记为取消', async () => {
    const runner = createMockRunner({ nodeDelay: 20 })
    const controller = new AbortController()

    const promise = runner.run(
      createDocument([startNode, llmNode, conditionNode, endNode], edges),
      {},
      controller.signal,
      { registry: BUILTIN_REGISTRY },
    )

    controller.abort()
    const result = await promise

    expect(result.cancelled).toBe(true)
    expect(result.ok).toBe(false)
  })

  it('条件节点按判断结果只走一条分支，另一条分支的节点被跳过', async () => {
    const runner = createMockRunner()
    const skipped: string[] = []
    const ran: string[] = []

    await runner.run(
      createDocument([startNode, llmNode, conditionNode, llmYesNode, endNode], edges),
      {
        onNodeStart: (node) => ran.push(node.id),
        onNodeSkip: (node) => skipped.push(node.id),
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    // 条件结果为 false：走「否」分支到 end，「是」分支的节点被跳过。
    expect(ran).toEqual(['start', 'llm', 'condition', 'end'])
    expect(skipped).toContain('llm-yes')
  })

  it('上游失败时下游节点被跳过，而不是跟着失败', async () => {
    const brokenLlm: Node = {
      ...llmNode,
      data: { label: 'LLM', prompt: '{{start.ghost}}' },
    }
    const runner = createMockRunner()
    const skipped: string[] = []
    const errors: Record<string, RunError> = {}

    await runner.run(
      createDocument([startNode, brokenLlm, conditionNode, llmYesNode, endNode], edges),
      {
        onNodeEnd: (node, _output, error) => {
          if (error) errors[node.id] = error
        },
        onNodeSkip: (node) => skipped.push(node.id),
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    // 只有大模型节点失败；它的下游（条件、结束）被跳过。
    expect(Object.keys(errors)).toEqual(['llm'])
    expect(skipped).toContain('condition')
    expect(skipped).toContain('end')
  })

  it('汇合节点接在两条分支上时，走到的分支仍会执行它', async () => {
    // 结束节点同时接在「是」和「否」两条分支上：即使「是」分支没走，
    // 结束节点仍应执行（它还有一条活的入边）。
    const mergeEnd: Node = {
      id: 'end',
      type: 'end',
      position: { x: 0, y: 400 },
      data: { label: 'End' },
    }
    const mergeEdges: Edge[] = [
      ...edges,
      { id: 'e5', source: 'llm-yes', target: 'end', sourceHandle: 'out', targetHandle: 'in' },
    ]
    const runner = createMockRunner()
    const ran: string[] = []
    const skipped: string[] = []

    await runner.run(
      createDocument([startNode, llmNode, conditionNode, llmYesNode, mergeEnd], mergeEdges),
      {
        onNodeStart: (node) => ran.push(node.id),
        onNodeSkip: (node) => skipped.push(node.id),
      },
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    // 「是」分支没走 → llm-yes 被跳过；但结束节点还有「否」分支这条活路，
    // 因此仍会执行。
    expect(skipped).toContain('llm-yes')
    expect(ran).toContain('end')
  })

  it('找不到开始节点时给出可读错误', async () => {    const runner = createMockRunner()
    const a: Node = { id: 'a', type: 'llm', position: { x: 0, y: 0 }, data: {} }
    const b: Node = { id: 'b', type: 'llm', position: { x: 0, y: 100 }, data: {} }

    const result = await runner.run(
      createDocument(
        [a, b],
        [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      ),
      {},
      new AbortController().signal,
      { registry: BUILTIN_REGISTRY },
    )

    expect(result.ok).toBe(false)
    expect(Object.values(result.errors)[0]?.code).toBe('no-start-node')
  })
})
