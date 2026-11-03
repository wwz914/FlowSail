import type { Workflow } from '@system'
import { useFlowStore } from '../store/index.ts'
import { getFitViewport } from './viewport.ts'

/**
 * 画布容器的注册表（R4-9）。
 *
 * 工具栏的"适应画布"需要知道画布容器的尺寸，而容器由 `ReactFlow` 持有。
 * 这里用一个模块级引用把容器暴露出去，避免把 DOM 引用塞进 store 状态里。
 */
let canvasContainer: HTMLElement | null = null

/** 注册画布容器；返回注销函数。 */
export function registerCanvasContainer(element: HTMLElement | null): () => void {
  canvasContainer = element
  return () => {
    if (canvasContainer === element) canvasContainer = null
  }
}

/** 当前注册的画布容器；宿主未挂载画布时为 null。 */
export function getCanvasContainer(): HTMLElement | null {
  return canvasContainer
}

/**
 * 让画布适应全部节点（R4-9、FR-U2）。
 * 没有容器或画布为空时返回 false。
 */
export function fitViewToNodes(): boolean {
  const container = getCanvasContainer()
  if (!container) return false

  const nodes = useFlowStore.getState().workflow.nodes
  if (nodes.length === 0) return false

  const rect = container.getBoundingClientRect()
  useFlowStore.getState().setViewport(getFitViewport(nodes, rect.width, rect.height))
  return true
}

/** 撤销一步（R4-9、FR-U2）。 */
export function undoStep(): boolean {
  return useFlowStore.getState().undo()
}

/** 重做一步（R4-9、FR-U2）。 */
export function redoStep(): boolean {
  return useFlowStore.getState().redo()
}

/** 是否有可撤销的编辑（R4-9：按钮态随可用性禁用）。 */
export function canUndo(): boolean {
  return useFlowStore.getState().past.length > 0
}

/** 是否有可重做的编辑（R4-9）。 */
export function canRedo(): boolean {
  return useFlowStore.getState().future.length > 0
}

/**
 * 用一份文档替换当前文档（R4-3：导入成功后画布与参数完整还原）。
 *
 * 导入是一次用户操作，因此压入历史栈，可以撤销一次（R4-3）：
 * 压栈的是**导入前**的文档快照，撤销后回到导入前的画布。
 */
export function replaceDocument(document: Workflow): void {
  const store = useFlowStore.getState()
  const before = store.workflow

  store.setWorkflow({
    ...document,
    nodes: document.nodes.map((node) => ({ ...node })),
    edges: document.edges.map((edge) => ({ ...edge })),
  })
  store.pushHistory(before)
}
