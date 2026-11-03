import './App.css';
import {
  ConfigPanel,
  NodePanel,
  NodeTypeProvider,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypeDefinition,
} from 'reactflow';

/** 宿主自定义的节点类型：证明 `nodeTypes` 注入即可渲染自定义节点（R3-1）。 */
const customNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'notify',
    label: '通知',
    color: '#5c7cfa',
    icon: (
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 1.8a4.2 4.2 0 0 0-4.2 4.2v2.4L2.6 11a.6.6 0 0 0 .5.9h9.8a.6.6 0 0 0 .5-.9L12.2 8.4V6A4.2 4.2 0 0 0 8 1.8Zm-1.6 11.4a1.6 1.6 0 0 0 3.2 0H6.4Z"
          fill="currentColor"
        />
      </svg>
    ),
    defaultData: { label: 'Notify' },
    inputs: [{ id: 'in', label: '输入', offset: 0.5 }],
    outputs: [{ id: 'out', label: '输出', offset: 0.5 }],
    params: [
      { key: 'channel', label: '通知渠道', type: 'string', required: true, default: 'email' },
      {
        key: 'urgent',
        label: '加急',
        type: 'boolean',
        default: false,
      },
    ],
  },
];

/**
 * 演示流程：开始 → 大模型 → 条件 →（是）大模型 /（否）结束。
 * 用来演示 R3-8 的三栏布局与"建条件节点 → 连两个分支 → 配参数 → 撤销"。
 */
const initialNodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 320, y: 40 }, data: { label: 'Start' } },
  {
    id: 'llm',
    type: 'llm',
    position: { x: 320, y: 190 },
    data: { label: 'LLM', prompt: '把这封邮件改写成三句话摘要', model: 'gpt-4o-mini', temperature: 0.7, stream: true },
  },
  {
    id: 'condition',
    type: 'condition',
    position: { x: 320, y: 340 },
    data: { label: 'Condition', expression: 'summary.length > 40' },
  },
  {
    id: 'llm-yes',
    type: 'llm',
    position: { x: 120, y: 500 },
    data: { label: 'LLM (是)', prompt: '把摘要翻成英文', model: 'gpt-4o', temperature: 0.3, stream: true },
  },
  { id: 'end', type: 'end', position: { x: 540, y: 500 }, data: { label: 'End' } },
];

const initialEdges: Edge[] = [
  { id: 'e-start-llm', source: 'start', target: 'llm', sourceHandle: 'out', targetHandle: 'in' },
  { id: 'e-llm-condition', source: 'llm', target: 'condition', sourceHandle: 'out', targetHandle: 'in' },
  {
    id: 'e-condition-yes',
    source: 'condition',
    target: 'llm-yes',
    sourceHandle: 'true',
    targetHandle: 'in',
    label: '是',
  },
  {
    id: 'e-condition-no',
    source: 'condition',
    target: 'end',
    sourceHandle: 'false',
    targetHandle: 'in',
    label: '否',
  },
];

function App() {
  return (
    <NodeTypeProvider nodeTypes={customNodeTypes}>
      <div className="app-shell">
        <header className="app-toolbar">
          <span className="app-toolbar__title">FlowSail</span>
          <span className="app-toolbar__hint">
            选中节点可在右侧配置参数；条件节点的两个出口分别连出「是 / 否」分支。
          </span>
        </header>
        <div className="app-body">
          <aside className="app-sidebar">
            <NodePanel variant="inline" />
          </aside>
          <main className="app-canvas">
            <ReactFlow
              nodes={initialNodes}
              edges={initialEdges}
              nodeTypes={customNodeTypes}
              showNodePanel={false}
              showConfigPanel={false}
            />
          </main>
          <aside className="app-inspector">
            <ConfigPanel variant="inline" />
          </aside>
        </div>
      </div>
    </NodeTypeProvider>
  );
}

export default App;
