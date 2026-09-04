/* eslint-disable jsdoc/require-jsdoc */
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import puppeteer, { type Browser } from 'puppeteer'
import libreOfficeConvert from 'libreoffice-convert'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { sql, type Insertable, type Kysely, type Selectable } from 'kysely'
import { badRequest, notFound, throwApiError } from './api-errors'
import { bestEffortStorageCleanup, deleteStoredAttachmentById, readStoredFile, writeStoredFile } from './file-storage'
import { escapeLikePattern } from './sql-like'
import type { Database, FundingCaseAgreementGeneratedDocumentTable, Language_Preference, TransferPaymentDocumentTemplateEntityType, TransferPaymentDocumentTemplateOutputFormat, TransferPaymentStreamDocumentTemplateTable } from '~~/shared/types/database'
import { buildAgreementCloseoutReadiness } from './agreement-closeout'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { formatMoneyText, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'

export interface GeneratedAgreementDocument {
  bytes: Buffer
  filename: string
  mimeType: string
}

export type DocumentGenerationContextProvider = (payload: {
  agreementId: string
  db: Kysely<Database>
  event: H3Event
}) => Promise<Record<string, unknown>> | Record<string, unknown>

type TemplateRow = TransferPaymentStreamDocumentTemplateTable & {
  egcs_cn_provider_en: string
  egcs_cn_providerobjectid_en: string
  egcs_cn_providerlocator_en: import('~~/shared/types/database').JsonValue
  egcs_cn_provider_fr: string
  egcs_cn_providerobjectid_fr: string
  egcs_cn_providerlocator_fr: import('~~/shared/types/database').JsonValue
  agencyId: string
}

export const readDocumentStoredFile = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  attachment: Parameters<typeof readStoredFile>[2],
  purpose: Parameters<typeof readStoredFile>[3] = 'document-template',
  target?: Parameters<typeof readStoredFile>[4]
): Promise<Buffer> => {
  try {
    return await readStoredFile(db, agencyId, attachment, purpose, target)
  } catch {
    return await throwApiError(event, {
      statusCode: 503,
      code: 'DOCUMENT_STORAGE_READ_FAILED',
      key: 'apiErrors.document_generation.storage_unavailable'
    })
  }
}

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

const getFallbackValue = (language: Language_Preference = 'eng'): string => fallbackValues[language]

