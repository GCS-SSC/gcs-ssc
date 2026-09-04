import type { Insertable } from 'kysely'
import { FundingCaseAgreementMonitorCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementMonitorTable } from '~~/shared/types/database'
import {
  assertMonitorFiscalYearBelongsToAgreementAgency,
  assertMonitorTypeBelongsToAgreementStream,
  prepareAgreementMonitorRoute
} from '~~/server/utils/agreement-monitor'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { notFound } from '~~/server/utils/api-errors'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementMonitorRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementMonitorCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
    const monitorType = await assertMonitorTypeBelongsToAgreementStream(event, trx, currentContext.streamId, validated.egcs_fc_type, { lockReference: true })
    if (!monitorType || !('id' in monitorType)) {
      return monitorType
    }

    const fiscalYear = await assertMonitorFiscalYearBelongsToAgreementAgency(event, trx, currentContext.agencyId, validated.egcs_fc_tentativefiscalyear, { lockReference: true })
    if (!fiscalYear || !('id' in fiscalYear)) {
      return fiscalYear
    }

    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const draftStatusId = await lockAgencyDraftStatus(trx, currentContext.agencyId)

    const monitor = await trx
      .insertInto('Funding_Case_Agreement_Monitor')
      .values({
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_type: validated.egcs_fc_type,
        egcs_fc_onsite: validated.egcs_fc_onsite,
        egcs_fc_tentativefiscalyear: validated.egcs_fc_tentativefiscalyear,
        egcs_fc_tentativequarter: validated.egcs_fc_tentativequarter,
        egcs_fc_status: draftStatusId
      } satisfies Insertable<FundingCaseAgreementMonitorTable>)
      .returningAll()
      .executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcasemonitor', String(monitor.id), creatorId)
    return monitor
  }, { action: 'create' })
})
