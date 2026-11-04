/**
 * 会话变量 / 系统变量（R6-7、FR-R2、X-7）。
 *
 * 试运行前用户填入的一组"流程级输入"，运行开始时作为
 * `RunContext.variables` 注入给 Runner（v1.5 已在接口里留好位置）。
 *
 * 这些值是**运行期上下文**，不是文档的一部分：
 * 不写回 `Workflow`、不进历史栈（延续 v1.5 Q20 的口径）。
 */

/** 系统内置变量：随运行环境提供，用户不能覆盖。 */
export const SYSTEM_VARIABLES: Record<string, string> = {
  now: '当前时间（ISO 字符串）',
}

/** 用户填写的会话变量。 */
export interface SessionVariable {
  name: string
  value: string
}

/**
 * 校验一组会话变量（R6-7）。
 *
 * - 名称不能为空；
 * - 名称不能与系统内置变量冲突；
 * - 名称要合法（可作为变量引用里的字段名）。
 */
export interface VariableIssue {
  index: number
  message: string
}

export function validateSessionVariables(variables: SessionVariable[]): VariableIssue[] {
  const issues: VariableIssue[] = []
  const seen = new Set<string>()

  variables.forEach((variable, index) => {
    const name = variable.name.trim()
    if (!name) {
      issues.push({ index, message: '变量名不能为空' })
      return
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      issues.push({ index, message: `变量名「${name}」不合法：只能用字母、数字与下划线，且不以数字开头` })
      return
    }
    if (name in SYSTEM_VARIABLES) {
      issues.push({ index, message: `变量名「${name}」与系统内置变量冲突` })
      return
    }
    if (seen.has(name)) {
      issues.push({ index, message: `变量名「${name}」重复` })
      return
    }
    seen.add(name)
  })

  return issues
}

/**
 * 把会话变量与系统变量合成 Runner 的 `variables`。
 *
 * 系统变量优先：用户不能用同名变量覆盖系统变量
 * （`validateSessionVariables` 已经拦住了冲突，这里再兜一层）。
 */
export function buildRunVariables(
  variables: SessionVariable[],
  now: Date = new Date(),
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    now: now.toISOString(),
  }

  for (const variable of variables) {
    const name = variable.name.trim()
    if (!name || name in result) continue
    result[name] = variable.value
  }

  return result
}
