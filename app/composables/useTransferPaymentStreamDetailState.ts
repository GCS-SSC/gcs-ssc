import { useStreamCustomFieldSettings } from '~/composables/useStreamCustomFieldSettings'
import TransferPaymentStreamClausesTab from '~/components/TransferPayment/TransferPaymentStreamClausesTab.vue'
import { useStreamClauseLinks } from '~/composables/useStreamClauseLinks'
import TransferPaymentStreamBudgetManagementTab from '~/components/TransferPayment/TransferPaymentStreamBudgetManagementTab.vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import CustomFieldsTab from '~/components/TransferPayment/CustomFieldsTab.vue'
import StreamSubmissionPolicy from '~/components/TransferPayment/StreamSubmissionPolicy.vue'
import type { FetchError } from 'ofetch'
import type { TransferPaymentStreamBudgetManagement, TransferPaymentStreamRiskManagement, TransferPaymentProfileItem, TransferPaymentStreamItem } from '~~/shared/types/schemas'
import type { TabMap } from '~~/shared/types/ui'
import type { Scope } from '~~/shared/utils/scopes'
import TransferPaymentAmendmentSubtypesTab from '~/components/TransferPayment/TransferPaymentAmendmentSubtypesTab.vue'
import TransferPaymentAgreementSubtypesTab from '~/components/TransferPayment/TransferPaymentAgreementSubtypesTab.vue'
import TransferPaymentDocumentTemplatesTab from '~/components/TransferPayment/TransferPaymentDocumentTemplatesTab.vue'
import TransferPaymentAreasOfExpertiseTab from '~/components/TransferPayment/AreasOfExpertiseTab.vue'
import TransferPaymentFinancialLimitsTab from '~/components/TransferPayment/TransferPaymentFinancialLimitsTab.vue'
import TransferPaymentMonitorTypesTab from '~/components/TransferPayment/TransferPaymentMonitorTypesTab.vue'
import TransferPaymentWorkflowSetupsTab from '~/components/TransferPayment/TransferPaymentWorkflowSetupsTab.vue'
import TransferPaymentReviewSetupsTab from '~/components/TransferPayment/TransferPaymentReviewSetupsTab.vue'
import TransferPaymentStreamAmendmentTypesTab from '~/components/TransferPayment/TransferPaymentStreamAmendmentTypesTab.vue'
import TransferPaymentStreamBudgetsTab from '~/components/TransferPayment/TransferPaymentStreamBudgetsTab.vue'
import TransferPaymentStreamChartOfAccountsTab from '~/components/TransferPayment/TransferPaymentStreamChartOfAccountsTab.vue'
import TransferPaymentStreamCommitmentTypesTab from '~/components/TransferPayment/TransferPaymentStreamCommitmentTypesTab.vue'
import TransferPaymentStreamCostLineItemsTab from '~/components/TransferPayment/TransferPaymentStreamCostLineItemsTab.vue'
import TransferPaymentStreamGeneralTab from '~/components/TransferPayment/TransferPaymentStreamGeneralTab.vue'
import TransferPaymentStreamHoldbackBasesTab from '~/components/TransferPayment/TransferPaymentStreamHoldbackBasesTab.vue'
import TransferPaymentStreamRecipientsTab from '~/components/TransferPayment/TransferPaymentStreamRecipientsTab.vue'
import TransferPaymentStreamRiskManagementTab from '~/components/TransferPayment/TransferPaymentStreamRiskManagementTab.vue'
import TransferPaymentStreamRiskRatingsTab from '~/components/TransferPayment/TransferPaymentStreamRiskRatingsTab.vue'
import TransferPaymentStreamFundingSubtypesTab from '~/components/TransferPayment/TransferPaymentStreamFundingSubtypesTab.vue'
import StreamExtensionsTab from '~/components/Extension/StreamExtensionsTab.vue'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import { appRouteLocations } from '~/utils/route-locations'

