import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Edge, Node } from '@flowsail/core'
import { ReactFlow } from '../ReactFlow.tsx'
import { ConfigPanel } from './ConfigPanel.tsx'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

const nodes: Node[] = [
  { id: 'condition', type: 'condition', position: { x: 40, y: 60 }, data: { label: 'Condition' } },
  { id: 'yes', type: 'llm', position: { x: 40, y: 220 }, data: { label: 'LLM' } },
  { id: 'no', type: 'end', position: { x: 300, y: 220 }, data: { label: 'End' } },
]

const edges: Edge[] = [
  {
    id: 'e-cond-yes',
    source: 'condition',
    target: 'yes',
    sourceHandle: 'true',
    targetHandle: 'in',
    label: '是',
  },
  {
    id: 'e-cond-no',
    source: 'condition',
    target: 'no',
    sourceHandle: 'false',
    targetHandle: 'in',
    label: '否',
  },
]

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
}

function clickNode(id: string) {
  const node = document.querySelector(`[data-node-id="${id}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`node ${id} not found`)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
}

beforeEach(resetStore)

describe('条件节点的多出口与分支标签（R3-3、R3-4）', () => {
  it('条件节点渲染两个具名出口', () => {
    render(<ReactFlow nodes={[nodes[0]!]} edges={[]} />)

    const sources = document.querySelectorAll('[data-node-id="condition"] .flow-handle--source')
    expect(sources).toHaveLength(2)
    expect(Array.from(sources).map((el) => el.getAttribute('data-handle-id'))).toEqual([
      'true',
      'false',
    ])
  })

  it('连线按 sourceHandle 落到不同的出口锚点上', () => {
    const { container } = render(<ReactFlow nodes={nodes} edges={edges} />)

    const trueEdge = container.querySelector('[data-edge-id="e-cond-yes"]')
    const falseEdge = container.querySelector('[data-edge-id="e-cond-no"]')
    expect(trueEdge?.getAttribute('data-source-handle')).toBe('true')
    expect(falseEdge?.getAttribute('data-source-handle')).toBe('false')

    const paths = Array.from(container.querySelectorAll('.flow-edge__line')).map(
      (el) => el.getAttribute('d') ?? '',
    )
    // 两个出口的起点不同，说明曲线确实落在不同的锚点上。
    const starts = paths.map((path) => path.split('C')[0]?.trim() ?? '')
    expect(new Set(starts).size).toBe(2)
  })

  it('分支标签显示在连线上', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    expect(screen.getByText('是')).toBeTruthy()
    expect(screen.getByText('否')).toBeTruthy()
  })

  it('选中连线后可在面板里改分支标签，改动进历史栈', async () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const edge = document.querySelector('[data-edge-id="e-cond-yes"]')
    if (!(edge instanceof Element)) throw new Error('edge not found')
    fireEvent.pointerDown(edge, { button: 0 })

    const input = screen.getByLabelText('分支标签') as HTMLInputElement
    fireEvent.change(input, { target: { value: '通过' } })

    const stored = useFlowStore.getState().workflow.edges.find(
      (candidate) => candidate.id === 'e-cond-yes',
    )
    expect(stored?.label).toBe('通过')

    // 连续输入合并成一条历史记录（R3-7）。
    await waitFor(() => expect(useFlowStore.getState().past).toHaveLength(1))
  })

  it('连续输入分支标签只产生一条历史记录', async () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const edge = document.querySelector('[data-edge-id="e-cond-yes"]')
    if (!(edge instanceof Element)) throw new Error('edge not found')
    fireEvent.pointerDown(edge, { button: 0 })

    const input = screen.getByLabelText('分支标签') as HTMLInputElement
    fireEvent.change(input, { target: { value: '通' } })
    fireEvent.change(input, { target: { value: '通过' } })
    fireEvent.change(input, { target: { value: '通过时' } })

    await waitFor(() => expect(useFlowStore.getState().past).toHaveLength(1))

    useFlowStore.getState().undo()
    const undone = useFlowStore.getState().workflow.edges.find(
      (candidate) => candidate.id === 'e-cond-yes',
    )
    expect(undone?.label).toBe('是')
  })
})

describe('配置面板（R3-5、R3-6、R3-7）', () => {
  it('未选中节点时显示工作流级占位', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    expect(screen.getByText('未选中节点')).toBeTruthy()
  })

  it('选中节点后展示名称、描述与参数表单', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    clickNode('yes')

    expect(screen.getByLabelText('名称')).toBeTruthy()
    expect(screen.getByLabelText('描述')).toBeTruthy()
    expect(screen.getByLabelText(/提示词/)).toBeTruthy()
    expect(screen.getByLabelText(/模型/)).toBeTruthy()
    expect(screen.getByLabelText(/温度/)).toBeTruthy()
    expect(screen.getByLabelText(/流式输出/)).toBeTruthy()
  })

  it('改参数即时写回文档并反映到画布', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    clickNode('yes')
    const prompt = screen.getByLabelText(/提示词/) as HTMLTextAreaElement
    fireEvent.change(prompt, { target: { value: '新的提示词' } })

    const stored = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(stored?.data?.prompt).toBe('新的提示词')
  })

  it('必填缺失时在面板内提示', () => {
    const plugin: Node[] = [
      { id: 'plugin', type: 'plugin', position: { x: 0, y: 0 }, data: { label: 'Plugin' } },
    ]
    render(<ReactFlow nodes={plugin} edges={[]} />)

    clickNode('plugin')

    expect(screen.getByRole('alert').textContent).toContain('必填')
  })

  it('非法类型值被拒绝并给出可读错误', () => {
    const code: Node[] = [
      { id: 'code', type: 'code', position: { x: 0, y: 0 }, data: { label: 'Code' } },
    ]
    render(<ReactFlow nodes={code} edges={[]} />)

    clickNode('code')
    const config = screen.getByLabelText('配置') as HTMLTextAreaElement
    fireEvent.change(config, { target: { value: '{不是 JSON}' } })

    const alerts = screen.getAllByRole('alert').map((element) => element.textContent ?? '')
    expect(alerts.some((text) => text.includes('JSON'))).toBe(true)
  })

  it('一次连续输入合并为一条历史记录，可撤销重做（R3-7）', async () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    clickNode('yes')
    const prompt = screen.getByLabelText(/提示词/) as HTMLTextAreaElement
    fireEvent.change(prompt, { target: { value: 'a' } })
    fireEvent.change(prompt, { target: { value: 'ab' } })
    fireEvent.change(prompt, { target: { value: 'abc' } })

    const stored = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(stored?.data?.prompt).toBe('abc')

    // 合并窗口结束后才压栈，因此先等一拍。
    await waitFor(() => expect(useFlowStore.getState().past).toHaveLength(1))

    useFlowStore.getState().undo()
    const undone = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(undone?.data?.prompt).toBeUndefined()

    useFlowStore.getState().redo()
    const redone = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(redone?.data?.prompt).toBe('abc')
  })

  it('连续改节点名称只产生一条历史记录', async () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    clickNode('yes')
    const title = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(title, { target: { value: '我的' } })
    fireEvent.change(title, { target: { value: '我的模型' } })

    const stored = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(stored?.data?.label).toBe('我的模型')

    await waitFor(() => expect(useFlowStore.getState().past).toHaveLength(1))

    useFlowStore.getState().undo()
    const undone = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'yes')
    expect(undone?.data?.label).toBe('LLM')
  })

  it('独立使用 ConfigPanel 时同样能读到选中节点', () => {
    useFlowStore.setState({
      workflow: {
        nodes: [{ ...nodes[1]!, selected: true }],
        edges: [],
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    render(<ConfigPanel variant="inline" />)

    expect(screen.getByLabelText(/提示词/)).toBeTruthy()
  })
})

describe('宿主自定义节点类型（R3-1、FR-X2）', () => {
  it('nodeTypes 注入的类型出现在面板里并能创建节点', () => {
    const onNodesChange = vi.fn()
    render(
      <ReactFlow
        nodes={[]}
        edges={[]}
        nodeTypes={[
          {
            type: 'notify',
            label: '通知',
            color: '#123456',
            icon: null,
            defaultData: { label: 'Notify' },
          },
        ]}
        onNodesChange={onNodesChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '通知' }))

    const created = useFlowStore.getState().workflow.nodes
    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe('notify')
    expect(created[0]?.data?.label).toBe('Notify')
  })

  it('自定义类型可以覆盖同名内置类型', () => {
    render(
      <ReactFlow
        nodes={[]}
        edges={[]}
        nodeTypes={[{ type: 'llm', label: '我的模型', color: '#000', icon: null }]}
      />,
    )

    expect(screen.getByRole('button', { name: '我的模型' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '大模型' })).toBeNull()
  })
})
