import { defineEventHandler } from 'h3'
import { listProponentRelationships } from '~~/server/utils/proponent-relationships'

// Authorization is enforced before accessing the current Proponent or its relationship.
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(listProponentRelationships)
