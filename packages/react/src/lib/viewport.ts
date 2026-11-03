import { getNodesBounds, type Point } from './geometry.ts'

/** 视口变换：画布世界的平移 + 缩放。 */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
export const FIT_VIEW_PADDING = 48

/** 把缩放限制在 25%–200%，非法值回落到 100%。 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_VIEWPORT.zoom
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * 以容器内的 `anchor` 为锚点缩放：缩放前后，锚点下的画布世界坐标保持不动。
 */
export function zoomAtPoint(viewport: Viewport, nextZoom: number, anchor: Point): Viewport {
  const zoom = clampZoom(nextZoom)
  const worldX = (anchor.x - viewport.x) / viewport.zoom
  const worldY = (anchor.y - viewport.y) / viewport.zoom

  return {
    x: anchor.x - worldX * zoom,
    y: anchor.y - worldY * zoom,
    zoom,
  }
}

/** 容器在视口中的位置，只需要 left/top 参与换算。 */
export interface ContainerRect {
  left: number
  top: number
}

/** 客户端（屏幕）坐标 → 画布世界坐标。 */
export function screenToFlow(client: Point, container: ContainerRect, viewport: Viewport): Point {
  return {
    x: (client.x - container.left - viewport.x) / viewport.zoom,
    y: (client.y - container.top - viewport.y) / viewport.zoom,
  }
}

/** 画布世界坐标 → 客户端（屏幕）坐标。 */
export function flowToScreen(point: Point, container: ContainerRect, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.x + container.left,
    y: point.y * viewport.zoom + viewport.y + container.top,
  }
}

/**
 * 计算能把全部节点框进容器的视口；空画布返回默认视口。
 */
export function getFitViewport(
  nodes: Parameters<typeof getNodesBounds>[0],
  width: number,
  height: number,
  padding: number = FIT_VIEW_PADDING,
): Viewport {
  const bounds = getNodesBounds(nodes)
  if (!bounds || width <= 0 || height <= 0) {
    return { ...DEFAULT_VIEWPORT }
  }

  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const availableWidth = Math.max(width - padding * 2, 1)
  const availableHeight = Math.max(height - padding * 2, 1)
  const zoom = clampZoom(Math.min(availableWidth / contentWidth, availableHeight / contentHeight))
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return {
    x: width / 2 - centerX * zoom,
    y: height / 2 - centerY * zoom,
    zoom,
  }
}
