import { describe, expect, it } from 'vitest'
import {
  coerceParamValue,
  getParamDefaults,
  validateParamValue,
  validateParams,
} from './params.ts'
import type { ParamSchema } from './registry.ts'

const stringParam: ParamSchema = { key: 'prompt', label: '提示词', type: 'string' }
const numberParam: ParamSchema = { key: 'temperature', label: '温度', type: 'number' }
const booleanParam: ParamSchema = { key: 'stream', label: '流式输出', type: 'boolean' }
const selectParam: ParamSchema = {
  key: 'model',
  label: '模型',
  type: 'select',
  options: [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ],
}
const jsonParam: ParamSchema = { key: 'config', label: '配置', type: 'json' }

describe('参数校验（R3-6、FR-P2）', () => {
  it('必填参数缺失时报错', () => {
    const required: ParamSchema = { ...stringParam, required: true }
    const result = validateParamValue(required, '')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('必填')
  })

  it('非必填参数缺失时通过', () => {
    expect(validateParamValue(stringParam, undefined).ok).toBe(true)
  })

  it('类型不符时报错并给出可读信息', () => {
    expect(validateParamValue(numberParam, 'abc').ok).toBe(false)
    expect(validateParamValue(numberParam, Number.NaN).ok).toBe(false)
    expect(validateParamValue(booleanParam, 'yes').ok).toBe(false)
    expect(validateParamValue(stringParam, 42).ok).toBe(false)
  })

  it('select 的值必须落在可选项内', () => {
    expect(validateParamValue(selectParam, 'a').ok).toBe(true)
    expect(validateParamValue(selectParam, 'zzz').ok).toBe(false)
  })

  it('json 字段必须是合法 JSON 文本', () => {
    expect(validateParamValue(jsonParam, '{"a":1}').ok).toBe(true)
    expect(validateParamValue(jsonParam, '{a:1}').ok).toBe(false)
  })

  it('校验一组参数，错误按 key 归集', () => {
    const errors = validateParams(
      [stringParam, numberParam, booleanParam],
      { prompt: 'x', temperature: 'hot', stream: true },
    )
    expect(Object.keys(errors)).toEqual(['temperature'])
  })
})

describe('参数取值转换（R3-6）', () => {
  it('number 控件把输入转成数字', () => {
    expect(coerceParamValue(numberParam, '0.5')).toBe(0.5)
    expect(coerceParamValue(numberParam, '')).toBeUndefined()
  })

  it('boolean 控件把字符串转成布尔值', () => {
    expect(coerceParamValue(booleanParam, 'true')).toBe(true)
    expect(coerceParamValue(booleanParam, 'false')).toBe(false)
  })

  it('取出 schema 的默认值集合', () => {
    expect(getParamDefaults([numberParam, stringParam])).toEqual({})
    expect(getParamDefaults([{ ...numberParam, default: 0.7 }])).toEqual({ temperature: 0.7 })
  })
})
