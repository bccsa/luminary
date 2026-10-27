import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";
import { useScreenWakeHold } from "./screenWakeHolds";

type Hold = ReturnType<typeof useScreenWakeHold>;

describe("useScreenWakeHold", () => {
    let wrappers: VueWrapper[] = [];

    /** Mounts a host that takes one hold per id, and hands the holds back. */
    function mountHolds(setKeepAwake: ReturnType<typeof vi.fn>, ids: string[]): Hold[] {
        const holds: Hold[] = [];
        const Host = defineComponent({
            setup() {
                holds.push(...ids.map((id) => useScreenWakeHold(id)));
                return () => h("div");
            },
        });
        wrappers.push(
            mount(Host, {
                global: { provide: { [ScreenWakeKey as symbol]: { setKeepAwake } } },
            }),
        );
        return holds;
    }

    afterEach(() => {
        wrappers.forEach((wrapper) => wrapper.unmount());
        wrappers = [];
    });

    it("keeps the display on while any holder still holds", () => {
        const setKeepAwake = vi.fn();
        const [page, player] = mountHolds(setKeepAwake, ["page", "player"]);

        page.hold();
        player.hold();
        page.release();
        expect(setKeepAwake.mock.calls).toEqual([[true]]);

        player.release();
        expect(setKeepAwake.mock.calls).toEqual([[true], [false]]);
    });

    it("tells the service only when the combined value changes", () => {
        const setKeepAwake = vi.fn();
        const [player] = mountHolds(setKeepAwake, ["player"]);

        player.hold();
        player.hold();
        player.release();
        player.release();

        expect(setKeepAwake.mock.calls).toEqual([[true], [false]]);
    });

    it("releases its holds when its component unmounts", () => {
        const setKeepAwake = vi.fn();
        const [player] = mountHolds(setKeepAwake, ["player"]);
        player.hold();

        wrappers.splice(0).forEach((wrapper) => wrapper.unmount());

        expect(setKeepAwake.mock.calls.at(-1)?.[0]).toBe(false);
    });
});
