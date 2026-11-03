import type { Edge, Node } from '@system'
import { getTargetHandlePosition, type Point } from './geometry.ts'

/** 输入锚点的屏幕命中半径（px），对应 PRD「命中区 ≥ 12px」。 */
export const HANDLE_HIT_RADIUS = 12

export type ConnectionError = 'self' | 'duplicate' | 'target-occupied'

export const CONNECTION_ERROR_MESSAGES: Record<ConnectionError, string> = {
  self: '不能连接到自身',
  duplicate: '这两个节点之间已存在连线',
  'target-occupied': '目标节点已有输入连线',
}

/** 连线进行中的预览状态。 */
export interface ConnectionState {
  sourceId: string
  /** 指针当前所在的画布世界坐标。 */
  pointer: Point
  targetId: string | null
  error: ConnectionError | null
}

/**
 * 找到指针命中范围内的输入锚点。命中半径按屏幕像素计算，随缩放换算到世界坐标，
 * 因此任何缩放下命中区都保持同样的手感。
 */
export function findTargetNode(nodes: Node[], point: Point, zoom: number): string | null {
  if (nodes.length === 0) return null

  const radius = HANDLE_HIT_RADIUS / (zoom > 0 ? zoom : 1)
  let closestId: string | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const node of nodes) {
    const handle = getTargetHandlePosition(node)
    const distance = Math.hypot(handle.x - point.x, handle.y - point.y)
    if (distance <= radius && distance < closestDistance) {
      closestId = node.id
      closestDistance = distance
    }
  }

  return closestId
}

/**
 * 校验一条待创建的连线（FR-E4）：禁自连、禁重复、输入锚点默认单入。
 * 返回 null 表示可以创建。
 */
export function validateConnection(edges: Edge[], sourceId: string, targetId: string): ConnectionError | null {
  if (sourceId === targetId) return 'self'
  if (edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return 'duplicate'
  if (edges.some((edge) => edge.target === targetId)) return 'target-occupied'
  return null
}

const MIN_CURVE_OFFSET = 24

function getCurveOffset(source: Point, target: Point): number {
  return Math.max(
    MIN_CURVE_OFFSET,
    Math.abs(target.y - source.y) * 0.5,
    Math.abs(target.x - source.x) * 0.25,
  )
}

/** 从输出锚点到输入锚点的三次贝塞尔路径（竖向 S 曲线）。 */
export function getBezierPath(source: Point, target: Point): string {
  const offset = getCurveOffset(source, target)
  return [
    `M ${source.x},${source.y}`,
    `C ${source.x},${source.y + offset}`,
    `${target.x},${target.y - offset}`,
    `${target.x},${target.y}`,
  ].join(' ')
}

/** 贝塞尔曲线 t = 0.5 处的点，用于放置连线标签。 */
export function getBezierMidpoint(source: Point, target: Point): Point {
  const offset = getCurveOffset(source, target)
  const control1 = { x: source.x, y: source.y + offset }
  const control2 = { x: target.x, y: target.y - offset }

  return {
    x: (source.x + 3 * control1.x + 3 * control2.x + target.x) / 8,
    y: (source.y + 3 * control1.y + 3 * control2.y + target.y) / 8,
  }
}
