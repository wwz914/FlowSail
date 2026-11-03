import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Node, Workflow } from '@system'
import { getNodeTypeMeta } from '../lib/nodeTypes.tsx'
import { useFlowStore } from '../store/index.ts'

export interface NodeCardProps {
  node: Node
  /** 当前节点的输出锚点是否正在被拖拽连线。 */
  isConnectionSource: boolean
  /** 连线指针是否命中当前节点的输入锚点。 */
  isConnectionTarget: boolean
  /** 命中但连线非法时高亮为错误色。 */
  isConnectionTargetInvalid: boolean
  onConnectStart: (nodeId: string, clientX: number, clientY: number) => void
}

interface DragOrigin {
  id: string
  x: number
  y: number
}

interface DragState {
  pointerId: number
  startClientX: number
  startClientY: number
  zoom: number
  /** 按下时所有选中节点的起始位置：多选时整体移动（FR-N2）。 */
  origins: DragOrigin[]
  /** 编辑前快照：整次拖拽只压入一条历史（R2-4）。 */
  before: Workflow
  moved: boolean
  /** 点在多选中的节点上但不拖动时，松手收敛为单选（R2-2）。 */
  collapseOnClick: boolean
}

/** 拖动阈值（PRD 7.3）：小于 3px 视为点击，不进入拖拽态。 */
const DRAG_THRESHOLD = 3

/**
 * 单个节点卡片。拖拽逻辑封在组件顶层，避免在 `nodes.map()` 里调用 Hooks（G-3）。
 * 选择在 pointerdown 时发生（R2-2），位移在 pointermove 时更新，松手才写入历史（R2-4）。
 */
export const NodeCard = ({
  node,
  isConnectionSource,
  isConnectionTarget,
  isConnectionTargetInvalid,
  onConnectStart,
}: NodeCardProps) => {
  const meta = getNodeTypeMeta(node.type)
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const isSelected = Boolean(node.selected)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()

    const store = useFlowStore.getState()
    if (event.shiftKey) {
      store.selectNode(node.id, true)
      return
    }

    const current = store.workflow.nodes.find((candidate) => candidate.id === node.id)
    const selectedBeforeClick = store.workflow.nodes.filter((candidate) => candidate.selected)
    if (!current?.selected) store.selectNode(node.id)

    const selectedNodes = useFlowStore.getState().workflow.nodes.filter((candidate) => candidate.selected)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      zoom: useFlowStore.getState().workflow.viewport.zoom,
      origins: selectedNodes.map((candidate) => ({
        id: candidate.id,
        x: candidate.position.x,
        y: candidate.position.y,
      })),
      before: useFlowStore.getState().workflow,
      moved: false,
      collapseOnClick: Boolean(current?.selected) && selectedBeforeClick.length > 1,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (!drag.moved) {
      const screenDistance = Math.hypot(
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
      )
      if (screenDistance < DRAG_THRESHOLD) return
      drag.moved = true
    }

    const dx = (event.clientX - drag.startClientX) / drag.zoom
    const dy = (event.clientY - drag.startClientY) / drag.zoom
    const origins = new Map(drag.origins.map((origin) => [origin.id, origin]))

    const nextNodes = useFlowStore.getState().workflow.nodes.map((current) => {
      const origin = origins.get(current.id)
      if (!origin) return current
      return { ...current, position: { x: origin.x + dx, y: origin.y + dy } }
    })
    useFlowStore.getState().setNodes(nextNodes)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsDragging(false)

    if (drag.moved) useFlowStore.getState().pushHistory(drag.before)
    else if (drag.collapseOnClick) useFlowStore.getState().selectNode(node.id)
  }

  const handleConnectStart = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onConnectStart(node.id, event.clientX, event.clientY)
  }

  const className = [
    'flow-node',
    isSelected ? 'is-selected' : '',
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

  const title = String(node.data?.label ?? meta.defaultLabel)

  return (
    <div
      className={className}
      data-node-id={node.id}
      data-node-type={node.type ?? 'unknown'}
      style={{ left: node.position.x, top: node.position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="flow-node__icon" style={{ color: meta.color }}>
        {meta.icon}
      </span>
      <span className="flow-node__title" title={title}>
        {title}
      </span>
      <span
        className="flow-node__badge"
        style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
      >
        {meta.label}
      </span>
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