export const TRANSFER_PAYMENT_STREAM_TAB_KEYS = {
  customFields: 'custom_fields.title',
  activityCustomFields: 'custom_fields.activity_title',
  claimCustomFields: 'custom_fields.claim_title',
  forecastCustomFields: 'custom_fields.forecast_title',
  submissionPolicy: 'submission.policy.title',
  general: 'agency.tabs.general',
  holdbackBases: 'transfer_payment.holdback_bases',
  budgets: 'transfer_payment.budgets',
  budgetManagement: 'transfer_payment.budget_management.title',
  recipients: 'transfer_payment.eligible_recipients',
  costItems: 'transfer_payment.cost_category_line_items',
  amendmentTypes: 'transfer_payment.amendment_types',
  amendmentSubtypes: 'transfer_payment.amendment_subtypes',
  agreementSubtypes: 'transfer_payment.agreement_subtypes',
  chartOfAccounts: 'transfer_payment.chart_of_accounts.title',
  commitmentTypes: 'transfer_payment.commitment_types.title',
  monitorTypes: 'transfer_payment.monitor_types',
  riskManagement: 'transfer_payment.risk_management.title',
  riskRatings: 'transfer_payment.risk_ratings',
  fundingSubtypes: 'agency.funding_types.subtypes',
  expertise: 'transfer_payment.areas_of_expertise',
  financialLimits: 'transfer_payment.financial_limits',
  reviewSetups: 'transfer_payment.review_setups',
  documentTemplates: 'transfer_payment.document_templates.title',
  clauses: 'clauses.title',
  workflowSetups: 'workflow.title',
  extensions: 'extensions.tab'
} as const

/**
 * Builds transfer payment stream detail page state.
 *
 * @param id - Transfer payment profile id.
 * @param streamId - Transfer payment stream id.
 * @param options - Detail-read lifecycle options.
 * @param options.immediate - Whether the ancestor route should load its own detail state immediately.
 * @returns Profile/stream data, permissions, tabs, and breadcrumb state.
 *
 * @example
 * ```typescript
 * const state = await useTransferPaymentStreamDetailState(profileId, streamId)
 * ```
 */
