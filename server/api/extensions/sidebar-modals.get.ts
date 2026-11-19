import { defineEventHandler, setResponseHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { getRegisteredExtensions } from '~~/server/utils/extensions'
import { listEnabledSystemExtensionKeys } from '~~/server/utils/system-extension-enablement'
import type { ExtensionSignedInSidebarItem } from '~~/shared/types/schemas/extensions'

export default defineEventHandler(async event => {
  await authorize(event, 'system', 'read', async () => ({ bypass: true }))
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const enabledKeys = await listEnabledSystemExtensionKeys(event.context.$db)
  const extensions = await getRegisteredExtensions()
  const items: ExtensionSignedInSidebarItem[] = extensions.flatMap(({ key, configurationScope, signedInSidebarModal }) =>
    configurationScope === 'system' && enabledKeys.has(key) && signedInSidebarModal
      ? [{ ...signedInSidebarModal, key }]
      : [])
  return { items }
})
