import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'

/**
 * Share eligible screen guides between the contextual runtime and explicit hero action.
 * @returns Reactive discovery and launch state for the current application.
 */
export const useGuidedHelpDiscovery = () => ({
  items: useState<{ id: string, document: GuideDocument }[]>('guided-help.discovery.items', () => []),
  loading: useState<boolean>('guided-help.discovery.loading', () => false),
  active: useState<boolean>('guided-help.discovery.active', () => false),
  requestedGuideId: useState<string | null>('guided-help.discovery.request', () => null)
})
