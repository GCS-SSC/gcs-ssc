import type { GuideActionChannel } from '@gcs-ssc/guided-help/runtime'

/** Returns this app's transient, single-reader action channel.
 * @returns The channel created by this Nuxt application.
 */
export const useGuidedHelpActions = (): GuideActionChannel => useNuxtApp().$guidedHelpActions
