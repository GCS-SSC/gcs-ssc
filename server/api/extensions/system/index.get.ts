import { defineEventHandler, setResponseHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { getRegisteredExtensions } from '~~/server/utils/extensions'
import { listEnabledSystemExtensionKeys } from '~~/server/utils/system-extension-enablement'
import type { ExtensionSystemRegistryItem } from '~~/shared/types/schemas/extensions'

export default defineEventHandler(async event => {
  const scope = { type: 'global' } as const
  const auth = await authorize(event, 'system', 'read', scope)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const canReadWorkspaces = auth.userAbilities.authorize('system', 'delete', scope)
  const enabledKeys = await listEnabledSystemExtensionKeys(event.context.$db)
  const extensions = await getRegisteredExtensions()
  const items: ExtensionSystemRegistryItem[] = extensions
    .filter(extension => extension.configurationScope === 'system')
    .map(extension => {
      const enabled = enabledKeys.has(extension.key)
      return {
        key: extension.key,
        name: extension.name,
        description: extension.description,
        enabled,
        workspaceComponentName: enabled && canReadWorkspaces
          ? extension.admin?.systemWorkspace?.componentName
          : undefined
      }
    })
  return { items }
})
