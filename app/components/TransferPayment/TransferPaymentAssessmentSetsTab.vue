<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local CRUD helpers are self-documenting and not public APIs */
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { resolveSelectedAssessmentSetId } from '~/utils/transfer-payment-assessment-sets-tab'
import type {
  TransferPaymentAssessmentSetItemRecord,
  TransferPaymentAssessmentSetRecord
} from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

type AssessmentSetTableRow = TransferPaymentAssessmentSetRecord & {
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}
type AssessmentItemTableRow = TransferPaymentAssessmentSetItemRecord & {
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_outcomename_en?: string
  egcs_cn_outcomename_fr?: string
  publicationVersion?: number | null
}

const {
  transferPaymentId,
  streamId,
  agencyId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()

const isAssessmentSetModalOpen: Ref<boolean> = ref(false)
const selectedAssessmentSet: Ref<Record<string, unknown> | null> = ref(null)
const isAssessmentItemModalOpen: Ref<boolean> = ref(false)
const selectedAssessmentItem: Ref<Record<string, unknown> | null> = ref(null)
const selectedAssessmentSetId: Ref<string | null> = ref(null)

const {
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  status
} = useResourceTable<AssessmentSetTableRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets`)
})

const {
  search: childSearch,
  pagination: childPagination,
  items: childItems,
  totalRecords: childTotalRecords,
  refresh: refreshChildItems,
  status: childStatus
} = useResourceTable<AssessmentItemTableRow>({
  fetchUrl: computed(() => selectedAssessmentSetId.value
    ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${selectedAssessmentSetId.value}/items`
    : ''),
  enabled: computed(() => Boolean(selectedAssessmentSetId.value))
})

watch(items, value => {
  selectedAssessmentSetId.value = resolveSelectedAssessmentSetId(selectedAssessmentSetId.value, value)
}, { immediate: true })
watch(selectedAssessmentSetId, (value, previous) => {
  if (value === previous) return
  childPagination.value = { ...childPagination.value, pageIndex: 0 }
  childSearch.value = ''
})

const selectedSetRow = computed(() => items.value.find(item => String(item.id) === selectedAssessmentSetId.value) ?? null)

const parentColumns: TableColumnInput<AssessmentSetTableRow>[] = [
  { id: 'name', accessorKey: 'egcs_cn_name_en', headerKey: 'transfer_payment.name_en' },
  { accessorKey: 'egcs_cn_order', headerKey: 'common.order' },
  { accessorKey: 'assessment_count', headerKey: 'transfer_payment.assessment_items' },
  { accessorKey: 'publicationState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const childColumns: TableColumnInput<AssessmentItemTableRow>[] = [
  { id: 'schema', accessorKey: 'egcs_cn_name_en', headerKey: 'transfer_payment.review_schema' },
  { accessorKey: 'egcs_cn_outcomename_en', headerKey: 'transfer_payment.outcome_name' },
  { accessorKey: 'publicationVersion', headerKey: 'admin_common.fields.egcs_cn_version' },
  { accessorKey: 'egcs_cn_order', headerKey: 'common.order' },
  { id: 'actions', headerKey: 'common.actions' }
]

const selectAssessmentSet = (row: AssessmentSetTableRow) => {
  selectedAssessmentSetId.value = String(row.id)
}

const openCreateAssessmentSet = () => {
  if (!canUpdateChild) {
    return
  }

  selectedAssessmentSet.value = {
    egcs_cn_entitytype: 'fundingcasepayment',
    egcs_cn_order: totalRecords.value + 1,
    egcs_cn_sequential: false
  }
  isAssessmentSetModalOpen.value = true
}

const openEditAssessmentSet = (row: AssessmentSetTableRow) => {
  if (!canUpdateChild) {
    return
  }

  selectedAssessmentSet.value = { ...row }
  isAssessmentSetModalOpen.value = true
}

const deleteAssessmentSet = async (row: AssessmentSetTableRow) => {
  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${row.id}`
    )
    if (!ok) {
      return
    }

    if (String(row.id) === selectedAssessmentSetId.value) {
      selectedAssessmentSetId.value = null
    }
    await refresh()
    await refreshChildItems()
  } catch (error) {
    showError(error)
  }
}

const openCreateAssessmentItem = () => {
  if (!canUpdateChild || !selectedAssessmentSetId.value) {
    return
  }

  selectedAssessmentItem.value = {
    egcs_cn_order: childTotalRecords.value + 1
  }
  isAssessmentItemModalOpen.value = true
}

const openEditAssessmentItem = (row: AssessmentItemTableRow) => {
  if (!canUpdateChild) {
    return
  }

  selectedAssessmentItem.value = { ...row }
  isAssessmentItemModalOpen.value = true
}

const deleteAssessmentItem = async (row: AssessmentItemTableRow) => {
  if (!selectedAssessmentSetId.value) {
    return
  }

  try {
    const ok = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${selectedAssessmentSetId.value}/items/${row.id}`
    )
    if (!ok) {
      return
    }

    await refresh()
    await refreshChildItems()
  } catch (error) {
    showError(error)
  }
}

