<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- catalog composition and template handlers. */
import { computed, ref, watch } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { AgencyClauseCreateSchema, AgencyClauseTextSchema, type AgencyClauseDraft, type AgencyClauseItem, type AgencyClauseText } from '~~/shared/types/schemas/agency-clause'

const { agencyId, canManage } = defineProps<{ agencyId: string, canManage: boolean }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const confirmRetire = useDeleteConfirm()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const endpoint = computed(() => `/api/agency/${agencyId}/clauses`)
const catalog = useResourceRequest({
  identity: endpoint,
  load: async signal => {
    const response = await fetch(getClientRequestUrl(endpoint.value), { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json() as { items: AgencyClauseItem[] }
  }
})
const items = computed(() => catalog.data.value?.items ?? [])
const findClause = (id: string) => items.value.find(clause => clause.id === id)
const name = (clause: AgencyClauseItem) => getBilingualValue(clause, 'egcs_ay_name') || clause.egcs_ay_languageindependentcode
const canPublish = (clause: AgencyClauseItem) => clause.publicationState === 'draft'
  || (clause.publicationState === 'published' && clause.hasUnpublishedChanges)
const context = useActionContext({ identity: [endpoint], authority: () => canManage })
const captureSettlement = useCommittedSettlement({
  context,
  settle: async () => await catalog.refresh()
    ? { kind: 'available' }
    : { kind: 'unavailable', error: catalog.error.value }
})

type ClauseEditor =
  | { kind: 'group', id?: string, draft: Omit<AgencyClauseDraft, 'rows'> }
  | { kind: 'clause', id: string, draft: AgencyClauseText }
const modal = useCrudModal<ClauseEditor, ClauseEditor>({
  createState: () => ({
    kind: 'group',
    draft: {
      egcs_ay_languageindependentcode: '',
      egcs_ay_name_en: '',
      egcs_ay_name_fr: '',
      egcs_ay_description_en: '',
      egcs_ay_description_fr: '',
      egcs_ay_active: true
    }
  }),
  updateState: editor => editor
})
const editGroup = ({ id, rows, publicationState, hasUnpublishedChanges, ...draft }: AgencyClauseItem) =>
  modal.openUpdate({ kind: 'group', id, draft })
const editClause = (group: AgencyClauseItem, clause?: AgencyClauseText) => {
  const highestOrder = group.rows.reduce((highest, row) => Math.max(highest, row.egcs_ay_displayorder), 0)
  modal.openUpdate({
    kind: 'clause',
    id: group.id,
    draft: clause
      ? { ...clause }
      : {
          egcs_ay_clause_en: '',
          egcs_ay_clause_fr: '',
          egcs_ay_displayorder: Math.min(highestOrder + 1, 2147483647)
        }
  })
}
const { isOpen, selected } = modal
const editable = computed(() => {
  if (!canManage) return false
  if (!selected.value?.id) return true
  const clause = findClause(selected.value.id)
  return Boolean(clause && clause.publicationState !== 'retired')
})
const editorContext = useActionContext({
  identity: [endpoint, () => selected.value?.id],
  authority: () => canManage,
  eligible: editable
})
const pending = ref(false)
const expanded = ref<Record<string, boolean>>({})
const canEditGroup = (group: AgencyClauseItem) => canManage && group.publicationState !== 'retired'

watch(endpoint, () => {
  modal.close()
  expanded.value = {}
}, { flush: 'sync' })

const writeGroup = async (id: string | undefined, draft: AgencyClauseDraft) => {
  const { egcs_ay_languageindependentcode, ...update } = draft
  const response = await fetch(getClientRequestUrl(id ? `${endpoint.value}/${id}` : endpoint.value), {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? update : draft)
  })
  if (!response.ok) await throwFetchResponseError(response)
}

const draftFromGroup = ({ id, publicationState, hasUnpublishedChanges, ...draft }: AgencyClauseItem) => draft

const save = async () => {
  const editor = selected.value
  const session = modal.captureSession()
  const operation = editorContext.capture()
  const settlement = captureSettlement()
  if (!editor || session === null || !operation?.canDispatch() || !settlement?.canDispatch() || pending.value) return
  const group = editor.id ? findClause(editor.id) : undefined
  if (editor.id && !group) return
  let draft: AgencyClauseDraft
  if (editor.kind === 'group') {
    draft = { ...editor.draft, rows: group?.rows ?? [] }
  } else {
    if (!group || (editor.draft.id && !group.rows.some(row => row.id === editor.draft.id))) return
    const rows = editor.draft.id
      ? group.rows.map(row => row.id === editor.draft.id ? editor.draft : row)
      : [...group.rows, editor.draft]
    draft = { ...draftFromGroup(group), rows }
  }
  pending.value = true
  try {
    await writeGroup(editor.id, draft)
    if (operation.isCurrent() && modal.closeSession(session)) {
      if (editor.kind === 'clause') expanded.value[editor.id] = true
      toast.add({
        title: toast.localized(editor.kind === 'clause' ? 'clauses.clause_saved' : 'clauses.saved'),
        description: toast.localized('clauses.saved_description'),
        color: 'success'
      })
    }
    await settlement.settle()
  } catch (error) {
    if (operation.isCurrent() && modal.isCurrentSession(session)) showError(error)
  } finally {
    pending.value = false
  }
}

const removeText = async (groupId: string, clauseId: string | undefined) => {
  const operation = context.capture()
  const settlement = captureSettlement()
  if (!clauseId || !operation?.canDispatch() || !settlement?.canDispatch() || pending.value) return
  pending.value = true
  try {
    if (!await confirmRetire({ description: t('clauses.remove_clause_confirm') }) || !operation.canDispatch()) return
    const group = findClause(groupId)
    if (!group || !canEditGroup(group) || !group.rows.some(row => row.id === clauseId)) return
    await writeGroup(groupId, { ...draftFromGroup(group), rows: group.rows.filter(row => row.id !== clauseId) })
    if (operation.isCurrent()) toast.add({
      title: toast.localized('clauses.clause_removed'),
      description: toast.localized('clauses.clause_removed_description'),
      color: 'success'
    })
    await settlement.settle()
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  } finally {
    pending.value = false
  }
}

const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: editorContext }, submit: save })
const validateGroup = createValidator(AgencyClauseCreateSchema.omit({ rows: true }))
const validateClause = createValidator(AgencyClauseTextSchema)
const modalTitle = computed(() => {
  const editor = selected.value
  if (editor?.kind === 'clause') return t(editor.draft.id ? 'clauses.edit_clause' : 'clauses.add_clause')
  return t(editor?.id ? (editable.value ? 'clauses.edit' : 'clauses.group') : 'clauses.add')
})

