import { useId } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Edge } from '@system'
import { useFlowStore } from '../store/index.ts'
import { getSourceHandlePosition, getTargetHandlePosition } from '../lib/geometry.ts'
import {
  getBezierMidpoint,
  getBezierPath,
  type ConnectionState,
} from '../lib/connection.ts'

export interface EdgeRendererProps {
  connection: ConnectionState | null
}

/**
 * 连线层：SVG 贝塞尔曲线 + 箭头，位于节点层下方。
 * 选中高亮与点击选择在 R2-2 补齐（C-6、C-8）。
 */
export const EdgeRenderer = ({ connection }: EdgeRendererProps) => {
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const edges = useFlowStore((state) => state.workflow.edges)
  const selectEdge = useFlowStore((state) => state.selectEdge)
  const idPrefix = `flow-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const connectionSource = connection ? nodeById.get(connection.sourceId) : undefined
  const connectionTarget =
    connection?.targetId != null ? nodeById.get(connection.targetId) : undefined

  const previewPath =
    connection && connectionSource
      ? getBezierPath(
          getSourceHandlePosition(connectionSource),
          connectionTarget
            ? getTargetHandlePosition(connectionTarget)
            : connection.pointer,
        )
      : null

  const handleSelect = (edge: Edge, event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    selectEdge(edge.id, event.shiftKey)
  }

  return (
    <svg className="flow-edges" aria-hidden="true">
      <defs>
        <marker
          id={`${idPrefix}-normal`}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path className="flow-edge__arrowhead" d="M0,0 L8,4 L0,8 Z" />
        </marker>
        <marker
          id={`${idPrefix}-selected`}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path className="flow-edge__arrowhead is-selected" d="M0,0 L8,4 L0,8 Z" />
        </marker>
      </defs>

      {edges.map((edge: Edge) => {
        const sourceNode = nodeById.get(edge.source)
        const targetNode = nodeById.get(edge.target)
        if (!sourceNode || !targetNode) return null

        const source = getSourceHandlePosition(sourceNode)
        const target = getTargetHandlePosition(targetNode)
        const path = getBezierPath(source, target)
        const midpoint = getBezierMidpoint(source, target)

        return (
          <g
            key={edge.id}
            className={`flow-edge${edge.selected ? ' is-selected' : ''}`}
            data-edge-id={edge.id}
            onPointerDown={(event) => handleSelect(edge, event)}
          >
            <path className="flow-edge__hit" d={path} />
            <path
              className="flow-edge__line"
              d={path}
              markerEnd={`url(#${idPrefix}-${edge.selected ? 'selected' : 'normal'})`}
            />
            {edge.label ? (
              <text className="flow-edge__label" x={midpoint.x} y={midpoint.y}>
                {edge.label}
              </text>
            ) : null}
          </g>
        )
      })}

      {previewPath ? (
        <path
          className={`flow-edge__preview${connection?.error ? ' is-invalid' : ''}`}
          d={previewPath}
        />
      ) : null}
    </svg>
  )
}
