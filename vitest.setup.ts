import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom 没有实现 PointerEvent；用 MouseEvent 补齐组件测试所需字段。
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
    }
  }

  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: PointerEventPolyfill,
  })
}

// jsdom 没有实现指针捕获 API。
for (const method of ['setPointerCapture', 'releasePointerCapture'] as const) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      value: () => undefined,
    })
  }
}

if (!('hasPointerCapture' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  })
}

afterEach(() => {
  cleanup()
})
