import { useState } from 'react'
import type { Node } from '@flowsail/core'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'
import { collectReferencedFields, runNodeTest } from '../lib/nodeTest.ts'
import { isRunning } from '../lib/runController.ts'

export interface NodeTestPanelProps {
  /** 当前节点。 */
  node: Node
}

/**
 * 单节点测试（R5-8、FR-P5）。
 *
 * 手填输入即可执行当前节点并看到输出。结果单独成组展示，
 * 不影响整条流程的运行记录（ROADMAP §10.3 R5-8）。
 */
export const NodeTestPanel = ({ node }: NodeTestPanelProps) => {
  const registry = useNodeTypeRegistry()
  const definition = resolveNodeType(registry, node.type)
  const inputFields = definition.inputFields ?? []

  const values = (node.data ?? {}) as Record<string, unknown>
  const params: Record<string, unknown> = {}
  for (const schema of definition.params ?? []) {
    params[schema.key] = values[schema.key]
  }

  // 参数里引用到的上游字段：单节点测试没有上游产出，需要用户手填（R5-8）。
  const referencedFields = collectReferencedFields(params)

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{
    ok: boolean
    fields: Record<string, unknown>
    error?: string | undefined
    duration: number
  } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const handleTest = async () => {
    if (isRunning()) return
    setIsTesting(true)
    try {
      const parsedInputs: Record<string, unknown> = {}
      for (const field of inputFields) {
        const raw = inputs[field.name]
        if (raw === undefined || raw === '') continue
        parsedInputs[field.name] = coerceByType(field.type, raw)
      }

      const parsedReferences: Record<string, unknown> = {}
      for (const reference of referencedFields) {
        const raw = referenceInputs[`${reference.nodeId}.${reference.field}`]
        if (raw === undefined || raw === '') continue
        parsedReferences[`${reference.nodeId}.${reference.field}`] = raw
      }

      const outcome = await runNodeTest({
        node,
        params,
        inputs: parsedInputs,
        references: parsedReferences,
      })
      setResult({
        ok: outcome.ok,
        fields: outcome.fields,
        error: outcome.error?.message,
        duration: outcome.duration,
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <section className="flow-node-test" aria-label="单节点测试">
      <header className="flow-node-test__header">
        <span className="flow-node-test__title">单节点测试</span>
        <button
          type="button"
          className="flow-node-test__button"
          onClick={handleTest}
          disabled={isTesting || isRunning()}
        >
          {isTesting ? '执行中…' : '测试'}
        </button>
      </header>

      {inputFields.length === 0 && referencedFields.length === 0 ? (
        <p className="flow-node-test__hint">该类型没有可填写的输入字段，直接点「测试」即可。</p>
      ) : null}

      {inputFields.length > 0 ? (
        <div className="flow-node-test__inputs">
          {inputFields.map((field) => (
            <label key={field.name} className="flow-node-test__field">
              <span className="flow-node-test__label">
                {field.name}
                <span className="flow-node-test__type">{field.type}</span>
              </span>
              <input
                className="flow-node-test__input"
                type="text"
                value={inputs[field.name] ?? ''}
                placeholder={field.description ?? ''}
                onChange={(event) =>
                  setInputs((current) => ({ ...current, [field.name]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
      ) : null}

      {referencedFields.length > 0 ? (
        <div className="flow-node-test__inputs">
          <p className="flow-node-test__hint">
            这些字段来自上游节点，单节点测试需要手填才能取值。
          </p>
          {referencedFields.map((reference) => {
            const key = `${reference.nodeId}.${reference.field}`
            return (
              <label key={key} className="flow-node-test__field">
                <span className="flow-node-test__label">
                  {key}
                  <span className="flow-node-test__type">引用</span>
                </span>
                <input
                  className="flow-node-test__input"
                  type="text"
                  value={referenceInputs[key] ?? ''}
                  placeholder={`${reference.reference} 的值`}
                  onChange={(event) =>
                    setReferenceInputs((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            )
          })}
        </div>
      ) : null}

      {result ? (
        <div
          className={[
            'flow-node-test__result',
            result.ok ? 'is-success' : 'is-error',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="flow-node-test__result-status">
            {result.ok ? `成功（${result.duration}ms）` : `失败（${result.duration}ms）`}
          </span>
          {result.error ? (
            <span className="flow-node-test__result-error" role="alert">
              {result.error}
            </span>
          ) : null}
          {result.ok ? (
            <pre className="flow-node-test__json">{JSON.stringify(result.fields, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** 按字段类型把手填的字符串转成合适的值。 */
function coerceByType(type: string, raw: string): unknown {
  switch (type) {
    case 'number': {
      const parsed = Number(raw)
      return Number.isNaN(parsed) ? raw : parsed
    }
    case 'boolean':
      return raw === 'true' || raw === '1'
    case 'object':
    case 'array':
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    default:
      return raw
  }
}