const valueOrFallback = (value: unknown, language: Language_Preference = 'eng'): string => {
  if (value === undefined || value === null || value === '') {
    return getFallbackValue(language)
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return String(value)
}

export const formatDocumentMoney = (value: Money, language: Language_Preference = 'eng'): string =>
  formatMoneyText(value, language === 'fra' ? 'fr-CA' : 'en-US', 'CAD')

/**
 * Preserves the unresolved DEC-041 number formatting boundary without admitting numbers to ordinary money formatting.
 *
 * @param amount - Legacy number produced by the unresolved holdback calculation.
 * @param language - Document language used for currency presentation.
 * @returns The existing localized holdback currency presentation.
 */
export const formatLegacyDec041HoldbackMoney = (amount: number, language: Language_Preference = 'eng'): string => {
  if (language === 'eng') {
    return `CA$${amount.toLocaleString('en-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const deepMergeContext = (base: Record<string, unknown>, extension: Record<string, unknown>): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(extension)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMergeContext(merged[key] as Record<string, unknown>, value)
      continue
    }
    merged[key] = value
  }
  return merged
}

const formatAddress = (address: {
  street1?: string | null
  street2?: string | null
  street3?: string | null
  city?: string | null
  subdivision?: string | null
  postalCode?: string | null
  country?: string | null
} | undefined, language: Language_Preference = 'eng'): string => {
  if (!address) {
    return getFallbackValue(language)
  }

  const lines = [
    address.street1,
    address.street2,
    address.street3,
    [address.city, address.subdivision, address.postalCode].filter(Boolean).join(', '),
    address.country ? String(address.country).toUpperCase() : undefined
  ].filter(value => value !== undefined && value !== null && value !== '')

  return lines.length > 0 ? lines.join('\n') : getFallbackValue(language)
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

const convertDocxToPdf = async (
  event: H3Event,
  bytes: Buffer,
  options: DocumentRenderingOptions
): Promise<Buffer> => {
  try {
    return await convertLibreOfficeDocument(bytes, {
      timeoutMs: options.libreOfficeConversionTimeoutMs
    })
  } catch {
    return await badRequest(
      event,
      'LIBREOFFICE_UNAVAILABLE',
      'apiErrors.document_generation.libreoffice_unavailable'
    )
  }
}

const loadAgreementDocumentTemplate = async (
  agreementId: string,
  templateId: string,
  db: Kysely<Database>,
  entityType: TransferPaymentDocumentTemplateEntityType = 'fundingcaseagreement'
): Promise<TemplateRow | undefined> => {
  const template = await db
    .selectFrom('Transfer_Payment_Stream_Document_Template')
    .innerJoin('Common_Attachment as AttachmentEn', 'AttachmentEn.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_en')
    .innerJoin('Common_Attachment as AttachmentFr', 'AttachmentFr.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_fr')
    .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream', 'Transfer_Payment_Stream_Document_Template.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
    .where('Transfer_Payment_Stream_Document_Template.id', '=', templateId)
    .where('Transfer_Payment_Stream_Document_Template.egcs_tp_entitytype', '=', entityType)
    .where('Transfer_Payment_Stream_Document_Template.egcs_tp_active', '=', true)
    .where('Transfer_Payment_Stream_Document_Template._deleted', '=', false)
    .where('AttachmentEn._deleted', '=', false)
    .where('AttachmentFr._deleted', '=', false)
    .selectAll('Transfer_Payment_Stream_Document_Template')
    .select([
      'AttachmentEn.egcs_cn_provider as egcs_cn_provider_en',
      'AttachmentEn.egcs_cn_providerobjectid as egcs_cn_providerobjectid_en',
      'AttachmentEn.egcs_cn_providerlocator as egcs_cn_providerlocator_en',
      'AttachmentFr.egcs_cn_provider as egcs_cn_provider_fr',
      'AttachmentFr.egcs_cn_providerobjectid as egcs_cn_providerobjectid_fr',
      'AttachmentFr.egcs_cn_providerlocator as egcs_cn_providerlocator_fr',
      'Transfer_Payment_Profile.egcs_tp_agency as agencyId'
    ])
    .executeTakeFirst()

  return template as TemplateRow | undefined
}

const getLocalizedTemplateAttachment = (
  template: TemplateRow,
  language: Language_Preference
) => ({
  egcs_cn_provider: language === 'fra' ? template.egcs_cn_provider_fr : template.egcs_cn_provider_en,
  egcs_cn_providerobjectid: language === 'fra' ? template.egcs_cn_providerobjectid_fr : template.egcs_cn_providerobjectid_en,
  egcs_cn_providerlocator: language === 'fra' ? template.egcs_cn_providerlocator_fr : template.egcs_cn_providerlocator_en
})

const buildGeneratedDocumentBaseFilename = (
  context: Record<string, unknown>,
  template: TemplateRow,
  agreementId: string,
  language: Language_Preference
) => {
  const templateFilenamePart = language === 'fra' ? template.egcs_tp_name_fr : template.egcs_tp_name_en
  const agreementNumber = context.agreement && typeof context.agreement === 'object'
    ? (context.agreement as Record<string, unknown>).number
    : agreementId
  return `${agreementNumber}-${templateFilenamePart}-${language}`.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export const renderGeneratedAgreementDocument = async (
  event: H3Event,
  template: TemplateRow,
  templateBytes: Buffer,
  context: Record<string, unknown>,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  baseFilename: string,
  options: DocumentRenderingOptions = {}
): Promise<GeneratedAgreementDocument> => {
  if (outputFormat !== template.egcs_tp_templatekind && outputFormat !== 'pdf') {
    return await badRequest(event, 'DOCUMENT_OUTPUT_NOT_ALLOWED', 'apiErrors.document_generation.output_not_allowed')
  }

  if (template.egcs_tp_templatekind === 'html') {
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
        bytes: await convertDocxToPdf(event, docx, options),
        filename: `${baseFilename}.pdf`,
        mimeType: 'application/pdf'
      }
    : {
        bytes: docx,
        filename: `${baseFilename}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
}

const storeGeneratedAgreementDocument = async (
  db: Kysely<Database>,
  template: TemplateRow,
  agreementId: string,
  generated: GeneratedAgreementDocument,
  closeoutId?: string
) => await writeStoredFile(db, {
  agencyId: String(template.agencyId),
  bytes: generated.bytes,
  filename: generated.filename,
  mimeType: generated.mimeType,
  nameEn: generated.filename,
  nameFr: generated.filename,
  descriptionEn: closeoutId ? `Generated closeout document for agreement ${agreementId}` : `Generated document for agreement ${agreementId}`,
  descriptionFr: closeoutId ? `Document de cloture genere pour l entente ${agreementId}` : `Document genere pour l entente ${agreementId}`,
  folder: closeoutId ? `generated-documents/agreement-${agreementId}/closeout-${closeoutId}` : `generated-documents/agreement-${agreementId}`,
  purpose: 'generated-document',
  target: { entityType: closeoutId ? 'fundingcaseagreementcloseout' : 'fundingcaseagreement', entityId: closeoutId ?? agreementId },
  attachmentTypeNameEn: 'Generated Document',
  attachmentTypeNameFr: 'Document genere',
  attachmentTypeDescriptionEn: 'Generated agreement documents.',
  attachmentTypeDescriptionFr: 'Documents d entente generes.'
})

const insertGeneratedAgreementDocumentRecord = async (
  db: Kysely<Database>,
  agreementId: string,
  templateId: string,
  template: TemplateRow,
  storedAttachmentId: string,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  closeoutId?: string
) => {
  const record: Insertable<FundingCaseAgreementGeneratedDocumentTable> = {
    egcs_fc_fundingagreement: agreementId,
    egcs_fc_closeout: closeoutId,
    egcs_fc_documenttemplate: templateId,
    egcs_fc_generatedattachment: storedAttachmentId,
    egcs_fc_language: language,
    egcs_fc_name_en: template.egcs_tp_name_en,
    egcs_fc_name_fr: template.egcs_tp_name_fr,
    egcs_fc_outputformat: outputFormat,
    egcs_fc_generatedat: new Date(),
    _deleted: false
  }

  return await db.insertInto('Funding_Case_Agreement_Generated_Document').values(record).returningAll().executeTakeFirstOrThrow()
}

export const persistGeneratedDocumentWithRollback = async (
  db: Kysely<Database>,
  agreementId: string,
  templateId: string,
  template: TemplateRow,
  generated: GeneratedAgreementDocument,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  closeoutId?: string
) => {
  const stored = await storeGeneratedAgreementDocument(db, template, agreementId, generated, closeoutId)

  try {
    return await insertGeneratedAgreementDocumentRecord(
      db,
      agreementId,
      templateId,
      template,
      stored.id,
      language,
      outputFormat,
      closeoutId
    )
  } catch (error: unknown) {
    await bestEffortStorageCleanup(async () => await deleteStoredAttachmentById(db, stored.id, 'generated-document', {
      entityType: closeoutId ? 'fundingcaseagreementcloseout' : 'fundingcaseagreement',
      entityId: closeoutId ?? agreementId
    }), {
      providerId: stored.providerId,
      objectId: stored.objectId,
      purpose: 'generated-document'
    })
    throw error
  }
}

export const listAgreementDocumentTemplates = async (
  agreementId: string,
  db: Kysely<Database>,
  activeOnly: boolean,
  entityType: TransferPaymentDocumentTemplateEntityType = 'fundingcaseagreement'
) => {
  const agreement = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .where('id', '=', agreementId)
    .where('_deleted', '=', false)
    .select('egcs_fc_transferpaymentstream')
    .executeTakeFirst()

  if (!agreement?.egcs_fc_transferpaymentstream) {
    return []
  }

  let query = db
    .selectFrom('Transfer_Payment_Stream_Document_Template')
    .innerJoin('Common_Attachment as AttachmentEn', 'AttachmentEn.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_en')
    .innerJoin('Common_Attachment as AttachmentFr', 'AttachmentFr.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_fr')
    .where('Transfer_Payment_Stream_Document_Template.egcs_tp_transferpaymentstream', '=', String(agreement.egcs_fc_transferpaymentstream))
    .where('Transfer_Payment_Stream_Document_Template.egcs_tp_entitytype', '=', entityType)
    .where('Transfer_Payment_Stream_Document_Template._deleted', '=', false)
    .where('AttachmentEn._deleted', '=', false)
    .where('AttachmentFr._deleted', '=', false)
    .select([
      'Transfer_Payment_Stream_Document_Template.id as id',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_entitytype as egcs_tp_entitytype',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_name_en as egcs_tp_name_en',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_name_fr as egcs_tp_name_fr',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_description_en as egcs_tp_description_en',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_description_fr as egcs_tp_description_fr',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_en as egcs_tp_templateattachment_en',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_fr as egcs_tp_templateattachment_fr',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_templatekind as egcs_tp_templatekind',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_outputformats as egcs_tp_outputformats',
      'Transfer_Payment_Stream_Document_Template.egcs_tp_active as egcs_tp_active',
      'AttachmentEn.egcs_cn_name_en as attachment_en_name_en',
      'AttachmentEn.egcs_cn_name_fr as attachment_en_name_fr',
      'AttachmentEn.egcs_cn_mimetype as attachment_en_mimetype',
      'AttachmentEn.egcs_cn_filesize as attachment_en_filesize',
      'AttachmentFr.egcs_cn_name_en as attachment_fr_name_en',
      'AttachmentFr.egcs_cn_name_fr as attachment_fr_name_fr',
      'AttachmentFr.egcs_cn_mimetype as attachment_fr_mimetype',
      'AttachmentFr.egcs_cn_filesize as attachment_fr_filesize'
    ])
    .orderBy('Transfer_Payment_Stream_Document_Template.id', 'asc')

  if (activeOnly) {
    query = query.where('Transfer_Payment_Stream_Document_Template.egcs_tp_active', '=', true)
  }

  return await query.execute()
}

export const buildAgreementDocumentContext = async (
  agreementId: string,
  db: Kysely<Database>,
  event?: H3Event,
  language: Language_Preference = 'eng'
): Promise<Record<string, unknown>> => {
  const localized = <T extends { en: unknown, fr: unknown }>(value: T): unknown => language === 'fra' ? value.fr : value.en
  const localizedValue = (value: unknown): string => valueOrFallback(value, language)
  const localizedMoney = (value: Money): string => formatDocumentMoney(value, language)
  const localizedAddress = (address: Parameters<typeof formatAddress>[0]): string => formatAddress(address, language)

  const agreement = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .innerJoin('Transfer_Payment_Stream_Holdback_Basis', join => join
      .onRef('Transfer_Payment_Stream_Holdback_Basis.id', '=', 'Funding_Case_Agreement_Profile.egcs_fc_holdbackbasis')
      .onRef('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_transferpaymentstream', '=', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'))
    .innerJoin('Agency_Holdback_Basis', 'Agency_Holdback_Basis.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback')
    .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as number',
      'Funding_Case_Agreement_Profile.egcs_fc_title_en as titleEn',
      'Funding_Case_Agreement_Profile.egcs_fc_title_fr as titleFr',
      'Funding_Case_Agreement_Profile.egcs_fc_description_en as descriptionEn',
      'Funding_Case_Agreement_Profile.egcs_fc_description_fr as descriptionFr',
      'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistancestartdate as startDate',
      'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistanceenddate as endDate',
      'Funding_Case_Agreement_Profile.egcs_fc_holdback as holdback',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en as holdbackBasisEn',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr as holdbackBasisFr',
      'Agency_Holdback_Basis.egcs_ay_languageindependentcode as holdbackBasisCode',
      'Agency_Profile.egcs_ay_name_en as agencyNameEn',
      'Agency_Profile.egcs_ay_name_fr as agencyNameFr',
      'Transfer_Payment_Profile.egcs_tp_name_en as programNameEn',
      'Transfer_Payment_Profile.egcs_tp_name_fr as programNameFr',
      'Transfer_Payment_Stream.egcs_tp_name_en as streamNameEn',
      'Transfer_Payment_Stream.egcs_tp_name_fr as streamNameFr'
    ])
    .executeTakeFirst()

  if (!agreement) {
    return {}
  }

  const [recipients, recipientAddresses, activities, activityOutcomes, activityResponsibleParties, budgetYears, budgetItems, commitments, payments, claims, forecasts] = await Promise.all([
    db.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient')
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .select([
        'Applicant_Recipient_Profile.id as applicantRecipientId',
        'Applicant_Recipient_Profile.egcs_ar_legalname_en as legalNameEn',
        'Applicant_Recipient_Profile.egcs_ar_legalname_fr as legalNameFr'
      ])
      .orderBy('Funding_Case_Agreement_Applicant_Recipient.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin('Applicant_Recipient_Address', 'Applicant_Recipient_Address.egcs_ar_applicantrecipient', 'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient')
      .innerJoin('Common_Address', 'Common_Address.id', 'Applicant_Recipient_Address.egcs_ar_address')
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .where('Applicant_Recipient_Address._deleted', '=', false)
      .where('Common_Address._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient as applicantRecipientId',
        'Common_Address.egcs_cn_street1 as street1',
        'Common_Address.egcs_cn_street2 as street2',
        'Common_Address.egcs_cn_street3 as street3',
        'Common_Address.egcs_cn_addresscity as city',
        'Common_Address.egcs_cn_addresssubdivision as subdivision',
        'Common_Address.egcs_cn_postalcodezipcode as postalCode',
        'Common_Address.egcs_cn_addresscountry as country'
      ])
      .orderBy('Applicant_Recipient_Address.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Activity')
      .innerJoin('Funding_Case_Agreement_Activity_Version', 'Funding_Case_Agreement_Activity_Version.id', 'Funding_Case_Agreement_Activity.egcs_fc_activityversion')
      .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Activity._deleted', '=', false)
      .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Activity.id as id',
        'egcs_fc_name_en as nameEn',
        'egcs_fc_name_fr as nameFr',
        'egcs_fc_description_en as descriptionEn',
        'egcs_fc_description_fr as descriptionFr',
        'egcs_fc_expectedresults_en as expectedResultsEn',
        'egcs_fc_expectedresults_fr as expectedResultsFr',
        'egcs_fc_startdate as startDate',
        'egcs_fc_enddate as endDate'
      ])
      .orderBy('Funding_Case_Agreement_Activity.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Activity')
      .innerJoin('Funding_Case_Agreement_Activity_Version', 'Funding_Case_Agreement_Activity_Version.id', 'Funding_Case_Agreement_Activity.egcs_fc_activityversion')
      .innerJoin(
        'Funding_Case_Agreement_Outcome_Activity',
        'Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity',
        'Funding_Case_Agreement_Activity.id'
      )
      .innerJoin(
        'Transfer_Payment_Outcome',
        'Transfer_Payment_Outcome.id',
        'Funding_Case_Agreement_Outcome_Activity.egcs_fc_outcomes'
      )
      .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Activity._deleted', '=', false)
      .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
      .where('Funding_Case_Agreement_Outcome_Activity._deleted', '=', false)
      .where('Transfer_Payment_Outcome._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Activity.id as activityId',
        'Transfer_Payment_Outcome.id as id',
        'Transfer_Payment_Outcome.egcs_tp_name_en as nameEn',
        'Transfer_Payment_Outcome.egcs_tp_name_fr as nameFr',
        'Transfer_Payment_Outcome.egcs_tp_description_en as descriptionEn',
        'Transfer_Payment_Outcome.egcs_tp_description_fr as descriptionFr'
      ])
      .orderBy('Funding_Case_Agreement_Outcome_Activity.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Activity')
      .innerJoin('Funding_Case_Agreement_Activity_Version', 'Funding_Case_Agreement_Activity_Version.id', 'Funding_Case_Agreement_Activity.egcs_fc_activityversion')
      .innerJoin(
        'Funding_Case_Agreement_Responsible_Party_Activity',
        'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity',
        'Funding_Case_Agreement_Activity.id'
      )
      .innerJoin(
        'Funding_Case_Agreement_Applicant_Recipient',
        'Funding_Case_Agreement_Applicant_Recipient.id',
        'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_responsibleparty'
      )
      .innerJoin(
        'Applicant_Recipient_Profile',
        'Applicant_Recipient_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient'
      )
      .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Activity._deleted', '=', false)
      .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
      .where('Funding_Case_Agreement_Responsible_Party_Activity._deleted', '=', false)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .where('Applicant_Recipient_Profile._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Activity.id as activityId',
        'Funding_Case_Agreement_Applicant_Recipient.id as id',
        'Applicant_Recipient_Profile.egcs_ar_legalname_en as legalNameEn',
        'Applicant_Recipient_Profile.egcs_ar_legalname_fr as legalNameFr',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_en as operatingNameEn',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as operatingNameFr'
      ])
      .orderBy('Funding_Case_Agreement_Responsible_Party_Activity.id', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .select(['Funding_Case_Agreement_Budget_Fiscal_Year.id as id', 'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as display'])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .leftJoin('Transfer_Payment_Stream_Cost_Category_Line_Item', 'Transfer_Payment_Stream_Cost_Category_Line_Item.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory')
      .leftJoin('Agency_Cost_Category_Line_Item', 'Agency_Cost_Category_Line_Item.id', 'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory')
      .leftJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Budget_Fiscal_Year.id as fiscalYearId',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscalYear',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as subsection',
        'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as description',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('totalAmount'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('programFunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('otherFederalFunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('otherGovFunding'),
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('otherFunding'),
        'Agency_Cost_Category.egcs_ay_name_en as costCategoryEn',
        'Agency_Cost_Category.egcs_ay_name_fr as costCategoryFr',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_en as categoryEn',
        'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as categoryFr'
      ])
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Commitment')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .select(['egcs_fc_type as type', 'egcs_fc_status as status', 'egcs_fc_financialsystemnumber as financialSystemNumber'])
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Payment')
      .innerJoin('Funding_Case_Agreement_Commitment', 'Funding_Case_Agreement_Commitment.id', 'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment')
      .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Payment._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Payment.egcs_fc_paymenttype as type',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('amount'),
        'Funding_Case_Agreement_Payment.egcs_fc_status as status'
      ])
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Claim')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .select(['egcs_fc_status as status', 'egcs_fc_periodstart as periodStart', 'egcs_fc_periodend as periodEnd'])
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Forecast')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .select(['egcs_fc_active as active'])
      .execute()
  ])

  const zeroMoney = parseMoney('0')
  const getAmount = (value: unknown): Money => value == null ? zeroMoney : parseDatabaseMoney(value)
  const getOtherFundingTotal = (item: {
    otherFederalFunding?: unknown
    otherGovFunding?: unknown
    otherFunding?: unknown
  }): Money => sumMoney([
    getAmount(item.otherFederalFunding),
    getAmount(item.otherGovFunding),
    getAmount(item.otherFunding)
  ])
  const lineItems = budgetItems.map(item => ({
    ...item,
    fiscalYearId: String(item.fiscalYearId),
    fiscalYear: localizedValue(item.fiscalYear),
    costCategory: localizedValue(localized({ en: item.costCategoryEn, fr: item.costCategoryFr })),
    category: localizedValue(localized({ en: item.categoryEn, fr: item.categoryFr })),
    subsection: localizedValue(item.subsection),
    description: localizedValue(item.description),
    totalAmountFormatted: localizedMoney(getAmount(item.totalAmount)),
    programFundingFormatted: localizedMoney(getAmount(item.programFunding)),
    otherFundingFormatted: localizedMoney(getOtherFundingTotal(item))
  }))
  const getSchedule2ColumnKey = (subsection: unknown): 'programDelivery' | 'administrative' | 'capital' => {
    const normalized = String(subsection ?? '').toLowerCase()
    if (normalized.includes('admin')) {
      return 'administrative'
    }
    if (normalized.includes('capital')) {
      return 'capital'
    }
    return 'programDelivery'
  }
  const schedule2CostCategoryNames = Array.from(new Set(lineItems.map(item => localizedValue(item.costCategory))))
  const budgetYearsWithDetails = budgetYears.map(year => {
    const yearLineItems = lineItems.filter(item => String(item.fiscalYearId) === String(year.id))
    const sectionNames = Array.from(new Set(yearLineItems.map(item => localizedValue(item.costCategory))))
    const schedule2SectionNames = Array.from(new Set(yearLineItems.map(item => localizedValue(item.subsection))))
    const totalAmount = sumMoney(yearLineItems.map(item => getAmount(item.totalAmount)))
    const programFunding = sumMoney(yearLineItems.map(item => getAmount(item.programFunding)))
    const otherFunding = sumMoney(yearLineItems.map(item => getOtherFundingTotal(item)))
    const programDeliveryFunding = sumMoney(yearLineItems
      .filter(item => getSchedule2ColumnKey(item.subsection) === 'programDelivery')
      .map(item => getAmount(item.programFunding)))
    const administrativeFunding = sumMoney(yearLineItems
      .filter(item => getSchedule2ColumnKey(item.subsection) === 'administrative')
      .map(item => getAmount(item.programFunding)))
    const capitalFunding = sumMoney(yearLineItems
      .filter(item => getSchedule2ColumnKey(item.subsection) === 'capital')
      .map(item => getAmount(item.programFunding)))

    return {
      id: String(year.id),
      display: localizedValue(year.display),
      totalAmountFormatted: localizedMoney(totalAmount),
      programFundingFormatted: localizedMoney(programFunding),
      otherFundingFormatted: localizedMoney(otherFunding),
      programDeliveryFundingFormatted: localizedMoney(programDeliveryFunding),
      administrativeFundingFormatted: localizedMoney(administrativeFunding),
      capitalFundingFormatted: localizedMoney(capitalFunding),
      totalContributionFormatted: localizedMoney(sumMoney([programDeliveryFunding, administrativeFunding, capitalFunding])),
      sections: sectionNames.map(sectionName => {
        const sectionLineItems = yearLineItems.filter(item => item.costCategory === sectionName)
        const sectionTotalAmount = sumMoney(sectionLineItems.map(item => getAmount(item.totalAmount)))
        const sectionProgramFunding = sumMoney(sectionLineItems.map(item => getAmount(item.programFunding)))
        const sectionOtherFunding = sumMoney(sectionLineItems.map(item => getOtherFundingTotal(item)))
        const subsectionNames = Array.from(new Set(sectionLineItems.map(item => localizedValue(item.subsection))))

        return {
          name: sectionName,
          totalAmountFormatted: localizedMoney(sectionTotalAmount),
          programFundingFormatted: localizedMoney(sectionProgramFunding),
          otherFundingFormatted: localizedMoney(sectionOtherFunding),
          subsections: subsectionNames.map(subsectionName => {
            const subsectionLineItems = sectionLineItems.filter(item => item.subsection === subsectionName)
            const subsectionProgramFunding = sumMoney(subsectionLineItems.map(item => getAmount(item.programFunding)))

            return {
              name: subsectionName,
              programFundingFormatted: localizedMoney(subsectionProgramFunding),
              lineItems: subsectionLineItems.map(item => ({
                quantity: '',
                category: item.category,
                description: item.description,
                amountFormatted: item.programFundingFormatted
              }))
            }
          }),
          lineItems: sectionLineItems.map(item => ({
            subsection: item.subsection,
            category: item.category,
            description: item.description,
            totalAmountFormatted: item.totalAmountFormatted,
            programFundingFormatted: item.programFundingFormatted,
            otherFundingFormatted: item.otherFundingFormatted
          }))
        }
      }),
      schedule2Sections: schedule2SectionNames.map(sectionName => {
        const sectionLineItems = yearLineItems.filter(item => item.subsection === sectionName)
        const sectionProgramFunding = sumMoney(sectionLineItems.map(item => getAmount(item.programFunding)))

        return {
          name: sectionName,
          programFundingFormatted: localizedMoney(sectionProgramFunding),
          lineItems: sectionLineItems.map(item => ({
            quantity: '',
            category: item.category,
            description: item.description,
            amountFormatted: item.programFundingFormatted
          }))
        }
      })
    }
  })
  const schedule2SummaryRows = schedule2CostCategoryNames.map(categoryName => {
    const categoryLineItems = lineItems.filter(item => item.costCategory === categoryName)
    const yearAmounts = budgetYearsWithDetails.map(year => {
      const amount = sumMoney(categoryLineItems
        .filter(item => String(item.fiscalYearId) === String(year.id))
        .map(item => getAmount(item.programFunding)))

      return localizedMoney(amount)
    })
    const total = sumMoney(categoryLineItems.map(item => getAmount(item.programFunding)))

    return {
      name: categoryName,
      year1AmountFormatted: yearAmounts[0] || localizedMoney(parseMoney('0')),
      year2AmountFormatted: yearAmounts[1] || localizedMoney(parseMoney('0')),
      totalAmountFormatted: localizedMoney(total)
    }
  })
  const schedule2SummaryTotals = {
    name: 'TOTAL',
    year1AmountFormatted: localizedMoney(sumMoney(lineItems
      .filter(item => String(item.fiscalYearId) === String(budgetYearsWithDetails[0]?.id))
      .map(item => getAmount(item.programFunding)))),
    year2AmountFormatted: localizedMoney(sumMoney(lineItems
      .filter(item => String(item.fiscalYearId) === String(budgetYearsWithDetails[1]?.id))
      .map(item => getAmount(item.programFunding)))),
    totalAmountFormatted: localizedMoney(sumMoney(lineItems.map(item => getAmount(item.programFunding))))
  }
  const schedule2Years = budgetYearsWithDetails

  const primaryRecipient = recipients[0]
  const primaryAddress = recipientAddresses.find(address => String(address.applicantRecipientId) === String(primaryRecipient?.applicantRecipientId))
  const totalProgramFunding = sumMoney(lineItems.map(item => getAmount(item.programFunding)))
  const totalProgramDeliveryFunding = sumMoney(lineItems
    .filter(item => getSchedule2ColumnKey(item.subsection) === 'programDelivery')
    .map(item => getAmount(item.programFunding)))
  const totalAdministrativeFunding = sumMoney(lineItems
    .filter(item => getSchedule2ColumnKey(item.subsection) === 'administrative')
    .map(item => getAmount(item.programFunding)))
  const totalCapitalFunding = sumMoney(lineItems
    .filter(item => getSchedule2ColumnKey(item.subsection) === 'capital')
    .map(item => getAmount(item.programFunding)))
  // DEC-041: holdback rounding is unresolved; keep this one derived-money boundary explicit.
  const holdbackAmount = Number(totalProgramFunding) * (Number(agreement.holdback || 0) / 100)
  const activityOutcomesByActivityId = new Map<string, typeof activityOutcomes>()
  for (const outcome of activityOutcomes) {
    const key = String(outcome.activityId)
    activityOutcomesByActivityId.set(key, [...(activityOutcomesByActivityId.get(key) ?? []), outcome])
  }
  const activityResponsiblePartiesByActivityId = new Map<string, typeof activityResponsibleParties>()
  for (const party of activityResponsibleParties) {
    const key = String(party.activityId)
    activityResponsiblePartiesByActivityId.set(key, [...(activityResponsiblePartiesByActivityId.get(key) ?? []), party])
  }
  const expectedOutcomesById = new Map<string, { name: string, description: string }>()
  for (const outcome of activityOutcomes) {
    expectedOutcomesById.set(String(outcome.id), {
      name: localizedValue(localized({ en: outcome.nameEn, fr: outcome.nameFr })),
      description: localizedValue(localized({ en: outcome.descriptionEn, fr: outcome.descriptionFr }))
    })
  }

  const baseContext: Record<string, unknown> = {
    agreement: {
      number: localizedValue(agreement.number),
      title: localizedValue(localized({ en: agreement.titleEn, fr: agreement.titleFr })),
      description: localizedValue(localized({ en: agreement.descriptionEn, fr: agreement.descriptionFr })),
      startDate: localizedValue(agreement.startDate),
      endDate: localizedValue(agreement.endDate),
      holdback: localizedValue(agreement.holdback),
      holdbackBasis: localizedValue(localized({ en: agreement.holdbackBasisEn, fr: agreement.holdbackBasisFr })),
      holdbackBasisCode: localizedValue(agreement.holdbackBasisCode),
      holdbackAmount: formatLegacyDec041HoldbackMoney(holdbackAmount, language)
    },
    agency: { name: localizedValue(localized({ en: agreement.agencyNameEn, fr: agreement.agencyNameFr })) },
    department: {
      name: 'Health Canada',
      legalName: 'His Majesty the King in Right of Canada, as represented by the Minister of Health',
      address: '365 Laurier Avenue West\nOttawa, ON K1A 1L1\nCanada'
    },
    program: { name: localizedValue(localized({ en: agreement.programNameEn, fr: agreement.programNameFr })) },
    stream: { name: localizedValue(localized({ en: agreement.streamNameEn, fr: agreement.streamNameFr })) },
    recipient: {
      primary: {
        legalName: localizedValue(localized({ en: primaryRecipient?.legalNameEn, fr: primaryRecipient?.legalNameFr })),
        address: localizedAddress(primaryAddress)
      },
      all: recipients.map(recipient => ({ legalName: localizedValue(localized({ en: recipient.legalNameEn, fr: recipient.legalNameFr })) }))
    },
    budget: {
      years: budgetYearsWithDetails,
      fiscalYearCount: budgetYearsWithDetails.length,
      schedule2FirstYear: schedule2Years[0],
      schedule2AdditionalYears: schedule2Years.slice(1),
      schedule2SummaryYear1: budgetYearsWithDetails[0]?.display || getFallbackValue(language),
      schedule2SummaryYear2: budgetYearsWithDetails[1]?.display || getFallbackValue(language),
      schedule2SummaryRows,
      schedule2SummaryTotals,
      yearSummaries: budgetYearsWithDetails.map(year => ({
        display: year.display,
        totalAmountFormatted: year.totalAmountFormatted,
        programFundingFormatted: year.programFundingFormatted,
        otherFundingFormatted: year.otherFundingFormatted,
        programDeliveryFundingFormatted: year.programDeliveryFundingFormatted,
        administrativeFundingFormatted: year.administrativeFundingFormatted,
        capitalFundingFormatted: year.capitalFundingFormatted,
        totalContributionFormatted: year.totalContributionFormatted
      })),
      lineItems,
      totalProgramFunding: localizedMoney(totalProgramFunding),
      totalProgramDeliveryFunding: localizedMoney(totalProgramDeliveryFunding),
      totalAdministrativeFunding: localizedMoney(totalAdministrativeFunding),
      totalCapitalFunding: localizedMoney(totalCapitalFunding)
    },
    activities: activities.map(activity => {
      const responsibleParties = (activityResponsiblePartiesByActivityId.get(String(activity.id)) ?? []).map(party => ({
        name: localizedValue(localized({
          en: party.legalNameEn ?? party.operatingNameEn,
          fr: party.legalNameFr ?? party.operatingNameFr
        }))
      }))

      return {
        id: String(activity.id),
        name: localizedValue(localized({ en: activity.nameEn, fr: activity.nameFr })),
        description: localizedValue(localized({ en: activity.descriptionEn, fr: activity.descriptionFr })),
        expectedResults: localizedValue(localized({ en: activity.expectedResultsEn, fr: activity.expectedResultsFr })),
        startDate: localizedValue(activity.startDate),
        endDate: localizedValue(activity.endDate),
        responsibleParties,
        responsiblePartiesText: responsibleParties.map(party => party.name).join(', ') || getFallbackValue(language),
        outcomes: (activityOutcomesByActivityId.get(String(activity.id)) ?? []).map(outcome => ({
          name: localizedValue(localized({ en: outcome.nameEn, fr: outcome.nameFr })),
          description: localizedValue(localized({ en: outcome.descriptionEn, fr: outcome.descriptionFr }))
        }))
      }
    }),
    outcomes: [...expectedOutcomesById.values()],
    expectedOutcomes: [...expectedOutcomesById.values()],
    commitments,
    payments: payments.map(payment => ({
      ...payment,
      amount: parseDatabaseMoney(payment.amount),
      amountFormatted: localizedMoney(parseDatabaseMoney(payment.amount))
    })),
    claims,
    forecasts
  }

  if (!event) {
    return baseContext
  }

  const providers = event.context.documentGenerationContextProviders
  if (!Array.isArray(providers)) {
    return baseContext
  }

  let context: Record<string, unknown> = baseContext
  for (const provider of providers) {
    if (typeof provider !== 'function') {
      continue
    }
    const extensionContext = await (provider as DocumentGenerationContextProvider)({ agreementId, db, event })
    context = deepMergeContext(context, extensionContext)
  }

  return context
}

