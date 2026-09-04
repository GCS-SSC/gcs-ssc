/* eslint-disable jsdoc/require-jsdoc -- Attachment record helper has a narrow typed contract. */
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AttachmentTarget } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const loadTargetAttachment = async (
  db: Kysely<Database> | Transaction<Database>,
  target: AttachmentTarget,
  linkId: string,
  lock: boolean = false
) => {
  if (!isPositivePostgresBigintText(linkId)) return undefined
  let query = db.selectFrom('Common_Entity_Attachment')
    .innerJoin('Common_Attachment', 'Common_Attachment.id', 'Common_Entity_Attachment.egcs_cn_attachment')
    .select([
      'Common_Entity_Attachment.id as link_id',
      'Common_Attachment.id as attachment_id',
      'Common_Attachment.egcs_cn_attachmenttype as attachment_type_id',
      'Common_Attachment.egcs_cn_provider as provider_id',
      'Common_Attachment.egcs_cn_providerobjectid as provider_object_id',
      'Common_Attachment.egcs_cn_providerlocator as provider_locator',
      'Common_Attachment.egcs_cn_providermetadata as provider_metadata',
      'Common_Attachment.egcs_cn_metadatapersistence as metadata_persistence',
      'Common_Attachment.egcs_cn_metadatacontractversion as metadata_contract_version',
      'Common_Attachment.egcs_cn_name_en as name_en',
      'Common_Attachment.egcs_cn_name_fr as name_fr',
      'Common_Attachment.egcs_cn_filename as filename',
      'Common_Attachment.egcs_cn_mimetype as mime_type'
    ])
    .where('Common_Entity_Attachment.id', '=', linkId)
    .where('Common_Entity_Attachment.egcs_cn_entitytype', '=', target.entityType)
    .where('Common_Entity_Attachment.egcs_cn_entityid', '=', target.entityId)
    .where('Common_Entity_Attachment._deleted', '=', false)
    .where('Common_Attachment._deleted', '=', false)
  if (lock) query = query.forUpdate()
  return await query.executeTakeFirst()
}
