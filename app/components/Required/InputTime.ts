import OriginalControl from '@nuxt/ui/components/InputTime.vue'
import { createRequiredControl } from '~/utils/required-control'

export default createRequiredControl(OriginalControl, 'segmented')
