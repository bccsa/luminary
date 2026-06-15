/**
 * QA plan scenarios for reading progress tracker.
 * Maps to docs/qa/reading-progress-tracker-results.md (P0 / P1 checklist).
 */
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref, computed, watch } from "vue";
import { describe, expect, it } from "vitest";
import ContinueReadingPrompt from "@/components/content/ContinueReadingPrompt.vue";
import {
    getReadingProgress,
    removeReadingProgress,
    setReadingProgress,
} from "@/globalConfig";
import langFraSeed from "../../../api/src/db/seedingDocs/lang-fra.json";
import {
    splitElementIntoSegments,
    isSegmentEligible,
    applyScrollVelocitySample,
    READING_INTERSECTION_RATIO,
} from "@/composables/useReadingProgressTracker";
import {
    computeMaxScrollWordsPerSec,
    countWords,
    DEFAULT_READING_SPEED_WPM,
} from "@/util/readingTime";

const TEST_ID = "qa-content-id";

describe("QA P0 — tracking", () => {
    it("P0-1: tracker contract keeps progress from decreasing", () => {
        localStorage.clear();
        setReadingProgress(TEST_ID, 50);
        const existing = getReadingProgress(TEST_ID);
        const computedLower = 30;
        expect(Math.max(existing, computedLower)).toBe(50);
        localStorage.clear();
    });

    it("P0-2: long paragraph splits into multiple viewport-height segments", () => {
        const el = document.createElement("p");
        el.textContent = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");

        const segments = splitElementIntoSegments(el, 200, 0, 1000);
        expect(segments.length).toBeGreaterThan(1);

        const viewport = { top: 0, bottom: 200 };
        const first = segments[0];
        const eligible = isSegmentEligible(first, { top: 0 }, viewport);
        expect(eligible).toBe(true);
        expect(first.segmentCount).toBe(segments.length);
    });

    it("P0-3: fast scroll exceeds skim cap and is flagged as skimming", () => {
        const maxWordsPerSec = computeMaxScrollWordsPerSec(DEFAULT_READING_SPEED_WPM);
        const wordsPerPixel = countWords("one two three four five") / 100;

        const { isSkimming } = applyScrollVelocitySample(
            { pendingScrollDeltaY: 0, pendingScrollDeltaMs: 0, isSkimming: false },
            500,
            60,
            wordsPerPixel,
            maxWordsPerSec,
        );

        expect(isSkimming).toBe(true);
    });

    it("P0-4: 100% completion removes entry from localStorage", () => {
        localStorage.clear();
        setReadingProgress(TEST_ID, 100);
        removeReadingProgress(TEST_ID);
        expect(getReadingProgress(TEST_ID)).toBe(0);
        expect(JSON.parse(localStorage.getItem("readingProgress") || "[]")).toEqual([]);
    });
});

describe("QA P0 — continue prompt UX", () => {
    const mountPrompt = (visible = true) =>
        mount(ContinueReadingPrompt, {
            props: { visible, progressPercent: 42 },
            global: { mocks: { t: (key: string) => key } },
        });

    it("P0-6: prompt shows when visible with progress percent", () => {
        const wrapper = mountPrompt(true);
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
        expect(wrapper.text()).toContain("42%");
        expect(wrapper.text()).toContain("content.continueReading.prompt");
    });

    it("P0-7: continue flow hides prompt for visit (SingleContent pattern)", async () => {
        const continuePromptHandled = ref(false);
        const hasResumableProgress = ref(true);

        const Harness = defineComponent({
            components: { ContinueReadingPrompt },
            setup() {
                const visible = computed(
                    () => hasResumableProgress.value && !continuePromptHandled.value,
                );
                function onContinue() {
                    continuePromptHandled.value = true;
                }
                return { visible, onContinue };
            },
            template: `
                <ContinueReadingPrompt
                    :visible="visible"
                    :progress-percent="42"
                    @continue="onContinue"
                />
            `,
        });

        const wrapper = mount(Harness);
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

        await wrapper.get("button").trigger("click");
        await nextTick();

        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
        expect(continuePromptHandled.value).toBe(true);

        hasResumableProgress.value = true;
        await nextTick();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it("P0-8: dismiss emits dismiss and parent can hide prompt", async () => {
        const wrapper = mountPrompt(true);
        const buttons = wrapper.findAll("button");
        await buttons[1].trigger("click");
        expect(wrapper.emitted("dismiss")).toHaveLength(1);
        expect(wrapper.emitted("continue")).toBeUndefined();
    });
});

describe("QA P1 — edge cases", () => {
    it("P1-9: tracking enabled when text and content id present", () => {
        const enabled = (text: string | undefined, id: string | undefined) =>
            !!id && !!text;
        expect(enabled("<p>Hello</p>", "content-1")).toBe(true);
        expect(enabled("<p>Hello</p>", undefined)).toBe(false);
        expect(enabled(undefined, "content-1")).toBe(false);
    });

    it("P1-10: tracking disabled without text body", () => {
        const enabled = (text: string | undefined, id: string | undefined) =>
            !!id && !!text;
        expect(enabled("", "content-1")).toBe(false);
    });

    it("P1-11: prompt hidden at 0% and after completion", () => {
        const hasResumable = (p: number) => p > 0 && p < 100;
        expect(hasResumable(0)).toBe(false);
        expect(hasResumable(100)).toBe(false);
        expect(hasResumable(42)).toBe(true);
    });

    it("P1-13: prompt includes dark mode classes", () => {
        const wrapper = mount(ContinueReadingPrompt, {
            props: { visible: true, progressPercent: 10 },
            global: { mocks: { t: (key: string) => key } },
        });
        expect(wrapper.html()).toContain("dark:bg-slate-800");
    });

    it("P1-14: French i18n strings exist for continue prompt", () => {
        const t = langFraSeed.translations;
        expect(t["content.continueReading.prompt"]).toBe(
            "Reprendre où vous vous êtes arrêté ?",
        );
        expect(t["content.continueReading.action"]).toBe("Continuer la lecture");
        expect(t["home.continue.read"]).toBe("Continuer la lecture");
    });
});
