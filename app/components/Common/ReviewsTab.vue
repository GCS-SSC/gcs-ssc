<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local request helpers are self-documenting and not public APIs */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { getGroupedRowModel } from '@tanstack/vue-table'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ExpandedState } from '@tanstack/vue-table'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import type { ReviewTargetEntityType } from '~~/shared/constants/enums'
import type { RuntimeKind, RuntimeState } from '~~/shared/constants/system-lifecycle'

const { entityType, entityId, canUpdate = false } = defineProps<{
  entityType: ReviewTargetEntityType
  entityId: string
  canUpdate?: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

type EntityReview = {
  id: string
  can_retry: boolean
  egcs_cn_reviewset: string
  egcs_cn_reviewschema: string
  runtimeItemId: string
  runtimeState: RuntimeState
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_reviewtype?: 'assessment' | 'checklist'
}

type EntityReviewSet = {
  id: string
  runtimeId: string
  runtimeKind: RuntimeKind
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  publicationVersionId: string
  publicationVersion: number
  egcs_cn_reviewsetsetup: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  agency_name_en: string
  agency_name_fr: string
  egcs_cn_sequential: boolean
  reviews?: EntityReview[]
}

type ReviewSetSetupLookupItem = Record<string, unknown>

type ReviewLeafRow = {
  id: string
  reviewSetGroup: string
  reviewSetupId: string
  reviewSetupNameEn: string
  reviewSetupNameFr: string
  agencyNameEn: string
  agencyNameFr: string
  reviewSetupSequential: boolean
  reviewSetId: string
  canRetry: boolean
  reviewSetRuntimeKind: RuntimeKind
  reviewSetRuntimeState: RuntimeState
  reviewNameEn: string
  reviewNameFr: string
  reviewRuntimeState: RuntimeState
  reviewType: 'assessment' | 'checklist'
}

type GroupedReviewRow = {
  id: string
  depth: number
  groupingColumnId?: string
  original: ReviewLeafRow
  subRows?: GroupedReviewRow[]
  leafRows?: GroupedReviewRow[]
  getIsExpanded?: () => boolean
  getIsGrouped?: () => boolean
  toggleExpanded?: () => void
}

const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const localePath = useLocalePath()
const router = useRouter()
const route = useRoute()
const { showError } = useApiErrorToast()
const isCreateModalOpen: Ref<boolean> = ref(false)
const isSubmitting: Ref<boolean> = ref(false)
const selectedReviewSetSetupId: Ref<string> = ref('')

const REVIEW_SET_GROUP_COLUMN_ID = 'reviewSetGroup'

const expandedRows: Ref<ExpandedState> = ref({})
const grouping: Ref<string[]> = ref([REVIEW_SET_GROUP_COLUMN_ID])
const columnVisibility: Ref<Record<string, boolean>> = ref({
  [REVIEW_SET_GROUP_COLUMN_ID]: false
})
const reviewSetFetchUrl = computed(() =>
  `/api/review-sets?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`
)
const reviewSetLookupUrl = computed(() =>
  `/api/review-sets/lookups/setups?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`
)

const { search, pagination, items, response, status, refresh } = useResourceTable<EntityReviewSet>({
  fetchUrl: reviewSetFetchUrl
})

let requestGeneration = 0
onBeforeUnmount(() => {
  requestGeneration += 1
})

watch(() => [entityType, entityId], () => {
  requestGeneration += 1
  isSubmitting.value = false
  isCreateModalOpen.value = false
  selectedReviewSetSetupId.value = ''
  expandedRows.value = {}
})

const columns: TableColumnInput<ReviewLeafRow>[] = [
  { id: REVIEW_SET_GROUP_COLUMN_ID, accessorKey: REVIEW_SET_GROUP_COLUMN_ID, headerKey: 'common.name' },
  { id: 'name', accessorKey: 'reviewNameEn', headerKey: 'common.name' },
  { id: 'agency', accessorKey: 'agencyNameEn', headerKey: 'applicant_recipient.agency_financial_ids.agency' },
  { id: 'flags', accessorKey: 'reviewSetRuntimeState', headerKey: 'common.flags' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<ReviewLeafRow>[] = [
  {
    id: 'name',
    accessorKey: {
      en: 'reviewNameEn',
      fr: 'reviewNameFr'
    },
    headerKey: 'common.name'
  },
  {
    id: 'agency',
    accessorKey: {
      en: 'agencyNameEn',
      fr: 'agencyNameFr'
    },
    headerKey: 'applicant_recipient.agency_financial_ids.agency'
  }
]

const tableRows = computed<ReviewLeafRow[]>(() => items.value
  .flatMap(item => (item.reviews ?? []).map(review => ({
    id: review.id,
    reviewSetGroup: item.id,
    reviewSetupId: item.egcs_cn_reviewsetsetup,
    reviewSetupNameEn: item.egcs_cn_name_en,
    reviewSetupNameFr: item.egcs_cn_name_fr,
    agencyNameEn: item.agency_name_en,
    agencyNameFr: item.agency_name_fr,
    reviewSetupSequential: item.egcs_cn_sequential,
    reviewSetId: item.id,
    canRetry: review.can_retry,
    reviewSetRuntimeKind: item.runtimeKind,
    reviewSetRuntimeState: item.runtimeState,
    reviewNameEn: review.egcs_cn_name_en,
    reviewNameFr: review.egcs_cn_name_fr,
    reviewRuntimeState: review.runtimeState,
    reviewType: review.egcs_cn_reviewtype === 'checklist' ? 'checklist' : 'assessment'
  }))))

const totalRecords = computed(() => Number(response.value?.total ?? items.value.length))

const getReviewSetGroupRowId = (reviewSetId: string) => `${REVIEW_SET_GROUP_COLUMN_ID}:${reviewSetId}`

watch(
  tableRows,
  rows => {
    const currentExpandedRows = typeof expandedRows.value === 'object' && expandedRows.value !== null
      ? expandedRows.value
      : {}
    const reviewSetGroupIds = Array.from(new Set(rows.map(row => getReviewSetGroupRowId(row.reviewSetId))))
    const nextExpandedRows: Record<string, boolean> = {}

    for (const reviewSetGroupId of reviewSetGroupIds) {
      nextExpandedRows[reviewSetGroupId] = currentExpandedRows[reviewSetGroupId] ?? true
    }

    expandedRows.value = nextExpandedRows
  },
  { immediate: true }
)

const isGroupedRow = (row: GroupedReviewRow) => row.getIsGrouped?.() === true
const isReviewSetGroupRow = (row: GroupedReviewRow) => (
  isGroupedRow(row) && row.groupingColumnId === REVIEW_SET_GROUP_COLUMN_ID
)
const getGroupedRowCount = (row: GroupedReviewRow) => row.leafRows?.length ?? row.subRows?.length ?? 0
const updateExpandedRows = (value: ExpandedState) => {
  expandedRows.value = value
}

const isTerminalRuntimeState = (runtimeState: RuntimeState) => RUNTIME_TERMINAL_STATES.has(runtimeState)
const isRetryableReviewState = (runtimeState: RuntimeState) =>
  isTerminalRuntimeState(runtimeState) && runtimeState !== 'succeeded' && runtimeState !== 'approved'
const openCreateModal = () => {
  if (!canUpdate || isSubmitting.value) return
  selectedReviewSetSetupId.value = ''
  isCreateModalOpen.value = true
}

const selectReviewSetSetup = (setup: ReviewSetSetupLookupItem) => {
  selectedReviewSetSetupId.value = String(setup.id ?? '')
  void createReviewSet()
}

const postJson = async (url: string, body?: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method: 'POST',
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

/**
 * Submits a manual runtime review-set creation request for the explicit entity target.
 */
const createReviewSet = async () => {
  if (!canUpdate || !selectedReviewSetSetupId.value || isSubmitting.value) {
    return
  }

  const generation = requestGeneration
  try {
    isSubmitting.value = true
    await postJson('/api/review-sets', {
      entityType,
      entityId,
      reviewSetSetupId: selectedReviewSetSetupId.value
    })
    if (generation !== requestGeneration) return
    isCreateModalOpen.value = false
    await refresh()
    if (generation === requestGeneration) emit('changed')
  } catch (error: unknown) {
    if (generation === requestGeneration) showError(error)
  } finally {
    if (generation === requestGeneration) isSubmitting.value = false
  }
}

/**
 * Cancels an in-progress runtime review set.
 *
 * @param reviewSetId - Runtime review-set identifier.
 */
const cancelReviewSet = async (reviewSetId: string) => {
  if (!canUpdate) return
  const generation = requestGeneration
  try {
    await postJson(`/api/review-sets/${reviewSetId}/cancel`)
    if (generation === requestGeneration) {
      await refresh()
      if (generation === requestGeneration) emit('changed')
    }
  } catch (error: unknown) {
    if (generation === requestGeneration) showError(error)
  }
}

/**
 * Clones a denied review into a new draft review within the same runtime set.
 *
 * @param reviewId - Runtime review identifier to clone.
 */
const cloneDeniedReview = async (reviewId: string) => {
  if (!tableRows.value.some(row => row.id === reviewId && row.canRetry)) return
  const generation = requestGeneration
  try {
    await postJson(`/api/reviews/${reviewId}/clone`)
    if (generation === requestGeneration) {
      await refresh()
      if (generation === requestGeneration) emit('changed')
    }
  } catch (error: unknown) {
    if (generation === requestGeneration) showError(error)
  }
}

const openReview = async (row: ReviewLeafRow) => {
  const location = row.reviewType === 'checklist'
    ? appRouteLocations.checklistDetail(row.id)
    : appRouteLocations.assessmentDetail(row.id)
  await router.push(localePath({ ...location, query: { returnTo: route.fullPath } }))
}

const groupingOptions = {
  getGroupedRowModel: getGroupedRowModel()
}
const expandedOptions = { autoResetExpanded: false }
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :title="t('reviews.title')"
      :data="tableRows"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="canUpdate ? t('common.add') : undefined"
      :show-button="canUpdate"
      @add="openCreateModal"
      @retry="refresh"
      @update:expanded="updateExpandedRows">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <CommonGroupedDisclosureButton
            v-if="isReviewSetGroupRow(row)"
            class="group flex w-full items-center gap-3 py-1 text-left"
            :expanded="row.getIsExpanded?.() === true"
            :controls="getGroupedDisclosureControlsId(row.id)"
            :label-en="row.original.reviewSetupNameEn"
            :label-fr="row.original.reviewSetupNameFr"
            @toggle="row.toggleExpanded?.()">
            <UIcon
              :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />

            <span class="[&_p:first-child]:transition-colors group-hover:[&_p:first-child]:text-primary">
              <CommonBilingualName
                :name-en="row.original.reviewSetupNameEn"
                :name-fr="row.original.reviewSetupNameFr" />
            </span>

            <CommonStatusBadge variant="code" size="sm" :label="`${t('common.id')} ${row.original.reviewSetId}`" />

            <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row))" />
          </CommonGroupedDisclosureButton>

          <div v-else class="flex items-center gap-3 pl-12">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <button
              type="button"
              class="cursor-default text-left [&_p:first-child]:transition-colors hover:[&_p:first-child]:text-primary"
              :aria-label="t('common.open')"
              @click="openReview(row.original)">
              <CommonBilingualName
                :name-en="row.original.reviewNameEn"
                :name-fr="row.original.reviewNameFr" />
            </button>
          </div>
        </div>
      </template>

      <template #agency-cell="{ row }">
        <CommonBilingualName
          v-if="isReviewSetGroupRow(row) && (row.original.agencyNameEn || row.original.agencyNameFr)"
          :name-en="row.original.agencyNameEn"
          :name-fr="row.original.agencyNameFr" />
      </template>

      <template #flags-cell="{ row }">
        <div v-if="isReviewSetGroupRow(row)" class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge v-if="row.original.reviewSetupSequential" variant="sequential" />
          <CommonLifecycleBadge engine="runtime" :state="row.original.reviewSetRuntimeState" />
        </div>

        <div v-else class="flex flex-wrap items-center gap-2">
          <CommonLifecycleBadge engine="runtime" :state="row.original.reviewRuntimeState" />
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isReviewSetGroupRow(row) && canUpdate" class="flex justify-end gap-2">
          <UButton
            v-if="!isTerminalRuntimeState(row.original.reviewSetRuntimeState)"
            icon="i-lucide-ban"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.cancel')"
            @click="cancelReviewSet(row.original.reviewSetId)" />
        </div>

        <div v-else-if="!isGroupedRow(row)" class="flex justify-end gap-2">
          <UButton
            icon="i-lucide-eye"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')"
            @click="openReview(row.original)" />
          <UButton
            v-if="row.original.canRetry && row.original.reviewSetRuntimeKind === 'review_set' && isTerminalRuntimeState(row.original.reviewSetRuntimeState) && isRetryableReviewState(row.original.reviewRuntimeState)"
            icon="i-lucide-copy-plus"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :label="t('reviews.clone_denied_review')"
            :aria-label="t('reviews.clone_denied_review')"
            @click="cloneDeniedReview(row.original.id)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-model:open="isCreateModalOpen"
      :title="t('reviews.create_title')"
      :description="t('reviews.setup_placeholder')">
      <template #content>
        <CommonAsyncCommandPaletteLookup
          :fetch-url="reviewSetLookupUrl"
          :placeholder="t('reviews.setup_placeholder')"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
          description-en-key="description_en"
          description-fr-key="description_fr"
          icon="i-lucide-clipboard-check"
          @select="selectReviewSetSetup"
          @update-open="value => (isCreateModalOpen = value)" />
      </template>
    </UModal>
  </div>
</template>
