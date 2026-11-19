<script setup lang="ts">
import { watch } from 'vue'
import { StreamClauseLinkSchema, type StreamClauseLink } from '~~/shared/types/schemas/stream-clause'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'
import type { ActionContext } from '~/composables/useActionContext'
import { useCrudModal } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'

const {
  items, status, refresh, canUpdate, lookupUrl, busy, actionContext, add, remove
} = defineProps<{
  items: StreamClauseLink[]
  status: ResourceTableStatus
  refresh: () => Promise<boolean>
  canUpdate: boolean
  lookupUrl: string
  busy: boolean
  actionContext: ActionContext
  add: (clauseId: string) => Promise<boolean>
  remove: (link: StreamClauseLink) => Promise<void>
}>()

const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const modal = useCrudModal<{ egcs_tp_clause: string }, { egcs_tp_clause: string }>({
  createState: () => ({ egcs_tp_clause: '' }),
  updateState: item => ({ ...item })
})
const { selected: draft, isOpen } = modal
watch(() => actionContext.version.value, modal.close, { flush: 'sync' })

const form = useFormSession({
  owner: modal,
  action: { kind: 'remote', context: () => actionContext },
  /** Submits the validated selection for the current modal opening. */
  submit: async () => {
    const operation = actionContext.capture()
    const session = modal.captureSession()
    if (!operation?.canDispatch() || session === null || !draft.value || busy) return
    const clauseId = draft.value.egcs_tp_clause
    try {
      const saved = await add(clauseId)
      if (saved && operation.isCurrent() && draft.value?.egcs_tp_clause === clauseId) modal.closeSession(session)
    } catch (error: unknown) {
      if (operation.canDispatch() && modal.isCurrentSession(session)) showError(error)
    }
  }
})
</script>

<template>
  <div data-field-scope="transfer-payment.stream-clauses">
    <CommonClauseGroupTable
      :key="lookupUrl"
      table-id="transfer-payment.stream-clauses"
      :items="items"
      :status="status"
      :can-add="canUpdate"
      :busy="busy"
      @add="modal.openCreate()"
      @retry="refresh">
      <template #actions="{ item }">
        <CommonActionButton
          v-if="item.kind === 'group' && canUpdate"
          icon="i-lucide-unlink" color="error" variant="ghost" size="sm" :disabled="busy"
          :aria-label="t('transfer_payment.stream_clause_unlink_named', { name: locale === 'fr' ? item.group.egcs_ay_name_fr : item.group.egcs_ay_name_en })"
          @click="remove(item.group)" />
      </template>
    </CommonClauseGroupTable>
    <UModal :open="isOpen" :title="t('transfer_payment.stream_clause_link')" @update:open="value => { if (!value) modal.close() }">
      <template #body>
        <UForm v-if="draft" v-bind="form" :state="draft" :validate="createValidator(StreamClauseLinkSchema)" class="space-y-4">
          <UFormField :label="t('clauses.group')" name="egcs_tp_clause" required>
            <CommonServerLookupSelect
              v-model="draft.egcs_tp_clause"
              :fetch-url="lookupUrl"
              value-key="id"
              label-en-key="egcs_ay_name_en"
              label-fr-key="egcs_ay_name_fr"
              :include-deleted-query="false"
              selected-values-query-key="ids"
              :query="{}"
              aria-required="true" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="modal.close()" />
            <CommonSaveButton :label="t('common.save')" :loading="busy" :disabled="busy" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
