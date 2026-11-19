import { defineEventHandler } from 'h3'
import { streamClauseRoute } from '~~/server/utils/stream-clause-routes'

// eslint-disable-next-line local/require-authorize -- Shared route freshly authorizes the Stream scope.
export default defineEventHandler(async event => await streamClauseRoute(event, 'read'))
