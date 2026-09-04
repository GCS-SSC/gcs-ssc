export default defineNuxtConfig({
  modules: ['./modules/gcs-extensions', '@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt', '@nuxtjs/i18n'],

  ssr: false,

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    databaseUrl: '',
    pgliteDataDir: './.data/pglite',
    postgresStatementTimeoutMs: 60_000,
    postgresLockTimeoutMs: 5_000,
    postgresIdleInTransactionSessionTimeoutMs: 60_000,
    postgresHealthQueryTimeoutMs: 2_000,
    githubClientId: '',
    githubClientSecret: '',
    authSecret: '',
    authUrl: '',
    authTrustedOrigins: '',
    authCookieCacheVersion: '1'
  },

  routeRules: {
    '/login': {
      redirect: '/en/login'
    },
    '/api/**': {
      cors: true
    }
  },

  sourcemap: process.env.NODE_ENV === 'production' || process.env.NUXT_DISABLE_SOURCEMAPS === 'true'
    ? false
    : undefined,
  future: {
    compatibilityVersion: 4
  },

  experimental: {
    scanPageMeta: true
  },

  compatibilityDate: '2024-07-11',

  vite: {
    define: {
      'import.meta.env.VITE_GCS_DEMO': JSON.stringify(process.env.VITE_GCS_DEMO === 'true' ? 'true' : 'false')
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    customRoutes: 'meta',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' }
    ],
    langDir: 'locales',
    defaultLocale: 'en',
    strategy: 'prefix',
    experimental: {
      localeDetector: 'locale-detector.ts'
    }
  }
})
