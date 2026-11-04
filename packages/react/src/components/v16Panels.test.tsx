import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Node } from '@system'
import { NodeRenderer } from './NodeRenderer.tsx'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'
import { useRunStore } from '../lib/runStore.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
  { id: 'end', type: 'end', position: { x: 400, y: 400 }, data: { label: 'End' } },
]

function reset() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
  useRunStore.getState().resetRun()
}

beforeEach(reset)

describe('画布内节点重命名（R6-3）', () => {
  it('双击标题进入编辑，Enter 提交并写入 data.label', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    const node = container.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.doubleClick(node)

    const input = screen.getByLabelText('节点名称') as HTMLInputElement
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useFlowStore.getState().workflow.nodes[0]?.data.label).toBe('新名字')
  })

  it('Esc 取消编辑，不写入', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    const node = container.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.doubleClick(node)

    const input = screen.getByLabelText('节点名称') as HTMLInputElement
    fireEvent.change(input, { target: { value: '不要这个' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(useFlowStore.getState().workflow.nodes[0]?.data.label).toBe('Start')
  })

  it('重命名入历史栈，可撤销', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    const node = container.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.doubleClick(node)
    const input = screen.getByLabelText('节点名称') as HTMLInputElement
    fireEvent.change(input, { target: { value: '改过的' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useFlowStore.getState().past).toHaveLength(1)

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.nodes[0]?.data.label).toBe('Start')
  })

  it('名称没变时不产生历史记录', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    const node = container.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.doubleClick(node)
    const input = screen.getByLabelText('节点名称') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useFlowStore.getState().past).toHaveLength(0)
  })
})

describe('画布侧错误详情（R6-6）', () => {
  it('失败节点展示错误码与消息，堆栈可展开', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    useRunStore.setState({
      nodeStates: { start: 'error' },
      records: {
        start: {
          nodeId: 'start',
          label: 'Start',
          type: 'start',
          typeLabel: '开始',
          state: 'error',
          duration: 12,
          error: {
            code: 'runtime-error',
            message: '取不到上游的值',
            stack: 'at run()',
          },
        },
      },
      order: ['start'],
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)

    // 未展开时不显示错误码。
    expect(container.querySelector('.flow-node__error-popover')).toBeNull()

    fireEvent.click(screen.getByLabelText('查看错误详情'))

    expect(screen.getByText('runtime-error')).toBeTruthy()
    expect(screen.getByText('取不到上游的值')).toBeTruthy()

    // 堆栈默认折叠。
    expect(container.querySelector('.flow-node__error-stack')).toBeNull()
    fireEvent.click(screen.getByText('展开堆栈'))
    expect(screen.getByText('at run()')).toBeTruthy()
  })

  it('成功的节点不展示错误入口', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    useRunStore.setState({
      nodeStates: { start: 'success' },
      records: {
        start: {
          nodeId: 'start',
          label: 'Start',
          type: 'start',
          typeLabel: '开始',
          state: 'success',
          duration: 5,
        },
      },
      order: ['start'],
    })

    const { container } = render(<NodeRenderer connection={null} onConnectStart={vi.fn()} />)
    expect(container.querySelector('.flow-node__error')).toBeNull()
  })
})
