<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local navigation helpers are self-documenting and not public APIs */
import { appRouteLocations } from '~/utils/route-locations'

const {
  transferPaymentId,
  streamId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const router = useRouter()
const localePath = useLocalePath()

const openTemplateDetail = async (templateId: string) => {
  await router.push(localePath(appRouteLocations.transferPaymentApprovalTemplateDetail(
    transferPaymentId,
    streamId,
    templateId
  )))
}
</script>

<template>
  <CommonApprovalTemplatesTab
    scope-type="transferpaymentstream"
    :scope-id="streamId"
    :can-update-child="canUpdateChild"
    :can-delete-child="canDeleteChild"
    :open-template-detail="openTemplateDetail" />
</template>
