import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { canRedo, canUndo, fitViewToNodes, redoStep, replaceDocument, undoStep } from '../lib/actions.ts'
import { downloadWorkflow, importWorkflow, readFileText } from '../lib/serialization.ts'
import { cancelRun, canStartRun, startRun } from '../lib/runController.ts'
import { useRunStore } from '../lib/runStore.ts'
import {
  buildRunVariables,
  validateSessionVariables,
  type SessionVariable,
} from '../lib/sessionVariables.ts'
import { SessionVariablePanel } from './SessionVariablePanel.tsx'


/** 工具栏线性图标：统一的 16 栅格与 1.5px 描边。 */
const ToolbarIcon = ({ children }: { children: ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {children}
  </svg>
)

const UndoIcon = () => (
  <ToolbarIcon>
    <path d="M3.2 7.2h6c2.1 0 3.8 1.5 3.8 3.4S11.3 14 9.2 14H6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M5.8 4.6 3 7.2l2.8 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </ToolbarIcon>
)

const RedoIcon = () => (
  <ToolbarIcon>
    <path d="M12.8 7.2h-6c-2.1 0-3.8 1.5-3.8 3.4S4.7 14 6.8 14h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M10.2 4.6 13 7.2l-2.8 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </ToolbarIcon>
)

const FitIcon = () => (
  <ToolbarIcon>
    <path d="M2.6 6V3.2a.6.6 0 0 1 .6-.6H6M10 2.6h2.8a.6.6 0 0 1 .6.6V6M13.4 10v2.8a.6.6 0 0 1-.6.6H10M6 13.4H3.2a.6.6 0 0 1-.6-.6V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </ToolbarIcon>
)

const BracesIcon = () => (
  <ToolbarIcon>
    <path d="M6.2 2.8c-1.6 0-1.9.7-1.9 2.2v.9c0 .9-.4 1.4-1.2 1.4.8 0 1.2.5 1.2 1.4v.9c0 1.5.3 2.2 1.9 2.2M9.8 2.8c1.6 0 1.9.7 1.9 2.2v.9c0 .9.4 1.4 1.2 1.4-.8 0-1.2.5-1.2 1.4v.9c0 1.5-.3 2.2-1.9 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </ToolbarIcon>
)

const PlayIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.6 2.9v10.2L13 8 4.6 2.9Z" fill="currentColor" />
  </svg>
)

const StopIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="1.4" fill="currentColor" />
  </svg>
)

const ExportIcon = () => (
  <ToolbarIcon>
    <path d="M8 10.6V2.6m0 0L5 5.6m3-3 3 3M3 10.4v2c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </ToolbarIcon>
)

const ImportIcon = () => (
  <ToolbarIcon>
    <path d="M8 2.6v8m0 0 3-3m-3 3-3-3M3 10.4v2c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </ToolbarIcon>
)

export interface ToolbarProps {
  /** 工具栏标题。 */
  title?: string
  className?: string
  /** 宿主自定义操作（如主题切换），渲染在工具栏右侧。 */
  children?: ReactNode
}

/**
 * 顶部工具栏（R4-9、FR-U2）。
 *
 * 提供撤销 / 重做 / 适应画布 / 导出 / 导入，
 * 以及 v1.5 起的试运行 / 取消运行（R5-9）。
 */
