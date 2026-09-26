<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBilingualValue } from '~/composables/useBilingualValue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable jsdoc/require-param-description, jsdoc/require-jsdoc -- Page-local callbacks are clear from their use. */
import type { Ref } from 'vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { ListResponse, UserOptionItem } from '~~/shared/types/admin'
import { AdditionalReviewerInputSchema, type AdditionalReviewerInput } from '~~/shared/types/schemas/additional-reviewer'

type AdditionalReviewerRow = {
  id: string
  egcs_cn_comments: string
  egcs_cn_user: string | null
  egcs_cn_group: string | null
  egcs_cn_group_name_en: string | null
  egcs_cn_group_name_fr: string | null
  egcs_cn_user_name: string
  egcs_cn_completedat: string | null
  can_update: boolean
  can_complete: boolean
  can_delete: boolean
}

type AdditionalReviewerModalState = AdditionalReviewerInput & {
  id?: string
}

const { reviewId, canUpdateAssessment = false, reviewersDisabled = false, runtimeLocked = false } = defineProps<{
  reviewId: string
  canUpdateAssessment?: boolean
  reviewersDisabled?: boolean
  runtimeLocked?: boolean
}>()

const emit = defineEmits<{
  progressChange: [value: { total: number; pending: number }]
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const getAssigneeName = (row: AdditionalReviewerRow): string => row.egcs_cn_user_name
  || getBilingualValue(row, 'egcs_cn_group_name', row.id)
const toast = useToast()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const validate = createValidator(AdditionalReviewerInputSchema)
const { formatDate } = useDateHelpers({
  formatterOptions: {
    dateStyle: 'medium',
    timeStyle: 'short'
  }
})

const rowsResponse: Ref<ListResponse<AdditionalReviewerRow> | null> = ref(null)
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
let rowsRequestGeneration = 0

/**
 *
 */
const refreshRows = async () => {
  const requestGeneration = ++rowsRequestGeneration
  const requestedReviewId = reviewId
  try {
    status.value = 'pending'
    const response = await fetch(getClientRequestUrl(`/api/reviews/${requestedReviewId}/additional-reviewers`))
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    const nextResponse = await response.json() as ListResponse<AdditionalReviewerRow>
    if (requestGeneration !== rowsRequestGeneration || requestedReviewId !== reviewId) return
    rowsResponse.value = nextResponse
    status.value = 'success'
  } catch {
    if (requestGeneration !== rowsRequestGeneration || requestedReviewId !== reviewId) return
    status.value = 'error'
  }
}

const userSearchTerm = ref('')
const debouncedUserSearchTerm = refDebounced(userSearchTerm, 250)
const userLookupResponse: Ref<ListResponse<UserOptionItem>> = ref({
  items: [],
  total: 0,
  stats: {
    total: 0,
    active: 0
  },
  page: 1,
  limit: 20
})
const userLookupStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
let userLookupGeneration = 0

/**
 *
 */
const refreshUserLookup = async () => {
  if (reviewersDisabled) {
    return
  }

  const requestGeneration = ++userLookupGeneration
  const requestedReviewId = reviewId
  const requestedSearch = debouncedUserSearchTerm.value
  userLookupStatus.value = 'pending'

  const requestUrl = getClientRequestUrl(`/api/reviews/${requestedReviewId}/additional-reviewers/lookups/users`)
  requestUrl.searchParams.set('page', '1')
  requestUrl.searchParams.set('limit', '20')
  if (requestedSearch) {
    requestUrl.searchParams.set('search', requestedSearch)
  }
  try {
    const response = await fetch(requestUrl)
    if (!response.ok) await throwFetchResponseError(response)
    const nextResponse = await response.json() as ListResponse<UserOptionItem>
    if (requestGeneration !== userLookupGeneration || requestedReviewId !== reviewId || requestedSearch !== debouncedUserSearchTerm.value) return
    userLookupResponse.value = nextResponse
    userLookupStatus.value = 'success'
  } catch {
    if (requestGeneration !== userLookupGeneration || requestedReviewId !== reviewId || requestedSearch !== debouncedUserSearchTerm.value) return
    userLookupResponse.value = { items: [], total: 0, stats: { total: 0, active: 0 }, page: 1, limit: 20 }
    userLookupStatus.value = 'error'
  }
}

watch(debouncedUserSearchTerm, async () => {
  await refreshUserLookup()
})

const rows = computed<AdditionalReviewerRow[]>(() => rowsResponse.value?.items ?? [])
const userOptions = computed<UserOptionItem[]>(() => userLookupResponse.value?.items ?? [])
const columns: TableColumnInput<AdditionalReviewerRow>[] = [
  { id: 'assignee', headerKey: 'assessment.additional_reviewers.assigned_to' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'comments', headerKey: 'admin_common.fields.egcs_cn_comment' },
  { id: 'actions', headerKey: 'common.actions' }
]
const resolvedColumns = useTableColumns<AdditionalReviewerRow>(columns)

const reviewerModal = useCrudModal<AdditionalReviewerRow, AdditionalReviewerModalState>({
  createState: () => ({
    egcs_cn_user: '',
    egcs_cn_group: undefined,
    egcs_cn_comments: ''
  }),
  /**
   * Maps a table row into editable modal state.
   *
   * @param row - Reviewer row selected for editing.
   * @returns Editable modal state.
   */
  updateState: row => ({
    id: row.id,
    egcs_cn_user: row.egcs_cn_user ?? undefined,
    // A claimed group keeps its group in storage as provenance, but the editor
    // submits the current user as its one selected assignee.
    egcs_cn_group: row.egcs_cn_user ? undefined : row.egcs_cn_group ?? undefined,
    egcs_cn_comments: row.egcs_cn_comments
  })
})

const isReviewerModalOpen: Ref<boolean> = reviewerModal.isOpen
const selectedReviewer: Ref<AdditionalReviewerModalState | null> = reviewerModal.selected
const selectedAssigneeKind: Ref<'user' | 'group'> = ref('user')
const assigneeKind = computed({
  get: () => selectedAssigneeKind.value,
  set: (kind: string) => {
    if (!selectedReviewer.value) return
    selectedAssigneeKind.value = kind === 'group' ? 'group' : 'user'
    selectedReviewer.value.egcs_cn_user = kind === 'user' ? '' : undefined
    selectedReviewer.value.egcs_cn_group = kind === 'group' ? '' : undefined
  }
})
const selectedGroup = computed({
  get: () => selectedReviewer.value?.egcs_cn_group ?? '',
  set: (value: string) => { if (selectedReviewer.value) selectedReviewer.value.egcs_cn_group = value }
})
const canSaveReviewer = computed(() => {
  const selected = selectedReviewer.value
  return Boolean(selected && !runtimeLocked
    && (selected.id
      ? rows.value.some(row => row.id === selected.id && row.can_update)
      : canUpdateAssessment && !reviewersDisabled))
})
const selectedUserOption: Ref<UserOptionItem | null> = ref(null)

// Keep the selected identity readable when paging/search replaces the option list.
watch([() => selectedReviewer.value?.egcs_cn_user, userOptions, rows], ([userId, options, reviewers]) => {
  if (!userId) {
    selectedUserOption.value = null
    return
  }
  const option = options.find(item => String(item.id) === String(userId))
  const reviewer = reviewers.find(item => String(item.egcs_cn_user) === String(userId))
  if (option) selectedUserOption.value = option
  else if (reviewer) selectedUserOption.value = { id: String(userId), name: reviewer.egcs_cn_user_name }
  else if (selectedUserOption.value?.id !== String(userId)) selectedUserOption.value = null
}, { immediate: true, flush: 'sync' })

const retainedUserOptions = computed(() => {
  const option = selectedUserOption.value
  return option && !userOptions.value.some(item => String(item.id) === String(option.id))
    ? [{ value: String(option.id), label: option.name }]
    : []
})

const openCreateReviewer = reviewerModal.openCreate
/**
 * Opens the current editable row while the Review remains unlocked.
 * @param row - Row selected by the action control.
 */
const openUpdateReviewer = (row: AdditionalReviewerRow) => {
  const current = rows.value.find(item => item.id === row.id && item.can_update)
  if (runtimeLocked || !current) return
  selectedAssigneeKind.value = row.egcs_cn_user ? 'user' : 'group'
  reviewerModal.openUpdate(current)
}
/**
 *
 * @param url
 * @param method
 * @param body
 */
const requestJson = async (url: string, method: 'DELETE' | 'PATCH' | 'POST', body?: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method,
    headers: body === undefined
      ? undefined
      : {
          'content-type': 'application/json'
        },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) {
    await throwFetchResponseError(response)
  }
}

