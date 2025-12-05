import React from 'react';
import type { Node, Edge } from '@system/types.ts';

interface EdgeRendererProps {
  edges: Edge[];
  nodes: Node[];
}

function getNodePosition(nodes: Node[], id: string) {
  const node = nodes.find((n) => n.id === id);
  return node ? node.position : { x: 0, y: 0 };
}

// 边渲染组件
export const EdgeRenderer: React.FC<EdgeRendererProps> = ({ edges, nodes }) => {
  return (
    <svg
      className="edge-layer"
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        left: 0,
        top: 0,
      }}>
      {edges.map((edge) => {
        const sourseNode = getNodePosition(nodes, edge.source);
        const targetNode = getNodePosition(nodes, edge.target);
        if (!sourseNode || !targetNode) {
          return null;
        }
        return (
          <line
            key={edge.id}
            x1={sourseNode.x + 50}
            y1={sourseNode.y + 20}
            x2={targetNode.x + 50}
            y2={targetNode.y + 20}
            stroke="#999"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}