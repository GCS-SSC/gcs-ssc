/* eslint-disable jsdoc/require-jsdoc -- orchestration contracts are documented in architecture/amendment-documents.md. */
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database, Language_Preference } from '~~/shared/types/database'
import { authorizeAgreementResource } from './agreement'
import { assertAgreementAmendmentExists } from './agreement-amendment'
import { notFound } from './api-errors'
import { buildAgreementDocumentContext } from './document-generation'
import { valueOrFallback } from './document-rendering'

export const authorizeAmendmentDocumentResource = async (
  event: H3Event, db: Kysely<Database>, agreementId: string, amendmentId: string,
  action: 'read' | 'create' | 'delete'
) => {
  // The generated packet includes parent business data; an exact child assignment does not grant parent reads.
  const parent = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
  if (!parent) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const context = await authorizeAgreementResource(event, action, agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }, freshAuth: true
  })
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
  return context
}

export const buildAmendmentDocumentContext = async (
  event: H3Event, db: Kysely<Database>, agreementId: string, amendmentId: string, language: Language_Preference
): Promise<Record<string, unknown>> => {
  const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
  const [agreementContext, types, subtypes, budgetVersion, activityVersion] = await Promise.all([
    buildAgreementDocumentContext(agreementId, db, undefined, language),
    db.selectFrom('Funding_Case_Agreement_Amendment_Type')
      .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
      .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', '=', amendmentId)
      .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
      .select(['Transfer_Payment_Amendment_Type.id', 'egcs_tp_amended', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
      .orderBy('Transfer_Payment_Amendment_Type.id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Amendment_Subtype')
      .innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendmentsubtype')
      .where('Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendment', '=', amendmentId)
      .where('Funding_Case_Agreement_Amendment_Subtype._deleted', '=', false)
      .select(['Transfer_Payment_Amendment_Subtype.id', 'egcs_tp_name_en', 'egcs_tp_name_fr', 'egcs_tp_description_en', 'egcs_tp_description_fr'])
      .orderBy('Transfer_Payment_Amendment_Subtype.id', 'asc').execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Version').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false).executeTakeFirst(),
    db.selectFrom('Funding_Case_Agreement_Activity_Version').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false).executeTakeFirst()
  ])
  const proposedContext = budgetVersion || activityVersion
    ? await buildAgreementDocumentContext(agreementId, db, undefined, language, {
        budgetVersionId: budgetVersion ? String(budgetVersion.id) : undefined,
        activityVersionId: activityVersion ? String(activityVersion.id) : undefined
      })
    : agreementContext
  const localized = (en: unknown, fr: unknown) => valueOrFallback(language === 'fra' ? fr : en, language)
  const dateValue = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null
  return {
    ...agreementContext,
    amendment: {
      id: String(amendment.id),
      number: amendment.egcs_fc_amendmentnumber,
      name: localized(amendment.egcs_fc_name_en, amendment.egcs_fc_name_fr),
      status: String(amendment.egcs_fc_status),
      isOpen: amendment.egcs_fc_isopen,
      types: types.map(type => ({ id: String(type.id), amended: type.egcs_tp_amended,
        name: localized(type.egcs_tp_name_en, type.egcs_tp_name_fr) })),
      subtypes: subtypes.map(subtype => ({ id: String(subtype.id),
        name: localized(subtype.egcs_tp_name_en, subtype.egcs_tp_name_fr), description: localized(subtype.egcs_tp_description_en, subtype.egcs_tp_description_fr) })),
      typeIds: types.map(type => String(type.id)),
      subtypeIds: subtypes.map(subtype => String(subtype.id)),
      proposedStartDate: dateValue(amendment.egcs_fc_proposedauthorizedassistancestartdate),
      proposedEndDate: dateValue(amendment.egcs_fc_proposedauthorizedassistanceenddate),
      hasBudgetSnapshot: Boolean(budgetVersion),
      hasActivitySnapshot: Boolean(activityVersion),
      budget: proposedContext.budget,
      activities: proposedContext.activities,
      outcomes: proposedContext.outcomes,
      expectedOutcomes: proposedContext.expectedOutcomes
    }
  }
}

export const amendmentDocumentContextHash = (context: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(context)).digest('hex')

export const amendmentDocumentFilenameSuffix = (context: Record<string, unknown>, amendmentId: string): string => {
  const amendment = context.amendment
  const number = amendment && typeof amendment === 'object' && 'number' in amendment ? amendment.number : null
  return `amendment-${typeof number === 'number' && Number.isFinite(number) ? number : amendmentId}`
}
