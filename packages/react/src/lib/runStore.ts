import { create } from 'zustand'
import type { Node } from '@system'
import type { NodeTypeRegistry } from './registry.ts'
import type {
  NodeRunState,
  RunError,
  RunResult,
  Runner,
} from './runner.ts'

/**
 * 一个节点的运行记录（R5-6、FR-R3）。
 *
 * 画布上的节点状态与这里的记录**来自同一份数据**（R5-6），
 * 因此不会出现"画布显示成功、记录显示失败"的漂移。
 */
export interface NodeRunRecord {
  /** 节点 id。 */
  nodeId: string
  /** 节点在文档里的显示名。 */
  label: string
  /** 节点类型。 */
  type: string | undefined
  /** 节点类型名（注册表给的）。 */
  typeLabel: string
  /** 节点状态。 */
  state: NodeRunState
  /** 耗时（毫秒）。 */
  duration: number
  /** 运行输入（已替换变量）。 */
  input?: Record<string, unknown> | undefined
  /** 运行输出。 */
  output?: Record<string, unknown> | undefined
  /** 失败时的错误。 */
  error?: RunError | undefined
}

/** 整次运行的状态。 */
export type RunStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

/** 运行态（视图态，ROADMAP Q20：不写回 `Workflow` 文档、不进历史栈）。 */
export interface RunState {
  /** 整次运行的状态。 */
  status: RunStatus
  /** 节点 id → 运行态。 */
  nodeStates: Record<string, NodeRunState>
  /** 节点 id → 运行记录。 */
  records: Record<string, NodeRunRecord>
  /** 记录的执行顺序（按运行先后）。 */
  order: string[]
  /** 整次运行的耗时（毫秒）。 */
  duration: number
  /** 整次运行的错误（没有具体节点归属时）。 */
  error?: RunError | undefined
  /** 当前正在运行的节点 id。 */
  runningNodeId: string | null
}

export interface RunStore extends RunState {
  /**
   * 生效的节点类型注册表（R5-1）。
   *
   * Runner 需要它来查节点类型声明的输出字段；控制器是模块级函数，
   * 拿不到 React 上下文，因此由画布在渲染时同步进来。
   */
  registry: NodeTypeRegistry | null
  /** 同步注册表快照。 */
  setRegistry: (registry: NodeTypeRegistry) => void
  /** 开始一次运行：清空上一轮的状态。 */
  startRun: () => void
  /** 节点开始执行。 */
  markNodeRunning: (node: Node, label: string, typeLabel: string) => void
  /** 节点执行成功。 */
  markNodeSuccess: (
    node: Node,
    label: string,
    typeLabel: string,
    detail: { duration: number; input?: Record<string, unknown>; output?: Record<string, unknown> },
  ) => void
  /** 节点执行失败。 */
  markNodeError: (
    node: Node,
    label: string,
    typeLabel: string,
    detail: { duration: number; input?: Record<string, unknown>; error: RunError },
  ) => void
  /** 节点被跳过。 */
  markNodeSkipped: (node: Node, label: string, typeLabel: string) => void
  /** 整次运行结束。 */
  finishRun: (result: RunResult) => void
  /** 清空运行态（回到 idle）。 */
  resetRun: () => void
}

const initialRunState: RunState = {
  status: 'idle',
  nodeStates: {},
  records: {},
  order: [],
  duration: 0,
  error: undefined,
  runningNodeId: null,
}

/**
 * 运行态存储（R5-5、R5-6）。
 *
 * 单独于 `useFlowStore`：`Workflow` 描述的是**流程定义**，
 * 而运行态与运行记录是**执行实例**，两者生命周期不同（ROADMAP Q20）。
 */
