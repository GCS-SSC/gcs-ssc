import { vi } from 'vitest'

// jsdom has no SVG geometry; real path lengths and animation are checked in E2E.
if (typeof SVGElement !== 'undefined') {
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: vi.fn(() => 600) })
}
