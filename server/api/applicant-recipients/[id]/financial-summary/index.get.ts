import { listProponentAccountBalances } from '~~/server/utils/account-receivable-proponent'

// eslint-disable-next-line local/require-authorize -- The helper checks Proponent access and complete Agency financial read scopes in a fresh snapshot.
export default defineEventHandler(async event => await listProponentAccountBalances(event, getRouterParam(event, 'id') ?? ''))
