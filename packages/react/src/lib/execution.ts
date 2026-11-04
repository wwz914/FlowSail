import type { Edge, Node, Workflow } from '@system'
import type { NodeTypeRegistry } from './registry.ts'
import { resolveNodeType } from './registry.ts'
import { parseReferences } from './variables.ts'
import type {
  NodeRunInput,
  NodeRunOutput,
  RunContext,
  RunError,
  RunResult,
  Runner,
  RunnerHooks,
} from './runner.ts'

/**
 * 拓扑排序（R5-2）。
 *
 * 按连线方向排节点，保证上游先跑。遇到环时无法给出完整顺序，
 * 此时把剩余节点按文档顺序追加在末尾（而不是丢弃），
 * 免得环上的节点在画布上永远停在 `idle` 而没有任何提示。
 */
export function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  for (const node of nodes) indegree.set(node.id, 0)

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    if (edge.source === edge.target) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  }

  const ordered: Node[] = []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id)

  while (queue.length > 0) {
    const id = queue.shift()!
    const node = byId.get(id)
    if (node) ordered.push(node)

    for (const next of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  // 环上的节点（以及任何因环而无法排序的节点）按文档顺序补在末尾。
  if (ordered.length < nodes.length) {
    const placed = new Set(ordered.map((node) => node.id))
    for (const node of nodes) {
      if (!placed.has(node.id)) ordered.push(node)
    }
  }

  return ordered
}

/** 节点的显示名。 */
function nodeLabelOf(node: Node): string {
  return String(node.data?.label ?? node.id)
}

/**
 * 找出流程的入口节点（R5-2）。
 *
 * 入口 = 没有入边的节点。有多个时取文档顺序里的第一个，
 * 避免同一次运行里出现两个"开始"。
 */
export function findStartNode(nodes: Node[], edges: Edge[]): Node | undefined {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const hasIncoming = new Set<string>()

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    if (edge.source === edge.target) continue
    hasIncoming.add(edge.target)
  }

  return nodes.find((node) => !hasIncoming.has(node.id))
}

/** 运行期变量解析的结果（R5-3）。 */
export interface RuntimeResolveResult {
  /** 替换完引用的值。 */
  value: unknown
  /** 取值失败时的错误。 */
  error?: RunError | undefined
}

/**
 * 运行期变量替换（R5-3、FR-P3、FR-R1）。
 *
 * 把参数值里的 `{{nodeId.field}}` 换成上游节点的**实际输出值**。
 * 取不到值时给出可读错误，不静默吞掉——调用方据此把该节点标记为失败。
 */
export function resolveRuntimeValue(
  text: string,
  outputs: Map<string, Record<string, unknown>>,
): RuntimeResolveResult {
  const references = parseReferences(text)
  if (references.length === 0) return { value: text }

  let result = ''
  let cursor = 0

  for (const reference of references) {
    const nodeOutputs = outputs.get(reference.nodeId)
    if (!nodeOutputs) {
      return {
        value: undefined,
        error: {
          code: 'invalid-reference',
          message: `引用的节点 ${reference.nodeId} 没有产出结果，无法取值`,
        },
      }
    }

    if (!(reference.field in nodeOutputs)) {
      return {
        value: undefined,
        error: {
          code: 'invalid-reference',
          message: `节点 ${reference.nodeId} 没有输出字段 ${reference.field}`,
        },
      }
    }

    result += text.slice(cursor, reference.index)
    result += String(nodeOutputs[reference.field] ?? '')
    cursor = reference.index + reference.raw.length
  }

  result += text.slice(cursor)
  return { value: result }
}

/**
 * 把节点的参数值逐个做运行期变量替换（R5-3）。
 *
 * 任何一项取不到值，整组替换失败并给出可读原因。
 */
