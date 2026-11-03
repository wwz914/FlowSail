import { beforeEach, describe, expect, it } from 'vitest'
import type { Node } from '@system'
import { HISTORY_LIMIT, useFlowStore } from './index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
}

const nodeA: Node = { id: 'a', position: { x: 0, y: 0 } }
const nodeB: Node = { id: 'b', position: { x: 100, y: 0 } }
const nodeC: Node = { id: 'c', position: { x: 200, y: 0 } }

beforeEach(resetStore)

describe('选择', () => {
  it('单选节点会清除其他节点与连线的选中态', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [nodeA, { ...nodeB, selected: true }],
        edges: [{ id: 'e-a-b', source: 'a', target: 'b', selected: true }],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    useFlowStore.getState().selectNode('a')

    const { nodes, edges } = useFlowStore.getState().workflow
    expect(nodes[0]?.selected).toBe(true)
    expect(nodes[1]?.selected).toBe(false)
    expect(edges[0]?.selected).toBe(false)
  })

  it('Shift 追加与取消选择', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodeA, nodeB], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    useFlowStore.getState().selectNode('a')
    useFlowStore.getState().selectNode('b', true)
    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      true,
    ])

    useFlowStore.getState().selectNode('a', true)
    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      false,
      true,
    ])
  })

  it('选中连线会清除节点选择，clearSelection 清空全部', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [{ ...nodeA, selected: true }, nodeB],
        edges: [{ id: 'e-a-b', source: 'a', target: 'b' }],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    useFlowStore.getState().selectEdge('e-a-b')
    expect(useFlowStore.getState().workflow.nodes[0]?.selected).toBe(false)
    expect(useFlowStore.getState().workflow.edges[0]?.selected).toBe(true)

    useFlowStore.getState().clearSelection()
    expect(useFlowStore.getState().workflow.edges[0]?.selected).toBe(false)
  })
})

describe('删除', () => {
  it('删除选中节点时一并删除关联连线，且只入栈一条历史', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [{ ...nodeA, selected: true }, nodeB, nodeC],
        edges: [
          { id: 'e-a-b', source: 'a', target: 'b' },
          { id: 'e-b-c', source: 'b', target: 'c' },
        ],
        viewport: { ...DEFAULT_VIEWPORT },
      },
      past: [],
    })

    expect(useFlowStore.getState().deleteSelection()).toBe(true)

    const { nodes, edges } = useFlowStore.getState().workflow
    expect(nodes.map((node) => node.id)).toEqual(['b', 'c'])
    expect(edges.map((edge) => edge.id)).toEqual(['e-b-c'])
    expect(useFlowStore.getState().past).toHaveLength(1)
  })

  it('连线可单独选中删除，节点保留', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [nodeA, nodeB],
        edges: [{ id: 'e-a-b', source: 'a', target: 'b', selected: true }],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    expect(useFlowStore.getState().deleteSelection()).toBe(true)
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)
    expect(useFlowStore.getState().workflow.edges).toEqual([])
  })

  it('没有选中项时返回 false 且不写历史', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodeA], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
      past: [],
    })

    expect(useFlowStore.getState().deleteSelection()).toBe(false)
    expect(useFlowStore.getState().past).toHaveLength(0)
  })
})

describe('历史栈', () => {
  it('初始态不可撤销、不可重做', () => {
    expect(useFlowStore.getState().undo()).toBe(false)
    expect(useFlowStore.getState().redo()).toBe(false)
  })

  it('新建节点可撤销、可重做', () => {
    useFlowStore.getState().addNode(nodeA)
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
    expect(useFlowStore.getState().workflow.nodes[0]?.selected).toBe(true)

    expect(useFlowStore.getState().undo()).toBe(true)
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(0)

    expect(useFlowStore.getState().redo()).toBe(true)
    expect(useFlowStore.getState().workflow.nodes[0]?.id).toBe('a')
  })

  it('一次拖拽只产生一条历史，撤销回到拖拽前', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodeA], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const before = useFlowStore.getState().workflow

    // 拖拽过程：直接写文档，不入栈。
    useFlowStore.getState().setNodes([{ ...nodeA, position: { x: 50, y: 40 } }])
    useFlowStore.getState().setNodes([{ ...nodeA, position: { x: 90, y: 80 } }])
    expect(useFlowStore.getState().past).toHaveLength(0)

    // 松手：把拖拽前快照压栈一次（R2-4）。
    useFlowStore.getState().pushHistory(before)
    expect(useFlowStore.getState().past).toHaveLength(1)

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 0, y: 0 })
  })

  it('撤销后新的编辑会清空重做栈', () => {
    useFlowStore.getState().addNode(nodeA)
    useFlowStore.getState().undo()
    expect(useFlowStore.getState().future).toHaveLength(1)

    useFlowStore.getState().addNode(nodeB)
    expect(useFlowStore.getState().future).toHaveLength(0)
  })

  it('撤销不还原视口（PRD Q3）', () => {
    useFlowStore.getState().addNode(nodeA)
    useFlowStore.getState().setViewport({ x: 10, y: 20, zoom: 2 })

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.viewport).toEqual({ x: 10, y: 20, zoom: 2 })
  })

  it('容量上限为 50', () => {
    const workflow = { nodes: [nodeA], edges: [], viewport: { ...DEFAULT_VIEWPORT } }
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      useFlowStore.getState().pushHistory({
        ...workflow,
        nodes: [{ ...nodeA, position: { x: index, y: 0 } }],
      })
    }

    expect(useFlowStore.getState().past).toHaveLength(HISTORY_LIMIT)
  })
})
