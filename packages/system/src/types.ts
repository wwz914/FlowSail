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
  label?: string;
  selected?: boolean;
}

/**
 * 编辑器持有的工作流文档快照（R2-1）。
 * 第二轮只包含画布状态；M2 的 N-7 再在此基础上扩展 id / name / version / meta。
 */
export interface Workflow {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
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
