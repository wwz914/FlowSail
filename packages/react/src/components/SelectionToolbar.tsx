import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useRunStore } from '../lib/runStore.ts'
import { getNodeBounds } from '../lib/marquee.ts'
import { collectClipboard, copySelection, pasteClipboard } from '../lib/clipboard.ts'

export interface SelectionToolbarProps {
  /** 连线拖拽 / 框选进行中时隐藏，避免遮挡手势。 */
  hidden?: boolean
}

/**
 * 选中浮动工具条（R8-4、FR-N6、Q35）。
 *
 * 选中节点后出现在选区上方，提供创建副本 / 复制 / 删除。
 * 位置按世界坐标换算成屏幕坐标，不随视口缩放而变大变小。
 * "运行到此节点"需要 Runner 的部分执行契约（Q35），留到 v1.9+。
 */
export const SelectionToolbar = ({ hidden = false }: SelectionToolbarProps) => {
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const viewport = useFlowStore((state) => state.workflow.viewport)
  const runStatus = useRunStore((state) => state.status)
  const [message, setMessage] = useState<string | null>(null)

  const selected = nodes.filter((node) => node.selected)
  if (hidden || selected.length === 0) return null

  const locked = runStatus === 'running'
  const bounds = selected.map(getNodeBounds)
  const minX = Math.min(...bounds.map((item) => item.minX))
  const maxX = Math.max(...bounds.map((item) => item.maxX))
  const minY = Math.min(...bounds.map((item) => item.minY))

  const left = viewport.x + ((minX + maxX) / 2) * viewport.zoom
  const top = Math.max(8, viewport.y + minY * viewport.zoom - 44)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 工具条是画布覆盖层：不让按下穿透到画布（取消选择 / 框选）。
    event.stopPropagation()
  }

  const duplicate = () => {
    const store = useFlowStore.getState()
    const { nodes: currentNodes, edges: currentEdges } = store.workflow
    const content = collectClipboard(currentNodes, currentEdges)
    if (content.nodes.length === 0) return
    const result = pasteClipboard(content, currentNodes, currentEdges, { withEdges: true })
    const created = result.nodes
    const createdEdges = result.edges
    store.pasteNodes(created, createdEdges)
    setMessage(`已创建 ${created.length} 个副本`)
  }

  const copy = () => {
    const store = useFlowStore.getState()
    const content = copySelection(store.workflow.nodes, store.workflow.edges)
    setMessage(content ? `已复制 ${content.nodes.length} 个节点` : '没有可复制的节点')
  }

  return (
    <div
      className="flow-selection-toolbar"
      role="toolbar"
      aria-label="选中节点操作"
      style={{ left, top }}
      onPointerDown={handlePointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="flow-selection-toolbar__count">{selected.length} 个节点</span>
      <button
        type="button"
        className="flow-selection-toolbar__button"
        onClick={duplicate}
        disabled={locked}
        title={locked ? '运行中不能编辑' : '创建副本（含内部连线）'}
      >
        创建副本
      </button>
      <button
        type="button"
        className="flow-selection-toolbar__button"
        onClick={copy}
        title="复制选中节点，随后可用 Ctrl/Cmd+V 粘贴"
      >
        复制
      </button>
      <button
        type="button"
        className="flow-selection-toolbar__button flow-selection-toolbar__button--danger"
        onClick={() => useFlowStore.getState().deleteSelection()}
        disabled={locked}
        title={locked ? '运行中不能编辑' : '删除选中节点与连线（Delete）'}
      >
        删除
      </button>
      <span className="flow-visually-hidden" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  )
}