const changePublication = async (clauseId: string, action: 'publish' | 'retire') => {
  const operation = context.capture()
  const settlement = captureSettlement()
  const eligible = () => {
    const clause = findClause(clauseId)
    return clause && (action === 'publish' ? canPublish(clause) : clause.publicationState === 'published')
  }
  if (!operation?.canDispatch() || !settlement?.canDispatch() || !eligible() || pending.value) return
  const path = `${endpoint.value}/${clauseId}/${action}`
  pending.value = true
  try {
    if (action === 'retire' && !await confirmRetire({
      title: t('clauses.retire_title'),
      description: t('clauses.retire_description'),
      confirmLabel: t('common.retire')
    })) return
    if (!operation.canDispatch() || !eligible()) return
    const response = await fetch(getClientRequestUrl(path), { method: 'POST' })
    if (!response.ok) await throwFetchResponseError(response)
    if (operation.isCurrent()) toast.add({
      title: toast.localized(action === 'publish' ? 'clauses.published' : 'clauses.retired'),
      description: toast.localized(action === 'publish' ? 'clauses.published_description' : 'clauses.retired_description'),
      color: 'success'
    })
    await settlement.settle()
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  } finally {
    pending.value = false
  }
}

const removeClause = async (clauseId: string) => {
  const operation = context.capture()
  const settlement = captureSettlement()
  if (!operation?.canDispatch() || !settlement?.canDispatch() || pending.value) return
  pending.value = true
  try {
    const removed = await confirmDeleteRequest(`${endpoint.value}/${clauseId}`, {
      operation,
      target: { id: clauseId, resolve: () => findClause(clauseId), eligible: clause => clause.publicationState === 'draft' }
    })
    if (!removed) return
    if (operation.isCurrent()) toast.add({
      title: toast.localized('clauses.deleted'),
      description: toast.localized('clauses.deleted_description'),
      color: 'success'
    })
    await settlement.settle()
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section>
    <CommonClauseGroupTable
      :key="agencyId"
      v-model:expanded="expanded"
      table-id="agency.clauses"
      :items="items"
      :status="catalog.status.value"
      :can-add="canManage"
      :busy="pending"
      @add="modal.openCreate()"
      @retry="catalog.refresh()">
      <template #actions="{ item }">
        <div v-if="item.kind === 'group'" class="flex items-center gap-2">
          <CommonActionButton v-if="canEditGroup(item.group)" icon="i-lucide-plus" color="primary" variant="ghost" size="sm" :aria-label="`${t('clauses.add_clause')}: ${name(item.group)}`" :disabled="pending" @click="editClause(item.group)" />
          <CommonActionButton :icon="canEditGroup(item.group) ? 'i-lucide-pencil' : 'i-lucide-eye'" color="neutral" variant="ghost" size="sm" :aria-label="t(canEditGroup(item.group) ? 'common.edit' : 'common.open')" :disabled="pending" @click="editGroup(item.group)" />
          <CommonActionButton v-if="canManage && canPublish(item.group)" icon="i-lucide-upload" color="neutral" variant="ghost" size="sm" :aria-label="`${t('clauses.publish')}: ${name(item.group)}`" :disabled="pending" @click="changePublication(item.group.id, 'publish')" />
          <CommonActionButton v-if="canManage && item.group.publicationState === 'published'" icon="i-lucide-archive" color="neutral" variant="ghost" size="sm" :aria-label="`${t('common.retire')}: ${name(item.group)}`" :disabled="pending" @click="changePublication(item.group.id, 'retire')" />
          <CommonActionButton v-if="canManage && item.group.publicationState === 'draft'" icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="`${t('common.delete')}: ${name(item.group)}`" :disabled="pending" @click="removeClause(item.group.id)" />
        </div>
        <div v-else-if="canEditGroup(item.group)" class="flex items-center gap-2">
          <CommonActionButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('clauses.edit_clause_named', { number: item.clause.egcs_ay_displayorder })" :disabled="pending" @click="editClause(item.group, item.clause)" />
          <CommonActionButton icon="i-lucide-trash" color="error" variant="ghost" size="sm" :aria-label="t('clauses.remove_row', { number: item.clause.egcs_ay_displayorder })" :disabled="pending" @click="removeText(item.group.id, item.clause.id)" />
        </div>
      </template>
    </CommonClauseGroupTable>

    <UModal v-model:open="isOpen" :title="modalTitle" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <UForm v-if="selected?.kind === 'group'" v-bind="formSession" :state="selected.draft" :validate="validateGroup" :disabled="!editable || pending" data-field-scope="agency.clause" class="space-y-5">
          <UFormField :label="t('clauses.code')" name="egcs_ay_languageindependentcode" required :description="selected.id ? undefined : t('clauses.code_help')">
            <UInput v-model="selected.draft.egcs_ay_languageindependentcode" :disabled="Boolean(selected.id)" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
              <UInput v-model="selected.draft.egcs_ay_name_en" maxlength="255" class="w-full" />
            </UFormField>
            <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
              <UInput v-model="selected.draft.egcs_ay_name_fr" maxlength="255" class="w-full" />
            </UFormField>
            <UFormField :label="t('agency.description_en')" name="egcs_ay_description_en">
              <UTextarea v-model="selected.draft.egcs_ay_description_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('agency.description_fr')" name="egcs_ay_description_fr">
              <UTextarea v-model="selected.draft.egcs_ay_description_fr" class="w-full" />
            </UFormField>
          </div>
          <UFormField name="egcs_ay_active">
            <USwitch v-model="selected.draft.egcs_ay_active" :label="t('clauses.active')" data-ui-target="agency.clause.egcs_ay_active" />
          </UFormField>

          <div v-if="editable" class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="modal.close()" />
            <CommonSaveButton :label="t('clauses.save_draft')" :loading="pending" />
          </div>
        </UForm>
        <UForm v-else-if="selected?.kind === 'clause'" v-bind="formSession" :state="selected.draft" :validate="validateClause" :disabled="!editable || pending" data-field-scope="agency.clause.rows" class="space-y-4">
          <UFormField :label="t('clauses.order')" name="egcs_ay_displayorder" required>
            <UInput v-model.number="selected.draft.egcs_ay_displayorder" type="number" min="0" max="2147483647" step="1" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('clauses.text_en')" name="egcs_ay_clause_en">
              <UTextarea v-model="selected.draft.egcs_ay_clause_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('clauses.text_fr')" name="egcs_ay_clause_fr">
              <UTextarea v-model="selected.draft.egcs_ay_clause_fr" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="modal.close()" />
            <CommonSaveButton :label="t('clauses.save_draft')" :loading="pending" />
          </div>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
