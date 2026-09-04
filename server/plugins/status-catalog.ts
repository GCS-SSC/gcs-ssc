import { statusCatalogService } from '../utils/status-catalog'

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('request', event => {
    event.context.$statusCatalog = statusCatalogService
  })
})
