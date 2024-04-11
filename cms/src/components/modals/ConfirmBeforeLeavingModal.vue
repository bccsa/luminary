<script setup lang="ts">
import { ref, toRefs } from "vue";
import { useConfirmBeforeLeaving } from "@/composables/confirmBeforeLeaving";
import LModal from "@/components/common/LModal.vue";
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from "vue-router";

type Props = {
    isDirty: boolean;
};

const props = defineProps<Props>();

const { isDirty } = toRefs(props);

const router = useRouter();

const leavingTo = ref<RouteLocationRaw>();
const isModalOpen = ref(false);

onBeforeRouteLeave((to) => {
    if (isDirty.value && !leavingTo.value) {
        isModalOpen.value = true;
        leavingTo.value = to;
        return false;
    }
});

const closeModalWithoutLeaving = () => {
    isModalOpen.value = false;
    leavingTo.value = undefined;
};

const closeModalAndLeave = async () => {
    isModalOpen.value = false;

    if (!leavingTo.value) {
        return;
    }

    return await router.push(leavingTo.value);
};
</script>

<template>
    <LModal
        v-model:open="isModalOpen"
        title="Are you sure you want to leave the page?"
        description="You have unsaved changes. If you leave now these changes are not saved."
    >
        <template #primaryAction>
            <LButton
                @click="closeModalWithoutLeaving"
                variant="primary"
                class="inline-flex w-full sm:w-auto"
            >
                Stay on page
            </LButton>
        </template>
        <template #secondaryAction>
            <LButton @click="closeModalAndLeave" class="inline-flex w-full sm:w-auto">
                Leave
            </LButton>
        </template>
    </LModal>
</template>
