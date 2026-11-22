/* eslint-disable jsdoc/require-jsdoc -- import transaction and report formats are specified by their types. */
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import type { Transaction } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import {
  PortableAuthoringImportReportSchema,
  type PortableAuthoringImportOptions,
  type PortableAuthoringImportReport,
  type PortableAuthoringSchema
} from '~~/shared/utils/portable-authoring-schema'
import { parseI18n, readValidatedBodyI18n } from './api-validate'
import { requireAuthContext } from './authorize'
import { throwApiError } from './api-errors'
import { throwIfMappedConstraintError } from './database-constraint-errors'

type ImportOptions = z.infer<typeof PortableAuthoringImportOptions>
type ImportInput<T extends PortableAuthoringSchema> = {
  portable: T
  importOptions: ImportOptions
}
type ReferenceRemoval = PortableAuthoringImportReport['removed'][number]
const receiptSchema = z.strictObject({
  requestId: z.uuid(),
  agencyId: z.string(),
  actorId: z.string(),
  fingerprint: z.string(),
  importedAt: z.string(),
  report: PortableAuthoringImportReportSchema
})

export const withPortableAuthoringImport = async <TDefinition extends PortableAuthoringSchema, TResult extends { id: string }>(
  event: H3Event,
  trx: Transaction<Database>,
  agencyId: string,
  { portable, importOptions }: ImportInput<TDefinition>,
  prepare: (definition: TDefinition, removed: ReferenceRemoval[]) => Promise<TDefinition>,
  create: (prepared: TDefinition) => Promise<TResult>
): Promise<{ importReport: PortableAuthoringImportReport }> => {
  const { userId } = await requireAuthContext(event)
  const { requestId, confirmedRemovals, notices } = importOptions
  const fingerprint = createHash('sha256').update(JSON.stringify({ portable, notices })).digest('hex')
  const replay = await trx.selectFrom('Common_Publication')
    .select(['egcs_cn_authoringimport', '_deleted'])
    .where(sql<string>`egcs_cn_authoringimport ->> 'agencyId'`, '=', agencyId)
    .where(sql<string>`egcs_cn_authoringimport ->> 'requestId'`, '=', requestId)
    .executeTakeFirst()
  if (replay) {
    const previous = receiptSchema.parse(replay.egcs_cn_authoringimport)
    if (previous.actorId !== userId || previous.fingerprint !== fingerprint || replay._deleted) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'AUTHORING_IMPORT_REQUEST_CONFLICT',
        key: 'apiErrors.request.invalid_resource'
      })
    }
    return { importReport: previous.report }
  }

  const removed: ReferenceRemoval[] = []
  const prepared = await prepare(portable, removed)
  const confirmed = new Set(confirmedRemovals.map(item => JSON.stringify(item)))
  if (removed.some(item => !confirmed.has(JSON.stringify(item)))) {
    return await throwApiError(event, {
      statusCode: 422,
      code: 'AUTHORING_IMPORT_MISSING_REFERENCES',
      key: 'portable_authoring.missing_references',
      details: removed.map(item => ({ path: item.path, message: item.reference }))
    })
  }

  const duplicateName = { code: 'AUTHORING_IMPORT_DUPLICATE_NAME', key: 'portable_authoring.duplicate_name' }
  const result = await create(prepared).catch(async error => await throwIfMappedConstraintError(event, error, ['23505'], {
    cn_idx_reviewschemaagencynametypeen: duplicateName,
    cn_idx_reviewschemaagencynametypefr: duplicateName,
    cn_idx_recommendationschemaagencynameen: duplicateName,
    cn_idx_recommendationschemaagencynamefr: duplicateName,
    cn_idx_approvaltemplateagencynameen: duplicateName,
    cn_idx_approvaltemplateagencynamefr: duplicateName
  }))
  const report = { id: result.id, removed, notices }
  const metadata = {
    requestId,
    agencyId,
    actorId: userId,
    fingerprint,
    importedAt: new Date().toISOString(),
    report
  }
  await trx.updateTable('Common_Publication').set({ egcs_cn_authoringimport: metadata })
    .where('id', '=', result.id).executeTakeFirst()
  return { importReport: report }
}

export const readPortableAuthoringCreate = async <TNormal extends z.ZodType, TPortable extends z.ZodType>(
  event: H3Event,
  normal: TNormal,
  portable: TPortable
): Promise<z.infer<TNormal> | z.infer<TPortable>> => {
  const input = await readValidatedBodyI18n(event, z.unknown())
  if (input && typeof input === 'object' && 'portable' in input) return await parseI18n(event, portable, input)
  return await parseI18n(event, normal, input)
}
