import { describe, expect, it } from 'vitest'
import type { Node } from '@system'
import {
  DEFAULT_GRID_SIZE,
  getMarqueeHits,
  getNodeBounds,
  normalizeRect,
  rectHitsNode,
  rectsIntersect,
  snapPosition,
  snapValue,
} from './marquee.ts'

function node(id: string, x: number, y: number, selected = false): Node {
  return { id, type: 'start', position: { x, y }, data: {}, ...(selected ? { selected } : {}) }
}

describe('框选几何（R6-1）', () => {
  it('normalizeRect 把任意方向的拖拽统一成左上角 + 尺寸', () => {
    expect(normalizeRect({ x: 100, y: 100 }, { x: 20, y: 40 })).toEqual({
      x: 20,
      y: 40,
      width: 80,
      height: 60,
    })
  })

  it('rectsIntersect 判定相交', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    expect(rectsIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true)
    expect(rectsIntersect(a, { x: 200, y: 200, width: 10, height: 10 })).toBe(false)
  })

  it('getNodeBounds 使用固定卡片尺寸（160 × 48）', () => {
    expect(getNodeBounds(node('a', 10, 20))).toEqual({
      minX: 10,
      minY: 20,
      maxX: 170,
      maxY: 68,
    })
  })

  it('选框与节点相交即命中（不要求完全包含）', () => {
    const target = node('a', 100, 100)
    // 只圈住节点的一角也算命中。
    expect(rectHitsNode({ x: 150, y: 130, width: 30, height: 30 }, target)).toBe(true)
    // 完全没碰到。
    expect(rectHitsNode({ x: 400, y: 400, width: 30, height: 30 }, target)).toBe(false)
  })

  it('getMarqueeHits 返回命中的节点 id', () => {
    const nodes = [node('a', 0, 0), node('b', 500, 500), node('c', 20, 20)]
    const rect = { x: 0, y: 0, width: 300, height: 300 }
    expect(getMarqueeHits(nodes, rect)).toEqual(['a', 'c'])
  })

  it('Shift 拖拽（additive）只返回新增命中，不重复已选中的', () => {
    const nodes = [node('a', 0, 0, true), node('b', 20, 20), node('c', 500, 500)]
    const rect = { x: 0, y: 0, width: 300, height: 300 }
    expect(getMarqueeHits(nodes, rect, true)).toEqual(['b'])
    // 非追加时返回全部命中（包括已选中的）。
    expect(getMarqueeHits(nodes, rect, false)).toEqual(['a', 'b'])
  })

  it('空画布拖拽不报错，返回空命中', () => {
    expect(getMarqueeHits([], { x: 0, y: 0, width: 10, height: 10 })).toEqual([])
  })
})

describe('网格吸附（R6-4、Q23）', () => {
  it('默认步长是 8px', () => {
    expect(DEFAULT_GRID_SIZE).toBe(8)
  })

  it('snapValue 就近取整到步长', () => {
    expect(snapValue(30)).toBe(32)
    expect(snapValue(28)).toBe(32)
    expect(snapValue(27)).toBe(24)
    expect(snapValue(0)).toBe(0)
    expect(snapValue(-30)).toBe(-32)
  })

  it('步长可配', () => {
    expect(snapValue(17, 10)).toBe(20)
    expect(snapValue(14, 10)).toBe(10)
  })

  it('步长不大于 0 时不吸附（关闭吸附的兜底）', () => {
    expect(snapValue(17, 0)).toBe(17)
    expect(snapPosition({ x: 17, y: 23 }, 0)).toEqual({ x: 17, y: 23 })
  })

  it('snapPosition 同时吸附 x 与 y', () => {
    expect(snapPosition({ x: 30, y: 45 })).toEqual({ x: 32, y: 48 })
  })

  it('非有限值原样返回', () => {
    expect(snapValue(Number.NaN)).toBeNaN()
  })
})
