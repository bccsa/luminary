import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ArticleOutline from "../ArticleOutline.vue";

// jsdom has no layout: a title with a client rect that sits above the container top counts
// as scrolled out, so the pill (dropdown or title fallback) is shown.
function makeTitleEl(scrolledOut: boolean) {
    const el = document.createElement("div");
    el.getClientRects = () => [{}] as unknown as DOMRectList;
    el.getBoundingClientRect = () => ({ bottom: scrolledOut ? -10 : 40, top: 0 }) as DOMRect;
    return el;
}

function makeRoot(headingTexts: string[]) {
    const root = document.createElement("div");
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

    async function mountOutline(headingTexts: string[], scrolledOut: boolean) {
        const wrapper = mount(ArticleOutline, {
            props: {
                articleRoot: makeRoot(headingTexts),
                scrollContainer: window,
                contentId: "c1",
                title: "The Long Walk",
                titleEls: [makeTitleEl(scrolledOut)],
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
        expect(wrapper.find('[data-test="articleOutlineTrigger"]').text()).toContain("Chapter one");
        expect(wrapper.findAll('[data-test="articleOutlineOption"]')).toHaveLength(2);
    });

    it("falls back to the article title when there are no headings", async () => {
        const wrapper = await mountOutline([], true);
        expect(wrapper.find('[data-test="articleOutline"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="articleOutlineTitle"]').text()).toBe("The Long Walk");
    });
});
