<script setup lang="ts">
import { ToastPortal, ToastProvider, ToastViewport } from 'reka-ui'
import UToast from '@nuxt/ui/components/Toast.vue'
import { useLocale, useToast } from '@nuxt/ui/composables'
import type { Toast } from '@nuxt/ui/composables/useToast'
import { pick } from '@nuxt/ui/utils'

const { t: uiText } = useLocale()
const { toasts, remove } = useToast()
const toastKeys = [
  'title', 'description', 'icon', 'avatar', 'color', 'orientation', 'close', 'closeIcon',
  'actions', 'duration', 'progress', 'class', 'ui', 'open', 'type',
  'onUpdate:open', 'onEscapeKeyDown', 'onPause', 'onResume', 'onSwipeStart', 'onSwipeMove', 'onSwipeCancel', 'onSwipeEnd'
] satisfies (keyof Toast)[]

const updateOpen = (toast: Toast, open: boolean) => {
  if (!open) remove(toast.id)
}
</script>

<template>
  <ToastProvider :label="uiText('toaster.label')" :duration="5000" swipe-direction="right">
    <UToast
      v-for="toast in toasts"
      :key="toast.id"
      v-bind="pick(toast, toastKeys)"
      :as="toast.as ?? 'div'"
      :role="toast.type === 'background' ? 'status' : 'alert'"
      :aria-live="toast.type === 'background' ? 'polite' : 'assertive'"
      aria-atomic="true"
      data-notification
      @update:open="updateOpen(toast, $event)"
      @click="toast.onClick?.(toast)"
    />
    <ToastPortal to="body">
      <ToastViewport
        as="div"
        :label="uiText('toaster.viewport')"
        aria-live="off"
        class="fixed right-4 bottom-4 z-[100] flex w-[calc(100%-2rem)] flex-col gap-4 focus:outline-none sm:w-96"
        data-notification-viewport
      />
    </ToastPortal>
  </ToastProvider>
</template>

<style>
[data-notification] {
  pointer-events: auto;
  transition: translate 200ms ease-out;
}
[data-notification][data-state='open'] {
  animation: notification-enter 200ms ease-out;
}
[data-notification][data-state='closed'] {
  animation: notification-exit 200ms ease-out;
}
[data-notification][data-swipe='move'] {
  translate: var(--reka-toast-swipe-move-x) 0;
  transition: none;
}
[data-notification][data-swipe='end'] {
  translate: var(--reka-toast-swipe-end-x) 0;
}
[data-notification][data-swipe='end'][data-state='closed'] {
  animation-name: notification-swipe-exit;
}
@keyframes notification-enter {
  from { translate: 0 1rem; }
  to { translate: 0 0; }
}
@keyframes notification-exit {
  to { translate: 1rem 0; }
}
@keyframes notification-swipe-exit {
  from { translate: var(--reka-toast-swipe-end-x) 0; }
  to { translate: calc(100% + 1rem) 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-notification] {
    animation: none !important;
    transition: none !important;
  }
}
</style>
