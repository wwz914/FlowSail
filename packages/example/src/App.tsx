import { useState } from 'react'
import './App.css'
import { ReactFlow } from 'reactflow';

function App() {
  const nodes = [
    { id: '1', position: { x: 100, y: 100 }, data: { label: '节点 1' } },
    { id: '2', position: { x: 400, y: 100 }, data: { label: '节点 2' } },
  ];
  const edges = [
    { id: 'e1-2', source: '1', target: '2', label: '连接线' },
  ];
  return (
    <>
      <div style={{width: '100vw', height: '100vh'}}>
        <ReactFlow nodes={nodes} edges={edges} />
      </div>
    </>
  )
}

export default App
