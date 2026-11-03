import { useFlowStore } from '../store/index.ts'
import type { ConnectionState } from '../lib/connection.ts'
import { NodeCard } from './NodeCard.tsx'

export interface NodeRendererProps {
  connection: ConnectionState | null
  onConnectStart: (nodeId: string, clientX: number, clientY: number) => void
}

/** 节点层：把节点列表映射成卡片；所有 Hooks 都在 NodeCard 顶层调用（G-3）。 */
export const NodeRenderer = ({ connection, onConnectStart }: NodeRendererProps) => {
  const nodes = useFlowStore((state) => state.workflow.nodes)

  return (
    <>
      {nodes.map((node) => {
        const isConnectionTarget = connection?.targetId === node.id
        return (
          <NodeCard
            key={node.id}
            node={node}
            isConnectionSource={connection?.sourceId === node.id}
            isConnectionTarget={isConnectionTarget}
            isConnectionTargetInvalid={Boolean(isConnectionTarget && connection?.error)}
            onConnectStart={onConnectStart}
          />
        )
      })}
    </>
  )
}
