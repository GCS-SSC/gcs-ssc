<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- page-local navigation and persistence handlers */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { Scope } from '~~/shared/utils/scopes'
import type { TranslatedTabItem } from '~~/shared/types/ui'
import type {
  TransferPaymentProfileItem,
  TransferPaymentStreamItem,
  TransferPaymentStreamReviewSetupItem,
  TransferPaymentStreamReviewSetupMember
} from '~~/shared/types/schemas'
import {
  TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM,
  TransferPaymentStreamReviewSetupPatchSchema
} from '~~/shared/types/schemas/transfer-payment'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type {
  EditorMutationRunner,
  EditorMutationToken
} from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type ReviewSetupMember = TransferPaymentStreamReviewSetupMember & { id: string }
type ReviewSetupDetail = Omit<TransferPaymentStreamReviewSetupItem, 'members'> & {
  entityTypeLabelEn: string
  entityTypeLabelFr: string
  members: ReviewSetupMember[]
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
const { getHeroCollapsed } = useDashboard()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const toast = useToast()

const transferPaymentId = route.params.id as string
const streamId = route.params.streamId as string
const reviewSetupId = route.params.reviewSetupId as string
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${reviewSetupId}`

const { data: profile } = await useFetch<TransferPaymentProfileItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}`)
const { data: stream } = await useFetch<TransferPaymentStreamItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const { data: setup, error: loadError, status: loadStatus, refresh } = await useFetch<ReviewSetupDetail, FetchError, string>(endpoint)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const cloneSetup = (value: ReviewSetupDetail): ReviewSetupDetail => ({
  ...value,
  members: Array.isArray(value.members) ? value.members.map(member => ({ ...member })) : []
})
const state: Ref<ReviewSetupDetail | null> = ref(setup.value ? cloneSetup(setup.value) : null)
const deletingMemberId: Ref<string | null> = ref(null)
const selectedSection: Ref<string> = ref('review-set-general')
const isAssociateModalOpen: Ref<boolean> = ref(false)
const associateState: Ref<Record<string, unknown> | null> = ref(null)
const isSchemaCreateModalOpen: Ref<boolean> = ref(false)
const schemaCreateState: Ref<Record<string, unknown> | null> = ref(null)
const isHeroCollapsed = getHeroCollapsed('transfer-payment-review-setup-detail')
const validateSet = createValidator(TransferPaymentStreamReviewSetupPatchSchema)

