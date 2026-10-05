<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LDialog from "@/components/common/LDialog.vue";
import { useStoreUpdateReminder } from "@/composables/useStoreUpdateReminder";

type Props = {
    /** Whether the app may interrupt the user now; decided by the app, not the dialog. */
    canPrompt: boolean;
};
const props = defineProps<Props>();

const { t } = useI18n();
const { isOpen, update, later } = useStoreUpdateReminder(() => props.canPrompt);
</script>

<template>
    <LDialog
        v-model:open="isOpen"
        :title="t('app_update.title')"
        :description="t('app_update.description')"
        :primary-action="update"
        :primary-button-text="t('app_update.button_update')"
        :secondary-action="later"
        :secondary-button-text="t('app_update.button_later')"
    />
</template>
