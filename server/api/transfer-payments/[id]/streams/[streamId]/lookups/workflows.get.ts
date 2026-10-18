import { streamDefinitionLookup } from '~~/server/utils/stream-definition-lookups'

// eslint-disable-next-line local/require-authorize -- Stream picker requires Program update authority in the shared handler.
export default defineEventHandler(async event => await streamDefinitionLookup(event, 'workflows'))
