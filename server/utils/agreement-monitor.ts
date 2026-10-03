import { hasAccountingTable } from './correction-schema'
/* eslint-disable jsdoc/require-jsdoc -- Existing exported monitor helpers are intentionally documented by their descriptive names. */
import { getRouterParam, type H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { lockAgreementAggregate } from '~~/server/utils/agreement-aggregate-lock'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import { FundingCaseAgreementMonitorPatchSchema } from '~~/shared/types/schemas'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import type { AgreementScopeContext } from '~~/server/utils/agreement'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { assertBusinessStatusMutationAllowed, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AgreementMonitorDb = Kysely<Database> | Transaction<Database>

export type AgreementMonitorRuntimeContext = {
  monitorId: string
  agreementId: string
  streamId: string
  agencyId: string
}

/**
 * Enforce the Agency type policy inside the authorized Monitor write transaction.
 * @param event - Request context.
 * @param db - Authorized transaction.
 * @param monitorId - Exact owning Monitor.
 * @param requiresReceivable - Whether this follow-up requires AR establishment.
 */
export const assertMonitorReceivableEligible = async (event: H3Event, db: AgreementMonitorDb, monitorId: string, requiresReceivable: boolean | undefined) => {
  if (!requiresReceivable) return
  const policy = await db.selectFrom('Funding_Case_Agreement_Monitor as monitor')
    .innerJoin('Transfer_Payment_Monitor_Type as monitor_type', 'monitor_type.id', 'monitor.egcs_fc_type')
    .innerJoin('Agency_Monitor_Type as agency_type', 'agency_type.id', 'monitor_type.egcs_tp_agencymonitortype')
    .where('monitor.id', '=', monitorId).where('monitor._deleted', '=', false)
    .where('monitor_type._deleted', '=', false).where('agency_type._deleted', '=', false)
    .select('agency_type.egcs_ay_receivableeligible').forUpdate('agency_type').executeTakeFirst()
  if (!policy?.egcs_ay_receivableeligible) await badRequest(event, 'MONITOR_RECEIVABLE_NOT_ALLOWED', 'apiErrors.agreement.monitor_receivable_not_allowed')
}

export const prepareAgreementMonitorRoute = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  assignmentTarget?: ExactEntityTarget<AssignableEntityType>
) => {
  const db = event.context.$db as Kysely<Database>
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, action, agreementId, db, { assignmentTarget })
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  return {
    agreementId,
    agreementContext,
    db
  }
}

export const assertAgreementMonitorExists = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  monitorId: string
) => {
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(monitorId)) {
    return await badRequest(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }
  const monitor = await db
    .selectFrom('Funding_Case_Agreement_Monitor')
    .where('id', '=', monitorId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!monitor) {
    return await badRequest(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  return monitor
}

export const resolveAgreementMonitorRuntimeContext = async (
  db: AgreementMonitorDb,
  monitorId: string
): Promise<AgreementMonitorRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(monitorId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Monitor')
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement'
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
      'Funding_Case_Agreement_Monitor.id as monitor_id',
      'Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Monitor.id', '=', monitorId)
    .where('Funding_Case_Agreement_Monitor._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row?.monitor_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
    return null
  }

  return {
    monitorId: String(row.monitor_id),
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id)
  }
}

export const getAgreementMonitor = async (
  db: AgreementMonitorDb,
  agreementId: string,
  monitorId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Monitor')
  .select([
    'id',
    'egcs_fc_fundingagreement',
    'egcs_fc_type',
    'egcs_fc_status',
    'egcs_fc_onsite',
    'egcs_fc_tentativefiscalyear',
    'egcs_fc_tentativequarter'
  ])
  .where('id', '=', monitorId)
  .where('egcs_fc_fundingagreement', '=', agreementId)
  .where('_deleted', '=', false)
  .executeTakeFirst()

export const assertAgreementMonitorEditable = async (
  event: H3Event,
  db: AgreementMonitorDb,
  agreementId: string,
  monitorId: string
) => {
  const monitor = await getAgreementMonitor(db, agreementId, monitorId)

  if (!monitor) {
    return await badRequest(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcasemonitor', monitorId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_MONITOR_LOCKED', 'apiErrors.request.invalid_status')
  }

  const completion = await db
    .selectFrom('Common_Completion')
    .select('id')
    .where('egcs_cn_entitytype', '=', 'fundingcasemonitor')
    .where('egcs_cn_entityid', '=', monitorId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (completion) {
    return await badRequest(event, 'AGREEMENT_MONITOR_LOCKED', 'apiErrors.request.invalid_status')
  }

  return monitor
}

export const lockAgreementMonitorEditable = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  monitorId: string
) => {
  await lockAgreementAggregate(trx, 'monitor', monitorId)
  return await assertAgreementMonitorEditable(event, trx, agreementId, monitorId)
}

export const executeAgreementMonitorMutation = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  monitorId: string,
  callback: (trx: Transaction<Database>, agreementContext: AgreementScopeContext) => Promise<T>,
  options: { action?: 'create' | 'update' | 'delete' } = {}
): Promise<T> => {
  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    initialContext,
    async (trx, currentContext) => await callback(trx, currentContext),
    {
      authorize: async (trx, _agreementContext, authContext) => {
        await lockAgreementMonitorEditable(event, trx, agreementId, monitorId)
        await assertBusinessStatusMutationAllowed(event, trx, 'fundingcasemonitor', monitorId)
        await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcasemonitor', monitorId, options.action ?? 'update')
      }
    }
  )
}

