import type { ParamSchema, ParamType } from './registry.ts'

/** 参数校验结果：ok 表示通过，否则给出可读错误（FR-P2、R3-6）。 */
export interface ParamValidationResult {
  ok: boolean
  /** 错误信息，可直接展示在面板里。 */
  message?: string
}

const OK: ParamValidationResult = { ok: true }

/** 判断一个 schema 是否必填且缺失。 */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * 校验单个参数值（FR-P2、R3-6）。
 * 必填缺失、类型不符、select 选项不存在都视为非法，并给出可读错误。
 */
export function validateParamValue(
  schema: ParamSchema,
  value: unknown,
): ParamValidationResult {
  if (isMissing(value)) {
    if (schema.required) {
      return { ok: false, message: `${schema.label}为必填项` }
    }
    return OK
  }

  switch (schema.type) {
    case 'string':
      return typeof value === 'string'
        ? OK
        : { ok: false, message: `${schema.label}应为字符串` }

    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? OK
        : { ok: false, message: `${schema.label}应为数字` }

    case 'boolean':
      return typeof value === 'boolean'
        ? OK
        : { ok: false, message: `${schema.label}应为布尔值` }

    case 'select': {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return { ok: false, message: `${schema.label}应为选项值` }
      }
      const options = schema.options ?? []
      if (options.length === 0) return OK
      const matched = options.some((option) => option.value === value)
      return matched
        ? OK
        : { ok: false, message: `${schema.label}的值不在可选项内` }
    }

    case 'json': {
      if (typeof value !== 'string') {
        return { ok: false, message: `${schema.label}应为 JSON 文本` }
      }
      try {
        JSON.parse(value)
        return OK
      } catch {
        return { ok: false, message: `${schema.label}不是合法的 JSON` }
      }
    }

    default:
      return OK
  }
}

/**
 * 校验一组参数值，返回每个 key 的错误信息。
 * 合法的 key 不出现在结果里（R3-6）。
 */
export function validateParams(
  schemas: ParamSchema[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const schema of schemas) {
    const result = validateParamValue(schema, values[schema.key])
    if (!result.ok && result.message) {
      errors[schema.key] = result.message
    }
  }

  return errors
}

/**
 * 把表单控件的原始输入转成文档里的值（R3-6）。
 * number 走 `Number` 转换并拒绝非法数字；json 保留原始文本，校验交给 validateParams。
 */
export function coerceParamValue(schema: ParamSchema, raw: unknown): unknown {
  switch (schema.type) {
    case 'number': {
      if (raw === '' || raw === undefined || raw === null) return undefined
      const parsed = typeof raw === 'number' ? raw : Number(raw)
      return Number.isFinite(parsed) ? parsed : Number.NaN
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : raw === 'true'
    default:
      return raw
  }
}

/** schema 的默认数据集合，用于新建节点时填充 `node.data`。 */
export function getParamDefaults(schemas: ParamSchema[] = []): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const schema of schemas) {
    if (schema.default !== undefined) defaults[schema.key] = schema.default
  }
  return defaults
}

/** 参数控件类型是否属于受支持的五类（FR-P2）。 */
export function isParamType(value: string): value is ParamType {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'select' ||
    value === 'json'
  )
}
