<script setup lang="ts" generic="T extends { id: string } & Record<string, unknown>">
import { useResourceCrudState } from '~/composables/useResourceCrudState'
import type { z } from 'zod'
import { useSlots, type Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { EnumKey } from '~/types/enums'

const {
  title,
  fetchUrl,
  staticItems,
  staticMode = false,
  postUrl,
  updateUrlBase,
  deleteUrlBase,
  updateMethod = 'PATCH',
  schema,
  initialNewItem,
  columns,
  bilingualColumns,
  buttonLabel,
  showButton = true,
  canCreate: createAllowed = true,
  canUpdate: updateAllowed = true,
  canDelete: deleteAllowed = true,
  modalTitle,
  updateTitle,
  tableClass,
  searchPlaceholder,
  statusEnumName,
  statusFilterLabel,
  deleteConfirmKey = 'agency.delete_confirm',
  modalFullscreen = false,
  modalUi,
  embedded = false
} = defineProps<{
  title: string
  icon: string
  fetchUrl: string
  staticItems?: T[]
  staticMode?: boolean
  postUrl?: string
  updateUrlBase?: string
  deleteUrlBase?: string
  updateMethod?: 'PATCH' | 'PUT'
  schema: z.ZodTypeAny
  initialNewItem?: Partial<T> | null
  columns: TableColumnInput<T>[]
  bilingualColumns?: BilingualColumnConfig<T>[]
  buttonLabel?: string
  showButton?: boolean
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  modalTitle?: string
  updateTitle?: string
  tableClass?: string
  searchPlaceholder?: string
  statusEnumName?: EnumKey
  statusFilterLabel?: string
  deleteConfirmKey?: string
  modalFullscreen?: boolean
  modalUi?: Record<string, string>
  embedded?: boolean
}>()

const effectivePostUrl = computed(() => staticMode || !createAllowed ? undefined : postUrl)
const effectiveUpdateUrlBase = computed(() => staticMode || !updateAllowed ? undefined : updateUrlBase)
const effectiveDeleteUrlBase = computed(() => staticMode || !deleteAllowed ? undefined : deleteUrlBase)

const emit = defineEmits(['added', 'updated', 'deleted', 'update:statusFilter'])

const statusFilter = defineModel<string>('statusFilter')

const { t } = useI18n()
const slots = useSlots()
const forwardedSlotNames = computed(() => Object.keys(slots).filter(name => name !== 'actions-cell'))

const tableRef: Ref<unknown | null> = ref(null)

const {
  validate,
  search,
  pagination,
  items,
  totalRecords,
  refresh,
  retry,
  listStatus,
  isModalOpen,
  formState,
  canUpdate,
  resolvedModalTitle,
  submitLabel,
  isSaving,
  closeModal,
  openCreate,
  openUpdate,
  saveItem,
  deleteItem
} = useResourceCrudState<T>({
  title,
  fetchUrl,
  staticItems: staticMode ? () => staticItems : undefined,
  postUrl: effectivePostUrl,
  updateUrlBase: effectiveUpdateUrlBase,
  deleteUrlBase: effectiveDeleteUrlBase,
  updateMethod,
  schema,
  initialNewItem,
  buttonLabel,
  modalTitle,
  updateTitle,
  deleteConfirmKey,
  statusFilter,
  emitAdded: () => emit('added'),
  emitUpdated: () => emit('updated'),
  emitDeleted: () => emit('deleted')
})

defineExpose({
  search,
  pagination,
  refresh,
  openUpdate,
  deleteItem
})
</script>

<template>
  <div class="min-w-0">
    <CommonResourceLayoutCard
      ref="tableRef"
      v-model:search="search"
      v-model:status-filter="statusFilter"
      v-model:pagination="pagination"
      :status-enum-name="statusEnumName"
      :status-filter-label="statusFilterLabel"
      :button-label="buttonLabel"
      :show-button="showButton && createAllowed && !staticMode"
      :search-placeholder="searchPlaceholder"
      :data="items"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :total-records="totalRecords"
      :loading="listStatus === 'pending'"
      :request-status="listStatus"
      :table-class="tableClass"
      :embedded="embedded"
      @add="openCreate"
      @retry="retry">
      <!-- Pass through all slots to Layout/Table -->
      <template v-for="name in forwardedSlotNames" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>

      <template #actions-cell="{ row }">
        <slot name="actions-cell" :row="row">
          <div class="flex items-center gap-2">
            <UButton
              v-if="canUpdate"
              icon="i-lucide-edit-3"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('common.edit')"
              @click="openUpdate(row.original)" />
            <UButton
              v-if="effectiveDeleteUrlBase"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="t('common.delete')"
              @click="deleteItem(row.original.id)" />
          </div>
        </slot>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-model:open="isModalOpen"
      :title="resolvedModalTitle"
      :description="t('common.form_dialog_description')"
      :fullscreen="modalFullscreen"
      :ui="modalUi">
      <template #body>
        <UForm v-if="formState" :state="formState" :validate="validate" class="space-y-4" @submit="saveItem">
          <slot name="form" :state="formState" />

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeModal" />
            <CommonSaveButton :label="submitLabel" :loading="isSaving" :disabled="isSaving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
