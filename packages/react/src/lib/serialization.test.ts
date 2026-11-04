import { describe, expect, it } from 'vitest'
import { createWorkflow } from '@flowsail/core'
import { BUILTIN_REGISTRY } from './registryContext.tsx'
import {
  exportWorkflow,
  findUnregisteredNodeTypes,
  importWorkflow,
  validateDocumentStructure,
} from './serialization.ts'

describe('导出（R4-3、FR-D3）', () => {
  it('导出的 JSON 带 schema 版本号', () => {
    const document = createWorkflow({ name: '导出测试' })
    const outcome = exportWorkflow(document)

    expect(outcome.ok).toBe(true)
    const parsed = JSON.parse(outcome.text ?? '{}')
    expect(parsed.version).toBe(document.version)
    expect(parsed.name).toBe('导出测试')
  })

  it('导出文件名由文档名派生', () => {
    const outcome = exportWorkflow(createWorkflow({ name: '我的流程' }))

    expect(outcome.fileName).toContain('我的流程')
    expect(outcome.fileName?.endsWith('.flowsail.json')).toBe(true)
  })
})

describe('导入（R4-3、FR-D3）', () => {
  it('导入合法文档后画布与参数完整还原', () => {
    const document = createWorkflow({ name: '往返测试' })
    document.nodes = [
      { id: 'start', type: 'start', position: { x: 10, y: 20 }, data: { label: 'Start' } },
      {
        id: 'llm',
        type: 'llm',
        position: { x: 10, y: 120 },
        data: { label: 'LLM', prompt: '你好 {{start.query}}' },
      },
    ]
    document.edges = [{ id: 'e1', source: 'start', target: 'llm' }]

    const outcome = importWorkflow(exportWorkflow(document).text ?? '', BUILTIN_REGISTRY)

    expect(outcome.ok).toBe(true)
    expect(outcome.document?.nodes).toEqual(document.nodes)
    expect(outcome.document?.edges).toEqual(document.edges)
    expect(outcome.document?.name).toBe('往返测试')
  })

  it('JSON 语法错误时拒绝导入并给出可读原因', () => {
    const outcome = importWorkflow('{ broken', BUILTIN_REGISTRY)

    expect(outcome.ok).toBe(false)
    expect(outcome.errors[0]).toContain('JSON 解析失败')
  })

  it('缺少字段时拒绝导入', () => {
    const outcome = importWorkflow('{"id":"x"}', BUILTIN_REGISTRY)

    expect(outcome.ok).toBe(false)
    expect(outcome.errors.length).toBeGreaterThan(0)
  })

  it('版本过新时拒绝导入', () => {
    const document = createWorkflow()
    const payload = JSON.stringify({ ...document, version: document.version + 5 })
    const outcome = importWorkflow(payload, BUILTIN_REGISTRY)

    expect(outcome.ok).toBe(false)
    expect(outcome.errors[0]).toContain('高于当前支持的版本')
  })

  it('节点类型未注册时拒绝导入并说明原因', () => {
    const document = createWorkflow()
    document.nodes = [
      { id: 'alien', type: 'not-registered', position: { x: 0, y: 0 }, data: {} },
    ]
    const payload = JSON.stringify(document)
    const outcome = importWorkflow(payload, BUILTIN_REGISTRY)

    expect(outcome.ok).toBe(false)
    expect(outcome.errors[0]).toContain('not-registered')
    expect(outcome.errors[0]).toContain('未注册')
  })

  it('findUnregisteredNodeTypes 列出未注册的类型', () => {
    const unregistered = findUnregisteredNodeTypes(
      [
        { id: 'a', type: 'start', position: { x: 0, y: 0 } },
        { id: 'b', type: 'ghost', position: { x: 0, y: 0 } },
        { id: 'c', type: 'ghost', position: { x: 0, y: 0 } },
      ],
      BUILTIN_REGISTRY,
    )

    expect(unregistered).toEqual(['ghost'])
  })
})

describe('结构校验（R4-3）', () => {
  it('只做结构校验时不检查节点类型', () => {
    const document = createWorkflow()
    document.nodes = [{ id: 'alien', type: 'not-registered', position: { x: 0, y: 0 } }]

    const outcome = validateDocumentStructure(JSON.stringify(document))
    expect(outcome.ok).toBe(true)
  })
})
