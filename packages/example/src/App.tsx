import './App.css';
import { useState } from 'react';
import {
  ConfigPanel,
  NodePanel,
  NodeTypeProvider,
  ReactFlow,
  Toolbar,
  ValidationPanel,
  createWorkflow,
  type Edge,
  type Node,
  type NodeTypeDefinition,
  type Workflow,
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
    // 宿主自定义类型同样可声明变量作用域（R4-4）。
    outputFields: [{ name: 'sent', type: 'boolean', description: '是否已发出通知' }],
  },
];

/**
 * 演示流程：开始 → 大模型 → 条件 →（是）大模型 /（否）结束。
 *
 * v1.4 的演示链路（R4-9）：
 * 引用上游变量（`{{start.query}}`）→ 校验通过 → 导出 JSON → 清空 → 导入还原。
 */
const initialNodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 320, y: 40 }, data: { label: 'Start' } },
  {
    id: 'llm',
    type: 'llm',
    position: { x: 320, y: 190 },
    data: {
      label: 'LLM',
      prompt: '把这封邮件改写成三句话摘要：{{start.query}}',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      stream: true,
    },
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
    data: {
      label: 'LLM (是)',
      prompt: '把摘要翻成英文：{{llm.text}}',
      model: 'gpt-4o',
      temperature: 0.3,
      stream: true,
    },
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

/**
 * 构造初始文档（R4-1）。
 * 文档带 `id` / `name` / `version` / `meta`，可直接导出成 JSON。
 */
function createInitialDocument(): Workflow {
  const base = createWorkflow({ id: 'demo-flow', name: '邮件摘要流程' });
  return {
    ...base,
    nodes: initialNodes,
    edges: initialEdges,
  };
}

function App() {
  // 受控模式（R4-2）：宿主持有文档，内部编辑通过 onChange 写回。
  const [document, setDocument] = useState<Workflow>(() => createInitialDocument());

  return (
    <NodeTypeProvider nodeTypes={customNodeTypes}>
      <div className="app-shell">
        <Toolbar title="FlowSail" />
        <div className="app-body">
          <aside className="app-sidebar">
            <NodePanel variant="inline" />
          </aside>
          <main className="app-canvas">
            <ReactFlow
              workflow={document}
              onChange={setDocument}
              nodeTypes={customNodeTypes}
              showNodePanel={false}
              showConfigPanel={false}
            />
            <ValidationPanel variant="inline" />
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
