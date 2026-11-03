import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Edge, Node, Workflow } from '@system'
import { createWorkflow } from '@system'
import { ReactFlow } from '../ReactFlow.tsx'
import { ConfigPanel } from './ConfigPanel.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ValidationPanel } from './ValidationPanel.tsx'
import { SchemaPreview } from './SchemaPreview.tsx'
import { VariablePicker } from './VariablePicker.tsx'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from '../lib/viewport.ts'

const startNode: Node = {
  id: 'start',
  type: 'start',
  position: { x: 40, y: 40 },
  data: { label: 'Start' },
}

const llmNode: Node = {
  id: 'llm',
  type: 'llm',
  position: { x: 40, y: 160 },
  data: { label: 'LLM', prompt: '你好 {{start.query}}' },
}

const edges: Edge[] = [{ id: 'e1', source: 'start', target: 'llm' }]

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

describe('变量选择器（R4-6、FR-P3）', () => {
  it('只列拓扑上游节点的输出字段', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<VariablePicker nodeId="llm" value="" onInsert={() => {}} />)

    fireEvent.click(screen.getByText('插入变量'))

    expect(screen.getByText('query')).toBeTruthy()
    expect(screen.getByText('Start')).toBeTruthy()
  })

  it('没有上游节点时给出提示', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<VariablePicker nodeId="start" value="" onInsert={() => {}} />)

    expect(screen.getByText(/没有可引用的上游变量/)).toBeTruthy()
  })

  it('点击字段插入 `{{nodeId.field}}` 字面量', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })
    const onInsert = vi.fn()

    render(<VariablePicker nodeId="llm" value="" onInsert={onInsert} />)
    fireEvent.click(screen.getByText('插入变量'))
    fireEvent.click(screen.getByText('query'))

    expect(onInsert).toHaveBeenCalledWith('{{start.query}}')
  })

  it('在配置面板里插入引用会写进参数值', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <>
        <ReactFlow nodes={[startNode, llmNode]} edges={edges} showConfigPanel={false} />
        <ConfigPanel variant="inline" />
      </>,
    )

    clickNode('llm')
    fireEvent.click(screen.getAllByText('插入变量')[0]!)
    fireEvent.click(screen.getByText('query'))

    const stored = useFlowStore.getState().workflow.nodes.find((node) => node.id === 'llm')
    expect(String(stored?.data?.prompt)).toContain('{{start.query}}')
  })
})

describe('引用失效标红（R4-5、FR-P3）', () => {
  it('引用字段不存在时面板给出可读原因', () => {
    const brokenLlm: Node = {
      id: 'llm',
      type: 'llm',
      position: { x: 40, y: 160 },
      data: { label: 'LLM', prompt: '你好 {{start.missing}}' },
    }

    render(
      <>
        <ReactFlow nodes={[startNode, brokenLlm]} edges={edges} showConfigPanel={false} />
        <ConfigPanel variant="inline" />
      </>,
    )

    clickNode('llm')

    expect(screen.getByText(/没有输出字段 missing/)).toBeTruthy()
  })

  it('引用合法时不报错', () => {
    render(
      <>
        <ReactFlow nodes={[startNode, llmNode]} edges={edges} showConfigPanel={false} />
        <ConfigPanel variant="inline" />
      </>,
    )

    clickNode('llm')

    expect(screen.queryByText(/没有输出字段/)).toBeNull()
  })

  it('节点卡片上标出含变量引用的节点', () => {
    render(<ReactFlow nodes={[startNode, llmNode]} edges={edges} />)

    const card = document.querySelector('[data-node-id="llm"]')
    expect(card?.querySelector('.flow-node__reference')).toBeTruthy()

    const plain = document.querySelector('[data-node-id="start"]')
    expect(plain?.querySelector('.flow-node__reference')).toBeNull()
  })
})

describe('文档级校验面板（R4-7、FR-P6）', () => {
  it('列出问题并可点击定位节点', () => {
    const orphan: Node = { id: 'orphan', type: 'start', position: { x: 300, y: 300 } }
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode, orphan], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<ValidationPanel />)

    expect(screen.getByText(/没有连到流程里/)).toBeTruthy()

    fireEvent.click(screen.getByText(/没有连到流程里/))
    expect(useFlowStore.getState().workflow.nodes.find((node) => node.id === 'orphan')?.selected).toBe(
      true,
    )
  })

  it('必填缺失报为错误', () => {
    const plugin: Node = {
      id: 'plugin',
      type: 'plugin',
      position: { x: 0, y: 0 },
      data: { label: 'Plugin' },
    }
    useFlowStore.setState({
      workflow: { nodes: [plugin], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<ValidationPanel />)

    expect(screen.getByText(/缺少必填参数/)).toBeTruthy()
    expect(screen.getByText('1 个错误')).toBeTruthy()
  })

  it('面板可折叠', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<ValidationPanel />)

    const toggle = screen.getByRole('button', { name: /校验/ })
    fireEvent.click(toggle)

    expect(screen.queryByText('文档看起来没问题。')).toBeNull()
  })

  it('文档干净时给出通过提示', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<ValidationPanel />)

    expect(screen.getByText('没有发现问题')).toBeTruthy()
  })
})