export const useRunStore = create<RunStore>((set) => ({
  ...initialRunState,

  registry: null,

  setRegistry: (registry) => set({ registry }),

  startRun: () => set({ ...initialRunState, status: 'running' }),

  markNodeRunning: (node, label, typeLabel) =>
    set((state) => ({
      runningNodeId: node.id,
      nodeStates: { ...state.nodeStates, [node.id]: 'running' },
      records: {
        ...state.records,
        [node.id]: {
          nodeId: node.id,
          label,
          type: node.type,
          typeLabel,
          state: 'running',
          duration: 0,
        },
      },
      order: state.order.includes(node.id) ? state.order : [...state.order, node.id],
    })),

  markNodeSuccess: (node, label, typeLabel, detail) =>
    set((state) => ({
      runningNodeId: state.runningNodeId === node.id ? null : state.runningNodeId,
      nodeStates: { ...state.nodeStates, [node.id]: 'success' },
      records: {
        ...state.records,
        [node.id]: {
          nodeId: node.id,
          label,
          type: node.type,
          typeLabel,
          state: 'success',
          duration: detail.duration,
          input: detail.input,
          output: detail.output,
        },
      },
      order: state.order.includes(node.id) ? state.order : [...state.order, node.id],
    })),

  markNodeError: (node, label, typeLabel, detail) =>
    set((state) => ({
      runningNodeId: state.runningNodeId === node.id ? null : state.runningNodeId,
      nodeStates: { ...state.nodeStates, [node.id]: 'error' },
      records: {
        ...state.records,
        [node.id]: {
          nodeId: node.id,
          label,
          type: node.type,
          typeLabel,
          state: 'error',
          duration: detail.duration,
          input: detail.input,
          error: detail.error,
        },
      },
      order: state.order.includes(node.id) ? state.order : [...state.order, node.id],
    })),

  markNodeSkipped: (node, label, typeLabel) =>
    set((state) => ({
      nodeStates: { ...state.nodeStates, [node.id]: 'skipped' },
      records: {
        ...state.records,
        [node.id]: {
          nodeId: node.id,
          label,
          type: node.type,
          typeLabel,
          state: 'skipped',
          duration: 0,
        },
      },
      order: state.order.includes(node.id) ? state.order : [...state.order, node.id],
    })),

  finishRun: (result) =>
    set((state) => {
      const status: RunStatus = result.cancelled
        ? 'cancelled'
        : result.ok
          ? 'success'
          : 'error'

      // 仍在 running 的节点在结束时归位：成功记为 success，取消记为 skipped。
      const nodeStates = { ...state.nodeStates }
      const records = { ...state.records }

      for (const [nodeId, nodeState] of Object.entries(nodeStates)) {
        if (nodeState !== 'running') continue
        if (result.cancelled) {
          nodeStates[nodeId] = 'skipped'
          const record = records[nodeId]
          if (record) records[nodeId] = { ...record, state: 'skipped' }
        } else {
          nodeStates[nodeId] = 'success'
          const record = records[nodeId]
          if (record) records[nodeId] = { ...record, state: 'success' }
        }
      }

      const firstError = Object.values(result.errors)[0]

      return {
        status,
        nodeStates,
        records,
        duration: result.duration,
        error: firstError,
        runningNodeId: null,
      }
    }),

  resetRun: () => set({ ...initialRunState }),
}))

/**
 * 某节点当前的运行态（R5-5）。
 *
 * 没有记录时是 `idle`。
 */
export function getNodeRunState(state: RunState, nodeId: string): NodeRunState {
  return state.nodeStates[nodeId] ?? 'idle'
}

/** 整次运行是否正在进行（R5-4：运行中禁止编辑）。 */
export function isRunning(status: RunStatus): boolean {
  return status === 'running'
}

/**
 * 当前生效的 Runner（R5-1）。
 *
 * 宿主没有注入时用内置 Mock Runner，保证示例开箱可跑。
 */
let activeRunner: Runner | null = null

/**
 * 默认 Mock Runner 的单节点延迟（R5-2）。
 *
 * 有一小段延迟才能看清节点依次进入 `running`；设为 0 则瞬间跑完。
 */
let defaultNodeDelay = 0

/** 宿主注入自定义 Runner（R5-1、FR-R1）。 */
export function setRunner(runner: Runner | null): void {
  activeRunner = runner
}

/** 当前生效的 Runner；未注入时为 null（调用方回落到 Mock Runner）。 */
export function getRunner(): Runner | null {
  return activeRunner
}

/**
 * 配置默认 Mock Runner 的单节点延迟（R5-2）。
 *
 * 宿主想要"看得见的运行过程"时调大它。
 */
export function setDefaultNodeDelay(ms: number): void {
  defaultNodeDelay = Math.max(0, ms)
}

/** 默认 Mock Runner 的单节点延迟。 */
export function getDefaultNodeDelay(): number {
  return defaultNodeDelay
}
