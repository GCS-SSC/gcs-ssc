import { computed, ref } from 'vue'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'
import type { TabMap } from '~~/shared/types/ui'
import ApplicantRecipientGeneralTab from '~/components/ApplicantRecipient/ApplicantRecipientGeneralTab.vue'
import CommonAssignedUsers from '~/components/Common/AssignedUsers.vue'
import CommonAttachmentsTab from '~/components/Common/AttachmentsTab.vue'
import ApplicantRecipientAgencyFinancialIdsTab from '~/components/ApplicantRecipient/ApplicantRecipientAgencyFinancialIdsTab.vue'
import ApplicantRecipientRegistriesTab from '~/components/ApplicantRecipient/ApplicantRecipientRegistriesTab.vue'
import ApplicantRecipientOtherNamesTab from '~/components/ApplicantRecipient/ApplicantRecipientOtherNamesTab.vue'
import ApplicantRecipientAddressesTab from '~/components/ApplicantRecipient/ApplicantRecipientAddressesTab.vue'
import ApplicantRecipientContactsTab from '~/components/ApplicantRecipient/ApplicantRecipientContactsTab.vue'
import ApplicantRecipientReviewsTab from '~/components/ApplicantRecipient/ApplicantRecipientReviewsTab.vue'
import ApplicantRecipientAgreementsTab from '~/components/ApplicantRecipient/ApplicantRecipientAgreementsTab.vue'
import ApplicantRecipientFundingHistoryTab from '~/components/ApplicantRecipient/ApplicantRecipientFundingHistoryTab.vue'
import ExtensionEntityTabPanel from '~/components/Extension/ExtensionEntityTabPanel.vue'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type ApplicantRecipientDetailProfile = ApplicantRecipientProfileRow

export const APPLICANT_RECIPIENT_DETAIL_TAB_KEYS = {
  general: 'agency.tabs.general',
  agencyFinancialIds: 'applicant_recipient.agency_financial_ids.title',
  registries: 'applicant_recipient.registries.title',
  otherNames: 'applicant_recipient.other_names.title',
  addresses: 'applicant_recipient.addresses.title',
  contacts: 'applicant_recipient.contacts.title',
  reviews: 'applicant_recipient.reviews.title',
  agreements: 'applicant_recipient.agreements.title',
  fundingHistory: 'applicant_recipient.funding_history.title',
  attachments: 'attachments.title',
  assignments: 'assignments.title'
} as const

/**
 * Builds proponent detail-page state, including tabs and breadcrumb metadata.
 *
 * @param id - Applicant recipient profile id.
 * @returns Fetched profile state plus tab metadata for the detail view.
 */
