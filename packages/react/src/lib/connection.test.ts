import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@system'
import {
  HANDLE_HIT_RADIUS,
  findTargetNode,
  getBezierMidpoint,
  getBezierPath,
  validateConnection,
} from './connection.ts'

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 } },
  { id: 'b', position: { x: 200, y: 0 } },
]

const edges: Edge[] = [{ id: 'e-a-b', source: 'a', target: 'b' }]

describe('findTargetNode', () => {
  it('命中输入锚点（节点上边缘中点）时返回节点 id', () => {
    // 节点 a 的输入锚点在 (80, 0)，指针在其下方 2px
    expect(findTargetNode(nodes, { x: 80, y: 2 }, 1)).toBe('a')
  })

  it('超出命中半径时返回 null', () => {
    expect(findTargetNode(nodes, { x: 80, y: 30 }, 1)).toBeNull()
  })

  it('命中半径按缩放换算，始终对应屏幕上的固定像素', () => {
    const offset = HANDLE_HIT_RADIUS / 2 + 1

    expect(findTargetNode(nodes, { x: 80, y: offset }, 1)).toBe('a')
    expect(findTargetNode(nodes, { x: 80, y: offset }, 2)).toBeNull()
  })

  it('多个锚点同时命中时取最近的', () => {
    const overlapping: Node[] = [
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 0, y: 10 } },
    ]

    expect(findTargetNode(overlapping, { x: 80, y: 9 }, 1)).toBe('b')
  })
})

describe('validateConnection', () => {
  it('禁止自连', () => {
    expect(validateConnection(edges, 'a', 'a')).toBe('self')
  })

  it('禁止重复连线', () => {
    expect(validateConnection(edges, 'a', 'b')).toBe('duplicate')
  })

  it('输入锚点默认单入', () => {
    expect(validateConnection(edges, 'c', 'b')).toBe('target-occupied')
  })

  it('合法连线返回 null', () => {
    expect(validateConnection(edges, 'a', 'c')).toBeNull()
  })
})

describe('getBezierPath', () => {
  it('生成从输出锚点到输入锚点的三次贝塞尔曲线', () => {
    expect(getBezierPath({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(
      'M 0,0 C 0,50 0,50 0,100',
    )
  })

  it('横向距离也会撑开曲线', () => {
    const path = getBezierPath({ x: 0, y: 0 }, { x: 400, y: 0 })
    expect(path).toContain('C 0,100 400,-100 400,0')
  })
})

describe('getBezierMidpoint', () => {
  it('垂直连线的中点落在中线上', () => {
    expect(getBezierMidpoint({ x: 0, y: 0 }, { x: 0, y: 100 })).toEqual({ x: 0, y: 50 })
  })
})
