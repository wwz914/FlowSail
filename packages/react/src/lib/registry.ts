import type { ReactNode } from 'react'

/**
 * 参数控件类型（FR-P2、R3-5）。
 * 本轮只取最小可用形态；字段访问语法 `{{nodeId.field}}` 属变量引用范畴，
 * 留到下一轮随 N-7 定型（PRD Q10 收敛）。
 */
export type ParamType = 'string' | 'number' | 'boolean' | 'select' | 'json'

/** 单个参数的 schema 定义（PRD Q10 的最小形态）。 */
export interface ParamSchema {
  /** 参数键，写在 `node.data` 上；不使用 `{{` `}}` 包裹的保留字面量。 */
  key: string
  /** 表单里显示的名称。 */
  label: string
  type: ParamType
  /** 是否必填；缺失时在面板内提示（FR-P2）。 */
  required?: boolean
  /** 新建节点时的默认值。 */
  default?: unknown
  /** `select` 类型的可选项。 */
  options?: Array<{ label: string; value: string | number }>
  /** 字段说明，显示在控件下方。 */
  description?: string
}

/**
 * 变量的字段类型（R4-4、FR-P3）。
 * 与 `ParamType` 区分：这里描述的是节点暴露的**数据字段**，
 * 而不是配置表单里的**控件类型**。
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

/**
 * 变量作用域里的一个字段声明（R4-4、FR-P3）。
 *
 * 节点类型定义通过 `inputFields` / `outputFields` 声明它暴露哪些字段，
 * 变量选择器与引用解析都以此为唯一来源（ROADMAP Q15）。
 */
export interface FieldSchema {
  /** 字段名，写在 `{{nodeId.field}}` 的 `field` 部分。 */
  name: string
  /** 字段类型，用于类型匹配校验。 */
  type: FieldType
  /** 字段说明，显示在选择器与 schema 预览里。 */
  description?: string
}

/** 锚点定义（R3-3）：条件节点有多个具名出口。 */
export interface HandleDefinition {
  /** 锚点 id，写在 `Edge.sourceHandle` / `Edge.targetHandle` 上。 */
  id: string
  /** 出口/入口的显示名，用作分支标签的默认值（R3-4）。 */
  label?: string
  /** 相对节点卡片的横向位置（0–1）。 */
  offset: number
}

/** 一类节点的完整定义（R3-1 注册表契约）。 */
export interface NodeTypeDefinition {
  /** 类型标识，落在 `Node.type` 上。 */
  type: string
  /** 类型名，用于徽标与节点面板。 */
  label: string
  /** 强调色。 */
  color: string
  /** 类型图标。 */
  icon: ReactNode
  /** 新建节点时写入 `node.data` 的默认数据。 */
  defaultData?: Record<string, unknown>
  /** 入口锚点；缺省表示该节点没有输入。 */
  inputs?: HandleDefinition[]
  /** 出口锚点；缺省表示该节点没有输出。 */
  outputs?: HandleDefinition[]
  /** 参数 schema，驱动配置面板的表单（R3-5）。 */
  params?: ParamSchema[]
  /**
   * 该节点**消费**的输入字段声明（R4-4、FR-N3）。
   * 缺省表示空作用域。
   */
  inputFields?: FieldSchema[]
  /**
   * 该节点**产出**的输出字段声明（R4-4、FR-N3）。
   * 变量引用只能指向这里声明的字段；缺省表示空作用域。
   */
  outputFields?: FieldSchema[]
}

/** 未注册类型的回落定义：保证宿主的未知节点仍能渲染，不报错（R3-1）。 */
export const FALLBACK_NODE_TYPE: NodeTypeDefinition = {
  type: 'unknown',
  label: '节点',
  color: '#52606d',
  icon: null,
  defaultData: {},
}

/** 注册表：类型 id → 定义。 */
export type NodeTypeRegistry = Map<string, NodeTypeDefinition>

/** 新建一个空注册表。 */
export function createRegistry(): NodeTypeRegistry {
  return new Map()
}

/**
 * 用一组定义构造注册表（R3-1）。
 * 后出现的定义覆盖先出现的，便于宿主在内置类型之上覆盖同名类型。
 */
export function registryFrom(definitions: NodeTypeDefinition[]): NodeTypeRegistry {
  const registry: NodeTypeRegistry = new Map()
  for (const definition of definitions) {
    registry.set(definition.type, definition)
  }
  return registry
}

/** 合并两个注册表：`override` 中的同名类型覆盖 `base`。 */
export function mergeRegistries(
  base: NodeTypeRegistry,
  override: NodeTypeRegistry,
): NodeTypeRegistry {
  const merged: NodeTypeRegistry = new Map(base)
  for (const [type, definition] of override) {
    merged.set(type, definition)
  }
  return merged
}

/**
 * 查找类型定义；未注册时回落为通用定义（R3-1）。
 * 回落定义保留原 type 与类型名，宿主仍能看出是哪个类型缺失。
 */
export function resolveNodeType(
  registry: NodeTypeRegistry,
  type?: string,
): NodeTypeDefinition {
  if (!type) return FALLBACK_NODE_TYPE
  const found = registry.get(type)
  if (found) return found
  return { ...FALLBACK_NODE_TYPE, type, label: type }
}

/** 注册表里的全部定义，按注册顺序。 */
export function listNodeTypes(registry: NodeTypeRegistry): NodeTypeDefinition[] {
  return [...registry.values()]
}
