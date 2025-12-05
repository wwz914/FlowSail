import type { Node, Edge } from '@system'
import { create } from 'zustand'

interface FlowState {
  nodes: Node[]
  edges: Edge[]
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
}

export const useFlowStore = create<FlowState>(set => ({
  nodes: [],
  edges: [],
  setNodes: (nodes: Node[]) => set({ nodes }),
  setEdges: (edges: Edge[]) => set({ edges }),
}))