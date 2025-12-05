import React from 'react';
import type { Node } from '@system/types.ts';

interface NodeRendererProps {
  nodes: Node[];
}

// 节点渲染组件
export const NodeRenderer: React.FC<NodeRendererProps> = ({ nodes }) => {
  return (
    <>
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            left: node.position.x,
            top: node.position.y,
            border: '1px solid #333',
            background: '#fff',
            padding: 8,
            borderRadius: 4,
            width: 100,
            height: 40,
            boxSizing: 'border-box'
          }}
        >
          {node.data?.label || node.id}
        </div>
      ))}
    </>
  );
}