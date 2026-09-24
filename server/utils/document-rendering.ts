/* eslint-disable jsdoc/require-jsdoc */
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import puppeteer, { type Browser } from 'puppeteer'
import libreOfficeConvert from 'libreoffice-convert'
import { join } from 'node:path'

type Language_Preference = 'eng' | 'fra'

export interface GeneratedDocument {
  bytes: Buffer
  filename: string
  mimeType: string
}

export class DocumentConversionError extends Error {}

const fallbackValues: Record<Language_Preference, string> = {
  eng: 'To be confirmed',
  fra: 'A confirmer'
}
export const DEFAULT_CHROMIUM_RENDER_BUDGET_MS = 30_000
export const DEFAULT_CHROMIUM_CLEANUP_TIMEOUT_MS = 2_000
export const DEFAULT_LIBREOFFICE_CONVERSION_TIMEOUT_MS = 30_000
const localSofficeWrapper = join(process.cwd(), 'scripts', 'soffice-flatpak')
let pdfBrowserPromise: Promise<Browser> | null = null
const pdfBrowserWaiters = new Map<Promise<Browser>, number>()

export interface DocumentRenderingOptions {
  chromiumCleanupTimeoutMs?: number
  chromiumRenderBudgetMs?: number
  libreOfficeConversionTimeoutMs?: number
}

export interface LibreOfficeConversionOptions {
  sofficeBinaryPaths?: string[]
  temporaryDirectory?: string
  timeoutMs?: number
}

const getTimeoutMs = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const awaitWithTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => await new Promise<T>((resolve, reject) => {
  let settled = false
  const timer = setTimeout(() => {
    settled = true
    reject(new Error(timeoutMessage))
  }, timeoutMs)

  void operation.then(
    value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    },
    error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
  )
})

const getRemainingRenderBudgetMs = (deadline: number, totalBudgetMs: number): number => {
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    throw new Error(`Chromium document rendering timed out after ${String(totalBudgetMs)} ms`)
  }
  return remaining
}

const awaitWithinRenderBudget = async <T>(
  operation: Promise<T>,
  deadline: number,
  totalBudgetMs: number
): Promise<T> => await awaitWithTimeout(
  operation,
  getRemainingRenderBudgetMs(deadline, totalBudgetMs),
  `Chromium document rendering timed out after ${String(totalBudgetMs)} ms`
)

export const resolveSofficeBinaryPaths = (): string[] => {
  if (process.env.LIBREOFFICE_SOFFICE_PATH) {
    return [process.env.LIBREOFFICE_SOFFICE_PATH]
  }

  return [localSofficeWrapper]
}

export const getFallbackValue = (language: Language_Preference = 'eng'): string => fallbackValues[language]

export const valueOrFallback = (value: unknown, language: Language_Preference = 'eng'): string => {
  if (value === undefined || value === null || value === '') {
    return getFallbackValue(language)
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return String(value)
}

const getPathValue = (source: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, source)
}

