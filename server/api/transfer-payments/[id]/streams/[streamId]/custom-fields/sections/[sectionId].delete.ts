import { streamCustomFieldRoute } from '~~/server/utils/stream-custom-field-routes'

// eslint-disable-next-line local/require-authorize -- Adapter authorizes and freshly reauthorizes the stream configuration scope.
export default defineEventHandler(async event => await streamCustomFieldRoute(event, 'delete', 'section'))