export const loadAgreementDocumentRenderInput = async (
  event: H3Event,
  agreementId: string,
  templateId: string,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  db: Kysely<Database>
) => {
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(templateId)) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }
  const template = await loadAgreementDocumentTemplate(agreementId, templateId, db)

  if (!template) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }

  if (!template.egcs_tp_outputformats.includes(outputFormat)) {
    return await badRequest(event, 'DOCUMENT_OUTPUT_NOT_ALLOWED', 'apiErrors.document_generation.output_not_allowed')
  }

  const coreContext = await buildAgreementDocumentContext(agreementId, db, undefined, language)
  return {
    agreementId, template, coreContext,
    coreContextHash: createHash('sha256').update(JSON.stringify(coreContext)).digest('hex')
  }
}

export const hydrateAgreementDocumentRenderInput = async (
  event: H3Event,
  snapshot: Awaited<ReturnType<typeof loadAgreementDocumentRenderInput>>,
  language: Language_Preference,
  db: Kysely<Database>
) => {
  const templateBytes = await readDocumentStoredFile(
    event, db, String(snapshot.template.agencyId), getLocalizedTemplateAttachment(snapshot.template, language)
  )
  let context = snapshot.coreContext
  const providers = event.context.documentGenerationContextProviders
  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (typeof provider !== 'function') continue
      const extensionContext = await (provider as DocumentGenerationContextProvider)({
        agreementId: snapshot.agreementId, db, event
      })
      context = deepMergeContext(context, extensionContext)
    }
  }
  return {
    ...snapshot,
    templateBytes,
    context,
    baseFilename: buildGeneratedDocumentBaseFilename(context, snapshot.template, snapshot.agreementId, language)
  }
}

