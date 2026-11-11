import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { Edge, Node, Workflow } from '@flowsail/core'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'
import { hasReference } from '../lib/variables.ts'
import { getNodeRunState, useRunStore } from '../lib/runStore.ts'
import { isRunLocked } from '../lib/runController.ts'
import { DEFAULT_GRID_SIZE, snapPosition } from '../lib/marquee.ts'
import { findInputHandle } from '../lib/geometry.ts'
import { useFlowStore } from '../store/index.ts'

export interface NodeCardProps {
  node: Node
  /** 当前节点的输出锚点是否正在被拖拽连线。 */
  isConnectionSource: boolean
  /** 连线指针是否命中当前节点的输入锚点。 */
  isConnectionTarget: boolean
  /** 命中但连线非法时高亮为错误色。 */
  isConnectionTargetInvalid: boolean
  /** 主题（R8-2）：错误浮层 portal 到 body 后仍要带上同一主题。 */
  theme?: 'light' | 'dark' | undefined
  onConnectStart: (nodeId: string, handleId: string, clientX: number, clientY: number) => void
  /** 从已有连线的输入锚点反向拖出（R8-4、FR-E5）。 */
  onDisconnectStart: (edge: Edge, clientX: number, clientY: number) => void
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
  /** 按住修饰键时临时关闭网格吸附（Q23）。 */
  disableSnap: boolean
}

/** 拖动阈值（PRD 7.3）：小于 3px 视为点击，不进入拖拽态。 */
const DRAG_THRESHOLD = 3

/** 运行态的显示名（R5-5）。 */
const RUN_STATE_LABELS = {
  idle: '未运行',
  running: '运行中',
  success: '成功',
  error: '失败',
  skipped: '跳过',
} as const

/**
 * 单个节点卡片。拖拽逻辑封在组件顶层，避免在 `nodes.map()` 里调用 Hooks（G-3）。
 * 选择在 pointerdown 时发生（R2-2），位移在 pointermove 时更新，松手才写入历史（R2-4）。
 * 锚点来自节点类型注册表（R3-1、R3-3）：条件节点因此能有两个具名出口。
 */
