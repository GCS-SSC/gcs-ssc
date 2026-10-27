<script setup lang="ts" generic="T extends { id: string } & Record<string, unknown>">
import { useGuidedHelpDiscovery } from '~/composables/useGuidedHelpDiscovery'
import { useResourceCrudState } from '~/composables/useResourceCrudState'
import type { z } from 'zod'
import { useId, useSlots, type Ref } from 'vue'
import type { GuideObservedContext } from '@gcs-ssc/guided-help/runtime'
import { beginGuidedHelpAction } from '~/utils/guided-help-actions'
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
  beforeOpen,
  beforeSave,
  beforeDelete,
  columns,
  bilingualColumns,
  buttonLabel,
  helpAddTarget,
  helpSearchTarget,
  helpSaveTarget,
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
  beforeOpen?: (action: 'create' | 'update', original: T | null, shouldProceed: () => boolean) => Promise<boolean>
  beforeSave?: (state: Partial<T>, original: T | null, shouldProceed: () => boolean) => Promise<boolean>
  beforeDelete?: (id: string, shouldProceed: () => boolean) => Promise<boolean | undefined>
  columns: TableColumnInput<T>[]
  bilingualColumns?: BilingualColumnConfig<T>[]
  helpSaveTarget?: string
  helpAddTarget?: string
  helpSearchTarget?: string
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
const { active: guidedHelpActive } = useGuidedHelpDiscovery()
const slots = useSlots()
const forwardedSlotNames = computed(() => Object.keys(slots).filter(name => name !== 'actions-cell'))

const tableRef: Ref<unknown | null> = ref(null)
const helpRoot = ref<HTMLElement | null>(null)
const helpForm = ref<{ $el: HTMLElement } | null>(null)
const guidedHelpActions = useGuidedHelpActions()
const helpInstanceId = useId()
const helpModalVisit = ref(0)
const helpContext = computed<GuideObservedContext>(() => ({
  kind: 'owner', binding: null, execution: null,
  view: helpRoot.value?.closest<HTMLElement>('[data-help-view]')?.dataset.helpView ?? '',
  facts: [], visitId: `${helpInstanceId}:${helpModalVisit.value}`, draftRevision: 0
}))
let helpCreateCompleted: (() => void) | null = null
let helpSaveCompleted: (() => void) | null = null

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
  canSave,
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
  fetchUrl: computed(() => fetchUrl),
  createAllowed: () => createAllowed && !staticMode,
  staticItems: staticMode ? () => staticItems : undefined,
  postUrl: effectivePostUrl,
  updateUrlBase: effectiveUpdateUrlBase,
  deleteUrlBase: effectiveDeleteUrlBase,
  updateMethod,
  schema,
  initialNewItem,
  beforeOpen,
  beforeSave,
  beforeDelete,
  buttonLabel,
  modalTitle,
  updateTitle,
  deleteConfirmKey,
  statusFilter,
  emitAdded: () => {
    emit('added')
    helpSaveCompleted?.()
  },
  emitUpdated: () => {
    emit('updated')
    helpSaveCompleted?.()
  },
  emitDeleted: () => emit('deleted')
})

/** Captures Add before opening, and confirms only after the modal is rendered. */
const openGuidedCreate = async () => {
  helpModalVisit.value += 1
  const complete = beginGuidedHelpAction(guidedHelpActions, helpRoot.value, helpAddTarget, 'modal-open', helpContext.value)
  await openCreate()
  helpCreateCompleted = isModalOpen.value ? complete : null
}

const completeHelpModal = () => {
  if (isModalOpen.value) helpCreateCompleted?.()
  helpCreateCompleted = null
}

/** Retains the submitted control identity when successful Save closes its modal. */
const saveGuidedItem = async () => {
  if (isSaving.value) return
  helpSaveCompleted = beginGuidedHelpAction(guidedHelpActions, helpForm.value?.$el ?? null, helpSaveTarget, 'save-success', helpContext.value)
  try {
    await saveItem()
  } finally {
    helpSaveCompleted = null
  }
}

defineExpose({
  search,
  pagination,
  refresh,
  openUpdate,
  deleteItem
})
</script>

<template>
  <div ref="helpRoot" :data-help-context="JSON.stringify(helpContext)" class="min-w-0">
    <CommonResourceLayoutCard
      ref="tableRef"
      v-model:search="search"
      v-model:status-filter="statusFilter"
      v-model:pagination="pagination"
      :status-enum-name="statusEnumName"
      :status-filter-label="statusFilterLabel"
      :button-label="buttonLabel"
      :help-add-target="helpAddTarget"
      :help-search-target="helpSearchTarget"
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
      @add="openGuidedCreate"
      @retry="retry">
      <!-- Pass through all slots to Layout/Table -->
      <template v-for="name in forwardedSlotNames" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>

      <template #actions-cell="{ row }">
        <slot name="actions-cell" :row="row" :open-update="openUpdate" :delete-item="deleteItem">
          <div class="flex items-center gap-2">
            <CommonActionButton
              v-if="canUpdate"
              icon="i-lucide-edit-3"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('common.edit_named', { name: row.original.id })"
              @click="openUpdate(row.original)" />
            <CommonActionButton
              v-if="effectiveDeleteUrlBase"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="t('common.delete_named', { name: row.original.id })"
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
      :ui="modalUi"
      @after:enter="completeHelpModal"
      @after:leave="helpCreateCompleted = null">
      <template #body>
        <UForm v-if="formState" ref="helpForm" :data-help-context="JSON.stringify(helpContext)" :state="formState" :validate="validate" :validate-on="helpSaveTarget && guidedHelpActive ? ['input', 'blur', 'change'] : []" :disabled="isSaving" class="space-y-4" @submit="saveGuidedItem">
          <slot name="form" :state="formState" />

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeModal" />
            <CommonSaveButton :data-help-target="helpSaveTarget" :label="submitLabel" :loading="isSaving" :disabled="isSaving || !canSave" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
