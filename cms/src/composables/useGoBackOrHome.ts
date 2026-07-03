import { useRouter } from "vue-router";

/** Navigate back in history, or to the dashboard when there is nowhere to go back to. */
export function useGoBackOrHome() {
    const router = useRouter();

    return () => {
        if (window.history.length > 1) {
            router.back();
        } else {
            router.push({ name: "dashboard" });
        }
    };
}
