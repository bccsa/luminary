<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LButton from "../button/LButton.vue";
import LModal from "../form/LModal.vue";
import ReaderSettingsPanel from "../content/ReaderSettingsPanel.vue";

type Props = {
    isVisible: boolean;
};
defineProps<Props>();

const { t } = useI18n();

const emit = defineEmits(["close"]);
</script>

<template>
    <LModal
        :heading="t('reader_settings.title')"
        :is-visible="isVisible"
        @close="emit('close')"
    >
        <ReaderSettingsPanel data-test="readerSettings" />
        <template #footer>
            <LButton
                variant="primary"
                size="lg"
                rounding="less"
                class="w-full"
                @click="emit('close')"
            >
                {{ t("reader_settings.close_button") }}
            </LButton>
        </template>
    </LModal>
</template>
