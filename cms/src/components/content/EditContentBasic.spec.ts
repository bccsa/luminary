import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentBasic from "./EditContentBasic.vue";
import { DateTime } from "luxon";
import { db, accessMap, type ContentDto, PublishStatus } from "luminary-shared";
import LTextToggle from "../forms/LTextToggle.vue";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the title", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find and update the title input field
        const titleInput = wrapper.find('[name="title"]');
        await titleInput.setValue("Updated Title");

        // Check if the content's title was updated
        expect(content.value.title).toBe("Updated Title");
    });

    it("can update the author", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find and update the author input field
        const authorInput = wrapper.find('[name="author"]');
        await authorInput.setValue("Updated Author");

        // Check if the content's author was updated
        expect(content.value.author).toBe("Updated Author");
    });

    it("can update the summary", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find and update the summary input field
        const summaryInput = wrapper.find('[name="summary"]');
        await summaryInput.setValue("Updated Summary");

        // Check if the content's summary was updated
        expect(content.value.summary).toBe("Updated Summary");
    });

    it("can update the slug", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find and update the slug input field
        const slugInput = wrapper.find('[name="slug"]');
        await slugInput.setValue("updated-slug");

        // Check if the content's slug was updated
        expect(content.value.slug).toBe("updated-slug");
    });

    it("can update the seo title", async () => {
        const content = ref<ContentDto>({ ...mockData.mockEnglishContentDto });

        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find and click the toggle to switch to the SEO tab
        const seoToggle = wrapper.find('[data-test="text-toggle"]');
        const seoToggleBtn = seoToggle.findAll("button")[1];
        await seoToggleBtn.trigger("click");

        // Find and update the SEO title input field
        const seoTitleInput = wrapper.find('input[name="seo-title"]');
        await seoTitleInput.setValue("Updated Seo Title");

        // Assert that the model has been updated
        expect(content.value.seoTitle).toBe("Updated Seo Title");
    });

    it("can update the seo summary", async () => {
        const content = ref<ContentDto>({ ...mockData.mockEnglishContentDto });

        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Switch to the SEO tab
        const seoToggle = wrapper.find('[data-test="text-toggle"]');
        const seoToggleBtn = seoToggle.findAll("button")[1];
        await seoToggleBtn.trigger("click");

        // Find and update the SEO summary input field
        const seoSummaryInput = wrapper.find('input[name="seo-summary"]');
        await seoSummaryInput.setValue("Updated Seo Summary");

        expect(content.value.seoString).toBe("Updated Seo Summary");
    });

    it("sets expiry date when shortcut buttons are clicked", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            publishDate: DateTime.now().toMillis(),
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
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

    it("can switch between draft and published status", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find the publish status toggle
        const textToggleWrapper = wrapper.findAll("[data-test='text-toggle']");
        const draftButton = textToggleWrapper[1].find("[data-test='text-toggle-left-value']");
        const publishedButton = textToggleWrapper[1].find("[data-test='text-toggle-right-value']");

        // Initially, the content status should be Draft
        expect(content.value.status).toBe(PublishStatus.Draft);

        await publishedButton.trigger("click");

        // // Check if the content's status was updated
        expect(content.value.status).toBe(PublishStatus.Published);

        await draftButton.trigger("click");

        // // Check if the content's status was updated
        expect(content.value.status).toBe(PublishStatus.Draft);
    });

    it("can't switch between draft and published status if disablePublish is true", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: true,
            },
        });

        // Find the publish status toggle
        const textToggleWrapper = wrapper.findAll("[data-test='text-toggle']");
        const publishedButton = textToggleWrapper[1].find("[data-test='text-toggle-right-value']");

        // Initially, the content status should be Draft
        expect(content.value.status).toBe(PublishStatus.Draft);

        // Check if the publish button is disabled
        expect(publishedButton.attributes("disabled")).toBeDefined();
    });

    it("correctly sets the publish status toggle from the prop", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Published,
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find the publish status toggle
        const textToggle = wrapper.findAllComponents(LTextToggle);

        expect(textToggle[1].props().modelValue).toBe("published");
    });

    it("sets the publish date correctly from the loaded data", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            publishDate: Date.now(),
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
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
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find the expiry date input field
        const expiryDateInput = wrapper.find('[name="expiryDate"]') as DOMWrapper<HTMLInputElement>;

        // Check if the expiry date input field has the correct value
        expect(expiryDateInput.element.value).toBe(db.toIsoDateTime(content.value.expiryDate!));
    });

    it("shows the message error when clicking on expiry date shortcut buttons without setting a publish date", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            publishDate: undefined,
        });
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
                disablePublish: false,
            },
        });

        // Find the expiry date shortcut buttons
        const one = wrapper.find("[name='1']");
        const week = wrapper.find("[name='W']");

        // Click on the shortcut buttons
        await one.trigger("click");
        await week.trigger("click");

        // Check if the error message is displayed
        expect(wrapper.text()).toContain(
            "Please set a publish date before using the expiry shortcut.",
        );
    });
});