export const useApplicantRecipientDetailState = (id: string) => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const { getHeroCollapsed } = useDashboard()
  const { getBilingualValue } = useBilingualValue()

  const profile = ref<ApplicantRecipientDetailProfile | null>(null)
  const error = ref<unknown | null>(null)
  const status = ref<'pending' | 'success' | 'error'>('pending')

  /** Fetches the profile without registering a route-blocking async dependency. */
  const refreshProfile = async () => {
    status.value = 'pending'
    error.value = null
    try {
      const response = await fetch(getClientRequestUrl(`/api/applicant-recipients/${id}`))
      if (!response.ok) await throwFetchResponseError(response)
      profile.value = await response.json() as ApplicantRecipientDetailProfile
      status.value = 'success'
    } catch (fetchError: unknown) {
      profile.value = null
      error.value = fetchError
      status.value = 'error'
    }
  }

  queueMicrotask(() => {
    void refreshProfile()
  })
  const { items: extensionItems, tabs: extensionTabs } = useExtensionEntityTabs({
    target: 'proponent',
    applicantRecipientId: id
  })

  /**
   * Builds shared child-record tab props from the current profile permission payload.
   *
   * @returns Child tab props for create, update, and delete capabilities.
   */
  const getChildRecordTabProps = () => ({
    applicantRecipientId: id,
    canCreate: Boolean(profile.value?.can_create_child_records),
    canUpdate: Boolean(profile.value?.can_update_child_records),
    canDelete: Boolean(profile.value?.can_delete_child_records)
  })

  /**
   * Builds Reviews tab props from the current profile permission payload.
   *
   * @returns Reviews tab props with applicantRecipientId and update capability.
   */
  const getReviewsTabProps = () => ({
    applicantRecipientId: id,
    canUpdate: Boolean(profile.value?.can_update)
  })

  const getAgreementsTabProps = () => ({
    applicantRecipientId: id
  })

  /**
   * Builds Funding History props from the current proponent and child-record permissions.
   *
   * @returns Funding History tab props.
   */
  const getFundingHistoryTabProps = () => ({
    applicantRecipientId: id,
    applicantRecipientLabel: getBilingualValue(
      profile.value,
      'egcs_ar_legalname',
      getBilingualValue(profile.value, 'egcs_ar_operatingname', id)
    ),
    canCreate: Boolean(profile.value?.can_create_child_records)
  })

  const tabMap = computed<TabMap>(() => {
    const nextTabMap: TabMap = new Map([
      [
        'general',
        {
          key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.general,
          icon: 'i-lucide-info',
          component: ApplicantRecipientGeneralTab,
          getProps: () => (profile.value ? { profile: profile.value } : {})
        }
      ]
    ])

    if (profile.value) {
      nextTabMap.set('agency-financial-ids', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.agencyFinancialIds,
        icon: 'i-lucide-landmark',
        component: ApplicantRecipientAgencyFinancialIdsTab,
        getProps: getChildRecordTabProps
      })
      nextTabMap.set('registries', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.registries,
        icon: 'i-lucide-id-card',
        component: ApplicantRecipientRegistriesTab,
        getProps: getChildRecordTabProps
      })
      nextTabMap.set('other-names', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.otherNames,
        icon: 'i-lucide-badge-info',
        component: ApplicantRecipientOtherNamesTab,
        getProps: getChildRecordTabProps
      })
      nextTabMap.set('addresses', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.addresses,
        icon: 'i-lucide-map-pinned',
        component: ApplicantRecipientAddressesTab,
        getProps: getChildRecordTabProps
      })
      nextTabMap.set('contacts', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.contacts,
        icon: 'i-lucide-contact',
        component: ApplicantRecipientContactsTab,
        getProps: getChildRecordTabProps
      })
      nextTabMap.set('reviews', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.reviews,
        icon: 'i-lucide-clipboard-list',
        component: ApplicantRecipientReviewsTab,
        getProps: getReviewsTabProps
      })
      nextTabMap.set('agreements', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.agreements,
        icon: 'i-lucide-file-signature',
        component: ApplicantRecipientAgreementsTab,
        getProps: getAgreementsTabProps
      })
      nextTabMap.set('funding-history', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.fundingHistory,
        icon: 'i-lucide-history',
        component: ApplicantRecipientFundingHistoryTab,
        getProps: getFundingHistoryTabProps
      })
      nextTabMap.set('attachments', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.attachments,
        value: 'attachments',
        icon: 'i-lucide-paperclip',
        component: CommonAttachmentsTab,
        getProps: () => ({ entityType: 'applicantrecipient', entityId: id })
      })
    }

    if (profile.value) {
      nextTabMap.set('assignments', {
        key: APPLICANT_RECIPIENT_DETAIL_TAB_KEYS.assignments,
        icon: 'i-lucide-users',
        component: CommonAssignedUsers,
        getProps: () => ({ entityType: 'applicantrecipient', entityId: id })
      })
    }

    for (const tab of extensionTabs.value) {
      const item = extensionItems.value.find(extensionItem => extensionItem.value === tab.value)
      if (!item) {
        continue
      }
      nextTabMap.set(tab.value, {
        key: tab.key,
        label: tab.label,
        icon: tab.icon,
        value: tab.value,
        component: ExtensionEntityTabPanel,
        getProps: () => ({ item })
      })
    }

    return nextTabMap
  })

  const { tabs, selectedTab, selectedTabKey, activeTabComponent, activeTabProps } = useRouteTabMap({
    tabMap,
    defaultTabId: 'general',
    enabled: computed(() => Boolean(profile.value))
  })

  const breadcrumbItems = computed(() => [
    { label: t('applicant_recipient.title'), to: localePath(appRouteLocations.proponents()) },
    { label: getBilingualValue(profile.value, 'egcs_ar_legalname', getBilingualValue(profile.value, 'egcs_ar_operatingname', id)) }
  ])

  const isHeroCollapsed = getHeroCollapsed('applicant-recipient-detail')

  return {
    profile,
    error,
    status,
    refreshProfile,
    tabs,
    selectedTab,
    selectedTabKey,
    activeTabComponent,
    activeTabProps,
    breadcrumbItems,
    isHeroCollapsed
  }
}
