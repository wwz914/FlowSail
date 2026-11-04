import type { Node } from '@system'
import { useFlowStore } from '../store/index.ts'
import { resolveNodeType } from './registry.ts'
import { createMockRunner } from './execution.ts'
import { getDefaultNodeDelay, getRunner, useRunStore } from './runStore.ts'
import type { NodeRunInput, RunError, RunResult, Runner } from './runner.ts'

/**
 * 试运行控制器（R5-4、FR-R2）。
 *
 * 负责把 Runner 的钩子翻译成运行态：节点开始 → running，结束 → success/error，
 * 跳过 → skipped。画布与运行记录面板都读 `useRunStore`，因此状态天然一致（R5-6）。
 */

let abortController: AbortController | null = null

/** 当前是否处于运行中（R5-4）。 */
export function isRunning(): boolean {
  return useRunStore.getState().status === 'running'
}

/** 运行中是否禁止编辑（R5-4、PRD Q8：运行中禁止编辑）。 */
export function isRunLocked(): boolean {
  return isRunning()
}

/** 试运行是否可发起（R5-9：按钮态随可运行性禁用）。 */
export function canStartRun(): boolean {
  if (isRunning()) return false
  return useFlowStore.getState().workflow.nodes.length > 0
}

/** 单节点测试是否可发起。 */
export function canTestNode(node: Node | null): boolean {
  if (!node) return false
  return !isRunning()
}

/**
 * 发起一次试运行（R5-4）。
 *
 * 运行期间画布禁止编辑；运行结束或取消后恢复。
 */
export async function startRun(options?: {
  runner?: Runner
  variables?: Record<string, unknown>
}): Promise<RunResult> {
  const runStore = useRunStore.getState()
  if (runStore.status === 'running') return emptyResult()

  const workflow = useFlowStore.getState().workflow
  const registry = runStore.registry
  if (!registry) {
    // 注册表还没同步（画布未挂载）：直接给出可读错误，不进入运行态。
    const error: RunError = {
      code: 'runtime-error',
      message: '画布尚未就绪，无法发起试运行',
    }
    useRunStore.getState().finishRun({
      ok: false,
      cancelled: false,
      errors: { '': error },
      outputs: {},
      duration: 0,
    })
    return {
      ok: false,
      cancelled: false,
      errors: { '': error },
      outputs: {},
      duration: 0,
    }
  }

  const runner =
    options?.runner ?? getRunner() ?? createMockRunner({ nodeDelay: getDefaultNodeDelay() })
  const controller = new AbortController()
  abortController = controller

  runStore.startRun()

  let result: RunResult
  try {
    result = await runner.run(workflow, createHooks(), controller.signal, {
      registry,
      ...(options?.variables !== undefined ? { variables: options.variables } : {}),
    })
  } catch (error) {
    // Runner 抛异常时也要收尾：否则运行锁会一直挂着，画布再也不能编辑。
    result = {
      ok: false,
      cancelled: controller.signal.aborted,
      errors: {
        '': {
          code: 'runtime-error',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      outputs: {},
      duration: 0,
    }
  }

  if (abortController === controller) abortController = null
  useRunStore.getState().finishRun(result)
  return result
}

/** 取消正在进行的运行（R5-4）。 */
export function cancelRun(): boolean {
  if (!abortController) return false
  abortController.abort()
  return true
}

/** 是否存在正在进行的运行。 */
export function hasActiveRun(): boolean {
  return abortController !== null
}

function emptyResult(): RunResult {
  return {
    ok: false,
    cancelled: false,
    errors: {},
    outputs: {},
    duration: 0,
  }
}

/**
 * 把 Runner 的钩子翻译成运行态更新（R5-4、R5-5）。
 */
function createHooks() {
  const startedAt = new Map<string, number>()
  // 记住每个节点的运行输入（R6-5）：运行结束后回填到配置面板的输入/输出预览。
  const inputs = new Map<string, Record<string, unknown>>()

  return {
    onRunStart: () => {
      startedAt.clear()
      inputs.clear()
    },

    onNodeStart: (node: Node, input: NodeRunInput) => {
      startedAt.set(node.id, Date.now())
      inputs.set(node.id, input.params)
      const meta = resolveNodeType(registry(), node.type)
      useRunStore.getState().markNodeRunning(node, nodeLabel(node), meta.label)
    },

    onNodeEnd: (
      node: Node,
      output: { nodeId: string; fields: Record<string, unknown> } | null,
      error?: RunError,
    ) => {
      const meta = resolveNodeType(registry(), node.type)
      const duration = Date.now() - (startedAt.get(node.id) ?? Date.now())
      const input = inputs.get(node.id)
      startedAt.delete(node.id)
      inputs.delete(node.id)

      if (error) {
        useRunStore.getState().markNodeError(node, nodeLabel(node), meta.label, {
          duration,
          ...(input !== undefined ? { input } : {}),
          error,
        })
        return
      }

      useRunStore.getState().markNodeSuccess(node, nodeLabel(node), meta.label, {
        duration,
        ...(input !== undefined ? { input } : {}),
        output: output?.fields ?? {},
      })
    },

    onNodeSkip: (node: Node) => {
      const meta = resolveNodeType(registry(), node.type)
      inputs.delete(node.id)
      useRunStore.getState().markNodeSkipped(node, nodeLabel(node), meta.label)
    },
  }
}

/** 取得生效的注册表；未同步时回落到空注册表。 */
function registry() {
  const current = useRunStore.getState().registry
  if (current) return current
  throw new Error('节点类型注册表尚未同步：请确认画布已挂载 `ReactFlow`。')
}

/** 节点的显示名。 */
function nodeLabel(node: Node): string {
  return String(node.data?.label ?? node.id)
}
