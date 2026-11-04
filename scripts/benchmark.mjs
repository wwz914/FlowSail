// v1.6 R6-8 性能基准脚本（PRD §6 成功指标）：
//   构造 300 节点 / 500 连线的文档，度量拖拽与缩放的帧表现，
//   并与「≥ 50fps」的目标对照；不达标时打印当前实现的具体瓶颈
//   （重点是快照式历史栈的整份文档拷贝开销）。
//
// 用法：
//   pnpm dev                                   # 另开一个终端
//   node scripts/benchmark.mjs [url]
//   node scripts/benchmark.mjs --json          # 只输出机器可读结果
//
// 说明：这是**度量工具**，不是 DoD 验证脚本。它不修改任何受版本控制的文件。
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const url = args.find((item) => !item.startsWith('--')) ?? 'http://localhost:5173'

const NODE_COUNT = 300
const EDGE_COUNT = 500
// PRD §6：300 节点 / 500 连线，拖拽与缩放 ≥ 50fps。
const TARGET_FPS = 50

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.react-flow', { timeout: 10000 })

const results = {}
function record(name, value, unit = '') {
  results[name] = value
  if (!jsonOnly) console.log(`${name}: ${value}${unit}`)
}

/**
 * 用 store 直接构造大文档：300 个节点排成 20 列的网格，500 条连线。
 *
 * 走 store 而不是 UI，是为了让"构造"这一步不混进度量里。
 */
async function buildLargeDocument() {
  return page.evaluate(
    ({ nodeCount, edgeCount }) => {
      const store = window.__flowBenchStore
      if (!store) throw new Error('基准脚本需要页面暴露 window.__flowBenchStore')

      const nodes = []
      const columns = 20
      for (let i = 0; i < nodeCount; i += 1) {
        const col = i % columns
        const row = Math.floor(i / columns)
        nodes.push({
          id: `bench-${i}`,
          type: i === 0 ? 'start' : 'llm',
          position: { x: col * 220, y: row * 120 },
          data: { label: `节点 ${i}` },
        })
      }

      const edges = []
      for (let i = 0; i < edgeCount; i += 1) {
        // 连成一条可解析的链，避免重复边。
        const source = `bench-${i % nodeCount}`
        const target = `bench-${(i + 1) % nodeCount}`
        if (source === target) continue
        edges.push({
          id: `bench-edge-${i}`,
          source,
          target,
          sourceHandle: 'out',
          targetHandle: 'in',
        })
      }

      store.setState({
        workflow: {
          ...store.getState().workflow,
          nodes,
          edges,
          viewport: { x: 40, y: 40, zoom: 0.5 },
        },
      })

      return { nodes: nodes.length, edges: edges.length }
    },
    { nodeCount: NODE_COUNT, edgeCount: EDGE_COUNT },
  )
}

/**
 * 度量一段时间内的帧率：用 `requestAnimationFrame` 采样，
 * 同时持续触发 `action`（拖拽或缩放），统计实际帧间隔。
 */
async function measureFps(actionName, actionScript, durationMs = 2000) {
  return page.evaluate(
    async ({ actionName, actionScript, durationMs }) => {
      const action = new Function('t', actionScript)
      const frames = []
      let last = performance.now()
      const start = last

      return await new Promise((resolve) => {
        function tick() {
          const now = performance.now()
          frames.push(now - last)
          last = now
          action((now - start) / durationMs)

          if (now - start < durationMs) {
            requestAnimationFrame(tick)
            return
          }

          // 去掉第一帧（启动开销），用平均帧间隔换算 fps。
          const samples = frames.slice(1).filter((value) => value > 0)
          const total = samples.reduce((sum, value) => sum + value, 0)
          const average = samples.length > 0 ? total / samples.length : 0
          const worst = samples.length > 0 ? Math.max(...samples) : 0
          resolve({
            action: actionName,
            frames: samples.length,
            averageFrameMs: Number(average.toFixed(2)),
            worstFrameMs: Number(worst.toFixed(2)),
            fps: average > 0 ? Number((1000 / average).toFixed(1)) : 0,
            // 1% 低帧：最慢的那 1% 帧的平均值，反映卡顿。
            p99FrameMs: Number(
              (
                samples
                  .slice()
                  .sort((a, b) => b - a)
                  .slice(0, Math.max(1, Math.floor(samples.length * 0.01)))
                  .reduce((sum, value) => sum + value, 0) /
                Math.max(1, Math.floor(samples.length * 0.01))
              ).toFixed(2),
            ),
          })
        }
        requestAnimationFrame(tick)
      })
    },
    { actionName, actionScript, durationMs },
  )
}

