import { createGuideActionChannel } from '@gcs-ssc/guided-help/runtime'

export default defineNuxtPlugin(() => ({
  provide: { guidedHelpActions: createGuideActionChannel() }
}))