const profileScope = computed<Scope>(() => ({
  type: 'entity',
  agencyId: String(profile.value?.egcs_tp_agency),
  path: [{ type: 'transfer_payment', id: transferPaymentId }]
}))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
const isEditable = computed(() => state.value?.publicationState !== 'retired')
const canUpdate = computed(() => canManagePublication.value && isEditable.value)
const canCreate = computed(() => Boolean(profile.value) && isEditable.value && can('transfer_payment', 'create', profileScope.value))
const canDelete = computed(() => Boolean(profile.value) && isEditable.value && can('transfer_payment', 'delete', profileScope.value))
const isLoadRetrying = computed(() => loadStatus.value === 'pending')
const agencyId = computed(() => String(profile.value?.egcs_tp_agency ?? ''))
const entityTypeItems = computed(() => TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM.map(value => ({
  label: t(`enums.entity_type.${value}`),
  value
})))
const backTo = computed(() => localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'review-setups' })))
const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  { label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId)) },
  { label: getBilingualValue(stream.value, 'egcs_tp_name'), to: backTo.value },
  { label: getBilingualValue(state.value, 'egcs_cn_name') }
])
const sectionTabs = computed<TranslatedTabItem[]>(() => [
  { key: 'common.general', icon: 'i-lucide-file-text', value: 'review-set-general' },
  { key: 'transfer_payment.review_setup_members', icon: 'i-lucide-list-ordered', value: 'review-set-members' }
])
const getDraft = () => state.value
  ? {
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_description_en: state.value.egcs_cn_description_en,
      egcs_cn_description_fr: state.value.egcs_cn_description_fr,
      egcs_cn_entitytype: state.value.egcs_cn_entitytype,
      egcs_cn_order: state.value.egcs_cn_order,
      egcs_cn_sequential: state.value.egcs_cn_sequential,
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
const isSavingSet = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canUpdateFields = computed(() => canUpdate.value && !mutation.isPending.value)
watch(selectedSection, sectionId => {
  if (import.meta.client) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
const mergeMemberMetadata = (value: ReviewSetupDetail) => {
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
const persistSet = async (token: EditorMutationToken, showSuccess: boolean) => {
  if (!state.value) return false
  const body = {
    egcs_cn_name_en: state.value.egcs_cn_name_en,
    egcs_cn_name_fr: state.value.egcs_cn_name_fr,
    egcs_cn_description_en: state.value.egcs_cn_description_en,
    egcs_cn_description_fr: state.value.egcs_cn_description_fr,
    egcs_cn_entitytype: state.value.egcs_cn_entitytype,
    egcs_cn_order: state.value.egcs_cn_order,
    egcs_cn_sequential: state.value.egcs_cn_sequential,
    egcs_cn_approvaltemplate: state.value.egcs_cn_approvaltemplate
  }
  const response = await fetch(getClientRequestUrl(endpoint), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('transfer_payment.review_setup_saved'), color: 'success' })
  }
  return true
}

const saveSet = async () => {
  if (!state.value || !canUpdate.value || mutation.isPending.value) return
  await mutation.run('save', async token => {
    try {
      await persistSet(token, true)
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
      if (action === 'publish' && mutation.isDirty.value && !await persistSet(token, false)) return
      const response = await fetch(getClientRequestUrl(`${endpoint}/${action}`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) {
        if (mutation.isTokenCurrent(token)) showPreservedDraft()
        return
      }
      toast.add({ title: t('common.success'), description: t(`review_setup.${action === 'publish' ? 'published' : 'retired'}`), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const publish = () => publicationAction('publish')
const retire = () => publicationAction('retire')

const nextMemberOrder = computed(() => state.value?.members.length ? Math.max(...state.value.members.map(member => member.egcs_cn_order)) + 1 : 1)
const openAssociate = () => {
  if (mutation.isPending.value || blockDirtyAction()) return
  associateState.value = { egcs_cn_order: nextMemberOrder.value }
  isAssociateModalOpen.value = true
}
const openCreateSchema = () => {
  if (mutation.isPending.value || blockDirtyAction()) return
  schemaCreateState.value = { egcs_cn_reviewtype: 'assessment', egcs_cn_order: nextMemberOrder.value }
  isSchemaCreateModalOpen.value = true
}
const editMember = (member: ReviewSetupMember) => {
  if (mutation.isPending.value || blockDirtyAction()) return
  associateState.value = { ...member }
  isAssociateModalOpen.value = true
}
const deleteMember = async (member: ReviewSetupMember) => {
  if (!canDelete.value || mutation.isPending.value || blockDirtyAction()) return
  await mutation.run('delete-member', async token => {
    try {
      deletingMemberId.value = member.id
      const deleted = await confirmDeleteRequest(`${endpoint}/items/${member.id}`)
      if (deleted) await refreshForMutation(token)
    } catch (error) {
      showError(error)
    } finally {
      deletingMemberId.value = null
    }
  })
}
const openSchemaEditor = async (member: ReviewSetupMember) => {
  if (mutation.isPending.value || blockDirtyAction()) return
  await router.push(localePath(member.egcs_cn_reviewtype === 'checklist'
    ? appRouteLocations.transferPaymentChecklistSchemaDetail(transferPaymentId, streamId, member.egcs_cn_reviewschema)
    : appRouteLocations.transferPaymentAssessmentSchemaDetail(transferPaymentId, streamId, member.egcs_cn_reviewschema)))
}
const onSchemaCreated = async (payload: { schemaId: string; reviewType: 'assessment' | 'checklist' }) => {
  await router.push(localePath(payload.reviewType === 'checklist'
    ? appRouteLocations.transferPaymentChecklistSchemaDetail(transferPaymentId, streamId, payload.schemaId)
    : appRouteLocations.transferPaymentAssessmentSchemaDetail(transferPaymentId, streamId, payload.schemaId)))
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
  <UDashboardPanel id="transfer-payment-review-setup-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" class="cursor-default" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
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
        <TransferPaymentReviewSetupDetailHero :name="getBilingualValue(state, 'egcs_cn_name')" :entity-type="state.egcs_cn_entitytype" :entity-type-label-en="state.entityTypeLabelEn" :entity-type-label-fr="state.entityTypeLabelFr" :publication-state="state.publicationState" :publication-version="state.publicationVersion" :has-unpublished-changes="state.hasUnpublishedChanges" :is-collapsed="isHeroCollapsed" :is-publishing="isPublishing" :is-retiring="isRetiring" :is-mutation-pending="mutation.isPending.value" :can-manage="canManagePublication" @publish="publish" @retire="retire" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
          <AssessmentSchemaDetailSidebar
            v-if="canUpdate"
            v-model="selectedSection"
            :section-tabs="sectionTabs"
            :is-saving="isSavingSet"
            :disabled="mutation.isPending.value"
            :ui="{ trigger: 'w-full justify-start whitespace-normal break-words text-left' }"
            @save="saveSet" />
          <aside v-else class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
            <div class="pt-6">
              <CommonRouteTabs v-model="selectedSection" :items="sectionTabs" orientation="vertical" />
            </div>
          </aside>

          <main class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
            <div class="w-full space-y-10 pb-12">
              <AssessmentSchemaPageSection section-id="review-set-general" :title="t('common.general')">
                <UForm :state="state" :validate="validateSet" class="space-y-5" @submit="saveSet">
                  <fieldset :disabled="!canUpdateFields" class="space-y-5">
                    <ReviewSetSetupFields
                      v-model:state="state"
                      :transfer-payment-id="transferPaymentId"
                      :stream-id="streamId"
                      :entity-type-items="entityTypeItems"
                      entity-type-disabled />
                    <div v-if="canUpdate" class="flex justify-end">
                      <CommonSaveButton :label="t('common.save')" :loading="isSavingSet" :disabled="mutation.isPending.value" />
                    </div>
                  </fieldset>
                </UForm>
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection section-id="review-set-members" :title="t('transfer_payment.review_setup_members')">
                <div class="mb-5 flex flex-wrap justify-end gap-2">
                  <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('transfer_payment.review_schema_create')" :disabled="mutation.isPending.value" class="cursor-default" @click="openCreateSchema" />
                  <UButton v-if="canUpdate" icon="i-lucide-link" :label="t('transfer_payment.review_schema_associate')" color="neutral" variant="outline" :disabled="mutation.isPending.value" class="cursor-default" @click="openAssociate" />
                </div>

                <div v-if="state.members.length" class="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  <div v-for="member in state.members" :key="member.id" class="flex w-full items-center gap-2 px-2 py-4">
                    <button v-if="canUpdate" type="button" :disabled="mutation.isPending.value" class="flex min-w-0 flex-1 items-center gap-4 text-left disabled:opacity-50" @click="editMember(member)">
                      <span class="w-8 text-sm font-semibold text-zinc-500">{{ member.egcs_cn_order }}</span>
                      <CommonBilingualName :name-en="member.egcs_cn_name_en" :name-fr="member.egcs_cn_name_fr" />
                      <div class="ml-auto flex items-center gap-2">
                        <CommonStatusBadge enum-name="review_type" :status="member.egcs_cn_reviewtype" />
                        <CommonLifecycleBadge v-if="member.publicationState" engine="publication" :state="member.publicationState" />
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-4 text-zinc-400" />
                    </button>
                    <div v-else class="flex min-w-0 flex-1 items-center gap-4">
                      <span class="w-8 text-sm font-semibold text-zinc-500">{{ member.egcs_cn_order }}</span>
                      <CommonBilingualName :name-en="member.egcs_cn_name_en" :name-fr="member.egcs_cn_name_fr" />
                      <div class="ml-auto flex items-center gap-2">
                        <CommonStatusBadge enum-name="review_type" :status="member.egcs_cn_reviewtype" />
                        <CommonLifecycleBadge v-if="member.publicationState" engine="publication" :state="member.publicationState" />
                      </div>
                    </div>
                    <UButton icon="i-lucide-arrow-up-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :disabled="mutation.isPending.value" :aria-label="t('transfer_payment.review_schema')" @click="openSchemaEditor(member)" />
                    <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :loading="deletingMemberId === member.id" :disabled="mutation.isPending.value" :aria-label="t('common.delete')" @click="deleteMember(member)" />
                  </div>
                </div>
                <p v-else class="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('transfer_payment.no_review_setup_members') }}
                </p>
              </AssessmentSchemaPageSection>
            </div>
          </main>
        </div>
      </div>

      <TransferPaymentReviewSetupItemModal
        v-if="!loadError && associateState && state && canUpdate"
        v-model:open="isAssociateModalOpen"
        v-model:state="associateState"
        :transfer-payment-id="transferPaymentId"
        :stream-id="streamId"
        :review-setup-id="reviewSetupId"
        :agency-id="agencyId"
        :entity-type="state.egcs_cn_entitytype"
        :mutation-pending="mutation.isPending.value"
        :run-mutation="runMemberMutation" />
      <TransferPaymentReviewSetupSchemaCreateModal
        v-if="!loadError && schemaCreateState && canCreate"
        v-model:open="isSchemaCreateModalOpen"
        v-model:state="schemaCreateState"
        :transfer-payment-id="transferPaymentId"
        :stream-id="streamId"
        :review-setup-id="reviewSetupId"
        :mutation-pending="mutation.isPending.value"
        :run-mutation="runMemberMutation"
        @created="onSchemaCreated" />
    </template>
  </UDashboardPanel>
</template>
