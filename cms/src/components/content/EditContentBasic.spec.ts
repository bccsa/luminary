import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import EditContentBasic from "./EditContentBasic.vue";
import type { ContentDto } from "@/types";
import { DateTime } from "luxon";
import waitForExpect from "wait-for-expect";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the title", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the title input field
        const titleInput = wrapper.find('[name="title"]');
        await titleInput.setValue("Updated Title");

        // Check if the content's title was updated
        expect(content.value.title).toBe("Updated Title");
    });

    it("can update the summary", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the summary input field
        const summaryInput = wrapper.find('[name="summary"]');
        await summaryInput.setValue("Updated Summary");

        // Check if the content's summary was updated
        expect(content.value.summary).toBe("Updated Summary");
    });

    it("sets expiry date when shortcut buttons are clicked", async () => {
        const content = ref<ContentDto>({
            ...mockEnglishContentDto,
            publishDate: DateTime.now().toMillis(),
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Numbers shorcuts buttons
        const one = wrapper.find("[name='1']");
        const two = wrapper.find("[name='2']");
        const three = wrapper.find("[name='3']");
        const six = wrapper.find("[name='6']");

        // Units shorcuts values
        const week = wrapper.find("[name='W']");
        const month = wrapper.find("[name='M']");
        const year = wrapper.find("[name='Y']");

        // TEST FOR WEEKS

        // 1 week shorcut test
        one.trigger("click");
        week.trigger("click");
        const publishDate = DateTime.fromMillis(content.value.publishDate!);
        const expiryDate = DateTime.fromMillis(content.value.expiryDate!);
        expect(expiryDate).toStrictEqual(publishDate.plus({ weeks: 1 }));

        // 2 weeks shorcut test
        two.trigger("click");
        week.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ weeks: 2 }),
        );

        // 3 weeks shorcut test
        three.trigger("click");
        week.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ weeks: 3 }),
        );

        // 6 weeks shorcut test
        six.trigger("click");
        week.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ weeks: 6 }),
        );

        // TEST FOR MONTHS

        // 1 month shorcut test
        one.trigger("click");
        month.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ months: 1 }),
        );

        // 2 months shorcut test
        two.trigger("click");
        month.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ months: 2 }),
        );

        // 3 months shorcut test
        three.trigger("click");
        month.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ months: 3 }),
        );

        // 6 months shorcut test
        six.trigger("click");
        month.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ months: 6 }),
        );

        // TEST FOR YEARS

        // 1 year shorcut test
        one.trigger("click");
        year.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ year: 1 }),
        );

        // 2 years shorcut test
        two.trigger("click");
        year.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ years: 2 }),
        );

        // 3 years shorcut test
        three.trigger("click");
        year.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ years: 3 }),
        );

        // 6 years shorcut test
        six.trigger("click");
        year.trigger("click");
        expect(DateTime.fromMillis(content.value.expiryDate!)).toStrictEqual(
            DateTime.fromMillis(content.value.publishDate!).plus({ years: 6 }),
        );

        // TEST FOR CLEAR BUTTON
        // Clear button
        const clearButton = wrapper.find("[name='clear']");
        await clearButton.trigger("click");
        expect(content.value.expiryDate).toBeUndefined();
    });

    it("check if the Publish/Draft toggle switchs correctly", async () => {
        const content = ref<ContentDto>({ ...mockEnglishContentDto, status: "draft" });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the publish status toggle (assuming LToggle renders as a button)
        const toggleButton = wrapper.find("[data-test='toggle']");

        // Initially, the content status should be Draft
        expect(content.value.status).toBe("draft");

        // click on the button
        await toggleButton.trigger("click");

        // Check if the content's status was updated
        expect(content.value.status).toBe("published");
    });
});
