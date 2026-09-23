<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'

const { agencyId, canUpdate } = defineProps<{
  agencyId: string
  canUpdate: boolean
}>()
const router = useRouter()
const localePath = useLocalePath()
const openTemplateDetail = async (templateId: string) => {
  await router.push(localePath(appRouteLocations.agencyApprovalTemplateDetail(agencyId, templateId)))
}
</script>

<template>
  <CommonApprovalTemplatesTab
    :agency-id="agencyId"
    :can-update-child="canUpdate"
    :can-delete-child="canUpdate"
    :open-template-detail="openTemplateDetail" />
</template>
