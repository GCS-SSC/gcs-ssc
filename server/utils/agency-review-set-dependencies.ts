/* eslint-disable jsdoc/require-jsdoc */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'

export const validateReviewSetApprovalTemplateForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  templateId?: string | null
) => {
  if (!templateId) return true
  const template = await db.selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', '=', templateId)
    .where('Common_Approval_Template.egcs_cn_agency', '=', agencyId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  return Boolean(template)
}

export const validateReviewSetApprovalTemplatesForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  templateIds: string[]
) => {
  const uniqueIds = [...new Set(templateIds)]
  if (uniqueIds.length === 0) return true
  const templates = await db.selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', 'in', uniqueIds)
    .where('Common_Approval_Template.egcs_cn_agency', '=', agencyId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .execute()
  return templates.length === uniqueIds.length
}
