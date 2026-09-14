import OriginalControl from '@nuxt/ui/components/CheckboxGroup.vue'
import { createRequiredControl } from '~/utils/required-control'

export default createRequiredControl(OriginalControl, 'group')
