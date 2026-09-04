import type { ComputedRef, Ref } from 'vue'
import { computed, unref } from 'vue'
import type { FetchError } from 'ofetch'
import type { ExtensionCreateActionItem, ExtensionCreateActionsResponse } from '~~/shared/types/schemas/extensions'
import type { GcsExtensionCreateOperation } from '~~/shared/utils/extensions'

interface UseExtensionCreateActionsOptions {
  operation: GcsExtensionCreateOperation
  agreementId: string | Ref<string> | ComputedRef<string>
}

/**
 * Fetches extension create actions and identifies conflicting replacement actions.
 *
 * @param options - Extension operation and agreement identifier.
 * @returns Extension actions and their fetch state.
 */
export const useExtensionCreateActions = (options: UseExtensionCreateActionsOptions) => {
  const { locale } = useI18n()

  const query = computed(() => ({
    operation: options.operation,
    agreementId: unref(options.agreementId)
  }))
  const { data, status, error, refresh } = useFetch<ExtensionCreateActionsResponse, FetchError, string>(
    '/api/extensions/create-actions',
    {
      query,
      /**
       * Builds the empty response used before the request completes.
       *
       * @returns Empty extension action response.
       */
      default: (): ExtensionCreateActionsResponse => ({
        operation: options.operation,
        items: [],
        conflict: false
      }),
      server: false,
      watch: [() => options.operation, () => unref(options.agreementId)]
    }
  )

  const items = computed<ExtensionCreateActionItem[]>(() => data.value?.items ?? [])
  const appendActions = computed(() => items.value.filter(item => item.mode === 'append'))
  const replaceActions = computed(() => items.value.filter(item => item.mode === 'replace'))
  const replacementAction = computed(() => replaceActions.value.length === 1 ? replaceActions.value[0] ?? null : null)
  const hasReplacement = computed(() => Boolean(replacementAction.value))
  const hasConflict = computed(() => data.value?.conflict === true)

  /**
   * Returns the localized action label.
   *
   * @param item - Extension action to label.
   * @returns Localized action label.
   */
  const labelForAction = (item: ExtensionCreateActionItem): string => {
    if (locale.value === 'fr') {
      return item.label.fr
    }

    return item.label.en
  }

  return {
    items,
    appendActions,
    replacementAction,
    hasReplacement,
    hasConflict,
    status,
    error,
    refresh,
    labelForAction
  }
}
