import type { ReactNode } from 'react'

/** 节点类型的内置元数据；M2 的 N-1 注册表接管后，这里只保留默认数据来源。 */
export interface NodeTypeMeta {
  type: string
  /** 类型名，用于徽标与节点面板。 */
  label: string
  /** 新节点默认标题，沿用示例应用的英文演示文案。 */
  defaultLabel: string
  color: string
  icon: ReactNode
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true,
} as const

const StartIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M5.2 3.3v9.4L12.6 8 5.2 3.3Z" fill="currentColor" />
  </svg>
)

const LlmIcon = () => (
  <svg {...ICON_PROPS}>
    <path
      d="m8 1.8 1.5 3.9 3.9 1.5-3.9 1.5L8 12.6 6.5 8.7 2.6 7.2l3.9-1.5L8 1.8Z"
      fill="currentColor"
    />
  </svg>
)

const EndIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="4" y="4" width="8" height="8" rx="2" fill="currentColor" />
  </svg>
)

const DefaultIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="8" cy="8" r="4.5" fill="currentColor" />
  </svg>
)

/** 首版节点面板的 3 个内置类型（可继续扩到 M2 的 6 类）。 */
export const BUILTIN_NODE_TYPES: NodeTypeMeta[] = [
  {
    type: 'start',
    label: '开始',
    defaultLabel: 'Start',
    color: '#2f9e44',
    icon: <StartIcon />,
  },
  {
    type: 'llm',
    label: '大模型',
    defaultLabel: 'LLM',
    color: '#7048e8',
    icon: <LlmIcon />,
  },
  {
    type: 'end',
    label: '结束',
    defaultLabel: 'End',
    color: '#e8590c',
    icon: <EndIcon />,
  },
]

const NODE_TYPE_META = new Map(BUILTIN_NODE_TYPES.map((meta) => [meta.type, meta]))

/** 未知类型回落到通用图标，保证宿主的自定义节点仍能渲染。 */
export function getNodeTypeMeta(type?: string): NodeTypeMeta {
  const known = type ? NODE_TYPE_META.get(type) : undefined
  if (known) return known

  return {
    type: type ?? 'unknown',
    label: type ?? '节点',
    defaultLabel: type ?? 'Node',
    color: '#52606d',
    icon: <DefaultIcon />,
  }
}
