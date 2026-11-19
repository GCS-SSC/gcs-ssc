import { defineEventHandler, setResponseHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { getRegisteredExtensions } from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { ExtensionSignedInSidebarItem } from '~~/shared/types/schemas/extensions'

export default defineEventHandler(async event => {
  await authorize(event, 'system', 'read', async () => ({ bypass: true }))
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const agencyId = process.env.GCS_EXTENSION_SIDEBAR_AGENCY_ID ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return { items: [] }

  const extensions = await getRegisteredExtensions()
  const candidates = extensions.flatMap(({ key, signedInSidebarModal }) =>
    signedInSidebarModal ? [{ ...signedInSidebarModal, key }] : [])
  if (!candidates.length) return { items: [] }

  const enabled = await event.context.$db.selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select('enablement.extension_key')
    .where('enablement.agency_id', '=', agencyId)
    .where('enablement.extension_key', 'in', candidates.map(item => item.key))
    .where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false)
    .where('agency.egcs_ay_active', '=', true)
    .where('agency._deleted', '=', false)
    .execute()

  const enabledKeys = new Set(enabled.map(row => row.extension_key))
  const items: ExtensionSignedInSidebarItem[] = candidates
    .filter(item => enabledKeys.has(item.key))
    .map(({ key, label, icon, componentName }) => ({ key, label, icon, componentName, agencyId }))
  return { items }
})
