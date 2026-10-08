import { getAgencyDataCollection } from '~~/server/utils/data-collection-agency-routes'

// eslint-disable-next-line local/require-authorize -- Agency authorization is enforced by the domain adapter.
export default defineEventHandler(getAgencyDataCollection)
