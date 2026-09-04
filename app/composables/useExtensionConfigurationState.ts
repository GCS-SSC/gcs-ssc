/* eslint-disable jsdoc/require-jsdoc */
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

/**
 * Shared modal and JSON editor state used by extension configuration tabs.
 *
 * @returns State and helpers for extension configuration modals.
 */
export const useExtensionConfigurationState = <TRow extends ExtensionConfigurationRow>() => {
  const { t } = useI18n()
  const isModalOpen: Ref<boolean> = ref(false)
  const isDiscardConfirmOpen: Ref<boolean> = ref(false)
  const selectedItem: Ref<TRow | null> = ref(null)
  const draftConfig: Ref<GcsExtensionJsonConfig> = ref({})
  const initialConfigSnapshot: Ref<string> = ref('{}')
  const fallbackConfigText: Ref<string> = ref('{}')
  const fallbackConfigError: Ref<string> = ref('')
  const isSavingConfiguration: Ref<boolean> = ref(false)
  const savingExtensionKeys: Ref<Set<string>> = ref(new Set())

  const isDirty = computed(() => JSON.stringify(draftConfig.value) !== initialConfigSnapshot.value)

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

    selectedItem.value = item
    draftConfig.value = JSON.parse(JSON.stringify(item.config ?? {})) as GcsExtensionJsonConfig
    initialConfigSnapshot.value = JSON.stringify(draftConfig.value)
    fallbackConfigText.value = JSON.stringify(draftConfig.value, null, 2)
    fallbackConfigError.value = ''
    isModalOpen.value = true
  }

  const resetConfigureState = (): void => {
    isModalOpen.value = false
    isDiscardConfirmOpen.value = false
    selectedItem.value = null
    initialConfigSnapshot.value = '{}'
    fallbackConfigError.value = ''
  }

  const closeConfigure = (): void => {
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
      fallbackConfigError.value = ''
    } catch {
      fallbackConfigError.value = t('apiErrors.request.invalid_json')
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
    resetConfigureState,
    closeConfigure,
    cancelDiscardChanges,
    discardChanges,
    updateFallbackConfig,
    postJson
  }
}