const reviewerPending = useCrudModalPending(reviewerModal.captureSession)
const completingRowId = ref<string | null>(null)
const deletingRowId = ref<string | null>(null)
let reviewGeneration = 0
let completionGeneration = 0
let deletionGeneration = 0
const isReviewerSaving = reviewerPending.isPending

watch(() => reviewId, (_nextReviewId, previousReviewId) => {
  reviewGeneration += 1
  completionGeneration += 1
  deletionGeneration += 1
  rowsRequestGeneration += 1
  userLookupGeneration += 1
  rowsResponse.value = null
  userLookupResponse.value = { items: [], total: 0, stats: { total: 0, active: 0 }, page: 1, limit: 20 }
  userSearchTerm.value = ''
  selectedUserOption.value = null
  if (previousReviewId !== undefined) isReviewerModalOpen.value = false
  completingRowId.value = null
  deletingRowId.value = null
  void Promise.all([refreshRows(), refreshUserLookup()])
}, { immediate: true, flush: 'sync' })

onUnmounted(() => {
  reviewGeneration += 1
  completionGeneration += 1
  deletionGeneration += 1
  rowsRequestGeneration += 1
  userLookupGeneration += 1
})

watch(rows, value => {
  emit('progressChange', {
    total: value.length,
    pending: value.filter(item => item.egcs_cn_completedat === null).length
  })
}, { immediate: true })

