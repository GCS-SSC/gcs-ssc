import { listProponentCreditMemoAgencyLookup } from '~~/server/utils/account-receivable-proponent'

// eslint-disable-next-line local/require-authorize -- The helper authorizes Agency financial creation and validates the supplied active Proponent identity.
export default defineEventHandler(listProponentCreditMemoAgencyLookup)
