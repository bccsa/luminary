import { onMounted, ref } from "vue";

export function waitForDataRender(s: number) {
    const isWaitOver = ref(false);

    onMounted(() => {
        setTimeout(() => {
            isWaitOver.value = true;
        }, s * 1000);
    });

    return isWaitOver;
}
