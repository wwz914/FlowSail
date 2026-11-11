import type { DragEvent } from 'react'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { listNodeTypes, resolveNodeType } from '../lib/registry.ts'
import { useFlowStore } from '../store/index.ts'

/** 面板拖拽时放入 DataTransfer 的 MIME，避免与宿主自己的拖拽数据冲突。 */
export const NODE_DRAG_MIME = 'application/x-flowsail-node-type'

export interface NodePanelProps {
  /**
   * 点击面板项时的回调。
   * 省略时面板自行在画布中心创建节点（宿主自建三栏布局时用，R3-8）。
   */
  onAddNode?: (type: string) => void
  /** 面板标题。 */
  title?: string
  /**
   * `overlay` 为画布上的浮动覆盖层；`inline` 参与宿主的分栏布局（R3-8）。
   */
  variant?: 'overlay' | 'inline'
}

let nodeIdSequence = 0

function createNodeId(type: string): string {
  nodeIdSequence += 1
  return `node-${type}-${nodeIdSequence}`
}

/**
 * 左侧节点面板：点击在画布中心创建，或把条目拖到画布上按落点创建。
 * 条目来自节点类型注册表（R3-1），因此内置 6 类与宿主自定义类型都会出现（R3-2）。
 */
export const NodePanel = ({ onAddNode, title = '节点', variant = 'overlay' }: NodePanelProps) => {
  const registry = useNodeTypeRegistry()
  const definitions = listNodeTypes(registry)

  const handleDragStart = (type: string, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, type)
    event.dataTransfer.setData('text/plain', type)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleClick = (type: string) => {
    if (onAddNode) {
      onAddNode(type)
      return
    }

    // 独立使用：直接在当前视口中心创建节点。
    const store = useFlowStore.getState()
    const definition = resolveNodeType(registry, type)
    const { viewport } = store.workflow
    store.addNode({
      id: createNodeId(type),
      type,
      position: {
        x: -viewport.x / viewport.zoom + 200,
        y: -viewport.y / viewport.zoom + 160,
      },
      data: { ...(definition.defaultData ?? {}) },
    })
  }

  const classNames = [
    'flow-node-panel',
    variant === 'inline' ? 'flow-node-panel--inline' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classNames} role="group" aria-label="添加节点">
      <span className="flow-node-panel__title">{title}</span>
      {definitions.map((definition) => (
        <button
          key={definition.type}
          type="button"
          className="flow-node-panel__item"
          data-node-type={definition.type}
          draggable
          onClick={() => handleClick(definition.type)}
          onDragStart={(event) => handleDragStart(definition.type, event)}
          title={`添加${definition.label}节点`}
        >
          <span
            className="flow-node-panel__icon"
            style={{ color: definition.color, backgroundColor: `${definition.color}1f` }}
          >
            {definition.icon}
          </span>
          <span>{definition.label}</span>
        </button>
      ))}
    </div>
  )
}
