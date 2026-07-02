import { describe, expect, it, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { DocType, PostType, type ContentDto, type LanguageDto } from "luminary-shared";
import MissingTranslationsCard from "../MissingTranslationsCard.vue";
import { cmsLanguageIdAsRef, cmsLanguages } from "@/globalConfig";

global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
};

const lang = (id: string, languageCode: string): LanguageDto =>
    ({ _id: id, languageCode }) as LanguageDto;

const contentDoc = (overrides: Partial<ContentDto>): ContentDto =>
    ({
        _id: `content-${Math.random()}`,
        type: DocType.Content,
        parentId: "post-1",
        parentType: DocType.Post,
        parentPostType: PostType.Blog,
        title: "Untitled",
        slug: "slug",
        memberOf: [],
        updatedTimeUtc: 0,
        ...overrides,
    }) as ContentDto;

describe("MissingTranslationsCard", () => {
    beforeEach(() => {
        cmsLanguages.value = [lang("lang-eng", "en"), lang("lang-fra", "fr"), lang("lang-swa", "sw")];
        cmsLanguageIdAsRef.value = "lang-fra";
    });

    it("links to the language of the displayed title, not an unrelated missing language", () => {
        const allContentDocs = [
            contentDoc({ language: "lang-fra", title: "Titre francais" }),
            contentDoc({ language: "lang-swa", title: "Kichwa cha habari" }),
            // lang-eng is missing for this parent
        ];

        const wrapper = mount(MissingTranslationsCard, {
            props: { allContentDocs },
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        const links = wrapper.findAllComponents(RouterLinkStub);
        const editLink = links.find((l) => (l.props().to as any)?.name === "edit");
        expect(editLink).toBeTruthy();
        expect(wrapper.text()).toContain("Titre francais");
        expect((editLink!.props().to as any).params.languageCode).toBe("fr");
    });
});
