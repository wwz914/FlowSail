import type { Node, Edge } from './types.ts'

// 节点变更应用
export function applyNodeChanges(nodes: Node[], changes: Partial<Node>[]): Node[] {
  return nodes.map(node => {
    const change = changes.find(c => c.id === node.id);
    return change ? { ...node, ...change } : node;
  })
}

// 边变更应用
export function applyEdgeChanges(edges: Edge[], changes: Partial<Edge>[]): Edge[] {
  return edges.map(edge => {
    const change = changes.find(c => c.id === edge.id);
    return change ? { ...edge, ...change } : edge;
  })
}