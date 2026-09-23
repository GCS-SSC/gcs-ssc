import { streamReviewSetRoute } from '~~/server/utils/stream-review-set-routes'
// eslint-disable-next-line local/require-authorize -- Shared route freshly authorizes the Stream scope.
export default defineEventHandler(async event => await streamReviewSetRoute(event, 'delete'))
