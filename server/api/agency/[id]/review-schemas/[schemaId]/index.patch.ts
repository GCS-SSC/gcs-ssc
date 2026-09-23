import { agencyReviewSchemaRoute } from '~~/server/utils/agency-review-schema-routes'

// eslint-disable-next-line local/require-authorize -- Shared route authorizes Agency ownership.
export default defineEventHandler(async event => await agencyReviewSchemaRoute(event, 'update'))
