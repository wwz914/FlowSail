import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Edge, Node } from '@system'
import './style.scss'
import { useFlowStore } from './store/index.ts'
import { NodeRenderer } from './components/NodeRenderer.tsx'
import { EdgeRenderer } from './components/EdgeRenderer.tsx'
import {
  CONNECTION_ERROR_MESSAGES,
  findTargetNode,
  validateConnection,
  type ConnectionState,
} from './lib/connection.ts'
import {
  getFitViewport,
  screenToFlow,
  zoomAtPoint,
} from './lib/viewport.ts'
import type { Point } from './lib/geometry.ts'

const EMPTY_NODES: Node[] = []
const EMPTY_EDGES: Edge[] = []

export interface ReactFlowProps {
  nodes?: Node[]
  edges?: Edge[]
  onNodesChange?: (nodes: Node[]) => void
  onEdgesChange?: (edges: Edge[]) => void
  children?: ReactNode
}

interface PanState {
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** 客户端坐标 → 画布世界坐标（以容器左上角为原点）。 */
function toFlowPoint(container: HTMLElement, clientX: number, clientY: number): Point {
  const rect = container.getBoundingClientRect()
  return screenToFlow({ x: clientX, y: clientY }, rect, useFlowStore.getState().viewport)
}

/**
 * 画布容器：负责视口（缩放/平移）、节点层与连线层的组装，以及连线创建交互。
 */
export const ReactFlow = ({
  nodes = EMPTY_NODES,
  edges = EMPTY_EDGES,
  onNodesChange,
  onEdgesChange,
  children,
}: ReactFlowProps) => {
  const viewport = useFlowStore((state) => state.viewport)
  const nodeCount = useFlowStore((state) => state.nodes.length)
  const setNodes = useFlowStore((state) => state.setNodes)
  const setEdges = useFlowStore((state) => state.setEdges)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<PanState | null>(null)
  const connectionSourceRef = useRef<string | null>(null)
  const onEdgesChangeRef = useRef(onEdgesChange)

  const [connection, setConnection] = useState<ConnectionState | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const isConnecting = connection !== null

  useEffect(() => {
    onEdgesChangeRef.current = onEdgesChange
  }, [onEdgesChange])

  // props → store：示例与宿主传入的文档变化时同步到内部状态。
  useEffect(() => {
    setNodes(nodes)
    setEdges(edges)
  }, [nodes, edges, setNodes, setEdges])

  // 滚轮缩放，以指针位置为锚点（C-1）。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const delta =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      useFlowStore.getState().setViewport((current) =>
        zoomAtPoint(current, current.zoom * Math.exp(-delta * 0.0015), anchor),
      )
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // 空格平移（C-1）。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return
      event.preventDefault()
      setIsSpacePressed(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setIsSpacePressed(false)
    }
    const handleBlur = () => {
      setIsSpacePressed(false)
      panRef.current = null
      setIsPanning(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // 连线创建：拖动中实时预览、命中校验、松开落库（C-4、C-5、C-7）。
  useEffect(() => {
    if (!isConnecting) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const resolveConnection = (event: PointerEvent, commit: boolean) => {
      const sourceId = connectionSourceRef.current
      if (!sourceId) return

      const { nodes: currentNodes, edges: currentEdges } = useFlowStore.getState()
      const pointer = toFlowPoint(container, event.clientX, event.clientY)
      const targetId = findTargetNode(
        currentNodes,
        pointer,
        useFlowStore.getState().viewport.zoom,
      )
      const error = targetId ? validateConnection(currentEdges, sourceId, targetId) : null

      if (commit && targetId && !error) {
        const nextEdges = [
          ...currentEdges,
          { id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId },
        ]
        useFlowStore.getState().setEdges(nextEdges)
        onEdgesChangeRef.current?.(nextEdges)
      }

      connectionSourceRef.current = null
      setConnection(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sourceId = connectionSourceRef.current
      if (!sourceId) return

      const { nodes: currentNodes, edges: currentEdges, viewport: currentViewport } = useFlowStore.getState()
      const pointer = toFlowPoint(container, event.clientX, event.clientY)
      const targetId = findTargetNode(currentNodes, pointer, currentViewport.zoom)
      const error = targetId ? validateConnection(currentEdges, sourceId, targetId) : null

      setConnection({ sourceId, pointer, targetId, error })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      resolveConnection(event, true)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      connectionSourceRef.current = null
      setConnection(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isConnecting])

  const handleConnectStart = (nodeId: string, clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return
    connectionSourceRef.current = nodeId
    setConnection({
      sourceId: nodeId,
      pointer: toFlowPoint(container, clientX, clientY),
      targetId: null,
      error: null,
    })
  }

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldPan = event.button === 1 || (event.button === 0 && isSpacePressed)
    if (!shouldPan) return

    event.preventDefault()
    event.stopPropagation()
    const currentViewport = useFlowStore.getState().viewport
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: currentViewport.x,
      originY: currentViewport.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsPanning(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return

    useFlowStore.getState().setViewport((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startClientX,
      y: pan.originY + event.clientY - pan.startClientY,
    }))
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    panRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsPanning(false)
  }

  const zoomAtCenter = (nextZoom: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const anchor = { x: rect.width / 2, y: rect.height / 2 }
    useFlowStore.getState().setViewport((current) => zoomAtPoint(current, nextZoom, anchor))
  }

  const fitView = () => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const currentNodes = useFlowStore.getState().nodes
    if (currentNodes.length === 0) return
    useFlowStore.getState().setViewport(getFitViewport(currentNodes, rect.width, rect.height))
  }

  const className = [
    'react-flow',
    isSpacePressed ? 'is-pannable' : '',
    isPanning ? 'is-panning' : '',
    isConnecting ? 'is-connecting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const connectionError = connection?.targetId ? connection.error : null

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div
        className="flow-background"
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
        }}
      />

      <div
        className="flow-viewport"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        <EdgeRenderer connection={connection} />
        <NodeRenderer
          connection={connection}
          onNodesChange={onNodesChange}
          onConnectStart={handleConnectStart}
        />
      </div>

      <div className="flow-controls">
        <button
          type="button"
          className="flow-controls__button"
          onClick={() => zoomAtCenter(viewport.zoom * 0.8)}
          aria-label="缩小"
          title="缩小"
        >
          −
        </button>
        <button
          type="button"
          className="flow-controls__zoom"
          onClick={() => zoomAtCenter(1)}
          aria-label={`当前缩放 ${Math.round(viewport.zoom * 100)}%，点击重置为 100%`}
          title="重置为 100%"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          className="flow-controls__button"
          onClick={() => zoomAtCenter(viewport.zoom * 1.25)}
          aria-label="放大"
          title="放大"
        >
          +
        </button>
        <button
          type="button"
          className="flow-controls__button flow-controls__fit"
          onClick={fitView}
          disabled={nodeCount === 0}
          aria-label="适应画布"
          title="适应画布"
        >
          适应
        </button>
      </div>

      {connectionError ? (
        <div className="flow-hint" role="status">
          {CONNECTION_ERROR_MESSAGES[connectionError]}
        </div>
      ) : null}

      {children}
    </div>
  )
}
