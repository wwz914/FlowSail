import type { Edge, EdgeChange, Node, NodeChange } from './types.ts'

/**
 * 应用一批节点变更（FR-D2）。
 * 纯函数：不修改输入数组；未命中的节点保持原引用，方便视图层跳过重渲染。
 */
export function applyNodeChanges(nodes: Node[], changes: NodeChange[]): Node[] {
  let result = nodes

  for (const change of changes) {
    switch (change.type) {
      case 'add':
        result = [...result, change.node]
        break
      case 'remove':
        result = result.filter((node) => node.id !== change.id)
        break
      case 'replace':
        result = result.map((node) => (node.id === change.id ? change.node : node))
        break
      case 'position':
        result = result.map((node) =>
          node.id === change.id ? { ...node, position: change.position } : node,
        )
        break
      case 'select':
        result = result.map((node) =>
          node.id === change.id ? { ...node, selected: change.selected } : node,
        )
        break
    }
  }

  return result
}

/**
 * 应用一批连线变更（FR-D2）。
 * 语义与 applyNodeChanges 一致；连线没有 position 变更。
 */
export function applyEdgeChanges(edges: Edge[], changes: EdgeChange[]): Edge[] {
  let result = edges

  for (const change of changes) {
    switch (change.type) {
      case 'add':
        result = [...result, change.edge]
        break
      case 'remove':
        result = result.filter((edge) => edge.id !== change.id)
        break
      case 'replace':
        result = result.map((edge) => (edge.id === change.id ? change.edge : edge))
        break
      case 'select':
        result = result.map((edge) =>
          edge.id === change.id ? { ...edge, selected: change.selected } : edge,
        )
        break
    }
  }

  return result
}
