<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import CommonNotFoundIllustration from '~/components/Common/NotFoundIllustration.vue'
import CommonAccessDeniedIllustration from '~/components/Common/AccessDeniedIllustration.vue'
import CommonSessionExpiredIllustration from '~/components/Common/SessionExpiredIllustration.vue'
import CommonServiceErrorIllustration from '~/components/Common/ServiceErrorIllustration.vue'
import CommonServiceUnavailableIllustration from '~/components/Common/ServiceUnavailableIllustration.vue'
import { resolveAuthReturnTarget } from '~/utils/auth-return-target'
import { appRouteLocations } from '~/utils/route-locations'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const { error } = defineProps<{
  error: NuxtError
}>()

const statusCode = computed(() => error.statusCode ?? 500)
const state = computed(() => {
  if (statusCode.value === 401) return 'session_expired'
  if (statusCode.value === 403) return 'access_denied'
  if (statusCode.value === 404) return 'not_found'
  if ([502, 503, 504].includes(statusCode.value)) return 'unavailable'
  return 'unexpected'
})
const statusMessage = computed(() => t(`error_page.${state.value}_title`))
const message = computed(() => t(`error_page.${state.value}_description`))
const isRetryable = computed(() => state.value === 'unexpected' || state.value === 'unavailable')
const isRecovering: Ref<boolean> = ref(false)
const loginPath = localePath(appRouteLocations.login())
const homePath = localePath(appRouteLocations.home())
const returnTarget = resolveAuthReturnTarget(route.fullPath, homePath, ['/login', '/connexion', loginPath])

/** Clears the fatal error and returns to the localized dashboard. */
const returnHome = async () => {
  await clearError({ redirect: homePath })
}

/** Opens sign-in while preserving the safe application-relative destination. */
const signInAgain = async () => {
  await clearError({ redirect: `${loginPath}?${new URLSearchParams({ returnTo: returnTarget, reauthenticate: '1' })}` })
}

/** Reloads the failed route so canonical reads and session checks run afresh. */
const retryPage = () => {
  if (isRecovering.value) return
  isRecovering.value = true
  reloadNuxtApp({ path: returnTarget, force: true })
}

useSeoMeta({
  title: statusMessage,
  description: message
})

useHead({
  htmlAttrs: {
    lang: () => locale.value
  }
})
</script>

<template>
  <UApp>
    <main data-testid="page-error" class="flex min-h-svh items-center justify-center px-6 py-12">
      <div class="flex w-full max-w-lg flex-col items-center text-center">
        <CommonSessionExpiredIllustration v-if="state === 'session_expired'" />
        <CommonAccessDeniedIllustration v-else-if="state === 'access_denied'" />
        <CommonNotFoundIllustration v-else-if="state === 'not_found'" />
        <CommonServiceUnavailableIllustration v-else-if="state === 'unavailable'" />
        <CommonServiceErrorIllustration v-else />
        <p class="mt-6 text-sm font-bold tracking-widest text-primary">
          {{ statusCode }}
        </p>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          {{ statusMessage }}
        </h1>
        <p class="mt-3 max-w-sm text-base leading-relaxed text-muted">
          {{ message }}
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <UButton
            v-if="state === 'session_expired'"
            color="primary"
            size="lg"
            icon="i-lucide-log-in"
            :label="t('error_page.sign_in')"
            @click="signInAgain" />
          <UButton
            v-else-if="isRetryable"
            color="primary"
            size="lg"
            icon="i-lucide-refresh-cw"
            :label="t('error_page.try_again')"
            :loading="isRecovering"
            :disabled="isRecovering"
            @click="retryPage" />
          <UButton
            v-if="state !== 'session_expired'"
            :color="isRetryable ? 'neutral' : 'primary'"
            :variant="isRetryable ? 'ghost' : 'solid'"
            size="lg"
            icon="i-lucide-arrow-left"
            :label="t('error_page.return_home')"
            @click="returnHome" />
        </div>
      </div>
    </main>
  </UApp>
</template>
