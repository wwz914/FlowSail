import { useRef, useState } from 'react'
import { useFlowStore } from '../store/index.ts'
import { useNodeTypeRegistry } from '../lib/registryContext.tsx'
import { canRedo, canUndo, fitViewToNodes, redoStep, replaceDocument, undoStep } from '../lib/actions.ts'
import { downloadWorkflow, importWorkflow, readFileText } from '../lib/serialization.ts'

export interface ToolbarProps {
  /** 工具栏标题。 */
  title?: string
  className?: string
}

/**
 * 顶部工具栏（R4-9、FR-U2）。
 *
 * 提供撤销 / 重做 / 适应画布 / 导出 / 导入。
 * 试运行按钮随 M3 落地，本版不提供（ROADMAP §9.4）。
 */
export const Toolbar = ({ title = 'FlowSail', className }: ToolbarProps) => {
  const registry = useNodeTypeRegistry()
  const workflow = useFlowStore((state) => state.workflow)
  const pastCount = useFlowStore((state) => state.past.length)
  const futureCount = useFlowStore((state) => state.future.length)
  const nodeCount = useFlowStore((state) => state.workflow.nodes.length)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const classNames = ['flow-toolbar', className].filter(Boolean).join(' ')

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
    <div className={classNames} role="toolbar" aria-label="工具栏">
      <span className="flow-toolbar__title">{title}</span>

      <div className="flow-toolbar__group">
        <button
          type="button"
          className="flow-toolbar__button"
          onClick={undoStep}
          disabled={pastCount === 0 || !canUndo()}
          title="撤销（Ctrl/Cmd+Z）"
        >
          撤销
        </button>
        <button
          type="button"
          className="flow-toolbar__button"
          onClick={redoStep}
          disabled={futureCount === 0 || !canRedo()}
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
        <button type="button" className="flow-toolbar__button" onClick={handleExport}>
          导出
        </button>
        <button type="button" className="flow-toolbar__button" onClick={handleImportClick}>
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

      {message ? <span className="flow-toolbar__message">{message}</span> : null}
    </div>
  )
}
