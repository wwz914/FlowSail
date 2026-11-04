import { beforeEach, describe, expect, it } from 'vitest'
import type { Node } from '@flowsail/core'
import { BUILTIN_REGISTRY } from './registryContext.tsx'
import { getNodeRunState, useRunStore } from './runStore.ts'
import { cancelRun, canStartRun, isRunLocked, startRun } from './runController.ts'
import { useFlowStore } from '../store/index.ts'
import { DEFAULT_VIEWPORT } from './viewport.ts'

const startNode: Node = {
  id: 'start',
  type: 'start',
  position: { x: 0, y: 0 },
  data: { label: 'Start' },
}

const llmNode: Node = {
  id: 'llm',
  type: 'llm',
  position: { x: 0, y: 100 },
  data: { label: 'LLM', prompt: '摘要：{{start.query}}' },
}

const edges = [{ id: 'e1', source: 'start', target: 'llm' }]

function resetStores() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
  useRunStore.getState().resetRun()
  useRunStore.getState().setRegistry(BUILTIN_REGISTRY)
}

beforeEach(resetStores)

describe('运行态存储（R5-5、R5-6）', () => {
  it('没有记录时节点是 idle', () => {
    expect(getNodeRunState(useRunStore.getState(), 'llm')).toBe('idle')
  })

  it('开始运行清空上一轮的状态', () => {
    useRunStore.getState().markNodeSuccess(startNode, 'Start', '开始', { duration: 1 })
    expect(useRunStore.getState().status).toBe('idle')

    useRunStore.getState().startRun()

    expect(useRunStore.getState().status).toBe('running')
    expect(useRunStore.getState().records.start).toBeUndefined()
    expect(useRunStore.getState().nodeStates.start).toBeUndefined()
  })

  it('节点状态与记录来自同一份数据（R5-6 的一致性）', () => {
    useRunStore.getState().startRun()
    useRunStore.getState().markNodeRunning(llmNode, 'LLM', '大模型')

    const state = useRunStore.getState()
    expect(getNodeRunState(state, 'llm')).toBe('running')
    expect(state.records.llm?.state).toBe('running')

    useRunStore.getState().markNodeSuccess(llmNode, 'LLM', '大模型', {
      duration: 12,
      output: { text: 'ok' },
    })

    const after = useRunStore.getState()
    expect(getNodeRunState(after, 'llm')).toBe('success')
    expect(after.records.llm?.state).toBe('success')
    expect(after.records.llm?.duration).toBe(12)
    expect(after.records.llm?.output).toEqual({ text: 'ok' })
  })

  it('失败节点记录错误信息（R5-7）', () => {
    useRunStore.getState().markNodeError(llmNode, 'LLM', '大模型', {
      duration: 5,
      error: { code: 'invalid-reference', message: '取不到值', stack: 'stack trace' },
    })

    const record = useRunStore.getState().records.llm
    expect(record?.state).toBe('error')
    expect(record?.error?.message).toBe('取不到值')
    expect(record?.error?.stack).toBe('stack trace')
  })

  it('跳过的节点标记为 skipped', () => {
    useRunStore.getState().markNodeSkipped(llmNode, 'LLM', '大模型')

    expect(getNodeRunState(useRunStore.getState(), 'llm')).toBe('skipped')
  })

  it('运行结束时把仍在 running 的节点归位', () => {
    useRunStore.getState().startRun()
    useRunStore.getState().markNodeRunning(llmNode, 'LLM', '大模型')

    useRunStore.getState().finishRun({
      ok: true,
      cancelled: false,
      errors: {},
      outputs: {},
      duration: 20,
    })

    expect(getNodeRunState(useRunStore.getState(), 'llm')).toBe('success')
    expect(useRunStore.getState().status).toBe('success')
    expect(useRunStore.getState().duration).toBe(20)
  })

  it('取消时把仍在 running 的节点标记为 skipped', () => {
    useRunStore.getState().startRun()
    useRunStore.getState().markNodeRunning(llmNode, 'LLM', '大模型')

    useRunStore.getState().finishRun({
      ok: false,
      cancelled: true,
      errors: {},
      outputs: {},
      duration: 5,
    })

    expect(getNodeRunState(useRunStore.getState(), 'llm')).toBe('skipped')
    expect(useRunStore.getState().status).toBe('cancelled')
  })

  it('失败时整次运行标记为 error', () => {
    useRunStore.getState().finishRun({
      ok: false,
      cancelled: false,
      errors: { llm: { code: 'runtime-error', message: '炸了' } },
      outputs: {},
      duration: 3,
    })

    expect(useRunStore.getState().status).toBe('error')
    expect(useRunStore.getState().error?.message).toBe('炸了')
  })
})

describe('试运行控制器（R5-4）', () => {
  it('空画布不能发起运行', () => {
    expect(canStartRun()).toBe(false)
  })

  it('有节点时可以发起运行', () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    })

    expect(canStartRun()).toBe(true)
  })

  it('运行结束后节点状态与运行记录一致', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    const result = await startRun({ variables: { query: '长邮件' } })

    expect(result.ok).toBe(true)
    const state = useRunStore.getState()
    expect(getNodeRunState(state, 'start')).toBe('success')
    expect(getNodeRunState(state, 'llm')).toBe('success')
    expect(state.records.llm?.state).toBe('success')
    expect(state.status).toBe('success')
  })

  it('运行期间锁定编辑', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    const promise = startRun()
    expect(isRunLocked()).toBe(true)
    await promise
    expect(isRunLocked()).toBe(false)
  })

  it('取消运行后状态为 cancelled', async () => {
    useFlowStore.setState({
      workflow: { nodes: [startNode, llmNode], edges, viewport: { ...DEFAULT_VIEWPORT } },
    })

    const promise = startRun()
    expect(cancelRun()).toBe(true)
    await promise

    expect(useRunStore.getState().status).toBe('cancelled')
  })

  it('没有正在进行的运行时取消返回 false', () => {
    expect(cancelRun()).toBe(false)
  })

  it('失败节点在画布状态与运行记录里同时体现', async () => {
    const brokenLlm: Node = {
      ...llmNode,
      data: { label: 'LLM', prompt: '{{start.ghost}}' },
    }
    useFlowStore.setState({
      workflow: {
        nodes: [startNode, brokenLlm],
        edges,
        viewport: { ...DEFAULT_VIEWPORT },
      },
    })

    const result = await startRun()

    expect(result.ok).toBe(false)
    const state = useRunStore.getState()
    expect(getNodeRunState(state, 'llm')).toBe('error')
    expect(state.records.llm?.error?.message).toContain('ghost')
  })
})
