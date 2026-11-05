import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Edge, Node } from '@flowsail/core'
import { ReactFlow } from './ReactFlow.tsx'
import { useFlowStore } from './store/index.ts'
import { setClipboardContent } from './lib/clipboard.ts'
import { DEFAULT_VIEWPORT } from './lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 40, y: 60 }, data: { label: 'Start' } },
  { id: 'llm', type: 'llm', position: { x: 40, y: 220 }, data: { label: 'LLM' } },
  { id: 'end', type: 'end', position: { x: 300, y: 220 }, data: { label: 'End' } },
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
  setClipboardContent(null)
}

function getNode(id: string): HTMLElement {
  const node = document.querySelector(`[data-node-id="${id}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`node ${id} not found`)
  return node
}

function clickNode(id: string) {
  const node = getNode(id)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
}

beforeEach(resetStore)

describe('全选（R8-4、FR-U3）', () => {
  it('Ctrl/Cmd+A 选中所有节点与连线，且不进入历史栈', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

    const state = useFlowStore.getState()
    expect(state.workflow.nodes.every((node) => node.selected)).toBe(true)
    expect(state.workflow.edges.every((edge) => edge.selected)).toBe(true)
    expect(state.past).toHaveLength(0)
  })
})

describe('选中浮动工具条（R8-4、FR-N6、Q35）', () => {
  it('选中节点后出现，创建副本包含内部连线并进入历史', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    expect(screen.queryByRole('toolbar', { name: '选中节点操作' })).toBeNull()
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(screen.getByRole('toolbar', { name: '选中节点操作' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '创建副本' }))

    const state = useFlowStore.getState()
    // 三个节点 + 一条内部连线一起复制。
    expect(state.workflow.nodes).toHaveLength(nodes.length * 2)
    expect(state.workflow.edges).toHaveLength(edges.length * 2)
    expect(state.past).toHaveLength(1)
  })

  it('复制后可用 Ctrl/Cmd+V 粘贴出副本', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)
    clickNode('llm')

    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    const state = useFlowStore.getState()
    expect(state.workflow.nodes).toHaveLength(nodes.length + 1)
    expect(state.workflow.nodes.filter((node) => node.selected)).toHaveLength(1)
  })

  it('删除动作删除选中节点与连线', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)
    clickNode('llm')

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    const state = useFlowStore.getState()
    expect(state.workflow.nodes.map((node) => node.id)).toEqual(['start', 'end'])
    expect(state.workflow.edges).toHaveLength(0)
  })
})

describe('输入锚点反向拖断 / 改接（R8-4、FR-E5）', () => {
  it('从已有连线的输入锚点拖到另一个节点改接', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const targetHandle = document.querySelector(
      '[data-node-id="llm"] .flow-handle--target.is-reconnectable',
    )
    if (!(targetHandle instanceof Element)) throw new Error('reconnectable handle not found')

    // llm 的输入锚点：40 + 160/2 = 120，y = 220；end 的输入锚点：300 + 80 = 380。
    fireEvent.pointerDown(targetHandle, {
      button: 0,
      pointerId: 1,
      clientX: 120,
      clientY: 220,
    })
    expect(document.querySelector('[data-edge-id="e-start-llm"]')).toBeNull()

    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 380, clientY: 220 })

    const state = useFlowStore.getState()
    expect(state.workflow.edges).toHaveLength(1)
    expect(state.workflow.edges[0]).toMatchObject({
      id: 'e-start-llm',
      source: 'start',
      target: 'end',
      targetHandle: 'in',
    })
    expect(state.past).toHaveLength(1)
  })

  it('从输入锚点拖到空白处摘掉连线', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const targetHandle = document.querySelector(
      '[data-node-id="llm"] .flow-handle--target.is-reconnectable',
    )
    if (!(targetHandle instanceof Element)) throw new Error('reconnectable handle not found')

    fireEvent.pointerDown(targetHandle, {
      button: 0,
      pointerId: 1,
      clientX: 120,
      clientY: 220,
    })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 700, clientY: 700 })

    const state = useFlowStore.getState()
    expect(state.workflow.edges).toHaveLength(0)
    expect(state.past).toHaveLength(1)
    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.edges).toHaveLength(1)
  })

  it('Esc 取消反向拖拽，不改动连线', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const targetHandle = document.querySelector(
      '[data-node-id="llm"] .flow-handle--target.is-reconnectable',
    )
    if (!(targetHandle instanceof Element)) throw new Error('reconnectable handle not found')

    fireEvent.pointerDown(targetHandle, {
      button: 0,
      pointerId: 1,
      clientX: 120,
      clientY: 220,
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 700, clientY: 700 })

    const state = useFlowStore.getState()
    expect(state.workflow.edges).toHaveLength(1)
    expect(state.workflow.edges[0]?.target).toBe('llm')
  })
})
