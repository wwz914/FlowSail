import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { Edge, Node } from '@flowsail/core'
import { ReactFlow } from './ReactFlow.tsx'
import { useFlowStore } from './store/index.ts'
import { useRunStore } from './lib/runStore.ts'
import { DEFAULT_VIEWPORT } from './lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 40, y: 60 }, data: { label: 'Start' } },
  { id: 'llm', type: 'llm', position: { x: 40, y: 220 }, data: { label: 'LLM' } },
]

const edges: Edge[] = [
  {
    id: 'e-start-llm',
    source: 'start',
    target: 'llm',
    sourceHandle: 'out',
    targetHandle: 'in',
  },
]

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
  useRunStore.setState({
    status: 'idle',
    nodeStates: {},
    records: {},
    order: [],
    duration: 0,
    error: undefined,
    runningNodeId: null,
  })
}

function getNode(id: string): HTMLElement {
  const node = document.querySelector(`[data-node-id="${id}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`node ${id} not found`)
  return node
}

beforeEach(resetStore)

describe('键盘可达与焦点（R8-3）', () => {
  it('画布、节点与连线都在 Tab 序列里，并有可访问名称', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const canvas = document.querySelector('.react-flow')
    expect(canvas?.getAttribute('tabindex')).toBe('0')
    expect(canvas?.getAttribute('role')).toBe('application')
    expect(canvas?.getAttribute('aria-label')).toBe('工作流画布')

    const node = getNode('llm')
    expect(node.getAttribute('tabindex')).toBe('0')
    expect(node.getAttribute('role')).toBe('button')
    expect(node.getAttribute('aria-label')).toContain('LLM，大模型节点')
    expect(node.getAttribute('aria-label')).toContain('运行状态：未运行')

    const edge = document.querySelector('[data-edge-id="e-start-llm"]')
    expect(edge?.getAttribute('tabindex')).toBe('0')
    expect(edge?.getAttribute('role')).toBe('button')
    expect(edge?.getAttribute('aria-label')).toBe('从 Start 到 LLM 的连线')

    const edgesLayer = document.querySelector('.flow-edges')
    expect(edgesLayer?.getAttribute('aria-label')).toBe('连线')
    expect(edgesLayer?.getAttribute('aria-hidden')).toBeNull()
  })

  it('Tab 顺序按画布 → 连线 → 节点排列', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const tabbable = [...document.querySelectorAll('[tabindex="0"]')]
    expect(tabbable[0]?.classList.contains('react-flow')).toBe(true)
    expect(tabbable[1]?.getAttribute('data-edge-id')).toBe('e-start-llm')
    expect(tabbable.slice(2).map((element) => element.getAttribute('data-node-id'))).toEqual([
      'start',
      'llm',
    ])
  })

  it('Enter / Space 选中节点，方向键按网格步长移动并入历史', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)
    const node = getNode('llm')
    node.focus()
    expect(document.activeElement).toBe(node)

    fireEvent.keyDown(node, { key: 'Enter' })
    expect(
      useFlowStore.getState().workflow.nodes.find((candidate) => candidate.id === 'llm')?.selected,
    ).toBe(true)

    fireEvent.keyDown(node, { key: 'ArrowRight' })
    const moved = useFlowStore
      .getState()
      .workflow.nodes.find((candidate) => candidate.id === 'llm')
    expect(moved?.position).toEqual({ x: 48, y: 220 })
    expect(useFlowStore.getState().past).toHaveLength(1)

    useFlowStore.getState().undo()
    const undone = useFlowStore
      .getState()
      .workflow.nodes.find((candidate) => candidate.id === 'llm')
    expect(undone?.position).toEqual({ x: 40, y: 220 })
  })

  it('Space 也能选中节点，方向键移动整个选中集合', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)
    const start = getNode('start')
    const llm = getNode('llm')

    fireEvent.keyDown(start, { key: ' ' })
    fireEvent.keyDown(llm, { key: ' ', shiftKey: true })
    expect(useFlowStore.getState().workflow.nodes.filter((node) => node.selected)).toHaveLength(2)

    fireEvent.keyDown(llm, { key: 'ArrowDown' })
    const positions = useFlowStore.getState().workflow.nodes.map((node) => node.position)
    expect(positions).toEqual([
      { x: 40, y: 68 },
      { x: 40, y: 228 },
    ])
    expect(useFlowStore.getState().past).toHaveLength(1)
  })

  it('节点聚焦后 Delete 删除节点，连线聚焦后选中并可删除', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    fireEvent.keyDown(getNode('llm'), { key: 'Enter' })
    fireEvent.keyDown(getNode('llm'), { key: 'Delete' })
    expect(useFlowStore.getState().workflow.nodes.map((node) => node.id)).toEqual(['start'])
    expect(useFlowStore.getState().workflow.edges).toHaveLength(0)
    act(() => {
      useFlowStore.getState().undo()
    })

    const edge = document.querySelector('[data-edge-id="e-start-llm"]')
    if (!(edge instanceof Element)) throw new Error('edge not found')
    fireEvent.keyDown(edge, { key: 'Enter' })
    expect(useFlowStore.getState().workflow.edges[0]?.selected).toBe(true)
    expect(edge.getAttribute('aria-pressed')).toBe('true')
    expect(edge.getAttribute('aria-label')).toBe('从 Start 到 LLM 的连线，已选中')

    fireEvent.keyDown(edge, { key: 'Delete' })
    expect(useFlowStore.getState().workflow.edges).toHaveLength(0)
  })

  it('运行状态同时用文字与 aria 传达，不只靠颜色', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)
    act(() => {
      useRunStore.setState({ nodeStates: { llm: 'success' } })
    })

    const node = getNode('llm')
    expect(node.getAttribute('aria-label')).toContain('运行状态：成功')
    expect(node.querySelector('.flow-node__run-badge')?.textContent).toBe('成功')
  })
})
