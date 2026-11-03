import { useMemo } from 'react'
import type { Node } from '@system'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'

export interface SchemaPreviewProps {
  /** 要预览的节点；为空时不渲染。 */
  node: Node | null
}

/**
 * 输入 / 输出 schema 预览（R4-8、FR-P4）。
 *
 * 展示节点类型声明的输入字段与输出字段（类型 + 描述）。
 * 运行期的输入 / 输出快照属于 M3，不在本组件范围内。
 */
export const SchemaPreview = ({ node }: SchemaPreviewProps) => {
  const registry = useNodeTypeRegistry()

  const definition = useMemo(
    () => (node ? resolveNodeType(registry, node.type) : null),
    [node, registry],
  )

  if (!node || !definition) return null

  const inputFields = definition.inputFields ?? []
  const outputFields = definition.outputFields ?? []

  if (inputFields.length === 0 && outputFields.length === 0) {
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
    </section>
  )
}
