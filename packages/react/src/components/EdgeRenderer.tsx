import { useId } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { Edge } from '@flowsail/core'
import { useFlowStore } from '../store/index.ts'
import {
  findInputHandle,
  findOutputHandle,
  getSourceHandlePosition,
  getSourceHandlePositionById,
  getTargetHandlePosition,
  getTargetHandlePositionById,
} from '../lib/geometry.ts'
import {
  getBezierMidpoint,
  getBezierPath,
  type ConnectionState,
} from '../lib/connection.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { resolveNodeType } from '../lib/registry.ts'

export interface EdgeRendererProps {
  connection: ConnectionState | null
}

/**
 * 连线层：SVG 贝塞尔曲线 + 箭头，位于节点层下方。
 * 连线端点按 `sourceHandle` / `targetHandle` 落到具体锚点（R3-3）；
 * 分支标签显示在曲线上（R3-4）。
 */
export const EdgeRenderer = ({ connection }: EdgeRendererProps) => {
  const registry = useNodeTypeRegistry()
  const nodes = useFlowStore((state) => state.workflow.nodes)
  const edges = useFlowStore((state) => state.workflow.edges)
  const selectEdge = useFlowStore((state) => state.selectEdge)
  const idPrefix = `flow-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const connectionSource = connection ? nodeById.get(connection.sourceId) : undefined
  const connectionTarget =
    connection?.targetId != null ? nodeById.get(connection.targetId) : undefined

  const resolveEndpoints = (edge: Edge) => {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) return null

    const sourceDefinition = resolveNodeType(registry, sourceNode.type)
    const targetDefinition = resolveNodeType(registry, targetNode.type)
    const output = findOutputHandle(sourceDefinition.outputs, edge.sourceHandle)
    const input = findInputHandle(targetDefinition.inputs, edge.targetHandle)

    return {
      source: output
        ? getSourceHandlePositionById(sourceNode, output)
        : getSourceHandlePosition(sourceNode),
      target: input
        ? getTargetHandlePositionById(targetNode, input)
        : getTargetHandlePosition(targetNode),
    }
  }

  const previewEndpoints =
    connection && connectionSource
      ? (() => {
          const sourceDefinition = resolveNodeType(registry, connectionSource.type)
          const output = findOutputHandle(
            sourceDefinition.outputs,
            connection.sourceHandle,
          )
          const source = output
            ? getSourceHandlePositionById(connectionSource, output)
            : getSourceHandlePosition(connectionSource)
          const target = connectionTarget
            ? (() => {
                const targetDefinition = resolveNodeType(registry, connectionTarget.type)
                const input = findInputHandle(targetDefinition.inputs)
                return input
                  ? getTargetHandlePositionById(connectionTarget, input)
                  : getTargetHandlePosition(connectionTarget)
              })()
            : connection.pointer
          return { source, target }
        })()
      : null

  const previewPath = previewEndpoints
    ? getBezierPath(previewEndpoints.source, previewEndpoints.target)
    : null

  const handleSelect = (edge: Edge, event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    selectEdge(edge.id, event.shiftKey)
  }

  const handleKeyDown = (edge: Edge, event: ReactKeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    selectEdge(edge.id, event.shiftKey)
  }

  const getNodeLabel = (nodeId: string) => {
    const node = nodeById.get(nodeId)
    if (!node) return nodeId
    return String(node.data?.label ?? resolveNodeType(registry, node.type).label)
  }

  return (
    <svg className="flow-edges" role="group" aria-label="连线">
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
        // 反向拖拽期间隐藏被摘下的连线（R8-4）。
        if (connection?.detachedEdgeId === edge.id) return null
        const endpoints = resolveEndpoints(edge)
        if (!endpoints) return null

        const { source, target } = endpoints
        const path = getBezierPath(source, target)
        const midpoint = getBezierMidpoint(source, target)
        const sourceLabel = getNodeLabel(edge.source)
        const targetLabel = getNodeLabel(edge.target)
        const edgeLabel = `从 ${sourceLabel} 到 ${targetLabel} 的连线${
          edge.label ? `（分支：${edge.label}）` : ''
        }${edge.selected ? '，已选中' : ''}`

        return (
          <g
            key={edge.id}
            className={`flow-edge${edge.selected ? ' is-selected' : ''}`}
            data-edge-id={edge.id}
            data-source-handle={edge.sourceHandle ?? ''}
            tabIndex={0}
            role="button"
            aria-label={edgeLabel}
            aria-pressed={Boolean(edge.selected)}
            onKeyDown={(event) => handleKeyDown(edge, event)}
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
