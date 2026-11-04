import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@flowsail/core'
import {
  PASTE_OFFSET,
  collectClipboard,
  createUniqueId,
  isClipboardEmpty,
  pasteClipboard,
  renameNode,
} from './clipboard.ts'

function node(id: string, x: number, y: number, selected = false): Node {
  return { id, type: 'start', position: { x, y }, data: { label: id }, ...(selected ? { selected } : {}) }
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

describe('复制 / 粘贴（R6-2）', () => {
  it('collectClipboard 只取选中的节点与两端都选中的连线', () => {
    const nodes = [node('a', 0, 0, true), node('b', 100, 0, true), node('c', 200, 0)]
    const edges = [
      edge('ab', 'a', 'b'), // 两端都选中 → 复制
      edge('bc', 'b', 'c'), // 一端未选中 → 不复制
    ]

    const content = collectClipboard(nodes, edges)

    expect(content.nodes.map((item) => item.id)).toEqual(['a', 'b'])
    expect(content.edges.map((item) => item.id)).toEqual(['ab'])
  })

  it('没有选中任何节点时剪贴板为空', () => {
    expect(isClipboardEmpty(collectClipboard([node('a', 0, 0)], []))).toBe(true)
    expect(isClipboardEmpty(null)).toBe(true)
  })

  it('pasteClipboard 生成不冲突的新 id 并带偏移', () => {
    const existingNodes = [node('a', 0, 0), node('b', 100, 0)]
    const content = collectClipboard(
      [node('a', 0, 0, true), node('b', 100, 0, true)],
      [edge('ab', 'a', 'b')],
    )

    const result = pasteClipboard(content, existingNodes, [], { withEdges: true })

    // 新 id 不与文档里已有的冲突。
    const existingIds = new Set(existingNodes.map((item) => item.id))
    for (const pasted of result.nodes) {
      expect(existingIds.has(pasted.id)).toBe(false)
    }
    // 位置带偏移，避免完全重叠。
    expect(result.nodes[0]?.position).toEqual({ x: PASTE_OFFSET, y: PASTE_OFFSET })
    // 粘贴出来的节点是选中项。
    expect(result.nodes.every((item) => item.selected)).toBe(true)
  })

  it('粘贴时连线的 source / target 被改写成新 id', () => {
    const content = collectClipboard(
      [node('a', 0, 0, true), node('b', 100, 0, true)],
      [edge('ab', 'a', 'b')],
    )
    const result = pasteClipboard(content, [], [], { withEdges: true })

    const pastedEdge = result.edges[0]!
    const pastedIds = new Set(result.nodes.map((item) => item.id))
    expect(pastedIds.has(pastedEdge.source)).toBe(true)
    expect(pastedIds.has(pastedEdge.target)).toBe(true)
    // 映射关系与 idMap 一致。
    expect(pastedEdge.source).toBe(result.idMap['a'])
    expect(pastedEdge.target).toBe(result.idMap['b'])
  })

  it('默认不粘贴连线（Q24），withEdges 为真时才连', () => {
    const content = collectClipboard(
      [node('a', 0, 0, true), node('b', 100, 0, true)],
      [edge('ab', 'a', 'b')],
    )

    expect(pasteClipboard(content, [], []).edges).toHaveLength(0)
    expect(pasteClipboard(content, [], [], { withEdges: true }).edges).toHaveLength(1)
  })

  it('连线 id 不与现有连线冲突', () => {
    const content = collectClipboard(
      [node('a', 0, 0, true), node('b', 100, 0, true)],
      [edge('ab', 'a', 'b')],
    )
    // 预先占用几个可能的 id。
    const existingEdges = [edge('edge-copy-1', 'x', 'y'), edge('edge-copy-2', 'x', 'y')]
    const result = pasteClipboard(content, [], existingEdges, { withEdges: true })

    const taken = new Set(existingEdges.map((item) => item.id))
    expect(taken.has(result.edges[0]!.id)).toBe(false)
  })

  it('createUniqueId 跳过已被占用的编号', () => {
    expect(createUniqueId('copy', ['copy-1', 'copy-2'], 1)).toBe('copy-3')
    expect(createUniqueId('copy', [], 1)).toBe('copy-1')
  })

  it('空剪贴板粘贴得到空结果', () => {
    const result = pasteClipboard({ nodes: [], edges: [] }, [], [])
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})

describe('节点重命名（R6-3）', () => {
  it('写入 data.label，保留其余参数', () => {
    const renamed = renameNode(
      { id: 'a', type: 'llm', position: { x: 0, y: 0 }, data: { label: '旧名', prompt: 'hi' } },
      '新名',
    )
    expect(renamed.data).toEqual({ label: '新名', prompt: 'hi' })
    // 原节点不变（纯函数）。
    expect(renamed).not.toBe(undefined)
  })

  it('没有 data 时新建一个', () => {
    const renamed = renameNode({ id: 'a', position: { x: 0, y: 0 } }, '名字')
    expect(renamed.data).toEqual({ label: '名字' })
  })
})

describe('粘贴 id 唯一性（回归）', () => {
  it('同一批粘贴里多个节点不会拿到相同 id', () => {
    const content = collectClipboard(
      [node('a', 0, 0, true), node('b', 10, 0, true), node('c', 20, 0, true)],
      [],
    )
    // 文档里已经占用了 copy-1 / copy-2，逼迫新 id 从小序列往后找。
    const existing = [node('copy-1', 0, 0), node('copy-2', 0, 0)]
    const result = pasteClipboard(content, existing, [])

    const ids = result.nodes.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['copy-3', 'copy-4', 'copy-5'])
  })

  it('同一批粘贴里多个连线不会拿到相同 id', () => {
    const content: { nodes: Node[]; edges: Edge[] } = {
      nodes: [node('a', 0, 0, true), node('b', 10, 0, true), node('c', 20, 0, true)],
      edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')],
    }
    const existingEdges = [edge('edge-copy-1', 'x', 'y')]
    const result = pasteClipboard(content, [], existingEdges, { withEdges: true })

    const ids = result.edges.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
