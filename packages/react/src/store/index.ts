import type { Edge, Node } from '@system'
import { create } from 'zustand'
import { DEFAULT_VIEWPORT, type Viewport } from '../lib/viewport.ts'

export type NodesUpdater = Node[] | ((nodes: Node[]) => Node[])
export type EdgesUpdater = Edge[] | ((edges: Edge[]) => Edge[])
export type ViewportUpdater = Viewport | ((viewport: Viewport) => Viewport)

export interface FlowState {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
  /** 与 React 的 setState 一致：接受新数组或基于当前值的更新函数（G-2）。 */
  setNodes: (nodes: NodesUpdater) => void
  setEdges: (edges: EdgesUpdater) => void
  setViewport: (viewport: ViewportUpdater) => void
}

export const useFlowStore = create<FlowState>((set) => ({
  nodes: [],
  edges: [],
  viewport: { ...DEFAULT_VIEWPORT },
  setNodes: (nodesOrUpdater) =>
    set((state) => ({
      nodes:
        typeof nodesOrUpdater === 'function'
          ? nodesOrUpdater(state.nodes)
          : nodesOrUpdater,
    })),
  setEdges: (edgesOrUpdater) =>
    set((state) => ({
      edges:
        typeof edgesOrUpdater === 'function'
          ? edgesOrUpdater(state.edges)
          : edgesOrUpdater,
    })),
  setViewport: (viewportOrUpdater) =>
    set((state) => ({
      viewport:
        typeof viewportOrUpdater === 'function'
          ? viewportOrUpdater(state.viewport)
          : viewportOrUpdater,
    })),
}))
