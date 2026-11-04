import type { Node } from '@flowsail/core'
import { resolveNodeType } from './registry.ts'
import { buildMockFields, resolveRuntimeParams } from './execution.ts'
import { parseReferences } from './variables.ts'
import { useRunStore } from './runStore.ts'
import type {
  NodeExecutor,
  NodeTestInput,
  NodeTestOutput,
  RunContext,
  RunError,
} from './runner.ts'

/**
 * 单节点测试（R5-8、FR-P5）。
 *
 * 手填输入即可执行当前节点并看到输出，不影响整条流程的运行记录——
 * 结果单独成组展示，不写进 `useRunStore` 的记录里。
 */

/** 单节点测试的结果（视图态，不进运行记录、不写回文档）。 */
export interface NodeTestResult {
  /** 是否成功。 */
  ok: boolean
  /** 产出的字段。 */
  fields: Record<string, unknown>
  /** 失败时的错误。 */
  error?: RunError | undefined
  /** 耗时（毫秒）。 */
  duration: number
}

/**
 * 内置的单节点 Mock 执行器（R5-8）。
 *
 * 与 Mock Runner 共用产出逻辑（`buildMockFields`），
 * 保证单节点测试看到的输出形态与整条流程里一致。
 */
export function createMockNodeExecutor(options?: { nodeDelay?: number }): NodeExecutor {
  const nodeDelay = options?.nodeDelay ?? 0

  return {
    async execute(
      input: NodeTestInput,
      signal: AbortSignal,
      context?: RunContext,
    ): Promise<NodeTestOutput> {
      const startedAt = Date.now()
      const registry = context?.registry ?? useRunStore.getState().registry
      if (!registry) {
        return {
          ok: false,
          fields: {},
          error: { code: 'runtime-error', message: '节点类型注册表尚未就绪' },
          duration: 0,
        }
      }

      if (signal.aborted) {
        return {
          ok: false,
          fields: {},
          error: { code: 'cancelled', message: '已取消' },
          duration: 0,
        }
      }

      const params = { ...input.params }
      const definition = resolveNodeType(registry, input.type)
      const mockNode: Node = {
        id: input.nodeId,
        ...(input.type !== undefined ? { type: input.type } : {}),
        position: { x: 0, y: 0 },
        data: input.data,
      }

      const fields = buildMockFields(registry, mockNode, params)

      // 手填输入与节点自身的产出合并：手填的字段优先。
      for (const [key, value] of Object.entries(input.inputs)) {
        fields[key] = value
      }

      if (nodeDelay > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, nodeDelay)
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

      if (signal.aborted) {
        return {
          ok: false,
          fields: {},
          error: { code: 'cancelled', message: '已取消' },
          duration: Date.now() - startedAt,
        }
      }

      // 声明了输出字段但一个都没产出，说明节点类型声明与实现不匹配。
      if (Object.keys(fields).length === 0 && (definition.outputFields ?? []).length > 0) {
        return {
          ok: false,
          fields: {},
          error: {
            code: 'no-output',
            message: `节点类型 ${definition.label} 声明了输出字段，但没有产出任何结果`,
          },
          duration: Date.now() - startedAt,
        }
      }

      return {
        ok: true,
        fields,
        duration: Date.now() - startedAt,
      }
    },
  }
}

/**
 * 收集节点参数里引用到的上游字段（R5-8）。
 *
 * 单节点测试没有上游产出，引用到的字段需要由用户手填，
 * 否则取值必然失败。因此这里把引用清单交给测试面板展示。
 */
export function collectReferencedFields(
  params: Record<string, unknown>,
): Array<{ nodeId: string; field: string; reference: string }> {
  const references: Array<{ nodeId: string; field: string; reference: string }> = []
  const seen = new Set<string>()

  for (const value of Object.values(params)) {
    if (typeof value !== 'string' || !value.includes('{{')) continue
    for (const parsed of parseReferences(value)) {
      const key = `${parsed.nodeId}.${parsed.field}`
      if (seen.has(key)) continue
      seen.add(key)
      references.push({ nodeId: parsed.nodeId, field: parsed.field, reference: parsed.raw })
    }
  }

  return references
}

/**
 * 执行一次单节点测试（R5-8）。
 *
 * `params` 里若含 `{{nodeId.field}}`，会用 `references` 里手填的值替换；
 * 替换失败时给出可读错误。
 */
export async function runNodeTest(options: {
  node: Node
  /** 替换完变量引用的参数值。 */
  params: Record<string, unknown>
  /** 手填的输入字段。 */
  inputs: Record<string, unknown>
  /**
   * 手填的上游引用值，键为 `nodeId.field`。
   *
   * 单节点测试没有上游产出，参数里引用的字段必须由用户手填才能取值。
   */
  references?: Record<string, unknown>
  executor?: NodeExecutor
  signal?: AbortSignal
}): Promise<NodeTestResult> {
  const startedAt = Date.now()
  const registry = useRunStore.getState().registry
  if (!registry) {
    return {
      ok: false,
      fields: {},
      error: { code: 'runtime-error', message: '节点类型注册表尚未就绪' },
      duration: 0,
    }
  }

  // 手填的上游引用值先放进"产出表"，供运行期变量替换取值（R5-3、R5-8）。
  const referenceOutputs = new Map<string, Record<string, unknown>>()
  for (const [key, value] of Object.entries(options.references ?? {})) {
    const separator = key.indexOf('.')
    if (separator < 0) continue
    const nodeId = key.slice(0, separator)
    const field = key.slice(separator + 1)
    const existing = referenceOutputs.get(nodeId) ?? {}
    existing[field] = value
    referenceOutputs.set(nodeId, existing)
  }

  const resolved = resolveRuntimeParams(
    Object.entries(options.params).map(([key, value]) => ({ key, value })),
    referenceOutputs,
  )
  if (resolved.error) {
    return {
      ok: false,
      fields: {},
      error: resolved.error,
      duration: Date.now() - startedAt,
    }
  }

  const executor = options.executor ?? createMockNodeExecutor()
  const controller = new AbortController()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const result = await executor.execute(
    {
      nodeId: options.node.id,
      type: options.node.type,
      data: (options.node.data ?? {}) as Record<string, unknown>,
      params: resolved.params,
      inputs: options.inputs,
    },
    controller.signal,
    { registry },
  )

  return {
    ok: result.ok,
    fields: result.fields,
    error: result.error,
    duration: result.duration,
  }
}
