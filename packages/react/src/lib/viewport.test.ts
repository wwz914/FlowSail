import { describe, expect, it } from 'vitest'
import type { Node } from '@system'
import {
  DEFAULT_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  getFitViewport,
  screenToFlow,
  zoomAtPoint,
} from './viewport.ts'

describe('clampZoom', () => {
  it('把缩放限制在 25%–200%', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(3)).toBe(MAX_ZOOM)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('非法值回落到 100%', () => {
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_VIEWPORT.zoom)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VIEWPORT.zoom)
  })
})

describe('zoomAtPoint', () => {
  it('缩放前后锚点下的世界坐标不漂移', () => {
    const before = { x: 100, y: 50, zoom: 1 }
    const anchor = { x: 250, y: 150 }
    const worldBefore = screenToFlow(anchor, { left: 0, top: 0 }, before)

    const after = zoomAtPoint(before, 2, anchor)
    const worldAfter = screenToFlow(anchor, { left: 0, top: 0 }, after)

    expect(after.zoom).toBe(2)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  it('达到上限时仍保持锚点不动', () => {
    const before = { x: 0, y: 0, zoom: 1 }
    const anchor = { x: 100, y: 100 }
    const worldBefore = screenToFlow(anchor, { left: 0, top: 0 }, before)

    const after = zoomAtPoint(before, 10, anchor)
    const worldAfter = screenToFlow(anchor, { left: 0, top: 0 }, after)

    expect(after.zoom).toBe(MAX_ZOOM)
    expect(worldAfter).toEqual(worldBefore)
  })
})

describe('screenToFlow', () => {
  it('同时扣除容器偏移与视口平移，再按缩放换算', () => {
    const point = screenToFlow(
      { x: 110, y: 160 },
      { left: 10, top: 20 },
      { x: 30, y: 40, zoom: 2 },
    )

    expect(point).toEqual({ x: 35, y: 50 })
  })
})

describe('getFitViewport', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 100, y: 100 } },
  ]

  it('把全部节点框进容器并居中', () => {
    const viewport = getFitViewport(nodes, 800, 600, 48)

    // 包围盒 200 × 140，受最大缩放 200% 限制，中心为 (100, 70)
    expect(viewport).toEqual({ x: 200, y: 160, zoom: 2 })
  })

  it('空画布返回默认视口', () => {
    expect(getFitViewport([], 800, 600)).toEqual(DEFAULT_VIEWPORT)
  })

  it('容器过小时缩放到下限', () => {
    const farApart: Node[] = [
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 2000, y: 2000 } },
    ]

    expect(getFitViewport(farApart, 200, 200, 48).zoom).toBe(MIN_ZOOM)
  })
})
