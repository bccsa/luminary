import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

import { setActivePinia } from "pinia";
import TagSelector2 from "./TagSelector2.vue";
import { DocType, TagType } from "@/types";
import { mockLanguageDtoEng, mockPostDto } from "@/tests/mockData";

describe("TagSelector2.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {});

    it("display the selected tag", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                // parent: mockPostDto,
                docType: DocType.Post,
                tagType: TagType.Category,
                language: mockLanguageDtoEng,
                disabled: false,
            },
        });

        console.log(mockPostDto);

        await wrapper.vm.$nextTick();
        console.log(wrapper.text());
    });
});
