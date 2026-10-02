import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import { AckStatus } from "luminary-shared";
import AffinityConfigPanel from "./AffinityConfigPanel.vue";
import { useNotificationStore } from "@/stores/notification";

// Hoisted so the (async) mock factory below can close over it — a plain top-level const is
// not yet initialized when the factory is resolved.
const DEFAULT_AFFINITY_CONFIG = vi.hoisted(() => ({
    halfLifeDays: 45,
    hitWeight: 0.04,
    minScore: 0.01,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    mediaCompletionPercent: 75,
    eventWeight: {
        bookmark: 0.25,
        bookmarkRemoved: -0.15,
        completion: 0.35,
        readCompletion: 0.35,
        highlight: 0.3,
        highlightRemoved: -0.18,
        impression: -0.02,
        searchClick: 0.0004,
    },
    global: {
        halfLifeDays: 180,
        learningRate: 0.002,
        minScore: 0.0005,
        maxTags: 200,
        minEvents: 20,
        intervalHours: 24,
    },
}));

const mockSaveConfig = vi.fn();
// Holds the `config` ref so a test can simulate the singleton landing after mount. Filled in
// the factory below — `vi.hoisted` runs before the `vue` import is initialized.
const holder = vi.hoisted(() => ({}) as { config: Ref<typeof DEFAULT_AFFINITY_CONFIG> });

vi.mock("@/composables/useDefaultAffinity", async () => {
    const { ref: vueRef } = await import("vue");
    holder.config = vueRef(DEFAULT_AFFINITY_CONFIG);
    return {
        useDefaultAffinity: () => ({
            current: vueRef({
                _id: "default-affinity",
                memberOf: ["group-super-admins"],
                affinity: {},
                config: DEFAULT_AFFINITY_CONFIG,
            }),
            config: holder.config,
            saveConfig: mockSaveConfig,
        }),
    };
});

const configRef = {
    get value() {
        return holder.config.value;
    },
    set value(v) {
        holder.config.value = v;
    },
};

vi.mock("@/globalConfig", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

describe("AffinityConfigPanel — late-arriving config", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        configRef.value = DEFAULT_AFFINITY_CONFIG;
    });

    // The panel mounts before the singleton has loaded, so the form starts on defaults. When
    // the real doc lands it must be adopted — measuring dirtiness against the server instead
    // of against what the form was loaded from read that gap as unsaved edits, which blocked
    // the resync and left the form showing defaults for the rest of the session.
    it("adopts the stored config when it arrives after mount", async () => {
        const wrapper = mount(AffinityConfigPanel);

        expect(
            (wrapper.find("input[name='global-minEvents']").element as HTMLInputElement).value,
        ).toBe("20");

        configRef.value = {
            ...DEFAULT_AFFINITY_CONFIG,
            global: { ...DEFAULT_AFFINITY_CONFIG.global, minEvents: 1, intervalHours: 0 },
        };
        await flushPromises();

        expect(
            (wrapper.find("input[name='global-minEvents']").element as HTMLInputElement).value,
        ).toBe("1");
        expect(
            wrapper.find("button[data-test='affinity-config-save']").attributes("disabled"),
        ).toBeDefined();
    });

    it("keeps an in-progress edit when a remote change lands", async () => {
        const wrapper = mount(AffinityConfigPanel);

        await wrapper.find("input[name='global-minEvents']").setValue("7");
        configRef.value = {
            ...DEFAULT_AFFINITY_CONFIG,
            global: { ...DEFAULT_AFFINITY_CONFIG.global, minEvents: 99 },
        };
        await flushPromises();

        expect(
            (wrapper.find("input[name='global-minEvents']").element as HTMLInputElement).value,
        ).toBe("7");
    });
});

