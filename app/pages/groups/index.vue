<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Page-local request and form handlers are clear from their names. */
import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useResourceRequest } from '~/composables/useResourceRequest'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { GroupCreateSchema, GroupMemberSchema } from '~~/shared/types/schemas/group'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ i18n: { paths: { en: '/groups', fr: '/groupes' } } })

type Group = { id: string; egcs_cn_agency: string; egcs_cn_name_en: string; egcs_cn_name_fr: string; egcs_cn_email: string }
type Agency = { id: string; egcs_ay_name_en: string; egcs_ay_name_fr: string }
type Member = { egcs_cn_user: string; egcs_cn_name: string }
type MemberRead = { kind: 'pending' | 'success' | 'error'; token: symbol }
type UserOption = { id: string; egcs_cn_name_en: string; egcs_cn_name_fr: string }
type GroupRow = { id: string; group: Group; member: Member | null; placeholder: boolean; name: string; email: string }
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { canAny, can } = useCan()
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const deleteContext = useActionContext({
  identity: [],
  authority: () => canAny('group', 'delete', ['global', 'agency'])
})
const canCreate = computed(() => canAny('group', 'create', ['global', 'agency']))
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions -- Generic arrow syntax conflicts with Vue SFC parsing.
async function loadJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getClientRequestUrl(path), init)
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as T
}
const agencyResponse: Ref<{ items: Agency[] } | null> = ref(null)
const selectedAgency: Ref<string> = ref('all')
const { search, pagination, items: groups, totalRecords, refresh: refreshGroups, status } = useResourceTable<Group>({
  fetchUrl: '/api/groups',
  query: computed(() => ({ agency: selectedAgency.value === 'all' ? undefined : selectedAgency.value }))
})
watch(selectedAgency, () => {
  pagination.value.pageIndex = 0
})
void loadJson<{ items: Agency[] }>('/api/groups/agencies').then(value => {
  if (disposed) return
  agencyResponse.value = value
}).catch(error => { if (!disposed) showError(error) })
const selectedGroup: Ref<Group | null> = ref(null)
const expandedGroupIds: Ref<string[]> = ref([])
const membersByGroup: Ref<Record<string, Member[]>> = ref({})
const memberReads: Ref<Record<string, MemberRead>> = ref({})
const memberSession = useModalSession()
const memberModalOpen = memberSession.isOpen
const memberPending = useCrudModalPending(memberSession.captureSession)
const addingMember = memberPending.isPending
const removingMemberIds = ref<string[]>([])
const memberForm = reactive({ egcs_cn_user: '' })
const validateMember = createValidator(GroupMemberSchema)
const users = useResourceRequest<{ items: UserOption[] }>({
  identity: () => selectedGroup.value?.id ?? '',
  enabled: () => memberModalOpen.value && selectedGroup.value !== null
    && can('group', 'update', { type: 'agency', agencyId: selectedGroup.value.egcs_cn_agency }),
  trigger: 'refresh',
  refreshData: 'clear',
  failureData: 'clear',
  load: signal => loadJson(`/api/groups/${selectedGroup.value?.id}/members/lookups`, { signal })
})
const userResponse = users.data
const availableUsers = computed(() => (userResponse.value?.items ?? [])
  .filter(user => !(membersByGroup.value[selectedGroup.value?.id ?? ''] ?? []).some(member => member.egcs_cn_user === user.id))
  .map(user => ({ label: getBilingualValue(user, 'egcs_cn_name', user.id), value: user.id })))
