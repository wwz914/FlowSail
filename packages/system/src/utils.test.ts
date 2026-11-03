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
  it('add 追加节点并保留已有引用', () => {
    const added: Node = { id: 'd', position: { x: 360, y: 0 } }
    const result = applyNodeChanges(nodes, [{ type: 'add', node: added }])

    expect(result).toHaveLength(4)
    expect(result.slice(0, 3)).toEqual(nodes)
    expect(result[3]).toBe(added)
  })

  it('remove 按 id 删除节点', () => {
    const result = applyNodeChanges(nodes, [{ type: 'remove', id: 'b' }])

    expect(result.map((node) => node.id)).toEqual(['a', 'c'])
    expect(result[0]).toBe(nodes[0])
    expect(result[1]).toBe(nodes[2])
  })

  it('replace 整体替换节点', () => {
    const replacement: Node = { id: 'b', position: { x: 5, y: 5 }, selected: true }
    const result = applyNodeChanges(nodes, [{ type: 'replace', id: 'b', node: replacement }])

    expect(result[1]).toBe(replacement)
    expect(result[0]).toBe(nodes[0])
  })

  it('position 只更新位置', () => {
    const result = applyNodeChanges(nodes, [
      { type: 'position', id: 'b', position: { x: 200, y: 80 } },
    ])

    expect(result[1]).toMatchObject({ id: 'b', position: { x: 200, y: 80 } })
    expect(result[1]?.data).toBe(nodes[1]?.data)
    expect(result[0]).toBe(nodes[0])
    expect(result[2]).toBe(nodes[2])
  })

  it('select 只更新选中态', () => {
    const result = applyNodeChanges(nodes, [{ type: 'select', id: 'a', selected: true }])

    expect(result[0]).toMatchObject({ id: 'a', selected: true, position: { x: 0, y: 0 } })
    expect(result[1]).toBe(nodes[1])
  })

  it('按顺序应用多条变更', () => {
    const result = applyNodeChanges(nodes, [
      { type: 'add', node: { id: 'd', position: { x: 360, y: 0 } } },
      { type: 'select', id: 'd', selected: true },
      { type: 'remove', id: 'a' },
    ])

    expect(result.map((node) => node.id)).toEqual(['b', 'c', 'd'])
    expect(result[2]?.selected).toBe(true)
  })

  it('不修改输入数组', () => {
    const snapshot = JSON.parse(JSON.stringify(nodes))

    applyNodeChanges(nodes, [
      { type: 'position', id: 'a', position: { x: 10, y: 10 } },
      { type: 'remove', id: 'b' },
    ])

    expect(nodes).toEqual(snapshot)
    expect(nodes[0]?.position).toEqual({ x: 0, y: 0 })
  })

  it('忽略未知 id 的变更', () => {
    const result = applyNodeChanges(nodes, [{ type: 'select', id: 'missing', selected: true }])

    expect(result).toEqual(nodes)
    expect(result[0]).toBe(nodes[0])
  })
})

describe('applyEdgeChanges', () => {
  it('add 追加连线', () => {
    const added: Edge = { id: 'e-c-a', source: 'c', target: 'a' }
    const result = applyEdgeChanges(edges, [{ type: 'add', edge: added }])

    expect(result).toHaveLength(3)
    expect(result[2]).toBe(added)
  })

  it('remove 按 id 删除连线', () => {
    const result = applyEdgeChanges(edges, [{ type: 'remove', id: 'e-a-b' }])

    expect(result.map((edge) => edge.id)).toEqual(['e-b-c'])
    expect(result[0]).toBe(edges[1])
  })

  it('replace 整体替换连线', () => {
    const replacement: Edge = { id: 'e-a-b', source: 'a', target: 'c', label: 'Connector' }
    const result = applyEdgeChanges(edges, [
      { type: 'replace', id: 'e-a-b', edge: replacement },
    ])

    expect(result[0]).toBe(replacement)
    expect(result[1]).toBe(edges[1])
  })

  it('select 只更新选中态', () => {
    const result = applyEdgeChanges(edges, [{ type: 'select', id: 'e-b-c', selected: true }])

    expect(result[1]).toMatchObject({ id: 'e-b-c', selected: true })
    expect(result[1]?.source).toBe('b')
    expect(result[0]).toBe(edges[0])
  })

  it('不修改输入数组', () => {
    const snapshot = JSON.parse(JSON.stringify(edges))

    applyEdgeChanges(edges, [
      { type: 'select', id: 'e-a-b', selected: true },
      { type: 'remove', id: 'e-b-c' },
    ])

    expect(edges).toEqual(snapshot)
    expect(edges[0]?.selected).toBeUndefined()
  })
})
