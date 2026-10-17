<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Local declarative branch editor. */
import { computed, ref, watch } from 'vue'
import type { GuideDraft } from '@gcs-ssc/guided-help/contracts'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'

const document = defineModel<GuideDraft>({ required: true })
const open = defineModel<boolean>('open', { default: false })
const { stepId, disabled = false } = defineProps<{ stepId: string, disabled?: boolean }>()
const { t, locale } = useI18n()
const label = (item: { en: string, fr: string }) => item[locale.value === 'fr' ? 'fr' : 'en']
const source = computed(() => document.value.steps.find(step => step.id === stepId))
const fields = computed(() => (guidedHelpLedger.views.find(view => view.key === source.value?.view)?.targets ?? []).filter(target => target.kind === 'checkbox' || (target.kind === 'select' && target.choices?.length)))
const target = ref('')
const field = computed(() => fields.value.find(field => field.key === target.value))
const value = ref('')
const destination = ref('__end')
const error = ref('')
const editing = ref<number | null>(null)
const branches = ref<NonNullable<GuideDraft['steps'][number]['flow']>['branches']>([])
const fallback = ref('__end')
const choices = computed(() => field.value?.kind === 'checkbox' ? [{ value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }] : (field.value?.choices ?? []).map(choice => ({ value: choice.value, label: label(choice.label) })))
const destinations = computed(() => [{ value: '__end', label: t('guided_help.end_guide') }, ...document.value.steps.slice(document.value.steps.findIndex(step => step.id === stepId) + 1).map(step => ({ value: step.id, label: label(step.title) || t('guided_help.untitled_step') }))])
watch(target, () => {
  value.value = choices.value[0]?.value ?? ''
})
watch(open, opened => {
  if (!opened) return
  branches.value = JSON.parse(JSON.stringify(source.value?.flow?.branches ?? []))
  fallback.value = source.value?.flow ? source.value.flow.next ?? '__end' : destinations.value[1]?.value ?? '__end'
  editing.value = null
  target.value = fields.value[0]?.key ?? ''
  value.value = choices.value[0]?.value ?? ''
  destination.value = destinations.value[1]?.value ?? '__end'
  error.value = ''
})
const edit = (index: number) => {
  const branch = branches.value[index]
  if (!branch) return
  editing.value = index
  target.value = branch.target
  queueMicrotask(() => {
    value.value = String(branch.equals)
  })
  destination.value = branch.next ?? '__end'
}
const add = () => {
  if (disabled || !field.value || !choices.value.some(choice => choice.value === value.value)) return
  const equals = field.value.kind === 'checkbox' ? value.value === 'true' : value.value
  if (branches.value.some((branch, index) => index !== editing.value && branch.target === target.value && branch.equals === equals)) {
    error.value = t('guided_help.duplicate_branch')
    return
  }
  const branch = { target: target.value, equals, next: destination.value === '__end' ? null : destination.value }
  if (editing.value === null) branches.value.push(branch)
  else branches.value[editing.value] = branch
  editing.value = null
  error.value = ''
}
const save = () => {
  if (!disabled && source.value) source.value.flow = { next: fallback.value === '__end' ? null : fallback.value, branches: JSON.parse(JSON.stringify(branches.value)) }
  open.value = false
}
const branchLabel = (branch: { target: string, equals: string | boolean }) => {
  const item = fields.value.find(field => field.key === branch.target)
  return (item ? label(item.label) : branch.target) + ' = ' + (typeof branch.equals === 'boolean' ? t(branch.equals ? 'common.yes' : 'common.no') : label(item?.choices?.find(choice => choice.value === branch.equals)?.label ?? { en: String(branch.equals), fr: String(branch.equals) }))
}
</script>

<template>
  <UModal v-model:open="open" :title="t('guided_help.manage_branches')" :description="t('guided_help.branch_hint')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-6">
        <section v-if="branches.length" class="space-y-3">
          <h3 class="font-semibold">
            {{ t('guided_help.existing_branches') }}
          </h3>
          <div v-for="(branch, index) in branches" :key="index" class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span>{{ branchLabel(branch) }} {{ t('guided_help.routes_to') }} {{ destinations.find(item => item.value === (branch.next ?? '__end'))?.label }}</span>
            <div v-if="!disabled" class="flex gap-1">
              <CommonActionButton icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="t('common.edit')" @click="edit(index)" />
              <CommonActionButton icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('guided_help.remove_branch')" @click="branches.splice(index, 1)" />
            </div>
          </div>
        </section>
        <div v-if="fields.length && !disabled" class="space-y-5">
          <h3 class="font-semibold">
            {{ t(editing === null ? 'guided_help.add_branch' : 'guided_help.edit_branch') }}
          </h3>
          <UFormField :label="t('guided_help.branch_field')" required>
            <USelect v-model="target" :items="fields.map(item => ({ value: item.key, label: label(item.label) }))" class="w-full" />
          </UFormField>
          <UFormField :label="t('guided_help.branch_value')" required>
            <USelect v-model="value" :items="choices" class="w-full" />
          </UFormField>
          <UFormField :label="t('guided_help.branch_destination')" required>
            <USelect v-model="destination" :items="destinations" class="w-full" />
          </UFormField>
          <UButton :label="t(editing === null ? 'guided_help.add_branch' : 'common.update')" icon="i-lucide-git-branch" color="neutral" variant="outline" @click="add" />
        </div>
        <p v-else-if="!fields.length" class="text-muted">
          {{ t('guided_help.no_branch_fields') }}
        </p>
        <UFormField :label="t('guided_help.fallback_step')" :required="false" :description="t('guided_help.fallback_hint')">
          <USelect v-model="fallback" :items="destinations" :disabled="disabled" class="w-full" />
        </UFormField>
        <p v-if="error" role="alert" class="text-error">
          {{ error }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton :label="t(disabled ? 'common.close' : 'common.cancel')" color="neutral" variant="ghost" @click="open = false" />
        <CommonSaveButton v-if="!disabled" :label="t('common.save')" @click="save" />
      </div>
    </template>
  </UModal>
</template>