const refreshMembers = async (groupId: string, token = Symbol(groupId)) => {
  if (disposed) return null
  memberReads.value = { ...memberReads.value, [groupId]: { kind: 'pending', token } }
  const isCurrent = () => !disposed && memberReads.value[groupId]?.token === token
  try {
    const response = await loadJson<{ items: Member[] }>(`/api/groups/${groupId}/members`)
    if (!isCurrent()) return null
    membersByGroup.value = { ...membersByGroup.value, [groupId]: response.items }
    memberReads.value = { ...memberReads.value, [groupId]: { kind: 'success', token } }
    return token
  } catch (error) {
    if (!isCurrent()) return null
    memberReads.value = { ...memberReads.value, [groupId]: { kind: 'error', token } }
    throw error
  }
}
const loadGroupMembers = async (group: Group) => {
  const token = Symbol(group.id)
  if (selectedGroup.value?.id === group.id) users.reset()
  try {
    const accepted = await refreshMembers(group.id, token)
    if (accepted !== null && !disposed && memberReads.value[group.id]?.token === token && selectedGroup.value?.id === group.id) await users.refresh()
  } catch (error) {
    if (!disposed && memberReads.value[group.id]?.token === token && selectedGroup.value?.id === group.id) showError(error)
  }
}
const toggleGroup = (group: Group) => {
  if (expandedGroupIds.value.includes(group.id)) {
    expandedGroupIds.value = expandedGroupIds.value.filter(id => id !== group.id)
    return
  }
  expandedGroupIds.value = [...expandedGroupIds.value, group.id]
  selectedGroup.value = group
  void loadGroupMembers(group)
}
const openMemberPicker = (group: Group) => {
  if (disposed || !can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })) return
  memberModalOpen.value = false
  selectedGroup.value = group
  void loadGroupMembers(group)
  memberForm.egcs_cn_user = ''
  memberModalOpen.value = true
  if (!expandedGroupIds.value.includes(group.id)) expandedGroupIds.value = [...expandedGroupIds.value, group.id]
}
const rows = computed<GroupRow[]>(() => groups.value.flatMap(group => [
  { id: `group:${group.id}`, group, member: null, placeholder: false, name: getBilingualValue(group, 'egcs_cn_name', group.id), email: group.egcs_cn_email },
  ...(expandedGroupIds.value.includes(group.id)
    ? [
        ...(membersByGroup.value[group.id] ?? []).map(member => ({ id: `member:${group.id}:${member.egcs_cn_user}`, group, member, placeholder: false, name: member.egcs_cn_name, email: '' })),
        ...(!membersByGroup.value[group.id]?.length || memberReads.value[group.id]?.kind === 'error'
          ? [{ id: `empty:${group.id}`, group, member: null, placeholder: true, name: t(memberReads.value[group.id]?.kind === 'error' ? 'common.load_failed' : memberReads.value[group.id]?.kind === 'success' ? 'common.no_data' : 'common.loading'), email: '' }]
          : [])
      ]
    : [])
]))
const columns: TableColumnInput<GroupRow>[] = [
  { id: 'name', accessorKey: 'name', headerKey: 'common.name' },
  { id: 'email', accessorKey: 'email', headerKey: 'groups.email' },
  { id: 'actions', headerKey: 'common.actions' }
]
const { getGroupedDisclosureControlsId } = useGroupedDisclosureIds()
const retryGroupMembers = async (group: Group, event: MouseEvent) => {
  const restoreFocus = event.currentTarget === document.activeElement
  await loadGroupMembers(group)
  await nextTick()
  if (disposed || !restoreFocus || document.activeElement !== document.body) return
  const control = document.querySelector(`[aria-controls="${getGroupedDisclosureControlsId(`group:${group.id}`)}"]`)
  if (control instanceof HTMLElement) control.focus()
}
const isHeroCollapsed = useDashboard().getHeroCollapsed('groups')
const heroStats = computed(() => [{ label: t('admin_common.total'), value: totalRecords.value }])
const agencyOptions = computed(() => [
  { label: t('groups.all_agencies'), value: 'all' },
  ...(agencyResponse.value?.items ?? []).map(agency => ({ label: getBilingualValue(agency, 'egcs_ay_name', agency.id), value: agency.id }))
])
const editSession = useModalSession()
let groupOpeningGeneration = 0
const modalOpen = editSession.isOpen
const editing: Ref<Group | null> = ref(null)
const editPending = useCrudModalPending(editSession.captureSession)
const saving = editPending.isPending
const form = reactive({ egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
const validate = createValidator(GroupCreateSchema)
/**
 *
 */
const openCreate = () => {
  if (disposed || !canCreate.value) return
  groupOpeningGeneration += 1
  modalOpen.value = false
  editing.value = null
  Object.assign(form, { egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
  modalOpen.value = true
}
/**
 *
 */
const openEdit = (group: Group) => {
  if (disposed || !can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })) return
  groupOpeningGeneration += 1
  modalOpen.value = false
  editing.value = group
  Object.assign(form, { egcs_cn_agency: group.egcs_cn_agency, egcs_cn_name_en: group.egcs_cn_name_en, egcs_cn_name_fr: group.egcs_cn_name_fr, egcs_cn_email: group.egcs_cn_email })
  modalOpen.value = true
}
/**
 *
 */
const save = async () => {
  const session = editSession.captureSession()
  const requestedGroup = editing.value
  const operation = editContext.capture()
  if (!operation?.canDispatch()) return
  const openingGeneration = groupOpeningGeneration
  if (disposed || session === null || (requestedGroup
    ? !can('group', 'update', { type: 'agency', agencyId: requestedGroup.egcs_cn_agency })
    : !canCreate.value) || !editPending.begin(session)) return
  let committed = false
  try {
    const body = requestedGroup
      ? { egcs_cn_name_en: form.egcs_cn_name_en, egcs_cn_name_fr: form.egcs_cn_name_fr, egcs_cn_email: form.egcs_cn_email }
      : { ...form }
    await loadJson(requestedGroup ? `/api/groups/${requestedGroup.id}` : '/api/groups', { method: requestedGroup ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!operation.isCurrent() || !editSession.isCurrentSession(session)) return
    committed = true
    modalOpen.value = false
    await refreshGroups()
  } catch (error) {
    if (!disposed && operation.isCurrent() && openingGeneration === groupOpeningGeneration
      && (editSession.isCurrentSession(session) || (committed && editSession.captureSession() === null))) showError(error)
  } finally {
    editPending.end(session)
  }
}
const editContext = useActionContext({
  identity: [() => editing.value?.id, () => editing.value?.egcs_cn_agency ?? form.egcs_cn_agency],
  authority: () => editing.value
    ? can('group', 'update', { type: 'agency', agencyId: editing.value.egcs_cn_agency })
    : canCreate.value,
  eligible: () => {
    const target = editing.value
    return !target || groups.value.some(row => row.id === target.id && row.egcs_cn_agency === target.egcs_cn_agency)
  }
})
const groupForm = useFormSession({ owner: editSession, action: { kind: 'remote', context: editContext }, submit: save })
/**
 *
 */
const remove = async (group: Group) => {
  const operation = deleteContext.capture()
  const groupId = group.id
  const agencyId = group.egcs_cn_agency
  if (!operation?.canDispatch()) return
  try {
    const deleted = await confirmDeleteRequest(`/api/groups/${groupId}`, {
      description: t('groups.delete_confirm'),
      operation,
      target: {
        id: groupId,
        resolve: () => groups.value.find(row => row.id === groupId),
        eligible: current => current.egcs_cn_agency === agencyId
          && can('group', 'delete', { type: 'agency', agencyId })
      },
      shouldProceed: () => {
        const current = groups.value.find(row => row.id === groupId && row.egcs_cn_agency === agencyId)
        return !disposed && Boolean(current && can('group', 'delete', { type: 'agency', agencyId }))
      }
    })
    if (!deleted || !operation.isCurrent()) return
    if (selectedGroup.value?.id === groupId) selectedGroup.value = null
    expandedGroupIds.value = expandedGroupIds.value.filter(id => id !== groupId)
    await refreshGroups()
  } catch (error) { if (!disposed && operation.isCurrent()) showError(error) }
}
/**
 *
 */
const addMember = async () => {
  const session = memberSession.captureSession()
  const requestedGroup = selectedGroup.value
  const operation = memberContext.capture()
  if (!operation?.canDispatch()) return
  if (disposed || session === null || !requestedGroup || !memberForm.egcs_cn_user
    || !can('group', 'update', { type: 'agency', agencyId: requestedGroup.egcs_cn_agency })
    || !memberPending.begin(session)) return
  const groupId = requestedGroup.id
  try {
    await loadJson(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(memberForm) })
    if (!operation.isCurrent() || !memberSession.isCurrentSession(session)) return
    await refreshMembers(groupId)
    if (operation.isCurrent() && memberSession.isCurrentSession(session) && selectedGroup.value?.id === groupId) {
      memberForm.egcs_cn_user = ''
      memberModalOpen.value = false
    }
  } catch (error) {
    if (operation.isCurrent() && memberSession.isCurrentSession(session)) showError(error)
  } finally {
    memberPending.end(session)
  }
}
const memberContext = useActionContext({
  identity: [() => selectedGroup.value?.id, () => selectedGroup.value?.egcs_cn_agency],
  authority: () => Boolean(selectedGroup.value && can('group', 'update', {
    type: 'agency', agencyId: selectedGroup.value.egcs_cn_agency
  })),
  eligible: () => {
    const target = selectedGroup.value
    return Boolean(target && groups.value.some(row => row.id === target.id && row.egcs_cn_agency === target.egcs_cn_agency))
  }
})
const memberFormBinding = useFormSession({ owner: memberSession, action: { kind: 'remote', context: memberContext }, submit: addMember })
/**
 *
 */
const removeMember = async (group: Group, member: Member) => {
  const rowId = `member:${group.id}:${member.egcs_cn_user}`
  if (disposed || removingMemberIds.value.includes(rowId) || !can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })) return
  removingMemberIds.value = [...removingMemberIds.value, rowId]
  try {
    await loadJson(`/api/groups/${group.id}/members/${member.egcs_cn_user}`, { method: 'DELETE' })
    if (disposed) return
    await refreshMembers(group.id)
  } catch (error) {
    if (!disposed) showError(error)
  } finally {
    if (!disposed) removingMemberIds.value = removingMemberIds.value.filter(id => id !== rowId)
  }
}
</script>

