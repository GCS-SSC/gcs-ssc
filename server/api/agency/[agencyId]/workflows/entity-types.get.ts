import { defineEventHandler, getRouterParam } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowCatalog } from '~~/server/utils/agency-workflow-authorization'
import type { EntityWorkflowPurpose } from '~~/shared/constants/entity-registry'
import type { WorkflowEntityTypesResponse } from '~~/shared/types/workflow-catalog'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowCatalog(event, 'read', agencyId)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const rows = await event.context.$db.selectFrom('Common_Entity_Type as entity')
    .select([
      'entity.egcs_cn_type', 'entity.egcs_cn_label_en', 'entity.egcs_cn_label_fr',
      'entity.egcs_cn_standardworkflow', 'entity.egcs_cn_approvalsubmission', 'entity.egcs_cn_riskrating'
    ])
    .where('entity._deleted', '=', false)
    .where(eb => eb.or([
      eb('entity.egcs_cn_extensionkey', 'is', null),
      eb.exists(eb.selectFrom('extensions.agency_enablement as enablement').select('enablement.extension_key')
        .whereRef('enablement.extension_key', '=', 'entity.egcs_cn_extensionkey')
        .where('enablement.agency_id', '=', agencyId)
        .where('enablement.enabled', '=', true)
        .where('enablement._deleted', '=', false))
    ]))
    .where(eb => eb.or([
      eb('entity.egcs_cn_standardworkflow', '=', 'explicit'),
      eb('entity.egcs_cn_approvalsubmission', '!=', 'none'),
      eb('entity.egcs_cn_riskrating', '=', 'explicit')
    ]))
    .orderBy('entity.egcs_cn_label_en').execute()
  const response: WorkflowEntityTypesResponse = {
    items: rows.map(row => {
      const workflowPurposes: EntityWorkflowPurpose[] = []
      if (row.egcs_cn_standardworkflow === 'explicit') workflowPurposes.push('standard')
      if (row.egcs_cn_approvalsubmission !== 'none') workflowPurposes.push('approval_submission')
      if (row.egcs_cn_riskrating === 'explicit') workflowPurposes.push('risk_rating')
      return {
        entityType: row.egcs_cn_type,
        labelEn: row.egcs_cn_label_en,
        labelFr: row.egcs_cn_label_fr,
        workflowPurposes
      }
    })
  }
  return response
})
