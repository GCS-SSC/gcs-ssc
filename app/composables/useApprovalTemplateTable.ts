/* eslint-disable jsdoc/require-jsdoc */
import type { ApprovalTemplateItem } from '~~/shared/types/schemas'
import type { MaybeRefOrGetter } from 'vue'

export const useApprovalTemplateTable = (
  options: {
    agencyId: MaybeRefOrGetter<string>
  }
) => useResourceTable<ApprovalTemplateItem>({
  fetchUrl: computed(() => `/api/agency/${toValue(options.agencyId)}/approval-templates`)
})