export const renderAgreementDocumentInput = async (
  event: H3Event,
  input: Awaited<ReturnType<typeof hydrateAgreementDocumentRenderInput>>,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat
) => ({
  template: input.template,
  generated: await renderGeneratedAgreementDocument(
    event, input.template, input.templateBytes, input.context, language, outputFormat, input.baseFilename
  ),
  contextHash: createHash('sha256').update(JSON.stringify(input.context)).digest('hex')
})

export const prepareAgreementDocument = async (
  event: H3Event, agreementId: string, templateId: string, language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat, db: Kysely<Database>
) => await renderAgreementDocumentInput(
  event,
  await hydrateAgreementDocumentRenderInput(
    event,
    await loadAgreementDocumentRenderInput(event, agreementId, templateId, language, outputFormat, db),
    language,
    db
  ),
  language,
  outputFormat
)

export const persistPreparedAgreementDocument = async (
  db: Kysely<Database>, agreementId: string, templateId: string,
  prepared: Awaited<ReturnType<typeof prepareAgreementDocument>>,
  language: Language_Preference, outputFormat: TransferPaymentDocumentTemplateOutputFormat
): Promise<Selectable<FundingCaseAgreementGeneratedDocumentTable>> =>
  await persistGeneratedDocumentWithRollback(
    db, agreementId, templateId, prepared.template, prepared.generated, language, outputFormat
  )

