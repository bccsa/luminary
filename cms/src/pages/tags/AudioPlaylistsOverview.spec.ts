import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import AudioPlaylistsOverview from "./AudioPlaylistsOverview.vue";
import EmptyState from "@/components/EmptyState.vue";
import { fullAccessToAllContentMap, mockAudioPlaylist, mockLanguageEng } from "@/tests/mockData";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useTagStore } from "@/stores/tag";
import { useUserAccessStore } from "@/stores/userAccess";
import { nextTick } from "vue";

describe("AudioPlaylistsOverview", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays posts from the store", async () => {
        const tagStore = useTagStore();
        const languageStore = useLanguageStore();

        // @ts-ignore Property is readonly
        tagStore.tags = [mockAudioPlaylist];
        // @ts-ignore Property is readonly
        tagStore.audioPlaylists = [mockAudioPlaylist];
        languageStore.languages = [mockLanguageEng];

        const wrapper = mount(AudioPlaylistsOverview);

        expect(wrapper.html()).toContain("Faith");
    });

    it("displays an empty state if there are no posts", async () => {
        const store = useTagStore();
        // @ts-ignore Property is readonly
        store.tags = [];
        // @ts-ignore Property is readonly
        store.audioPlaylists = [];

        const wrapper = mount(AudioPlaylistsOverview);

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });

    it("doesn't display anything when the db is still loading", async () => {
        const wrapper = mount(AudioPlaylistsOverview);

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.findComponent(EmptyState).exists()).toBe(false);
    });

    describe("permissions", () => {
        it("doesn't display Create button if the user has no permission to create tags", async () => {
            const postStore = useTagStore();
            const userAccessStore = useUserAccessStore();
            postStore.tags = [mockAudioPlaylist];

            const wrapper = mount(AudioPlaylistsOverview);

            expect(wrapper.text()).not.toContain("Create audio playlist");

            userAccessStore.accessMap = fullAccessToAllContentMap;
            await nextTick();
            expect(wrapper.text()).toContain("Create audio playlist");
        });
    });
});
