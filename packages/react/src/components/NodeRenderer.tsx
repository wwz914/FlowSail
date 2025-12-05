import React, { useEffect, useRef } from 'react';
import type { Node } from '@system/types.ts';
import { select } from 'd3-selection';
import { drag, type D3DragEvent } from 'd3-drag';
import { useFlowStore } from '../index.ts';

interface NodeRendererProps {
  nodes: Node[];
}

// 节点渲染组件
export const NodeRenderer: React.FC<NodeRendererProps> = ({ nodes }) => {
  const { setNodes } = useFlowStore();
  return (
    <>
      {nodes.map((node) => {
        const nodeRef = useRef<HTMLDivElement | null>(null);
        useEffect(() => {
          // if (!nodeRef.current) return;

          const d3Node = select(nodeRef.current as HTMLDivElement);
          d3Node.call(
            drag<HTMLDivElement, unknown, unknown>()
              .on('drag', (event: D3DragEvent<HTMLDivElement, unknown, unknown>) => {
                setNodes((nds) => nds.map((n) =>
                    n.id === node.id ? {
                      ...n,
                      position: {
                        x: event.x,
                        y: event.y
                      }
                    } : n
                  )
                )
              })
          )
        }, [node.id, setNodes]);

        return (
          <div
            key={node.id}
            ref={nodeRef}
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
              boxSizing: 'border-box',
              cursor: 'move',
              zIndex: 10,
            }}
          >
            {node.data?.label || node.id}
          </div>
        )
      })}
    </>
  );
}