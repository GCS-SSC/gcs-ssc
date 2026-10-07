import { listCreditMemoReceivables } from '~~/server/utils/account-receivable-credit-memo-lookups'

// eslint-disable-next-line local/require-authorize -- The helper authorizes Agency financial creation and filters independently readable ARs.
export default defineEventHandler(listCreditMemoReceivables)
