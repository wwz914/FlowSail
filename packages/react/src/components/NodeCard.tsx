import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Node } from '@system'
import { useFlowStore } from '../store/index.ts'

export interface NodeCardProps {
  node: Node
  /** 当前节点的输出锚点是否正在被拖拽连线。 */
  isConnectionSource: boolean
  /** 连线指针是否命中当前节点的输入锚点。 */
  isConnectionTarget: boolean
  /** 命中但连线非法时高亮为错误色。 */
  isConnectionTargetInvalid: boolean
  onNodesChange?: ((nodes: Node[]) => void) | undefined
  onConnectStart: (nodeId: string, clientX: number, clientY: number) => void
}

interface DragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  zoom: number
}

/**
 * 单个节点卡片。拖拽逻辑封在组件顶层，避免在 `nodes.map()` 里调用 Hooks（G-3）。
 */
export const NodeCard = ({
  node,
  isConnectionSource,
  isConnectionTarget,
  isConnectionTargetInvalid,
  onNodesChange,
  onConnectStart,
}: NodeCardProps) => {
  const zoom = useFlowStore((state) => state.viewport.zoom)
  const setNodes = useFlowStore((state) => state.setNodes)
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.position.x,
      startY: node.position.y,
      zoom,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = (event.clientX - drag.startClientX) / drag.zoom
    const dy = (event.clientY - drag.startClientY) / drag.zoom
    if (dx === 0 && dy === 0) return

    const nextNodes = useFlowStore.getState().nodes.map((current) =>
      current.id === node.id
        ? { ...current, position: { x: drag.startX + dx, y: drag.startY + dy } }
        : current,
    )
    setNodes(nextNodes)
    onNodesChange?.(nextNodes)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsDragging(false)
  }

  const handleConnectStart = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onConnectStart(node.id, event.clientX, event.clientY)
  }

  const className = [
    'flow-node',
    isDragging ? 'is-dragging' : '',
    isConnectionSource ? 'is-connection-source' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const targetHandleClassName = [
    'flow-handle',
    'flow-handle--target',
    isConnectionTarget ? 'is-connection-target' : '',
    isConnectionTargetInvalid ? 'is-invalid' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      data-node-id={node.id}
      style={{ left: node.position.x, top: node.position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="flow-node__title">{String(node.data?.label ?? node.id)}</span>
      <span className={targetHandleClassName} aria-hidden="true" />
      <span
        className="flow-handle flow-handle--source"
        aria-hidden="true"
        title="拖拽创建连线"
        onPointerDown={handleConnectStart}
      />
    </div>
  )
}
