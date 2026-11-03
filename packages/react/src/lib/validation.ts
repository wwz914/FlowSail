import type { Edge, Node } from '@system'
import type { NodeTypeRegistry, ParamSchema } from './registry.ts'
import { resolveNodeType } from './registry.ts'
import { checkReferences } from './variables.ts'

/**
 * 文档级问题（R4-7、FR-P6）。
 * 问题列表汇总孤立节点、悬空连线、必填缺失与引用失效。
 */
export type IssueSeverity = 'error' | 'warning'

/** 文档级问题的类型。 */
export type IssueCode =
  | 'orphan-node'
  | 'dangling-edge'
  | 'missing-required'
  | 'invalid-reference'
  | 'unknown-node-type'

/** 一条文档级问题。 */
export interface DocumentIssue {
  /** 问题类型。 */
  code: IssueCode
  /** 严重程度：错误需处理，警告可暂缓。 */
  severity: IssueSeverity
  /** 可读描述，直接展示在问题列表里。 */
  message: string
  /** 关联的节点 id；点击问题可定位到该节点（R4-7）。 */
  nodeId?: string
  /** 关联的连线 id。 */
  edgeId?: string
  /** 关联的参数 key（必填缺失与引用失效）。 */
  paramKey?: string
}

/** 文档级校验的结果。 */
export interface ValidationResult {
  /** 全部问题，按严重程度与发现顺序排列。 */
  issues: DocumentIssue[]
  /** 错误数量。 */
  errorCount: number
  /** 警告数量。 */
  warningCount: number
}

/**
 * 找出没有任何连线相连的节点（R4-7）。
 * 孤立节点在流程图里通常意味着"忘了连"或"忘了删"。
 */
export function findOrphanNodes(nodes: Node[], edges: Edge[]): Node[] {
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }

  return nodes.filter((node) => !connected.has(node.id))
}

/**
 * 找出指向不存在节点的连线（R4-7）。
 * 这类连线通常来自导入损坏的文档或被外部删掉的节点。
 */
export function findDanglingEdges(nodes: Node[], edges: Edge[]): Array<Edge & { missing: string[] }> {
  const nodeIds = new Set(nodes.map((node) => node.id))

  return edges.flatMap((edge) => {
    const missing: string[] = []
    if (!nodeIds.has(edge.source)) missing.push(edge.source)
    if (!nodeIds.has(edge.target)) missing.push(edge.target)
    return missing.length > 0 ? [{ ...edge, missing }] : []
  })
}

/**
 * 执行文档级校验（R4-7、FR-P6）。
 *
 * 产出问题列表：孤立节点、悬空连线、必填缺失、引用失效、类型未注册。
 * 校验不修改文档，只报告问题。
 */
export function validateDocument(options: {
  nodes: Node[]
  edges: Edge[]
  registry: NodeTypeRegistry
  /** 是否把孤立节点报为警告；默认报为警告，不阻塞编辑（R4-7）。 */
  orphanAsWarning?: boolean
}): ValidationResult {
  const issues: DocumentIssue[] = []
  const { nodes, edges, registry } = options

  // 1. 孤立节点。
  for (const node of findOrphanNodes(nodes, edges)) {
    issues.push({
      code: 'orphan-node',
      severity: options.orphanAsWarning === false ? 'error' : 'warning',
      message: `节点「${String(node.data?.label ?? node.id)}」没有连到流程里`,
      nodeId: node.id,
    })
  }

  // 2. 悬空连线。
  for (const edge of findDanglingEdges(nodes, edges)) {
    issues.push({
      code: 'dangling-edge',
      severity: 'error',
      message: `连线 ${edge.id} 指向不存在的节点：${edge.missing.join('、')}`,
      edgeId: edge.id,
    })
  }

  // 3. 逐节点检查类型注册、必填参数与变量引用。
  for (const node of nodes) {
    const definition = resolveNodeType(registry, node.type)
    const params = definition.params ?? []

    // 类型未注册：回落为通用卡片，宿主多半需要知道（R4-3 导入校验也会报）。
    if (node.type && !registry.has(node.type)) {
      issues.push({
        code: 'unknown-node-type',
        severity: 'warning',
        message: `节点「${String(node.data?.label ?? node.id)}」的类型 ${node.type} 未注册`,
        nodeId: node.id,
      })
    }

    const values = (node.data ?? {}) as Record<string, unknown>

    // 必填缺失。
    for (const schema of params) {
      if (!schema.required) continue
      const value = values[schema.key]
      if (value === undefined || value === null || value === '') {
        issues.push({
          code: 'missing-required',
          severity: 'error',
          message: `节点「${String(node.data?.label ?? node.id)}」缺少必填参数「${schema.label}」`,
          nodeId: node.id,
          paramKey: schema.key,
        })
      }
    }

    // 引用失效。
    for (const schema of params) {
      const value = values[schema.key]
      if (typeof value !== 'string' || !value.includes('{{')) continue

      const checks = checkReferences(value, {
        nodeId: node.id,
        nodes,
        edges,
        registry,
        schema,
      })

      for (const check of checks) {
        if (check.ok) continue
        issues.push({
          code: 'invalid-reference',
          severity: 'error',
          message: `节点「${String(node.data?.label ?? node.id)}」的参数「${schema.label}」引用失效：${check.message}`,
          nodeId: node.id,
          paramKey: schema.key,
        })
      }
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.length - errorCount

  return { issues, errorCount, warningCount }
}

/**
 * 列出某个节点自身的问题（R4-7）。
 * 配置面板用它做局部提示。
 */
export function getNodeIssues(
  issues: DocumentIssue[],
  nodeId: string,
): DocumentIssue[] {
  return issues.filter((issue) => issue.nodeId === nodeId)
}

/**
 * 列出某个参数自身的问题（R4-5、R4-7）。
 * 配置面板用它给具体控件标红。
 */
export function getParamIssues(
  issues: DocumentIssue[],
  nodeId: string,
  paramKey: string,
): DocumentIssue[] {
  return issues.filter(
    (issue) => issue.nodeId === nodeId && issue.paramKey === paramKey,
  )
}

/**
 * 参数 schema 的必填检查（R4-7 的必填缺失部分，可在写回时单独调用）。
 */
export function findMissingRequired(
  params: ParamSchema[],
  values: Record<string, unknown>,
): ParamSchema[] {
  return params.filter((schema) => {
    if (!schema.required) return false
    const value = values[schema.key]
    return value === undefined || value === null || value === ''
  })
}
