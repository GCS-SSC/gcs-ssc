import { defineEventHandler, getRouterParam } from 'h3'
import { deleteGuidedHelp } from '~~/server/utils/guided-help'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes its resolved owner or business screen
export default defineEventHandler(async event => {
  return deleteGuidedHelp(event, getRouterParam(event, 'id') ?? '')
})
