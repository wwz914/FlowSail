// R7-1 / R7-5：发布包安装冒烟。
// 1. 打包 @flowsail/core 与 @flowsail/react 的 tarball；
// 2. 在仓库之外的干净目录里安装 tarball + 指定 React 大版本；
// 3. 用 README 的最小嵌入路径做类型检查、Vite 构建与 SSR 渲染，
//    验证 exports / types / CSS / 自定义节点 / 受控模式 / Runner 注入都能从发布产物工作。
//
// 用法：node scripts/smoke-pack.mjs [--react 18|19] [--keep]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const reactMajor = (() => {
  const index = process.argv.indexOf('--react')
  const value = index === -1 ? '19' : process.argv[index + 1]
  if (value !== '18' && value !== '19') {
    console.error(`--react 只支持 18 或 19，收到：${value}`)
    process.exit(1)
  }
  return value
})()
const keep = process.argv.includes('--keep')

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'flowsail-pack-'))
const packDir = join(tempRoot, 'packs')
const appDir = join(tempRoot, 'app')
mkdirSync(packDir, { recursive: true })
mkdirSync(appDir, { recursive: true })

try {
  console.log(`\n[1/6] 构建库产物（React ${reactMajor} 冒烟）`)
  run('pnpm', ['build:libs'], root)

  console.log('[2/6] 打包 tarball')
  run('pnpm', ['--filter', '@flowsail/core', 'pack', '--pack-destination', packDir], root)
  run('pnpm', ['--filter', '@flowsail/react', 'pack', '--pack-destination', packDir], root)

  const packFiles = readdirSync(packDir)
  const coreTarball = join(packDir, packFiles.find((file) => file.startsWith('flowsail-core-') && file.endsWith('.tgz')))
  const reactTarball = join(packDir, packFiles.find((file) => file.startsWith('flowsail-react-') && file.endsWith('.tgz')))
  assert(existsSync(coreTarball), '未找到 @flowsail/core tarball')
  assert(existsSync(reactTarball), '未找到 @flowsail/react tarball')

  console.log('[3/6] 校验 tarball 内容与发布元数据')
  const coreEntries = capture('tar', ['-tzf', coreTarball], root).split('\n')
  const reactEntries = capture('tar', ['-tzf', reactTarball], root).split('\n')
  for (const entry of [
    'package/package.json',
    'package/LICENSE',
    'package/README.md',
    'package/dist/index.js',
    'package/dist/index.d.ts',
  ]) {
    assert(coreEntries.includes(entry), `@flowsail/core tarball 缺少 ${entry}`)
    assert(reactEntries.includes(entry), `@flowsail/react tarball 缺少 ${entry}`)
  }
  assert(reactEntries.includes('package/dist/style.css'), '@flowsail/react tarball 缺少 dist/style.css')
  assert(
    coreEntries.every((entry) => !entry.startsWith('package/src/')) &&
      reactEntries.every((entry) => !entry.startsWith('package/src/')),
    'tarball 不应包含 TS 源码',
  )

  const reactManifest = JSON.parse(capture('tar', ['-xOf', reactTarball, 'package/package.json'], root))
  assert(reactManifest.name === '@flowsail/react', '包名不是 @flowsail/react')
  assert(!String(reactManifest.dependencies?.['@flowsail/core'] ?? '').includes('workspace:'), '发布清单仍含 workspace 协议')
  assert(reactManifest.peerDependencies?.react === '>=18 <20', 'React peer 范围不是 >=18 <20')
  assert(reactManifest.exports?.['.']?.types === './dist/index.d.ts', 'exports.types 未指向 dist')
  assert(reactManifest.exports?.['./style.css'] === './dist/style.css', '未导出 style.css')

  const reactDependency = reactMajor === '18' ? '18' : '19'
  const reactVersion = reactMajor === '18' ? '^18.3.1' : '^19.2.1'
  const typesVersion = reactMajor === '18' ? '^18.3.0' : '^19.2.7'

  console.log(`[4/6] 在干净目录安装发布产物（React ${reactDependency}）`)
  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'flowsail-pack-smoke',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.23.0',
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'vite build',
        },
        dependencies: {
          '@flowsail/core': `file:${coreTarball}`,
          '@flowsail/react': `file:${reactTarball}`,
          react: reactVersion,
          'react-dom': reactVersion,
        },
        devDependencies: {
          '@types/react': typesVersion,
          '@types/react-dom': typesVersion,
          '@vitejs/plugin-react': '^5.1.1',
          jsdom: '^30.1.3',
          typescript: '^5.9.3',
          vite: '^7.2.4',
        },
      },
      null,
      2,
    )}\n`,
  )

  // pnpm 10 起 overrides 写在 pnpm-workspace.yaml（不再读 package.json 的 pnpm 字段）。
  // tarball 里的 @flowsail/core 指向尚未发布的 registry 版本，冒烟环境指回本地 tarball；
  // 真实发布后由 registry 解析。
  writeFileSync(
    join(appDir, 'pnpm-workspace.yaml'),
    `packages:
  - '.'
onlyBuiltDependencies:
  - esbuild
allowBuilds:
  esbuild: true
overrides:
  '@flowsail/core': 'file:${coreTarball}'
