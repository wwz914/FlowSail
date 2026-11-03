import type { Edge, Node, Viewport, Workflow } from '@system'
import { create } from 'zustand'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

/** 撤销栈容量（FR-D4，默认 50）。 */
export const HISTORY_LIMIT = 50

export type NodesUpdater = Node[] | ((nodes: Node[]) => Node[])
export type EdgesUpdater = Edge[] | ((edges: Edge[]) => Edge[])
export type ViewportUpdater = Viewport | ((viewport: Viewport) => Viewport)
export type WorkflowUpdater = Workflow | ((workflow: Workflow) => Workflow)

/** 当前选中的节点与连线；节点和连线共用 `selected` 字段（R2-2）。 */
export interface SelectionState {
  nodes: Node[]
  edges: Edge[]
}

export interface FlowState {
  /** 唯一事实源：节点、连线与视口都在这一份文档快照里（R2-1）。 */
  workflow: Workflow
  /** 撤销栈：保存编辑前的整份文档快照，最新一条在末尾。 */
  past: Workflow[]
  /** 重做栈：最新一条在开头。 */
  future: Workflow[]
  /** 写入文档但不进历史栈（拖拽过程、宿主同步、视口变化）。 */
  setWorkflow: (workflow: WorkflowUpdater) => void
  setNodes: (nodes: NodesUpdater) => void
  setEdges: (edges: EdgesUpdater) => void
  setViewport: (viewport: ViewportUpdater) => void
  /** 新建节点：入历史栈，并让新节点成为唯一选中项。 */
  addNode: (node: Node) => void
  /** 新建连线：入历史栈。 */
  addEdge: (edge: Edge) => void
  /** 选中节点；`additive` 为 Shift 追加/取消。 */
  selectNode: (id: string, additive?: boolean) => void
  /** 选中连线；`additive` 为 Shift 追加/取消。 */
  selectEdge: (id: string, additive?: boolean) => void
  clearSelection: () => void
  /** 删除选中的节点及其关联连线，以及单独选中的连线；入历史栈。 */
  deleteSelection: () => boolean
  /**
   * 更新节点的 `data`（R3-6）。
   * `history` 为 false 时只写文档不入栈（连续输入过程）；
   * 为 true 时把编辑前的快照压入历史栈，形成一条可撤销记录（R3-7）。
   */
  updateNodeData: (id: string, data: Record<string, unknown>, history?: boolean) => void
  /** 修改连线标签（R3-4）；`history` 为 false 时只写文档不入栈。 */
  setEdgeLabel: (id: string, label: string, history?: boolean) => void
  /** 把指定快照（默认当前文档）压入撤销栈；用于拖拽结束后一次性记录（R2-4）。 */
  pushHistory: (snapshot?: Workflow) => void
  undo: () => boolean
  redo: () => boolean
  /** 宿主替换初始文档时清空历史，避免撤销回上一份文档。 */
  resetHistory: () => void
}

function resolve<T>(value: T | ((current: T) => T), current: T): T {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value
}

/** 历史条目只比较节点与连线：视口变化不入栈（PRD Q3）。 */
export function getSelection(workflow: Workflow): SelectionState {
  return {
    nodes: workflow.nodes.filter((node) => node.selected),
    edges: workflow.edges.filter((edge) => edge.selected),
  }
}

/** 选择集的稳定标识，用于避免拖拽等无关更新触发 onSelectionChange。 */
export function getSelectionKey(workflow: Workflow): string {
  const nodeIds = workflow.nodes.filter((node) => node.selected).map((node) => node.id)
  const edgeIds = workflow.edges.filter((edge) => edge.selected).map((edge) => edge.id)
  return JSON.stringify([nodeIds, edgeIds])
}

function createInitialWorkflow(): Workflow {
  return { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } }
}

/** 用新文档替换当前文档，并把旧文档压入撤销栈。 */
function commit(state: FlowState, workflow: Workflow) {
  return {
    workflow,
    past: [...state.past, state.workflow].slice(-HISTORY_LIMIT),
    future: [],
  }
}

