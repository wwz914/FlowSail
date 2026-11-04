import type { Node, Workflow } from '@flowsail/core'
import type { NodeTypeRegistry } from './registry.ts'

/**
 * 节点运行态（R5-5、FR-N7）。
 *
 * 五态与 PRD FR-N7 一致：`idle` / `running` / `success` / `error` / `skipped`。
 * 画布上的节点颜色与运行记录面板的状态**始终来自同一份数据**（R5-6）。
 */
export type NodeRunState = 'idle' | 'running' | 'success' | 'error' | 'skipped'

/**
 * 运行期错误（R5-7、FR-R4）。
 *
 * 错误码是稳定的标识，方便宿主据此做分支处理；消息面向人，直接展示。
 */
export type RunErrorCode =
  | 'missing-required'
  | 'invalid-reference'
  | 'runtime-error'
  | 'cancelled'
  | 'no-start-node'
  | 'no-output'

/** 一个运行期错误。 */
export interface RunError {
  /** 错误码。 */
  code: RunErrorCode
  /** 可读消息，直接展示在画布与记录面板上。 */
  message: string
  /** 错误堆栈（宿主 Runner 提供）；没有时为 undefined。 */
  stack?: string | undefined
}

/**
 * 单个节点的运行输入（R5-3）。
 *
 * `params` 是**已经完成运行期变量替换**后的参数值；
 * `inputs` 是上游节点的实际输出。
 */
export interface NodeRunInput {
  /** 节点 id。 */
  nodeId: string
  /** 节点类型。 */
  type: string | undefined
  /** 节点在文档里的原始数据。 */
  data: Record<string, unknown>
  /** 替换完变量引用后的参数值。 */
  params: Record<string, unknown>
  /** 上游节点的输出，键为 `nodeId.field`。 */
  inputs: Record<string, unknown>
  /** 本次运行传入的流程级输入（开始节点的 `query` 等）。 */
  variables: Record<string, unknown>
}

/**
 * 单个节点的运行输出（R5-2、R5-3、Q21）。
 *
 * 输出的字段必须落在该节点类型声明的 `outputFields` 上（ROADMAP Q21），
 * 否则静态校验通过、运行时却取不到值，两套判定会互相打架。
 */
export interface NodeRunOutput {
  /** 节点 id。 */
  nodeId: string
  /** 产出的字段，键为字段名。 */
  fields: Record<string, unknown>
}

/** Runner 执行期间回报的钩子（R5-1）。 */
export interface RunnerHooks {
  /** 整次运行开始。 */
  onRunStart?: (workflow: Workflow) => void
  /** 整次运行结束（成功、失败或取消都会调用）。 */
  onRunEnd?: (result: RunResult) => void
  /** 某个节点开始执行。 */
  onNodeStart?: (node: Node, input: NodeRunInput) => void
  /** 某个节点执行结束（成功或失败都会调用）。 */
  onNodeEnd?: (node: Node, output: NodeRunOutput | null, error?: RunError) => void
  /** 某个节点被跳过（条件分支未走到）。 */
  onNodeSkip?: (node: Node) => void
}

/** 一次运行的最终结果。 */
export interface RunResult {
  /** 运行是否成功：没有节点失败且未被取消。 */
  ok: boolean
  /** 是否被取消。 */
  cancelled: boolean
  /** 节点 id → 该节点最后一次错误。 */
  errors: Record<string, RunError>
  /** 节点 id → 该节点最后一次输出。 */
  outputs: Record<string, NodeRunOutput>
  /** 整次运行的耗时（毫秒）。 */
  duration: number
}

/**
 * 执行器接口（R5-1、FR-R1）。
 *
 * 宿主可以注入自己的实现（真实后端、插件、代码沙箱）；
 * 编辑器只负责调度、呈现与定位，不关心执行细节。
 */
export interface Runner {
  /** 执行一份工作流文档。 */
  run(
    workflow: Workflow,
    hooks: RunnerHooks,
    signal: AbortSignal,
    context?: RunContext,
  ): Promise<RunResult>
}

/**
 * 运行的上下文（R5-1）。
 *
 * `registry` 让 Runner 能查到节点类型声明的输出字段；
 * `variables` 是流程级输入，会写进开始节点的输出。
 */
export interface RunContext {
  /** 生效的节点类型注册表。 */
  registry: NodeTypeRegistry
  /** 流程级输入。 */
  variables?: Record<string, unknown>
}

/**
 * 单节点执行的输入（R5-8、FR-P5）。
 *
 * 单节点测试复用同一套 Runner 契约，只是只跑一个节点。
 */
export interface NodeTestInput {
  /** 节点 id。 */
  nodeId: string
  /** 节点类型。 */
  type: string | undefined
  /** 节点在文档里的原始数据。 */
  data: Record<string, unknown>
  /** 替换完变量引用后的参数值。 */
  params: Record<string, unknown>
  /** 手填的输入，键为字段名。 */
  inputs: Record<string, unknown>
}

/** 单节点执行的输出。 */
export interface NodeTestOutput {
  /** 是否执行成功。 */
  ok: boolean
  /** 产出的字段。 */
  fields: Record<string, unknown>
  /** 失败时的错误。 */
  error?: RunError | undefined
  /** 耗时（毫秒）。 */
  duration: number
}

/**
 * 单节点执行器（R5-8）。
 *
 * 与 `Runner` 分开导出，是为了让"只跑一个节点"不必伪造一份完整文档。
 */
export interface NodeExecutor {
  /** 执行单个节点。 */
  execute(
    input: NodeTestInput,
    signal: AbortSignal,
    context?: RunContext,
  ): Promise<NodeTestOutput>
}
