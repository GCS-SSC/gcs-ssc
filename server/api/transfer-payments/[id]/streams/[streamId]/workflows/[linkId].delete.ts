import { streamWorkflowRoute } from '~~/server/utils/stream-workflow-routes'

// eslint-disable-next-line local/require-authorize -- Shared route authorizes the Stream scope.
export default defineEventHandler(async event => await streamWorkflowRoute(event, 'delete'))
