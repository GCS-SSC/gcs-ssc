/* eslint-disable jsdoc/require-jsdoc -- Stream Workflow link operations are covered by route tests. */
import type { H3Event } from 'h3'
import { z } from 'zod'
import { authorize } from './authorize'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n } from './api-validate'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamRead, executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { readPublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { validateWorkflowRiskRatingMappingForStream } from './agreement-risk-rating'

const LinkBodySchema = z.object({ egcs_tp_workflow: PositivePostgresBigintIdSchema }).strict()

export const streamWorkflowRoute = async (event: H3Event, action: 'read' | 'create' | 'delete') => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  if (!isPositivePostgresBigintText(profileId) || !isPositivePostgresBigintText(streamId)) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  const accessAction = action === 'read' ? 'read' : 'update'
  const stream = await authorizeTransferPaymentStreamResource(event, accessAction, profileId, streamId)
  if (!stream) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', accessAction, createTransferPaymentScopedAuthorizeHandler(accessAction, stream.scope, db))

  if (action === 'read') {
    return await executeFreshAuthorizedTransferPaymentStreamRead(event, db, profileId, stream.agencyId, streamId, async (trx, fresh) => {
      const items = await trx.selectFrom('Transfer_Payment_Stream_Workflow')
        .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Transfer_Payment_Stream_Workflow.egcs_tp_workflow')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
        .select([
          'Transfer_Payment_Stream_Workflow.id', 'Transfer_Payment_Stream_Workflow.egcs_tp_workflow',
          'Common_Workflow_Setup.egcs_cn_name_en', 'Common_Workflow_Setup.egcs_cn_name_fr',
          'Common_Workflow_Setup.egcs_cn_entitytype', 'Common_Workflow_Setup.egcs_cn_purpose',
          'Common_Publication.egcs_cn_state as publicationState'
        ])
        .where('Transfer_Payment_Stream_Workflow.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream_Workflow._deleted', '=', false)
        .where('Common_Workflow_Setup.egcs_cn_agency', '=', fresh.agencyId)
        .orderBy('Common_Workflow_Setup.egcs_cn_name_en').execute()
      return { items: items.map(item => ({ ...item, id: String(item.id), egcs_tp_workflow: String(item.egcs_tp_workflow) })) }
    })
  }

  if (action === 'create') {
    const body = await readValidatedBodyI18n(event, LinkBodySchema)
    try {
      return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, stream.agencyId, streamId, 'update', async (trx, fresh) => {
        const setup = await trx.selectFrom('Common_Workflow_Setup')
          .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
          .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
          .select([
            'Common_Workflow_Setup.id', 'Common_Workflow_Setup.egcs_cn_entitytype', 'Common_Workflow_Setup.egcs_cn_purpose',
            'Common_Publication_Version.egcs_cn_definition as definition'
          ])
          .where('Common_Workflow_Setup.id', '=', body.egcs_tp_workflow)
          .where('Common_Workflow_Setup.egcs_cn_agency', '=', fresh.agencyId)
          .where('Common_Workflow_Setup._deleted', '=', false)
          .where('Common_Publication._deleted', '=', false)
          .where('Common_Publication.egcs_cn_state', '=', 'published')
          .forUpdate(['Common_Workflow_Setup', 'Common_Publication', 'Common_Publication_Version'])
          .executeTakeFirst()
        if (!setup) return await badRequest(event, 'WORKFLOW_SETUP_NOT_PUBLISHED', 'apiErrors.request.invalid_resource')
        const definition = readPublishedWorkflowConfiguration(setup.definition)
        if (definition.entityType !== setup.egcs_cn_entitytype || definition.purpose !== setup.egcs_cn_purpose
          || !await validateWorkflowRiskRatingMappingForStream(trx, streamId, definition)) {
          return await badRequest(event, 'WORKFLOW_RISK_RATING_MAPPING_INVALID', 'apiErrors.request.invalid_resource')
        }
        const existing = await trx.selectFrom('Transfer_Payment_Stream_Workflow').select('id')
          .where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('egcs_tp_workflow', '=', body.egcs_tp_workflow)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (existing) return await throwApiError(event, { statusCode: 409, code: 'WORKFLOW_LINK_EXISTS', key: 'apiErrors.request.invalid_resource' })
        const inserted = await trx.insertInto('Transfer_Payment_Stream_Workflow')
          .values({ egcs_tp_transferpaymentstream: streamId, egcs_tp_workflow: body.egcs_tp_workflow, _deleted: false })
          .returning(['id', 'egcs_tp_workflow']).executeTakeFirstOrThrow()
        return { id: String(inserted.id), egcs_tp_workflow: String(inserted.egcs_tp_workflow) }
      })
    } catch (error: unknown) {
      const constraint = getDatabaseConstraintName(error)
      if (constraint === 'tp_idx_streamworkflow_livepair' || constraint === 'tp_idx_streamworkflow_specialpurpose') {
        return await throwApiError(event, { statusCode: 409, code: 'WORKFLOW_LINK_EXISTS', key: 'apiErrors.request.invalid_resource' })
      }
      if (constraint === 'tp_chk_streamworkflowpublishedagency') {
        return await badRequest(event, 'WORKFLOW_SETUP_NOT_PUBLISHED', 'apiErrors.request.invalid_resource')
      }
      throw error
    }
  }

  const linkId = getRouterParam(event, 'linkId') ?? ''
  if (!isPositivePostgresBigintText(linkId)) return await notFound(event, 'WORKFLOW_LINK_NOT_FOUND', 'apiErrors.request.not_found')
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, stream.agencyId, streamId, 'update', async trx => {
    const link = await trx.selectFrom('Transfer_Payment_Stream_Workflow').select('id')
      .where('id', '=', linkId).where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!link) return await notFound(event, 'WORKFLOW_LINK_NOT_FOUND', 'apiErrors.request.not_found')
    await trx.updateTable('Transfer_Payment_Stream_Workflow').set({ _deleted: true }).where('id', '=', linkId).execute()
    return { success: true }
  })
}
