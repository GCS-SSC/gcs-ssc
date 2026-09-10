import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { fetchAgencyScopedList } from '~~/server/utils/agency-scoped-list'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const WizardLookupKindSchema = z.enum([
  'applicant-recipient-subtypes', 'line-items', 'agreement-types', 'holdback-bases'
], { error: 'validation.invalid_selection' })
const WizardLookupQuerySchema = PaginationSchema.omit({ status: true }).extend({
  search: PaginationSchema.shape.search.refine(value => value === undefined || !value.includes('\u0000'), {
    error: 'validation.invalid_text_character'
  })
})

export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id')
  const requestedKind = getRouterParam(event, 'kind')
  if (!profileId || !requestedKind) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  return await executeFreshReadSnapshot(event, async db => {
    const access = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
    const kind = await parseI18n(event, WizardLookupKindSchema, requestedKind)
    const { page, limit, search } = await getValidatedQueryI18n(event, WizardLookupQuerySchema)
    const term = search ? `%${escapeLikePattern(search)}%` : null
    const offset = (page - 1) * limit

    if (kind === 'line-items') {
      const scoped = db.selectFrom('Agency_Cost_Category_Line_Item')
        .innerJoin('Agency_Cost_Category', 'Agency_Cost_Category.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory')
        .where('Agency_Cost_Category.egcs_ay_organizationagency', '=', access.agencyId)
        .where('Agency_Cost_Category._deleted', '=', false)
        .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      const filtered = term
        ? scoped.where(eb => eb.or([
            eb('Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'ilike', term),
            eb('Agency_Cost_Category_Line_Item.egcs_ay_name_fr', 'ilike', term)
          ]))
        : scoped
      return await fetchAgencyScopedList({
        items: filtered.select([
          'Agency_Cost_Category_Line_Item.id', 'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory',
          'Agency_Cost_Category_Line_Item.egcs_ay_name_en', 'Agency_Cost_Category_Line_Item.egcs_ay_name_fr'
        ]).orderBy('Agency_Cost_Category_Line_Item.id', 'asc').limit(limit).offset(offset).execute(),
        filteredCount: filtered.select(eb => eb.fn.count('Agency_Cost_Category_Line_Item.id').as('total')).executeTakeFirst(),
        scopedCount: scoped.select(eb => eb.fn.count('Agency_Cost_Category_Line_Item.id').as('total')).executeTakeFirst(),
        page, limit
      })
    }

    const table = kind === 'applicant-recipient-subtypes'
      ? 'Agency_Applicant_Recipient_Subtype'
      : kind === 'agreement-types' ? 'Agency_Agreement_Type' : 'Agency_Holdback_Basis'
    const scoped = db.selectFrom(table).where('egcs_ay_organizationagency', '=', access.agencyId).where('_deleted', '=', false)
    let filtered = scoped
    if (term) {
      filtered = scoped.where(eb => eb.or([
        eb('egcs_ay_name_en', 'ilike', term),
        eb('egcs_ay_name_fr', 'ilike', term),
        ...(kind === 'holdback-bases' ? [eb('egcs_ay_languageindependentcode', 'ilike', term)] : []),
        ...(kind === 'applicant-recipient-subtypes'
          ? [
              eb('egcs_ay_description_en', 'ilike', term), eb('egcs_ay_description_fr', 'ilike', term)
            ]
          : [])
      ]))
    }
    return await fetchAgencyScopedList({
      items: filtered.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
      filteredCount: filtered.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      scopedCount: scoped.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
      page, limit
    })
  })
})
