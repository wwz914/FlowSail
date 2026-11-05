import { useFlowStore } from '../store/index.ts'
import type { Edge } from '@flowsail/core'
import type { ConnectionState } from '../lib/connection.ts'
import { NodeCard } from './NodeCard.tsx'

export interface NodeRendererProps {
  connection: ConnectionState | null
  /** 主题（R8-2）：错误浮层 portal 到 body 后仍要带上同一主题。 */
  theme?: 'light' | 'dark' | undefined
  onConnectStart: (nodeId: string, handleId: string, clientX: number, clientY: number) => void
  /** 从已有连线的输入锚点反向拖出（R8-4、FR-E5）。 */
  onDisconnectStart: (edge: Edge, clientX: number, clientY: number) => void
}

/** 节点层：把节点列表映射成卡片；所有 Hooks 都在 NodeCard 顶层调用（G-3）。 */
export const NodeRenderer = ({
  connection,
  theme,
  onConnectStart,
  onDisconnectStart,
}: NodeRendererProps) => {
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
            theme={theme}
            onConnectStart={onConnectStart}
            onDisconnectStart={onDisconnectStart}
          />
        )
      })}
    </>
  )
}
