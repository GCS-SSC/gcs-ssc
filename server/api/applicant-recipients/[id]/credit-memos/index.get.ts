import { listProponentCreditMemos } from '~~/server/utils/account-receivable-proponent'

// eslint-disable-next-line local/require-authorize -- The helper authorizes the Proponent and all memo owners before counting or paginating.
export default defineEventHandler(async event => await listProponentCreditMemos(
  event, getRouterParam(event, 'id') ?? ''
))
