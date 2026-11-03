import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Node } from '@system'
import { NodeRenderer } from './NodeRenderer.tsx'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', position: { x: 10, y: 20 }, data: { label: 'Start' } },
  { id: 'end', position: { x: 10, y: 200 }, data: { label: 'End' } },
]

beforeEach(() => {
  useFlowStore.setState({
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_VIEWPORT },
  })
})

describe('NodeRenderer', () => {
  it('渲染节点标题与输入/输出锚点', () => {
    useFlowStore.setState({ nodes })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.getByText('Start')).toBeTruthy()
    expect(screen.getByText('End')).toBeTruthy()
    expect(container.querySelectorAll('.flow-node')).toHaveLength(2)
    expect(container.querySelectorAll('.flow-handle--target')).toHaveLength(2)
    expect(container.querySelectorAll('.flow-handle--source')).toHaveLength(2)
    expect(container.querySelector('[data-node-id="start"]')).toBeTruthy()
  })

  it('增删节点不会触发 Hooks 数量变化错误', () => {
    useFlowStore.setState({ nodes: [nodes[0]] })
    const { rerender } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    useFlowStore.setState({ nodes })
    rerender(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.getByText('End')).toBeTruthy()

    useFlowStore.setState({ nodes: [nodes[1]] })
    rerender(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    expect(screen.queryByText('Start')).toBeNull()
  })

  it('拖拽位移按当前缩放换算为画布坐标', () => {
    useFlowStore.setState({ nodes: [nodes[0]], viewport: { ...DEFAULT_VIEWPORT, zoom: 2 } })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    const node = container.querySelector('[data-node-id="start"]') as HTMLElement

    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 })

    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 30, y: 30 })
  })

  it('从输出锚点开始连线时不移动节点', () => {
    useFlowStore.setState({ nodes: [nodes[0]] })
    const onConnectStart = vi.fn()

    const { container } = render(
      <NodeRenderer connection={null} onConnectStart={onConnectStart} />,
    )
    const source = container.querySelector('.flow-handle--source') as HTMLElement

    fireEvent.pointerDown(source, { button: 0, pointerId: 2, clientX: 60, clientY: 60 })
    fireEvent.pointerMove(source, { pointerId: 2, clientX: 90, clientY: 90 })

    expect(onConnectStart).toHaveBeenCalledTimes(1)
    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 10, y: 20 })
  })
})
