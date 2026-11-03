import { describe, expect, it } from 'vitest'
import {
  CURRENT_WORKFLOW_VERSION,
  createWorkflow,
  migrateWorkflow,
  normalizeWorkflow,
  parseWorkflowDocument,
  serializeWorkflow,
  validateWorkflowDocument,
} from './index.ts'

describe('文档模型（R4-1、FR-D1）', () => {
  it('新建文档带 id / name / version / meta', () => {
    const document = createWorkflow({ name: '我的流程' })

    expect(document.id).toBeTruthy()
    expect(document.name).toBe('我的流程')
    expect(document.version).toBe(CURRENT_WORKFLOW_VERSION)
    expect(document.meta?.createdAt).toBeTruthy()
    expect(document.nodes).toEqual([])
    expect(document.edges).toEqual([])
  })

  it('每份新文档的 id 互不相同', () => {
    expect(createWorkflow().id).not.toBe(createWorkflow().id)
  })

  it('normalizeWorkflow 补齐缺失字段', () => {
    const normalized = normalizeWorkflow({ nodes: [{ id: 'a', position: { x: 0, y: 0 } }] })

    expect(normalized.id).toBeTruthy()
    expect(normalized.name).toBe('未命名流程')
    expect(normalized.version).toBe(1)
    expect(normalized.edges).toEqual([])
    expect(normalized.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('normalizeWorkflow 保留未知的顶层字段', () => {
    const normalized = normalizeWorkflow({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      hostExtension: { tenant: 'acme' },
    })

    expect(normalized.hostExtension).toEqual({ tenant: 'acme' })
  })

  it('normalizeWorkflow 保留未知的 meta 字段', () => {
    const normalized = normalizeWorkflow({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      meta: { author: '王文钊', tenantId: 'acme' },
    })

    expect(normalized.meta?.author).toBe('王文钊')
    expect(normalized.meta?.tenantId).toBe('acme')
  })

  it('normalizeWorkflow 修复非法的视口缩放', () => {
    const normalized = normalizeWorkflow({
      nodes: [],
      edges: [],
      viewport: { x: 5, y: 6, zoom: 0 },
    })

    expect(normalized.viewport).toEqual({ x: 5, y: 6, zoom: 1 })
  })
})

describe('迁移（R4-1、ROADMAP Q17）', () => {
  it('第 1 版文档迁移到当前版本后内容不变', () => {
    const original = createWorkflow({ name: '流程' })
    const result = migrateWorkflow(original)

    expect(result.ok).toBe(true)
    expect(result.document?.version).toBe(CURRENT_WORKFLOW_VERSION)
    expect(result.document?.name).toBe('流程')
  })

  it('缺少 version 的文档按第 1 版处理', () => {
    const result = migrateWorkflow({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })

    expect(result.ok).toBe(true)
    expect(result.document?.version).toBe(CURRENT_WORKFLOW_VERSION)
  })

  it('版本过新时拒绝导入并给出可读原因', () => {
    const result = migrateWorkflow({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: CURRENT_WORKFLOW_VERSION + 1,
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('高于当前支持的版本')
  })

  it('版本号不是整数时拒绝导入', () => {
    const result = migrateWorkflow({ nodes: [], edges: [], version: 1.5 })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('不是整数')
  })

  it('内容不是对象时拒绝导入', () => {
    expect(migrateWorkflow(null).ok).toBe(false)
    expect(migrateWorkflow('abc').ok).toBe(false)
  })

  it('迁移保留宿主的扩展字段', () => {
    const result = migrateWorkflow({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      tenantData: { key: 'value' },
    })

    expect(result.document?.tenantData).toEqual({ key: 'value' })
  })
})

describe('序列化与导入校验（R4-3、FR-D3）', () => {
  it('序列化后可被解析回来，且内容一致', () => {
    const document = createWorkflow({ name: '往返测试' })
    document.nodes = [{ id: 'a', type: 'start', position: { x: 1, y: 2 }, data: { label: 'A' } }]
    document.edges = [{ id: 'e1', source: 'a', target: 'a' }]

    const text = serializeWorkflow(document)
    const parsed = parseWorkflowDocument(text)

    expect(parsed.ok).toBe(true)
    expect(parsed.document?.nodes).toEqual(document.nodes)
    expect(parsed.document?.edges).toEqual(document.edges)
    expect(parsed.document?.name).toBe('往返测试')
  })

  it('JSON 语法错误时给出可读原因', () => {
    const parsed = parseWorkflowDocument('{ not json')

    expect(parsed.ok).toBe(false)
    expect(parsed.errors[0]).toContain('JSON 解析失败')
  })

  it('缺少 nodes / edges 时拒绝导入', () => {
    const parsed = parseWorkflowDocument('{"id":"x"}')

    expect(parsed.ok).toBe(false)
    expect(parsed.errors).toContain('缺少 nodes 数组')
    expect(parsed.errors).toContain('缺少 edges 数组')
  })

  it('连线指向不存在的节点时拒绝导入', () => {
    const parsed = parseWorkflowDocument(
      JSON.stringify({
        nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
        edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    )

    expect(parsed.ok).toBe(false)
    expect(parsed.errors.some((message) => message.includes('ghost'))).toBe(true)
  })

  it('节点 id 重复时拒绝导入', () => {
    const parsed = parseWorkflowDocument(
      JSON.stringify({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 } },
          { id: 'a', position: { x: 10, y: 0 } },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    )

    expect(parsed.ok).toBe(false)
    expect(parsed.errors.some((message) => message.includes('重复'))).toBe(true)
  })

  it('validateWorkflowDocument 对合法文档通过', () => {
    const result = validateWorkflowDocument({
      nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.document?.version).toBe(CURRENT_WORKFLOW_VERSION)
  })
})
