// 画布上的一个点 / 节点位置，单位为 px（画布世界坐标）
export interface Position {
  x: number
  y: number
}

// 视口变换：画布世界的平移 + 缩放（C-1、FR-C2）
export interface Viewport {
  x: number
  y: number
  zoom: number
}

// 节点类型
export interface Node {
  id: string;
  type?: string;
  data?: any;
  position: Position;
  selected?: boolean;
}

// 边类型
export interface Edge {
  id: string;
  source: string;
  target: string;
  type?: string;
  /** 源节点上的出口锚点 id（R3-3）。缺省表示节点的默认出口。 */
  sourceHandle?: string;
  /** 目标节点上的入口锚点 id（R3-3）。缺省表示节点的默认入口。 */
  targetHandle?: string;
  /** 连线标签，用于条件节点的分支名（R3-4）。 */
  label?: string;
  selected?: boolean;
}

/**
 * 文档元信息（FR-D1、R4-1）。
 * 宿主可放任意扩展信息；编辑器只写自己认识的那几个字段。
 */
export interface WorkflowMeta {
  /** 创建时间（ISO 字符串）。 */
  createdAt?: string;
  /** 最近修改时间（ISO 字符串）。 */
  updatedAt?: string;
  /** 文档作者（宿主写入）。 */
  author?: string;
  /** 文档说明（宿主写入）。 */
  description?: string;
  /** 宿主自定义扩展信息，原样保留、不被迁移改写（R4-1）。 */
  [key: string]: unknown;
}

/**
 * 编辑器持有的工作流文档快照（R2-1、FR-D1、R4-1）。
 *
 * v1.4 起文档是一等对象：`id` / `name` / `version` / `meta` 让它能被宿主
 * 持久化、被序列化、能按版本迁移。未知的顶层字段在迁移时原样保留。
 */
export interface Workflow {
  /** 文档唯一标识（FR-D1）。 */
  id: string;
  /** 文档名称（FR-D1）。 */
  name: string;
  /** 文档 schema 版本（FR-D1、R4-1）：整数，随 schema 演进递增。 */
  version: number;
  /** 文档元信息（FR-D1）。 */
  meta?: WorkflowMeta;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  /** 宿主自定义的顶层扩展字段，原样保留（R4-1）。 */
  [key: string]: unknown;
}

// 节点变更原语（FR-D2）：add / remove / replace / position / select
export type NodeChange =
  | { type: 'add'; node: Node }
  | { type: 'remove'; id: string }
  | { type: 'replace'; id: string; node: Node }
  | { type: 'position'; id: string; position: Position }
  | { type: 'select'; id: string; selected: boolean };

// 连线变更原语（FR-D2）：连线没有位置，其余与节点一致
export type EdgeChange =
  | { type: 'add'; edge: Edge }
  | { type: 'remove'; id: string }
  | { type: 'replace'; id: string; edge: Edge }
  | { type: 'select'; id: string; selected: boolean };
