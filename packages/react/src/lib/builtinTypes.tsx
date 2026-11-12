import type { NodeTypeDefinition } from './registry.ts'

/**
 * 节点图标统一为一套 20 × 20 的线性图标：同一描边宽度、圆角端点、无填充，
 * 避免不同类型混用实心 / 线性图标造成视觉语言不统一（0.2.2）。
 */
const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const StartIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="10" cy="10" r="6.6" />
    <path d="M8.5 7.4 12.5 10 8.5 12.6V7.4Z" />
  </svg>
)

const LlmIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M10 3.2l1.9 4.9 4.9 1.9-4.9 1.9L10 16.8 8.1 11.9 3.2 10l4.9-1.9L10 3.2Z" />
  </svg>
)

const EndIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="10" cy="10" r="6.6" />
    <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1" />
  </svg>
)

const PluginIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M7 3.2v3.1M13 3.2v3.1" />
    <path d="M5.4 6.3h9.2v3.1a4.6 4.6 0 0 1-9.2 0V6.3Z" />
    <path d="M10 14v3.2" />
  </svg>
)

const ConditionIcon = () => (
  <svg {...ICON_PROPS}>
    {/* 流程图里的菱形 = 判断 / 分支，比叉形图标更不容易被误读。 */}
    <path d="M10 3.2 16.8 10 10 16.8 3.2 10 10 3.2Z" />
  </svg>
)

const CodeIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="m7.4 6.8-3.2 3.2 3.2 3.2" />
    <path d="m12.6 6.8 3.2 3.2-3.2 3.2" />
    <path d="m11.2 4.4-2.4 11.2" />
  </svg>
)

const DefaultIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="10" cy="10" r="6.2" />
    <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
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
    color: '#16a34a',
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
    color: '#ea580c',
    icon: <EndIcon />,
    defaultData: { label: 'End' },
    inputs: singleInput,
    params: [],
    inputFields: [{ name: 'result', type: 'any', description: '流程的输出结果' }],
  },
  {
    type: 'llm',
    label: '大模型',
    color: '#7c3aed',
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
    color: '#0891b2',
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
    color: '#b45309',
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
    color: '#4f46e5',
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
