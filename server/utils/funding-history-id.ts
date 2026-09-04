import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const isValidFundingHistoryId = (id: string | undefined): id is string =>
  id !== undefined && isPositivePostgresBigintText(id)