describe('输入 / 输出预览（R4-8、FR-P4）', () => {
  it('展示节点声明的输入与输出字段', () => {
    render(<SchemaPreview node={llmNode} />)

    expect(screen.getByText('输入 / 输出')).toBeTruthy()
    // 输入与输出各有一个名为 text 的字段。
    expect(screen.getAllByText('text')).toHaveLength(2)
    expect(screen.getByText('送入模型的文本')).toBeTruthy()
    expect(screen.getByText('模型生成的文本')).toBeTruthy()
  })

  it('节点为空时不渲染', () => {
    const { container } = render(<SchemaPreview node={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('在配置面板里随选中节点展示', () => {
    render(
      <>
        <ReactFlow nodes={[startNode, llmNode]} edges={edges} showConfigPanel={false} />
        <ConfigPanel variant="inline" />
      </>,
    )

    clickNode('llm')
    expect(screen.getByText('输入 / 输出')).toBeTruthy()
  })
})

describe('工具栏（R4-9、FR-U2）', () => {
  it('提供撤销 / 重做 / 适应画布 / 导出 / 导入', () => {
    render(<Toolbar />)

    expect(screen.getByText('撤销')).toBeTruthy()
    expect(screen.getByText('重做')).toBeTruthy()
    expect(screen.getByText('适应画布')).toBeTruthy()
    expect(screen.getByText('导出')).toBeTruthy()
    expect(screen.getByText('导入')).toBeTruthy()
  })

  it('没有历史时撤销与重做按钮禁用', () => {
    render(<Toolbar />)

    expect(screen.getByText('撤销').closest('button')?.disabled).toBe(true)
    expect(screen.getByText('重做').closest('button')?.disabled).toBe(true)
  })

  it('有历史时撤销按钮可用', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
      past: [
        { ...createWorkflow(), nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
      ],
    })

    render(<Toolbar />)

    expect(screen.getByText('撤销').closest('button')?.disabled).toBe(false)
  })

  it('导入成功后画布与参数完整还原，且可撤销一次', async () => {
    const doc = createWorkflow({ name: '导入测试' })
    doc.nodes = [
      { id: 'start', type: 'start', position: { x: 40, y: 40 }, data: { label: 'Start' } },
      {
        id: 'llm',
        type: 'llm',
        position: { x: 40, y: 160 },
        data: { label: 'LLM', prompt: '你好 {{start.query}}' },
      },
    ]
    doc.edges = [{ id: 'e1', source: 'start', target: 'llm' }]

    render(<Toolbar />)

    const input = document.querySelector('.flow-toolbar__file') as HTMLInputElement
    const file = new File([JSON.stringify(doc)], 'demo.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    await waitFor(() => {
      expect(useFlowStore.getState().workflow.nodes).toHaveLength(2)
    })

    const stored = useFlowStore.getState().workflow
    expect(stored.nodes.map((node) => node.id)).toEqual(['start', 'llm'])
    expect(stored.nodes[1]?.data?.prompt).toBe('你好 {{start.query}}')
    expect(stored.edges).toHaveLength(1)
    expect(stored.name).toBe('导入测试')
    expect(useFlowStore.getState().past).toHaveLength(1)
  })

  it('导入非法文档时给出可读错误且不改动画布', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<Toolbar />)

    const input = document.querySelector('.flow-toolbar__file') as HTMLInputElement
    const file = new File(['{ broken'], 'broken.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    await waitFor(() => {
      expect(screen.getByText(/导入失败/)).toBeTruthy()
    })

    expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
  })

  it('导入后撤销一次回到导入前的画布', async () => {
    const doc = createWorkflow({ name: '导入测试' })
    doc.nodes = [startNode]
    doc.edges = []

    // 导入前的画布是空的。
    useFlowStore.setState({
      workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(<Toolbar />)

    const input = document.querySelector('.flow-toolbar__file') as HTMLInputElement
    const file = new File([JSON.stringify(doc)], 'demo.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    await waitFor(() => {
      expect(useFlowStore.getState().workflow.nodes).toHaveLength(1)
    })

    useFlowStore.getState().undo()

    expect(useFlowStore.getState().workflow.nodes).toHaveLength(0)
  })
})

describe('受控模式下的文档往返（R4-2、R4-3）', () => {
  it('宿主在 onChange 里拿到的文档带 id / name / version', () => {
    const doc = createWorkflow({ id: 'doc-1', name: '我的流程' })
    doc.nodes = [startNode]
    const onChange = vi.fn()

    render(<ReactFlow workflow={doc} onChange={onChange} />)

    clickNode('start')
    fireEvent.keyDown(window, { key: 'Delete' })

    const latest = onChange.mock.calls.at(-1)?.[0] as Workflow
    expect(latest.id).toBe('doc-1')
    expect(latest.name).toBe('我的流程')
    expect(latest.version).toBe(doc.version)
  })
})
