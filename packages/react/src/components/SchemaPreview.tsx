import { useMemo } from 'react'
import type { Node } from '@system'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'
import { useRunStore, type NodeRunRecord } from '../lib/runStore.ts'

export interface SchemaPreviewProps {
  /** 要预览的节点；为空时不渲染。 */
  node: Node | null
}

/**
 * 输入 / 输出 schema 预览（R4-8、FR-P4）。
 *
 * 展示节点类型声明的输入字段与输出字段（类型 + 描述）。
 * 运行结束后还会展示**该次运行**的实际输入与输出（R6-5）：
 * 数据取自 `useRunStore` 的运行记录——运行态是视图态，不写回文档。
 */
export const SchemaPreview = ({ node }: SchemaPreviewProps) => {
  const registry = useNodeTypeRegistry()
  const record = useRunStore((state) => (node ? state.records[node.id] : undefined))

  const definition = useMemo(
    () => (node ? resolveNodeType(registry, node.type) : null),
    [node, registry],
  )

  if (!node || !definition) return null

  const inputFields = definition.inputFields ?? []
  const outputFields = definition.outputFields ?? []

  const runtimeInput = record?.input
  const runtimeOutput = record?.output
  const hasRuntime = runtimeInput !== undefined || runtimeOutput !== undefined

  if (inputFields.length === 0 && outputFields.length === 0 && !hasRuntime) {
    return (
      <section className="flow-schema-preview">
        <h3 className="flow-schema-preview__title">输入 / 输出</h3>
        <p className="flow-schema-preview__empty">该节点类型没有声明输入或输出字段。</p>
      </section>
    )
  }

  return (
    <section className="flow-schema-preview">
      <h3 className="flow-schema-preview__title">输入 / 输出</h3>

      {inputFields.length > 0 ? (
        <div className="flow-schema-preview__section">
          <span className="flow-schema-preview__label">输入</span>
          <ul className="flow-schema-preview__list">
            {inputFields.map((field) => (
              <li key={`in-${field.name}`} className="flow-schema-preview__field">
                <span className="flow-schema-preview__field-name">{field.name}</span>
                <span className="flow-schema-preview__field-type">{field.type}</span>
                {field.description ? (
                  <span className="flow-schema-preview__field-desc">{field.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outputFields.length > 0 ? (
        <div className="flow-schema-preview__section">
          <span className="flow-schema-preview__label">输出</span>
          <ul className="flow-schema-preview__list">
            {outputFields.map((field) => (
              <li key={`out-${field.name}`} className="flow-schema-preview__field">
                <span className="flow-schema-preview__field-name">{field.name}</span>
                <span className="flow-schema-preview__field-type">{field.type}</span>
                {field.description ? (
                  <span className="flow-schema-preview__field-desc">{field.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasRuntime ? <RuntimeSnapshot record={record} /> : null}
    </section>
  )
}

/**
 * 最近一次运行的输入 / 输出快照（R6-5）。
 *
 * 数值以外的类型用 JSON 展示；空值显示为「(空)」。
 */
function RuntimeSnapshot({ record }: { record: NodeRunRecord | undefined }) {
  if (!record) return null

  const input = record.input ?? {}
  const output = record.output ?? {}
  const inputEntries = Object.entries(input)
  const outputEntries = Object.entries(output)

  if (inputEntries.length === 0 && outputEntries.length === 0) return null

  return (
    <div className="flow-schema-preview__section flow-schema-preview__runtime">
      <span className="flow-schema-preview__label">最近一次运行</span>
      {inputEntries.length > 0 ? (
        <ul className="flow-schema-preview__list">
          {inputEntries.map(([key, value]) => (
            <li key={`run-in-${key}`} className="flow-schema-preview__field">
              <span className="flow-schema-preview__field-name">{key}</span>
              <span className="flow-schema-preview__field-type">输入</span>
              <span className="flow-schema-preview__field-desc">{formatValue(value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {outputEntries.length > 0 ? (
        <ul className="flow-schema-preview__list">
          {outputEntries.map(([key, value]) => (
            <li key={`run-out-${key}`} className="flow-schema-preview__field">
              <span className="flow-schema-preview__field-name">{key}</span>
              <span className="flow-schema-preview__field-type">输出</span>
              <span className="flow-schema-preview__field-desc">{formatValue(value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 把运行期的值格式化成一行可读文本。 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(空)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
