import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { Edge, Node, Workflow } from '@flowsail/core'
import './style.scss'
import { useFlowStore, getSelection, getSelectionKey, type SelectionState } from './store/index.ts'
import { NodeRenderer } from './components/NodeRenderer.tsx'
import { EdgeRenderer } from './components/EdgeRenderer.tsx'
import { SelectionToolbar } from './components/SelectionToolbar.tsx'
import { NodePanel, NODE_DRAG_MIME } from './components/NodePanel.tsx'
import { ConfigPanel } from './components/ConfigPanel.tsx'
import { RunPanel } from './components/RunPanel.tsx'
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
import { registerCanvasContainer } from './lib/actions.ts'
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  findInputHandle,
  findOutputHandle,
  type Point,
} from './lib/geometry.ts'
import {
  getMarqueeHits,
  normalizeRect,
  type Rect,
} from './lib/marquee.ts'
import {
  copySelection,
  getClipboardContent,
  isClipboardEmpty,
  pasteClipboard,
} from './lib/clipboard.ts'
import { resolveNodeType } from './lib/registry.ts'
import { NodeTypeRegistryContext, buildRegistry } from './lib/registryContext.tsx'
import type { NodeTypeDefinition } from './lib/registry.ts'
import { useRunStore } from './lib/runStore.ts'
import { isRunLocked } from './lib/runController.ts'

const EMPTY_NODES: Node[] = []
const EMPTY_EDGES: Edge[] = []

let nodeIdSequence = 0

function createNodeId(type: string): string {
  nodeIdSequence += 1
  return `node-${type}-${nodeIdSequence}`
}

let edgeIdSequence = 0

