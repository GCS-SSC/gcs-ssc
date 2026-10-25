import { defineEventHandler, getRouterParam } from 'h3'
import { listFieldTooltips } from '~~/server/utils/field-tooltip'

// eslint-disable-next-line local/require-authorize -- operation authorizes the resolved agency
export default defineEventHandler(event => listFieldTooltips(event, getRouterParam(event, 'agencyId') ?? ''))
