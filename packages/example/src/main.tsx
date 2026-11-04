import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// 库样式放在宿主样式之后，保持与 v1.6（库源码随组件引入）一致的层叠顺序。
import '@flowsail/react/style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
