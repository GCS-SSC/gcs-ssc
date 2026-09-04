import type { StatusDefinition, StatusId } from '~~/shared/types/status'

type BusinessRecordStatus = {
  egcs_fc_status: StatusId
  isCompleted?: boolean
}

/**
 * Resolves client-side business mutability from the Agency catalog and immutable completion evidence.
 * Unknown statuses remain locked until the authenticated catalog finishes loading.
 *
 * @returns Status-definition lookup and business-record lock helpers.
 */
export const useBusinessStatusState = () => {
  const catalog = useStatusCatalog()
  void catalog.load()

  const getDefinition = (statusId: StatusId | null | undefined): StatusDefinition | undefined =>
    catalog.getById(statusId)

  const isStatusLocked = (statusId: StatusId | null | undefined, isCompleted = false): boolean => {
    const definition = getDefinition(statusId)
    return isCompleted || !definition || definition.readOnly || definition.terminal
  }

  const isRecordLocked = (record: BusinessRecordStatus | null | undefined): boolean =>
    !record || isStatusLocked(record.egcs_fc_status, record.isCompleted === true)

  const isDraftStatus = (statusId: StatusId | null | undefined): boolean =>
    getDefinition(statusId)?.isDraft === true

  const isTerminalStatus = (statusId: StatusId | null | undefined): boolean =>
    getDefinition(statusId)?.terminal === true

  return { getDefinition, isStatusLocked, isRecordLocked, isDraftStatus, isTerminalStatus }
}
