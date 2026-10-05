import { listProponentAccountReceivables } from '~~/server/utils/account-receivable-proponent'

// eslint-disable-next-line local/require-authorize -- The helper authorizes the Proponent and every receivable owner in a fresh snapshot.
export default defineEventHandler(async event => await listProponentAccountReceivables(
  event, getRouterParam(event, 'id') ?? ''
))
