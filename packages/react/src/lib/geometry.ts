import type { Node } from '@system'

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
