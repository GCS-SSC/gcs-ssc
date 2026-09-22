import { authorize, resolveAnyAgency } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const access = await authorize(event, 'group', 'read', resolveAnyAgency(db))
  const agencies = await db.selectFrom('Agency_Profile')
    .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
    .where('_deleted', '=', false)
    .$if(!access.hasGlobalAccess, query => query.where('id', 'in', access.agencyIds ?? []))
    .orderBy('egcs_ay_name_en').execute()
  return { items: agencies.map(agency => ({ ...agency, id: String(agency.id) })) }
})