export function resolveRuntimeParams(
  params: Array<{ key: string; value: unknown }>,
  outputs: Map<string, Record<string, unknown>>,
): { params: Record<string, unknown>; error?: RunError | undefined } {
  const resolved: Record<string, unknown> = {}

  for (const param of params) {
    if (typeof param.value === 'string' && param.value.includes('{{')) {
      const result = resolveRuntimeValue(param.value, outputs)
      if (result.error) {
        return {
          params: {},
          error: {
            code: result.error.code,
            message: `参数「${param.key}」取值失败：${result.error.message}`,
          },
        }
      }
      resolved[param.key] = result.value
      continue
    }

    resolved[param.key] = param.value
  }

  return { params: resolved }
}

/**
 * 把节点类型声明的输出字段填上假数据（R5-2、Q21）。
 *
 * Mock 的产出必须落在 `outputFields` 声明上，否则变量替换会在运行时失败。
 */
export function buildMockFields(
  registry: NodeTypeRegistry,
  node: Node,
  params: Record<string, unknown>,
  inputs?: Record<string, unknown>,
): Record<string, unknown> {
  const definition = resolveNodeType(registry, node.type)
  const fields: Record<string, unknown> = {}

  for (const field of definition.outputFields ?? []) {
    fields[field.name] = mockFieldValue(field.type, field.name, params, inputs)
  }

  return fields
}

/**
 * 按字段类型生成可区分的假值（R5-2）。
 *
 * 条件节点的布尔结果按表达式求值：优先用上游实际产出的值，
 * 表达式形如 `x.length > 40`、`x > 40` 或直接是字段名。
 */
function mockFieldValue(
  type: string,
  name: string,
  params: Record<string, unknown>,
  inputs?: Record<string, unknown>,
): unknown {
  switch (type) {
    case 'boolean': {
      const expression = String(params.expression ?? '').trim()
      if (expression === '') return true
      return evaluateExpression(expression, params, inputs)
    }
    case 'number':
      return 42
    case 'object':
      return { mock: true, field: name }
    case 'array':
      return [1, 2, 3]
    case 'any':
      return { mock: true, field: name }
    default:
      return `[${name}] ${JSON.stringify(params.prompt ?? params.input ?? '')}`
  }
}

/**
 * 求值条件表达式（R5-2）。
 *
 * 支持三种写法：`字段.length > 数字`、`字段 > 数字`、直接是字段名（取其真值）。
 * 字段可以是上游节点的输出字段名（如 `summary`），
 * 也可以是 `nodeId.field` 形式。
 */
function evaluateExpression(
  expression: string,
  params: Record<string, unknown>,
  inputs?: Record<string, unknown>,
): boolean {
  const compare = expression.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/)
  if (!compare) {
    const value = lookupValue(expression, params, inputs)
    return Boolean(value)
  }

  const left = compare[1]!.trim()
  const operator = compare[2]!
  const right = compare[3]!.trim()

  const leftValue = lookupValue(left, params, inputs)
  const rightValue = /^-?\d+(\.\d+)?$/.test(right) ? Number(right) : lookupValue(right, params, inputs)

  const leftNumber = typeof leftValue === 'string' ? leftValue.length : Number(leftValue)
  const rightNumber = typeof rightValue === 'string' ? rightValue.length : Number(rightValue)

  switch (operator) {
    case '>':
      return leftNumber > rightNumber
    case '<':
      return leftNumber < rightNumber
    case '>=':
      return leftNumber >= rightNumber
    case '<=':
      return leftNumber <= rightNumber
    case '==':
      return String(leftValue) === String(rightValue)
    case '!=':
      return String(leftValue) !== String(rightValue)
    default:
      return false
  }
}

