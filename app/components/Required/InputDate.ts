import OriginalControl from '@nuxt/ui/components/InputDate.vue'
import { createRequiredControl } from '~/utils/required-control'

export default createRequiredControl(OriginalControl, 'segmented')