export const Toolbar = ({ title = 'FlowSail', className, children }: ToolbarProps) => {
  const registry = useNodeTypeRegistry()
  const workflow = useFlowStore((state) => state.workflow)
  const pastCount = useFlowStore((state) => state.past.length)
  const futureCount = useFlowStore((state) => state.future.length)
  const nodeCount = useFlowStore((state) => state.workflow.nodes.length)
  const runStatus = useRunStore((state) => state.status)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // 会话变量（R6-7）：运行期上下文，不进文档。
  const [variables, setVariables] = useState<SessionVariable[]>([])
  const [isVarPanelOpen, setIsVarPanelOpen] = useState(false)

  const classNames = ['flow-toolbar', className].filter(Boolean).join(' ')

  const isRunning = runStatus === 'running'
  const runDisabled = !canStartRun()

  const handleRun = async () => {
    setMessage(null)

    // 变量有问题时先提示，不发起运行（R6-7）。
    const issues = validateSessionVariables(variables)
    if (issues.length > 0) {
      setMessage(issues[0]?.message ?? '会话变量不合法')
      setIsVarPanelOpen(true)
      return
    }

    const result = await startRun({ variables: buildRunVariables(variables) })
    if (result.cancelled) {
      setMessage('已取消运行')
      return
    }
    if (!result.ok) {
      const first = Object.values(result.errors)[0]
      setMessage(first ? `运行失败：${first.message}` : '运行失败')
      return
    }
    setMessage(`运行完成（${result.duration}ms）`)
  }

  const handleCancel = () => {
    if (!cancelRun()) return
    setMessage('已取消运行')
  }

  const handleExport = () => {
    const outcome = downloadWorkflow(workflow)
    if (outcome.ok) {
      setMessage(`已导出 ${outcome.fileName}`)
      return
    }
    setMessage(outcome.errors[0] ?? '导出失败')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 允许连续导入同一个文件。
    event.target.value = ''
    if (!file) return

    const read = await readFileText(file)
    if (!read.ok || read.text === undefined) {
      setMessage(read.errors[0] ?? '读取文件失败')
      return
    }

    const outcome = importWorkflow(read.text, registry)
    if (!outcome.ok || !outcome.document) {
      setMessage(`导入失败：${outcome.errors[0] ?? '文档格式不正确'}`)
      return
    }

    replaceDocument(outcome.document)
    setMessage('导入成功，画布已还原')
  }

  return (
    <div className="flow-toolbar-wrap">
      <div className={classNames} role="toolbar" aria-label="工具栏">
        <span className="flow-toolbar__brand">
          <span className="flow-toolbar__logo" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.6 4.6h5.6c1.7 0 2.7.8 2.7 2.1s-1 2.1-2.7 2.1H5.1c-1.3 0-2 .5-2 1.4s.7 1.4 2 1.4h6.3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="flow-toolbar__title">{title}</span>
        </span>

        <div className="flow-toolbar__group">
          <button
            type="button"
            className="flow-toolbar__button flow-toolbar__button--icon"
            onClick={undoStep}
            disabled={pastCount === 0 || !canUndo() || isRunning}
            title="撤销（Ctrl/Cmd+Z）"
            aria-label="撤销"
          >
            <UndoIcon />
            <span className="flow-visually-hidden">撤销</span>
          </button>
          <button
            type="button"
            className="flow-toolbar__button flow-toolbar__button--icon"
            onClick={redoStep}
            disabled={futureCount === 0 || !canRedo() || isRunning}
            title="重做（Ctrl/Cmd+Shift+Z）"
            aria-label="重做"
          >
            <RedoIcon />
            <span className="flow-visually-hidden">重做</span>
          </button>
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={fitViewToNodes}
            disabled={nodeCount === 0}
            title="适应画布"
          >
            <FitIcon />
            适应画布
          </button>
        </div>

        <div className="flow-toolbar__group">
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={() => setIsVarPanelOpen((current) => !current)}
            aria-expanded={isVarPanelOpen}
            title="会话变量：试运行前填写的流程级输入"
          >
            <BracesIcon />
            会话变量{variables.length > 0 ? `（${variables.length}）` : ''}
          </button>
          {isRunning ? (
            <button
              type="button"
              className="flow-toolbar__button flow-toolbar__button--danger"
              onClick={handleCancel}
              title="取消运行"
            >
              <StopIcon />
              取消运行
            </button>
          ) : (
            <button
              type="button"
              className="flow-toolbar__button flow-toolbar__button--primary"
              onClick={handleRun}
              disabled={runDisabled}
              title="试运行：从开始节点跑到结束节点"
            >
              <PlayIcon />
              试运行
            </button>
          )}
        </div>

        <div className="flow-toolbar__group flow-toolbar__group--file">
          <button type="button" className="flow-toolbar__button" onClick={handleExport}>
            <ExportIcon />
            导出
          </button>
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={handleImportClick}
            disabled={isRunning}
            title={isRunning ? '运行中不能导入文档' : '导入 JSON 文档'}
          >
            <ImportIcon />
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="flow-toolbar__file"
            onChange={handleFileChange}
            aria-label="导入文档"
          />
        </div>

        {children ? (
          <div className="flow-toolbar__group flow-toolbar__group--end">{children}</div>
        ) : null}

        {message ? <span className="flow-toolbar__message">{message}</span> : null}
      </div>

      <SessionVariablePanel
        open={isVarPanelOpen}
        variables={variables}
        onChange={setVariables}
      />
    </div>
  )
}