export const generateAgreementDocument = async (
  event: H3Event, agreementId: string, templateId: string, language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat, db: Kysely<Database>
): Promise<Selectable<FundingCaseAgreementGeneratedDocumentTable>> => {
  const prepared = await prepareAgreementDocument(event, agreementId, templateId, language, outputFormat, db)
  return await persistPreparedAgreementDocument(db, agreementId, templateId, prepared, language, outputFormat)
}

const renderCloseoutDocument = async (
  event: H3Event,
  agreementId: string,
  closeoutId: string,
  templateId: string,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  db: Kysely<Database>
): Promise<{ generated: GeneratedAgreementDocument, template: TemplateRow }> => {
  const [template, closeout, readiness] = await Promise.all([
    loadAgreementDocumentTemplate(agreementId, templateId, db, 'fundingcaseagreementcloseout'),
    db.selectFrom('Funding_Case_Agreement_Closeout').selectAll()
      .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false).executeTakeFirst(),
    buildAgreementCloseoutReadiness(db, agreementId)
  ])
  if (!template) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  if (!closeout || !readiness) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  if (!template.egcs_tp_outputformats.includes(outputFormat)) {
    return await badRequest(event, 'DOCUMENT_OUTPUT_NOT_ALLOWED', 'apiErrors.document_generation.output_not_allowed')
  }

  const [templateBytes, agreementContext, latestSnapshot] = await Promise.all([
    readDocumentStoredFile(event, db, String(template.agencyId), getLocalizedTemplateAttachment(template, language)),
    buildAgreementDocumentContext(agreementId, db, event, language),
    db.selectFrom('Funding_Case_Agreement_Closeout_Snapshot').selectAll()
      .where('egcs_fc_closeout', '=', closeoutId).orderBy('egcs_fc_capturedat', 'desc').executeTakeFirst()
  ])
  const context = deepMergeContext(agreementContext, {
    closeout: {
      id: String(closeout.id),
      number: closeout.egcs_fc_closeoutnumber,
      status: closeout.egcs_fc_status,
      isOpen: closeout.egcs_fc_isopen,
      financial: readiness.financial,
      outstandingFollowups: readiness.outstandingFollowups,
      blockers: readiness.blockers.map(blocker => ({
        ...blocker,
        label: language === 'fra' ? blocker.labelFr : blocker.labelEn
      })),
      ready: readiness.ready,
      snapshot: latestSnapshot?.egcs_fc_packet ?? null,
      snapshotHash: latestSnapshot?.egcs_fc_canonicalhash ?? null
    }
  })
  const baseFilename = `${buildGeneratedDocumentBaseFilename(context, template, agreementId, language)}-closeout-${closeout.egcs_fc_closeoutnumber}`
  return {
    generated: await renderGeneratedAgreementDocument(event, template, templateBytes, context, language, outputFormat, baseFilename),
    template
  }
}

