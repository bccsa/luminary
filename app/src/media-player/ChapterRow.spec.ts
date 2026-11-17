import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import ChapterRow from "./ChapterRow.vue";

const i18n = createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false });
const chapter = { startTime: 60, endTime: 180, title: "Sermon" };

describe("ChapterRow", () => {
    it("leads the title with the chapter's number", () => {
        const wrapper = mount(ChapterRow, {
            props: { chapter, index: 1 },
            global: { plugins: [i18n] },
        });
        expect(wrapper.find("[data-test='mediaPlayerChapterTitle']").text()).toBe("2. Sermon");
    });
});