/** 在上游输出与参数里查一个字段的值。 */
function lookupValue(
  name: string,
  params: Record<string, unknown>,
  inputs?: Record<string, unknown>,
): unknown {
  if (inputs) {
    if (name in inputs) return inputs[name]
    // `nodeId.field` 形式：取该节点输出的最后一个字段。
    const dotted = name.split('.')
    if (dotted.length === 2) {
      const prefixed = `${dotted[0]}.${dotted[1]}`
      if (prefixed in inputs) return inputs[prefixed]
      const suffix = `.${dotted[1]}`
      const match = Object.entries(inputs).find(([key]) => key.endsWith(suffix))
      if (match) return match[1]
    }
    // 字段名形式：取任意一个同名上游输出。
    const match = Object.entries(inputs).find(([key]) => key.split('.')[1] === name)
    if (match) return match[1]
  }

  if (name in params) return params[name]
  return undefined
}

/** Mock Runner 的可配项（R5-2）。 */
export interface MockRunnerOptions {
  /** 单个节点的执行延迟（毫秒），便于观察运行态。 */
  nodeDelay?: number
  /** 流程级输入。 */
  variables?: Record<string, unknown>
}

/** 等待一小段时间，同时响应取消（R5-2、R5-4）。 */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * 内置 Mock Runner（R5-2、FR-R1）。
 *
 * 按拓扑顺序执行，按节点类型产出假数据：
 * 大模型产出文本、插件产出对象、代码产出对象、条件产出布尔。
 */
export function createMockRunner(options: MockRunnerOptions = {}): Runner {
  const nodeDelay = options.nodeDelay ?? 0

  return {
    async run(
      workflow: Workflow,
      hooks: RunnerHooks,
      signal: AbortSignal,
      context?: RunContext,
    ): Promise<RunResult> {
      const startedAt = Date.now()
      const errors: Record<string, RunError> = {}
      const outputs: Record<string, NodeRunOutput> = {}
      const fieldsByNode = new Map<string, Record<string, unknown>>()

      const registry = context?.registry
      const variables = { ...(options.variables ?? {}), ...(context?.variables ?? {}) }

      hooks.onRunStart?.(workflow)

      const ordered = topologicalSort(workflow.nodes, workflow.edges)
      const start = findStartNode(workflow.nodes, workflow.edges)

      if (!start) {
        const error: RunError = {
          code: 'no-start-node',
          message: '找不到开始节点：流程里没有入口节点',
        }
        const result: RunResult = {
          ok: false,
          cancelled: false,
          errors: { '': error },
          outputs: {},
          duration: Date.now() - startedAt,
        }
        hooks.onRunEnd?.(result)
        return result
      }

      // 只跑从开始节点可达的部分；不可达的节点标记为 skipped（R5-5）。
      const reachable = reachableNodeIds(start.id, workflow.edges)

      // 被跳过的节点：条件分支没走到，或上游没能产出结果（R5-5）。
      // 键为节点 id，值是导致它被跳过的原因。
      const skipped = new Map<string, string>()

      /** 某个节点的上游里是否有没能产出结果的（R5-5）。 */
      const hasUnreachableUpstream = (nodeId: string): boolean => {
        for (const edge of workflow.edges) {
          if (edge.target !== nodeId) continue
          if (errors[edge.source] !== undefined) return true
          if (skipped.has(edge.source)) return true
        }
        return false
      }

      for (const node of ordered) {
        if (signal.aborted) break

        if (!reachable.has(node.id)) {
          hooks.onNodeSkip?.(node)
          continue
        }

        // 上游没能产出结果时该节点不执行（R5-5：标成 skipped 而不是失败）。
        // 上游失败会一路传递下来，因此这里看的是直接上游的状态。
        if (hasUnreachableUpstream(node.id)) {
          skipped.set(node.id, '上游节点没有产出结果')
          hooks.onNodeSkip?.(node)
          continue
        }

        // 走的是条件分支的另一条路（R5-5）。
        const skippedBy = skipped.get(node.id)
        if (skippedBy !== undefined) {
          hooks.onNodeSkip?.(node)
          continue
        }

        const definition = registry ? resolveNodeType(registry, node.type) : undefined
        const paramList = (definition?.params ?? []).map((schema) => ({
          key: schema.key,
          value: (node.data ?? {})[schema.key],
        }))

        const resolved = resolveRuntimeParams(paramList, fieldsByNode)
        const nodeInputs = collectInputs(node.id, workflow.edges, fieldsByNode)

        const input: NodeRunInput = {
          nodeId: node.id,
          type: node.type,
          data: (node.data ?? {}) as Record<string, unknown>,
          params: resolved.params,
          inputs: nodeInputs,
          variables,
        }

        hooks.onNodeStart?.(node, input)

        if (resolved.error) {
          errors[node.id] = resolved.error
          hooks.onNodeEnd?.(node, null, resolved.error)
          continue
        }

        await delay(nodeDelay, signal)
        if (signal.aborted) break

        const fields = registry
          ? buildMockFields(registry, node, resolved.params, nodeInputs)
          : buildMockFieldsFromParams(node, resolved.params)

        // 开始节点把流程级输入也放进输出，变量选择器才能引用到它。
        if (node.id === start.id) {
          fields.query = String(variables.query ?? variables.input ?? '')
          fields.variables = variables
        }

        const output: NodeRunOutput = { nodeId: node.id, fields }
        fieldsByNode.set(node.id, fields)
        outputs[node.id] = output
        hooks.onNodeEnd?.(node, output)

        // 条件节点跑完后决定走哪条分支（R5-2、R5-5）。
        if (node.type === 'condition') {
          const result = fields.result

          for (const edge of workflow.edges) {
            if (edge.source !== node.id) continue
            if (shouldFollowBranch(edge.sourceHandle, result)) continue

            // 这条分支没走：把它的下游节点标记为跳过。
            for (const downstream of reachableNodeIds(edge.target, workflow.edges)) {
              if (downstream === node.id) continue
              if (skipped.has(downstream)) continue
              if (outputs[downstream]) continue
              skipped.set(downstream, `条件节点「${nodeLabelOf(node)}」没有走这条分支`)
            }
          }
        }
      }

      const cancelled = signal.aborted
      const result: RunResult = {
        ok: Object.keys(errors).length === 0 && !cancelled,
        cancelled,
        errors,
        outputs,
        duration: Date.now() - startedAt,
      }

      hooks.onRunEnd?.(result)
      return result
    },
  }
}

