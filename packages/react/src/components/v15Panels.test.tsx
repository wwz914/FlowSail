import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Edge, Node } from '@system'
import { ReactFlow } from '../ReactFlow.tsx'
import { RunPanel } from './RunPanel.tsx'
import { ConfigPanel } from './ConfigPanel.tsx'
import { Toolbar } from './Toolbar.tsx'
import { NodeTypeProvider } from '../lib/registryContext.tsx'
import { useFlowStore } from '../store/index.ts'
import { useRunStore } from '../lib/runStore.ts'
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
  useRunStore.getState().resetRun()
}

function clickNode(id: string) {
  const node = document.querySelector(`[data-node-id="${id}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`node ${id} not found`)
  fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
}

beforeEach(resetStore)

describe('运行记录面板（R5-6、R5-7）', () => {
  it('没有运行记录时给出提示', () => {
    render(<RunPanel />)

    expect(screen.getByText(/尚未运行/)).toBeTruthy()
  })

  it('逐节点列出状态、耗时与输出', () => {
    useRunStore.getState().startRun()
    useRunStore.getState().markNodeSuccess(llmNode, 'LLM', '大模型', {
      duration: 42,
      output: { text: '摘要' },
    })

    render(<RunPanel />)

    expect(screen.getByText('LLM')).toBeTruthy()
    expect(screen.getByText('42ms')).toBeTruthy()
    expect(screen.getByText('大模型')).toBeTruthy()
    expect(screen.getByText('成功')).toBeTruthy()
  })

  it('失败节点有醒目标记与可读错误', () => {
    useRunStore.getState().markNodeError(llmNode, 'LLM', '大模型', {
      duration: 3,
      error: { code: 'invalid-reference', message: '取不到 start.ghost' },
    })

    const { container } = render(<RunPanel />)

    const record = container.querySelector('.flow-run-panel__record')
    expect(record?.className).toContain('is-failed')
    expect(screen.getByText('取不到 start.ghost')).toBeTruthy()
    expect(screen.getByText('invalid-reference')).toBeTruthy()
  })

  it('错误堆栈默认折叠，可展开', () => {
    useRunStore.getState().markNodeError(llmNode, 'LLM', '大模型', {
      duration: 3,
      error: { code: 'runtime-error', message: '炸了', stack: 'at foo()' },
    })

    render(<RunPanel />)

    expect(screen.queryByText('at foo()')).toBeNull()
    fireEvent.click(screen.getByText('展开堆栈'))
    expect(screen.getByText('at foo()')).toBeTruthy()
  })

  it('点击记录行定位并选中对应节点', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })
    useRunStore.getState().markNodeSuccess(llmNode, 'LLM', '大模型', { duration: 1 })

    render(<RunPanel />)
    fireEvent.click(screen.getByText('LLM'))

    const selected = useFlowStore.getState().workflow.nodes.filter((node) => node.selected)
    expect(selected.map((node) => node.id)).toEqual(['llm'])
  })

  it('面板可折叠', () => {
    useRunStore.getState().markNodeSuccess(llmNode, 'LLM', '大模型', { duration: 1 })

    render(<RunPanel />)
    fireEvent.click(screen.getByRole('button', { name: /运行记录/ }))

    expect(screen.queryByText('LLM')).toBeNull()
  })
})

describe('节点运行态（R5-5）', () => {
  it('运行中的节点带上运行态样式类', async () => {
    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
      </NodeTypeProvider>,
    )

    useRunStore.getState().startRun()
    useRunStore.getState().markNodeRunning(llmNode, 'LLM', '大模型')

    await waitFor(() => {
      const node = document.querySelector('[data-node-id="llm"]')
      expect(node?.className).toContain('is-run-running')
    })
  })

  it('节点上显示运行态徽标', async () => {
    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
      </NodeTypeProvider>,
    )

    useRunStore.getState().markNodeError(llmNode, 'LLM', '大模型', {
      duration: 1,
      error: { code: 'runtime-error', message: '炸了' },
    })

    await waitFor(() => {
      const badge = document.querySelector('[data-node-id="llm"] .flow-node__run-badge')
      expect(badge?.textContent).toBe('失败')
    })
  })
})

describe('工具栏的试运行按钮（R5-9）', () => {
  it('空画布时试运行按钮禁用', () => {
    render(
      <NodeTypeProvider>
        <Toolbar />
      </NodeTypeProvider>,
    )

    const button = screen.getByRole('button', { name: '试运行' })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('有节点时试运行按钮可用，点击后开始运行', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <Toolbar />
      </NodeTypeProvider>,
    )

    const button = screen.getByRole('button', { name: '试运行' })
    expect(button.hasAttribute('disabled')).toBe(false)

    fireEvent.click(button)

    await waitFor(() => {
      expect(useRunStore.getState().status).toBe('success')
    })
  })
})

describe('运行中禁止编辑（R5-4、PRD Q8）', () => {
  it('运行中拖不动节点', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
      </NodeTypeProvider>,
    )

    useRunStore.getState().startRun()
    const before = useFlowStore.getState().workflow.nodes[0]?.position.x

    const node = document.querySelector('[data-node-id="start"]')
    if (!(node instanceof HTMLElement)) throw new Error('node not found')
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })

    expect(useFlowStore.getState().workflow.nodes[0]?.position.x).toBe(before)
  })

  it('运行中改不了参数', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <ConfigPanel />
      </NodeTypeProvider>,
    )

    clickNode('llm')
    useRunStore.getState().startRun()

    const prompt = await screen.findByLabelText(/提示词/)
    fireEvent.change(prompt, { target: { value: '改坏了' } })

    expect(useFlowStore.getState().workflow.nodes[1]?.data?.prompt).toBe('你好 {{start.query}}')
  })

  it('运行中撤销按钮禁用', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
      past: [useFlowStore.getState().workflow],
    })

    render(
      <NodeTypeProvider>
        <Toolbar />
      </NodeTypeProvider>,
    )

    useRunStore.getState().startRun()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '撤销' }).hasAttribute('disabled')).toBe(true)
    })
  })
})

describe('单节点测试（R5-8）', () => {  it('配置面板里出现「测试」按钮', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <ConfigPanel />
      </NodeTypeProvider>,
    )

    clickNode('llm')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '测试' })).toBeTruthy()
    })
  })

  it('测试当前节点并展示输出', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <ConfigPanel />
      </NodeTypeProvider>,
    )

    clickNode('llm')

    // 参数里引用了 `{{start.query}}`：单节点测试需要手填上游字段（R5-8）。
    const referenceInput = await screen.findByPlaceholderText('{{start.query}} 的值')
    fireEvent.change(referenceInput, { target: { value: '一封长邮件' } })

    fireEvent.click(screen.getByRole('button', { name: '测试' }))

    await waitFor(() => {
      expect(screen.getByText(/成功/)).toBeTruthy()
    })
    // 单节点测试不写进整条流程的运行记录（R5-8）。
    expect(useRunStore.getState().records.llm).toBeUndefined()
  })

  it('上游引用没有手填时给出可读错误', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    render(
      <NodeTypeProvider>
        <ReactFlow
          nodes={[startNode, llmNode]}
          edges={edges}
          showNodePanel={false}
          showConfigPanel={false}
          showRunPanel={false}
        />
        <ConfigPanel />
      </NodeTypeProvider>,
    )

    clickNode('llm')
    fireEvent.click(screen.getByRole('button', { name: '测试' }))

    await waitFor(() => {
      expect(screen.getByText(/取值失败/)).toBeTruthy()
    })
  })
})
