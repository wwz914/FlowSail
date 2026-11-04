import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Edge, Node, Workflow } from '@flowsail/core'
import { createWorkflow } from '@flowsail/core'
import { ReactFlow } from './ReactFlow.tsx'
import { useFlowStore } from './store/index.ts'
import { DEFAULT_VIEWPORT } from './lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 40, y: 60 }, data: { label: 'Start' } },
  { id: 'llm', type: 'llm', position: { x: 40, y: 220 }, data: { label: 'LLM' } },
]

const edges: Edge[] = [{ id: 'e-start-llm', source: 'start', target: 'llm' }]

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
}

function getRoot() {
  const root = document.querySelector('.react-flow')
  if (!(root instanceof HTMLElement)) throw new Error('canvas root not found')
  return root
}

function clickNode(id: string, shiftKey = false) {
  const node = document.querySelector(`[data-node-id="${id}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`node ${id} not found`)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100, shiftKey })
  fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100, shiftKey })
}

/** jsdom 没有 DataTransfer，这里按拖放需要实现最小接口。 */
function createDataTransfer() {
  const data = new Map<string, string>()
  return {
    get types() {
      return [...data.keys()]
    },
    effectAllowed: 'all',
    dropEffect: 'none',
    setData(format: string, value: string) {
      data.set(format, value)
    },
    getData(format: string) {
      return data.get(format) ?? ''
    },
  } as unknown as DataTransfer
}

function fireDrop(clientX: number, clientY: number, type = 'llm') {
  const dataTransfer = createDataTransfer()
  dataTransfer.setData('application/x-flowsail-node-type', type)
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.assign(event, { dataTransfer, clientX, clientY })
  fireEvent(getRoot(), event)
}

beforeEach(resetStore)

describe('ReactFlow', () => {
  it('把 props 中的节点同步进 store 并渲染画布控件', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    expect(useFlowStore.getState().workflow.nodes).toEqual(nodes)
    expect(screen.getByText('Start')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByRole('button', { name: '适应画布' })).toBeTruthy()
  })

  it('为空画布时禁用适应画布', () => {
    render(<ReactFlow nodes={[]} edges={[]} />)

    expect(screen.getByRole('button', { name: '适应画布' })).toHaveProperty('disabled', true)
  })

  it('空画布也能通过节点面板创建节点', () => {
    render(<ReactFlow nodes={[]} edges={[]} />)

    fireEvent.click(screen.getByRole('button', { name: '开始' }))

    const created = useFlowStore.getState().workflow.nodes
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      type: 'start',
      selected: true,
      data: { label: 'Start' },
    })
    expect(useFlowStore.getState().past).toHaveLength(1)
  })

  it('把面板项拖到画布上按落点创建节点', () => {
    render(<ReactFlow nodes={[]} edges={[]} />)

    fireDrop(400, 300)

    const created = useFlowStore.getState().workflow.nodes
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      type: 'llm',
      // 160 × 48 的卡片以落点为中心
      position: { x: 400 - 80, y: 300 - 24 },
    })
  })
})

describe('选择与删除', () => {
  it('单击单选、Shift 追加、点空白与 Esc 取消', () => {
    const onSelectionChange = vi.fn()
    render(
      <ReactFlow nodes={nodes} edges={[]} onSelectionChange={onSelectionChange} />,
    )

    clickNode('start')
    expect(useFlowStore.getState().workflow.nodes[0]?.selected).toBe(true)

    clickNode('llm', true)
    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      true,
    ])

    clickNode('start', true)
    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      false,
      true,
    ])
    expect(onSelectionChange).toHaveBeenCalled()
    const last = onSelectionChange.mock.calls.at(-1)?.[0]
    expect(last.nodes.map((node: Node) => node.id)).toEqual(['llm'])

    fireEvent.pointerDown(getRoot(), { button: 0, pointerId: 1 })
    expect(useFlowStore.getState().workflow.nodes.some((node) => node.selected)).toBe(false)

    clickNode('start')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useFlowStore.getState().workflow.nodes.some((node) => node.selected)).toBe(false)
  })

  it('Delete 删除选中节点及其连线，不留下悬空连线', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    clickNode('start')
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(useFlowStore.getState().workflow.nodes.map((node) => node.id)).toEqual(['llm'])
    expect(useFlowStore.getState().workflow.edges).toEqual([])
  })

  it('连线可单独选中并删除', () => {
    render(<ReactFlow nodes={nodes} edges={edges} />)

    const edge = document.querySelector('[data-edge-id="e-start-llm"]')
    if (!(edge instanceof Element)) throw new Error('edge not found')
    fireEvent.pointerDown(edge, { button: 0 })
    expect(useFlowStore.getState().workflow.edges[0]?.selected).toBe(true)

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useFlowStore.getState().workflow.edges).toEqual([])
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)
  })

  it('输入框内按 Delete 不触发删除', () => {
    render(
      <ReactFlow nodes={nodes} edges={[]}>
        <input data-testid="text-field" />
      </ReactFlow>,
    )

    clickNode('start')
    const input = screen.getByTestId('text-field')
    input.focus()
    fireEvent.keyDown(input, { key: 'Delete' })

    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)
  })

  it('Ctrl/Cmd+Z 撤销删除，Ctrl/Cmd+Shift+Z 重做', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    clickNode('start')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
  })
})

describe('拖拽与历史', () => {
  it('拖拽位移按缩放换算并吸附到网格，把一次拖拽合并为一条历史（R6-4）', () => {
    useFlowStore.setState({
      workflow: { nodes: [nodes[0]!], edges: [], viewport: { ...DEFAULT_VIEWPORT, zoom: 2 } },
    })
    const onNodesChange = vi.fn()
    render(<ReactFlow nodes={[nodes[0]!]} edges={[]} onNodesChange={onNodesChange} />)

    const node = document.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 })

    // 位移按缩放换算得 (60, 70)，再吸附到 8px 网格得 (64, 72)（R6-4）。
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 64, y: 72 })
    expect(onNodesChange).toHaveBeenCalled()
    expect(useFlowStore.getState().past).toHaveLength(1)

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 40, y: 60 })
  })
})

describe('props 同步边界', () => {
  it('宿主每次渲染传入内容相同的新数组不会冲掉内部编辑', () => {
    const { rerender } = render(<ReactFlow nodes={nodes} edges={[]} />)

    const node = document.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 150, clientY: 150 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 150, clientY: 150 })

    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 88, y: 112 })

    rerender(<ReactFlow nodes={nodes.map((item) => ({ ...item }))} edges={[]} />)

    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 88, y: 112 })
  })

  it('props 内容真的变化时同步进 store', () => {
    const { rerender } = render(<ReactFlow nodes={nodes} edges={[]} />)

    const moved = nodes.map((item) =>
      item.id === 'start' ? { ...item, position: { x: 500, y: 500 } } : item,
    )
    rerender(<ReactFlow nodes={moved} edges={[]} />)

    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 500, y: 500 })
  })
})

describe('受控模式（R4-2、FR-X1）', () => {
  it('传入 workflow prop 后画布渲染宿主文档', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges

    render(<ReactFlow workflow={doc} />)

    expect(useFlowStore.getState().workflow.nodes).toEqual(nodes)
    expect(screen.getByText('Start')).toBeTruthy()
  })

  it('内部编辑通过 onChange 写回宿主', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges
    const onChange = vi.fn()

    render(<ReactFlow workflow={doc} onChange={onChange} />)

    const node = document.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 })

    expect(onChange).toHaveBeenCalled()
    const latest = onChange.mock.calls.at(-1)?.[0] as Workflow
    // 缩放为 1，位移 40×20 屏幕像素对应 40×20 世界坐标。
    expect(latest.nodes[0]?.position).toEqual({ x: 80, y: 80 })
  })

  it('宿主改文档后画布回流', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges

    const { rerender } = render(<ReactFlow workflow={doc} />)

    const moved = {
      ...doc,
      nodes: nodes.map((item) =>
        item.id === 'start' ? { ...item, position: { x: 500, y: 500 } } : item,
      ),
    }
    rerender(<ReactFlow workflow={moved} />)

    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 500, y: 500 })
  })

  it('宿主每次渲染传入内容相同的文档不会冲掉内部编辑', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges

    const { rerender } = render(<ReactFlow workflow={doc} />)

    const node = document.querySelector('[data-node-id="start"]') as HTMLElement
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 150, clientY: 150 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 150, clientY: 150 })

    rerender(<ReactFlow workflow={{ ...doc, nodes: nodes.map((item) => ({ ...item })) }} />)

    expect(useFlowStore.getState().workflow.nodes[0]?.position).toEqual({ x: 88, y: 112 })
  })

  it('受控模式下撤销重做仍然可用', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges

    render(<ReactFlow workflow={doc} />)

    clickNode('start')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)
  })

  it('没有 workflow prop 时保持非受控行为', () => {
    const onChange = vi.fn()
    render(<ReactFlow nodes={nodes} edges={[]} onChange={onChange} />)

    expect(useFlowStore.getState().workflow.nodes).toEqual(nodes)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('宿主只改视口时画布也回流', () => {
    const doc = createWorkflow({ name: '受控文档' })
    doc.nodes = nodes
    doc.edges = edges

    const { rerender } = render(<ReactFlow workflow={doc} />)

    rerender(
      <ReactFlow
        workflow={{ ...doc, viewport: { x: 100, y: 50, zoom: 1.5 } }}
      />,
    )

    expect(useFlowStore.getState().workflow.viewport).toEqual({ x: 100, y: 50, zoom: 1.5 })
  })
})

describe('框选（R6-1、FR-N5）', () => {
  it('在空白处拖出选框，松开后与选框相交的节点进入选中集合', () => {
    useFlowStore.setState({
      workflow: { nodes, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={nodes} edges={[]} />)

    const root = getRoot()
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 250, clientY: 320 })
    expect(document.querySelector('[data-marquee="active"]')).not.toBeNull()

    fireEvent.pointerUp(root, { pointerId: 1, clientX: 250, clientY: 320 })

    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      true,
    ])
    expect(document.querySelector('[data-marquee="active"]')).toBeNull()
  })

  it('选框只命中所覆盖的节点', () => {
    useFlowStore.setState({
      workflow: { nodes, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={nodes} edges={[]} />)

    const root = getRoot()
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 240, clientY: 120 })
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 240, clientY: 120 })

    expect(useFlowStore.getState().workflow.nodes[0]?.selected).toBe(true)
    expect(useFlowStore.getState().workflow.nodes[1]?.selected).toBe(false)
  })

  it('Shift 拖拽为追加选区', () => {
    const preselected = [{ ...nodes[0]!, selected: true }, nodes[1]!]
    useFlowStore.setState({
      workflow: { nodes: preselected, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={preselected} edges={[]} />)

    const root = getRoot()
    fireEvent.pointerDown(root, {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 200,
      shiftKey: true,
    })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 240, clientY: 300, shiftKey: true })
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 240, clientY: 300, shiftKey: true })

    expect(useFlowStore.getState().workflow.nodes.map((node) => Boolean(node.selected))).toEqual([
      true,
      true,
    ])
  })

  it('空白处单击（没有拖动）清空选区', () => {
    const preselected = [{ ...nodes[0]!, selected: true }, nodes[1]!]
    useFlowStore.setState({
      workflow: { nodes: preselected, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={preselected} edges={[]} />)

    const root = getRoot()
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 700, clientY: 700 })
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 700, clientY: 700 })

    expect(useFlowStore.getState().workflow.nodes.every((node) => !node.selected)).toBe(true)
  })
})

describe('复制 / 粘贴（R6-2、Q24）', () => {
  it('复制选中节点后粘贴出带偏移的新节点', () => {
    const preselected = [{ ...nodes[0]!, selected: true }, nodes[1]!]
    useFlowStore.setState({
      workflow: { nodes: preselected, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={preselected} edges={[]} />)

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    const state = useFlowStore.getState().workflow
    expect(state.nodes).toHaveLength(3)
    const pasted = state.nodes[2]!
    expect(pasted.id).not.toBe('start')
    expect(pasted.position).toEqual({ x: 40 + 24, y: 60 + 24 })
    expect(pasted.selected).toBe(true)
    expect(state.nodes[0]?.selected).toBe(false)
  })

  it('普通粘贴不复制连线，Alt 粘贴才连同内部连线', () => {
    const preselected = [
      { ...nodes[0]!, selected: true },
      { ...nodes[1]!, selected: true },
    ]
    useFlowStore.setState({
      workflow: { nodes: preselected, edges, viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={preselected} edges={edges} />)

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(useFlowStore.getState().workflow.edges).toHaveLength(1)

    // 粘贴后新节点成为选中项；重新选中原始两个节点再复制一次。
    useFlowStore.getState().selectNodes(['start', 'llm'])
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true, altKey: true })
    // Alt 粘贴带上了内部连线。
    expect(useFlowStore.getState().workflow.edges).toHaveLength(2)
  })

  it('粘贴可撤销', () => {
    const preselected = [{ ...nodes[0]!, selected: true }]
    useFlowStore.setState({
      workflow: { nodes: preselected, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={preselected} edges={[]} />)

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)

    useFlowStore.getState().undo()
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
  })

  it('没有复制过内容时 Ctrl+V 不产生节点', () => {
    const single = [nodes[0]!]
    useFlowStore.setState({
      workflow: { nodes: single, edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })
    render(<ReactFlow nodes={single} edges={[]} />)

    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
  })
})
