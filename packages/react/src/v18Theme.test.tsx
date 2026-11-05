import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { Node } from '@flowsail/core'
import { ReactFlow } from './ReactFlow.tsx'
import { useFlowStore } from './store/index.ts'
import { DEFAULT_VIEWPORT } from './lib/viewport.ts'

const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 40, y: 60 }, data: { label: 'Start' } },
]

function resetStore() {
  useFlowStore.setState({
    workflow: { nodes: [], edges: [], viewport: { ...DEFAULT_VIEWPORT } },
    past: [],
    future: [],
  })
}

beforeEach(resetStore)

describe('主题与背景（R8-2、FR-C1、FR-U4、Q33）', () => {
  it('theme 写到画布根节点的 data-theme', () => {
    const { rerender } = render(<ReactFlow nodes={nodes} edges={[]} theme="dark" />)
    const canvas = document.querySelector('.react-flow')
    expect(canvas?.getAttribute('data-theme')).toBe('dark')

    rerender(<ReactFlow nodes={nodes} edges={[]} theme="light" />)
    expect(canvas?.getAttribute('data-theme')).toBe('light')
  })

  it('省略 theme 时不覆盖宿主在祖先上设置的主题', () => {
    render(<ReactFlow nodes={nodes} edges={[]} />)
    expect(document.querySelector('.react-flow')?.getAttribute('data-theme')).toBeNull()
  })

  it('background=false 关闭点阵网格，ReactNode 作为自定义背景', () => {
    const { rerender } = render(<ReactFlow nodes={nodes} edges={[]} background={false} />)
    expect(document.querySelector('.flow-background')).toBeNull()

    rerender(
      <ReactFlow
        nodes={nodes}
        edges={[]}
        background={<div data-testid="custom-background" />}
      />,
    )
    const background = document.querySelector('.flow-background')
    expect(background?.classList.contains('flow-background--custom')).toBe(true)
    expect(background?.querySelector('[data-testid="custom-background"]')).toBeTruthy()
  })
})
