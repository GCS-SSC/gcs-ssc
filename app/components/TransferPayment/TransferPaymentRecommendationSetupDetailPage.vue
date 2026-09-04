<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- page-local handlers */
import type { FetchError } from 'ofetch'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { Scope } from '~~/shared/utils/scopes'
import type { TransferPaymentProfileItem, TransferPaymentStreamItem, TransferPaymentStreamRecommendationSetupItem, TransferPaymentStreamRecommendationSetupMemberItem } from '~~/shared/types/schemas'
import { TransferPaymentStreamRecommendationSetupPatchSchema } from '~~/shared/types/schemas'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type {
  EditorMutationRunner,
  EditorMutationToken
} from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type SetupDetail = TransferPaymentStreamRecommendationSetupItem & {
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { t } = useI18n()
const { can } = useCan()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useToast()
const transferPaymentId = String(route.params.id)
const streamId = String(route.params.streamId)
const setupId = String(route.params.recommendationSetupId)
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${setupId}`
const { data: profile } = await useFetch<TransferPaymentProfileItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}`)
const { data: stream } = await useFetch<TransferPaymentStreamItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const { data: setup, error: loadError, status: loadStatus, refresh } = await useFetch<SetupDetail, FetchError, string>(endpoint)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const cloneSetup = (value: SetupDetail): SetupDetail => ({
  ...value,
  members: value.members.map(member => ({ ...member }))
})
const state: Ref<SetupDetail | null> = ref(setup.value ? cloneSetup(setup.value) : null)
const selectedSection: Ref<string> = ref('recommendation-identity')
const isMemberModalOpen: Ref<boolean> = ref(false)
const isSchemaCreateModalOpen: Ref<boolean> = ref(false)
const deletingMemberId: Ref<string | null> = ref(null)
const selectedMember: Ref<Partial<TransferPaymentStreamRecommendationSetupMemberItem> | null> = ref(null)
const schemaCreateState: Ref<Record<string, unknown> | null> = ref(null)
const formRef = useTemplateRef<{ validate: () => Promise<unknown> }>('recommendationSetupForm')
const isHeroCollapsed = getHeroCollapsed('transfer-payment-recommendation-setup-detail')
const validate = createValidator(TransferPaymentStreamRecommendationSetupPatchSchema)
const profileScope = computed<Scope>(() => ({ type: 'entity', agencyId: String(profile.value?.egcs_tp_agency), path: [{ type: 'transfer_payment', id: transferPaymentId }] }))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
const isEditable = computed(() => state.value?.publicationState !== 'retired')
const canUpdate = computed(() => canManagePublication.value && isEditable.value)
const canCreate = computed(() => Boolean(profile.value) && isEditable.value && can('transfer_payment', 'create', profileScope.value))
const canDelete = computed(() => Boolean(profile.value) && isEditable.value && can('transfer_payment', 'delete', profileScope.value))
const isLoadRetrying = computed(() => loadStatus.value === 'pending')
const backTo = computed(() => localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'recommendation-setups' })))
const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  { label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId)) },
  { label: getBilingualValue(stream.value, 'egcs_tp_name'), to: backTo.value },
  { label: getBilingualValue(state.value, 'egcs_cn_name') }
])
const sectionTabs = computed(() => [
  { key: 'workflow.identity', icon: 'i-lucide-file-text', value: 'recommendation-identity' },
  { key: 'transfer_payment.recommendation_set_members', icon: 'i-lucide-list-ordered', value: 'recommendation-members' }
])
const getDraft = () => state.value
  ? {
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_description_en: state.value.egcs_cn_description_en,
      egcs_cn_description_fr: state.value.egcs_cn_description_fr,
      egcs_cn_approvaltemplate: state.value.egcs_cn_approvaltemplate
    }
  : null
