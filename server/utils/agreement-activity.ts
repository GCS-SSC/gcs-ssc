/* eslint-disable jsdoc/require-jsdoc -- Agreement activity helpers expose typed contracts covered by route tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction, Updateable } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { FundingCaseAgreementActivityPatchSchema } from '~~/shared/types/schemas'
import type { Database, FundingCaseAgreementActivityTable } from '~~/shared/types/database'
import type { FundingCaseAgreementActivityPatch } from '~~/shared/types/schemas'

type AgreementDb = Kysely<Database> | Transaction<Database>

export type AgreementActivityOutcomeTag = {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

export type AgreementActivityResponsiblePartyTag = {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

const normalizeIds = (ids: string[]) => Array.from(new Set(ids.map(id => String(id))))
const hasKey = <TKey extends string>(
  value: unknown,
  key: TKey
): value is Record<TKey, unknown> => value !== null && typeof value === 'object' && key in value

export const validateAgreementOutcomeSelectionIds = async (
  db: AgreementDb,
  transferPaymentProfileId: string,
  outcomeIds: string[]
): Promise<AgreementActivityOutcomeTag[] | null> => {
  const normalizedOutcomeIds = normalizeIds(outcomeIds)
  if (normalizedOutcomeIds.length === 0) {
    return []
  }

  const items = await db
    .selectFrom('Transfer_Payment_Outcome')
    .where('Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile', '=', transferPaymentProfileId)
    .where('Transfer_Payment_Outcome.id', 'in', normalizedOutcomeIds)
    .where('Transfer_Payment_Outcome._deleted', '=', false)
    .select([
      'Transfer_Payment_Outcome.id as id',
      'Transfer_Payment_Outcome.egcs_tp_name_en as label_en',
      'Transfer_Payment_Outcome.egcs_tp_name_fr as label_fr'
    ])
    .forUpdate('Transfer_Payment_Outcome')
    .execute()

  if (items.length !== normalizedOutcomeIds.length) {
    return null
  }

  const itemsById = new Map(items.map(item => [String(item.id), item]))

  return normalizedOutcomeIds.map(id => itemsById.get(id)!).filter(Boolean)
}

export const getAgreementActivityOutcomeTags = async (
  db: AgreementDb,
  activityIds: string[]
): Promise<Map<string, AgreementActivityOutcomeTag[]>> => {
  const normalizedActivityIds = normalizeIds(activityIds)
  const tagsByActivityId = new Map<string, AgreementActivityOutcomeTag[]>()

  if (normalizedActivityIds.length === 0) {
    return tagsByActivityId
  }

  const rows = await db
    .selectFrom('Funding_Case_Agreement_Outcome_Activity')
    .innerJoin(
      'Transfer_Payment_Outcome',
      'Transfer_Payment_Outcome.id',
      'Funding_Case_Agreement_Outcome_Activity.egcs_fc_outcomes'
    )
    .where('Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity', 'in', normalizedActivityIds)
    .where('Funding_Case_Agreement_Outcome_Activity._deleted', '=', false)
    .where('Transfer_Payment_Outcome._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity as activity_id',
      'Transfer_Payment_Outcome.id as id',
      'Transfer_Payment_Outcome.egcs_tp_name_en as label_en',
      'Transfer_Payment_Outcome.egcs_tp_name_fr as label_fr'
    ])
    .orderBy('Funding_Case_Agreement_Outcome_Activity.id', 'asc')
    .execute()

  for (const row of rows) {
    const activityId = String(row.activity_id)
    const existing = tagsByActivityId.get(activityId) ?? []

    existing.push({
      id: String(row.id),
      label_en: row.label_en,
      label_fr: row.label_fr
    })

    tagsByActivityId.set(activityId, existing)
  }

  return tagsByActivityId
}

export const syncAgreementActivityOutcomeSelections = async (
  db: AgreementDb,
  activityId: string,
  outcomeIds: string[]
): Promise<void> => {
  const normalizedOutcomeIds = normalizeIds(outcomeIds)
  const selectedOutcomeIds = new Set(normalizedOutcomeIds)

  const existingRows = await db
    .selectFrom('Funding_Case_Agreement_Outcome_Activity')
    .where('egcs_fc_activity', '=', activityId)
    .select(['id', 'egcs_fc_outcomes', '_deleted'])
    .execute()

  const rowsToRestore = existingRows
    .filter(row => row._deleted === true && selectedOutcomeIds.has(String(row.egcs_fc_outcomes)))
    .map(row => String(row.id))
  const rowsToDelete = existingRows
    .filter(row => row._deleted === false && !selectedOutcomeIds.has(String(row.egcs_fc_outcomes)))
    .map(row => String(row.id))
  const existingOutcomeIds = new Set(existingRows.map(row => String(row.egcs_fc_outcomes)))
  const rowsToInsert = normalizedOutcomeIds.filter(outcomeId => !existingOutcomeIds.has(outcomeId))

  if (rowsToRestore.length > 0) {
    await db
      .updateTable('Funding_Case_Agreement_Outcome_Activity')
      .set({ _deleted: false })
      .where('id', 'in', rowsToRestore)
      .execute()
  }

  if (rowsToDelete.length > 0) {
    await db
      .updateTable('Funding_Case_Agreement_Outcome_Activity')
      .set({ _deleted: true })
      .where('id', 'in', rowsToDelete)
      .execute()
  }

  if (rowsToInsert.length > 0) {
    await db
      .insertInto('Funding_Case_Agreement_Outcome_Activity')
      .values(rowsToInsert.map(outcomeId => ({
        egcs_fc_outcomes: outcomeId,
        egcs_fc_activity: activityId
      })))
      .execute()
  }
}

export const validateAgreementResponsiblePartySelectionIds = async (
  db: AgreementDb,
  agreementId: string,
  responsiblePartyIds: string[]
): Promise<AgreementActivityResponsiblePartyTag[] | null> => {
  const normalizedResponsiblePartyIds = normalizeIds(responsiblePartyIds)
  if (normalizedResponsiblePartyIds.length === 0) {
    return []
  }

  const items = await db
    .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .innerJoin(
      'Applicant_Recipient_Profile',
      'Applicant_Recipient_Profile.id',
      'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient'
    )
    .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Applicant_Recipient.id', 'in', normalizedResponsiblePartyIds)
    .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Applicant_Recipient.id as id',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as legal_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as legal_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_en as operating_name_en',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as operating_name_fr'
    ])
    .execute()

  if (items.length !== normalizedResponsiblePartyIds.length) {
    return null
  }

  const itemsById = new Map(items.map(item => [
    String(item.id),
    {
      id: String(item.id),
      label_en: item.legal_name_en ?? item.operating_name_en,
      label_fr: item.legal_name_fr ?? item.operating_name_fr
    }
  ]))

  return normalizedResponsiblePartyIds.map(id => itemsById.get(id)!).filter(Boolean)
}

export const getAgreementActivityResponsiblePartyTags = async (
  db: AgreementDb,
  activityIds: string[]
): Promise<Map<string, AgreementActivityResponsiblePartyTag[]>> => {
  const normalizedActivityIds = normalizeIds(activityIds)
  const tagsByActivityId = new Map<string, AgreementActivityResponsiblePartyTag[]>()

  if (normalizedActivityIds.length === 0) {
    return tagsByActivityId
  }

  const rows = await db
    .selectFrom('Funding_Case_Agreement_Responsible_Party_Activity')
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
    .where('Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity', 'in', normalizedActivityIds)
    .where('Funding_Case_Agreement_Responsible_Party_Activity._deleted', '=', false)
    .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity as activity_id',
      'Funding_Case_Agreement_Applicant_Recipient.id as id',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as legal_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as legal_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_en as operating_name_en',
      'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as operating_name_fr'
    ])
    .orderBy('Funding_Case_Agreement_Responsible_Party_Activity.id', 'asc')
    .execute()

  for (const row of rows) {
    const activityId = String(row.activity_id)
    const existing = tagsByActivityId.get(activityId) ?? []

    existing.push({
      id: String(row.id),
      label_en: row.legal_name_en ?? row.operating_name_en,
      label_fr: row.legal_name_fr ?? row.operating_name_fr
    })

    tagsByActivityId.set(activityId, existing)
  }

  return tagsByActivityId
}

export const syncAgreementActivityResponsiblePartySelections = async (
  db: AgreementDb,
  activityId: string,
  responsiblePartyIds: string[]
): Promise<void> => {
  const normalizedResponsiblePartyIds = normalizeIds(responsiblePartyIds)
  const selectedResponsiblePartyIds = new Set(normalizedResponsiblePartyIds)

  const existingRows = await db
    .selectFrom('Funding_Case_Agreement_Responsible_Party_Activity')
    .where('egcs_fc_activity', '=', activityId)
    .select(['id', 'egcs_fc_responsibleparty', '_deleted'])
    .execute()

  const rowsToRestore = existingRows
    .filter(row => row._deleted === true && selectedResponsiblePartyIds.has(String(row.egcs_fc_responsibleparty)))
    .map(row => String(row.id))
  const rowsToDelete = existingRows
    .filter(row => row._deleted === false && !selectedResponsiblePartyIds.has(String(row.egcs_fc_responsibleparty)))
    .map(row => String(row.id))
  const existingResponsiblePartyIds = new Set(existingRows.map(row => String(row.egcs_fc_responsibleparty)))
  const rowsToInsert = normalizedResponsiblePartyIds.filter(responsiblePartyId => !existingResponsiblePartyIds.has(responsiblePartyId))

  if (rowsToRestore.length > 0) {
    await db
      .updateTable('Funding_Case_Agreement_Responsible_Party_Activity')
      .set({ _deleted: false })
      .where('id', 'in', rowsToRestore)
      .execute()
  }

  if (rowsToDelete.length > 0) {
    await db
      .updateTable('Funding_Case_Agreement_Responsible_Party_Activity')
      .set({ _deleted: true })
      .where('id', 'in', rowsToDelete)
      .execute()
  }

  if (rowsToInsert.length > 0) {
    await db
      .insertInto('Funding_Case_Agreement_Responsible_Party_Activity')
      .values(rowsToInsert.map(responsiblePartyId => ({
        egcs_fc_responsibleparty: responsiblePartyId,
        egcs_fc_activity: activityId
      })))
      .execute()
  }
}

const readAgreementActivityPatchBody = async (event: H3Event) => {
  return await readValidatedBodyI18n(event, FundingCaseAgreementActivityPatchSchema)
}

const loadAgreementActivityRowSnapshot = async (
  db: Kysely<Database>,
  agreementId: string,
  activityId: string
) => {
  const row = await db
    .selectFrom('Funding_Case_Agreement_Activity')
    .innerJoin(
      'Funding_Case_Agreement_Activity_Version',
      'Funding_Case_Agreement_Activity_Version.id',
      'Funding_Case_Agreement_Activity.egcs_fc_activityversion'
    )
    .where('Funding_Case_Agreement_Activity.id', '=', activityId)
    .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Activity._deleted', '=', false)
    .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Activity.id as id',
      'Funding_Case_Agreement_Activity.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
      'Funding_Case_Agreement_Activity.egcs_fc_name_en as egcs_fc_name_en',
      'Funding_Case_Agreement_Activity.egcs_fc_name_fr as egcs_fc_name_fr',
      'Funding_Case_Agreement_Activity.egcs_fc_description_en as egcs_fc_description_en',
      'Funding_Case_Agreement_Activity.egcs_fc_description_fr as egcs_fc_description_fr',
      'Funding_Case_Agreement_Activity.egcs_fc_expectedresults_en as egcs_fc_expectedresults_en',
      'Funding_Case_Agreement_Activity.egcs_fc_expectedresults_fr as egcs_fc_expectedresults_fr',
      'Funding_Case_Agreement_Activity.egcs_fc_startdate as egcs_fc_startdate',
      'Funding_Case_Agreement_Activity.egcs_fc_enddate as egcs_fc_enddate'
    ])
    .executeTakeFirstOrThrow()

  const [outcomesByActivityId, responsiblePartiesByActivityId] = await Promise.all([
    getAgreementActivityOutcomeTags(db, [activityId]),
    getAgreementActivityResponsiblePartyTags(db, [activityId])
  ])
  const outcomes = outcomesByActivityId.get(activityId) ?? []
  const responsibleParties = responsiblePartiesByActivityId.get(activityId) ?? []

  return {
    ...row,
    outcome_ids: outcomes.map(outcome => outcome.id),
    responsible_party_ids: responsibleParties.map(responsibleParty => responsibleParty.id),
    outcomes,
    responsible_parties: responsibleParties
  }
}

export const loadAgreementActivityRow = async (
  db: Kysely<Database>,
  agreementId: string,
  activityId: string
) => db.isTransaction
  ? await loadAgreementActivityRowSnapshot(db, agreementId, activityId)
  : await db.transaction().setIsolationLevel('repeatable read').execute(async trx =>
      await loadAgreementActivityRowSnapshot(trx, agreementId, activityId))

const assertAgreementActivityExists = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  activityId: string
) => await assertAgreementChildExists(
  event,
  db
    .selectFrom('Funding_Case_Agreement_Activity')
    .innerJoin(
      'Funding_Case_Agreement_Activity_Version',
      'Funding_Case_Agreement_Activity_Version.id',
      'Funding_Case_Agreement_Activity.egcs_fc_activityversion'
    )
    .where('Funding_Case_Agreement_Activity.id', '=', activityId)
    .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Activity._deleted', '=', false)
    .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
    .select('Funding_Case_Agreement_Activity.id as id')
    .executeTakeFirst(),
  ...AGREEMENT_CHILD_ERROR_KEYS.activityNotFound
)

const validateAgreementActivityPatchSelections = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  transferPaymentProfileId: string,
  validated: FundingCaseAgreementActivityPatch
) => {
  if (Object.hasOwn(validated, 'outcome_ids')) {
    const selectedOutcomes = await validateAgreementOutcomeSelectionIds(
      db,
      transferPaymentProfileId,
      validated.outcome_ids ?? []
    )

    if (!selectedOutcomes) {
      return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_OUTCOME', 'apiErrors.agreement.invalid_activity_outcome')
    }
  }

  if (Object.hasOwn(validated, 'responsible_party_ids')) {
    const selectedResponsibleParties = await validateAgreementResponsiblePartySelectionIds(
      db,
      agreementId,
      validated.responsible_party_ids ?? []
    )

    if (!selectedResponsibleParties) {
      return await badRequest(event, 'INVALID_AGREEMENT_ACTIVITY_RESPONSIBLE_PARTY', 'apiErrors.agreement.invalid_activity_responsible_party')
    }
  }

  return null
}

const mapAgreementActivityPatchValues = (
  validated: FundingCaseAgreementActivityPatch
): Partial<Updateable<FundingCaseAgreementActivityTable>> => {
  const {
    outcome_ids: _outcomeIds,
    responsible_party_ids: _responsiblePartyIds,
    ...patchValues
  } = validated

  return patchValues
}

export const patchAgreementActivity = async (
  event: H3Event,
  db: AgreementDb,
  agreementId: string,
  transferPaymentProfileId: string,
  activityId: string
) => {
  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!hasKey(agreement, 'id')) {
    return agreement
  }

  const existing = await assertAgreementActivityExists(event, db, agreementId, activityId)
  if (!hasKey(existing, 'id')) {
    return existing
  }

  const validated = await readAgreementActivityPatchBody(event)
  if (Object.keys(validated).length === 0) {
    return await loadAgreementActivityRow(db, agreementId, activityId)
  }

  const selectionError = await validateAgreementActivityPatchSelections(
    event,
    db,
    agreementId,
    transferPaymentProfileId,
    validated
  )
  if (selectionError) {
    return selectionError
  }

  const activityPatchValues = mapAgreementActivityPatchValues(validated)
  if (Object.keys(activityPatchValues).length > 0) {
    await db
      .updateTable('Funding_Case_Agreement_Activity')
      .set(activityPatchValues)
      .where('id', '=', activityId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
  }

  if (Object.hasOwn(validated, 'outcome_ids')) {
    await syncAgreementActivityOutcomeSelections(db, activityId, validated.outcome_ids ?? [])
  }

  if (Object.hasOwn(validated, 'responsible_party_ids')) {
    await syncAgreementActivityResponsiblePartySelections(db, activityId, validated.responsible_party_ids ?? [])
  }

  return await loadAgreementActivityRow(db, agreementId, activityId)
}
