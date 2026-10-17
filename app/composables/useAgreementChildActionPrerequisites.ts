import { toValue, type MaybeRefOrGetter } from 'vue'
import type { FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'

export type AgreementChildActionTarget =
  | { kind: 'agreement'; agreementId: string }
  | { kind: 'amendment'; agreementId: string; amendmentId: string }
export type AgreementChildAction = 'create' | 'update' | 'delete'
export type AgreementChildArea = 'activity' | 'budget-line' | 'budget-year'

type AmendmentPrerequisites = {
  egcs_fc_status: string
  can_edit?: boolean
  isCompleted?: boolean
  has_budget_snapshot?: boolean
  has_activity_snapshot?: boolean
  amendment_types: { egcs_tp_amended: string }[]
}

/**
 * Fresh domain prerequisites; transaction-only approval and financial locks remain server-owned.
 * @param target - Explicit assignable owner, omitted by legacy/static consumers.
 * @returns A fresh action prerequisite check guarded by the caller's current intent.
 */
export const useAgreementChildActionPrerequisites = (target: MaybeRefOrGetter<AgreementChildActionTarget | undefined>) => {
  const toast = useLocalizedToast()
  /**
   * Explains the currently unmet assignment or business prerequisite.
   * @param assigned - Whether the exact assignment is missing.
   * @returns The localized prerequisite notice.
   */
  const warn = (assigned = false) => toast.add({
    title: toast.localized('common.warning'),
    description: toast.localized(assigned ? 'assignments.read_only_description' : 'agreement.child_records.work_prerequisite'),
    color: 'warning'
  })
  /**
   * Checks fresh owner state without changing the caller's captured intent.
   * @param action - The requested mutation's role ceiling.
   * @param area - The owning Budget or Activity scope.
   * @param shouldProceed - Whether the caller still owns its captured intent.
   * @returns Whether current prerequisites permit the operation.
   */
  const check = async (action: AgreementChildAction, area: AgreementChildArea, shouldProceed: () => boolean): Promise<boolean> => {
    const owner = toValue(target)
    // Legacy and static consumers do not opt into live domain reads.
    if (!owner) return shouldProceed()
    const catalog = useStatusCatalog()
    try {
      if (owner.kind === 'agreement') {
        const [record, roster] = await Promise.all([
          $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner.agreementId}`),
          $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcaseagreement/${owner.agreementId}`)
        ])
        if (!catalog.getById(record.egcs_fc_status)) await catalog.load()
        if (!shouldProceed()) return false
        if (roster.is_assigned !== true) {
          warn(true)
          return false
        }
        const status = catalog.getById(record.egcs_fc_status)
        const role = action === 'create' ? record.can_create_child_records_role : action === 'update' ? record.can_update_child_records_role : record.can_delete_child_records_role
        const capability = action === 'create' ? record.can_create_child_records : action === 'update' ? record.can_update_child_records : record.can_delete_child_records
        if (role === true && capability === true && status && !status.deleted && !status.readOnly && !status.terminal && record.isCompleted !== true) return true
      } else {
        const [record, context, roster] = await Promise.all([
          $fetch<AmendmentPrerequisites, string>(`/api/agreements/${owner.agreementId}/amendments/${owner.amendmentId}`),
          $fetch<Record<string, unknown>, string>(`/api/entity-assignments/fundingcaseamendment/${owner.amendmentId}/context`),
          $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcaseamendment/${owner.amendmentId}`)
        ])
        if (!catalog.getById(record.egcs_fc_status)) await catalog.load()
        if (!shouldProceed()) return false
        if (roster.is_assigned !== true) {
          warn(true)
          return false
        }
        const status = catalog.getById(record.egcs_fc_status)
        const scopes = record.amendment_types.map(type => type.egcs_tp_amended)
        const inScope = area === 'activity' ? scopes.includes('activities') : scopes.includes('budget') || (area === 'budget-year' && scopes.includes('duration'))
        const snapshot = area === 'activity' ? record.has_activity_snapshot : record.has_budget_snapshot
        if (context[`can_${action}_agreement_role`] === true && record.can_edit === true && status?.isDraft === true && !status.deleted && !status.readOnly && !status.terminal && record.isCompleted !== true && inScope && snapshot === true) return true
      }
    } catch {
      if (!shouldProceed()) return false
    }
    if (shouldProceed()) warn()
    return false
  }
  return { check }
}
