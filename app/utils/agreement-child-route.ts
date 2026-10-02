/**
 * Recognizes independent Agreement workspaces before loading the parent profile.
 *
 * @param route - Current localized Nuxt route identity.
 * @param route.name - Localized Nuxt route name.
 * @param route.params - Independent child identities.
 * @returns Whether the parent should render its child outlet only.
 */
export const isAgreementChildRoute = (route: {
  name?: string | symbol | null
  params: Record<string, unknown>
}): boolean => {
  const independentIds = ['commitmentId', 'paymentId', 'forecastId', 'monitorId', 'claimId', 'amendmentId', 'closeoutId', 'correctionId']
  if (independentIds.some(key => typeof route.params[key] === 'string')) return true
  return typeof route.name === 'string' && /^agreements-id-corrections(?:-index)?(?:___[a-z]+)?$/.test(route.name)
}
