<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { StreamSubmissionPolicySettings } from '~/composables/useStreamCustomFieldSettings'
import type { FormSubmitEvent } from '@nuxt/ui'
import { AGREEMENT_SUBMISSION_MODES, AGREEMENT_SUBMISSION_TARGETS } from '~~/shared/types/agreement-submission'
import { StreamSubmissionPolicySchema } from '~~/shared/types/schemas/stream-submission-policy'
import type { StreamSubmissionPolicy } from '~~/shared/types/schemas/stream-submission-policy'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { canUpdate, settings } = defineProps<{
  canUpdate: boolean
  settings: StreamSubmissionPolicySettings
}>()
const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const validate = createValidator(StreamSubmissionPolicySchema)

const resource = settings.request
const pending = computed(() => settings.writes.isPending(settings.endpoint))
const baseline = resource.data
const draft = ref<StreamSubmissionPolicy | null>(null)
watch(baseline, value => {
  draft.value = value ? { ...value } : null
}, { immediate: true, flush: 'sync' })

const formOwner = useModalSession()
watch(settings.identity, () => {
  formOwner.isOpen.value = false
  formOwner.isOpen.value = true
}, { immediate: true, flush: 'sync' })
const canEdit = computed(() => canUpdate && !pending.value && resource.status.value === 'success')
const actionContext = useActionContext({
  identity: [() => settings.identity.value],
  authority: () => canUpdate,
  eligible: () => canEdit.value && draft.value !== null
})
const choices = computed(() => AGREEMENT_SUBMISSION_MODES.map(value => ({
  value,
  label: t(`submission.policy.${value}`)
})))
const financialChoices = computed(() => AGREEMENT_SUBMISSION_MODES.map(value => ({
  value,
  label: t(`submission.policy.return_${value}`)
})))
const hasChanges = computed(() => AGREEMENT_SUBMISSION_TARGETS.some(target => draft.value?.[target] !== baseline.value?.[target]))

/**
 * Saves the changed target modes without overwriting other target settings.
 * @param event - Validated form submission from the active panel.
 */
const save = async (event: FormSubmitEvent<StreamSubmissionPolicy>) => {
  const { data } = event
  const operation = actionContext.capture()
  const committed = settings.captureCommitted()
  const session = formOwner.captureSession()
  if (!operation?.canDispatch() || !committed?.canDispatch() || session === null || !baseline.value) return
  const updates: Partial<StreamSubmissionPolicy> = {}
  for (const target of AGREEMENT_SUBMISSION_TARGETS) {
    if (data[target] !== baseline.value[target]) updates[target] = data[target]
  }
  if (Object.keys(updates).length === 0) return
  const { endpoint, writes } = settings
  const ownsFeedback = () => operation.isCurrent() && formOwner.isCurrentSession(session)
  const release = writes.acquire(endpoint)
  if (!release) return
  try {
    const response = await fetch(getClientRequestUrl(endpoint), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (ownsFeedback()) toast.add({ title: toast.localized('common.success'), description: toast.localized('submission.policy.saved'), color: 'success' })
    await committed.settle()
  } catch (error) {
    if (ownsFeedback()) showError(error)
  } finally {
    release()
  }
}
const form = useFormSession({ owner: formOwner, action: { kind: 'remote', context: actionContext }, submit: save })
</script>

<template>
  <div class="space-y-4" data-field-scope="transfer-payment.stream.submission-policy">
    <p class="text-sm text-muted">
      {{ t('submission.policy.description') }}
    </p>
    <CommonLoadingState v-if="resource.status.value === 'pending' || (pending && !draft)" :label="t('common.loading')" />
    <CommonErrorNotice v-else-if="resource.error.value" :title="t('common.configuration_load_failed')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="resource.refresh" />
      </template>
    </CommonErrorNotice>
    <UForm v-if="draft" v-bind="form" :state="draft" :validate="validate" class="space-y-6">
      <div class="grid gap-4 lg:grid-cols-3">
        <UFormField :label="t('submission.target.claim')" name="claim" required>
          <USelect v-model="draft.claim" :items="financialChoices" :disabled="!canEdit" required class="w-full" />
        </UFormField>
        <UFormField :label="t('submission.target.forecast')" name="forecast" required>
          <USelect v-model="draft.forecast" :items="financialChoices" :disabled="!canEdit" required class="w-full" />
        </UFormField>
        <UFormField :label="t('submission.target.amendment_budget')" name="amendment_budget" required>
          <USelect v-model="draft.amendment_budget" :items="choices" :disabled="!canEdit" required class="w-full" />
        </UFormField>
      </div>
      <div v-if="canUpdate" class="flex justify-end">
        <CommonSaveButton type="submit" :label="t('submission.policy.save')" :disabled="!hasChanges || !canEdit" :loading="pending" />
      </div>
    </UForm>
  </div>
</template>
