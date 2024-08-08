import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentStatus from "./EditContentStatus.vue";
import { DateTime } from "luxon";
import { db, accessMap, type ContentDto, PublishStatus } from "luminary-shared";

describe("EditContentStatus.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("sets expiry date when shortcut buttons are clicked", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            publishDate: DateTime.now().toMillis(),
        });
        const wrapper = mount(EditContentStatus, {
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
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        });
        const wrapper = mount(EditContentStatus, {
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

    it("sets the publish date correctly from the loaded data", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            publishDate: Date.now(),
        });
        const wrapper = mount(EditContentStatus, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the publish date input field
        const publishDateInput = wrapper.find(
            '[name="publishDate"]',
        ) as DOMWrapper<HTMLInputElement>;

        // Check if the publish date input field has the correct value
        expect(publishDateInput.element.value).toBe(db.toIsoDateTime(content.value.publishDate!));
    });

    it("sets the expiry date correctly from the loaded data", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            expiryDate: Date.now(),
        });
        const wrapper = mount(EditContentStatus, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the expiry date input field
        const expiryDateInput = wrapper.find('[name="expiryDate"]') as DOMWrapper<HTMLInputElement>;

        // Check if the expiry date input field has the correct value
        expect(expiryDateInput.element.value).toBe(db.toIsoDateTime(content.value.expiryDate!));
    });

    it("sets the status toggle correctly to draft from the loaded data", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        });
        const wrapper = mount(EditContentStatus, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the publish status toggle
        const toggleButtonOffState = wrapper
            .find("[data-test='toggle']")
            .findAll("span")[1]
            .find("span");
        const toggleButtonOnState = wrapper
            .find("[data-test='toggle']")
            .findAll("span")[1]
            .findAll("span")[1];

        // Check if the toggle button is in the correct state
        expect(toggleButtonOffState.classes()).toContain("opacity-100");
        expect(toggleButtonOnState.classes()).toContain("opacity-0");
    });

    it("sets the status toggle correctly to published from the loaded data", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Published,
        });
        const wrapper = mount(EditContentStatus, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the publish status toggle
        const toggleButtonOffState = wrapper
            .find("[data-test='toggle']")
            .findAll("span")[1]
            .find("span");
        const toggleButtonOnState = wrapper
            .find("[data-test='toggle']")
            .findAll("span")[1]
            .findAll("span")[1];

        // Check if the toggle button is in the correct state
        expect(toggleButtonOffState.classes()).toContain("opacity-0");
        expect(toggleButtonOnState.classes()).toContain("opacity-100");
    });
});
