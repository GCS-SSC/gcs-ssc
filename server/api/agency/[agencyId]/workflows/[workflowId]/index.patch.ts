import { authorize } from '~~/server/utils/authorize'
import { areAgencyWorkflowStatusesValid, authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { resolveEntityTypeLifecycleDefinition, supportsWorkflowConfiguration } from '~~/server/utils/entity-type-registry'
import { readWorkflowConditions } from '~~/server/utils/workflow-conditions'
import { CommonWorkflowSetupCreateSchema, CommonWorkflowSetupPatchSchema } from '~~/shared/types/schemas'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { lockWorkflowSetupForMutation, readWorkflowSetupPublicationMetadata } from '~~/server/utils/workflow-setup-versioning'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId')
  const workflowSetupId = getRouterParam(event, 'workflowId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorizeAgencyWorkflowSetup(event, 'update', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupPatchSchema)
  const {
    egcs_cn_allowedstartstatuses: allowedStartStatuses,
    ...values
  } = body
  delete values._deleted
  if (Object.keys(values).length === 0 && allowedStartStatuses === undefined) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  const setup = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await lockWorkflowSetupForMutation(trx, workflowSetupId, agencyId)
    if (!current) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (current.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }
    const currentAllowedRows = await trx.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
      .select('egcs_cn_status').where('egcs_cn_workflowsetup', '=', workflowSetupId)
      .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').forUpdate().execute()
    const nextAllowedStatuses = allowedStartStatuses ?? currentAllowedRows.map(row => String(row.egcs_cn_status))
    if (!await areAgencyWorkflowStatusesValid(trx, agencyId, [
      ...nextAllowedStatuses,
      values.egcs_cn_cancellationstatus ?? current.egcs_cn_cancellationstatus,
      values.egcs_cn_executionfailurestatus ?? current.egcs_cn_executionfailurestatus
    ])) {
      return await badRequest(event, 'WORKFLOW_STATUSES_INVALID', 'apiErrors.request.invalid_resource')
    }
    await parseI18n(event, CommonWorkflowSetupCreateSchema, {
      egcs_cn_entitytype: values.egcs_cn_entitytype ?? current.egcs_cn_entitytype,
      egcs_cn_name_en: values.egcs_cn_name_en ?? current.egcs_cn_name_en,
      egcs_cn_name_fr: values.egcs_cn_name_fr ?? current.egcs_cn_name_fr,
      egcs_cn_description_en: values.egcs_cn_description_en ?? current.egcs_cn_description_en,
      egcs_cn_description_fr: values.egcs_cn_description_fr ?? current.egcs_cn_description_fr,
      egcs_cn_purpose: values.egcs_cn_purpose ?? current.egcs_cn_purpose,
      egcs_cn_allowedstartstatuses: nextAllowedStatuses,
      egcs_cn_cancellationstatus: values.egcs_cn_cancellationstatus ?? current.egcs_cn_cancellationstatus,
      egcs_cn_executionfailurestatus: values.egcs_cn_executionfailurestatus ?? current.egcs_cn_executionfailurestatus,
      egcs_cn_allowretry: values.egcs_cn_allowretry ?? current.egcs_cn_allowretry
    })
    const nextEntityType = values.egcs_cn_entitytype ?? current.egcs_cn_entitytype
    const nextPurpose = values.egcs_cn_purpose ?? current.egcs_cn_purpose
    if (!await supportsWorkflowConfiguration(trx, nextEntityType, nextPurpose)) {
      return await badRequest(event, 'UNSUPPORTED_WORKFLOW_ENTITY_TYPE', 'apiErrors.request.invalid')
    }
    if (nextEntityType !== current.egcs_cn_entitytype && (await resolveEntityTypeLifecycleDefinition(trx, nextEntityType))?.ownerKind !== 'agreement') {
      const members = await trx.selectFrom('Common_Workflow_Setup_Member').select('id')
        .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false).execute()
      for (const member of members) {
        if ((await readWorkflowConditions(trx, String(member.id))).length) {
          return await badRequest(event, 'WORKFLOW_CONDITIONS_INVALID', 'apiErrors.request.invalid_resource')
        }
      }
    }
    if (allowedStartStatuses) {
      await trx.updateTable('Common_Workflow_Setup_Allowed_Start_Status').set({ _deleted: true })
        .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false).execute()
      await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values(
        allowedStartStatuses.map((statusId, index) => ({
          egcs_cn_workflowsetup: workflowSetupId,
          egcs_cn_status: statusId,
          egcs_cn_order: index + 1,
          _deleted: false
        }))
      ).execute()
    }
    const updated = await trx.updateTable('Common_Workflow_Setup').set(values).where('id', '=', workflowSetupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    return { ...updated, egcs_cn_allowedstartstatuses: nextAllowedStatuses }
  }
  )
  if (!setup || typeof setup !== 'object' || !('id' in setup)) return setup
  return { ...setup, ...await readWorkflowSetupPublicationMetadata(db, setup) }
})
