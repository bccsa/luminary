import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import ArticleOutline from "../ArticleOutline.vue";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

// jsdom has no layout: a title with a client rect that sits above the container top counts
// as scrolled out, so the pill (dropdown or title fallback) is shown.
function makeTitleEl(scrolledOut: boolean) {
    const el = document.createElement("div");
    el.getClientRects = () => [{}] as unknown as DOMRectList;
    el.getBoundingClientRect = () => ({ bottom: scrolledOut ? -10 : 40, top: 0 }) as DOMRect;
    return el;
}

function makeRoot(headingTexts: string[], scrolledPast = false) {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({ top: 0, bottom: scrolledPast ? -10 : 1000 }) as DOMRect;
    for (const text of headingTexts) {
        const h = document.createElement("h2");
        h.textContent = text;
        root.appendChild(h);
    }
    document.body.appendChild(root);
    return root;
}

describe("ArticleOutline", () => {
    beforeEach(() => {
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    async function mountOutline(
        headingTexts: string[],
        scrolledOut: boolean,
        options: {
            articleScrolledPast?: boolean;
            resumable?: boolean;
            offerResume?: boolean;
            chromeScrolled?: ReturnType<typeof ref<boolean>>;
        } = {},
    ) {
        const wrapper = mount(ArticleOutline, {
            props: {
                articleRoot: makeRoot(headingTexts, options.articleScrolledPast),
                scrollContainer: window,
                contentId: "c1",
                title: "The Long Walk",
                progress: 17,
                savedProgress: 42,
                resumable: options.resumable,
                offerResume: options.offerResume,
                titleEls: [makeTitleEl(scrolledOut)],
            },
            global: {
                provide: options.chromeScrolled
                    ? { topChromeScrolled: options.chromeScrolled }
                    : {},
            },
        });
        await nextTick();
        await nextTick();
        return wrapper;
    }

    it("stays hidden while the title is still in view", async () => {
        const wrapper = await mountOutline(["Chapter one"], false);
        expect(wrapper.find('[data-test="articleOutline"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineTitle"]').exists()).toBe(false);
    });

    it("shows the chapter dropdown once the title has scrolled out", async () => {
        const wrapper = await mountOutline(["Chapter one", "Chapter two"], true);
        // jsdom gives every heading the same (zero) position, so the last one reads as
        // active; only the pill's presence and the option list are meaningful here.
        expect(wrapper.find('[data-test="articleOutlineTrigger"]').text()).toMatch(/Chapter/);
        expect(wrapper.findAll('[data-test="articleOutlineOption"]')).toHaveLength(2);
        expect(wrapper.find('[data-test="articleOutlineResumeOption"]').exists()).toBe(false);
    });

    it("draws the scroll position as a track on the chapter pill", async () => {
        const wrapper = await mountOutline(["Chapter one"], true);
        expect(
            wrapper.find('[data-test="articleOutlineProgress"] > span').attributes("style"),
        ).toContain("width: 17%");
    });

    it("draws the saved reading progress on the resume offer", async () => {
        const wrapper = await mountOutline(["Chapter one"], false, {
            resumable: true,
            offerResume: true,
        });
        expect(
            wrapper.find('[data-test="articleOutlineProgress"] > span').attributes("style"),
        ).toContain("width: 42%");
    });

    it("steps aside once the whole article body has scrolled past", async () => {
        const wrapper = await mountOutline(["Chapter one"], true, { articleScrolledPast: true });
        expect(wrapper.find('[data-test="articleOutline"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineTitle"]').exists()).toBe(false);
    });

    it("falls back to the article title when there are no headings", async () => {
        const wrapper = await mountOutline([], true);
        expect(wrapper.find('[data-test="articleOutline"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineTitle"]').text()).toBe("The Long Walk");
    });

    it("offers to resume before any scrolling and emits resume / dismiss", async () => {
        const wrapper = await mountOutline(["Chapter one"], false, {
            resumable: true,
            offerResume: true,
        });
        const resume = wrapper.find('[data-test="articleOutlineResume"]');
        expect(resume.exists()).toBe(true);
        expect(resume.text()).toContain("content.continueReading.action");
        expect(resume.text()).toContain("42%");
        expect(wrapper.find('[data-test="articleOutline"]').exists()).toBe(false);

        await wrapper.find('[data-test="articleOutlineResumeButton"]').trigger("click");
        expect(wrapper.emitted("resume")).toHaveLength(1);

        await wrapper.find('[data-test="articleOutlineDismiss"]').trigger("click");
        expect(wrapper.emitted("dismiss")).toHaveLength(1);
    });

    it("dismisses the resume offer once the reader scrolls into the article", async () => {
        const chromeScrolled = ref(false);
        const wrapper = await mountOutline(["Chapter one"], false, {
            resumable: true,
            offerResume: true,
            chromeScrolled,
        });
        expect(wrapper.emitted("dismiss")).toBeUndefined();
        chromeScrolled.value = true;
        await nextTick();
        expect(wrapper.emitted("dismiss")).toHaveLength(1);
    });

    it("keeps a continue entry in the chapter list while the read is unfinished", async () => {
        const wrapper = await mountOutline(["Chapter one"], true, { resumable: true });
        const row = wrapper.find('[data-test="articleOutlineResumeOption"]');
        expect(row.text()).toContain("content.continueReading.action");
        await row.trigger("click");
        expect(wrapper.emitted("resume")).toHaveLength(1);
    });

    it("treats a 99%+ read as finished: no offer, no continue entry", async () => {
        const wrapper = await mountOutline(["Chapter one"], true, {
            resumable: true,
            offerResume: true,
        });
        await wrapper.setProps({ savedProgress: 99, progress: 10 });
        expect(wrapper.find('[data-test="articleOutlineResume"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineResumeOption"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineTrigger"]').exists()).toBe(true);
    });

    it("keeps the continue entry even after scrolling past the saved position", async () => {
        const wrapper = await mountOutline(["Chapter one"], true, { resumable: true });
        await wrapper.setProps({ progress: 90 });
        expect(wrapper.find('[data-test="articleOutlineResumeOption"]').exists()).toBe(true);
    });
});
