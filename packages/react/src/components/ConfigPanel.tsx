import { useEffect, useMemo, useRef } from 'react'
import type { Workflow } from '@system'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'
import { coerceParamValue, validateParams } from '../lib/params.ts'
import { findOutputHandle } from '../lib/geometry.ts'
import type { ParamSchema } from '../lib/registry.ts'

export interface ConfigPanelProps {
  /** 面板在宿主布局中的位置；默认作为画布右侧的覆盖层。 */
  className?: string
  /**
   * `overlay` 为画布上的浮动覆盖层；`inline` 参与宿主的分栏布局（R3-8）。
   */
  variant?: 'overlay' | 'inline'
}

/** 连续输入的合并窗口（毫秒）：窗口内的连续修改合成一条历史记录（R3-7）。 */
const MERGE_WINDOW = 600

/**
 * 一次连续编辑的待提交状态。
 * `scope` 区分是哪个控件在连续输入，避免不同控件的修改被并成一条记录。
 */
interface PendingEdit {
  scope: string
  /** 编辑前的整份文档快照，撤销时回到这里（R3-7）。 */
  snapshot: Workflow
}

/**
 * 右侧配置面板（R3-5、R3-6、R3-7）。
 * 选中节点时展示名称、描述与参数表单；选中连线时展示分支标签；未选中时显示占位。
 * 面板只消费注册表给出的参数 schema，不认识具体节点类型。
 */
