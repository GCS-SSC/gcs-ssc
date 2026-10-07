import { listCreditMemoCharts } from '~~/server/utils/account-receivable-credit-memo-lookups'

// eslint-disable-next-line local/require-authorize -- The helper authorizes the explicit AR root before reading its Stream selections.
export default defineEventHandler(listCreditMemoCharts)
