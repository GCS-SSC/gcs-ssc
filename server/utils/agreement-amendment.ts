/* eslint-disable jsdoc/require-jsdoc -- Amendment domain helpers are named for their route and lifecycle use. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { agreementBudgetFiscalYearsOverlapDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import type { Amended_Type, Database } from '~~/shared/types/database'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import type { StatusId } from '~~/shared/types/status'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

type AmendmentDb = Kysely<Database> | Transaction<Database>

export const isAgreementAmendable = async (
  db: AmendmentDb,
  agreementId: string
): Promise<boolean> => {
  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseagreement', agreementId)
  return Boolean(protection && !protection.locked && !protection.isDraft)
}

export const assertAgreementAmendable = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string
): Promise<void> => {
  if (!await isAgreementAmendable(db, agreementId)) {
    return await badRequest(event, 'AGREEMENT_NOT_AMENDABLE', 'apiErrors.request.invalid_status')
  }
}

export type AgreementAmendmentRuntimeContext = {
  amendmentId: string
  amendmentStatus: StatusId
  agreementId: string
  streamId: string
  agencyId: string
}

export const resolveAgreementAmendmentRuntimeContext = async (
  db: AmendmentDb,
  amendmentId: string
): Promise<AgreementAmendmentRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(amendmentId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Amendment')
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Amendment.egcs_fc_fundingagreement'
    )
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .select([
      'Funding_Case_Agreement_Amendment.id as amendment_id',
      'Funding_Case_Agreement_Amendment.egcs_fc_status as amendment_status',
      'Funding_Case_Agreement_Amendment.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Amendment.id', '=', amendmentId)
    .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row) return null

  return {
    amendmentId: String(row.amendment_id),
    amendmentStatus: row.amendment_status,
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id)
  }
}

export const assertAgreementAmendmentExists = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string
) => {
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(amendmentId)) {
    return await notFound(event, 'AGREEMENT_AMENDMENT_NOT_FOUND', 'apiErrors.agreement.amendment_not_found')
  }
  const amendment = await db
    .selectFrom('Funding_Case_Agreement_Amendment')
    .selectAll()
    .where('id', '=', amendmentId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!amendment) {
    return await notFound(event, 'AGREEMENT_AMENDMENT_NOT_FOUND', 'apiErrors.agreement.amendment_not_found')
  }
  return amendment
}

export const assertDraftAgreementAmendment = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string
) => {
  const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
  if (!('id' in amendment)) return amendment
  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseamendment', amendmentId)
  if (!protection?.isDraft) {
    return await badRequest(event, 'AGREEMENT_AMENDMENT_INVALID_STATUS', 'apiErrors.request.invalid_status')
  }
  await assertAgreementAmendable(event, db, agreementId)
  return amendment
}

export const assertEditableAgreementAmendment = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string
) => {
  const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
  if (!('id' in amendment)) return amendment
  if (!amendment.egcs_fc_isopen) {
    return await badRequest(event, 'AGREEMENT_AMENDMENT_INVALID_STATUS', 'apiErrors.request.invalid_status')
  }
  return amendment
}

export const assertDraftAgreementAmendmentCapability = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string,
  capabilities: Amended_Type[]
) => {
  const amendment = await assertDraftAgreementAmendment(event, db, agreementId, amendmentId)
  if (!('id' in amendment)) return amendment
  const capability = await db.selectFrom('Funding_Case_Agreement_Amendment_Type')
    .innerJoin('Transfer_Payment_Amendment_Type', 'Transfer_Payment_Amendment_Type.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype')
    .select('Transfer_Payment_Amendment_Type.egcs_tp_amended')
    .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment', '=', amendmentId)
    .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
    .where('Transfer_Payment_Amendment_Type._deleted', '=', false)
    .where('Transfer_Payment_Amendment_Type.egcs_tp_amended', 'in', capabilities)
    .executeTakeFirst()
  if (!capability) {
    return await badRequest(event, 'AGREEMENT_AMENDMENT_CAPABILITY_REQUIRED', 'apiErrors.agreement.amendment_capability_required')
  }
  return amendment
}

export const resolveDraftAgreementAmendmentBudgetVersion = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string
) => {
  const amendment = await assertDraftAgreementAmendment(event, db, agreementId, amendmentId)
  if (!('id' in amendment)) return amendment
  return await resolveAgreementAmendmentBudgetVersion(event, db, agreementId, amendmentId, false)
}

export const resolveAgreementAmendmentBudgetVersion = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string,
  assertExists = true
) => {
  if (assertExists) {
    const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
  }
  const version = await db
    .selectFrom('Funding_Case_Agreement_Budget_Version')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_amendment', '=', amendmentId)
    .where('egcs_fc_iscurrent', '=', false)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!version) {
    return await notFound(event, 'AGREEMENT_AMENDMENT_BUDGET_SNAPSHOT_NOT_FOUND', 'apiErrors.agreement.amendment_budget_snapshot_not_found')
  }
  return String(version.id)
}

export const resolveDraftAgreementAmendmentActivityVersion = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string
) => {
  const amendment = await assertDraftAgreementAmendment(event, db, agreementId, amendmentId)
  if (!('id' in amendment)) return amendment
  return await resolveAgreementAmendmentActivityVersion(event, db, agreementId, amendmentId, false)
}

export const resolveAgreementAmendmentActivityVersion = async (
  event: H3Event,
  db: AmendmentDb,
  agreementId: string,
  amendmentId: string,
  assertExists = true
) => {
  if (assertExists) {
    const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
  }
  const version = await db
    .selectFrom('Funding_Case_Agreement_Activity_Version')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_amendment', '=', amendmentId)
    .where('egcs_fc_iscurrent', '=', false)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!version) {
    return await notFound(event, 'AGREEMENT_AMENDMENT_ACTIVITY_SNAPSHOT_NOT_FOUND', 'apiErrors.agreement.amendment_activity_snapshot_not_found')
  }
  return String(version.id)
}

export const createAgreementAmendmentBudgetSnapshot = async (
  trx: Transaction<Database>,
  agreementId: string,
  amendmentId: string
) => {
  const currentVersion = await trx
    .selectFrom('Funding_Case_Agreement_Budget_Version')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_iscurrent', '=', true)
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
  const snapshot = await trx
    .insertInto('Funding_Case_Agreement_Budget_Version')
    .values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_amendment: amendmentId,
      egcs_fc_sourceversion: String(currentVersion.id),
      egcs_fc_iscurrent: false,
      _deleted: false
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await cloneBudgetVersionRows(trx, String(currentVersion.id), String(snapshot.id), agreementId)
  return String(snapshot.id)
}

export const createAgreementAmendmentActivitySnapshot = async (
  trx: Transaction<Database>,
  agreementId: string,
  amendmentId: string
) => {
  const currentVersion = await trx
    .selectFrom('Funding_Case_Agreement_Activity_Version')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_iscurrent', '=', true)
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
  const snapshot = await trx
    .insertInto('Funding_Case_Agreement_Activity_Version')
    .values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_amendment: amendmentId,
      egcs_fc_sourceversion: String(currentVersion.id),
      egcs_fc_iscurrent: false,
      _deleted: false
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await cloneActivityVersionRows(trx, String(currentVersion.id), String(snapshot.id), agreementId)
  return String(snapshot.id)
}

const cloneBudgetVersionRows = async (
  trx: Transaction<Database>,
  sourceVersionId: string,
  targetVersionId: string,
  agreementId: string
) => {
  const years = await trx
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .selectAll()
    .where('egcs_fc_budgetversion', '=', sourceVersionId)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .execute()
  for (const year of years) {
    const clonedYear = await trx
      .insertInto('Funding_Case_Agreement_Budget_Fiscal_Year')
      .values({
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_budgetversion: targetVersionId,
        egcs_fc_originalbudgetfiscalyear: year.egcs_fc_originalbudgetfiscalyear ?? year.id,
        egcs_fc_fiscalyear: year.egcs_fc_fiscalyear,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const lines = await trx
      .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .select([
        'id', 'egcs_fc_originalbudgetlineitem', 'egcs_fc_organizationcostcategory',
        'egcs_fc_costsubsection', 'egcs_fc_description',
        databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        databaseMoneyText(sql.ref('egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
        databaseMoneyText(sql.ref('egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
        'egcs_fc_currency'
      ])
      .where('egcs_fc_fundingagreementbudgetfiscalyear', '=', String(year.id))
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .execute()
    if (lines.length > 0) {
      await trx.insertInto('Funding_Case_Agreement_Budget_Line_Item').values(lines.map(line => ({
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_fundingagreementbudgetfiscalyear: String(clonedYear.id),
        egcs_fc_originalbudgetlineitem: line.egcs_fc_originalbudgetlineitem ?? line.id,
        egcs_fc_organizationcostcategory: line.egcs_fc_organizationcostcategory,
        egcs_fc_costsubsection: line.egcs_fc_costsubsection,
        egcs_fc_description: line.egcs_fc_description,
        egcs_fc_totalamount: databaseMoneyValue(parseDatabaseMoney(line.egcs_fc_totalamount)),
        egcs_fc_programfunding: databaseMoneyValue(parseDatabaseMoney(line.egcs_fc_programfunding)),
        egcs_fc_otherfederalfunding: line.egcs_fc_otherfederalfunding === null ? null : databaseMoneyValue(parseDatabaseMoney(line.egcs_fc_otherfederalfunding)),
        egcs_fc_othergovfunding: line.egcs_fc_othergovfunding === null ? null : databaseMoneyValue(parseDatabaseMoney(line.egcs_fc_othergovfunding)),
        egcs_fc_otherfunding: line.egcs_fc_otherfunding === null ? null : databaseMoneyValue(parseDatabaseMoney(line.egcs_fc_otherfunding)),
        egcs_fc_currency: line.egcs_fc_currency,
        _deleted: false
      }))).execute()
    }
  }
}

const cloneActivityVersionRows = async (
  trx: Transaction<Database>,
  sourceVersionId: string,
  targetVersionId: string,
  agreementId: string
) => {
  const activities = await trx
    .selectFrom('Funding_Case_Agreement_Activity')
    .selectAll()
    .where('egcs_fc_activityversion', '=', sourceVersionId)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .execute()
  if (activities.length === 0) return

  const clonedActivityIdBySourceId = new Map<string, string>()
  for (const activity of activities) {
    const clonedActivity = await trx.insertInto('Funding_Case_Agreement_Activity').values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_activityversion: targetVersionId,
      egcs_fc_description_en: activity.egcs_fc_description_en,
      egcs_fc_description_fr: activity.egcs_fc_description_fr,
      egcs_fc_startdate: activity.egcs_fc_startdate,
      egcs_fc_enddate: activity.egcs_fc_enddate,
      egcs_fc_expectedresults_en: activity.egcs_fc_expectedresults_en,
      egcs_fc_expectedresults_fr: activity.egcs_fc_expectedresults_fr,
      egcs_fc_name_en: activity.egcs_fc_name_en,
      egcs_fc_name_fr: activity.egcs_fc_name_fr,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    clonedActivityIdBySourceId.set(String(activity.id), String(clonedActivity.id))
  }
  const sourceActivityIds = activities.map(activity => String(activity.id))
  const [outcomes, parties] = await Promise.all([
    trx.selectFrom('Funding_Case_Agreement_Outcome_Activity').selectAll()
      .where('egcs_fc_activity', 'in', sourceActivityIds).where('_deleted', '=', false).execute(),
    trx.selectFrom('Funding_Case_Agreement_Responsible_Party_Activity').selectAll()
      .where('egcs_fc_activity', 'in', sourceActivityIds).where('_deleted', '=', false).execute()
  ])
  if (outcomes.length > 0) {
    await trx.insertInto('Funding_Case_Agreement_Outcome_Activity').values(outcomes.map(item => ({
      egcs_fc_outcomes: item.egcs_fc_outcomes,
      egcs_fc_activity: clonedActivityIdBySourceId.get(String(item.egcs_fc_activity))!,
      _deleted: false
    }))).execute()
  }
  if (parties.length > 0) {
    await trx.insertInto('Funding_Case_Agreement_Responsible_Party_Activity').values(parties.map(item => ({
      egcs_fc_responsibleparty: item.egcs_fc_responsibleparty,
      egcs_fc_activity: clonedActivityIdBySourceId.get(String(item.egcs_fc_activity))!,
      _deleted: false
    }))).execute()
  }
}

export const promoteApprovedAgreementAmendment = async (
  trx: Transaction<Database>,
  context: AgreementAmendmentRuntimeContext,
  approvedDomains?: {
    budgetVersionId: string | null
    activityVersionId: string | null
    duration: boolean
  }
) => {
  const amendment = await trx
    .selectFrom('Funding_Case_Agreement_Amendment')
    .select([
      'egcs_fc_status',
      'egcs_fc_isopen',
      'egcs_fc_amendmentnumber',
      'egcs_fc_proposedauthorizedassistancestartdate',
      'egcs_fc_proposedauthorizedassistanceenddate'
    ])
    .where('id', '=', context.amendmentId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!amendment?.egcs_fc_isopen) return false

  if (
    approvedDomains?.duration !== false
    && amendment.egcs_fc_proposedauthorizedassistancestartdate
    && amendment.egcs_fc_proposedauthorizedassistanceenddate
  ) {
    const currentDuration = await trx.selectFrom('Funding_Case_Agreement_Profile')
      .select(['egcs_fc_authorizedassistancestartdate', 'egcs_fc_authorizedassistanceenddate'])
      .where('id', '=', context.agreementId)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    const durationChanged = amendment.egcs_fc_proposedauthorizedassistancestartdate.getTime()
      !== currentDuration.egcs_fc_authorizedassistancestartdate.getTime()
      || amendment.egcs_fc_proposedauthorizedassistanceenddate.getTime()
      !== currentDuration.egcs_fc_authorizedassistanceenddate.getTime()

    if (durationChanged) {
      let durationBudgetQuery = trx.selectFrom('Funding_Case_Agreement_Budget_Version').select('id')
        .where('egcs_fc_amendment', '=', context.amendmentId)
        .where('egcs_fc_fundingagreement', '=', context.agreementId)
        .where('_deleted', '=', false)
      if (approvedDomains) durationBudgetQuery = durationBudgetQuery.where('id', '=', approvedDomains.budgetVersionId ?? '-1')
      const budgetSnapshot = await durationBudgetQuery.executeTakeFirst()
      if (!await agreementBudgetFiscalYearsOverlapDuration(trx, context.agreementId, {
        startDate: amendment.egcs_fc_proposedauthorizedassistancestartdate,
        endDate: amendment.egcs_fc_proposedauthorizedassistanceenddate
      }, budgetSnapshot ? String(budgetSnapshot.id) : undefined)) return false

      await trx.updateTable('Funding_Case_Agreement_Profile').set({
        egcs_fc_authorizedassistancestartdate: amendment.egcs_fc_proposedauthorizedassistancestartdate,
        egcs_fc_authorizedassistanceenddate: amendment.egcs_fc_proposedauthorizedassistanceenddate
      }).where('id', '=', context.agreementId).where('_deleted', '=', false).executeTakeFirst()
    }
  }

  let budgetSnapshotQuery = trx.selectFrom('Funding_Case_Agreement_Budget_Version').select('id')
    .where('egcs_fc_amendment', '=', context.amendmentId)
    .where('egcs_fc_fundingagreement', '=', context.agreementId)
    .where('_deleted', '=', false)
  if (approvedDomains) budgetSnapshotQuery = budgetSnapshotQuery.where('id', '=', approvedDomains.budgetVersionId ?? '-1')
  const budgetSnapshot = await budgetSnapshotQuery.executeTakeFirst()
  if (approvedDomains?.budgetVersionId && !budgetSnapshot) return false
  if (budgetSnapshot) {
    await trx.updateTable('Funding_Case_Agreement_Budget_Version').set({ egcs_fc_iscurrent: false })
      .where('egcs_fc_fundingagreement', '=', context.agreementId).where('egcs_fc_iscurrent', '=', true)
      .where('_deleted', '=', false).execute()
    const working = await trx.insertInto('Funding_Case_Agreement_Budget_Version').values({
      egcs_fc_fundingagreement: context.agreementId,
      egcs_fc_amendment: null,
      egcs_fc_sourceversion: String(budgetSnapshot.id),
      egcs_fc_iscurrent: true,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await cloneBudgetVersionRows(trx, String(budgetSnapshot.id), String(working.id), context.agreementId)
  }

  let activitySnapshotQuery = trx.selectFrom('Funding_Case_Agreement_Activity_Version').select('id')
    .where('egcs_fc_amendment', '=', context.amendmentId)
    .where('egcs_fc_fundingagreement', '=', context.agreementId)
    .where('_deleted', '=', false)
  if (approvedDomains) activitySnapshotQuery = activitySnapshotQuery.where('id', '=', approvedDomains.activityVersionId ?? '-1')
  const activitySnapshot = await activitySnapshotQuery.executeTakeFirst()
  if (approvedDomains?.activityVersionId && !activitySnapshot) return false
  if (activitySnapshot) {
    await trx.updateTable('Funding_Case_Agreement_Activity_Version').set({ egcs_fc_iscurrent: false })
      .where('egcs_fc_fundingagreement', '=', context.agreementId).where('egcs_fc_iscurrent', '=', true)
      .where('_deleted', '=', false).execute()
    const working = await trx.insertInto('Funding_Case_Agreement_Activity_Version').values({
      egcs_fc_fundingagreement: context.agreementId,
      egcs_fc_amendment: null,
      egcs_fc_sourceversion: String(activitySnapshot.id),
      egcs_fc_iscurrent: true,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await cloneActivityVersionRows(trx, String(activitySnapshot.id), String(working.id), context.agreementId)
  }

  return true
}
