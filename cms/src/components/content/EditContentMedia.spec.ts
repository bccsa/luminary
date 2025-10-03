import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EditContentMedia from "./EditContentMedia.vue";
import { DocType, PostType, type PostDto } from "luminary-shared";
import { ref } from "vue";
import * as mockData from "@/tests/mockdata";

describe("EditContentMedia.vue", () => {
    it("can display an audio thumbnail", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto });
        const wrapper = mount(EditContentMedia, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                disabled: false,
                newDocument: true, // Keep expanded
            },
            global: {
                stubs: {
                    MediaEditor: {
                        template:
                            '<div class="media-editor-stub">{{ JSON.stringify(parent.media?.fileCollections) }}</div>',
                        props: ["parent", "disabled"],
                    },
                },
            },
        });

        // Set the v-model value
        await wrapper.setProps({ parent: parent.value });

        // The component should be expanded since newDocument is true
        expect(wrapper.html()).toContain("audio-en.mp3");
        expect(wrapper.html()).toContain("audio-fr.mp3");
    });
});
