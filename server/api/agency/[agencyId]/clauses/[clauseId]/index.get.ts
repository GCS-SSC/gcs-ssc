import { defineEventHandler } from 'h3'
import { agencyClauseRoute } from '~~/server/utils/agency-clause-routes'

// eslint-disable-next-line local/require-authorize -- Shared route authorizes the Agency.
export default defineEventHandler(async event => await agencyClauseRoute(event, 'read'))
