import { streamFieldAssignmentRoute } from '~~/server/utils/stream-field-assignment-routes'

// eslint-disable-next-line local/require-authorize -- The shared route freshly authorizes the Stream scope.
export default defineEventHandler(async event => await streamFieldAssignmentRoute(event, 'delete'))