export const useFlowStore = create<FlowState>((set, get) => ({
  workflow: createInitialWorkflow(),
  past: [],
  future: [],

  setWorkflow: (workflowOrUpdater) =>
    set((state) => ({
      workflow: resolve(workflowOrUpdater, state.workflow),
    })),

  setNodes: (nodesOrUpdater) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: resolve(nodesOrUpdater, state.workflow.nodes),
      },
    })),

  setEdges: (edgesOrUpdater) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        edges: resolve(edgesOrUpdater, state.workflow.edges),
      },
    })),

  setViewport: (viewportOrUpdater) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        viewport: resolve(viewportOrUpdater, state.workflow.viewport),
      },
    })),

  addNode: (node) =>
    set((state) => {
      const nodes = state.workflow.nodes.map((current) =>
        current.selected ? { ...current, selected: false } : current,
      )
      return commit(state, {
        ...state.workflow,
        nodes: [...nodes, { ...node, selected: true }],
      })
    }),

  addEdge: (edge) =>
    set((state) =>
      commit(state, {
        ...state.workflow,
        edges: [...state.workflow.edges, edge],
      }),
    ),

  selectNode: (id, additive = false) =>
    set((state) => {
      const { nodes, edges } = state.workflow

      if (additive) {
        return {
          workflow: {
            ...state.workflow,
            nodes: nodes.map((node) =>
              node.id === id ? { ...node, selected: !node.selected } : node,
            ),
          },
        }
      }

      return {
        workflow: {
          ...state.workflow,
          nodes: nodes.map((node) => {
            const selected = node.id === id
            return node.selected === selected ? node : { ...node, selected }
          }),
          edges: edges.some((edge) => edge.selected)
            ? edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
            : edges,
        },
      }
    }),

  selectEdge: (id, additive = false) =>
    set((state) => {
      const { nodes, edges } = state.workflow

      if (additive) {
        return {
          workflow: {
            ...state.workflow,
            edges: edges.map((edge) =>
              edge.id === id ? { ...edge, selected: !edge.selected } : edge,
            ),
          },
        }
      }

      return {
        workflow: {
          ...state.workflow,
          nodes: nodes.some((node) => node.selected)
            ? nodes.map((node) => (node.selected ? { ...node, selected: false } : node))
            : nodes,
          edges: edges.map((edge) => {
            const selected = edge.id === id
            return edge.selected === selected ? edge : { ...edge, selected }
          }),
        },
      }
    }),

  clearSelection: () =>
    set((state) => {
      const { nodes, edges } = state.workflow
      if (!nodes.some((node) => node.selected) && !edges.some((edge) => edge.selected)) {
        return {}
      }

      return {
        workflow: {
          ...state.workflow,
          nodes: nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
          edges: edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        },
      }
    }),

  deleteSelection: () => {
    const state = get()
    const { nodes, edges } = state.workflow
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    )
    const hasSelectedEdges = edges.some((edge) => edge.selected)
    if (selectedNodeIds.size === 0 && !hasSelectedEdges) return false

    const nextNodes = nodes.filter((node) => !node.selected)
    const nextEdges = edges.filter(
      (edge) => !edge.selected && !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target),
    )

    set(
      commit(state, {
        ...state.workflow,
        nodes: nextNodes,
        edges: nextEdges,
      }),
    )
    return true
  },

  updateNodeData: (id, data, history = true) =>
    set((state) => {
      const target = state.workflow.nodes.find((node) => node.id === id)
      if (!target) return {}

      const nextNodes = state.workflow.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
      )
      const nextWorkflow: Workflow = { ...state.workflow, nodes: nextNodes }

      // 连续输入过程先不入栈，等一次编辑结束时再压一条快照（R3-7）。
      if (!history) return { workflow: nextWorkflow }
      return commit(state, nextWorkflow)
    }),

  setEdgeLabel: (id, label, history = true) =>
    set((state) => {
      const target = state.workflow.edges.find((edge) => edge.id === id)
      if (!target) return {}

      const nextEdges = state.workflow.edges.map((edge) =>
        edge.id === id ? { ...edge, label } : edge,
      )
      const nextWorkflow: Workflow = { ...state.workflow, edges: nextEdges }

      // 与参数写回同一套合并机制（R3-7）。
      if (!history) return { workflow: nextWorkflow }
      return commit(state, nextWorkflow)
    }),

  pushHistory: (snapshot) =>
    set((state) => ({
      past: [...state.past, snapshot ?? state.workflow].slice(-HISTORY_LIMIT),
      future: [],
    })),
  undo: () => {
    const state = get()
    const previous = state.past[state.past.length - 1]
    if (!previous) return false

    // 视口变化不入历史（PRD Q3）：撤销只还原节点与连线，保留当前视口。
    set({
      workflow: { ...previous, viewport: state.workflow.viewport },
      past: state.past.slice(0, -1),
      future: [state.workflow, ...state.future].slice(0, HISTORY_LIMIT),
    })
    return true
  },

  redo: () => {
    const state = get()
    const next = state.future[0]
    if (!next) return false

    set({
      workflow: { ...next, viewport: state.workflow.viewport },
      past: [...state.past, state.workflow].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
    })
    return true
  },

  resetHistory: () =>
    set((state) =>
      state.past.length === 0 && state.future.length === 0 ? {} : { past: [], future: [] },
    ),
}))
