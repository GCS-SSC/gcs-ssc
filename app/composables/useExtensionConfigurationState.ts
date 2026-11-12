/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { GcsExtensionJsonConfig } from '~~/shared/utils/extensions'

interface ExtensionConfigurationRow {
  extension?: {
    key: string
  }
  config?: GcsExtensionJsonConfig
}

type ConfigurationSession<TRow> = {
  id: number
  item: Ref<TRow | null>
  acceptedSnapshot: string
  editedVersion: number
}

type ConfigurationSave = { session: number; version: number; snapshot: string }

type ConfigurationDialogState<TRow> =
  | { kind: 'closed' }
  | { kind: 'editing' | 'confirming-discard' | 'saving'; session: ConfigurationSession<TRow> }

/**
 * Shared modal and JSON editor state used by extension configuration tabs.
 *
 * @returns State and helpers for extension configuration modals.
 */
export const useExtensionConfigurationState = <TRow extends ExtensionConfigurationRow>() => {
  const { t } = useI18n()
  const dialog: Ref<ConfigurationDialogState<TRow>> = shallowRef({ kind: 'closed' })
  let nextSession = 0
  const isModalOpen = computed({
    get: () => dialog.value.kind !== 'closed',
    set: (open: boolean) => { if (!open) closeConfigure() }
  })
  const isDiscardConfirmOpen = computed({
    get: () => dialog.value.kind === 'confirming-discard',
    set: (open: boolean) => {
      if (dialog.value.kind === 'closed' || dialog.value.kind === 'saving') return
      dialog.value = { kind: open ? 'confirming-discard' : 'editing', session: dialog.value.session }
    }
  })
  const selectedItem = computed(() => dialog.value.kind === 'closed' ? null : dialog.value.session.item.value)
  const draftConfig: Ref<GcsExtensionJsonConfig> = ref({})
  const fallbackConfigText: Ref<string> = ref('{}')
  const fallbackConfigErrorKey: Ref<string> = ref('')
  const fallbackConfigError = computed(() => fallbackConfigErrorKey.value ? t(fallbackConfigErrorKey.value) : '')
  const isSavingConfiguration = computed({
    get: () => dialog.value.kind === 'saving',
    set: (saving: boolean) => {
      if (dialog.value.kind === 'closed') return
      dialog.value = { kind: saving ? 'saving' : 'editing', session: dialog.value.session }
    }
  })
  const savingExtensionKeys: Ref<Set<string>> = ref(new Set())

  const isDirty = computed(() => fallbackConfigErrorKey.value !== '' || JSON.stringify(draftConfig.value) !== (dialog.value.kind === 'closed' ? '{}' : dialog.value.session.acceptedSnapshot))

  watch([draftConfig, fallbackConfigText], () => {
    if (dialog.value.kind === 'closed') return
    dialog.value.session.editedVersion++
  }, { deep: true, flush: 'sync' })

  const isRowBusy = (item: ExtensionConfigurationRow): boolean =>
    typeof item.extension?.key === 'string' && savingExtensionKeys.value.has(item.extension.key)

  const setRowBusy = (extensionKey: string, busy: boolean): void => {
    const nextKeys = new Set(savingExtensionKeys.value)
    if (busy) {
      nextKeys.add(extensionKey)
    } else {
      nextKeys.delete(extensionKey)
    }
    savingExtensionKeys.value = nextKeys
  }

  const openConfigure = (item: TRow): void => {
    if (!item.extension) {
      return
    }

    const selected: Ref<TRow | null> = ref(null)
    selected.value = item
    draftConfig.value = JSON.parse(JSON.stringify(item.config ?? {})) as GcsExtensionJsonConfig
    fallbackConfigText.value = JSON.stringify(draftConfig.value, null, 2)
    fallbackConfigErrorKey.value = ''
    dialog.value = { kind: 'editing', session: { id: ++nextSession, item: selected, acceptedSnapshot: JSON.stringify(draftConfig.value), editedVersion: 0 } }
  }

  const resetConfigureState = (): void => {
    dialog.value = { kind: 'closed' }
    fallbackConfigErrorKey.value = ''
  }

  const captureSession = (): number | null => dialog.value.kind === 'closed' ? null : dialog.value.session.id

  const captureDraftSave = (): ConfigurationSave | null => {
    if (dialog.value.kind === 'closed') return null
    return {
      session: dialog.value.session.id,
      version: dialog.value.session.editedVersion,
      snapshot: JSON.stringify(draftConfig.value)
    }
  }

  const acceptCommittedDraft = (save: ConfigurationSave | null): boolean => {
    if (!save || dialog.value.kind === 'closed' || dialog.value.session.id !== save.session) return false
    const session = dialog.value.session
    if (session.editedVersion === save.version) {
      resetConfigureState()
      return true
    }
    dialog.value = { kind: 'editing', session: { ...session, acceptedSnapshot: save.snapshot } }
    return false
  }

  const closeSession = (session: number | null): boolean => {
    if (session === null || captureSession() !== session) return false
    resetConfigureState()
    return true
  }

  const setSessionSaving = (session: number | null, saving: boolean): boolean => {
    if (session === null || captureSession() !== session) return false
    isSavingConfiguration.value = saving
    return true
  }

  const closeConfigure = (): void => {
    if (dialog.value.kind === 'closed') return
    if (isSavingConfiguration.value) {
      return
    }

    if (isDirty.value) {
      isDiscardConfirmOpen.value = true
      return
    }

    resetConfigureState()
  }

  const cancelDiscardChanges = (): void => {
    isDiscardConfirmOpen.value = false
  }

  const discardChanges = (): void => {
    resetConfigureState()
  }

  const updateFallbackConfig = (value: string | number): void => {
    fallbackConfigText.value = String(value || '{}')

    try {
      draftConfig.value = JSON.parse(fallbackConfigText.value) as GcsExtensionJsonConfig
      fallbackConfigErrorKey.value = ''
    } catch {
      fallbackConfigErrorKey.value = 'apiErrors.request.invalid_json'
    }
  }

  const postJson = async <TResponse = void>(
    url: string,
    method: 'PATCH' | 'POST',
    body: unknown
  ): Promise<TResponse> => {
    const response = await fetch(getClientRequestUrl(url), {
      method,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (response.status === 204) return undefined as TResponse
    return await response.json() as TResponse
  }

  return {
    isModalOpen,
    isDiscardConfirmOpen,
    selectedItem,
    draftConfig,
    fallbackConfigText,
    fallbackConfigError,
    isSavingConfiguration,
    savingExtensionKeys,
    isDirty,
    isRowBusy,
    setRowBusy,
    openConfigure,
    captureSession,
    captureDraftSave,
    acceptCommittedDraft,
    closeSession,
    setSessionSaving,
    resetConfigureState,
    closeConfigure,
    cancelDiscardChanges,
    discardChanges,
    updateFallbackConfig,
    postJson
  }
}
