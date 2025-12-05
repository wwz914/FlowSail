import React, { useEffect } from 'react';
import './style.scss';
import { useFlowStore } from './store/index.ts';
import type { Node, Edge } from '@system/types.ts';

export interface ReactFlowProps {
  nodes?: Node[];
  edges?: Edge[];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  children?: React.ReactNode;
}

export const ReactFlow: React.FC<ReactFlowProps> = ({
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
  children,
}) => {
  const { setNodes, setEdges } = useFlowStore();
  useEffect(() => {
    setNodes(nodes);
    setEdges(edges);
  }, [nodes, edges, setNodes, setEdges]);

  return (
    <div className="react-flow">{children}</div>
  )
}