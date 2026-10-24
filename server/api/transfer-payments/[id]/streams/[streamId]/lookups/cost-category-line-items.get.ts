import { defineEventHandler } from 'h3'
import { streamReferenceDefinitionLookup } from '~~/server/utils/stream-reference-definition-lookups'

// eslint-disable-next-line local/require-authorize -- Shared picker handler requires live owning Program update authority.
export default defineEventHandler(async event => await streamReferenceDefinitionLookup(event, 'cost-category-line-items'))