const openSchemaEditor = async (row: AssessmentItemTableRow) => {
  await router.push(
    localePath(
      appRouteLocations.transferPaymentAssessmentSchemaDetail(
        transferPaymentId,
        streamId,
        String(row.egcs_cn_reviewschema)
      )
    )
  )
}

const handleAssessmentSetSaved = async () => {
  await refresh()
}

const handleAssessmentItemSaved = async () => {
  await refresh()
  await refreshChildItems()
}
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">
            {{ t('transfer_payment.assessment_sets') }}
          </h2>
          <p class="text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('transfer_payment.assessment_sets_description') }}
          </p>
        </div>
      </div>

      <CommonResourceLayoutCard
        v-model:search="search"
        v-model:pagination="pagination"
        :data="items"
        :columns="parentColumns"
        :total-records="totalRecords"
        :loading="status === 'pending'"
        :request-status="status"
        :button-label="canUpdateChild ? t('common.add') : undefined"
        :show-button="canUpdateChild"
        @add="openCreateAssessmentSet"
        @retry="refresh">
        <template #name-cell="{ row }">
          <UButton
            :label="getBilingualValue(row.original, 'egcs_cn_name')"
            color="neutral"
            variant="ghost"
            class="justify-start px-0 font-semibold cursor-default"
            :trailing-icon="String(row.original.id) === selectedAssessmentSetId ? 'i-lucide-check' : undefined"
            @click="selectAssessmentSet(row.original)" />
        </template>

        <template #publicationState-cell="{ row }">
          <CommonLifecycleBadge engine="publication" :state="row.original.publicationState" />
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              v-if="canUpdateChild"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('common.edit')"
              @click="openEditAssessmentSet(row.original)" />
            <UButton
              v-if="canDeleteChild"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('common.delete')"
              @click="deleteAssessmentSet(row.original)" />
          </div>
        </template>
      </CommonResourceLayoutCard>

      <div v-if="selectedSetRow" class="mt-6 space-y-4">
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                {{ t('transfer_payment.selected_assessment_set') }}
              </p>
              <h3 class="text-base font-semibold">
                {{ getBilingualValue(selectedSetRow, 'egcs_cn_name') }}
              </h3>
            </div>
            <div class="text-sm text-zinc-500 dark:text-zinc-400">
              {{ selectedSetRow.assessment_count ?? 0 }} {{ t('transfer_payment.assessment_items') }}
            </div>
          </div>
        </div>

        <CommonResourceLayoutCard
          v-model:search="childSearch"
          v-model:pagination="childPagination"
          :data="childItems"
          :columns="childColumns"
          :total-records="childTotalRecords"
          :loading="childStatus === 'pending'"
          :request-status="childStatus"
          :button-label="canUpdateChild ? t('common.add') : undefined"
          :show-button="canUpdateChild"
          @add="openCreateAssessmentItem"
          @retry="refreshChildItems">
          <template #schema-cell="{ row }">
            <UButton
              :label="getBilingualValue(row.original, 'egcs_cn_name')"
              color="neutral"
              variant="ghost"
              class="justify-start px-0 font-bold cursor-default"
              @click="openSchemaEditor(row.original)" />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2">
              <UButton
                v-if="canUpdateChild"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :aria-label="t('common.edit')"
                @click="openEditAssessmentItem(row.original)" />
              <UButton
                icon="i-lucide-arrow-right"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :aria-label="t('common.open')"
                @click="openSchemaEditor(row.original)" />
              <UButton
                v-if="canDeleteChild"
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :aria-label="t('common.delete')"
                @click="deleteAssessmentItem(row.original)" />
            </div>
          </template>
        </CommonResourceLayoutCard>
      </div>
    </div>

    <TransferPaymentAssessmentSetModal
      v-if="selectedAssessmentSet"
      v-model:open="isAssessmentSetModalOpen"
      v-model:state="selectedAssessmentSet"
      :transfer-payment-id="transferPaymentId"
      :stream-id="streamId"
      :agency-id="agencyId"
      @saved="handleAssessmentSetSaved" />

    <TransferPaymentAssessmentSetItemModal
      v-if="selectedAssessmentItem && selectedAssessmentSetId"
      v-model:open="isAssessmentItemModalOpen"
      v-model:state="selectedAssessmentItem"
      :transfer-payment-id="transferPaymentId"
      :stream-id="streamId"
      :assessment-set-id="selectedAssessmentSetId"
      :agency-id="agencyId"
      :entity-type="selectedSetRow?.egcs_cn_entitytype"
      @saved="handleAssessmentItemSaved" />
  </div>
</template>
