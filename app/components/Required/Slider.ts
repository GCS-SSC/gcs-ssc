import OriginalControl from '@nuxt/ui/components/Slider.vue'
import { createRequiredControl } from '~/utils/required-control'

export default createRequiredControl(OriginalControl, 'range')
