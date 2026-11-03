import { useMemo, useState } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { groupVariablesByNode, listAvailableVariables } from '../lib/variables.ts'

export interface VariablePickerProps {
  /** 当前正在配置的节点 id（R4-6）。 */
  nodeId: string
  /** 当前参数值；插入引用时写回这里。 */
  value: unknown
  /** 插入引用后的回调。 */
  onInsert: (reference: string) => void
}

/**
 * 变量选择器（R4-6、FR-P3）。
 *
 * 列表只列**拓扑上游**节点暴露的输出字段，按节点分组并显示类型；
 * 点击一项把 `{{nodeId.field}}` 字面量插入参数值。
 */
export const VariablePicker = ({ nodeId, value, onInsert }: VariablePickerProps) => {
  const registry = useNodeTypeRegistry()
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const edges = useFlowStore((state) => state.workflow.edges)
  const [isOpen, setIsOpen] = useState(false)

  const groups = useMemo(
    () =>
      groupVariablesByNode(
        listAvailableVariables({ nodeId, nodes, edges, registry }),
      ),
    [nodeId, nodes, edges, registry],
  )

  const currentText = typeof value === 'string' ? value : ''

  if (groups.length === 0) {
    return (
      <p className="flow-variable-picker__empty">
        没有可引用的上游变量。先把上游节点连到当前节点。
      </p>
    )
  }

  return (
    <div className="flow-variable-picker">
      <button
        type="button"
        className="flow-variable-picker__toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        {isOpen ? '收起变量' : '插入变量'}
      </button>

      {isOpen ? (
        <div className="flow-variable-picker__menu" role="menu">
          {groups.map((group) => (
            <div key={group.nodeId} className="flow-variable-picker__group">
              <span className="flow-variable-picker__group-label">{group.nodeLabel}</span>
              {group.fields.map((field) => (
                <button
                  key={field.reference}
                  type="button"
                  className="flow-variable-picker__item"
                  role="menuitem"
                  onClick={() => {
                    onInsert(field.reference)
                    setIsOpen(false)
                  }}
                  title={field.description ?? field.reference}
                >
                  <span className="flow-variable-picker__item-name">{field.field}</span>
                  <span className="flow-variable-picker__item-type">{field.type}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {currentText.includes('{{') ? (
        <span className="flow-variable-picker__current">当前值：{currentText}</span>
      ) : null}
    </div>
  )
}
