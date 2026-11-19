/* eslint-disable jsdoc/require-jsdoc -- Query projections use explicit field names. */
import type { H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import type { AttachmentSource } from '~~/shared/types/attachment-source'
import type { Database } from '~~/shared/types/database'
import type { AttachmentTarget } from '~~/shared/types/schemas'
import { authorizeApprovalAttachmentRead } from './approval-attachments'
import { escapeLikePattern } from './sql-like'

export const submittedApprovalAttachmentQuery = (
  db: Kysely<Database>,
  target: AttachmentTarget,
  agencyId: string,
  filters: { attachmentTypeId?: string, search?: string }
) => db.selectFrom('Common_Approval_Attachment as link')
  .innerJoin('Common_Attachment as file', 'file.id', 'link.egcs_cn_attachment')
  .innerJoin('Common_Attachment_Types as type', 'type.id', 'file.egcs_cn_attachmenttype')
  .innerJoin('Common_Approval as approval', 'approval.id', 'link.egcs_cn_approval')
  .innerJoin('Common_Runtime_Item as step', 'step.id', 'approval.egcs_cn_runtimeitem')
  .innerJoin('Common_Routing_Slip as slip', 'slip.id', 'approval.egcs_cn_routingslip')
  .innerJoin('Common_Runtime_Item as routing', 'routing.id', 'slip.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime as runtime', 'runtime.id', 'routing.egcs_cn_runtime')
  .where(eb => eb.or([
    eb.and([eb('slip.egcs_cn_entitytype', '=', target.entityType), eb('slip.egcs_cn_entityid', '=', target.entityId)]),
    eb.and([eb('runtime.egcs_cn_entitytype', '=', target.entityType), eb('runtime.egcs_cn_entityid', '=', target.entityId)])
  ]))
  .where('type.egcs_cn_agency', '=', agencyId)
  .where('link.egcs_cn_submitted', '=', true)
  .where('approval.egcs_cn_approvalvalue', 'is not', null)
  .where('link._deleted', '=', false)
  .where('file._deleted', '=', false)
  .where('step._deleted', '=', false)
  .where('slip._deleted', '=', false)
  .where('routing._deleted', '=', false)
  .where('runtime._deleted', '=', false)
  .$if(Boolean(filters.attachmentTypeId), query => query.where('file.egcs_cn_attachmenttype', '=', filters.attachmentTypeId!))
  .$if(Boolean(filters.search), query => {
    const match = `%${escapeLikePattern(filters.search!)}%`
    return query.where(eb => eb.or([
      eb('file.egcs_cn_name_en', 'ilike', match),
      eb('file.egcs_cn_name_fr', 'ilike', match),
      eb('file.egcs_cn_description_en', 'ilike', match),
      eb('file.egcs_cn_description_fr', 'ilike', match),
      eb('approval.egcs_cn_name_en', 'ilike', match),
      eb('approval.egcs_cn_name_fr', 'ilike', match)
    ]))
  })

export const getReadableAttachmentRoutingSlips = async (
  event: H3Event,
  base: ReturnType<typeof submittedApprovalAttachmentQuery>,
  agencyId: string
) => {
  const candidates = await base.select(eb => [
    'slip.id as slip_id', eb.fn.min('approval.id').as('approval_id')
  ]).groupBy('slip.id').execute()
  const visible: string[] = []
  for (const candidate of candidates) {
    try {
      const access = await authorizeApprovalAttachmentRead(event, String(candidate.approval_id))
      if (access.agencyId === agencyId) visible.push(String(candidate.slip_id))
    } catch (error: unknown) {
      if (!(error instanceof Error && 'statusCode' in error && [403, 404].includes(Number(error.statusCode)))) throw error
    }
  }
  return visible
}

export const selectSubmittedApprovalAttachments = (
  base: ReturnType<typeof submittedApprovalAttachmentQuery>,
  slipIds: string[]
) => base
  .leftJoin('Common_Publication_Version as definition', 'definition.id', 'runtime.egcs_cn_sourcepublicationversion')
  .leftJoin('Common_User as uploader', 'uploader.id', 'link.egcs_cn_uploadedby')
  .where(eb => slipIds.length ? eb('slip.id', 'in', slipIds) : sql<boolean>`false`)
  .select([
    sql<string>`concat('approval:', link.id)`.as('id'),
    'link.id as sort_id',
    'link.egcs_cn_attachment as attachment_id',
    'file.egcs_cn_createdat as uploaded_at',
    'file.egcs_cn_createdat as updated_at',
    'file.egcs_cn_attachmenttype as attachment_type_id',
    'file.egcs_cn_name_en as name_en',
    'file.egcs_cn_name_fr as name_fr',
    'file.egcs_cn_description_en as description_en',
    'file.egcs_cn_description_fr as description_fr',
    'file.egcs_cn_filename as filename',
    'file.egcs_cn_mimetype as mime_type',
    'file.egcs_cn_filesize as file_size',
    'file.egcs_cn_provider as provider_id',
    'file.egcs_cn_providerobjectid as provider_object_id',
    'file.egcs_cn_providerlocator as provider_locator',
    'file.egcs_cn_providermetadata as provider_metadata',
    'file.egcs_cn_metadatapersistence as metadata_persistence',
    'file.egcs_cn_metadatacontractversion as metadata_contract_version',
    'link.egcs_cn_typename_en as attachment_type_name_en',
    'link.egcs_cn_typename_fr as attachment_type_name_fr',
    sql<string>`coalesce(uploader.egcs_cn_name, '')`.as('uploaded_by_name'),
    sql<AttachmentSource>`jsonb_build_object(
      'kind', 'approval',
      'approvalId', approval.id::text,
      'attachmentId', link.id::text,
      'workflowNameEn', coalesce(definition.egcs_cn_definition->>'nameEn', definition.egcs_cn_definition->'name'->>'en', slip.egcs_cn_name_en),
      'workflowNameFr', coalesce(definition.egcs_cn_definition->>'nameFr', definition.egcs_cn_definition->'name'->>'fr', slip.egcs_cn_name_fr),
      'stepNameEn', approval.egcs_cn_name_en,
      'stepNameFr', approval.egcs_cn_name_fr,
      'attempt', runtime.egcs_cn_attempt,
      'approved', approval.egcs_cn_approvalvalue,
      'decidedAt', approval.egcs_cn_approvaldate,
      'approverName', coalesce(approval.egcs_cn_approvername, uploader.egcs_cn_name)
    )`.as('source')
  ])
