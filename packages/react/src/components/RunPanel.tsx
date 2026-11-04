import { useMemo, useState } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useRunStore } from '../lib/runStore.ts'
import type { NodeRunRecord } from '../lib/runStore.ts'

export interface RunPanelProps {
  /** 面板标题。 */
  title?: string
  /**
   * `overlay` 为画布上的浮动覆盖层；`inline` 参与宿主的分栏布局（R5-6）。
   */
  variant?: 'overlay' | 'inline'
  className?: string
}

/** 状态对应的显示名（R5-6）。 */
const STATE_LABELS: Record<NodeRunRecord['state'], string> = {
  idle: '未运行',
  running: '运行中',
  success: '成功',
  error: '失败',
  skipped: '跳过',
}

/**
 * 运行记录面板（R5-6、R5-7、FR-R3、FR-R4）。
 *
 * 逐节点展示状态、耗时与输入 / 输出；点击记录行可定位并选中对应节点；
 * 失败节点有醒目标记，错误消息与堆栈就地展示（堆栈默认折叠）。
 */
export const RunPanel = ({
  title = '运行记录',
  variant = 'overlay',
  className,
}: RunPanelProps) => {
  const status = useRunStore((state) => state.status)
  const records = useRunStore((state) => state.records)
  const order = useRunStore((state) => state.order)
  const duration = useRunStore((state) => state.duration)
  const runError = useRunStore((state) => state.error)
  const selectNode = useFlowStore((state) => state.selectNode)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedStacks, setExpandedStacks] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const orderedRecords = useMemo(
    () =>
      order
        .map((nodeId) => records[nodeId])
        .filter((record): record is NodeRunRecord => record !== undefined),
    [order, records],
  )

  const classNames = [
    'flow-run-panel',
    variant === 'inline' ? 'flow-run-panel--inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const summary =
    status === 'idle'
      ? '尚未运行'
      : status === 'running'
        ? '运行中…'
        : status === 'cancelled'
          ? `已取消（${duration}ms）`
          : status === 'success'
            ? `运行成功（${duration}ms）`
            : `运行失败（${duration}ms）`

  const handleCopy = async (record: NodeRunRecord) => {
    const text = JSON.stringify(
      {
        node: record.label,
        type: record.typeLabel,
        state: record.state,
        duration: record.duration,
        input: record.input ?? null,
        output: record.output ?? null,
        error: record.error ?? null,
      },
      null,
      2,
    )

    try {
      await navigator.clipboard?.writeText(text)
      setCopiedId(record.nodeId)
      setTimeout(() => setCopiedId((current) => (current === record.nodeId ? null : current)), 1500)
    } catch {
      // 剪贴板不可用时静默失败：复制不是关键路径。
    }
  }

  const toggleStack = (nodeId: string) => {
    setExpandedStacks((current) => ({ ...current, [nodeId]: !current[nodeId] }))
  }

  return (
    <aside className={classNames} aria-label="运行记录">
      <header className="flow-run-panel__header">
        <button
          type="button"
          className="flow-run-panel__toggle"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? '▸' : '▾'} {title}
        </button>
        <span
          className={[
            'flow-run-panel__summary',
            status === 'error' ? 'is-error' : '',
            status === 'success' ? 'is-success' : '',
            status === 'running' ? 'is-running' : '',
            status === 'cancelled' ? 'is-cancelled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {summary}
        </span>
      </header>

      {isCollapsed ? null : (
        <div className="flow-run-panel__body">
          {orderedRecords.length === 0 ? (
            <p className="flow-run-panel__empty">
              {status === 'idle' ? '点击工具栏的「试运行」开始。' : '还没有节点记录。'}
            </p>
          ) : (
            <ul className="flow-run-panel__list">
              {orderedRecords.map((record) => (
                <li
                  key={record.nodeId}
                  className={[
                    'flow-run-panel__record',
                    `is-${record.state}`,
                    record.state === 'error' ? 'is-failed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="flow-run-panel__row"
                    onClick={() => selectNode(record.nodeId)}
                    title="定位并选中该节点"
                  >
                    <span className="flow-run-panel__state">{STATE_LABELS[record.state]}</span>
                    <span className="flow-run-panel__label">{record.label}</span>
                    <span className="flow-run-panel__type">{record.typeLabel}</span>
                    <span className="flow-run-panel__duration">{record.duration}ms</span>
                  </button>

                  {record.state === 'error' && record.error ? (
                    <div className="flow-run-panel__error" role="alert">
                      <span className="flow-run-panel__error-code">{record.error.code}</span>
                      <span className="flow-run-panel__error-message">{record.error.message}</span>
                      {record.error.stack ? (
                        <>
                          <button
                            type="button"
                            className="flow-run-panel__stack-toggle"
                            onClick={() => toggleStack(record.nodeId)}
                            aria-expanded={Boolean(expandedStacks[record.nodeId])}
                          >
                            {expandedStacks[record.nodeId] ? '收起堆栈' : '展开堆栈'}
                          </button>
                          {expandedStacks[record.nodeId] ? (
                            <pre className="flow-run-panel__stack">{record.error.stack}</pre>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {record.output ? (
                    <details className="flow-run-panel__detail">
                      <summary>输出</summary>
                      <pre className="flow-run-panel__json">
                        {JSON.stringify(record.output, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {record.input ? (
                    <details className="flow-run-panel__detail">
                      <summary>输入</summary>
                      <pre className="flow-run-panel__json">
                        {JSON.stringify(record.input, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  <button
                    type="button"
                    className="flow-run-panel__copy"
                    onClick={() => handleCopy(record)}
                  >
                    {copiedId === record.nodeId ? '已复制' : '复制记录'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {runError && status === 'error' ? (
            <p className="flow-run-panel__error-summary" role="alert">
              {runError.message}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
