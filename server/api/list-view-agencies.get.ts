import en from '~~/i18n/locales/en.json'
import fr from '~~/i18n/locales/fr.json'
import { sql } from 'kysely'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { resolveAgreementVisibility } from '~~/server/utils/agreement'
import { resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { getUserAssignmentAgencyScopes } from '~~/server/utils/rbac'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({ resource: z.enum(['agreement', 'applicant_recipient']) })

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  const { resource, page, limit, search } = await getValidatedQueryI18n(event, QuerySchema)
  const context = await authorize(event, resource, 'read', async ({ context: principal }) => {
    const visibility = resource === 'agreement'
      ? await resolveAgreementVisibility(principal, 'read', db)
      : await resolveApplicantRecipientVisibility(principal, 'read', db)
    return visibility.hasGlobalAccess || visibility.agencyIds.length > 0
      || ('transferPaymentIds' in visibility && Array.isArray(visibility.transferPaymentIds) && visibility.transferPaymentIds.length > 0)
      ? { bypass: true }
      : { scope: { type: 'global' } }
  })
  let query = db.selectFrom('Agency_Profile').where('Agency_Profile._deleted', '=', false)
  if (resource === 'agreement') {
    const visibility = await resolveAgreementVisibility(context, 'read', db)
    if (!visibility.hasGlobalAccess) {
      query = query.where(eb => eb.or([
        ...(visibility.agencyIds.length ? [eb('Agency_Profile.id', 'in', visibility.agencyIds)] : []),
        ...(visibility.transferPaymentIds.length
          ? [eb.exists(eb.selectFrom('Transfer_Payment_Profile')
              .whereRef('egcs_tp_agency', '=', 'Agency_Profile.id')
              .where('id', 'in', visibility.transferPaymentIds)
              .where('_deleted', '=', false).select('id'))]
          : [])
      ]))
    }
  } else {
    const scopes = await getUserAssignmentAgencyScopes(context.userId, db)
    query = query.where(eb => scopes.length ? eb('Agency_Profile.id', 'in', scopes.map(scope => scope.agencyId)) : eb.val(false))
  }
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([eb(sql<string>`CAST("Agency_Profile"."id" AS TEXT)`, '=', search), eb('egcs_ay_name_en', 'ilike', pattern), eb('egcs_ay_name_fr', 'ilike', pattern)]))
  }
  const [items, count] = await Promise.all([
    query.select(['Agency_Profile.id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).orderBy('Agency_Profile.id').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.countAll().as('total')).executeTakeFirstOrThrow()
  ])
  return { items: items.map(item => ({ ...item,
    label_en: en[resource].list_views.agency.replace('{agency}', item.egcs_ay_name_en),
    label_fr: fr[resource].list_views.agency.replace('{agency}', item.egcs_ay_name_fr)
  })), total: Number(count.total), page, limit }
}))
