import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署在仓库子路径下（R7-4）；本地默认根路径。
  // 由部署工作流通过 VITE_BASE=/FlowSail/ 注入。
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
