import { ref, type Ref } from "vue";
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from "vue-router";

export function useConfirmBeforeLeaving(isDirty: Ref<boolean>) {
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

    return { isModalOpen, closeModalWithoutLeaving, closeModalAndLeave };
}