export const syncAgreementMonitorEditingStatus = async (
  _db: AgreementMonitorDb,
  _monitorId: string
) => {
  // Ordinary monitor edits preserve the Agency-configured business status.
}

/**
 * Checks that an optional work-chain target is active and belongs to this monitor.
 * @param event - Request context.
 * @param db - Authorized transaction.
 * @param monitorId - Owning monitor.
 * @param kind - Linked resource type.
 * @param linkedId - Optional linked row.
 * @returns Nothing when the link is valid or absent.
 */
export const assertMonitorLinkedRecord = async (
  event: H3Event,
  db: AgreementMonitorDb,
  monitorId: string,
  kind: 'planning' | 'item' | 'finding',
  linkedId: string | null | undefined
) => {
  if (linkedId == null) return
  const table = kind === 'planning'
    ? 'Funding_Case_Agreement_Monitor_Planning'
    : kind === 'item'
      ? 'Funding_Case_Agreement_Monitor_Items'
      : 'Funding_Case_Agreement_Monitor_Finding'
  const row = await db.selectFrom(table)
    .select('id')
    .where('id', '=', linkedId)
    .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!row) return await badRequest(event, 'INVALID_MONITOR_LINK', 'apiErrors.agreement.invalid_monitor_link')
}

export const assertMonitorTypeBelongsToAgreementStream = async (
  event: H3Event,
  db: AgreementMonitorDb,
  streamId: string,
  monitorTypeId: string,
  options: { lockReference?: boolean } = {}
) => {
  let query = db
    .selectFrom('Transfer_Payment_Monitor_Type')
    .innerJoin('Agency_Monitor_Type', 'Agency_Monitor_Type.id', 'Transfer_Payment_Monitor_Type.egcs_tp_agencymonitortype')
    .where('Transfer_Payment_Monitor_Type.id', '=', monitorTypeId)
    .where('Transfer_Payment_Monitor_Type.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Monitor_Type._deleted', '=', false)
    .where('Agency_Monitor_Type._deleted', '=', false)
    .select(['Transfer_Payment_Monitor_Type.id', 'Agency_Monitor_Type.egcs_ay_receivableeligible'])
  if (options.lockReference) query = query.forUpdate()
  const monitorType = await query.executeTakeFirst()

  if (!monitorType) {
    return await badRequest(event, 'INVALID_AGREEMENT_MONITOR_TYPE', 'apiErrors.agreement.invalid_monitor_type')
  }

  return monitorType
}

export const assertMonitorFiscalYearBelongsToAgreementAgency = async (
  event: H3Event,
  db: AgreementMonitorDb,
  agencyId: string,
  fiscalYearId: string,
  options: { lockReference?: boolean } = {}
) => {
  let query = db
    .selectFrom('Agency_Fiscal_Year')
    .where('id', '=', fiscalYearId)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
  if (options.lockReference) query = query.forUpdate()
  const fiscalYear = await query.executeTakeFirst()

  if (!fiscalYear) {
    return await badRequest(event, 'INVALID_AGREEMENT_MONITOR_FISCAL_YEAR', 'apiErrors.agreement.invalid_monitor_fiscal_year')
  }

  return fiscalYear
}

