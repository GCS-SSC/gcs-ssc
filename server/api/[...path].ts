import { notFound } from '~~/server/utils/api-errors'

// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  return await notFound(event, 'RESOURCE_NOT_FOUND', 'apiErrors.request.not_found')
})
