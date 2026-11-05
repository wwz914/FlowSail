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
        <span className="flow-toolbar__title">{title}</span>

        <div className="flow-toolbar__group">
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={undoStep}
            disabled={pastCount === 0 || !canUndo() || isRunning}
            title="撤销（Ctrl/Cmd+Z）"
          >
            撤销
          </button>
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={redoStep}
            disabled={futureCount === 0 || !canRedo() || isRunning}
            title="重做（Ctrl/Cmd+Shift+Z）"
          >
            重做
          </button>
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={fitViewToNodes}
            disabled={nodeCount === 0}
            title="适应画布"
          >
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
            会话变量{variables.length > 0 ? `（${variables.length}）` : ''}
          </button>
          {isRunning ? (
            <button
              type="button"
              className="flow-toolbar__button flow-toolbar__button--danger"
              onClick={handleCancel}
              title="取消运行"
            >
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
              试运行
            </button>
          )}
        </div>

        <div className="flow-toolbar__group">
          <button type="button" className="flow-toolbar__button" onClick={handleExport}>
            导出
          </button>
          <button
            type="button"
            className="flow-toolbar__button"
            onClick={handleImportClick}
            disabled={isRunning}
            title={isRunning ? '运行中不能导入文档' : '导入 JSON 文档'}
          >
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

        {children ? <div className="flow-toolbar__group">{children}</div> : null}

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