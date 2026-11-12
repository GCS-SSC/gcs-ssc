<script setup lang="ts">
import { onScopeDispose } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { resolveAuthReturnTarget } from '~/utils/auth-return-target'
import { resolveLoginError } from '~/utils/login-error'

definePageMeta({
  layout: false,
  i18n: {
    paths: {
      en: '/login',
      fr: '/connexion'
    }
  }
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useLocalizedToast()

const email = ref('')
const password = ref('')
type LoginState =
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'navigating' }
  | { kind: 'error'; message: string }
  | { kind: 'disposed' }
const loginState = ref<LoginState>({ kind: 'ready' })
onScopeDispose(() => {
  loginState.value = { kind: 'disposed' }
})
const loading = computed(() => loginState.value.kind === 'submitting' || loginState.value.kind === 'navigating')
const loginError = computed(() => loginState.value.kind === 'error' ? loginState.value.message || t('login.error_description') : '')
const isDemoBuild = import.meta.env.VITE_GCS_DEMO === 'true'

/**
 * Preserves startup guidance while redacting authentication and transport details.
 * @param error - Authentication response or transport failure.
 */
const showLoginError = (error: unknown) => {
  if (loginState.value.kind === 'disposed') return
  loginState.value = { kind: 'error', message: resolveLoginError(error, '') }
  toast.add({
    title: toast.localized('login.error_title'),
    description: resolveLoginError(error, '') || toast.localized('login.error_description'),
    color: 'error'
  })
}

if (import.meta.dev || isDemoBuild) {
  email.value = 'root@example.com'
  password.value = 'password123'
}

/**
 * Handles the login process via email and password.
 * Updates the loading state and provides user feedback on success or failure.
 */
const onLogin = async () => {
  if (loading.value || loginState.value.kind === 'disposed') return
  loginState.value = { kind: 'submitting' }
  const request = loginState.value
  try {
    const { error } = await authClient.signIn.email({
      email: email.value,
      password: password.value
    })
    if (loginState.value !== request) return

    if (error) {
      showLoginError(error)
    } else {
      const homePath = localePath(appRouteLocations.home())
      const target = resolveAuthReturnTarget(
        route.query.returnTo,
        homePath,
        ['/login', '/connexion', localePath(appRouteLocations.login())]
      )
      loginState.value = { kind: 'navigating' }
      await navigateTo(target)
    }
  } catch (error) {
    showLoginError(error)
  } finally {
    if (loading.value) loginState.value = { kind: 'ready' }
  }
}
</script>

<template>
  <div data-field-tooltip-unavailable="No owning agency exists for global user administration or authentication." data-field-scope="login" class="flex min-h-screen items-center justify-center bg-(--ui-bg)">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex flex-col items-center gap-2">
          <img src="/images/gcs-ssc-logo.svg" alt="GCS-SSC" aria-hidden="false" class="h-16 w-16">
          <h1 class="text-2xl font-black tracking-tighter">
            GCS-SSC
          </h1>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="onLogin">
        <UFormField data-ui-target="login.login.email" :label="t('login.email')" required>
          <UInput v-model="email" type="email" autocomplete="username" :placeholder="t('login.email_placeholder')" :disabled="loading" />
        </UFormField>
        <UFormField data-ui-target="login.login.password" :label="t('login.password')" required>
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('login.password_placeholder')"
            :disabled="loading" />
        </UFormField>
        <p v-if="loginError" role="alert" aria-live="assertive" class="text-sm text-error">
          {{ loginError }}
        </p>
        <UButton type="submit" :label="t('login.login')" block size="lg" :loading="loading" :disabled="loading" />

        <USeparator :label="t('login.or')" />

        <UButton
          icon="i-simple-icons-github"
          :label="t('login.login_with_github')"
          :title="t('login.github_disabled_reason')"
          disabled
          block
          size="lg"
          color="neutral"
          variant="outline"
          :loading="loading" />
        <p class="text-muted text-xs">
          {{ t('login.github_disabled_reason') }}
        </p>
      </form>
    </UCard>
  </div>
</template>
