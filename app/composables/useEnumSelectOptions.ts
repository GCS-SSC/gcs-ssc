import { nanoid } from 'nanoid'
import { computed, toValue, watch } from 'vue'
import type { EnumKey } from '~/types/enums'
import type { MaybeRefOrGetter } from 'vue'

interface EnumSelectOptions {
  name: MaybeRefOrGetter<EnumKey>
  enabled?: MaybeRefOrGetter<boolean | undefined>
  showAllOption?: MaybeRefOrGetter<boolean | undefined>
  allOptionLabel?: MaybeRefOrGetter<string | undefined>
}

const translationNamespaceByEnum: Partial<Record<EnumKey, EnumKey>> = {
  execution_entity_type: 'entity_type',
  transfer_payment_config_entity_type: 'entity_type',
  transfer_payment_review_setup_entity_type: 'entity_type',
  transfer_payment_document_template_entity_type: 'entity_type'
}

/**
 * Returns localized options for an enum selector.
 *
 * @param options Reactive enum selection options.
 * @returns Localized enum items and their loading state.
 */
export const useEnumSelectOptions = (options: EnumSelectOptions) => {
  const { t, locale } = useI18n()

  const fetchKey = `enum-select-${nanoid()}`
  const enumName = computed(() => toValue(options.name))
  const enabled = computed(() => toValue(options.enabled) !== false)
  const translationNamespace = computed(() => translationNamespaceByEnum[enumName.value] ?? enumName.value)
  const showAllOption = computed(() => Boolean(toValue(options.showAllOption)))
  const allOptionLabel = computed(() => toValue(options.allOptionLabel))

  const { data: rawItems, execute, clear } = useFetch<string[], Error, '/api/metadata/enums'>('/api/metadata/enums', {
    key: fetchKey,
    query: computed(() => ({ name: enumName.value })),
    immediate: enabled.value,
    watch: false
  })
  watch([enumName, enabled], ([currentName, isEnabled], [previousName, wasEnabled]) => {
    if (currentName !== previousName) {
      clear()
    }

    if (isEnabled && (currentName !== previousName || !wasEnabled)) {
      void execute()
    }
  })

  const currencyDisplayNames = computed(() => {
    if (enumName.value !== 'currency_codes') {
      return null
    }

    try {
      return new Intl.DisplayNames([locale.value], { type: 'currency' })
    } catch {
      return null
    }
  })

  const countryDisplayNames = computed(() => {
    if (enumName.value !== 'countries') {
      return null
    }

    try {
      return new Intl.DisplayNames([locale.value], { type: 'region' })
    } catch {
      return null
    }
  })

  const items = computed(() => {
    if (!rawItems.value) {
      return []
    }

    const mapped = rawItems.value.map((val: string) => ({
      label: (() => {
        if (enumName.value === 'currency_codes') {
          if (val === 'all') {
            return allOptionLabel.value || t('common.all')
          }

          return currencyDisplayNames.value?.of(val.toUpperCase()) ?? val.toUpperCase()
        }

        if (enumName.value === 'countries') {
          return countryDisplayNames.value?.of(val.toUpperCase()) ?? t(`enums.${translationNamespace.value}.${val}`)
        }

        return t(`enums.${translationNamespace.value}.${val}`)
      })(),
      value: val
    }))

    if (showAllOption.value) {
      mapped.unshift({
        label: allOptionLabel.value || t('common.all_statuses'),
        value: 'all'
      })
    }

    return mapped
  })

  return { items }
}
