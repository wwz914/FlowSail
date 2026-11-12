import type { NodeTypeDefinition } from './registry.ts'

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

const PluginIcon = () => (
  <svg {...ICON_PROPS}>
    <path
      d="M6 1.8v3.4H2.6a.8.8 0 0 0-.8.8V10a.8.8 0 0 0 .8.8h3.4V14.2h.8a.8.8 0 0 0 .8-.8v-3.4h3.4a.8.8 0 0 0 .8-.8V6a.8.8 0 0 0-.8-.8h-3.4V1.8a.8.8 0 0 0-.8-.8H6.8a.8.8 0 0 0-.8.8Z"
      fill="currentColor"
    />
  </svg>
)

const ConditionIcon = () => (
  <svg {...ICON_PROPS}>
    <path
      d="M3.2 2.6h9.6a.8.8 0 0 1 .61 1.31L8.9 8l4.51 4.09a.8.8 0 0 1-.61 1.31H3.2a.8.8 0 0 1-.61-1.31L7.1 8 2.59 3.91A.8.8 0 0 1 3.2 2.6Z"
      fill="currentColor"
    />
  </svg>
)

const CodeIcon = () => (
  <svg {...ICON_PROPS}>
    <path
      d="M5.6 4.4 2.2 8l3.4 3.6 1-1L4.1 8l2.5-2.6-1-1Zm4.8 0-1 1L11.9 8l-2.5 2.6 1 1L13.8 8l-3.4-3.6Z"
      fill="currentColor"
    />
  </svg>
)

const DefaultIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="8" cy="8" r="4.5" fill="currentColor" />
  </svg>
)

/** 单入口单出口的默认锚点。 */
const singleInput = [{ id: 'in', label: '输入', offset: 0.5 }]
const singleOutput = [{ id: 'out', label: '输出', offset: 0.5 }]

/**
 * 6 类内置节点（R3-2，FR-N4）：开始、结束、大模型、插件、条件、代码。
 * 每类各有图标、默认数据、锚点定义与参数 schema。
 *
 * v1.4 起每类还声明了变量作用域（`inputFields` / `outputFields`，R4-4）：
 * 变量选择器与引用解析以此为唯一来源。
 */
export const BUILTIN_NODE_TYPE_DEFINITIONS: NodeTypeDefinition[] = [
  {
    type: 'start',
    label: '开始',
    color: '#3d8a5f',
    icon: <StartIcon />,
    defaultData: { label: 'Start' },
    outputs: singleOutput,
    params: [],
    outputFields: [
      { name: 'query', type: 'string', description: '流程的输入内容' },
      { name: 'variables', type: 'object', description: '流程启动时传入的变量集合' },
    ],
  },
  {
    type: 'end',
    label: '结束',
    color: '#bf6733',
    icon: <EndIcon />,
    defaultData: { label: 'End' },
    inputs: singleInput,
    params: [],
    inputFields: [{ name: 'result', type: 'any', description: '流程的输出结果' }],
  },
  {
    type: 'llm',
    label: '大模型',
    color: '#6b5bd0',
    icon: <LlmIcon />,
    defaultData: { label: 'LLM', prompt: '' },
    inputs: singleInput,
    outputs: singleOutput,
    params: [
      {
        key: 'prompt',
        label: '提示词',
        type: 'string',
        default: '',
        description: '发送给模型的指令内容',
      },
      {
        key: 'model',
        label: '模型',
        type: 'select',
        default: 'gpt-4o-mini',
        options: [
          { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
          { label: 'GPT-4o', value: 'gpt-4o' },
          { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
        ],
      },
      {
        key: 'temperature',
        label: '温度',
        type: 'number',
        default: 0.7,
        description: '0–2 之间，值越高输出越发散',
      },
      {
        key: 'stream',
        label: '流式输出',
        type: 'boolean',
        default: true,
      },
    ],
    inputFields: [{ name: 'text', type: 'string', description: '送入模型的文本' }],
    outputFields: [{ name: 'text', type: 'string', description: '模型生成的文本' }],
  },
  {
    type: 'plugin',
    label: '插件',
    color: '#2f7f8c',
    icon: <PluginIcon />,
    defaultData: { label: 'Plugin', tool: '' },
    inputs: singleInput,
    outputs: singleOutput,
    params: [
      {
        key: 'tool',
        label: '工具标识',
        type: 'string',
        required: true,
        description: '宿主提供的工具名称',
      },
      {
        key: 'timeout',
        label: '超时（毫秒）',
        type: 'number',
        default: 30000,
      },
    ],
    inputFields: [{ name: 'input', type: 'any', description: '传给插件的入参' }],
    outputFields: [{ name: 'result', type: 'any', description: '插件的返回结果' }],
  },
  {
    type: 'condition',
    label: '条件',
    color: '#b04a68',
    icon: <ConditionIcon />,
    defaultData: { label: 'Condition', expression: '' },
    inputs: singleInput,
    // 条件节点有两个具名出口（R3-3），分支标签默认取出口名（R3-4）。
    outputs: [
      { id: 'true', label: '是', offset: 0.3 },
      { id: 'false', label: '否', offset: 0.7 },
    ],
    params: [
      {
        key: 'expression',
        label: '判断条件',
        type: 'string',
        required: true,
        description: '求值为布尔的表达式',
      },
    ],
    inputFields: [{ name: 'value', type: 'any', description: '参与判断的值' }],
    outputFields: [{ name: 'result', type: 'boolean', description: '条件分支的判断结果' }],
  },
  {
    type: 'code',
    label: '代码',
    color: '#6a59ad',
    icon: <CodeIcon />,
    defaultData: { label: 'Code', code: '', language: 'javascript' },
    inputs: singleInput,
    outputs: singleOutput,
    params: [
      {
        key: 'language',
        label: '语言',
        type: 'select',
        default: 'javascript',
        options: [
          { label: 'JavaScript', value: 'javascript' },
          { label: 'Python', value: 'python' },
        ],
      },
      {
        key: 'code',
        label: '代码',
        type: 'string',
        required: true,
        description: '由宿主注入的 Runner 执行，v1 不在浏览器内运行',
      },
      {
        key: 'config',
        label: '配置',
        type: 'json',
        description: 'JSON 格式的节点配置',
      },
    ],
    inputFields: [{ name: 'input', type: 'any', description: '传给代码的入参' }],
    outputFields: [{ name: 'result', type: 'any', description: '代码的返回值' }],
  },
]

/** 未注册类型的通用图标（R3-1 的回落路径）。 */
export { DefaultIcon }
