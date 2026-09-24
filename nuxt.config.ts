export default defineNuxtConfig({
  modules: ['./modules/gcs-extensions', '@nuxt/eslint', '@nuxt/ui', './modules/form-requirements', '@vueuse/nuxt', '@nuxtjs/i18n'],

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

  nitro: {
    experimental: { asyncContext: true },
    typescript: { tsConfig: { exclude: ['../server/database/migrations/0240_seed.ts'] } }
  },

  vite: {
    define: {
      'import.meta.env.VITE_GCS_DEMO': JSON.stringify(process.env.VITE_GCS_DEMO === 'true' ? 'true' : 'false')
    }
  },
  hooks: {
    // The immutable historical seed targets the schema before final cleanup.
    /**
     * Keep the frozen seed separate from the current schema type contract.
     * @param root0 - Generated Nuxt type configurations.
     * @param root0.tsConfig - Application configuration.
     * @param root0.nodeTsConfig - Node configuration.
     * @param root0.sharedTsConfig - Shared configuration.
     */
    'prepare:types': ({ tsConfig, nodeTsConfig, sharedTsConfig }) => {
      for (const config of [tsConfig, nodeTsConfig, sharedTsConfig]) {
        config.exclude ??= []
        config.exclude.push('../server/database/migrations/0240_seed.ts')
      }
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
  },

  icon: {
    provider: 'server',
    localApiEndpoint: '/_nuxt_icon'
  }
})