<template>
  <CommonDetailPage id="groups" v-model:collapsed="isHeroCollapsed" data-field-scope="groups" :title="t('groups.title')">
    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-users" :title="t('groups.title')" :description="t('groups.description')" :stats="heroStats" />
        <CommonResourceLayout v-model:search="search" v-model:pagination="pagination" layout="page" :data="rows" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="canCreate" :button-label="t('common.add')" :get-row-id="(row: GroupRow) => row.id" @add="openCreate" @retry="refreshGroups">
          <template #filters>
            <USelect v-model="selectedAgency" data-ui-target="groups.selected-agency" :items="agencyOptions" :aria-label="t('groups.agency_filter')" class="min-w-48" />
          </template>
          <template #name-cell="{ row }">
            <div v-if="row.original.member || row.original.placeholder" :id="(row.original.placeholder && !membersByGroup[row.original.group.id]?.length) || membersByGroup[row.original.group.id]?.[0]?.egcs_cn_user === row.original.member?.egcs_cn_user ? getGroupedDisclosureControlsId(`group:${row.original.group.id}`) : undefined" class="flex items-center gap-2 pl-8">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-muted" />
              <span :role="row.original.placeholder ? memberReads[row.original.group.id]?.kind === 'error' ? 'alert' : 'status' : undefined">{{ row.original.name }}</span>
              <UButton v-if="row.original.placeholder && memberReads[row.original.group.id]?.kind === 'error'" color="neutral" variant="link" :aria-label="`${t('common.retry')}: ${getBilingualValue(row.original.group, 'egcs_cn_name', row.original.group.id)}`" @click="retryGroupMembers(row.original.group, $event)">
                {{ t('common.retry') }}
              </UButton>
            </div>
            <CommonGroupedDisclosureButton v-else class="flex items-center gap-2 text-left" :expanded="expandedGroupIds.includes(row.original.group.id)" :controls="getGroupedDisclosureControlsId(row.original.id)" :label-en="row.original.group.egcs_cn_name_en" :label-fr="row.original.group.egcs_cn_name_fr" @toggle="toggleGroup(row.original.group)">
              <UIcon :name="expandedGroupIds.includes(row.original.group.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
              <CommonBilingualName :name-en="row.original.group.egcs_cn_name_en" :name-fr="row.original.group.egcs_cn_name_fr" />
              <CommonStatusBadge v-if="membersByGroup[row.original.group.id]" variant="count" size="sm" :label="String(membersByGroup[row.original.group.id]?.length ?? 0)" />
            </CommonGroupedDisclosureButton>
          </template>
          <template #email-cell="{ row }">
            <span v-if="!row.original.member && !row.original.placeholder">{{ row.original.email }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-2">
              <template v-if="!row.original.member && !row.original.placeholder">
                <CommonActionButton v-if="can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-user-plus" color="neutral" variant="ghost" :aria-label="`${t('groups.add_member')}: ${row.original.name}`" @click="openMemberPicker(row.original.group)" />
                <CommonActionButton v-if="can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="t('common.edit_named', { name: row.original.name })" @click="openEdit(row.original.group)" />
                <CommonActionButton v-if="can('group', 'delete', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete_named', { name: row.original.name })" @click="remove(row.original.group)" />
              </template>
              <CommonActionButton v-else-if="row.original.member && can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete_named', { name: row.original.name })" :loading="removingMemberIds.includes(row.original.id)" :disabled="removingMemberIds.includes(row.original.id)" @click="removeMember(row.original.group, row.original.member)" />
            </div>
          </template>
        </CommonResourceLayout>
      </div>
      <UModal v-model:open="memberModalOpen" :dismissible="!addingMember" :close="!addingMember" :title="t('groups.add_member')">
        <template #body>
          <UForm v-bind="memberFormBinding" :state="memberForm" :validate="validateMember" class="space-y-4">
            <UAlert v-if="users.status.value === 'error'" color="error" :title="t('common.lookup_load_failed')">
              <template #actions>
                <UButton color="neutral" variant="link" @click="users.refresh()">
                  {{ t('common.retry') }}
                </UButton>
              </template>
            </UAlert>
            <UFormField :label="t('groups.user')" name="egcs_cn_user" required>
              <USelectMenu
                v-model="memberForm.egcs_cn_user"
                :items="availableUsers"
                value-key="value"
                label-key="label"
                :placeholder="t('assignments.select_user')"
                :search-input="{ placeholder: t('assignments.search_users') }"
                virtualize
                required
                aria-required="true"
                class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <CommonSaveButton type="submit" :label="t('common.add')" :loading="addingMember" :disabled="addingMember || !memberForm.egcs_cn_user" />
            </div>
          </UForm>
        </template>
      </UModal>
      <UModal v-model:open="modalOpen" :dismissible="!saving" :close="!saving" :title="t('groups.title')">
        <template #body>
          <UForm v-bind="groupForm" :state="form" :validate="validate" class="space-y-4">
            <UFormField v-if="!editing" :label="t('nav.agencies')" name="egcs_cn_agency" required>
              <USelect v-model="form.egcs_cn_agency" :items="(agencyResponse?.items ?? []).map(agency => ({ label: getBilingualValue(agency, 'egcs_ay_name', agency.id), value: agency.id }))" required />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en" required>
              <UInput v-model="form.egcs_cn_name_en" required />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr" required>
              <UInput v-model="form.egcs_cn_name_fr" required />
            </UFormField>
            <UFormField :label="t('groups.email')" name="egcs_cn_email" required>
              <UInput v-model="form.egcs_cn_email" type="email" required />
            </UFormField>
            <div class="flex justify-end">
              <CommonSaveButton type="submit" :label="t('common.save')" :loading="saving" />
            </div>
          </UForm>
        </template>
      </UModal>
    </template>
  </CommonDetailPage>
</template>
