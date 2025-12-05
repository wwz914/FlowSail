// 节点类型
export interface Node {
  id: string;
  type?: string;
  data?: any;
  position: { x: number; y: number };
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