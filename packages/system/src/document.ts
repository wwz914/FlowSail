import type { Edge, Node, Viewport, Workflow, WorkflowMeta } from './types.ts'

/**
 * 当前文档 schema 版本（FR-D1、R4-1、ROADMAP Q17）。
 * 从 `1` 开始，schema 演进时递增；`migrate` 按版本逐级升级。
 */
export const CURRENT_WORKFLOW_VERSION = 1

/** 文档的默认视口；导入缺失视口时的回落值。 */
export const DEFAULT_DOCUMENT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/** 迁移结果：成功时给出升级后的文档，失败时给出可读原因（R4-3）。 */
export interface MigrateResult {
  ok: boolean;
  /** 迁移后的文档；`ok` 为 false 时为 undefined。 */
  document?: Workflow;
  /** 失败原因，可直接展示给用户（R4-3）。 */
  message?: string;
}

/** 导入校验结果（R4-3）。 */
export interface ImportResult {
  ok: boolean;
  /** 校验通过后的文档。 */
  document?: Workflow;
  /** 可读错误列表；空数组表示通过。 */
  errors: string[];
}

let documentIdSequence = 0

/**
 * 生成一个文档 id（R4-1）。
 * 只用于新建文档；宿主持有自己的 id 时直接写进文档。
 */
export function createDocumentId(prefix = 'workflow'): string {
  documentIdSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${documentIdSequence}`
}

/**
 * 创建一个空白文档（R4-1）。
 * 视口用默认值，`meta` 记录创建与修改时间。
 */
export function createWorkflow(
  init: Partial<Pick<Workflow, 'id' | 'name' | 'meta'>> = {},
): Workflow {
  const now = new Date().toISOString()
  return {
    id: init.id ?? createDocumentId(),
    name: init.name ?? '未命名流程',
    version: CURRENT_WORKFLOW_VERSION,
    meta: {
      createdAt: now,
      updatedAt: now,
      ...(init.meta ?? {}),
    },
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_DOCUMENT_VIEWPORT },
  }
}

/**
 * 把任意对象补齐成一份合法文档（R4-1）。
 *
 * 缺失字段用默认值补齐；`version` 缺省按 `1` 处理（视为最老的一版）。
 * 未知字段（顶层与 `meta` 内）原样保留，宿主扩展信息不丢（R4-1）。
 */
export function normalizeWorkflow(input: unknown): Workflow {
  const raw = (input ?? {}) as Record<string, unknown>

  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as Node[]) : []
  const edges = Array.isArray(raw.edges) ? (raw.edges as Edge[]) : []
  const viewport = (
    raw.viewport && typeof raw.viewport === 'object'
      ? raw.viewport
      : {}
  ) as Partial<Viewport>

  const version =
    typeof raw.version === 'number' && Number.isInteger(raw.version) && raw.version >= 1
      ? raw.version
      : 1

  const normalized: Workflow = {
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : createDocumentId(),
    name: typeof raw.name === 'string' ? raw.name : '未命名流程',
    version,
    meta: {
      ...(raw.meta && typeof raw.meta === 'object' ? (raw.meta as WorkflowMeta) : {}),
    },
    nodes,
    edges,
    viewport: {
      x: typeof viewport.x === 'number' ? viewport.x : DEFAULT_DOCUMENT_VIEWPORT.x,
      y: typeof viewport.y === 'number' ? viewport.y : DEFAULT_DOCUMENT_VIEWPORT.y,
      zoom:
        typeof viewport.zoom === 'number' && viewport.zoom > 0
          ? viewport.zoom
          : DEFAULT_DOCUMENT_VIEWPORT.zoom,
    },
  }

  return normalized
}

/**
 * 把旧版本文档升级到当前版本（FR-D1、R4-1、ROADMAP Q17）。
 *
 * 迁移按版本逐级进行；当前只有 `1` 一版，因此 `1 → 1` 是恒等映射。
 * 版本过新（大于当前版本）时拒绝导入并给出可读原因。
 * 未知字段原样保留。
 */
export function migrateWorkflow(input: unknown): MigrateResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: '文档内容不是对象，无法导入' }
  }

  const raw = input as Record<string, unknown>
  const version = raw.version

  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version))) {
    return { ok: false, message: '文档版本号不是整数，无法导入' }
  }

  const from = typeof version === 'number' ? version : 1

  if (from > CURRENT_WORKFLOW_VERSION) {
    return {
      ok: false,
      message: `文档版本 ${from} 高于当前支持的版本 ${CURRENT_WORKFLOW_VERSION}，请升级编辑器后再导入`,
    }
  }

  if (from < 1) {
    return { ok: false, message: `文档版本 ${from} 无效，无法导入` }
  }

  // 逐级升级：当前只有第 1 版，占位以便将来追加第 2 版的迁移逻辑。
  const document = normalizeWorkflow(raw)

  return { ok: true, document }
}

/**
 * 校验导入的文档并给出可读错误列表（R4-3、FR-D3）。
 *
 * 检查项：必填字段、节点与连线的结构、连线是否指向存在的节点。
 * 节点类型是否注册由调用方补充（注册表属于 `@flowsail/core` 之外的知识）。
 */
export function validateWorkflowDocument(input: unknown): ImportResult {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['文档内容不是对象'] }
  }

  const raw = input as Record<string, unknown>

  if (!Array.isArray(raw.nodes)) errors.push('缺少 nodes 数组')
  if (!Array.isArray(raw.edges)) errors.push('缺少 edges 数组')

  if (errors.length > 0) return { ok: false, errors }

  const nodes = raw.nodes as Node[]
  const edges = raw.edges as Edge[]

  const nodeIds = new Set<string>()
  nodes.forEach((node, index) => {
    if (!node || typeof node.id !== 'string' || !node.id) {
      errors.push(`第 ${index + 1} 个节点缺少 id`)
      return
    }
    if (nodeIds.has(node.id)) {
      errors.push(`节点 id 重复：${node.id}`)
      return
    }
    nodeIds.add(node.id)
    if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
      errors.push(`节点 ${node.id} 的 position 无效`)
    }
  })

  edges.forEach((edge, index) => {
    if (!edge || typeof edge.id !== 'string' || !edge.id) {
      errors.push(`第 ${index + 1} 条连线缺少 id`)
      return
    }
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      errors.push(`连线 ${edge.id} 缺少 source 或 target`)
      return
    }
    if (!nodeIds.has(edge.source)) {
      errors.push(`连线 ${edge.id} 的起点节点 ${edge.source} 不存在`)
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`连线 ${edge.id} 的终点节点 ${edge.target} 不存在`)
    }
  })

  if (errors.length > 0) return { ok: false, errors }

  const migrated = migrateWorkflow(raw)
  if (!migrated.ok || !migrated.document) {
    return { ok: false, errors: [migrated.message ?? '文档迁移失败'] }
  }

  return { ok: true, errors: [], document: migrated.document }
}

/**
 * 把文档序列化为 JSON 文本（FR-D1、FR-D3）。
 * `pretty` 为 true 时带缩进，便于人读与版本管理。
 */
export function serializeWorkflow(document: Workflow, pretty = true): string {
  return JSON.stringify(document, null, pretty ? 2 : undefined)
}

/**
 * 解析 JSON 文本并校验导入（R4-3、FR-D3）。
 * JSON 语法错误与 schema 错误都给出可读原因。
 */
export function parseWorkflowDocument(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`JSON 解析失败：${detail}`] }
  }

  return validateWorkflowDocument(parsed)
}