/**
 * Opens the create modal when assessment updates are allowed.
 */
const openCreate = () => {
  if (!canUpdateAssessment || reviewersDisabled || runtimeLocked) {
    return
  }

  openCreateReviewer()
  selectedAssigneeKind.value = 'user'
}

/**
 * Creates or updates the selected reviewer entry.
 */
const saveReviewer = async () => {
  if (!selectedReviewer.value || !canSaveReviewer.value) {
    return
  }

  const isCreate = !selectedReviewer.value.id
  const requestedReviewGeneration = reviewGeneration
  const session = reviewerModal.captureSession()
  const requestedReviewId = reviewId
  if (!reviewerPending.begin(session)) return

  try {
    if (isCreate) {
      await requestJson(`/api/reviews/${requestedReviewId}/additional-reviewers`, 'POST', {
        egcs_cn_user: selectedReviewer.value.egcs_cn_user,
        egcs_cn_group: selectedReviewer.value.egcs_cn_group,
        egcs_cn_comments: ''
      })
    } else {
      const reviewerId = selectedReviewer.value.id
      if (!reviewerId) {
        return
      }

      await requestJson(`/api/additional-reviewers/${reviewerId}`, 'PATCH', {
        egcs_cn_user: selectedReviewer.value.egcs_cn_user,
        egcs_cn_group: selectedReviewer.value.egcs_cn_group,
        egcs_cn_comments: selectedReviewer.value.egcs_cn_comments
      })
    }

    if (requestedReviewId !== reviewId || requestedReviewGeneration !== reviewGeneration || !reviewerModal.closeSession(session)) return
    await refreshRows()
    if (requestedReviewId !== reviewId || requestedReviewGeneration !== reviewGeneration) return
    toast.add({
      title: t('common.success'),
      description: isCreate ? t('assessment.additional_reviewers.created_success') : t('common.updated_success'),
      color: 'success'
    })
  } catch (error) {
    if (requestedReviewId === reviewId && requestedReviewGeneration === reviewGeneration && reviewerModal.captureSession() === session) showError(error)
  } finally {
    reviewerPending.end(session)
  }
}

