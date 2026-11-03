import type { Node, Workflow } from '@system'
import {
  CURRENT_WORKFLOW_VERSION,
  parseWorkflowDocument,
  serializeWorkflow,
  validateWorkflowDocument,
} from '@system'
import type { NodeTypeRegistry } from './registry.ts'

/** 导入结果（R4-3、FR-D3）。 */
export interface ImportOutcome {
  ok: boolean
  /** 导入成功后的文档。 */
  document?: Workflow
  /** 可读错误列表；空数组表示通过。 */
  errors: string[]
}

/** 导出结果（R4-3、FR-D3）。 */
export interface ExportOutcome {
  ok: boolean
  /** 导出的 JSON 文本。 */
  text?: string
  /** 建议的文件名。 */
  fileName?: string
  /** 可读错误。 */
  errors: string[]
}

/**
 * 导出文档为 JSON 文本（R4-3、FR-D3）。
 * 导出内容带 schema 版本号，导入时可据此迁移。
 */
export function exportWorkflow(document: Workflow): ExportOutcome {
  try {
    const payload = {
      ...document,
      version: document.version ?? CURRENT_WORKFLOW_VERSION,
    }
    const text = serializeWorkflow(payload, true)
    const safeName = (document.name || 'workflow').replace(/[^\w一-龥-]+/g, '_')
    return { ok: true, text, fileName: `${safeName}.flowsail.json`, errors: [] }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`导出失败：${detail}`] }
  }
}

/**
 * 校验导入的文档（R4-3、FR-D3）。
 *
 * 除结构校验外，还检查节点类型是否在注册表里；未注册的类型给出可读错误
 * 并拒绝导入（ROADMAP §9.3 R4-3 的验收标准）。
 */
export function importWorkflow(text: string, registry: NodeTypeRegistry): ImportOutcome {
  const parsed = parseWorkflowDocument(text)
  if (!parsed.ok || !parsed.document) {
    return { ok: false, errors: parsed.errors }
  }

  const unregistered = findUnregisteredNodeTypes(parsed.document.nodes, registry)
  if (unregistered.length > 0) {
    return {
      ok: false,
      errors: unregistered.map(
        (type) => `文档里有未注册的节点类型「${type}」，请先在宿主里注册该类型`,
      ),
    }
  }

  return { ok: true, document: parsed.document, errors: [] }
}

/**
 * 找出文档里未注册的节点类型（R4-3）。
 */
export function findUnregisteredNodeTypes(
  nodes: Node[],
  registry: NodeTypeRegistry,
): string[] {
  const types = new Set<string>()
  for (const node of nodes) {
    if (!node.type) continue
    if (!registry.has(node.type)) types.add(node.type)
  }
  return [...types]
}

/**
 * 触发浏览器下载，把文档导出成 JSON 文件（R4-3、FR-D3、FR-U2）。
 * 在没有 DOM 的环境（SSR、测试）里返回失败而不是抛错。
 */
export function downloadWorkflow(workflowDocument: Workflow): ExportOutcome {
  const outcome = exportWorkflow(workflowDocument)
  if (!outcome.ok || !outcome.text || !outcome.fileName) return outcome

  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return { ok: false, errors: ['当前环境不支持文件下载'] }
  }

  try {
    const blob = new Blob([outcome.text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = outcome.fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    return outcome
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`导出失败：${detail}`] }
  }
}

/**
 * 从选中的文件读出文本内容（R4-3）。
 * 读文件失败时给出可读错误。
 */
export async function readFileText(file: File): Promise<{ ok: boolean; text?: string; errors: string[] }> {
  try {
    const text = await file.text()
    return { ok: true, text, errors: [] }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`读取文件失败：${detail}`] }
  }
}

/**
 * 只做结构校验、不检查节点类型的导入校验（R4-3）。
 * 供不需要注册表的场景使用（例如纯文档服务端校验）。
 */
export function validateDocumentStructure(text: string): ImportOutcome {
  const parsed = validateWorkflowDocument(safeParse(text))
  if (!parsed.ok || !parsed.document) {
    return { ok: false, errors: parsed.errors }
  }
  return { ok: true, document: parsed.document, errors: [] }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
