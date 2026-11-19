import { defineEventHandler } from 'h3'
import { agencyReviewClauseRuleRoute } from '~~/server/utils/agency-review-clause-rules'

// eslint-disable-next-line local/require-authorize -- The shared route authorizes the Agency.
export default defineEventHandler(async event => await agencyReviewClauseRuleRoute(event, 'lookups'))
