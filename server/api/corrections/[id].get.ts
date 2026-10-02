import { authorizeCorrection, getCorrectionDetail } from '~~/server/utils/correction'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeCorrection(event, id)
  return await getCorrectionDetail(event, id)
})
