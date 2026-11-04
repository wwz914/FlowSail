import type { Edge, Node } from '@flowsail/core'
import type { FieldSchema, FieldType, NodeTypeRegistry, ParamSchema } from './registry.ts'
import { resolveNodeType } from './registry.ts'

/**
 * 变量引用语法（R4-5、FR-P3、ROADMAP Q10 收敛）。
 * 引用写作 `{{nodeId.field}}`；`nodeId` 是文档里的节点 id，
 * `field` 是该节点类型声明的输出字段名。
 */
export const REFERENCE_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*\}\}/g

/** 单个引用的解析结果。 */
export interface ParsedReference {
  /** 引用原文（含 `{{ }}`）。 */
  raw: string
  /** 引用指向的节点 id。 */
  nodeId: string
  /** 引用指向的字段名。 */
  field: string
  /** 引用在原文中的起始下标。 */
  index: number
}

/**
 * 引用解析的错误类型（R4-5）。
 * 每种错误都有可读原因，直接展示在配置面板与校验列表里。
 */
export type ReferenceErrorCode =
  | 'unknown-node'
  | 'unknown-field'
  | 'not-upstream'
  | 'type-mismatch'

/** 单条引用的校验结果。 */
export interface ReferenceCheck {
  reference: ParsedReference
  ok: boolean
  /** 失败时的错误码；通过时为 undefined。 */
  code?: ReferenceErrorCode
  /** 失败时的可读原因；通过时为 undefined。 */
  message?: string
}

/**
 * 从文本里解析出全部变量引用（R4-5）。
 * 纯函数：只做语法解析，不看文档。
 */
export function parseReferences(text: string): ParsedReference[] {
  if (typeof text !== 'string' || !text.includes('{{')) return []

  const references: ParsedReference[] = []
  const pattern = new RegExp(REFERENCE_PATTERN.source, 'g')
  let match = pattern.exec(text)

  while (match !== null) {
    references.push({
      raw: match[0],
      nodeId: match[1]!,
      field: match[2]!,
      index: match.index,
    })
    match = pattern.exec(text)
  }

  return references
}

/**
 * 判断一个字符串是否含有变量引用（R4-5）。
 * 用于在节点卡片上打轻量标记。
 */
export function hasReference(text: unknown): boolean {
  return typeof text === 'string' && parseReferences(text).length > 0
}

/**
 * 找出某个节点的**拓扑上游**节点 id 集合（R4-5、R4-6）。
 *
 * 上游 = 沿连线方向从该节点回溯可达的节点。回溯按节点 id 集合做广度优先，
 * 遇到环会自然终止（已访问的节点不再展开）。
 */
export function getUpstreamNodeIds(nodeId: string, edges: Edge[]): Set<string> {
  const upstream = new Set<string>()
  const queue: string[] = []

  for (const edge of edges) {
    if (edge.target === nodeId && edge.source !== nodeId) {
      queue.push(edge.source)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === nodeId || upstream.has(current)) continue
    upstream.add(current)

    for (const edge of edges) {
      if (edge.target === current && edge.source !== current && !upstream.has(edge.source)) {
        queue.push(edge.source)
      }
    }
  }

  return upstream
}

/**
 * 找到节点类型声明的输出字段（R4-4、R4-5）。
 * 未声明输出字段的类型按空作用域处理。
 */
export function findOutputField(
  registry: NodeTypeRegistry,
  node: Node,
  fieldName: string,
): FieldSchema | undefined {
  const definition = resolveNodeType(registry, node.type)
  return (definition.outputFields ?? []).find((field) => field.name === fieldName)
}

/** 字段类型是否与参数类型兼容（R4-5）。 */
export function isTypeCompatible(fieldType: FieldType, paramType: ParamSchema['type']): boolean {
  if (fieldType === 'any') return true

  switch (fieldType) {
    case 'object':
    case 'array':
      // 结构化字段只能放进 json 参数。
      return paramType === 'json'
    case 'string':
      return paramType === 'string' || paramType === 'select'
    case 'number':
      return paramType === 'number' || paramType === 'select'
    case 'boolean':
      return paramType === 'boolean'
    default:
      return true
  }
}

/**
 * 校验一段文本里的全部引用（R4-5、FR-P3）。
 *
 * 依次检查：引用目标节点是否存在、字段是否声明、目标是否拓扑上游、
 * 类型是否与参数类型匹配。任一失败即给出可读原因。
 */
