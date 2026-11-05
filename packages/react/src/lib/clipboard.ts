import type { Edge, Node } from '@flowsail/core'

/**
 * 复制 / 粘贴（R6-2、FR-N5、FR-U3、X-2）。
 *
 * 剪贴板内容是纯数据；模块级剪贴板只保存一次复制结果，
 * 供 Ctrl/Cmd+C/V 与选中浮动工具条的「复制」共用（R8-4）。
 */

/** 剪贴板内容：一次复制下来的节点与它们之间的连线。 */
export interface ClipboardContent {
  nodes: Node[]
  edges: Edge[]
}

/** 粘贴时新节点相对原节点的偏移（像素）。 */
export const PASTE_OFFSET = 24

/**
 * 取出选中的节点，以及两端都在选中集合里的连线。
 *
 * 只复制"两端都选中"的连线：部分选中的连线没有意义
 * （另一端不在剪贴板里，粘贴后会成为悬空连线）。
 */
export function collectClipboard(nodes: Node[], edges: Edge[]): ClipboardContent {
  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedIds = new Set(selectedNodes.map((node) => node.id))
  const selectedEdges = edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  )
  return { nodes: selectedNodes, edges: selectedEdges }
}

/** 剪贴板是否为空（没有可粘贴的节点）。 */
export function isClipboardEmpty(content: ClipboardContent | null): boolean {
  return !content || content.nodes.length === 0
}

/**
 * 模块级剪贴板（R8-4）：Ctrl/Cmd+C 与浮动工具条的「复制」写同一份。
 * 浏览器剪贴板不参与：节点数据是内部结构，只在编辑器内流转。
 */
let internalClipboard: ClipboardContent | null = null

/** 把当前选区写入剪贴板；没有选中节点时返回 null 且不覆盖已有内容。 */
export function copySelection(nodes: Node[], edges: Edge[]): ClipboardContent | null {
  const content = collectClipboard(nodes, edges)
  if (isClipboardEmpty(content)) return null
  internalClipboard = content
  return content
}

/** 读取模块级剪贴板；没有复制过或已被清空时为 null。 */
export function getClipboardContent(): ClipboardContent | null {
  return internalClipboard
}

/** 直接写入 / 清空模块级剪贴板（测试与宿主集成用）。 */
export function setClipboardContent(content: ClipboardContent | null): void {
  internalClipboard = content
}

/** 生成一个不与现有节点冲突的新 id。 */
export function createUniqueId(
  prefix: string,
  existingIds: Iterable<string>,
  sequence: number,
): string {
  const taken = new Set(existingIds)
  let candidate = `${prefix}-${sequence}`
  let counter = sequence
  while (taken.has(candidate)) {
    counter += 1
    candidate = `${prefix}-${counter}`
  }
  return candidate
}

export interface PasteResult {
  nodes: Node[]
  edges: Edge[]
  /** 原始 id → 新 id 的映射，便于宿主做进一步关联。 */
  idMap: Record<string, string>
}

/**
 * 把剪贴板内容粘贴成新的一组节点与连线（R6-2）。
 *
 * - 新节点 id 不与文档里已有的冲突；
 * - 位置统一加上 `offset`，避免与原节点完全重叠；
 * - 连线的 `source` / `target` 按 id 映射改写；
 * - 连线 id 同样重新生成，避免与文档里已有的冲突；
 * - `withEdges` 为假时只粘贴节点，不粘贴连线（Q24 的默认行为）。
 */
export function pasteClipboard(
  content: ClipboardContent,
  existingNodes: Node[],
  existingEdges: Edge[],
  options: { withEdges?: boolean; offset?: number; idPrefix?: string } = {},
): PasteResult {
  const { withEdges = false, offset = PASTE_OFFSET, idPrefix = 'copy' } = options

  const existingNodeIds = existingNodes.map((node) => node.id)
  const existingEdgeIds = existingEdges.map((edge) => edge.id)

  const idMap: Record<string, string> = {}
  // 生成的 id 要边生成边记进已占用集合，否则同一批里可能出现重复。
  const takenNodeIds = new Set(existingNodeIds)
  let nodeSequence = 1
  const nodes = content.nodes.map((node) => {
    const id = createUniqueId(idPrefix, takenNodeIds, nodeSequence)
    nodeSequence += 1
    takenNodeIds.add(id)
    idMap[node.id] = id
    return {
      ...node,
      id,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      selected: true,
    }
  })

  const edges: Edge[] = []
  if (withEdges) {
    const takenEdgeIds = new Set(existingEdgeIds)
    let edgeSequence = 1
    for (const edge of content.edges) {
      const source = idMap[edge.source]
      const target = idMap[edge.target]
      if (!source || !target) continue
      const id = createUniqueId('edge-copy', takenEdgeIds, edgeSequence)
      takenEdgeIds.add(id)
      edges.push({
        ...edge,
        id,
        source,
        target,
        selected: false,
      })
      edgeSequence += 1
    }
  }

  return { nodes, edges, idMap }
}

/**
 * 把一个节点重命名（R6-3）。
 *
 * 名称写在 `data.label`；没有 `data` 时新建一个。
 */
export function renameNode(node: Node, label: string): Node {
  return {
    ...node,
    data: { ...(node.data ?? {}), label },
  }
}
