import { authorize, resolveAnyAgency } from '~~/server/utils/authorize'
import { getRegisteredExtensions } from '~~/server/utils/extensions'

/** Lists enabled Agency workspaces only where the actor has Agency read access. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const auth = await authorize(event, 'agency', 'read', resolveAnyAgency(db))
  const extensions = (await getRegisteredExtensions()).filter(item => item.admin.agencyWorkspace)
  if (!extensions.length) return { items: [] }

  const rows = await db.selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select([
      'enablement.extension_key', 'enablement.agency_id',
      'agency.egcs_ay_name_en', 'agency.egcs_ay_name_fr'
    ])
    .where('enablement.extension_key', 'in', extensions.map(item => item.key))
    .where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false)
    .where('agency._deleted', '=', false)
    .where('agency.egcs_ay_active', '=', true)
    .execute()

  return { items: extensions.flatMap(extension => {
    const agencies = rows.filter(row => row.extension_key === extension.key
      && auth.userAbilities.authorize('agency', 'read', {
        type: 'agency', agencyId: String(row.agency_id)
      }))
      .map(row => ({
        id: String(row.agency_id),
        nameEn: row.egcs_ay_name_en,
        nameFr: row.egcs_ay_name_fr
      }))
    return agencies.length
      ? [{
          key: extension.key,
          label: extension.admin.agencyWorkspace!.label,
          icon: extension.admin.agencyWorkspace!.icon,
          agencies
        }]
      : []
  }) }
})