export function checkReferences(
  text: string,
  options: {
    /** 当前正在配置的节点 id（用于判断拓扑上游）。 */
    nodeId: string
    /** 文档里的全部节点。 */
    nodes: Node[]
    /** 文档里的全部连线。 */
    edges: Edge[]
    /** 生效的节点类型注册表。 */
    registry: NodeTypeRegistry
    /** 参数 schema，用于类型匹配；缺省时跳过类型检查。 */
    schema?: ParamSchema
  },
): ReferenceCheck[] {
  const references = parseReferences(text)
  if (references.length === 0) return []

  const nodeMap = new Map(options.nodes.map((node) => [node.id, node]))
  const upstream = getUpstreamNodeIds(options.nodeId, options.edges)

  return references.map((reference) => {
    const target = nodeMap.get(reference.nodeId)
    if (!target) {
      return {
        reference,
        ok: false,
        code: 'unknown-node' as const,
        message: `引用的节点 ${reference.nodeId} 不存在`,
      }
    }

    const field = findOutputField(options.registry, target, reference.field)
    if (!field) {
      return {
        reference,
        ok: false,
        code: 'unknown-field' as const,
        message: `节点 ${reference.nodeId} 没有输出字段 ${reference.field}`,
      }
    }

    if (!upstream.has(reference.nodeId)) {
      return {
        reference,
        ok: false,
        code: 'not-upstream' as const,
        message: `节点 ${reference.nodeId} 不是当前节点的上游，不能引用它的输出`,
      }
    }

    if (options.schema && !isTypeCompatible(field.type, options.schema.type)) {
      return {
        reference,
        ok: false,
        code: 'type-mismatch' as const,
        message: `字段 ${reference.nodeId}.${reference.field} 的类型是 ${field.type}，与参数类型 ${options.schema.type} 不匹配`,
      }
    }

    return { reference, ok: true }
  })
}

/**
 * 一段文本里是否有失效的引用（R4-5）。
 * 校验面板与文档级校验都用它做快速判断。
 */
export function hasInvalidReference(
  text: string,
  options: Parameters<typeof checkReferences>[1],
): boolean {
  return checkReferences(text, options).some((check) => !check.ok)
}

/** 变量选择器里的一个候选项（R4-6）。 */
export interface VariableOption {
  /** 引用字面量，写入参数值。 */
  reference: string
  /** 提供该字段的节点 id。 */
  nodeId: string
  /** 节点的显示名。 */
  nodeLabel: string
  /** 字段名。 */
  field: string
  /** 字段类型。 */
  type: FieldType
  /** 字段说明；未声明时为 undefined。 */
  description?: string | undefined
}

/**
 * 列出当前节点可用的变量（R4-6、FR-P3）。
 *
 * 只列**拓扑上游**节点暴露的输出字段，按节点分组、按节点在文档里的顺序排列。
 */
export function listAvailableVariables(options: {
  nodeId: string
  nodes: Node[]
  edges: Edge[]
  registry: NodeTypeRegistry
}): VariableOption[] {
  const upstream = getUpstreamNodeIds(options.nodeId, options.edges)
  const options_: VariableOption[] = []

  for (const node of options.nodes) {
    if (!upstream.has(node.id)) continue

    const definition = resolveNodeType(options.registry, node.type)
    const outputFields = definition.outputFields ?? []
    if (outputFields.length === 0) continue

    const nodeLabel = String(node.data?.label ?? definition.label ?? node.id)

    for (const field of outputFields) {
      options_.push({
        reference: `{{${node.id}.${field.name}}}`,
        nodeId: node.id,
        nodeLabel,
        field: field.name,
        type: field.type,
        description: field.description,
      })
    }
  }

  return options_
}

/** 按节点分组后的变量列表（R4-6）。 */
export interface VariableGroup {
  nodeId: string
  nodeLabel: string
  fields: VariableOption[]
}

/**
 * 把可用变量按节点分组（R4-6）。
 * 分组顺序与文档里的节点顺序一致，组内按字段声明顺序。
 */
export function groupVariablesByNode(options: VariableOption[]): VariableGroup[] {
  const groups: VariableGroup[] = []
  const index = new Map<string, VariableGroup>()

  for (const option of options) {
    let group = index.get(option.nodeId)
    if (!group) {
      group = { nodeId: option.nodeId, nodeLabel: option.nodeLabel, fields: [] }
      index.set(option.nodeId, group)
      groups.push(group)
    }
    group.fields.push(option)
  }

  return groups
}

/**
 * 把引用字面量插入到一段文本里（R4-6）。
 * 已有相同引用时不重复插入。
 */
export function insertReference(text: string, reference: string): string {
  if (typeof text !== 'string') return reference
  if (parseReferences(text).some((parsed) => parsed.raw === reference)) return text
  if (!text) return reference
  return `${text} ${reference}`
}
