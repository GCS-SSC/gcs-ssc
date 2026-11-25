<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { AGREEMENT_SUBMISSION_MODES, AGREEMENT_SUBMISSION_TARGETS } from '~~/shared/types/agreement-submission'
import { StreamSubmissionPolicySchema } from '~~/shared/types/schemas/stream-submission-policy'
import type { StreamSubmissionPolicy } from '~~/shared/types/schemas/stream-submission-policy'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { programId, streamId, canUpdate, pendingRequests } = defineProps<{
  programId: string
  streamId: string
  canUpdate: boolean
  pendingRequests: Map<string, symbol>
}>()
const { t } = useI18n()
const { user, permissionRevision } = useAuth()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const validate = createValidator(StreamSubmissionPolicySchema)

const resourceKey = computed(() => `${programId}/${streamId}`)
const pending = computed(() => pendingRequests.has(resourceKey.value))
const endpoint = computed(() => `/api/transfer-payments/${programId}/streams/${streamId}/submission-policy`)
const identity = computed(() => JSON.stringify([resourceKey.value, user.value?.id, permissionRevision.value, canUpdate]))
const canRead = computed(() => !!user.value?.id)

// A remounted tab waits for the save owned by the Stream detail page before reading its baseline.
const waitingForPreviousWrite = shallowRef(pending.value)
const resource = useResourceRequest({
  identity,
  enabled: () => canRead.value && (!waitingForPreviousWrite.value || !pending.value),
  /**
   * Reads the policy for the current Stream settings panel.
   * @param signal - Cancellation for the initiating panel request.
   * @returns The stream's effective policy.
   */
  load: async signal => {
    const response = await fetch(getClientRequestUrl(endpoint.value), { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return StreamSubmissionPolicySchema.parse(await response.json())
  }
})

const baseline = shallowRef<StreamSubmissionPolicy | null>(null)
const draft = ref<StreamSubmissionPolicy | null>(null)
watch(resource.data, value => {
  baseline.value = value
  draft.value = value ? { ...value } : null
}, { immediate: true, flush: 'sync' })
let initiatingIdentity: string | null = null
watch(pending, isPending => {
  if (isPending) {
    initiatingIdentity = identity.value
    return
  }
  if (waitingForPreviousWrite.value) {
    waitingForPreviousWrite.value = false
    return
  }
  if (initiatingIdentity !== identity.value) void resource.refresh()
  initiatingIdentity = null
}, { flush: 'sync' })

const formOwner = useModalSession()
watch(identity, () => {
  formOwner.isOpen.value = false
  formOwner.isOpen.value = true
}, { immediate: true, flush: 'sync' })
const canDispatch = computed(() => !pending.value && draft.value !== null && baseline.value !== null)
const actionContext = useActionContext({
  identity: [() => resourceKey.value],
  authority: () => canUpdate,
  eligible: canDispatch
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
  if (!operation?.canDispatch() || !baseline.value || !hasChanges.value) return
  const updates: Partial<StreamSubmissionPolicy> = {}
  for (const target of AGREEMENT_SUBMISSION_TARGETS) {
    if (data[target] !== baseline.value[target]) updates[target] = data[target]
  }
  const requestedResource = resourceKey.value
  const url = getClientRequestUrl(endpoint.value)
  const request = Symbol('submission-policy')
  pendingRequests.set(requestedResource, request)
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    if (!response.ok) await throwFetchResponseError(response)
    const saved = StreamSubmissionPolicySchema.parse(await response.json())
    if (!operation.isCurrent()) return
    baseline.value = saved
    draft.value = { ...saved }
    toast.add({ title: toast.localized('common.success'), description: toast.localized('submission.policy.saved'), color: 'success' })
  } catch (error) {
    if (operation.isCurrent()) showError(error)
  } finally {
    if (pendingRequests.get(requestedResource) === request) pendingRequests.delete(requestedResource)
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
          <USelect v-model="draft.claim" :items="financialChoices" :disabled="!canUpdate || pending" required class="w-full" />
        </UFormField>
        <UFormField :label="t('submission.target.forecast')" name="forecast" required>
          <USelect v-model="draft.forecast" :items="financialChoices" :disabled="!canUpdate || pending" required class="w-full" />
        </UFormField>
        <UFormField :label="t('submission.target.amendment_budget')" name="amendment_budget" required>
          <USelect v-model="draft.amendment_budget" :items="choices" :disabled="!canUpdate || pending" required class="w-full" />
        </UFormField>
      </div>
      <div v-if="canUpdate" class="flex justify-end">
        <CommonSaveButton type="submit" :label="t('submission.policy.save')" :disabled="!hasChanges || pending" :loading="pending" />
      </div>
    </UForm>
  </div>
</template>
