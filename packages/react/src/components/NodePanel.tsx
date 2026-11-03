import type { DragEvent } from 'react'
import { BUILTIN_NODE_TYPES } from '../lib/nodeTypes.tsx'

/** 面板拖拽时放入 DataTransfer 的 MIME，避免与宿主自己的拖拽数据冲突。 */
export const NODE_DRAG_MIME = 'application/x-flowsail-node-type'

export interface NodePanelProps {
  /** 点击面板项时在画布中心创建节点（R2-6）。 */
  onAddNode: (type: string) => void
}

/**
 * 左侧最小节点面板：点击在画布中心创建，或把条目拖到画布上按落点创建。
 * 完整三栏布局与 6 类节点留给 M2 的 N-9。
 */
export const NodePanel = ({ onAddNode }: NodePanelProps) => {
  const handleDragStart = (type: string, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, type)
    event.dataTransfer.setData('text/plain', type)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="flow-node-panel" role="group" aria-label="添加节点">
      <span className="flow-node-panel__title">节点</span>
      {BUILTIN_NODE_TYPES.map((meta) => (
        <button
          key={meta.type}
          type="button"
          className="flow-node-panel__item"
          draggable
          onClick={() => onAddNode(meta.type)}
          onDragStart={(event) => handleDragStart(meta.type, event)}
          title={`添加${meta.label}节点`}
        >
          <span className="flow-node-panel__icon" style={{ color: meta.color }}>
            {meta.icon}
          </span>
          <span>{meta.label}</span>
        </button>
      ))}
    </div>
  )
}
