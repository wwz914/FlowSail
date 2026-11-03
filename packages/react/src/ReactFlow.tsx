import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { Edge, Node } from '@system'
import './style.scss'
import { useFlowStore, getSelection, getSelectionKey, type SelectionState } from './store/index.ts'
import { NodeRenderer } from './components/NodeRenderer.tsx'
import { EdgeRenderer } from './components/EdgeRenderer.tsx'
import { NodePanel, NODE_DRAG_MIME } from './components/NodePanel.tsx'
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
import { NODE_HEIGHT, NODE_WIDTH, type Point } from './lib/geometry.ts'
import { getNodeTypeMeta } from './lib/nodeTypes.tsx'

const EMPTY_NODES: Node[] = []
const EMPTY_EDGES: Edge[] = []

let nodeIdSequence = 0

function createNodeId(type: string): string {
  nodeIdSequence += 1
  return `node-${type}-${nodeIdSequence}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** 面板与控件是画布上的覆盖层，拖放落在它们上面时不创建节点。 */
function isOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.flow-node-panel, .flow-controls'))
}

/** 客户端坐标 → 画布世界坐标（以容器左上角为原点）。 */
function toFlowPoint(container: HTMLElement, clientX: number, clientY: number): Point {
  const rect = container.getBoundingClientRect()
  return screenToFlow({ x: clientX, y: clientY }, rect, useFlowStore.getState().workflow.viewport)
}

export interface ReactFlowProps {
  /** 初始文档（R2-7：v1 为非受控 + 初始值语义，宿主重渲染不会冲掉内部编辑）。 */
  nodes?: Node[]
  edges?: Edge[]
  onNodesChange?: (nodes: Node[]) => void
  onEdgesChange?: (edges: Edge[]) => void
  onSelectionChange?: (selection: SelectionState) => void
  children?: ReactNode
}

interface PanState {
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
}

/**
 * 画布容器：负责视口（缩放/平移）、节点层与连线层的组装，以及连线创建交互。
 * 选择、删除、撤销重做与节点创建入口在 R2 补齐。
 */
export const ReactFlow = ({
  nodes = EMPTY_NODES,
  edges = EMPTY_EDGES,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  children,
}: ReactFlowProps) => {
  const viewport = useFlowStore((state) => state.workflow.viewport)
  const nodeCount = useFlowStore((state) => state.workflow.nodes.length)
  const setNodes = useFlowStore((state) => state.setNodes)
  const setEdges = useFlowStore((state) => state.setEdges)
  const resetHistory = useFlowStore((state) => state.resetHistory)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<PanState | null>(null)
  const connectionSourceRef = useRef<string | null>(null)
  const onNodesChangeRef = useRef(onNodesChange)
  const onEdgesChangeRef = useRef(onEdgesChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const nodesPropsKeyRef = useRef<string | null>(null)
  const edgesPropsKeyRef = useRef<string | null>(null)

  const [connection, setConnection] = useState<ConnectionState | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const isConnecting = connection !== null

  useEffect(() => {
    onNodesChangeRef.current = onNodesChange
    onEdgesChangeRef.current = onEdgesChange
    onSelectionChangeRef.current = onSelectionChange
  }, [onNodesChange, onEdgesChange, onSelectionChange])

  // 非受控 + 初始值语义（R2-7）：只有 props 内容真的变了才同步，
  // 宿主每次渲染传出的新数组不会冲掉内部编辑状态。
  useEffect(() => {
    const key = JSON.stringify(nodes)
    if (nodesPropsKeyRef.current === key) return
    nodesPropsKeyRef.current = key
    setNodes(nodes)
    resetHistory()
  }, [nodes, setNodes, resetHistory])

  useEffect(() => {
    const key = JSON.stringify(edges)
    if (edgesPropsKeyRef.current === key) return
    edgesPropsKeyRef.current = key
    setEdges(edges)
    resetHistory()
  }, [edges, setEdges, resetHistory])

  // 内部文档变化 → 宿主回调；只在内容引用变化时触发，拖拽移动也会通知。
  useEffect(() => {
    let previous = useFlowStore.getState()
    return useFlowStore.subscribe((state) => {
      if (state.workflow.nodes !== previous.workflow.nodes) {
        onNodesChangeRef.current?.(state.workflow.nodes)
      }
      if (state.workflow.edges !== previous.workflow.edges) {
        onEdgesChangeRef.current?.(state.workflow.edges)
      }
      if (getSelectionKey(state.workflow) !== getSelectionKey(previous.workflow)) {
        onSelectionChangeRef.current?.(getSelection(state.workflow))
      }
      previous = state
    })
  }, [])

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

  // 编辑快捷键（R2-2、R2-3、R2-4）：Esc 取消选择，Delete/Backspace 删除，Ctrl/Cmd+Z 撤销重做。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) useFlowStore.getState().redo()
        else useFlowStore.getState().undo()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (useFlowStore.getState().deleteSelection()) event.preventDefault()
        return
      }

      if (event.key === 'Escape') {
        useFlowStore.getState().clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 连线创建：拖动中实时预览、命中校验、松开落库（C-4、C-5、C-7）。
  useEffect(() => {
    if (!isConnecting) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const resolveConnection = (event: PointerEvent, commit: boolean) => {
      const sourceId = connectionSourceRef.current
      if (!sourceId) return

      const { nodes: currentNodes, edges: currentEdges } = useFlowStore.getState().workflow
      const pointer = toFlowPoint(container, event.clientX, event.clientY)
      const targetId = findTargetNode(
        currentNodes,
        pointer,
        useFlowStore.getState().workflow.viewport.zoom,
      )
      const error = targetId ? validateConnection(currentEdges, sourceId, targetId) : null

      if (commit && targetId && !error) {
        useFlowStore
          .getState()
          .addEdge({ id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId })
      }

      connectionSourceRef.current = null
      setConnection(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sourceId = connectionSourceRef.current
      if (!sourceId) return

      const {
        nodes: currentNodes,
        edges: currentEdges,
        viewport: currentViewport,
      } = useFlowStore.getState().workflow
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

  // 点击画布空白取消选择（R2-2）；节点、连线与覆盖层各自阻止冒泡。
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isSpacePressed) return
    if (isOverlayTarget(event.target)) return
    useFlowStore.getState().clearSelection()
  }

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

  const createNodeAt = (type: string, clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return

    const point = toFlowPoint(container, clientX, clientY)
    const meta = getNodeTypeMeta(type)
    useFlowStore.getState().addNode({
      id: createNodeId(type),
      type,
      position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
      data: { label: meta.defaultLabel },
    })
  }

  // 点击面板项：在画布中心创建，并做少量错位避免完全重叠。
  const handlePanelAdd = (type: string) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cascade = (useFlowStore.getState().workflow.nodes.length % 5) * 24
    createNodeAt(type, rect.left + rect.width / 2 + cascade, rect.top + rect.height / 2 + cascade)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(NODE_DRAG_MIME)) return
    if (isOverlayTarget(event.target)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const type = event.dataTransfer.getData(NODE_DRAG_MIME)
    if (!type) return
    event.preventDefault()
    if (isOverlayTarget(event.target)) return
    createNodeAt(type, event.clientX, event.clientY)
  }

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldPan = event.button === 1 || (event.button === 0 && isSpacePressed)
    if (!shouldPan) return

    event.preventDefault()
    event.stopPropagation()
    const currentViewport = useFlowStore.getState().workflow.viewport
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
    const currentNodes = useFlowStore.getState().workflow.nodes
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
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
        <NodeRenderer connection={connection} onConnectStart={handleConnectStart} />
      </div>

      <NodePanel onAddNode={handlePanelAdd} />

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
