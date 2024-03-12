import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import AudioPlaylistsOverview from "./AudioPlaylistsOverview.vue";
import EmptyState from "@/components/EmptyState.vue";
import { mockAudioPlaylist, mockLanguageEng } from "@/tests/mockData";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useTagStore } from "@/stores/tag";

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
});