describe("AffinityConfigPanel — community interest knobs", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    // These drive whether a client contributes at all, so a missing one makes the whole
    // global-affinity feature look broken with nothing to point at.
    it.each([
        ["global-learningRate", "How much one person counts"],
        ["global-halfLifeDays", "Days until it halves"],
        ["global-maxTags", "Most interests remembered"],
        ["global-minEvents", "Actions needed before someone counts"],
        ["global-intervalHours", "Hours before someone can count again"],
    ])("renders %s", (field, label) => {
        const wrapper = mount(AffinityConfigPanel);

        expect(wrapper.find(`[data-test="affinity-config-${field}"]`).exists()).toBe(true);
        expect(wrapper.text()).toContain(label);
    });

    it("renders them for a config saved before the knobs existed", () => {
        // `resolveAffinityConfig` fills the block in, so an older doc must not blank the panel.
        const wrapper = mount(AffinityConfigPanel);

        expect(wrapper.text()).toContain("Community interest");
        expect(wrapper.find('[data-test="affinity-config-global-minEvents"]').exists()).toBe(true);
    });
});

describe("AffinityConfigPanel", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        mockSaveConfig.mockReset();
        mockSaveConfig.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("clamps a percent input down to the fraction ceiling", async () => {
        const wrapper = mount(AffinityConfigPanel);

        const input = wrapper.find("input[name='hitWeight']");
        await input.setValue("500");
        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ hitWeight: 1 }), [
            "group-super-admins",
        ]);
    });

    it("shows a success notification on save", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(AffinityConfigPanel);

        // Save is gated on the form being dirty, so make an edit before clicking it.
        await wrapper.find("input[name='halfLifeDays']").setValue("60");
        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Settings saved", state: "success" }),
        );
    });

    it("surfaces a rejected save as an error notification", async () => {
        mockSaveConfig.mockResolvedValue({ ack: AckStatus.Rejected, message: "Nope" });
        const notificationStore = useNotificationStore();
        const wrapper = mount(AffinityConfigPanel);

        await wrapper.find("input[name='halfLifeDays']").setValue("60");
        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Can't save these settings",
                description: "Nope",
                state: "error",
            }),
        );
    });

    it("clamps the media-completion threshold up to its floor", async () => {
        const wrapper = mount(AffinityConfigPanel);

        await wrapper.find("input[name='mediaCompletionPercent']").setValue("0");
        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(mockSaveConfig).toHaveBeenCalledWith(
            expect.objectContaining({ mediaCompletionPercent: 1 }),
            ["group-super-admins"],
        );
    });

    describe("dirty state", () => {
        const isDisabled = (wrapper: ReturnType<typeof mount>, test: string) =>
            wrapper.find(`button[data-test='${test}']`).attributes("disabled") !== undefined;

        it("disables both buttons until something is edited", () => {
            const wrapper = mount(AffinityConfigPanel);

            expect(isDisabled(wrapper, "affinity-config-save")).toBe(true);
            expect(isDisabled(wrapper, "affinity-config-cancel")).toBe(true);
        });

        it("enables both buttons once a field changes", async () => {
            const wrapper = mount(AffinityConfigPanel);

            await wrapper.find("input[name='halfLifeDays']").setValue("60");

            expect(isDisabled(wrapper, "affinity-config-save")).toBe(false);
            expect(isDisabled(wrapper, "affinity-config-cancel")).toBe(false);
        });

        it("enables them for a community-interest edit too", async () => {
            const wrapper = mount(AffinityConfigPanel);

            await wrapper.find("input[name='global-minEvents']").setValue("1");

            expect(isDisabled(wrapper, "affinity-config-save")).toBe(false);
        });

        it("goes clean again after Reset", async () => {
            const wrapper = mount(AffinityConfigPanel);

            await wrapper.find("input[name='halfLifeDays']").setValue("60");
            await wrapper.find("button[data-test='affinity-config-cancel']").trigger("click");

            expect(isDisabled(wrapper, "affinity-config-save")).toBe(true);
        });
    });

    it("shows the reading-floor field with a % suffix and no redundant parenthetical", () => {
        const wrapper = mount(AffinityConfigPanel);

        expect(wrapper.text()).toContain("Reading needed for it to count");
        expect(wrapper.text()).not.toContain("Reading needed for it to count (%)");
    });
});
