import { useEffect, useMemo, useRef } from 'react'
import type { Workflow } from '@flowsail/core'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'
import { coerceParamValue, validateParams } from '../lib/params.ts'
import { findOutputHandle } from '../lib/geometry.ts'
import { checkReferences, insertReference } from '../lib/variables.ts'
import { isRunLocked } from '../lib/runController.ts'
import { NodeTestPanel } from './NodeTestPanel.tsx'
import { VariablePicker } from './VariablePicker.tsx'
import { SchemaPreview } from './SchemaPreview.tsx'
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

  const definition = useMemo(
    () => (selectedNode ? resolveNodeType(registry, selectedNode.type) : null),
    [registry, selectedNode],
  )
  const params = useMemo(() => definition?.params ?? [], [definition])

  const values = useMemo(
    () => (selectedNode?.data ?? {}) as Record<string, unknown>,
    [selectedNode],
  )
  const errors = validateParams(params, values)

  // 变量引用校验（R4-5）：引用失效时在控件下标红并给出可读原因。
  const referenceErrors = useMemo(() => {
    if (!selectedNode) return {} as Record<string, string>

    const result: Record<string, string> = {}
    for (const schema of params) {
      const value = values[schema.key]
      if (typeof value !== 'string' || !value.includes('{{')) continue

      const checks = checkReferences(value, {
        nodeId: selectedNode.id,
        nodes,
        edges,
        registry,
        schema,
      })

      const failed = checks.find((check) => !check.ok)
      if (failed?.message) result[schema.key] = failed.message
    }
    return result
  }, [selectedNode, params, values, nodes, edges, registry])

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
    // 运行中禁止编辑（R5-4、PRD Q8）：运行态与实际文档不能脱节。
    if (isRunLocked()) return

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
          <span className="flow-config-panel__empty-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect
                x="3"
                y="6"
                width="10"
                height="7"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeDasharray="2.4 2.2"
              />
              <path
                d="M14 5.5 17 8.5M17 5.5 14 8.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="flow-config-panel__empty-title">未选中节点</p>
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
          style={{ color: definition.color, backgroundColor: `${definition.color}1f` }}
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
              referenceError={referenceErrors[schema.key]}
              nodeId={selectedNode.id}
              onChange={(raw) => writeParam(schema, raw)}
              onBlur={endEdit}
            />
          ))
        )}

        <SchemaPreview node={selectedNode} />

        <NodeTestPanel node={selectedNode} />
      </div>
    </aside>
  )
}

interface ParamFieldProps {
  schema: ParamSchema
  value: unknown
  error?: string | undefined
  /** 变量引用失效的原因（R4-5）。 */
  referenceError?: string | undefined
  /** 当前节点 id（R4-6：变量选择器需要知道从谁出发选变量）。 */
  nodeId: string
  onChange: (raw: unknown) => void
  /** 失焦时结束连续编辑，立即把这次修改压成一条历史记录（R3-7）。 */
  onBlur: () => void
}

/**
 * 单个参数控件（R3-5）：按 schema 类型渲染五类控件之一。
 * v1.4 起文本类参数附带变量选择器（R4-6），引用失效时额外标红（R4-5）。
 */
const ParamField = ({
  schema,
  value,
  error,
  referenceError,
  nodeId,
  onChange,
  onBlur,
}: ParamFieldProps) => {
  const id = `flow-param-${schema.key}`
  const isTextual = schema.type === 'string' || schema.type === 'json'

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

      {isTextual ? (
        <VariablePicker
          nodeId={nodeId}
          value={value}
          onInsert={(reference) => {
            const current = typeof value === 'string' ? value : ''
            onChange(insertReference(current, reference))
          }}
        />
      ) : null}

      {referenceError ? (
        <span className="flow-config-panel__error" role="alert">
          {referenceError}
        </span>
      ) : null}

      {error ? (
        <span className="flow-config-panel__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
