import { createResolver, defineNuxtModule } from '@nuxt/kit'

/** Applies the same required-field contract to host and SDK-provided Nuxt UI controls. */
export default defineNuxtModule({
  meta: { name: 'gcs-form-requirements' },
  /** Registers host component substitutions after Nuxt scans component directories.
   * @param _options Module options.
   * @param nuxt Current Nuxt instance.
   */
  setup: (_options, nuxt) => {
    const resolver = createResolver(import.meta.url)
    const names = new Set(['Form', 'FormField', 'Input', 'InputNumber', 'InputDate', 'InputTime', 'InputMenu', 'InputTags', 'Textarea', 'Select', 'SelectMenu', 'RadioGroup', 'Checkbox', 'CheckboxGroup', 'Switch', 'FileUpload', 'Slider'])
    nuxt.hook('components:extend', components => {
      for (const component of components) {
        const name = component.pascalName.slice(1)
        if (component.pascalName.startsWith('U') && names.has(name)) {
          component.filePath = resolver.resolve(`../app/components/Required/${name}.ts`)
          component.declarationPath = component.filePath
        }
      }
    })
  }
})
