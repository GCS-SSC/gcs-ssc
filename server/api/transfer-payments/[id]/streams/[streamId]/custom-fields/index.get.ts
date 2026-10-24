import { defineEventHandler } from 'h3'
import { streamFieldAssignmentRoute } from '~~/server/utils/stream-field-assignment-routes'

// eslint-disable-next-line local/require-authorize -- The shared route authorizes the Stream scope.
export default defineEventHandler(async event => await streamFieldAssignmentRoute(event, 'read'))