function createEdgeId(sourceId: string, targetId: string): string {
  edgeIdSequence += 1
  return `e-${sourceId}-${targetId}-${edgeIdSequence}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** 面板与控件是画布上的覆盖层，拖放落在它们上面时不创建节点。 */
function isOverlayTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('.flow-node-panel, .flow-controls, .flow-selection-toolbar'))
  )
}

/** 客户端坐标 → 画布世界坐标（以容器左上角为原点）。 */
function toFlowPoint(container: HTMLElement, clientX: number, clientY: number): Point {
  const rect = container.getBoundingClientRect()
  return screenToFlow({ x: clientX, y: clientY }, rect, useFlowStore.getState().workflow.viewport)
}

export interface ReactFlowProps {
  /** 初始文档（R2-7：v1 为非受控主语义，props 变化时按内容差异同步，宿主重渲染不会冲掉内部编辑）。 */
  nodes?: Node[]
  edges?: Edge[]
  /**
   * 受控模式下的文档（R4-2、FR-X1）。
   * 传入后画布进入受控模式：内部编辑通过 `onChange` 写回宿主，
   * 宿主改文档后画布同步回流。省略时保持非受控用法，行为与 v1.3 一致。
   */
  workflow?: Workflow
  /** 宿主注册的自定义节点类型（R3-1、FR-X2）；同名类型覆盖内置定义。 */
  nodeTypes?: NodeTypeDefinition[]
  onNodesChange?: (nodes: Node[]) => void
  onEdgesChange?: (edges: Edge[]) => void
  onSelectionChange?: (selection: SelectionState) => void
  /**
   * 文档变化回调（R4-2、FR-X1）。
   * 受控模式下每次文档变化都会触发，宿主据此更新自己的 `workflow` 状态。
   */
  onChange?: (workflow: Workflow) => void
  /** 是否显示内置的左侧节点面板覆盖层；宿主自建三栏布局时可关闭（R3-8）。 */
  showNodePanel?: boolean
  /** 是否显示内置的右侧配置面板覆盖层；宿主自建三栏布局时可关闭（R3-8）。 */
  showConfigPanel?: boolean
  /** 是否显示内置的底部运行记录面板覆盖层；宿主自建布局时可关闭（R5-6）。 */
  showRunPanel?: boolean
  /**
   * 主题（R8-2、Q33）：`light` / `dark`。
   * 省略时跟随最近的 `data-theme`（默认亮色），由宿主的主题切换控制。
   */
  theme?: 'light' | 'dark'
  /**
   * 背景（R8-2、FR-C1）：默认点阵网格；`false` 关闭；
   * 传入 ReactNode 时作为自定义背景内容渲染。
   */
  background?: boolean | ReactNode
  children?: ReactNode
}

interface PanState {
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
}

/** 框选状态（R6-1）。选框画在画布世界坐标下，随视口一起变换。 */
interface MarqueeState {
  pointerId: number
  /** 起点（画布世界坐标）。 */
  start: Point
  /** 当前点（画布世界坐标）。 */
  current: Point
  /** Shift 拖拽为追加选区。 */
  additive: boolean
}

/**
 * 画布容器：负责视口（缩放/平移）、节点层与连线层的组装，以及连线创建交互。
 * 选择、删除、撤销重做与节点创建入口在 R2 补齐。
 */
export const ReactFlow = ({
  nodes = EMPTY_NODES,
  edges = EMPTY_EDGES,
  workflow,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  onChange,
  showNodePanel = true,
  showConfigPanel = true,
  showRunPanel = true,
  theme,
  background,
  children,
}: ReactFlowProps) => {
  const registry = useMemo(() => buildRegistry(nodeTypes), [nodeTypes])
  const viewport = useFlowStore((state) => state.workflow.viewport)
  const nodeCount = useFlowStore((state) => state.workflow.nodes.length)
  const setNodes = useFlowStore((state) => state.setNodes)
  const setEdges = useFlowStore((state) => state.setEdges)
  const resetHistory = useFlowStore((state) => state.resetHistory)
  const setControlled = useFlowStore((state) => state.setControlled)
  const applyExternalDocument = useFlowStore((state) => state.applyExternalDocument)

  const helpId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<PanState | null>(null)
  const connectionSourceRef = useRef<string | null>(null)
  const connectionHandleRef = useRef<string | null>(null)
  /** 反向拖拽（R8-4）：正在被摘下的已有连线。 */
  const detachedEdgeRef = useRef<Edge | null>(null)
  const onNodesChangeRef = useRef(onNodesChange)
  const onEdgesChangeRef = useRef(onEdgesChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onChangeRef = useRef(onChange)
  const nodesPropsKeyRef = useRef<string | null>(null)
  const edgesPropsKeyRef = useRef<string | null>(null)
  const workflowPropsKeyRef = useRef<string | null>(null)

  const [connection, setConnection] = useState<ConnectionState | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const isConnecting = connection !== null

  // 受控模式由 `workflow` prop 是否存在决定（R4-2）。
  const isControlled = workflow !== undefined

  useEffect(() => {
    onNodesChangeRef.current = onNodesChange
    onEdgesChangeRef.current = onEdgesChange
    onSelectionChangeRef.current = onSelectionChange
    onChangeRef.current = onChange
  }, [onNodesChange, onEdgesChange, onSelectionChange, onChange])

  useEffect(() => {
    setControlled(isControlled)
  }, [isControlled, setControlled])

  // 注册画布容器，工具栏的"适应画布"需要它算视口（R4-9）。
  useEffect(() => registerCanvasContainer(containerRef.current), [])

  // 把注册表同步给运行态存储（R5-1）：Runner 需要它查节点类型的输出字段。
  useEffect(() => {
    useRunStore.getState().setRegistry(registry)
  }, [registry])

  // 非受控主语义 + 内容差异同步（R2-7）：只有 props 内容真的变了才同步，
  // 宿主每次渲染传出的新数组不会冲掉内部编辑状态。
  useEffect(() => {
    if (isControlled) return
    const key = JSON.stringify(nodes)
    if (nodesPropsKeyRef.current === key) return
    nodesPropsKeyRef.current = key
    setNodes(nodes)
    resetHistory()
  }, [nodes, setNodes, resetHistory, isControlled])

  useEffect(() => {
    if (isControlled) return
    const key = JSON.stringify(edges)
    if (edgesPropsKeyRef.current === key) return
    edgesPropsKeyRef.current = key
    setEdges(edges)
    resetHistory()
  }, [edges, setEdges, resetHistory, isControlled])

  // 受控模式：宿主改文档 → 画布回流（R4-2）。
  useEffect(() => {
    if (!workflow) return
    const key = JSON.stringify(workflow)
    if (workflowPropsKeyRef.current === key) return
    workflowPropsKeyRef.current = key
    applyExternalDocument(workflow)
  }, [workflow, applyExternalDocument])

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

  // 受控模式：内部编辑写回宿主（R4-2、FR-X1）。
  useEffect(() => {
    if (!isControlled) return undefined
    let previous = useFlowStore.getState().workflow
    return useFlowStore.subscribe((state) => {
      if (state.workflow === previous) return
      previous = state.workflow
      onChangeRef.current?.(state.workflow)
    })
  }, [isControlled])

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
        // 运行中禁止编辑（R5-4、PRD Q8）：撤销 / 重做会改动文档，
        // 让运行态与实际文档脱节。
        if (isRunLocked()) return
        event.preventDefault()
        if (event.shiftKey) useFlowStore.getState().redo()
        else useFlowStore.getState().undo()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // 运行中禁止编辑（R5-4、PRD Q8）。
        if (isRunLocked()) return
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

  // 连线创建：拖动中实时预览、命中校验、松开落库（C-4、C-5、C-7、R3-3、R3-4）。
  useEffect(() => {
    if (!isConnecting) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const resolveConnection = (event: PointerEvent, commit: boolean) => {
      const sourceId = connectionSourceRef.current
      const sourceHandleId = connectionHandleRef.current
      const detached = detachedEdgeRef.current
      if (!sourceId) return

      // 运行中禁止编辑（R5-4、PRD Q8）。
      if (isRunLocked()) {
        connectionSourceRef.current = null
        connectionHandleRef.current = null
        detachedEdgeRef.current = null
        setConnection(null)
        return
      }

      const { nodes: currentNodes, edges: currentEdges } = useFlowStore.getState().workflow
      const pointer = toFlowPoint(container, event.clientX, event.clientY)
      const targetId = findTargetNode(
        currentNodes,
        pointer,
        useFlowStore.getState().workflow.viewport.zoom,
        registry,
      )
      const error = targetId
        ? validateConnection(currentEdges, sourceId, targetId, detached?.id)
        : null

      if (commit) {
        if (detached) {
          // 反向拖拽（R8-4、FR-E5）：落在空白处摘线，落在合法目标上改接，
          // 落在非法目标上保持原样（松开即取消）。
          if (!targetId) {
            useFlowStore.getState().removeEdge(detached.id)
          } else if (!error && targetId !== detached.target) {
            const targetNode = currentNodes.find((node) => node.id === targetId)
            const targetDefinition = targetNode
              ? resolveNodeType(registry, targetNode.type)
              : undefined
            const input = findInputHandle(targetDefinition?.inputs)
            useFlowStore.getState().reconnectEdge(detached.id, targetId, input?.id)
          }
        } else if (targetId && !error) {
          // 条件节点的连线默认带出口名作为分支标签（R3-4）。
          const sourceNode = currentNodes.find((node) => node.id === sourceId)
          const sourceDefinition = sourceNode
            ? resolveNodeType(registry, sourceNode.type)
            : undefined
          const output = findOutputHandle(sourceDefinition?.outputs, sourceHandleId ?? undefined)
          const targetNode = currentNodes.find((node) => node.id === targetId)
          const targetDefinition = targetNode
            ? resolveNodeType(registry, targetNode.type)
            : undefined
          const input = findInputHandle(targetDefinition?.inputs)

          useFlowStore.getState().addEdge({
            id: createEdgeId(sourceId, targetId),
            source: sourceId,
            target: targetId,
            ...(output ? { sourceHandle: output.id } : {}),
            ...(input ? { targetHandle: input.id } : {}),
            ...(output?.label ? { label: output.label } : {}),
          })
        }
      }

      connectionSourceRef.current = null
      connectionHandleRef.current = null
      detachedEdgeRef.current = null
      setConnection(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sourceId = connectionSourceRef.current
      const sourceHandleId = connectionHandleRef.current
      if (!sourceId) return

      const {
        nodes: currentNodes,
        edges: currentEdges,
        viewport: currentViewport,
      } = useFlowStore.getState().workflow
      const pointer = toFlowPoint(container, event.clientX, event.clientY)
      const targetId = findTargetNode(currentNodes, pointer, currentViewport.zoom, registry)
      const error = targetId
        ? validateConnection(currentEdges, sourceId, targetId, detachedEdgeRef.current?.id)
        : null

      setConnection({ sourceId, sourceHandle: sourceHandleId ?? 'out', pointer, targetId, error })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      resolveConnection(event, true)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      connectionSourceRef.current = null
      connectionHandleRef.current = null
      detachedEdgeRef.current = null
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
  }, [isConnecting, registry])

  // 框选（R6-1、FR-N5）：空白处按下并拖拽拉出选框，松开时按命中结果写入选区。
  // 监听只在"开始框选"时挂一次：终点用 ref 记录，避免每次移动都重挂监听
  // （重挂之间的事件会丢，快速拖拽时选框会落后于指针）。
  const marqueeRef = useRef<MarqueeState | null>(null)
  // 刻意在渲染期同步 ref：事件监听只挂一次，渲染后必须读到最新选框状态。
  // eslint-disable-next-line react-hooks/refs
  marqueeRef.current = marquee
  const isMarqueeActive = marquee !== null

  useEffect(() => {
    if (!isMarqueeActive) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      const active = marqueeRef.current
      if (!active || event.pointerId !== active.pointerId) return
      const point = toFlowPoint(container, event.clientX, event.clientY)
      setMarquee((current) =>
        current && current.pointerId === active.pointerId ? { ...current, current: point } : current,
      )
    }

    const handlePointerUp = (event: PointerEvent) => {
      const active = marqueeRef.current
      if (!active || event.pointerId !== active.pointerId) return

      // 用松手位置作为终点，保证选区包含指针实际到达的位置。
      const end = toFlowPoint(container, event.clientX, event.clientY)
      const rect = normalizeRect(active.start, end)
      setMarquee(null)

      // 点击（没有拖出选框）时清空选区，与"点空白取消选择"一致。
      if (rect.width < 1 && rect.height < 1) {
        if (!active.additive) useFlowStore.getState().clearSelection()
        return
      }

      const { nodes } = useFlowStore.getState().workflow
      const hits = getMarqueeHits(nodes, rect, active.additive)
      useFlowStore.getState().selectNodes(hits, active.additive)
    }

    const handlePointerCancel = (event: PointerEvent) => {
      const active = marqueeRef.current
      if (!active || event.pointerId !== active.pointerId) return
      setMarquee(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [isMarqueeActive])

  // 复制 / 粘贴 / 全选（R6-2、R8-4、FR-N5、FR-U3、Q24）。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return

      const key = event.key.toLowerCase()
      const { nodes, edges } = useFlowStore.getState().workflow

      if (key === 'a') {
        // 全选节点与连线（R8-4、FR-U3）。
        event.preventDefault()
        useFlowStore.getState().selectAll()
        return
      }

      // 运行中禁止编辑（R5-4、PRD Q8）。
      if (isRunLocked()) return

      if (key === 'c') {
        // 浮动工具条的「复制」与 Ctrl/Cmd+C 共用同一份模块级剪贴板（R8-4）。
        const content = copySelection(nodes, edges)
        if (!content) return
        event.preventDefault()
        return
      }

      if (key === 'v') {
        const content = getClipboardContent()
        if (isClipboardEmpty(content)) return
        // `isClipboardEmpty` 已经排除了 null，但 TS 无法从自定义谓词里推断。
        if (!content) return
        const result = pasteClipboard(content, nodes, edges, {
          // 按住 Alt/Option 粘贴时连同内部连线一起复制（Q24）。
          withEdges: event.altKey,
        })
        useFlowStore.getState().pasteNodes(result.nodes, result.edges)
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 点击画布空白取消选择（R2-2）；节点、连线与覆盖层各自阻止冒泡。
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isSpacePressed) return
    if (isOverlayTarget(event.target)) return

    // 运行中禁止编辑（R5-4、PRD Q8）。
    if (isRunLocked()) return

    const container = containerRef.current
    if (!container) return

    // 空白处按下：开始框选（R6-1）。选区在松开时写回，
    // 拖动过程中不打断已有选区。
    const point = toFlowPoint(container, event.clientX, event.clientY)
    setMarquee({
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey,
    })
    if (!event.shiftKey) useFlowStore.getState().clearSelection()
  }

  const handleConnectStart = (
    nodeId: string,
    handleId: string,
    clientX: number,
    clientY: number,
  ) => {
    const container = containerRef.current
    if (!container) return
    detachedEdgeRef.current = null
    connectionSourceRef.current = nodeId
    connectionHandleRef.current = handleId
    setConnection({
      sourceId: nodeId,
      sourceHandle: handleId,
      pointer: toFlowPoint(container, clientX, clientY),
      targetId: null,
      error: null,
    })
  }

  /**
   * 从已有连线的输入锚点反向拖出（R8-4、FR-E5）。
   * 起点沿用原连线的输出节点与出口锚点，松手时改接或摘线。
   */
  const handleDisconnectStart = (
    edge: Edge,
    clientX: number,
    clientY: number,
  ) => {
    const container = containerRef.current
    if (!container) return
    detachedEdgeRef.current = edge
    connectionSourceRef.current = edge.source
    connectionHandleRef.current = edge.sourceHandle ?? 'out'
    setConnection({
      sourceId: edge.source,
      sourceHandle: edge.sourceHandle ?? 'out',
      pointer: toFlowPoint(container, clientX, clientY),
      targetId: null,
      error: null,
      detachedEdgeId: edge.id,
    })
  }

  const createNodeAt = (type: string, clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return

    // 运行中禁止编辑（R5-4、PRD Q8）。
    if (isRunLocked()) return

    const point = toFlowPoint(container, clientX, clientY)
    const definition = resolveNodeType(registry, type)
    useFlowStore.getState().addNode({
      id: createNodeId(type),
      type,
      position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
      data: { ...(definition.defaultData ?? {}), label: definition.defaultData?.label ?? definition.label },
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
    marquee ? 'is-marqueeing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const connectionError = connection?.targetId ? connection.error : null

  // 选框画在画布世界坐标下，跟着视口一起缩放平移（R6-1）。
  const marqueeRect: Rect | null = marquee ? normalizeRect(marquee.start, marquee.current) : null

  return (
    <NodeTypeRegistryContext.Provider value={registry}>
      <div
        ref={containerRef}
        className={className}
        data-theme={theme}
        tabIndex={0}
        role="application"
        aria-label="工作流画布"
        aria-describedby={helpId}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span id={helpId} className="flow-visually-hidden">
          Tab 在节点与连线之间移动；Enter 或空格选中，方向键按网格移动选中节点，Delete
          删除，Ctrl 或 Command 加 A 全选。
        </span>

        {background === false ? null : background === true || background === undefined ? (
          <div
            className="flow-background"
            style={{
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            }}
          />
        ) : (
          <div className="flow-background flow-background--custom">{background}</div>
        )}

        <div
          className="flow-viewport"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        >
          {marqueeRect ? (
            <div
              className="flow-marquee"
              data-marquee="active"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
              aria-hidden="true"
            />
          ) : null}
          <EdgeRenderer connection={connection} />
          <NodeRenderer
            connection={connection}
            theme={theme}
            onConnectStart={handleConnectStart}
            onDisconnectStart={handleDisconnectStart}
          />
        </div>

        <SelectionToolbar hidden={isConnecting || marquee !== null} />

        {showNodePanel ? <NodePanel onAddNode={handlePanelAdd} /> : null}

        {showConfigPanel ? <ConfigPanel /> : null}

        {showRunPanel ? <RunPanel /> : null}

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
    </NodeTypeRegistryContext.Provider>
  )
}
