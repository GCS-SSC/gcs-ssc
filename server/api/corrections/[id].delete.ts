import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeCorrection, deleteCorrection } from '~~/server/utils/correction'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeCorrection(event, id, 'delete')
  return await deleteCorrection(event, id)
})
