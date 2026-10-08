/* eslint-disable jsdoc/require-jsdoc -- Typed coordination shared by questionnaire runtime adapters. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'

type RuntimeQuestionnaireRecord = {
  revision: number
  state: string
}

type RuntimeQuestionnaireError = { code: string, key: string }

export type QuestionnaireRuntimeSaveAdapter<Record extends RuntimeQuestionnaireRecord, Response, Persisted, Submitted = Persisted> = {
  load: (trx: Transaction<Database>) => Promise<Record | null | undefined>
  validate: (record: Record, responses: Response[], submit: boolean) => RuntimeQuestionnaireError | null
  persist: (trx: Transaction<Database>, record: Record, responses: Response[], nextRevision: number, submit: boolean) => Promise<Persisted>
  submit: (trx: Transaction<Database>, record: Record, updated: Persisted) => Promise<Submitted>
  missing: RuntimeQuestionnaireError
  conflict: RuntimeQuestionnaireError
}

export const saveQuestionnaireRuntimeInTransaction = async <Record extends RuntimeQuestionnaireRecord, Response, Persisted, Submitted>(
  event: H3Event,
  trx: Transaction<Database>,
  input: {
    responses: Response[]
    submit: boolean
    expectedRevision?: number
    adapter: QuestionnaireRuntimeSaveAdapter<Record, Response, Persisted, Submitted>
  }
): Promise<Persisted | Submitted> => {
  const record = await input.adapter.load(trx)
  if (!record) return await notFound(event, input.adapter.missing.code, input.adapter.missing.key)
  if (input.expectedRevision !== undefined && record.revision !== input.expectedRevision) {
    return await throwApiError(event, { statusCode: 409, ...input.adapter.conflict })
  }
  if (record.state !== 'active') return await forbidden(event)
  const invalid = input.adapter.validate(record, input.responses, input.submit)
  if (invalid) return await badRequest(event, invalid.code, invalid.key)
  const updated = await input.adapter.persist(trx, record, input.responses, record.revision + 1, input.submit)
  return input.submit ? await input.adapter.submit(trx, record, updated) : updated
}
