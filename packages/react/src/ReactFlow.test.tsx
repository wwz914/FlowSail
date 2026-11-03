import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Node } from '@system'
import { ReactFlow } from './ReactFlow.tsx'
import { useFlowStore } from './store/index.ts'
import { DEFAULT_VIEWPORT } from './lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', position: { x: 40, y: 60 }, data: { label: 'Start' } },
]

beforeEach(() => {
  useFlowStore.setState({
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_VIEWPORT },
  })
})

describe('ReactFlow', () => {
  it('把 props 中的节点同步进 store 并渲染画布控件', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)

    expect(useFlowStore.getState().nodes).toEqual(nodes)
    expect(screen.getByText('Start')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByRole('button', { name: '适应画布' })).toBeTruthy()
  })

  it('为空画布时禁用适应画布', () => {
    render(<ReactFlow nodes={[]} edges={[]} />)

    expect(screen.getByRole('button', { name: '适应画布' })).toHaveProperty('disabled', true)
  })
})
