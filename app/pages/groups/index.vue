<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Page-local request and form handlers are clear from their names. */
import type { Ref } from 'vue'
import { GroupCreateSchema } from '~~/shared/types/schemas/group'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ i18n: { paths: { en: '/groups', fr: '/groupes' } } })

type Group = { id: string; egcs_cn_agency: string; egcs_cn_name_en: string; egcs_cn_name_fr: string; egcs_cn_email: string }
type Agency = { id: string; egcs_ay_name_en: string; egcs_ay_name_fr: string }
type Member = { egcs_cn_user: string; egcs_cn_name: string }
type UserOption = { id: string; egcs_cn_name_en: string; egcs_cn_name_fr: string }
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { canAny, can } = useCan()
const canCreate = computed(() => canAny('group', 'create', ['global', 'agency']))
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions -- Generic arrow syntax conflicts with Vue SFC parsing.
async function loadJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getClientRequestUrl(path), init)
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as T
}
const groupResponse: Ref<{ items: Group[] } | null> = ref(null)
const agencyResponse: Ref<{ items: Agency[] } | null> = ref(null)
const refreshGroups = async () => {
  groupResponse.value = await loadJson('/api/groups?page=1&limit=100')
}
void refreshGroups().catch(showError)
void loadJson<{ items: Agency[] }>('/api/groups/agencies').then(value => {
  agencyResponse.value = value
}).catch(showError)
const selectedGroup: Ref<Group | null> = ref(null)
const memberResponse: Ref<{ items: Member[] } | null> = ref(null)
const userResponse: Ref<{ items: UserOption[] } | null> = ref(null)
const refreshMembers = async () => {
  if (selectedGroup.value) memberResponse.value = await loadJson(`/api/groups/${selectedGroup.value.id}/members`)
}
const refreshUsers = async () => {
  if (selectedGroup.value) userResponse.value = await loadJson(`/api/groups/${selectedGroup.value.id}/members/lookups`)
}
watch(selectedGroup, async group => {
  if (!group) return
  try {
    await refreshMembers()
    if (can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })) await refreshUsers()
  } catch (error) {
    showError(error)
  }
})
const modalOpen: Ref<boolean> = ref(false)
const editing: Ref<Group | null> = ref(null)
const saving: Ref<boolean> = ref(false)
const memberUserId: Ref<string> = ref('')
const form = reactive({ egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
const validate = createValidator(GroupCreateSchema)
/**
 *
 */
const openCreate = () => {
  editing.value = null
  Object.assign(form, { egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
  modalOpen.value = true
}
/**
 *
 */
const openEdit = (group: Group) => {
  editing.value = group
  Object.assign(form, group)
  modalOpen.value = true
}
/**
 *
 */
const save = async () => {
  try {
    saving.value = true
    const body = editing.value
      ? { egcs_cn_name_en: form.egcs_cn_name_en, egcs_cn_name_fr: form.egcs_cn_name_fr, egcs_cn_email: form.egcs_cn_email }
      : { ...form }
    await loadJson(editing.value ? `/api/groups/${editing.value.id}` : '/api/groups', { method: editing.value ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    modalOpen.value = false
    await refreshGroups()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}
/**
 *
 */
const remove = async (group: Group) => {
  try {
    const deleted = await confirmDeleteRequest(`/api/groups/${group.id}`, { description: t('groups.delete_confirm') })
    if (!deleted) return
    if (selectedGroup.value?.id === group.id) selectedGroup.value = null
    await refreshGroups()
  } catch (error) { showError(error) }
}
/**
 *
 */
const addMember = async () => {
  if (!selectedGroup.value || !memberUserId.value) return
  try {
    await loadJson(`/api/groups/${selectedGroup.value.id}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ egcs_cn_user: memberUserId.value }) })
    memberUserId.value = ''
    await refreshMembers()
  } catch (error) { showError(error) }
}
/**
 *
 */
const removeMember = async (member: Member) => {
  if (!selectedGroup.value) return
  try {
    await loadJson(`/api/groups/${selectedGroup.value.id}/members/${member.egcs_cn_user}`, { method: 'DELETE' })
    await refreshMembers()
  } catch (error) { showError(error) }
}
</script>

<template>
  <UDashboardPanel id="groups">
    <template #header>
      <UDashboardNavbar :title="t('groups.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6 p-8">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold">
            {{ t('groups.title') }}
          </h1>
          <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('common.add')" @click="openCreate" />
        </div>
        <div class="divide-y divide-default rounded-lg border border-default">
          <div v-for="group in groupResponse?.items ?? []" :key="group.id" class="flex flex-wrap items-center justify-between gap-3 p-4">
            <button class="text-left" @click="selectedGroup = group">
              <span class="block font-medium">{{ getBilingualValue(group, 'egcs_cn_name', group.id) }}</span>
              <span class="text-sm text-muted">{{ group.egcs_cn_email }}</span>
            </button>
            <div class="flex gap-2">
              <UButton v-if="can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="t('common.edit')" @click="openEdit(group)" />
              <UButton v-if="can('group', 'delete', { type: 'agency', agencyId: group.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete')" @click="remove(group)" />
            </div>
          </div>
        </div>
        <section v-if="selectedGroup" class="space-y-4" aria-labelledby="group-members-heading">
          <h2 id="group-members-heading" class="text-xl font-semibold">
            {{ t('groups.members') }} · {{ getBilingualValue(selectedGroup, 'egcs_cn_name', selectedGroup.id) }}
          </h2>
          <div v-if="can('group', 'update', { type: 'agency', agencyId: selectedGroup.egcs_cn_agency })" class="flex flex-wrap items-end gap-3">
            <UFormField :label="t('groups.user')" name="egcs_cn_user" class="min-w-64" required>
              <USelect v-model="memberUserId" :items="(userResponse?.items ?? []).map(user => ({ label: getBilingualValue(user, 'egcs_cn_name', user.id), value: user.id }))" required />
            </UFormField>
            <UButton :label="t('common.add')" :disabled="!memberUserId" @click="addMember" />
          </div>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="member in memberResponse?.items ?? []" :key="member.egcs_cn_user" class="flex items-center justify-between p-3">
              <span>{{ member.egcs_cn_name }}</span>
              <UButton v-if="can('group', 'update', { type: 'agency', agencyId: selectedGroup.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete')" @click="removeMember(member)" />
            </li>
          </ul>
        </section>
      </div>
      <UModal v-model:open="modalOpen" :title="t('groups.title')">
        <template #body>
          <UForm :state="form" :validate="validate" class="space-y-4" @submit="save">
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
  </UDashboardPanel>
</template>