export const patchAgreementMonitorForRoute = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  monitorId: string
) => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementMonitorPatchSchema)

  return await executeAgreementMonitorMutation(event, db, agreementId, initialContext, monitorId, async (trx, currentContext) => {
    if (validated.egcs_fc_type) {
      const monitorType = await assertMonitorTypeBelongsToAgreementStream(event, trx, currentContext.streamId, validated.egcs_fc_type, { lockReference: true })
      if (!monitorType || !('id' in monitorType)) return monitorType
      if (!monitorType.egcs_ay_receivableeligible) {
        const requiredFollowup = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup')
          .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
          .where(eb => eb.or([eb.and([eb('egcs_fc_requiresreceivable', '=', true), eb('_deleted', '=', false)]), eb.exists(eb.selectFrom('Funding_Case_Agreement_Account_Receivable as receivable').select('receivable.id').whereRef('receivable.egcs_fc_monitorfollowup', '=', 'Funding_Case_Agreement_Monitor_Followup.id'))]))
          .select('id').executeTakeFirst()
        if (requiredFollowup) return await badRequest(event, 'MONITOR_RECEIVABLE_NOT_ALLOWED', 'apiErrors.agreement.monitor_receivable_not_allowed')
      }
    }

    if (validated.egcs_fc_tentativefiscalyear) {
      const fiscalYear = await assertMonitorFiscalYearBelongsToAgreementAgency(event, trx, currentContext.agencyId, validated.egcs_fc_tentativefiscalyear, { lockReference: true })
      if (!fiscalYear || !('id' in fiscalYear)) return fiscalYear
    }

    return await trx
      .updateTable('Funding_Case_Agreement_Monitor')
      .set(validated)
      .where('id', '=', monitorId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
}

export const assertAgreementMonitorFollowupExists = async (
  event: H3Event,
  db: AgreementMonitorDb,
  agreementId: string,
  monitorId: string,
  followupId: string
) => {
  const monitor = await assertAgreementMonitorEditable(event, db, agreementId, monitorId)
  if (!monitor || !('id' in monitor)) {
    return monitor
  }

  const followup = await db
    .selectFrom('Funding_Case_Agreement_Monitor_Followup')
    .innerJoin(
      'Funding_Case_Agreement_Monitor',
      'Funding_Case_Agreement_Monitor.id',
      'Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor'
    )
    .where('Funding_Case_Agreement_Monitor_Followup.id', '=', followupId)
    .where('Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor', '=', monitorId)
    .where('Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Monitor_Followup._deleted', '=', false)
    .where('Funding_Case_Agreement_Monitor._deleted', '=', false)
    .select('Funding_Case_Agreement_Monitor_Followup.id as id')
    .executeTakeFirst()

  if (!followup) {
    return await badRequest(event, 'AGREEMENT_MONITOR_FOLLOWUP_NOT_FOUND', 'apiErrors.agreement.monitor_followup_not_found')
  }

  return followup
}

export const syncAgreementMonitorFollowupStatus = async (
  db: AgreementMonitorDb,
  followupId: string,
  options: { event?: H3Event } = {}
) => {
  const latestUpdate = await db
    .selectFrom('Funding_Case_Agreement_Monitor_Followup_Update')
    .select('egcs_fc_status')
    .where('egcs_fc_fundingagreementmonitorfollowup', '=', followupId)
    .where('_deleted', '=', false)
    .orderBy('id', 'desc')
    .executeTakeFirst()

  const status = latestUpdate?.egcs_fc_status ?? 'open'
  if (status === 'completed' && await hasAccountingTable(db, 'Funding_Case_Agreement_Account_Receivable')) {
    const followup = await db.selectFrom('Funding_Case_Agreement_Monitor_Followup').select('egcs_fc_requiresreceivable')
      .where('id', '=', followupId).where('_deleted', '=', false).executeTakeFirst()
    if (followup?.egcs_fc_requiresreceivable) {
      const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('id')
        .where('egcs_fc_monitorfollowup', '=', followupId).where('egcs_fc_outcome', '=', 'posted')
        .where('egcs_fc_linkedreceivable', 'is', null).where('_deleted', '=', false).executeTakeFirst()
      if (!debt) {
        if (options.event) return await throwApiError(options.event, { statusCode: 409,
          code: 'AR_MONITOR_RECEIVABLE_REQUIRED', key: 'apiErrors.account_receivable.monitor_receivable_required' })
        throw new Error('AR_MONITOR_RECEIVABLE_REQUIRED')
      }
    }
  }

  await db
    .updateTable('Funding_Case_Agreement_Monitor_Followup')
    .set({ egcs_fc_status: status })
    .where('id', '=', followupId)
    .where('_deleted', '=', false)
    .execute()

  return status
}