const mutation = useEditorMutationCoordinator({ getDraft })
const initialSetup = setup.value
if (initialSetup) {
  mutation.replaceSessionDraft(() => {
    state.value = cloneSetup(initialSetup)
  })
}
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canUpdateFields = computed(() => canUpdate.value && !mutation.isPending.value)
watch(selectedSection, value => {
  if (import.meta.client) document.getElementById(value)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
const retryLoad = async () => {
  await refresh()
  const refreshedSetup = setup.value
  if (refreshedSetup && !loadError.value) {
    mutation.replaceSessionDraft(() => {
      state.value = cloneSetup(refreshedSetup)
    })
    await nextTick()
    detailContent.value?.focus()
  }
}

const showPreservedDraft = () => toast.add({
  title: t('common.warning'),
  description: t('common.newer_changes_preserved'),
  color: 'warning'
})
const blockDirtyAction = () => {
  if (!mutation.isDirty.value) return false
  toast.add({
    title: t('common.warning'),
    description: t('common.save_changes_before_action'),
    color: 'warning'
  })
  return true
}
const mergeMemberMetadata = (value: SetupDetail) => {
  if (!state.value) return
  state.value.members = cloneSetup(value).members
  state.value.publicationId = value.publicationId
  state.value.publicationState = value.publicationState
  state.value.publicationVersionId = value.publicationVersionId
  state.value.publicationVersion = value.publicationVersion
  state.value.hasUnpublishedChanges = value.hasUnpublishedChanges
}
const refreshForMutation = async (token: EditorMutationToken) => {
  await refresh()
  const refreshedSetup = setup.value
  if (!refreshedSetup) return false
  return mutation.applyMutationRefresh(token, {
    apply: () => { state.value = cloneSetup(refreshedSetup) },
    mergeMetadata: () => mergeMemberMetadata(refreshedSetup)
  })
}
const persistSetup = async (token: EditorMutationToken, showSuccess: boolean) => {
  if (!state.value) return false
  await formRef.value?.validate()
  const response = await fetch(getClientRequestUrl(endpoint), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    egcs_cn_name_en: state.value.egcs_cn_name_en,
    egcs_cn_name_fr: state.value.egcs_cn_name_fr, egcs_cn_description_en: state.value.egcs_cn_description_en,
    egcs_cn_description_fr: state.value.egcs_cn_description_fr,
    egcs_cn_approvaltemplate: state.value.egcs_cn_approvaltemplate
  }) })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('workflow.saved'), color: 'success' })
  }
  return true
}
const save = async () => {
  if (!state.value || !canUpdate.value || mutation.isPending.value) return
  await mutation.run('save', async token => {
    try {
      await persistSetup(token, true)
    } catch (error) {
      showError(error)
    }
  })
}
const publicationAction = async (action: 'publish' | 'retire') => {
  if (mutation.isPending.value || !canManagePublication.value || state.value?.publicationState === 'retired') return
  if (action === 'retire' && blockDirtyAction()) return
  await mutation.run(action, async token => {
    try {
      if (action === 'publish' && mutation.isDirty.value && !await persistSetup(token, false)) return
      const response = await fetch(getClientRequestUrl(`${endpoint}/${action}`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) {
        if (mutation.isTokenCurrent(token)) showPreservedDraft()
        return
      }
      toast.add({ title: t('common.success'), description: t(`recommendation_setup.${action === 'publish' ? 'published' : 'retired'}`), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const publish = () => publicationAction('publish')
const retire = () => publicationAction('retire')
const nextMemberOrder = computed(() => {
  const members = state.value?.members ?? []
  return members.length === 0 ? 1 : Math.max(...members.map(member => member.egcs_cn_order)) + 1
})
const associateSchema = () => {
  if (!canUpdate.value || mutation.isPending.value || blockDirtyAction()) return
  selectedMember.value = {
    egcs_cn_order: nextMemberOrder.value,
    egcs_cn_failonnotrecommended: false
  }
  isMemberModalOpen.value = true
}
const createSchema = () => {
  if (mutation.isPending.value || blockDirtyAction()) return
  schemaCreateState.value = { egcs_cn_order: nextMemberOrder.value, egcs_cn_failonnotrecommended: false }
  isSchemaCreateModalOpen.value = true
}
const editMember = (member: TransferPaymentStreamRecommendationSetupMemberItem) => {
  if (mutation.isPending.value || blockDirtyAction()) return
  selectedMember.value = { ...member }
  isMemberModalOpen.value = true
}
const deleteMember = async (member: TransferPaymentStreamRecommendationSetupMemberItem) => {
  if (!canDelete.value || mutation.isPending.value || blockDirtyAction()) return
  await mutation.run('delete-member', async token => {
    try {
      deletingMemberId.value = String(member.id)
      const deleted = await confirmDeleteRequest(`${endpoint}/items/${member.id}`)
      if (deleted) await refreshForMutation(token)
    } catch (error) {
      showError(error)
    } finally {
      deletingMemberId.value = null
    }
  })
}
const openSchemaEditor = async (member: TransferPaymentStreamRecommendationSetupMemberItem) => {
  if (mutation.isPending.value || blockDirtyAction()) return
  await router.push(localePath(appRouteLocations.transferPaymentRecommendationSchemaDetail(
    transferPaymentId, streamId, String(member.egcs_cn_recommendationschema)
  )))
}
const onSchemaCreated = async (payload: { schemaId: string }) => {
  await router.push(localePath(appRouteLocations.transferPaymentRecommendationSchemaDetail(transferPaymentId, streamId, payload.schemaId)))
}
const runMemberMutation: EditorMutationRunner = async request => {
  if (mutation.isPending.value || blockDirtyAction()) return undefined
  return await mutation.run('member', async token => {
    const result = await request()
    await refreshForMutation(token)
    return result
  })
}
</script>

<template>
  <UDashboardPanel id="transfer-payment-recommendation-setup-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse /><UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template><template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" class="cursor-default" @click="isHeroCollapsed = !isHeroCollapsed" /><CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div
        v-if="loadError"
        class="p-6"
        data-testid="design-time-detail-load-error"
        role="alert"
        :aria-label="t('common.configuration_load_failed')">
        <UAlert
          color="error"
          icon="i-lucide-circle-alert"
          :title="t('common.configuration_load_failed')"
          :description="t('common.configuration_load_failed_description')">
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              :label="t('common.retry')"
              :loading="isLoadRetrying"
              :disabled="isLoadRetrying"
              @click="retryLoad" />
          </template>
        </UAlert>
      </div>
      <div
        v-else-if="state"
        ref="detailContent"
        class="flex flex-1 flex-col"
        data-testid="design-time-detail-content"
        role="region"
        :aria-label="getBilingualValue(state, 'egcs_cn_name')"
        tabindex="-1">
        <TransferPaymentRecommendationSetupDetailHero :name="getBilingualValue(state, 'egcs_cn_name')" :publication-version="state.publicationVersion" :publication-state="state.publicationState" :has-unpublished-changes="state.hasUnpublishedChanges" :is-collapsed="isHeroCollapsed" :is-publishing="isPublishing" :is-retiring="isRetiring" :is-mutation-pending="mutation.isPending.value" :can-manage="canManagePublication" @publish="publish" @retire="retire" />
        <UForm ref="recommendationSetupForm" :state="state" :validate="validate" class="flex min-h-0 flex-1 flex-col gap-6 px-6 pb-6 lg:flex-row lg:gap-0" @submit="save">
          <AssessmentSchemaDetailSidebar v-if="canUpdate" v-model="selectedSection" :section-tabs="sectionTabs" :is-saving="isSaving" :disabled="mutation.isPending.value" :ui="{ trigger: 'w-full justify-start whitespace-normal break-words text-left' }" @save="save" />
          <main class="min-w-0 flex-1 pt-6 lg:pl-6">
            <div class="space-y-10 pb-12">
              <AssessmentSchemaPageSection section-id="recommendation-identity" :title="t('workflow.identity')">
                <div class="grid gap-5 md:grid-cols-2">
                  <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
                    <UInput v-model="state.egcs_cn_name_en" :disabled="!canUpdateFields" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
                    <UInput v-model="state.egcs_cn_name_fr" :disabled="!canUpdateFields" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
                    <CommonTextarea v-model="state.egcs_cn_description_en" :disabled="!canUpdateFields" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
                    <CommonTextarea v-model="state.egcs_cn_description_fr" :disabled="!canUpdateFields" />
                  </UFormField>
                  <AdminCommonLookupField
                    v-model="state.egcs_cn_approvaltemplate"
                    :label="t('workflow.source_approval_template')"
                    name="egcs_cn_approvaltemplate"
                    fetch-url="/api/approval-templates"
                    value-key="id"
                    label-en-key="egcs_cn_name_en"
                    label-fr-key="egcs_cn_name_fr"
                    :disabled="!canUpdateFields"
                    :query="{ scopeType: 'transferpaymentstream', scopeId: streamId }" />
                </div>
              </AssessmentSchemaPageSection>
              <AssessmentSchemaPageSection section-id="recommendation-members" :title="t('transfer_payment.recommendation_set_members')">
                <template #actions>
                  <div v-if="canCreate || canUpdate" class="flex flex-wrap gap-2">
                    <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('transfer_payment.recommendation_create')" :disabled="mutation.isPending.value" class="cursor-default" @click="createSchema" />
                    <UButton v-if="canUpdate" icon="i-lucide-link" :label="t('transfer_payment.recommendation_associate')" color="neutral" variant="outline" :disabled="mutation.isPending.value" class="cursor-default" @click="associateSchema" />
                  </div>
                </template>
                <div class="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  <div v-for="member in state.members" :key="String(member.id)" class="flex w-full items-center gap-2 px-2 py-4">
                    <button v-if="canUpdate" type="button" :disabled="mutation.isPending.value" class="flex min-w-0 flex-1 items-center gap-4 text-left disabled:opacity-50" @click="editMember(member)">
                      <span class="w-8 text-sm font-semibold text-zinc-500">{{ member.egcs_cn_order }}</span><CommonBilingualName :name-en="member.egcs_cn_name_en ?? ''" :name-fr="member.egcs_cn_name_fr ?? ''" />
                      <div class="ml-auto flex items-center gap-2">
                        <UBadge v-if="member.egcs_cn_failonnotrecommended" color="warning" variant="subtle">
                          {{ t('transfer_payment.fail_on_not_recommended') }}
                        </UBadge>
                        <CommonLifecycleBadge v-if="member.publicationState" engine="publication" :state="member.publicationState" />
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-4 text-zinc-400" />
                    </button>
                    <div v-else class="flex min-w-0 flex-1 items-center gap-4">
                      <span class="w-8 text-sm font-semibold text-zinc-500">{{ member.egcs_cn_order }}</span><CommonBilingualName :name-en="member.egcs_cn_name_en ?? ''" :name-fr="member.egcs_cn_name_fr ?? ''" />
                      <div class="ml-auto flex items-center gap-2">
                        <UBadge v-if="member.egcs_cn_failonnotrecommended" color="warning" variant="subtle">
                          {{ t('transfer_payment.fail_on_not_recommended') }}
                        </UBadge>
                        <CommonLifecycleBadge v-if="member.publicationState" engine="publication" :state="member.publicationState" />
                      </div>
                    </div>
                    <UButton icon="i-lucide-arrow-up-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :disabled="mutation.isPending.value" :aria-label="t('transfer_payment.recommendation_schema')" @click="openSchemaEditor(member)" />
                    <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :loading="deletingMemberId === String(member.id)" :disabled="mutation.isPending.value" :aria-label="t('common.delete')" @click="deleteMember(member)" />
                  </div><div v-if="state.members.length === 0" class="py-8 text-center text-sm text-zinc-500">
                    {{ t('common.no_data') }}
                  </div>
                </div>
              </AssessmentSchemaPageSection>
            </div>
          </main>
        </UForm>
        <TransferPaymentRecommendationSetupItemModal v-if="selectedMember && canUpdate" v-model:open="isMemberModalOpen" v-model:state="selectedMember" :transfer-payment-id="transferPaymentId" :stream-id="streamId" :recommendation-setup-id="setupId" :agency-id="String(profile?.egcs_tp_agency ?? '')" :mutation-pending="mutation.isPending.value" :run-mutation="runMemberMutation" />
        <TransferPaymentRecommendationSetupSchemaCreateModal v-if="schemaCreateState && canCreate" v-model:open="isSchemaCreateModalOpen" v-model:state="schemaCreateState" :transfer-payment-id="transferPaymentId" :stream-id="streamId" :recommendation-setup-id="setupId" :mutation-pending="mutation.isPending.value" :run-mutation="runMemberMutation" @created="onSchemaCreated" />
      </div>
    </template>
  </UDashboardPanel>
</template>
