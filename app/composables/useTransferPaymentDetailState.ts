import { ref } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { TransferPaymentProfileItem } from '~~/shared/types/schemas'
import type { TabMap } from '~~/shared/types/ui'
import type { Scope } from '~~/shared/utils/scopes'
import TransferPaymentBudgetsTab from '~/components/TransferPayment/TransferPaymentBudgetsTab.vue'
import TransferPaymentGeneralTab from '~/components/TransferPayment/TransferPaymentGeneralTab.vue'
import TransferPaymentObjectivesTab from '~/components/TransferPayment/TransferPaymentObjectivesTab.vue'
import TransferPaymentOutcomesTab from '~/components/TransferPayment/TransferPaymentOutcomesTab.vue'
import TransferPaymentPerformanceIndicatorsTab from '~/components/TransferPayment/TransferPaymentPerformanceIndicatorsTab.vue'
import TransferPaymentStreamsTab from '~/components/TransferPayment/TransferPaymentStreamsTab.vue'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import { appRouteLocations } from '~/utils/route-locations'

export const TRANSFER_PAYMENT_DETAIL_TAB_KEYS = {
  general: 'agency.tabs.general',
  streams: 'transfer_payment.streams',
  outcomes: 'transfer_payment.outcomes',
  objectives: 'transfer_payment.objectives',
  budgets: 'transfer_payment.budgets',
  indicators: 'transfer_payment.performance_indicators'
} as const

/**
 * Builds transfer payment profile detail page state.
 *
 * @param id - Transfer payment profile id.
 * @returns Profile data, permissions, tabs, and breadcrumb state.
 *
 * @example
 * ```typescript
 * const state = await useTransferPaymentDetailState(profileId)
 * ```
 */
export const useTransferPaymentDetailState = (id: string) => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const route = useRoute()
  const { can } = useCan()
  const { getHeroCollapsed } = useDashboard()
  const { formatDate } = useDateHelpers()
  const { getBilingualValue } = useBilingualValue()

  const { data: profile, error, status, refresh: refreshProfile } = useFetch<TransferPaymentProfileItem, FetchError, string>(
    `/api/transfer-payments/${id}`
  )

  const profileScope = computed<Scope>(() => {
    if (!profile.value) return { type: 'global' }
    return {
      type: 'entity',
      agencyId: String(profile.value.egcs_tp_agency),
      path: [{ type: 'transfer_payment', id: String(profile.value.id) }]
    }
  })

  const canUpdateProfile = computed(() => profile.value ? can('transfer_payment', 'update', profileScope.value) : false)
  const canUpdateChild = computed(() => profile.value ? can('transfer_payment', 'update', profileScope.value) : false)
  const canDeleteChild = computed(() => profile.value ? can('transfer_payment', 'delete', profileScope.value) : false)
  const outcomesRefreshKey: Ref<number> = ref(0)
  const agencyId = computed<string | null>(() => {
    if (!profile.value?.egcs_tp_agency) {
      return null
    }

    return String(profile.value.egcs_tp_agency)
  })

  const tabMap: TabMap = new Map([
    [
      'general',
      {
        key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.general,
        icon: 'i-lucide-info',
        component: TransferPaymentGeneralTab,
        getProps: () => (profile.value ? { profile: profile.value, formatDate } : {})
      }
    ],
    [
      'streams',
      { key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.streams, icon: 'i-lucide-layers', component: TransferPaymentStreamsTab, getProps: () => ({ programId: id, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'outcomes',
      { key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.outcomes, icon: 'i-lucide-target', component: TransferPaymentOutcomesTab, getProps: () => ({ programId: id, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'objectives',
      { key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.objectives, icon: 'i-lucide-list-checks', component: TransferPaymentObjectivesTab, getProps: () => ({ programId: id, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'budgets',
      { key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.budgets, icon: 'i-lucide-wallet', component: TransferPaymentBudgetsTab, getProps: () => ({ programId: id, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'indicators',
      { key: TRANSFER_PAYMENT_DETAIL_TAB_KEYS.indicators, icon: 'i-lucide-line-chart', component: TransferPaymentPerformanceIndicatorsTab, getProps: () => ({ programId: id, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value, outcomesRefreshKey: outcomesRefreshKey.value }) }
    ]
  ])
  const { tabs, selectedTab, selectedTabKey, activeTabComponent, activeTabProps } = useRouteTabMap({
    tabMap,
    defaultTabId: 'general',
    enabled: computed(() => Boolean(profile.value) && typeof route.params.streamId !== 'string'),
    queryKey: 'section'
  })

  const handleOutcomesUpdated = () => {
    outcomesRefreshKey.value += 1
  }

  const breadcrumbItems = computed(() => [
    { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
    { label: getBilingualValue(profile.value, 'egcs_tp_name') }
  ])

  const isHeroCollapsed = getHeroCollapsed('transfer-payment-detail')

  return {
    profile,
    error,
    status,
    refreshProfile,
    canUpdateProfile,
    canUpdateChild,
    canDeleteChild,
    tabs,
    selectedTab,
    selectedTabKey,
    activeTabComponent,
    activeTabProps,
    handleOutcomesUpdated,
    breadcrumbItems,
    isHeroCollapsed,
    formatDate
  }
}