export const useTransferPaymentStreamDetailState = (
  id: string,
  streamId: string,
  options: { immediate?: boolean } = {}
) => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const route = useRoute()
  const { can } = useCan()
  const { getHeroCollapsed } = useDashboard()
  const { getBilingualValue } = useBilingualValue()

  const { data: profile, error: profileError, status: profileStatus, refresh: refreshProfile } = useFetch<TransferPaymentProfileItem, FetchError, string>(
    `/api/transfer-payments/${id}`,
    { immediate: options.immediate ?? true }
  )
  const { data: stream, error: streamError, status: streamStatus, refresh: refreshStream } = useFetch<
    TransferPaymentStreamItem & TransferPaymentStreamRiskManagement & { parent_name_en?: string; parent_name_fr?: string },
    FetchError,
    string
  >(`/api/transfer-payments/${id}/streams/${streamId}`, { immediate: options.immediate ?? true })

  const profileScope = computed<Scope>(() => {
    if (!profile.value) return { type: 'global' }
    return {
      type: 'entity',
      agencyId: String(profile.value.egcs_tp_agency),
      path: [{ type: 'transfer_payment', id: String(profile.value.id) }]
    }
  })

  const canUpdateChild = computed(() => (profile.value ? can('transfer_payment', 'update', profileScope.value) : false))
  const canCreateChild = computed(() => (profile.value ? can('transfer_payment', 'create', profileScope.value) : false))
  const canDeleteChild = computed(() => (profile.value ? can('transfer_payment', 'delete', profileScope.value) : false))
  const agencyId = computed<string | null>(() => {
    if (!profile.value) {
      return null
    }

    return String(profile.value.egcs_tp_agency)
  })

  const settingsContext = useActionContext({
    identity: [() => id, () => streamId, () => profile.value?.egcs_tp_agency],
    authority: canUpdateChild,
    eligible: () => profile.value?.id === id && stream.value?.id === streamId
  })
  const settingsPending = ref(false)
  /**
   * Persists Stream settings and accepts the acknowledged draft even if the section closes.
   * @param draft - Settings captured by the currently mounted editor.
   * @returns Whether the response still belongs to the current Stream context.
   */
  const saveStreamSettings = async (
    draft: TransferPaymentStreamBudgetManagement | TransferPaymentStreamRiskManagement
  ): Promise<boolean> => {
    const operation = settingsContext.capture()
    if (!operation?.canDispatch() || settingsPending.value) return false
    settingsPending.value = true
    try {
      const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${id}/streams/${streamId}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft)
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (!operation.isCurrent() || !stream.value) return false
      stream.value = { ...stream.value, ...draft }
      return true
    } finally {
      settingsPending.value = false
    }
  }

  const tabMap: TabMap = new Map([
    [
      'general',
      {
        key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.general,
        icon: 'i-lucide-info',
        component: TransferPaymentStreamGeneralTab,
        getProps: () => (stream.value ? { stream: stream.value } : {})
      }
    ],
    [
      'holdbackBases',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.holdbackBases, icon: 'i-lucide-percent', component: TransferPaymentStreamHoldbackBasesTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value, canCreateChild: canCreateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'budgets',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.budgets, icon: 'i-lucide-wallet', component: TransferPaymentStreamBudgetsTab, getProps: () => ({ transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'budget-management',
      {
        key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.budgetManagement,
        value: 'budget-management',
        icon: 'i-lucide-settings-2',
        component: TransferPaymentStreamBudgetManagementTab,
        /** @returns The parent-owned write and current persisted Stream. */
        getProps: () => ({
          stream: stream.value,
          actionContext: settingsContext,
          canUpdateChild: canUpdateChild.value,
          pending: settingsPending.value,
          saveBudgetManagement: saveStreamSettings
        })
      }
    ],
    [
      'recipients',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.recipients, icon: 'i-lucide-users', component: TransferPaymentStreamRecipientsTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'costItems',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.costItems, icon: 'i-lucide-list', component: TransferPaymentStreamCostLineItemsTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'fundingSubtypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.fundingSubtypes, icon: 'i-lucide-hand-coins', component: TransferPaymentStreamFundingSubtypesTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value, canCreateChild: canCreateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'amendmentTypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.amendmentTypes, icon: 'i-lucide-file-edit', component: TransferPaymentStreamAmendmentTypesTab, getProps: () => ({ transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'amendmentSubtypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.amendmentSubtypes, icon: 'i-lucide-file-edit', component: TransferPaymentAmendmentSubtypesTab, getProps: () => ({ transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'agreementSubtypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.agreementSubtypes, icon: 'i-lucide-file-stack', component: TransferPaymentAgreementSubtypesTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'chartOfAccounts',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.chartOfAccounts, value: 'chart-of-accounts', icon: 'i-lucide-table-properties', component: TransferPaymentStreamChartOfAccountsTab, getProps: () => ({ profileId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'commitmentTypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.commitmentTypes, value: 'commitment-types', icon: 'i-lucide-tags', component: TransferPaymentStreamCommitmentTypesTab, getProps: () => ({ transferPaymentId: id, streamId, canCreateChild: canCreateChild.value, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'monitorTypes',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.monitorTypes, icon: 'i-lucide-clipboard-check', component: TransferPaymentMonitorTypesTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value ?? '', canCreateChild: canCreateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    ['customFields', { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.customFields, value: 'custom-fields', icon: 'i-lucide-list-filter', component: CustomFieldsTab, getProps: () => ({ key: 'custom-fields', transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, catalog: customFieldSettings.agreement }) }],
    ['activityCustomFields', { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.activityCustomFields, value: 'activity-custom-fields', icon: 'i-lucide-list-todo', component: CustomFieldsTab, getProps: () => ({ key: 'activity-custom-fields', transferPaymentId: id, streamId, target: 'activity', canUpdateChild: canUpdateChild.value, catalog: customFieldSettings.activity }) }],
    ['claimCustomFields', { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.claimCustomFields, value: 'claim-custom-fields', icon: 'i-lucide-receipt', component: CustomFieldsTab, getProps: () => ({ key: 'claim-custom-fields', transferPaymentId: id, streamId, target: 'claim', canUpdateChild: canUpdateChild.value, catalog: customFieldSettings.claim }) }],
    ['forecastCustomFields', { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.forecastCustomFields, value: 'forecast-custom-fields', icon: 'i-lucide-chart-column', component: CustomFieldsTab, getProps: () => ({ key: 'forecast-custom-fields', transferPaymentId: id, streamId, target: 'forecast', canUpdateChild: canUpdateChild.value, catalog: customFieldSettings.forecast }) }],
    ['submissionPolicy', { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.submissionPolicy, value: 'submission-policy', icon: 'i-lucide-inbox', component: StreamSubmissionPolicy, getProps: () => ({ canUpdate: canDeleteChild.value, settings: customFieldSettings.policy }) }],
    [
      'risk-management',
      {
        key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.riskManagement,
        value: 'risk-management',
        icon: 'i-lucide-shield-check',
        component: TransferPaymentStreamRiskManagementTab,
        /** @returns The current Stream settings and their parent-owned save operation. */
        getProps: () => ({
          stream: stream.value,
          transferPaymentId: id,
          actionContext: settingsContext,
          canUpdateChild: canUpdateChild.value,
          pending: settingsPending.value,
          saveRiskManagement: saveStreamSettings
        })
      }
    ],
    [
      'riskRatings',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.riskRatings, icon: 'i-lucide-gauge', component: TransferPaymentStreamRiskRatingsTab, getProps: () => ({ transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'expertise',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.expertise, icon: 'i-lucide-brain-circuit', component: TransferPaymentAreasOfExpertiseTab, getProps: () => ({ transferPaymentId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'financialLimits',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.financialLimits, icon: 'i-lucide-dollar-sign', component: TransferPaymentFinancialLimitsTab, getProps: () => ({ profileId: id, streamId, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'reviewSetups',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.reviewSetups, icon: 'i-lucide-clipboard-list', component: TransferPaymentReviewSetupsTab, getProps: () => ({ showHeader: false, transferPaymentId: id, streamId, agencyId: agencyId.value ?? undefined, canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'clauses',
      {
        key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.clauses,
        value: 'clauses',
        icon: 'i-lucide-list-ordered',
        component: TransferPaymentStreamClausesTab,
        getProps: () => clauseLinks.props.value
      }
    ],
    [
      'document-templates',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.documentTemplates, value: 'document-templates', icon: 'i-lucide-files', component: TransferPaymentDocumentTemplatesTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value ?? '', canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'workflowSetups',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.workflowSetups, value: 'workflow-setups', icon: 'i-lucide-git-branch', component: TransferPaymentWorkflowSetupsTab, getProps: () => ({ transferPaymentId: id, streamId, agencyId: agencyId.value ?? '', canUpdateChild: canUpdateChild.value, canDeleteChild: canDeleteChild.value }) }
    ],
    [
      'extensions',
      { key: TRANSFER_PAYMENT_STREAM_TAB_KEYS.extensions, icon: 'i-lucide-puzzle', component: StreamExtensionsTab, getProps: () => ({ streamId, transferPaymentId: id, agencyId: agencyId.value, canUpdateChild: canUpdateChild.value }) }
    ]
  ])
  const { tabs, selectedTab, selectedTabKey, activeTabComponent, activeTabProps } = useRouteTabMap({
    tabMap,
    defaultTabId: 'general',
    enabled: computed(() => (
      (!('schemaId' in route.params) || typeof route.params.schemaId !== 'string')
      && (!('templateId' in route.params) || typeof route.params.templateId !== 'string')
      && (!('recommendationSetupId' in route.params) || typeof route.params.recommendationSetupId !== 'string')
    )),
    queryKey: 'section'
  })

  const customFieldSettings = useStreamCustomFieldSettings({
    baseUrl: `/api/transfer-payments/${id}/streams/${streamId}`,
    canUpdate: canUpdateChild,
    canConfigurePolicy: canDeleteChild,
    /** @returns The Stream settings section that activates its initial read. */
    selected: () => {
      switch (selectedTabKey.value) {
        case TRANSFER_PAYMENT_STREAM_TAB_KEYS.customFields: return 'agreement'
        case TRANSFER_PAYMENT_STREAM_TAB_KEYS.activityCustomFields: return 'activity'
        case TRANSFER_PAYMENT_STREAM_TAB_KEYS.claimCustomFields: return 'claim'
        case TRANSFER_PAYMENT_STREAM_TAB_KEYS.forecastCustomFields: return 'forecast'
        case TRANSFER_PAYMENT_STREAM_TAB_KEYS.submissionPolicy: return 'policy'
        default: return null
      }
    }
  })

  const clauseLinks = useStreamClauseLinks(id, streamId, agencyId, canUpdateChild,
    () => selectedTabKey.value === TRANSFER_PAYMENT_STREAM_TAB_KEYS.clauses)

  const breadcrumbItems = computed(() => [
    { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
    { label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(id)) },
    { label: getBilingualValue(stream.value, 'egcs_tp_name') }
  ])

  const isHeroCollapsed = getHeroCollapsed('transfer-payment-stream-detail')

  return {
    profile,
    stream,
    profileError,
    streamError,
    profileStatus,
    streamStatus,
    refreshProfile,
    refreshStream,
    canCreateChild,
    canUpdateChild,
    canDeleteChild,
    tabs,
    selectedTab,
    selectedTabKey,
    activeTabComponent,
    activeTabProps,
    breadcrumbItems,
    isHeroCollapsed
  }
}
