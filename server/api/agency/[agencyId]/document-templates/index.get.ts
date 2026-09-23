import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = trx.selectFrom('Agency_Document_Template')
      .innerJoin('Common_Attachment as AttachmentEn', 'AttachmentEn.id', 'Agency_Document_Template.egcs_ay_templateattachment_en')
      .innerJoin('Common_Attachment as AttachmentFr', 'AttachmentFr.id', 'Agency_Document_Template.egcs_ay_templateattachment_fr')
      .where('Agency_Document_Template.egcs_ay_organizationagency', '=', agencyId)
      .where('Agency_Document_Template._deleted', '=', false)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('Agency_Document_Template.egcs_ay_name_en', 'ilike', pattern),
        eb('Agency_Document_Template.egcs_ay_name_fr', 'ilike', pattern)
      ]))
    }
    const [items, count, active] = await Promise.all([
      query.selectAll('Agency_Document_Template').select([
        'AttachmentEn.egcs_cn_name_en as attachment_en_name_en',
        'AttachmentFr.egcs_cn_name_fr as attachment_fr_name_fr'
      ]).orderBy('Agency_Document_Template.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('Agency_Document_Template.id').as('total')).executeTakeFirst(),
      query.where('Agency_Document_Template.egcs_ay_active', '=', true)
        .select(eb => eb.fn.count('Agency_Document_Template.id').as('active')).executeTakeFirst()
    ])
    return { items, total: Number(count?.total || 0), stats: { total: Number(count?.total || 0), active: Number(active?.active || 0) }, page, limit }
  })
})
