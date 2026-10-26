import { defineNitroPlugin } from 'nitropack/runtime'
import { finishCatalogCacheResponse, prepareCatalogCacheRequest } from '../utils/catalog-cache'

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('request', prepareCatalogCacheRequest)
  nitroApp.hooks.hook('beforeResponse', async (event, response) => {
    await finishCatalogCacheResponse(event, response.body)
  })
})
