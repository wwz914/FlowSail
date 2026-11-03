import './App.css'
import { ReactFlow, type Edge, type Node } from 'reactflow';

const initialNodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 320, y: 120 }, data: { label: 'Start' } },
  { id: 'llm', type: 'llm', position: { x: 320, y: 280 }, data: { label: 'LLM' } },
  { id: 'end', type: 'end', position: { x: 320, y: 440 }, data: { label: 'End' } },
];

const initialEdges: Edge[] = [
  { id: 'e-start-llm', source: 'start', target: 'llm' },
];

function App() {
  return (
    <div style={{width: '100vw', height: '100vh'}}>
      <ReactFlow nodes={initialNodes} edges={initialEdges} />
    </div>
  )
}

export default App
