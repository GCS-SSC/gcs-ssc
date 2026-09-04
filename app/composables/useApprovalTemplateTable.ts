/* eslint-disable jsdoc/require-jsdoc */
import type { ApprovalTemplateItem, ApprovalTemplateScopeType } from '~~/shared/types/schemas'
import type { MaybeRefOrGetter } from 'vue'

export const useApprovalTemplateTable = (
  options: {
    scopeType: MaybeRefOrGetter<ApprovalTemplateScopeType>
    scopeId: MaybeRefOrGetter<string>
  }
) => useResourceTable<ApprovalTemplateItem>({
  fetchUrl: '/api/approval-templates',
  query: computed(() => ({
    scopeType: toValue(options.scopeType),
    scopeId: toValue(options.scopeId)
  }))
})
