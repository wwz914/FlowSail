import {
  SYSTEM_VARIABLES,
  validateSessionVariables,
  type SessionVariable,
} from '../lib/sessionVariables.ts'
export interface SessionVariablePanelProps {
  /** 是否展开。 */
  open: boolean
  /** 变量列表变化时回调。 */
  onChange: (variables: SessionVariable[]) => void
  /** 当前变量列表。 */
  variables: SessionVariable[]
  className?: string
}

/**
 * 会话变量输入面板（R6-7、FR-R2、X-7）。
 *
 * 让用户在试运行前填一组流程级输入：这些值在运行时作为
 * `RunContext.variables` 注入，开始节点可以消费它们。
 *
 * 面板是**运行期上下文**，不是文档的一部分，不写回 `Workflow`。
 */
export const SessionVariablePanel = ({
  open,
  onChange,
  variables,
  className,
}: SessionVariablePanelProps) => {
  const classNames = ['flow-session-vars', className].filter(Boolean).join(' ')
  const issues = validateSessionVariables(variables)

  if (!open) return null

  const update = (index: number, patch: Partial<SessionVariable>) => {
    onChange(variables.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const remove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...variables, { name: '', value: '' }])
  }

  return (
    <div className={classNames} role="group" aria-label="会话变量">
      <div className="flow-session-vars__head">
        <span className="flow-session-vars__title">会话变量</span>
        <button
          type="button"
          className="flow-session-vars__add"
          onClick={add}
          title="新增一个会话变量"
        >
          + 变量
        </button>
      </div>

      {variables.length === 0 ? (
        <p className="flow-session-vars__empty">
          未设置会话变量。运行时的流程级输入会取下面的系统变量。
        </p>
      ) : (
        <ul className="flow-session-vars__list">
          {variables.map((variable, index) => {
            const issue = issues.find((item) => item.index === index)
            return (
              <li key={index} className="flow-session-vars__row">
                <input
                  className="flow-session-vars__name"
                  value={variable.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="变量名"
                  aria-label={`变量 ${index + 1} 的名称`}
                />
                <input
                  className="flow-session-vars__value"
                  value={variable.value}
                  onChange={(event) => update(index, { value: event.target.value })}
                  placeholder="值"
                  aria-label={`变量 ${index + 1} 的值`}
                />
                <button
                  type="button"
                  className="flow-session-vars__remove"
                  onClick={() => remove(index)}
                  aria-label={`删除变量 ${variable.name || index + 1}`}
                  title="删除变量"
                >
                  ×
                </button>
                {issue ? (
                  <span className="flow-session-vars__issue">{issue.message}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flow-session-vars__system">
        <span className="flow-session-vars__system-label">系统变量</span>
        {Object.entries(SYSTEM_VARIABLES).map(([name, description]) => (
          <span key={name} className="flow-session-vars__system-item">
            <code>{name}</code> — {description}
          </span>
        ))}
      </div>
    </div>
  )
}
