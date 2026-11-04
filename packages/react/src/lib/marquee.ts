import type { Node } from '@system'
import { NODE_HEIGHT, NODE_WIDTH, type Bounds, type Point } from './geometry.ts'

/**
 * 框选的几何计算（R6-1、FR-N5、X-1）。
 *
 * 纯函数，不碰 DOM 与 store，便于单测覆盖命中判定。
 */

/** 默认网格步长（像素，R6-4、Q23）。 */
export const DEFAULT_GRID_SIZE = 8

/**
 * 选框（画布世界坐标下的矩形）。
 *
 * 起点与终点可能任意方向，因此这里统一存"左上角 + 右下角"，
 * 由 `normalizeRect` 计算。
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 把两点构成的拖拽选框规范化成左上角 + 尺寸。 */
export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

/** 节点在画布世界坐标下的包围盒（与节点固定尺寸一致）。 */
export function getNodeBounds(node: Node): Bounds {
  return {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + NODE_WIDTH,
    maxY: node.position.y + NODE_HEIGHT,
  }
}

/**
 * 两个矩形是否相交（R6-1）。
 *
 * 框选采用"相交即命中"，而不是"完全包含"——用户拖出一个较大的框
 * 把节点圈进来是常见意图，要求完全包含会让手感很差。
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** 选框是否命中节点。 */
export function rectHitsNode(rect: Rect, node: Node): boolean {
  const bounds = getNodeBounds(node)
  return rectsIntersect(rect, {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  })
}

/**
 * 选出被选框命中的节点 id（R6-1）。
 *
 * `additive` 为真时返回"新增命中的 id"（用于 Shift 追加）；
 * 为假时返回"全部命中的 id"（用于替换选区）。
 */
export function getMarqueeHits(
  nodes: Node[],
  rect: Rect,
  additive = false,
): string[] {
  const hits = nodes.filter((node) => rectHitsNode(rect, node)).map((node) => node.id)
  if (!additive) return hits
  const selected = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
  return hits.filter((id) => !selected.has(id))
}

/**
 * 把坐标吸附到网格（R6-4、Q23）。
 *
 * `size` 步长不大于 0 时不吸附（关闭吸附的兜底）。
 */
export function snapValue(value: number, size: number = DEFAULT_GRID_SIZE): number {
  if (!Number.isFinite(value) || size <= 0) return value
  return Math.round(value / size) * size
}

/**
 * 把节点位置吸附到网格（R6-4）。
 *
 * 只吸附位置，不改变节点尺寸与锚点几何——锚点由 `handle.offset` 决定，
 * 与节点位置无关，吸附不会影响连线端点的计算。
 */
export function snapPosition(
  position: Point,
  size: number = DEFAULT_GRID_SIZE,
): Point {
  if (size <= 0) return position
  return {
    x: snapValue(position.x, size),
    y: snapValue(position.y, size),
  }
}
