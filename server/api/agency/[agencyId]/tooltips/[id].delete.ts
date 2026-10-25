import { defineEventHandler, getRouterParam } from 'h3'
import { deleteFieldTooltip } from '~~/server/utils/field-tooltip'

// eslint-disable-next-line local/require-authorize -- operation independently authorizes and freshly locks its agency
export default defineEventHandler(event => deleteFieldTooltip(event, getRouterParam(event, 'agencyId') ?? '', getRouterParam(event, 'id') ?? ''))