export const NodeCard = ({
  node,
  isConnectionSource,
  isConnectionTarget,
  isConnectionTargetInvalid,
  theme,
  onConnectStart,
  onDisconnectStart,
}: NodeCardProps) => {
  const registry = useNodeTypeRegistry()
  const meta = resolveNodeType(registry, node.type)
  const dragRef = useRef<DragState | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const isSelected = Boolean(node.selected)

  // 节点运行态（R5-5）：与运行记录面板读同一份数据，状态始终一致。
  const runState = useRunStore((state) => getNodeRunState(state, node.id))
  // 运行记录（R6-6）：画布侧要能直接看到错误码、消息与堆栈。
  const runRecord = useRunStore((state) => state.records[node.id])
  // 入边（R8-4）：输入锚点上已有连线时，允许从锚点反向拖出摘线 / 改接。
  const incomingEdge = useFlowStore((state) =>
    state.workflow.edges.find((edge) => edge.target === node.id),
  )
  const [isErrorOpen, setIsErrorOpen] = useState(false)
  const [isStackOpen, setIsStackOpen] = useState(false)
  const [errorAnchor, setErrorAnchor] = useState<{ x: number; y: number } | null>(null)

  // 就地重命名（R6-3）：进入编辑态后聚焦输入框。
  useEffect(() => {
    if (!isRenaming) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isRenaming])

  const startRename = () => {
    // 运行中禁止编辑（R5-4、PRD Q8）。
    if (isRunLocked()) return
    setDraftLabel(String(node.data?.label ?? meta.label))
    setIsRenaming(true)
  }

  const commitRename = () => {
    if (!isRenaming) return
    setIsRenaming(false)
    const next = draftLabel.trim()
    // 名称没变时不产生历史记录。
    if (!next || next === String(node.data?.label ?? meta.label)) return
    useFlowStore.getState().renameNode(node.id, next)
  }

  const cancelRename = () => {
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename()
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()

    // 运行中禁止编辑（R5-4、PRD Q8）：运行态与实际文档不能脱节。
    if (isRunLocked()) return

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
      disableSnap: event.altKey,
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
      const position = { x: origin.x + dx, y: origin.y + dy }
      // 网格吸附（R6-4、Q23）：按住 Alt 临时关闭。
      const snapped = drag.disableSnap ? position : snapPosition(position)
      return { ...current, position: snapped }
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

  const handleConnectStart = (
    event: ReactPointerEvent<HTMLSpanElement>,
    handleId: string,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onConnectStart(node.id, handleId, event.clientX, event.clientY)
  }

  const handleDisconnectStart = (
    event: ReactPointerEvent<HTMLSpanElement>,
    edge: Edge,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onDisconnectStart(edge, event.clientX, event.clientY)
  }

  /**
   * 节点键盘操作（R8-3、FR-U3）：
   * Enter / Space 选中，方向键按网格步长移动选中节点（每次按键入一条历史）。
   * Delete 由画布的全局快捷键统一处理。
   */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // 重命名输入框里的按键由输入框自己处理。
    if (event.target !== event.currentTarget) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      useFlowStore.getState().selectNode(node.id, event.shiftKey)
      return
    }

    const delta =
      event.key === 'ArrowUp'
        ? { x: 0, y: -1 }
        : event.key === 'ArrowDown'
          ? { x: 0, y: 1 }
          : event.key === 'ArrowLeft'
            ? { x: -1, y: 0 }
            : event.key === 'ArrowRight'
              ? { x: 1, y: 0 }
              : null
    if (!delta) return

    event.preventDefault()
    // 运行中禁止编辑（R5-4、PRD Q8）。
    if (isRunLocked()) return

    const store = useFlowStore.getState()
    const selected = store.workflow.nodes.filter((candidate) => candidate.selected)
    const isInSelection = selected.some((candidate) => candidate.id === node.id)
    const movingIds = new Set(
      isInSelection ? selected.map((candidate) => candidate.id) : [node.id],
    )
    if (!isInSelection) store.selectNode(node.id)

    const before = useFlowStore.getState().workflow
    const nextNodes = before.nodes.map((candidate) =>
      movingIds.has(candidate.id)
        ? {
            ...candidate,
            position: {
              x: candidate.position.x + delta.x * DEFAULT_GRID_SIZE,
              y: candidate.position.y + delta.y * DEFAULT_GRID_SIZE,
            },
          }
        : candidate,
    )
    useFlowStore.getState().setNodes(nextNodes)
    useFlowStore.getState().pushHistory(before)
  }

  const className = [
    'flow-node',
    isSelected ? 'is-selected' : '',
    isDragging ? 'is-dragging' : '',
    isConnectionSource ? 'is-connection-source' : '',
    isRenaming ? 'is-renaming' : '',
    runState !== 'idle' ? `is-run-${runState}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const title = String(node.data?.label ?? meta.label)

  const inputs = meta.inputs ?? []
  const outputs = meta.outputs ?? []
  const connectedInputId = incomingEdge
    ? (findInputHandle(inputs, incomingEdge.targetHandle)?.id ?? inputs[0]?.id)
    : undefined
  const ariaLabel = `${title}，${meta.label}节点，运行状态：${RUN_STATE_LABELS[runState]}${
    isSelected ? '，已选中' : ''
  }`

  // 变量引用标记（R4-5）：参数里有 `{{nodeId.field}}` 时在卡片上给一个轻量提示。
  const hasVariableReference = (meta.params ?? []).some((schema) =>
    hasReference(node.data?.[schema.key]),
  )

  return (
    <div
      className={className}
      data-node-id={node.id}
      data-node-type={node.type ?? 'unknown'}
      style={{
        left: node.position.x,
        top: node.position.y,
        // 类型色落在左侧强调条与图标底色上，避免所有节点都是同一种蓝（v0.2.1）。
        borderLeftColor: meta.color,
      }}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={startRename}
    >
      <span
        className="flow-node__icon"
        style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
      >
        {meta.icon}
      </span>
      <span className="flow-node__body">
        {isRenaming ? (
          <input
            ref={inputRef}
            className="flow-node__rename"
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="节点名称"
          />
        ) : (
          <span className="flow-node__title" title={title}>
            {title}
          </span>
        )}
        <span className="flow-node__meta">
          <span
            className="flow-node__badge"
            style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
          >
            {meta.label}
          </span>

          {hasVariableReference ? (
            <span
              className="flow-node__reference"
              title="该节点的参数引用了上游变量"
              aria-label="该节点的参数引用了上游变量"
            >
              {'{{}}'}
            </span>
          ) : null}
        </span>
      </span>

      {runState !== 'idle' ? (
        <span className={`flow-node__run-badge is-${runState}`} data-run-state={runState}>
          {RUN_STATE_LABELS[runState]}
        </span>
      ) : null}

      {runRecord?.error ? (
        <div className="flow-node__error">
          <button
            type="button"
            className="flow-node__error-toggle"
            // 节点卡片在 pointerdown 时会 setPointerCapture，抢走后续的 click；
            // 这里阻止冒泡，按钮才收得到自己的点击（R6-6）。
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              // 画布有 overflow 裁剪，错误浮层改用 portal 渲染到 body，
              // 用按钮的屏幕坐标定位（R6-6）。
              const rect = event.currentTarget.getBoundingClientRect()
              setErrorAnchor({ x: rect.left, y: rect.bottom + 6 })
              setIsErrorOpen((current) => !current)
            }}
            aria-expanded={isErrorOpen}
            aria-label="查看错误详情"
            title="查看错误详情"
          >
            !
          </button>
          {isErrorOpen && errorAnchor
            ? createPortal(
                <>
                  {/* 点空白处关闭浮层。 */}
                  <div
                    className="flow-node__error-backdrop"
                    onPointerDown={() => setIsErrorOpen(false)}
                  />
                  <div
                    className="flow-node__error-popover"
                    role="alert"
                    data-theme={theme}
                    style={{ left: errorAnchor.x, top: errorAnchor.y }}
                  >
                    <div className="flow-node__error-head">
                      <span className="flow-node__error-code">{runRecord.error.code}</span>
                      <span className="flow-node__error-message">{runRecord.error.message}</span>
                    </div>
                    {runRecord.error.stack ? (
                      <>
                        <button
                          type="button"
                          className="flow-node__error-stack-toggle"
                          onClick={() => setIsStackOpen((current) => !current)}
                          aria-expanded={isStackOpen}
                        >
                          {isStackOpen ? '收起堆栈' : '展开堆栈'}
                        </button>
                        {isStackOpen ? (
                          <pre className="flow-node__error-stack">{runRecord.error.stack}</pre>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </>,
                document.body,
              )
            : null}
        </div>
      ) : null}

      {inputs.map((handle) => {
        const isConnected = connectedInputId === handle.id
        return (
          <span
            key={`in-${handle.id}`}
            className={[
              'flow-handle',
              'flow-handle--target',
              isConnected ? 'is-reconnectable' : '',
              isConnectionTarget ? 'is-connection-target' : '',
              isConnectionTargetInvalid ? 'is-invalid' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-handle-id={handle.id}
            style={{
              left: `${handle.offset * 100}%`,
              ...(isConnected ? { pointerEvents: 'auto' as const } : {}),
            }}
            aria-hidden="true"
            title={isConnected ? '从输入锚点拖出可断开或改接连线' : undefined}
            onPointerDown={
              isConnected && incomingEdge
                ? (event) => handleDisconnectStart(event, incomingEdge)
                : undefined
            }
          />
        )
      })}

      {outputs.map((handle) => (
        <span
          key={`out-${handle.id}`}
          className="flow-handle flow-handle--source"
          data-handle-id={handle.id}
          style={{ left: `${handle.offset * 100}%` }}
          aria-hidden="true"
          title={handle.label ? `拖拽创建连线（${handle.label}）` : '拖拽创建连线'}
          onPointerDown={(event) => handleConnectStart(event, handle.id)}
        />
      ))}
    </div>
  )
}
