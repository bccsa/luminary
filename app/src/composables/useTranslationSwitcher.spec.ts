import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ContentDto, LanguageDto } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useTranslationSwitcher } from "./useTranslationSwitcher";

vi.mock("@/router", () => ({ isExternalNavigation: () => true }));

const eng = { _id: "lang-eng", languageCode: "eng", name: "English" } as LanguageDto;
const fra = { _id: "lang-fra", languageCode: "fra", name: "Français" } as LanguageDto;
const english = { _id: "c-eng", language: "lang-eng", slug: "english" } as ContentDto;
const french = { _id: "c-fra", language: "lang-fra", slug: "french" } as ContentDto;

const router = {
    resolve: ({ params }: { params: { slug: string } }) => ({ href: `/${params.slug}` }),
    replace: vi.fn(),
} as never;

/** The article page's wiring: `content` follows the override, as it does there. */
function openArticle(opened: ContentDto, preferred = "lang-eng") {
    const fetched = ref<ContentDto | undefined>(opened);
    const contentOverride = ref<ContentDto | undefined>();
    const preferredLanguageId = ref<string | undefined>(preferred);
    // Translations load after the article itself, as their query resolves later.
    const translations = ref<ContentDto[]>([]);
    let switcher!: ReturnType<typeof useTranslationSwitcher>;
    const page = mount(
        defineComponent({
            setup() {
                switcher = useTranslationSwitcher({
                    content: computed(() => contentOverride.value ?? fetched.value),
                    contentOverride,
                    translations,
                    languages: ref([eng, fra]),
                    preferredLanguageId,
                    forcedLanguageCode: null,
                    router,
                    translate: (key) => key,
                });
                return () => null;
            },
        }),
    );
    translations.value = [english, french];
    return { fetched, contentOverride, preferredLanguageId, translations, switcher, page };
}

const bannerShown = () =>
    useNotificationStore().notifications.some((n) => n.id === "content-available");

describe("useTranslationSwitcher: the translation-available banner", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        localStorage.clear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("offers the reader's language on an article opened in another", async () => {
        openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(true);
    });

    it("goes when the reader switches to that language from the language menu", async () => {
        const { switcher } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        switcher.selectedLanguageId.value = "lang-eng";
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });

    it("goes when the reader switches before it has appeared", async () => {
        const { switcher } = openArticle(french);
        await nextTick();
        switcher.selectedLanguageId.value = "lang-eng";
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });

    it("goes when the reader follows it to the translation", async () => {
        const { fetched } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        fetched.value = english;
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });

    it("goes when following it opens the translation as a new page", async () => {
        const { page } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        page.unmount();
        openArticle(english);
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });

    it("goes when the reader leaves the article", async () => {
        const { page } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        page.unmount();
        expect(bannerShown()).toBe(false);
    });

    it("does not appear when the reader leaves just as it is being shown", async () => {
        const { page } = openArticle(french);
        // Past the banner's own delay, inside the notification store's.
        await vi.advanceTimersByTimeAsync(850);
        page.unmount();
        await vi.advanceTimersByTimeAsync(500);
        expect(bannerShown()).toBe(false);
    });

    it("stays gone when the translations reload while the old article is still showing", async () => {
        const { fetched, translations } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        // Following the link: the new page's queries answer one at a time.
        translations.value = [english, french];
        await vi.advanceTimersByTimeAsync(200);
        fetched.value = english;
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });

    it("stays when the reader picks a third language that has no translation", async () => {
        const { switcher } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        switcher.selectedLanguageId.value = "lang-swa";
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(true);
    });

    it("goes when the reader makes the article's language their own", async () => {
        const { preferredLanguageId } = openArticle(french);
        await vi.advanceTimersByTimeAsync(1000);
        preferredLanguageId.value = "lang-fra";
        await vi.advanceTimersByTimeAsync(1000);
        expect(bannerShown()).toBe(false);
    });
});
