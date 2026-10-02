/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Agreement-owned financial lock primitives are shared by protected writes and workflow execution. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { throwApiError } from './api-errors'
import { hasCorrectionSchema } from './correction-schema'

type DbClient = Kysely<Database> | Transaction<Database>

export class CorrectionFinancialLockError extends Error {
  readonly code = 'CORRECTION_FINANCIAL_LOCKED'
  constructor(readonly correctionId: string) {
    super('An open Correction holds this Agreement financial lock.')
  }
}

/** The caller holds the Agreement lock before reading its open Correction. */
export const assertAgreementCorrectionFinancialUnlocked = async (
  db: DbClient,
  agreementId: string,
  options: { correctionId?: string } = {}
): Promise<void> => {
  if (!await hasCorrectionSchema(db)) return
  const correction = await db.selectFrom('Funding_Case_Agreement_Correction')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_outcome', '=', 'open')
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (correction && String(correction.id) !== options.correctionId) {
    throw new CorrectionFinancialLockError(String(correction.id))
  }
}

export const assertAgreementCorrectionFinancialWriteAllowed = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  options: { correctionId?: string } = {}
): Promise<void> => {
  try {
    await assertAgreementCorrectionFinancialUnlocked(db, agreementId, options)
  } catch (error) {
    if (!(error instanceof CorrectionFinancialLockError)) throw error
    return await throwApiError(event, {
      statusCode: 409, code: error.code, key: 'apiErrors.correction.financial_locked'
    })
  }
}

export const correctionLocksEntityFinancialMutation = (entityType: Entity_Type | undefined): boolean =>
  entityType === 'fundingcasepayment'
  || entityType === 'fundingcaseagreementcommitment'
  || entityType === 'fundingcasejournalvoucher'
  || entityType === 'fundingcaseagreementcloseout'
