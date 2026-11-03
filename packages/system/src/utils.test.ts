import { describe, expect, it } from 'vitest'
import type { Edge, Node } from './types.ts'
import { applyEdgeChanges, applyNodeChanges } from './utils.ts'

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
  { id: 'b', position: { x: 120, y: 0 }, data: { label: 'B' } },
  { id: 'c', position: { x: 240, y: 0 }, data: { label: 'C' } },
]

const edges: Edge[] = [
  { id: 'e-a-b', source: 'a', target: 'b' },
  { id: 'e-b-c', source: 'b', target: 'c' },
]

describe('applyNodeChanges', () => {
  it('按 id 合并变更，未命中的节点保持原引用', () => {
    const result = applyNodeChanges(nodes, [
      { id: 'b', position: { x: 200, y: 80 }, selected: true },
    ])

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(nodes[0])
    expect(result[1]).toMatchObject({
      id: 'b',
      position: { x: 200, y: 80 },
      selected: true,
    })
    expect(result[2]).toBe(nodes[2])
  })

  it('不修改输入数组', () => {
    const snapshot = JSON.parse(JSON.stringify(nodes))

    applyNodeChanges(nodes, [{ id: 'a', position: { x: 10, y: 10 } }])

    expect(nodes).toEqual(snapshot)
    expect(nodes[0].position).toEqual({ x: 0, y: 0 })
  })

  it('忽略未知 id 的变更', () => {
    const result = applyNodeChanges(nodes, [{ id: 'missing', selected: true }])

    expect(result).toEqual(nodes)
    expect(result[0]).toBe(nodes[0])
  })
})

describe('applyEdgeChanges', () => {
  it('按 id 合并变更，未命中的连线保持原引用', () => {
    const result = applyEdgeChanges(edges, [{ id: 'e-b-c', label: 'Connector', selected: true }])

    expect(result).toHaveLength(2)
    expect(result[0]).toBe(edges[0])
    expect(result[1]).toMatchObject({
      id: 'e-b-c',
      source: 'b',
      target: 'c',
      label: 'Connector',
      selected: true,
    })
  })

  it('不修改输入数组', () => {
    const snapshot = JSON.parse(JSON.stringify(edges))

    applyEdgeChanges(edges, [{ id: 'e-a-b', label: 'changed' }])

    expect(edges).toEqual(snapshot)
    expect(edges[0].label).toBeUndefined()
  })
})