`,
  )

  writeFileSync(
    join(appDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          types: ['vite/client'],
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    join(appDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()] })
`,
  )

  writeFileSync(
    join(appDir, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>FlowSail pack smoke</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  )

  mkdirSync(join(appDir, 'src'), { recursive: true })
  writeFileSync(
    join(appDir, 'src', 'App.tsx'),
    `import { useState } from 'react'
import {
  ConfigPanel,
  NodePanel,
  NodeTypeProvider,
  ReactFlow,
  Toolbar,
  createWorkflow,
  setRunner,
  type Edge,
  type Node,
  type NodeRunOutput,
  type NodeTypeDefinition,
  type Runner,
  type Workflow,
} from '@flowsail/react'

const customTypes: NodeTypeDefinition[] = [
  {
    type: 'notify',
    label: '通知',
    color: '#5c7cfa',
    icon: <span aria-hidden>N</span>,
    defaultData: { label: '通知' },
    inputs: [{ id: 'in', label: '输入', offset: 0.5 }],
    outputs: [{ id: 'out', label: '输出', offset: 0.5 }],
    params: [{ key: 'channel', label: '渠道', type: 'string', default: 'email' }],
  },
]

const runner: Runner = {
  async run(workflow, hooks) {
    hooks.onRunStart?.(workflow)
    const outputs: Record<string, NodeRunOutput> = {}
    for (const node of workflow.nodes) {
      const output = { nodeId: node.id, fields: {} }
      outputs[node.id] = output
      hooks.onNodeEnd?.(node, output)
    }
    const result = { ok: true, cancelled: false, errors: {}, outputs, duration: 0 }
    hooks.onRunEnd?.(result)
    return result
  },
}
setRunner(runner)

const base = createWorkflow({ id: 'smoke', name: 'Pack smoke' })
const nodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 80, y: 40 }, data: { label: 'Start' } },
  {
    id: 'notify',
    type: 'notify',
    position: { x: 80, y: 180 },
    data: { label: 'Notify', channel: 'email' },
  },
]
const edges: Edge[] = [
  { id: 'e1', source: 'start', target: 'notify', sourceHandle: 'out', targetHandle: 'in' },
]

export default function App() {
  const [workflow, setWorkflow] = useState<Workflow>({ ...base, nodes, edges })
  return (
    <NodeTypeProvider nodeTypes={customTypes}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
        <Toolbar title="FlowSail" />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <NodePanel variant="inline" />
          <ReactFlow
            workflow={workflow}
            onChange={setWorkflow}
            nodeTypes={customTypes}
            showNodePanel={false}
            showConfigPanel={false}
            showRunPanel={false}
          />
          <ConfigPanel variant="inline" />
        </div>
      </div>
    </NodeTypeProvider>
  )
}
`,
  )

  // 把 README 的最小嵌入示例也放进干净工程做类型检查，
  // 防止文档代码与发布产物的 API 漂移（R7-3）。
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const readmeSection = readme.split('## 嵌入一个受控画布')[1] ?? ''
  const readmeExample = /```tsx\n([\s\S]*?)```/.exec(readmeSection)?.[1]
  assert(Boolean(readmeExample), 'README 缺少受控画布示例代码块')
  writeFileSync(join(appDir, 'src', 'readme-example.tsx'), readmeExample)

  writeFileSync(
    join(appDir, 'src', 'main.tsx'),
    `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@flowsail/react/style.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  )

  // 画布在 useEffect 里把 props 同步进 store，SSR 不会执行 effect，
  // 因此基础渲染用 jsdom + createRoot 在客户端渲染，断言节点真的出现。
  writeFileSync(
    join(appDir, 'render-check.mjs'),
    `import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  })
}

const { createElement, StrictMode } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: App } = await import('./dist-ssr/App.js')

const container = document.getElementById('root')
const root = createRoot(container)
root.render(createElement(StrictMode, null, createElement(App)))
await new Promise((resolve) => setTimeout(resolve, 100))

const html = document.body.innerHTML
if (!html.includes('data-node-id="start"') || !html.includes('data-node-id="notify"')) {
  throw new Error('客户端渲染缺少画布节点，基础渲染失败')
}
console.log('PASS 客户端渲染 ' + html.length + ' 字符')
root.unmount()
`,
  )

  run('pnpm', ['install', '--prefer-offline'], appDir)
  run('pnpm', ['exec', 'tsc', '--noEmit'], appDir)
  console.log('PASS 类型检查（从发布产物解析 @flowsail/react 与 @flowsail/core）')
  run('pnpm', ['exec', 'vite', 'build'], appDir)
  console.log('PASS Vite 构建（含 @flowsail/react/style.css）')

  console.log('[5/6] jsdom 客户端基础渲染')
  run('pnpm', ['exec', 'vite', 'build', '--ssr', 'src/App.tsx', '--outDir', 'dist-ssr'], appDir)
  run('node', [join(appDir, 'render-check.mjs')], appDir)

  console.log(`[6/6] PASS 发布包冒烟（React ${reactMajor}，${basename(coreTarball)} / ${basename(reactTarball)}）`)
} finally {
  if (!keep) {
    rmSync(tempRoot, { recursive: true, force: true })
  } else {
    console.log(`保留临时目录：${tempRoot}`)
  }
}