export const generateCloseoutDocument = async (
  event: H3Event,
  agreementId: string,
  closeoutId: string,
  templateId: string,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  db: Kysely<Database>
): Promise<Selectable<FundingCaseAgreementGeneratedDocumentTable>> => {
  const { generated, template } = await renderCloseoutDocument(event, agreementId, closeoutId, templateId, language, outputFormat, db)
  return await persistGeneratedDocumentWithRollback(
    db, agreementId, templateId, template, generated, language, outputFormat, closeoutId
  )
}

export const previewCloseoutDocument = async (
  event: H3Event,
  agreementId: string,
  closeoutId: string,
  templateId: string,
  language: Language_Preference,
  outputFormat: TransferPaymentDocumentTemplateOutputFormat,
  db: Kysely<Database>
): Promise<GeneratedAgreementDocument> => (await renderCloseoutDocument(
  event, agreementId, closeoutId, templateId, language, outputFormat, db
)).generated

const generatedDocumentListSelection = [
  'Funding_Case_Agreement_Generated_Document.id as id',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_closeout as egcs_fc_closeout',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_documenttemplate as egcs_fc_documenttemplate',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_generatedattachment as egcs_fc_generatedattachment',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_language as egcs_fc_language',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_name_en as egcs_fc_name_en',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_name_fr as egcs_fc_name_fr',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_outputformat as egcs_fc_outputformat',
  'Funding_Case_Agreement_Generated_Document.egcs_fc_generatedat as egcs_fc_generatedat',
  'Common_Attachment.egcs_cn_name_en as attachment_name_en',
  'Common_Attachment.egcs_cn_name_fr as attachment_name_fr',
  'Common_Attachment.egcs_cn_mimetype as attachment_mimetype',
  'Common_Attachment.egcs_cn_filesize as attachment_filesize'
] as const

