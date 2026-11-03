import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  createRegistry,
  mergeRegistries,
  registryFrom,
  type NodeTypeDefinition,
  type NodeTypeRegistry,
} from './registry.ts'
import { BUILTIN_NODE_TYPE_DEFINITIONS } from './builtinTypes.tsx'

/** 内置类型注册表（R3-1、R3-2）。 */
export const BUILTIN_REGISTRY: NodeTypeRegistry = registryFrom(BUILTIN_NODE_TYPE_DEFINITIONS)

/**
 * 注册表上下文（R3-1）：`nodeTypes` prop 注入的类型会合并进内置注册表，
 * 同名类型以宿主定义优先。节点面板、节点卡片与配置面板都从这里读取。
 */
export const NodeTypeRegistryContext = createContext<NodeTypeRegistry>(BUILTIN_REGISTRY)

/** 读取当前生效的节点类型注册表。 */
export function useNodeTypeRegistry(): NodeTypeRegistry {
  return useContext(NodeTypeRegistryContext)
}

/** 把宿主的自定义类型合并进内置注册表；`undefined` 表示只用内置类型。 */
export function buildRegistry(custom?: NodeTypeDefinition[]): NodeTypeRegistry {
  if (!custom || custom.length === 0) return BUILTIN_REGISTRY
  return mergeRegistries(BUILTIN_REGISTRY, registryFrom(custom))
}

export interface NodeTypeProviderProps {
  /** 宿主注册的自定义节点类型。 */
  nodeTypes?: NodeTypeDefinition[]
  children: ReactNode
}

/**
 * 注册表提供者（R3-1、R3-8）。
 * 宿主自建三栏布局时，把面板放在 `ReactFlow` 外面，需要用这个 Provider
 * 让面板与画布共享同一份注册表。
 */
export const NodeTypeProvider = ({ nodeTypes, children }: NodeTypeProviderProps) => {
  const registry = useMemo(() => buildRegistry(nodeTypes), [nodeTypes])
  return (
    <NodeTypeRegistryContext.Provider value={registry}>
      {children}
    </NodeTypeRegistryContext.Provider>
  )
}

/** 空注册表，供测试与独立使用。 */
export { createRegistry }
