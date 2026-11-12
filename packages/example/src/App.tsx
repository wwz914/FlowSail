import './App.css';
import { useEffect, useState } from 'react';
import {
  ConfigPanel,
  NodePanel,
  NodeTypeProvider,
  ReactFlow,
  RunPanel,
  Toolbar,
  ValidationPanel,
  createWorkflow,
  setDefaultNodeDelay,
  useFlowStore,
  type Edge,
  type Node,
  type NodeTypeDefinition,
  type Workflow,
} from '@flowsail/react';

/** 宿主自定义的节点类型：证明 `nodeTypes` 注入即可渲染自定义节点（R3-1）。 */
const customNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'notify',
    label: '通知',
    color: '#2563eb',
    icon: (
      <svg
        width={18}
        height={18}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.2 8.2a3.8 3.8 0 0 1 7.6 0v2.3l1.2 2.2H5l1.2-2.2V8.2Z" />
        <path d="M8.4 15a1.7 1.7 0 0 0 3.2 0" />
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
 * v1.5 的演示链路（R5-9）：
 * 试运行 → 大模型节点拿到开始节点的实际输出（`{{start.query}}` 被替换成运行期真实值）
 * → 条件节点走「否」分支，未走到的分支节点标记为 `skipped`
 * → 运行记录面板逐节点列出状态与耗时 → 改坏参数重跑，失败节点在画布与记录面板同时标红。
 */
const initialNodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 320, y: 80 }, data: { label: 'Start' } },
  {
    id: 'llm',
    type: 'llm',
    position: { x: 320, y: 196 },
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
    position: { x: 320, y: 312 },
    data: { label: 'Condition', expression: 'text.length > 40' },
  },
  {
    id: 'llm-yes',
    type: 'llm',
    position: { x: 220, y: 432 },
    data: {
      label: 'LLM (是)',
      prompt: '把摘要翻成英文：{{llm.text}}',
      model: 'gpt-4o',
      temperature: 0.3,
      stream: true,
    },
  },
  { id: 'end', type: 'end', position: { x: 440, y: 432 }, data: { label: 'End' } },
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
  const [document, setDocument] = useState<Workflow>(() => createInitialDocument())
  // 主题（R8-2、Q33）：宿主自己保存亮 / 暗选择，画布用 `theme` prop，
  // 面板等在 ReactFlow 之外的部分通过 <html data-theme> 继承同一套变量。
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    window.document.documentElement.dataset.theme = theme
  }, [theme]);

  // 单节点执行延迟（R5-2）：留一点延迟才看得清节点依次进入「运行中」。
  useEffect(() => {
    setDefaultNodeDelay(220);
    return () => setDefaultNodeDelay(0);
  }, []);

  // 性能基准脚本要用 store 直接构造大文档（R6-8）：只在开发环境暴露，
  // 不进入生产构建，也不属于库的公开 API。
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const target = window as unknown as Record<string, unknown>;
    target.__flowBenchStore = useFlowStore;
    return () => {
      delete target.__flowBenchStore;
    };
  }, []);

  return (
    <NodeTypeProvider nodeTypes={customNodeTypes}>
      <div className="app-shell">
        <Toolbar title="FlowSail">
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            aria-pressed={theme === 'dark'}
            title="切换亮色 / 暗色主题"
          >
            {theme === 'light' ? '暗色主题' : '亮色主题'}
          </button>
        </Toolbar>
        <p className="app-hint">
          <span className="app-hint__badge">提示</span>
          <span>
            拖拽框选 · Ctrl/Cmd+A 全选 · 双击节点重命名 · 从输入锚点反向拖拽改接 ·
            Tab 进入画布后方向键移动
          </span>
        </p>
        <div className="app-body">
          <aside className="app-sidebar">
            <NodePanel variant="inline" />
          </aside>
          <main className="app-canvas">
            <ReactFlow
              workflow={document}
              onChange={setDocument}
              nodeTypes={customNodeTypes}
              theme={theme}
              showNodePanel={false}
              showConfigPanel={false}
              showRunPanel={false}
            />
            <ValidationPanel variant="inline" />
            <RunPanel variant="inline" />
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