/** 注册表不可用时的兜底产出：只产出通用字段。 */
function buildMockFieldsFromParams(
  node: Node,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (node.type === 'condition') fields.result = true
  if (node.type === 'llm') fields.text = String(params.prompt ?? '')
  return fields
}

/** 收集某个节点上游的输出（键为 `nodeId.field`）。 */
function collectInputs(
  nodeId: string,
  edges: Edge[],
  fieldsByNode: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}

  for (const edge of edges) {
    if (edge.target !== nodeId) continue
    const fields = fieldsByNode.get(edge.source)
    if (!fields) continue
    for (const [field, value] of Object.entries(fields)) {
      inputs[`${edge.source}.${field}`] = value
    }
  }

  return inputs
}

/** 找出从某个节点出发可达的全部节点（含自身）。 */
export function reachableNodeIds(startId: string, edges: Edge[]): Set<string> {
  const reachable = new Set<string>([startId])
  const queue = [startId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.source !== current) continue
      if (reachable.has(edge.target)) continue
      reachable.add(edge.target)
      queue.push(edge.target)
    }
  }

  return reachable
}

/**
 * 决定某个分支出口是否要走（R5-2）。
 *
 * 条件节点跑完后，只有结果为 `true` 时才走 `true` 出口，
 * 另一条分支上的节点标记为 `skipped`（R5-5）。
 */
export function shouldFollowBranch(
  sourceHandle: string | undefined,
  conditionResult: unknown,
): boolean {
  if (sourceHandle !== 'true' && sourceHandle !== 'false') return true
  if (conditionResult === undefined || conditionResult === null) return true

  const isTrue = conditionResult === true || conditionResult === 'true'
  return sourceHandle === 'true' ? isTrue : !isTrue
}
