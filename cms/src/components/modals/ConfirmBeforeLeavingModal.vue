<script setup lang="ts">
import { ref, toRefs } from "vue";
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
    return true;
});

const closeWithoutLeaving = () => {
    isModalOpen.value = false;
    leavingTo.value = undefined;
};

const leave = async () => {
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
        context="danger"
        title="Are you sure you want to leave the page?"
        description="You have unsaved changes. If you leave now these changes are discarded."
        primaryButtonText="Discard changes"
        secondaryButtonText="Stay on page"
        :primaryAction="leave"
        :secondaryAction="closeWithoutLeaving"
    />
</template>
