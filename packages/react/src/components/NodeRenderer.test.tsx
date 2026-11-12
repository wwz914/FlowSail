import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Node } from '@flowsail/core'
import { NodeRenderer } from './NodeRenderer.tsx'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 10, y: 20 }, data: { label: 'Start' } },
  { id: 'end', type: 'end', position: { x: 10, y: 200 }, data: { label: 'End' } },
]

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
}

beforeEach(resetStore)

describe('NodeRenderer', () => {
  it('渲染节点标题、类型名与输入/输出锚点', () => {
    useFlowStore.setState({
      workflow: { nodes, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.getByText('Start')).toBeTruthy()
    expect(screen.getByText('End')).toBeTruthy()
    expect(screen.getByText('开始')).toBeTruthy()
    expect(screen.getByText('结束')).toBeTruthy()
    expect(container.querySelectorAll('.flow-node')).toHaveLength(2)
    expect(container.querySelectorAll('.flow-node__icon')).toHaveLength(2)
    expect(container.querySelectorAll('.flow-node__type')).toHaveLength(2)
    // 开始节点没有入口，结束节点没有出口（R3-2 的锚点定义）。
    expect(container.querySelectorAll('.flow-handle--target')).toHaveLength(1)
    expect(container.querySelectorAll('.flow-handle--source')).toHaveLength(1)
    expect(container.querySelector('[data-node-id="start"]')?.getAttribute('data-node-type')).toBe(
      'start',
    )
  })

  it('增删节点不会触发 Hooks 数量变化错误', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const { rerender } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    useFlowStore.setState({ workflow: { nodes, edges: [], viewport: { ...DEFAULT_VIEWPORT } } })
    rerender(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.getByText('End')).toBeTruthy()

    useFlowStore.setState({
      workflow: { nodes: [nodes[1]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    rerender(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.queryByText('Start')).toBeNull()
  })

  it('拖拽位移按当前缩放换算为画布坐标，并吸附到网格（R6-4）', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [nodes[0]!],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT, zoom: 2 },
      },
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    const node = container.querySelector('[data-node-id="start"]') as HTMLElement

    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 })

    // 位移按缩放换算得 (30, 30)，再吸附到 8px 网格得 (32, 32)（R6-4）。
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 32, y: 32 })
  })

  it('按住 Alt 时临时关闭网格吸附（R6-4、Q23）', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [nodes[0]!],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT, zoom: 2 },
      },
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    const node = container.querySelector('[data-node-id="start"]') as HTMLElement

    fireEvent.pointerDown(node, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      altKey: true,
    })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 })

    // 不吸附时保留原始位移。
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 30, y: 30 })
  })

  it('从输出锚点开始连线时不移动节点', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const onConnectStart = vi.fn()

    const { container } = render(
      <NodeRenderer connection={null} onConnectStart={onConnectStart} />,
    )
    const source = container.querySelector('.flow-handle--source') as HTMLElement

    fireEvent.pointerDown(source, { button: 0, pointerId: 2, clientX: 60, clientY: 60 })
    fireEvent.pointerMove(source, { pointerId: 2, clientX: 90, clientY: 90 })

    expect(onConnectStart).toHaveBeenCalledTimes(1)
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 10, y: 20 })
  })

  it('单击选中节点，Shift 追加选择，多选拖拽整体移动且只产生一条历史', () => {
    useFlowStore.setState({
      workflow: { nodes, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    const start = container.querySelector('[data-node-id="start"]') as HTMLElement
    const end = container.querySelector('[data-node-id="end"]') as HTMLElement

    fireEvent.pointerDown(start, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(start, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    expect(start.className).toContain('is-selected')

    fireEvent.pointerDown(end, { button: 0, pointerId: 2, clientX: 100, clientY: 300, shiftKey: true })
    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      true,
    ])

    fireEvent.pointerDown(start, { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(start, { pointerId: 3, clientX: 120, clientY: 120 })
    fireEvent.pointerUp(start, { pointerId: 3, clientX: 120, clientY: 120 })

    // 位移 (20, 20)，吸附到 8px 网格后为 (32, 40) 与 (32, 224)（R6-4）。
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 32, y: 40 })
    expect(useFlowStore.getState().workflow.nodes[1]?.position).toEqual({ x: 32, y: 224 })
    expect(useFlowStore.getState().past).toHaveLength(1)

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 10, y: 20 })
    expect(useFlowStore.getState().workflow.nodes[1]?.position).toEqual({ x: 10, y: 200 })
  })

  it('多选状态下单击不拖动会收敛为单选', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [{ ...nodes[0]!, selected: true }, { ...nodes[1]!, selected: true }],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    const start = container.querySelector('[data-node-id="start"]') as HTMLElement

    fireEvent.pointerDown(start, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(start, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })

    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      false,
    ])
  })

  it('未知节点类型回落到通用图标与类型名', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [{ id: 'custom', type: 'custom', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.getAllByText('custom')).toHaveLength(2)
  })
})
