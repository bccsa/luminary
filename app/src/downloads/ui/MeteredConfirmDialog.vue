<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import LDialog from "@/components/common/LDialog.vue";
import { formatBytes } from "../texts";

type Props = {
    /** What the transfer is expected to use. */
    bytes: number;
};
const props = defineProps<Props>();

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ confirm: [] }>();

const { t, locale } = useI18n();
const description = computed(() =>
    t("downloads.metered.message", { size: formatBytes(props.bytes, locale.value) }),
);

function confirm() {
    open.value = false;
    emit("confirm");
}
</script>

<template>
    <LDialog
        v-model:open="open"
        :title="t('downloads.metered.title')"
        :description="description"
        :primary-action="confirm"
        :primary-button-text="t('downloads.metered.confirm')"
        :secondary-action="() => (open = false)"
        :secondary-button-text="t('downloads.metered.cancel')"
    />
</template>