const buildAgreementGeneratedDocumentListQuery = (
  agreementId: string,
  db: Kysely<Database>,
  closeoutId?: string
) => {
  const query = db
    .selectFrom('Funding_Case_Agreement_Generated_Document')
    .innerJoin('Common_Attachment', 'Common_Attachment.id', 'Funding_Case_Agreement_Generated_Document.egcs_fc_generatedattachment')
    .where('Funding_Case_Agreement_Generated_Document.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Generated_Document._deleted', '=', false)
    .where('Common_Attachment._deleted', '=', false)

  return closeoutId
    ? query.where('Funding_Case_Agreement_Generated_Document.egcs_fc_closeout', '=', closeoutId)
    : query.where('Funding_Case_Agreement_Generated_Document.egcs_fc_closeout', 'is', null)
}

export const listAgreementGeneratedDocumentPage = async (
  agreementId: string,
  db: Kysely<Database>,
  options: { page: number, limit: number, search?: string }
) => {
  const { page, limit, search } = options
  const offset = (page - 1) * limit
  let query = buildAgreementGeneratedDocumentListQuery(agreementId, db)

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Funding_Case_Agreement_Generated_Document.egcs_fc_name_en', 'ilike', pattern),
      eb('Funding_Case_Agreement_Generated_Document.egcs_fc_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, countResult] = await Promise.all([
    query
      .select([...generatedDocumentListSelection])
      .orderBy('Funding_Case_Agreement_Generated_Document.egcs_fc_generatedat', 'desc')
      .orderBy('Funding_Case_Agreement_Generated_Document.id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute(),
    query
      .select(eb => eb.fn.count('Funding_Case_Agreement_Generated_Document.id').as('total'))
      .executeTakeFirst()
  ])

  return { items, total: Number(countResult?.total ?? 0) }
}

