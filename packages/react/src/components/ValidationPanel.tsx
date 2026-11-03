import { useMemo, useState } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { validateDocument } from '../lib/validation.ts'

export interface ValidationPanelProps {
  /** 面板标题。 */
  title?: string
  /**
   * `overlay` 为画布上的浮动覆盖层；`inline` 参与宿主的分栏布局（R4-7）。
   */
  variant?: 'overlay' | 'inline'
  className?: string
}

/**
 * 文档级校验面板（R4-7、FR-P6）。
 *
 * 汇总孤立节点、悬空连线、必填缺失与引用失效；
 * 点击问题可定位并选中对应节点。面板可折叠，不阻塞编辑。
 */
export const ValidationPanel = ({
  title = '校验',
  variant = 'overlay',
  className,
}: ValidationPanelProps) => {
  const registry = useNodeTypeRegistry()
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const edges = useFlowStore((state) => state.workflow.edges)
  const selectNode = useFlowStore((state) => state.selectNode)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const result = useMemo(
    () => validateDocument({ nodes, edges, registry }),
    [nodes, edges, registry],
  )

  const classNames = [
    'flow-validation-panel',
    variant === 'inline' ? 'flow-validation-panel--inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const handleLocate = (nodeId?: string) => {
    if (!nodeId) return
    selectNode(nodeId)
  }

  const summary =
    result.errorCount > 0
      ? `${result.errorCount} 个错误`
      : result.warningCount > 0
        ? `${result.warningCount} 个警告`
        : '没有发现问题'

  return (
    <aside className={classNames} aria-label="文档校验">
      <header className="flow-validation-panel__header">
        <button
          type="button"
          className="flow-validation-panel__toggle"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? '▸' : '▾'} {title}
        </button>
        <span
          className={[
            'flow-validation-panel__summary',
            result.errorCount > 0 ? 'is-error' : '',
            result.errorCount === 0 && result.warningCount > 0 ? 'is-warning' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {summary}
        </span>
      </header>

      {isCollapsed ? null : (
        <div className="flow-validation-panel__body">
          {result.issues.length === 0 ? (
            <p className="flow-validation-panel__empty">文档看起来没问题。</p>
          ) : (
            <ul className="flow-validation-panel__list">
              {result.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.nodeId ?? ''}-${issue.paramKey ?? ''}-${index}`}>
                  <button
                    type="button"
                    className={[
                      'flow-validation-panel__issue',
                      issue.severity === 'error' ? 'is-error' : 'is-warning',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleLocate(issue.nodeId)}
                    disabled={!issue.nodeId}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