export const ConfigPanel = ({ className, variant = 'overlay' }: ConfigPanelProps) => {
  const registry = useNodeTypeRegistry()
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const edges = useFlowStore((state) => state.workflow.edges)
  const selectedNode = useMemo(
    () => nodes.find((node) => node.selected) ?? null,
    [nodes],
  )
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.selected) ?? null,
    [edges],
  )

  const definition = selectedNode
    ? resolveNodeType(registry, selectedNode.type)
    : null
  const params = definition?.params ?? []

  const values = (selectedNode?.data ?? {}) as Record<string, unknown>
  const errors = validateParams(params, values)

  // 连续输入期间只写文档不入栈，停止输入后才压一条快照（R3-7）。
  const pendingRef = useRef<PendingEdit | null>(null)
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current)
    },
    [],
  )

  /**
   * 开始一次连续编辑：记下编辑前的快照。
   * 同一个 `scope` 的后续修改沿用这份快照，因此连续输入只产生一条历史记录。
   */
  const beginEdit = (scope: string): Workflow | null => {
    const store = useFlowStore.getState()
    const pending = pendingRef.current

    if (pending && pending.scope === scope) return pending.snapshot
    if (pending) flushEdit()

    const snapshot = store.workflow
    pendingRef.current = { scope, snapshot }
    return snapshot
  }

  /** 把待提交的编辑压入历史栈，并结束连续编辑状态。 */
  const flushEdit = () => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = null
    }
    useFlowStore.getState().pushHistory(pending.snapshot)
  }

  /** 结束当前连续编辑（切换控件、切换选中项或失焦时调用）。 */
  const endEdit = () => {
    if (!pendingRef.current) return
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = null
    }
    flushEdit()
  }

  /** 写文档并安排合并窗口；窗口结束后把这次编辑压成一条历史记录。 */
  const write = (scope: string, apply: () => void) => {
    beginEdit(scope)
    apply()

    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current)
    mergeTimerRef.current = setTimeout(flushEdit, MERGE_WINDOW)
  }

  const writeParam = (schema: ParamSchema, raw: unknown) => {
    const nodeId = selectedNode?.id
    if (!nodeId) return

    write(`param:${nodeId}:${schema.key}`, () => {
      const store = useFlowStore.getState()
      const node = store.workflow.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return

      const value = coerceParamValue(schema, raw)
      const nextData: Record<string, unknown> = { ...(node.data ?? {}) }
      if (value === undefined) delete nextData[schema.key]
      else nextData[schema.key] = value

      store.updateNodeData(node.id, nextData, false)
    })
  }

  const writeTitle = (value: string) => {
    const nodeId = selectedNode?.id
    if (!nodeId) return
    write(`label:${nodeId}`, () => {
      useFlowStore.getState().updateNodeData(nodeId, { label: value }, false)
    })
  }

  const writeDescription = (value: string) => {
    const nodeId = selectedNode?.id
    if (!nodeId) return
    write(`description:${nodeId}`, () => {
      useFlowStore.getState().updateNodeData(nodeId, { description: value }, false)
    })
  }

  const writeEdgeLabel = (value: string) => {
    const edgeId = selectedEdge?.id
    if (!edgeId) return
    write(`edge-label:${edgeId}`, () => {
      useFlowStore.getState().setEdgeLabel(edgeId, value, false)
    })
  }

  const classNames = [
    'flow-config-panel',
    variant === 'inline' ? 'flow-config-panel--inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // 选中的是连线时，面板展示分支标签编辑（R3-4）。
  if (selectedEdge) {
    const sourceNode = nodes.find((node) => node.id === selectedEdge.source)
    const targetNode = nodes.find((node) => node.id === selectedEdge.target)
    const sourceDefinition = sourceNode
      ? resolveNodeType(registry, sourceNode.type)
      : null
    const output = findOutputHandle(sourceDefinition?.outputs, selectedEdge.sourceHandle)

    return (
      <aside className={classNames} aria-label="配置面板">
        <header className="flow-config-panel__header">
          <span className="flow-config-panel__title">连线</span>
          <span className="flow-config-panel__node-id">{selectedEdge.id}</span>
        </header>
        <div className="flow-config-panel__body">
          <p className="flow-config-panel__hint">
            {sourceNode?.data?.label ?? selectedEdge.source} →{' '}
            {targetNode?.data?.label ?? selectedEdge.target}
          </p>
          <label className="flow-config-panel__field">
            <span className="flow-config-panel__label">分支标签</span>
            <input
              className="flow-config-panel__input"
              type="text"
              value={selectedEdge.label ?? ''}
              placeholder={output?.label ?? '如：是 / 否'}
              onChange={(event) => writeEdgeLabel(event.target.value)}
              onBlur={endEdit}
            />
          </label>
          {output ? (
            <span className="flow-config-panel__description">
              出口「{output.label}」的默认标签。
            </span>
          ) : null}
        </div>
      </aside>
    )
  }

  if (!selectedNode || !definition) {
    return (
      <aside className={classNames} aria-label="配置面板">
        <header className="flow-config-panel__header">
          <span className="flow-config-panel__title">配置</span>
        </header>
        <div className="flow-config-panel__empty">
          <p>未选中节点</p>
          <p className="flow-config-panel__hint">在画布上选择一个节点来编辑它的名称、描述与参数。</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className={classNames} aria-label="配置面板">
      <header className="flow-config-panel__header">
        <span
          className="flow-config-panel__icon"
          style={{ color: definition.color }}
          aria-hidden="true"
        >
          {definition.icon}
        </span>
        <span className="flow-config-panel__title">{definition.label}</span>
        <span className="flow-config-panel__node-id">{selectedNode.id}</span>
      </header>

      <div className="flow-config-panel__body">
        <label className="flow-config-panel__field">
          <span className="flow-config-panel__label">名称</span>
          <input
            className="flow-config-panel__input"
            type="text"
            value={String(values.label ?? '')}
            onChange={(event) => writeTitle(event.target.value)}
            onBlur={endEdit}
            placeholder={definition.label}
          />
        </label>

        <label className="flow-config-panel__field">
          <span className="flow-config-panel__label">描述</span>
          <textarea
            className="flow-config-panel__textarea"
            value={String(values.description ?? '')}
            onChange={(event) => writeDescription(event.target.value)}
            onBlur={endEdit}
            placeholder="这个节点做什么"
            rows={3}
          />
        </label>

        {params.length === 0 ? (
          <p className="flow-config-panel__hint">该类型没有可配置参数。</p>
        ) : (
          params.map((schema) => (
            <ParamField
              key={schema.key}
              schema={schema}
              value={values[schema.key]}
              error={errors[schema.key]}
              onChange={(raw) => writeParam(schema, raw)}
              onBlur={endEdit}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface ParamFieldProps {
  schema: ParamSchema
  value: unknown
  error?: string | undefined
  onChange: (raw: unknown) => void
  /** 失焦时结束连续编辑，立即把这次修改压成一条历史记录（R3-7）。 */
  onBlur: () => void
}

/** 单个参数控件（R3-5）：按 schema 类型渲染五类控件之一。 */
const ParamField = ({ schema, value, error, onChange, onBlur }: ParamFieldProps) => {
  const id = `flow-param-${schema.key}`

  return (
    <div className="flow-config-panel__field">
      <label className="flow-config-panel__label" htmlFor={id}>
        {schema.label}
        {schema.required ? <span className="flow-config-panel__required">必填</span> : null}
      </label>

      {schema.type === 'boolean' ? (
        <label className="flow-config-panel__checkbox">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{value === true ? '已开启' : '已关闭'}</span>
        </label>
      ) : null}

      {schema.type === 'select' ? (
        <select
          id={id}
          className="flow-config-panel__select"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        >
          <option value="">未选择</option>
          {(schema.options ?? []).map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {schema.type === 'number' ? (
        <input
          id={id}
          className="flow-config-panel__input"
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : null}

      {schema.type === 'json' ? (
        <textarea
          id={id}
          className="flow-config-panel__textarea flow-config-panel__textarea--code"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          rows={4}
          spellCheck={false}
        />
      ) : null}

      {schema.type === 'string' ? (
        <textarea
          id={id}
          className="flow-config-panel__textarea"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          rows={3}
        />
      ) : null}

      {schema.description ? (
        <span className="flow-config-panel__description">{schema.description}</span>
      ) : null}

      {error ? (
        <span className="flow-config-panel__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
