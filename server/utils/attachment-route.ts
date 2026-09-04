/* eslint-disable jsdoc/require-jsdoc -- Route target parsing is self-descriptive. */
import { getRouterParam, type H3Event } from 'h3'
import { AttachmentTargetSchema, type AttachmentTarget } from '~~/shared/types/schemas'
import { parseI18n } from './api-validate'
import { requireAuthContext } from './authorize'

export const getAttachmentRouteTarget = async (event: H3Event): Promise<AttachmentTarget> => {
  await requireAuthContext(event)
  return await parseI18n(event, AttachmentTargetSchema, {
    entityType: getRouterParam(event, 'entityType'),
    entityId: getRouterParam(event, 'entityId')
  })
}