export const getDocumentTemplateTagValue = (
  tag: string,
  scope: unknown,
  scopeList: unknown[] = []
): unknown => {
  if (tag === '.') {
    return scope
  }

  const normalizedTag = tag.startsWith('this.') ? tag.slice(5) : tag
  const scopedValue = getPathValue(scope, normalizedTag)
  if (scopedValue !== undefined) {
    return scopedValue
  }

  for (const candidateScope of [...scopeList].reverse()) {
    const candidateValue = getPathValue(candidateScope, normalizedTag)
    if (candidateValue !== undefined) {
      return candidateValue
    }
  }

  return undefined
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const renderHtmlTemplate = (
  template: string,
  context: Record<string, unknown>,
  language: Language_Preference = 'eng'
): string => {
  const withLoops = template.replace(/\{\{\s*#\s*([\w.]+)\s*}}([\s\S]*?)\{\{\s*\/\s*\1\s*}}/g, (_match, key: string, body: string) => {
    const values = getPathValue(context, key)
    if (!Array.isArray(values) || values.length === 0) {
      return ''
    }

    return values.map(item => renderHtmlTemplate(body, { ...context, this: item }, language)).join('')
  })

  return withLoops.replace(/\{\{\s*([\w.]+)\s*}}/g, (_match, key: string) => escapeHtml(valueOrFallback(getPathValue(context, key), language)))
}

export const normalizeDocumentTemplateTags = (xml: string): string => xml
  .replace(/\{\{\s*#\s*([\w.]+)\s*}}/g, '{#$1}')
  .replace(/\{\{\s*\/\s*([\w.]+)\s*}}/g, '{/$1}')
  .replace(/\{\{\s*([\w.]+)\s*}}/g, '{$1}')

const normalizeDocxMustacheTags = (zip: PizZip): void => {
  for (const [path, file] of Object.entries(zip.files)) {
    if (!path.startsWith('word/') || !path.endsWith('.xml') || file.dir) {
      continue
    }

    zip.file(path, normalizeDocumentTemplateTags(file.asText()))
  }
}

const renderDocxTemplate = (templateBytes: Buffer, context: Record<string, unknown>, language: Language_Preference): Buffer => {
  const zip = new PizZip(templateBytes)
  normalizeDocxMustacheTags(zip)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => getFallbackValue(language),
    parser: (tag: string) => ({
      get: (scope: unknown, parserContext: { scopeList?: unknown[] }) => getDocumentTemplateTagValue(
        tag,
        scope,
        parserContext.scopeList
      )
    })
  })
  doc.render(context)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const getPdfBrowser = async (
  deadline: number,
  totalBudgetMs: number,
  cleanupTimeoutMs: number
): Promise<Browser> => {
  if (!pdfBrowserPromise) {
    const launchTimeoutMs = getRemainingRenderBudgetMs(deadline, totalBudgetMs)
    const launchPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: launchTimeoutMs,
      timeout: launchTimeoutMs
    })
    pdfBrowserPromise = launchPromise
    void launchPromise.then(browser => {
      browser.on('disconnected', () => {
        if (pdfBrowserPromise === launchPromise) {
          pdfBrowserPromise = null
        }
      })
    }, () => {
      if (pdfBrowserPromise === launchPromise) {
        pdfBrowserPromise = null
      }
    })
  }

  const launchPromise = pdfBrowserPromise
  pdfBrowserWaiters.set(launchPromise, (pdfBrowserWaiters.get(launchPromise) ?? 0) + 1)
  try {
    return await awaitWithinRenderBudget(launchPromise, deadline, totalBudgetMs)
  } catch (error: unknown) {
    const isLastWaiter = pdfBrowserWaiters.get(launchPromise) === 1
    if (pdfBrowserPromise === launchPromise && isLastWaiter) {
      pdfBrowserPromise = null
      void launchPromise.then(async browser => {
        if (pdfBrowserPromise === launchPromise) return
        try {
          await awaitWithTimeout(
            browser.close(),
            cleanupTimeoutMs,
            'Late Chromium browser cleanup timed out'
          )
        } catch (cleanupError: unknown) {
          console.error('Failed to close a Chromium browser that launched after its deadline.', {
            error: getErrorMessage(cleanupError)
          })
        }
      }, () => undefined)
    }
    throw error
  } finally {
    const remainingWaiters = (pdfBrowserWaiters.get(launchPromise) ?? 1) - 1
    if (remainingWaiters === 0) {
      pdfBrowserWaiters.delete(launchPromise)
    } else {
      pdfBrowserWaiters.set(launchPromise, remainingWaiters)
    }
  }
}

const renderPdfFromHtml = async (
  html: string,
  options: DocumentRenderingOptions = {}
): Promise<Buffer> => {
  const renderBudgetMs = getTimeoutMs(options.chromiumRenderBudgetMs, DEFAULT_CHROMIUM_RENDER_BUDGET_MS)
  const cleanupTimeoutMs = getTimeoutMs(options.chromiumCleanupTimeoutMs, DEFAULT_CHROMIUM_CLEANUP_TIMEOUT_MS)
  const deadline = Date.now() + renderBudgetMs
  let page: Awaited<ReturnType<Browser['newPage']>> | undefined
  let primaryError: unknown
  let renderedPdf: Buffer | undefined

  try {
    const browser = await awaitWithinRenderBudget(
      getPdfBrowser(deadline, renderBudgetMs, cleanupTimeoutMs),
      deadline,
      renderBudgetMs
    )
    page = await awaitWithinRenderBudget(browser.newPage(), deadline, renderBudgetMs)
    page.setDefaultTimeout(getRemainingRenderBudgetMs(deadline, renderBudgetMs))
    page.setDefaultNavigationTimeout(getRemainingRenderBudgetMs(deadline, renderBudgetMs))
    await awaitWithinRenderBudget(page.setJavaScriptEnabled(false), deadline, renderBudgetMs)
    await awaitWithinRenderBudget(page.setRequestInterception(true), deadline, renderBudgetMs)
    page.on('request', request => {
      const protocol = new URL(request.url()).protocol
      if (protocol === 'data:' || protocol === 'about:') {
        void request.continue()
      } else {
        void request.abort('blockedbyclient')
      }
    })
    await awaitWithinRenderBudget(page.setContent(html, {
      timeout: getRemainingRenderBudgetMs(deadline, renderBudgetMs),
      waitUntil: 'domcontentloaded'
    }), deadline, renderBudgetMs)
    await awaitWithinRenderBudget(page.waitForNetworkIdle({
      concurrency: 0,
      timeout: getRemainingRenderBudgetMs(deadline, renderBudgetMs)
    }), deadline, renderBudgetMs)
    const pdf = await awaitWithinRenderBudget(page.pdf({
      format: 'Letter',
      printBackground: true,
      timeout: getRemainingRenderBudgetMs(deadline, renderBudgetMs),
      margin: { top: '0.6in', right: '0.7in', bottom: '0.6in', left: '0.7in' }
    }), deadline, renderBudgetMs)
    renderedPdf = Buffer.from(pdf)
  } catch (error: unknown) {
    primaryError = error
  }

  if (page) {
    try {
      await awaitWithTimeout(
        page.close(),
        cleanupTimeoutMs,
        `Chromium document-rendering page cleanup timed out after ${String(cleanupTimeoutMs)} ms`
      )
    } catch (cleanupError: unknown) {
      if (primaryError === undefined) {
        primaryError = cleanupError
      } else {
        console.error('Failed to close a Chromium document-rendering page.', {
          error: getErrorMessage(cleanupError)
        })
      }
    }
  }

  if (primaryError !== undefined) {
    throw primaryError
  }
  if (!renderedPdf) {
    throw new Error('Chromium document rendering returned no document bytes')
  }
  return renderedPdf
}

export const convertLibreOfficeDocument = async (
  bytes: Buffer,
  options: LibreOfficeConversionOptions = {}
): Promise<Buffer> => {
  type ConvertOptions = Parameters<typeof libreOfficeConvert.convertWithOptions>[3] & {
    execOptions: {
      killSignal: NodeJS.Signals
      timeout: number
    }
  }
  const convertOptions: ConvertOptions = {
    fileName: 'source.docx',
    sofficeBinaryPaths: options.sofficeBinaryPaths ?? resolveSofficeBinaryPaths(),
    execOptions: {
      killSignal: 'SIGKILL',
      timeout: getTimeoutMs(options.timeoutMs, DEFAULT_LIBREOFFICE_CONVERSION_TIMEOUT_MS)
    },
    ...(options.temporaryDirectory ? { tmpOptions: { dir: options.temporaryDirectory } } : {})
  }
  let conversionError: unknown
  let convertedPdf: Buffer | undefined
  let finishCallback: (() => void) | undefined
  const callbackFinished = new Promise<void>(resolve => {
    finishCallback = resolve
  })
  // libreoffice-convert's declaration says void, but its runtime returns the async.auto
  // promise whose finalizer removes both temporary directories. Await it so cleanup
  // completes before the authorization transaction can settle.
  const convertWithPromise = libreOfficeConvert.convertWithOptions as unknown as (
    document: Buffer,
    format: string,
    filter: string | undefined,
    inputOptions: ConvertOptions,
    callback: (error: NodeJS.ErrnoException | null, data: Buffer) => void
  ) => unknown
  const conversionOperation = convertWithPromise(
    bytes,
    'pdf',
    undefined,
    convertOptions,
    (error, pdf) => {
      conversionError = error ?? undefined
      convertedPdf = error ? undefined : pdf
      finishCallback?.()
    }
  )

  await callbackFinished
  if (conversionOperation && typeof (conversionOperation as PromiseLike<unknown>).then === 'function') {
    try {
      await conversionOperation
    } catch (cleanupError: unknown) {
      if (conversionError === undefined) {
        throw cleanupError
      }
      console.error('Failed to clean up temporary LibreOffice conversion files.', {
        error: getErrorMessage(cleanupError)
      })
    }
  }
  if (conversionError !== undefined) {
    throw conversionError
  }
  if (!convertedPdf) {
    throw new Error('LibreOffice conversion returned no document bytes')
  }
  return convertedPdf
}

const convertDocxToPdf = async (bytes: Buffer, options: DocumentRenderingOptions): Promise<Buffer> => {
  try {
    return await convertLibreOfficeDocument(bytes, { timeoutMs: options.libreOfficeConversionTimeoutMs })
  } catch (cause) {
    throw new DocumentConversionError('DOCX to PDF conversion failed', { cause })
  }
}

export const renderDocument = async (
  templateKind: 'docx' | 'html',
  templateBytes: Buffer,
  context: Record<string, unknown>,
  language: Language_Preference,
  outputFormat: 'docx' | 'html' | 'pdf',
  baseFilename: string,
  options: DocumentRenderingOptions = {}
): Promise<GeneratedDocument> => {
  if (outputFormat !== templateKind && outputFormat !== 'pdf') {
    throw new Error('Document output format is incompatible with the template kind')
  }

  if (templateKind === 'html') {
    const html = renderHtmlTemplate(templateBytes.toString('utf-8'), context, language)
    return outputFormat === 'pdf'
      ? {
          bytes: await renderPdfFromHtml(html, options),
          filename: `${baseFilename}.pdf`,
          mimeType: 'application/pdf'
        }
      : {
          bytes: Buffer.from(html, 'utf-8'),
          filename: `${baseFilename}.html`,
          mimeType: 'text/html; charset=utf-8'
        }
  }

  const docx = renderDocxTemplate(templateBytes, context, language)
  return outputFormat === 'pdf'
    ? {
        bytes: await convertDocxToPdf(docx, options),
        filename: `${baseFilename}.pdf`,
        mimeType: 'application/pdf'
      }
    : {
        bytes: docx,
        filename: `${baseFilename}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
}
