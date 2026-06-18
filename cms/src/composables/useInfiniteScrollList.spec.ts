import { describe, it, expect, vi } from "vitest";
import { ref, defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useInfiniteScrollList } from "./useInfiniteScrollList";
import { basePageScrollKey } from "@/keys/basePageScroll";

vi.mock("@vueuse/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@vueuse/core")>();
    return {
        ...actual,
        useInfiniteScroll: vi.fn(),
    };
});

describe("useInfiniteScrollList", () => {
    it("reveals an initial page-sized window", () => {
        const source = ref([1, 2, 3, 4, 5]);
        let visible: ReturnType<typeof useInfiniteScrollList<number>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host, {
            global: {
                provide: { [basePageScrollKey as symbol]: ref(null) },
            },
        });

        expect(visible!.value).toEqual([1, 2]);
    });

    it("resets the window when resetWhen deps change", async () => {
        const source = ref(["a", "b", "c", "d"]);
        const filter = ref("x");
        let visible: ReturnType<typeof useInfiniteScrollList<string>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, {
                    pageSize: 2,
                    resetWhen: [() => filter.value],
                }));
                return () => null;
            },
        });

        mount(Host, {
            global: {
                provide: { [basePageScrollKey as symbol]: ref(null) },
            },
        });

        visible!.value;
        filter.value = "y";
        await nextTick();
        expect(visible!.value).toEqual(["a", "b"]);
    });
});
