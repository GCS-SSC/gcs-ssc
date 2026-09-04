if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting())
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

  self.addEventListener('fetch', (event) => {
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
      return
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 0) {
            return response
          }

          const newHeaders = new Headers(response.headers)
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp')
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
        })
        .catch((e) => console.error(e))
    )
  })
} else {
  navigator.serviceWorker.register(window.document.currentScript.src).then(registration => {
    if (registration) {
      registration.addEventListener('updatefound', () => {
        console.log('Reloading for COI update')
        window.location.reload()
      })

      if (registration.active && !navigator.serviceWorker.controller) {
        console.log('Reloading for COI activation')
        window.location.reload()
      }
    }
  }).catch(e => console.error('COI registration failed', e))
}
