import type { Node } from '@flowsail/core'
import type { HandleDefinition } from './registry.ts'

/** 画布上的一个点，单位为 px。 */
export interface Point {
  x: number
  y: number
}

/**
 * R2 阶段节点卡片使用固定尺寸（PRD Q7：160 × 48）；节点类型体系（N-1/N-2）
 * 建立后再替换为测量值。连线端点与适应画布都依赖这两个常量。
 */
export const NODE_WIDTH = 160
export const NODE_HEIGHT = 48

/** 输出锚点：节点下边缘中点。 */
export function getSourceHandlePosition(node: Node): Point {
  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y + NODE_HEIGHT,
  }
}

/** 输入锚点：节点上边缘中点。 */
export function getTargetHandlePosition(node: Node): Point {
  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y,
  }
}

/**
 * 具名出口锚点的位置（R3-3）。
 * 出口在节点下边缘按 `offset` 横向分布，条件节点的两个出口因此分开。
 */
export function getSourceHandlePositionById(
  node: Node,
  handle: HandleDefinition,
): Point {
  return {
    x: node.position.x + NODE_WIDTH * handle.offset,
    y: node.position.y + NODE_HEIGHT,
  }
}

/** 具名入口锚点的位置（R3-3）。 */
export function getTargetHandlePositionById(
  node: Node,
  handle: HandleDefinition,
): Point {
  return {
    x: node.position.x + NODE_WIDTH * handle.offset,
    y: node.position.y,
  }
}

/**
 * 找到节点的出口锚点定义（R3-3）。
 * 连线没写 `sourceHandle` 时回落到第一个出口。
 */
export function findOutputHandle(
  outputs: HandleDefinition[] | undefined,
  handleId?: string,
): HandleDefinition | undefined {
  if (!outputs || outputs.length === 0) return undefined
  if (handleId) {
    const matched = outputs.find((handle) => handle.id === handleId)
    if (matched) return matched
  }
  return outputs[0]
}

/** 找到节点的入口锚点定义（R3-3）。 */
export function findInputHandle(
  inputs: HandleDefinition[] | undefined,
  handleId?: string,
): HandleDefinition | undefined {
  if (!inputs || inputs.length === 0) return undefined
  if (handleId) {
    const matched = inputs.find((handle) => handle.id === handleId)
    if (matched) return matched
  }
  return inputs[0]
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 所有节点的包围盒，包含节点自身尺寸；空数组返回 null。 */
export function getNodesBounds(nodes: Node[]): Bounds | null {
  if (nodes.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    const right = node.position.x + NODE_WIDTH
    const bottom = node.position.y + NODE_HEIGHT
    if (node.position.x < minX) minX = node.position.x
    if (node.position.y < minY) minY = node.position.y
    if (right > maxX) maxX = right
    if (bottom > maxY) maxY = bottom
  }

  return { minX, minY, maxX, maxY }
}