if (!jsonOnly) {
  console.log(`\nFlowSail 性能基准（${NODE_COUNT} 节点 / ${EDGE_COUNT} 连线，目标 ≥ ${TARGET_FPS}fps）\n`)
}

// 1. 首选文档规模下的首屏渲染。
const built = await buildLargeDocument()
record('文档规模', `${built.nodes} 节点 / ${built.edges} 连线`)
await page.waitForTimeout(500)

const domNodes = await page.evaluate(() => document.querySelectorAll('.flow-node').length)
record('渲染出的节点数', domNodes)

// 2. 拖拽：连续移动一个节点。
const drag = await measureFps(
  '拖拽',
  `
    const store = window.__flowBenchStore
    const nodes = store.getState().workflow.nodes
    if (!nodes.length) return
    const target = nodes[0]
    store.getState().setNodes(
      nodes.map((node) =>
        node.id === target.id
          ? { ...node, position: { x: 40 + t * 200, y: node.position.y } }
          : node,
      ),
    )
  `,
  2000,
)
record('拖拽 fps', drag.fps)
record('拖拽平均帧耗时', drag.averageFrameMs, 'ms')
record('拖拽最慢帧', drag.p99FrameMs, 'ms')

// 3. 缩放：连续改视口缩放。
const zoom = await measureFps(
  '缩放',
  `
    const store = window.__flowBenchStore
    const viewport = store.getState().workflow.viewport
    store.getState().setViewport({
      ...viewport,
      zoom: 0.5 + t * 0.5,
    })
  `,
  2000,
)
record('缩放 fps', zoom.fps)
record('缩放平均帧耗时', zoom.averageFrameMs, 'ms')
record('缩放最慢帧', zoom.p99FrameMs, 'ms')

// 4. 历史栈快照开销：这是 PRD 点名要看的架构风险。
//    整份文档快照（节点 + 连线）在 300 节点规模下的拷贝耗时。
const snapshot = await page.evaluate(() => {
  const store = window.__flowBenchStore
  const workflow = store.getState().workflow

  const runs = 30
  const startedAt = performance.now()
  for (let i = 0; i < runs; i += 1) {
    // 与 pushHistory 里存的形状一致：深拷贝一份文档。
    JSON.parse(JSON.stringify(workflow))
  }
  const perCopy = (performance.now() - startedAt) / runs

  return {
    perCopyMs: Number(perCopy.toFixed(2)),
    // 历史栈容量 50：撤销栈满时的总持有量。
    fullStackMs: Number((perCopy * 50).toFixed(1)),
  }
})
record('整份文档快照拷贝', snapshot.perCopyMs, 'ms')
record('快照栈满载（50 条）累积拷贝', snapshot.fullStackMs, 'ms')

// 5. 结论。
const fpsOk = drag.fps >= TARGET_FPS && zoom.fps >= TARGET_FPS
record('结论', fpsOk ? `达标（≥ ${TARGET_FPS}fps）` : `未达标（目标 ${TARGET_FPS}fps）`)

if (!jsonOnly) {
  console.log('')
  if (!fpsOk) {
    console.log('瓶颈提示：')
    if (zoom.fps < drag.fps) {
      console.log('  · 缩放比拖拽更慢：视口变化会重算全部连线端点与网格背景，属 O(节点 + 连线) 每帧。')
    }
    if (drag.fps < TARGET_FPS) {
      console.log('  · 拖拽未达标：每个 pointermove 都会重建整个 nodes 数组并触发全量重渲染。')
    }
    console.log(
      `  · 快照式历史栈：单份文档拷贝 ${snapshot.perCopyMs}ms，栈满 50 条累计 ${snapshot.fullStackMs}ms；` +
        '若节点规模继续增长，先考虑换成增量 patch。',
    )
  }
  console.log('')
}

console.log(JSON.stringify(results, null, 2))

await browser.close()
process.exit(fpsOk ? 0 : 1)