/**
 * Marks an additional reviewer as complete.
 *
 * @param rowId - Reviewer row identifier.
 */
const completeRow = async (rowId: string) => {
  if (completingRowId.value || runtimeLocked || !rows.value.some(row => row.id === rowId && row.can_complete)) {
    return
  }

  const requestGeneration = ++completionGeneration
  const requestedReviewId = reviewId
  const isCurrent = () => requestGeneration === completionGeneration && requestedReviewId === reviewId
  try {
    completingRowId.value = rowId
    await requestJson(`/api/additional-reviewers/${rowId}/complete`, 'POST')
    if (!isCurrent()) return
    await refreshRows()
    if (!isCurrent()) return
    toast.add({
      title: t('common.success'),
      description: t('assessment.additional_reviewers.completed_success'),
      color: 'success'
    })
  } catch (error) {
    if (isCurrent()) showError(error)
  } finally {
    if (isCurrent()) completingRowId.value = null
  }
}

/**
 * Soft-deletes an additional reviewer row through the API.
 *
 * @param rowId - Reviewer row identifier.
 */
const deleteRow = async (rowId: string) => {
  if (deletingRowId.value || runtimeLocked || !rows.value.some(row => row.id === rowId && row.can_delete)) {
    return
  }

  const requestGeneration = ++deletionGeneration
  const requestedReviewId = reviewId
  const isCurrent = () => requestGeneration === deletionGeneration && requestedReviewId === reviewId
  try {
    deletingRowId.value = rowId
    await requestJson(`/api/additional-reviewers/${rowId}`, 'DELETE')
    if (!isCurrent()) return
    await refreshRows()
    if (!isCurrent()) return
    toast.add({
      title: t('common.success'),
      description: t('common.deleted_success'),
      color: 'success'
    })
  } catch (error) {
    if (isCurrent()) showError(error)
  } finally {
    if (isCurrent()) deletingRowId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <AssessmentSchemaSectionTitle :title="t('assessment.additional_reviewers.title')" variant="indicator">
        <template #actions>
          <UButton
            v-if="canUpdateAssessment && !reviewersDisabled && !runtimeLocked"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            class="cursor-default"
            @click="openCreate">
            {{ t('common.add') }}
          </UButton>
        </template>
      </AssessmentSchemaSectionTitle>
    </div>

    <div class="space-y-4 pl-4 md:pl-6">
      <p
        v-if="!reviewersDisabled"
        class="text-sm text-zinc-600 dark:text-zinc-300">
        {{ t('assessment.additional_reviewers.description') }}
      </p>

      <div
        v-if="reviewersDisabled"
        class="border-default rounded-xl border border-dashed px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('assessment.additional_reviewers.disabled_notice') }}
      </div>

      <UAlert
        v-if="status === 'error'"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="t('assessment.additional_reviewers.load_failed')">
        <template #actions>
          <UButton :label="t('common.retry')" color="error" variant="soft" @click="refreshRows" />
        </template>
      </UAlert>

      <CommonCompactTable
        v-else
        :data="rows"
        :columns="resolvedColumns"
        :loading="status === 'pending'"
        :empty-text="t('assessment.additional_reviewers.empty')">
        <template #empty>
          <div class="px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('assessment.additional_reviewers.empty') }}
          </div>
        </template>

        <template #assignee-cell="{ row }">
          <span class="text-sm text-zinc-900 dark:text-zinc-100">
            {{ getAssigneeName(row.original) }}
          </span>
        </template>

        <template #status-cell="{ row }">
          <div class="flex flex-col gap-1">
            <CommonStatusBadge
              enum-name="follow_up_status"
              :status="row.original.egcs_cn_completedat ? 'completed' : 'open'"
              :label-key="row.original.egcs_cn_completedat ? 'assessment.additional_reviewers.status_completed' : 'assessment.additional_reviewers.status_pending'"
              class="w-fit cursor-default" />

            <span
              v-if="row.original.egcs_cn_completedat"
              class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ t('assessment.additional_reviewers.completed_at', { date: formatDate(row.original.egcs_cn_completedat) }) }}
            </span>
          </div>
        </template>

        <template #comments-cell="{ row }">
          <span class="text-sm text-zinc-600 dark:text-zinc-300">
            {{ row.original.egcs_cn_comments || t('assessment.additional_reviewers.no_comments') }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              v-if="row.original.can_update && !runtimeLocked"
              icon="i-lucide-edit-3"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('common.edit_named', { name: getAssigneeName(row.original) })"
              :title="t('common.edit_named', { name: getAssigneeName(row.original) })"
              @click="openUpdateReviewer(row.original)" />
            <UButton
              v-if="row.original.can_complete && !runtimeLocked"
              icon="i-lucide-circle-check-big"
              color="primary"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="`${t('assessment.additional_reviewers.complete')}: ${getAssigneeName(row.original)}`"
              :title="`${t('assessment.additional_reviewers.complete')}: ${getAssigneeName(row.original)}`"
              :loading="completingRowId === row.original.id"
              @click="completeRow(row.original.id)" />
            <UButton
              v-if="row.original.can_delete && !runtimeLocked"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('common.delete_named', { name: getAssigneeName(row.original) })"
              :title="t('common.delete_named', { name: getAssigneeName(row.original) })"
              :loading="deletingRowId === row.original.id"
              @click="deleteRow(row.original.id)" />
          </div>
        </template>
      </CommonCompactTable>
    </div>

    <UModal
      v-if="selectedReviewer"
      v-model:open="isReviewerModalOpen"
      :title="selectedReviewer.id ? t('assessment.additional_reviewers.update_title') : t('assessment.additional_reviewers.create_title')">
      <template #body>
        <UForm
          :state="selectedReviewer"
          :validate="validate"
          class="space-y-4"
          @submit="saveReviewer">
          <UFormField :label="t('groups.assignee_type')" required>
            <USelect v-model="assigneeKind" :items="[{ label: t('groups.user'), value: 'user' }, { label: t('groups.group'), value: 'group' }]" />
          </UFormField>
          <UFormField v-if="assigneeKind === 'user'" :label="t('assessment.additional_reviewers.assigned_to')" name="egcs_cn_user" required>
            <UAlert
              v-if="userLookupStatus === 'error'"
              color="error"
              variant="soft"
              :title="t('assessment.additional_reviewers.lookup_load_failed')">
              <template #actions>
                <UButton :label="t('common.retry')" color="error" variant="soft" @click="refreshUserLookup" />
              </template>
            </UAlert>
            <CommonBilingualSelectMenu
              v-model="selectedReviewer.egcs_cn_user"
              :items="userOptions"
              :prepend-options="retainedUserOptions"
              :search-term="userSearchTerm"
              value-key="id"
              label-key="name"
              :disabled="userLookupStatus === 'pending' || userLookupStatus === 'error'"
              searchable
              @update:search-term="userSearchTerm = String($event ?? '')" />
          </UFormField>
          <UFormField v-else :label="t('groups.group')" name="egcs_cn_group" required>
            <CommonServerLookupSelect v-model="selectedGroup" :fetch-url="`/api/reviews/${reviewId}/additional-reviewers/lookups/groups`" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" />
          </UFormField>

          <UFormField
            v-if="selectedReviewer.id"
            :label="t('admin_common.fields.egcs_cn_comment')"
            name="egcs_cn_comments">
            <CommonTextarea
              v-model="selectedReviewer.egcs_cn_comments"
              :rows="4" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              class="cursor-default"
              @click="isReviewerModalOpen = false" />
            <CommonSaveButton
              :label="selectedReviewer.id ? t('common.save') : t('common.add')"
              :loading="isReviewerSaving"
              :disabled="isReviewerSaving || !canSaveReviewer" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