export const listAgreementGeneratedDocuments = async (
  agreementId: string,
  db: Kysely<Database>,
  closeoutId?: string
) => {
  const query = buildAgreementGeneratedDocumentListQuery(agreementId, db, closeoutId)

  return await query
    .select([...generatedDocumentListSelection])
    .orderBy('Funding_Case_Agreement_Generated_Document.egcs_fc_generatedat', 'desc')
    .orderBy('Funding_Case_Agreement_Generated_Document.id', 'desc')
    .execute()
}

export const readAgreementGeneratedDocument = async (
  event: H3Event,
  agreementId: string,
  documentId: string,
  db: Kysely<Database>,
  closeoutId?: string
): Promise<GeneratedAgreementDocument> => {
  const document = await db
    .selectFrom('Funding_Case_Agreement_Generated_Document')
    .innerJoin('Common_Attachment', 'Common_Attachment.id', 'Funding_Case_Agreement_Generated_Document.egcs_fc_generatedattachment')
    .where('Funding_Case_Agreement_Generated_Document.id', '=', documentId)
    .where('Funding_Case_Agreement_Generated_Document.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Generated_Document._deleted', '=', false)
    .where('Common_Attachment._deleted', '=', false)
    .$if(Boolean(closeoutId), query => query.where('Funding_Case_Agreement_Generated_Document.egcs_fc_closeout', '=', closeoutId!))
    .$if(!closeoutId, query => query.where('Funding_Case_Agreement_Generated_Document.egcs_fc_closeout', 'is', null))
    .select([
      'Common_Attachment.egcs_cn_provider as egcs_cn_provider',
      'Common_Attachment.egcs_cn_providerobjectid as egcs_cn_providerobjectid',
      'Common_Attachment.egcs_cn_providerlocator as egcs_cn_providerlocator',
      'Common_Attachment.egcs_cn_attachmenttype as attachmentTypeId',
      'Common_Attachment.egcs_cn_filename as filename',
      'Common_Attachment.egcs_cn_mimetype as mimeType'
    ])
    .executeTakeFirst()

  if (!document) {
    return await notFound(event, 'DOCUMENT_NOT_FOUND', 'apiErrors.document_generation.document_not_found')
  }

  return {
    bytes: await readDocumentStoredFile(event, db, String((await db.selectFrom('Common_Attachment_Types').select('egcs_cn_agency').where('id', '=', document.attachmentTypeId).executeTakeFirstOrThrow()).egcs_cn_agency), document, 'generated-document', {
      entityType: closeoutId ? 'fundingcaseagreementcloseout' : 'fundingcaseagreement',
      entityId: closeoutId ?? agreementId
    }),
    filename: document.filename,
    mimeType: document.mimeType
  }
}
