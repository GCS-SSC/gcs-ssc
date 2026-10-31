/* eslint-disable jsdoc/require-jsdoc */
import type Docxtemplater from 'docxtemplater'

export const DOCX_MAX_RENDER_ITERATIONS = 10_000
export const DOCX_MAX_RENDER_PARTS = 100_000
export const DOCX_MAX_RENDERED_BYTES = 16 * 1024 * 1024
export const DOCX_MAX_RENDER_DEPTH = 32

export class DocumentRenderBudgetError extends Error {
  constructor() {
    super('DOCX rendering budget exceeded')
  }
}

export const createDocumentRenderBudget = (largestXmlPartBytes: number) => {
  let iterations = 0
  let parts = 0
  let bytes = 0
  let failure: DocumentRenderBudgetError | undefined
  const reject = (): never => {
    failure ??= new DocumentRenderBudgetError()
    throw failure
  }
  const chargeBytes = (size: number): void => {
    bytes += size
    if (bytes > DOCX_MAX_RENDERED_BYTES) reject()
  }
  const module: Docxtemplater.DXT.Module = {
    name: 'GcsDocumentRenderBudget',
    priority: 100,
    render: (part, options) => {
      if (failure) throw failure
      parts += 1
      if (parts > DOCX_MAX_RENDER_PARTS || options.scopeManager.scopeList.length > DOCX_MAX_RENDER_DEPTH) reject()
      if (part.type === 'content' || part.type === 'tag') chargeBytes(Buffer.byteLength(part.value))
      return null
    },
    postrender: (renderedParts: string[]) => {
      let renderedBytes = 0
      for (const part of renderedParts) {
        renderedBytes += Buffer.byteLength(part)
        if (renderedBytes > DOCX_MAX_RENDERED_BYTES) reject()
      }
      return renderedParts
    }
  }
  return {
    module,
    get failure() { return failure },
    inspectValue: (value: unknown, isSection: boolean): void => {
      if (failure) throw failure
      if (isSection) {
        iterations += Array.isArray(value) ? value.length : 1
        if (iterations > DOCX_MAX_RENDER_ITERATIONS) reject()
        return
      }
      const text = value === null || value === undefined ? '' : String(value)
      // Escaping expands a character at most sixfold. Each newline can copy run
      // formatting, whose size cannot exceed its source XML part.
      chargeBytes(Buffer.byteLength(text) * 6)
      for (const character of text) {
        if (character === '\n') chargeBytes(largestXmlPartBytes + 128)
      }
    }
  }
}
