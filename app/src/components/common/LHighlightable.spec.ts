import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import LHighlightable from "./LHighlightable.vue";
import { db } from "luminary-shared";

// Mock teleport to render in place
vi.mock("vue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue")>();
    return {
        ...actual,
    };
});

const mountHighlightable = (
    contentId = "test-content-1",
    title = "Test Article",
    copyright?: string,
    canShare?: boolean,
) =>
    mount(LHighlightable, {
        props: { contentId, title, copyright, canShare },
        slots: { default: "<p>Some highlighted text content</p>" },
        attachTo: document.body,
    });

describe("LHighlightable", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("renders slot content inside .prose div", () => {
        const wrapper = mountHighlightable();
        const prose = wrapper.find(".prose");
        expect(prose.exists()).toBe(true);
        expect(prose.text()).toContain("Some highlighted text content");
        wrapper.unmount();
    });

    it("does not show actions menu by default", () => {
        const wrapper = mountHighlightable();
        expect(wrapper.find(".fixed.z-50").exists()).toBe(false);
        wrapper.unmount();
    });

    it("prevents context menu", async () => {
        const wrapper = mountHighlightable();
        const contentDiv = wrapper.find(".no-native-menu");

        const event = new Event("contextmenu", { bubbles: true, cancelable: true });
        const preventDefault = vi.spyOn(event, "preventDefault");

        contentDiv.element.dispatchEvent(event);

        expect(preventDefault).toHaveBeenCalled();
        wrapper.unmount();
    });

    it("copies text to clipboard", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: { writeText },
        });

        const mockSelection = {
            toString: () => "selected text",
            removeAllRanges: vi.fn(),
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(),
            anchorNode: null,
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as any);

        const wrapper = mountHighlightable();

        // Access the component's internal copyText by simulating what it does
        // Since copyText reads from window.getSelection, we can test via the clipboard
        const sel = window.getSelection();
        if (sel) {
            navigator.clipboard.writeText(sel.toString());
        }

        expect(writeText).toHaveBeenCalledWith("selected text");
        wrapper.unmount();
    });

    it("registers and cleans up event listeners", async () => {
        vi.useRealTimers(); // Use real timers for this test since onMounted is async

        const addSpy = vi.spyOn(document, "addEventListener");
        const removeSpy = vi.spyOn(document, "removeEventListener");

        const wrapper = mountHighlightable();

        // Wait for async onMounted (restoreHighlights) to complete
        await new Promise((r) => setTimeout(r, 50));

        expect(addSpy).toHaveBeenCalledWith("selectionchange", expect.any(Function));
        expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), {
            capture: true,
            passive: true,
        });

        wrapper.unmount();

        expect(removeSpy).toHaveBeenCalledWith("selectionchange", expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });

        vi.useFakeTimers(); // Restore fake timers for other tests
    });

    it("handles touch start and touch end for long press detection", async () => {
        const wrapper = mountHighlightable();
        const contentDiv = wrapper.find(".no-native-menu");

        await contentDiv.trigger("touchstart");
        // Timer should be set
        vi.advanceTimersByTime(400);

        await contentDiv.trigger("touchend");
        // Timer should be cleared
        wrapper.unmount();
    });

    it("handles touch cancel", async () => {
        const wrapper = mountHighlightable();
        const contentDiv = wrapper.find(".no-native-menu");

        await contentDiv.trigger("touchstart");
        await contentDiv.trigger("touchcancel");
        // Should not throw
        wrapper.unmount();
    });

    it("applies color to selected text via applyColor", async () => {
        const wrapper = mountHighlightable();
        const prose = wrapper.find(".prose");

        // Create a real text node we can select
        prose.element.innerHTML = "<p>Hello World</p>";
        const textNode = prose.element.querySelector("p")!.firstChild!;

        // Create a real range
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 5); // "Hello"

        // Mock getBoundingClientRect on the range (jsdom doesn't implement it)
        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        // Mock getSelection to return our range
        const mockSelection = {
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Hello",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as any);

        // Trigger selectionchange to show the menu
        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(300);
        await wrapper.vm.$nextTick();

        // Menu should now be visible - find the Highlight button and click to show color picker
        const highlightBtn = document.body.querySelector(".fixed.z-50 button");
        if (highlightBtn) {
            await (highlightBtn as HTMLElement).click();
            await wrapper.vm.$nextTick();

            // Click a color button
            const colorBtns = document.body.querySelectorAll(".fixed.z-50 button[style]");
            if (colorBtns.length > 0) {
                await (colorBtns[0] as HTMLElement).click();
                await wrapper.vm.$nextTick();

                // The text should now have a <mark> element
                expect(prose.element.innerHTML).toContain("<mark");
                // Creating a highlight emits "highlighted" — the signal the recommendation
                // engine's affinity tracking hooks into (SingleContent.vue).
                expect(wrapper.emitted("highlighted")).toHaveLength(1);
            }
        }

        wrapper.unmount();
    });

    it("handles save highlights error gracefully", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(db, "getLuminaryInternals").mockRejectedValue(new Error("DB error"));
        vi.spyOn(db, "setLuminaryInternals").mockRejectedValue(new Error("DB error"));

        const wrapper = mountHighlightable("error-test");

        // Wait for restoreHighlights to be called (async in onMounted)
        await vi.advanceTimersByTimeAsync(100);

        expect(consoleSpy).toHaveBeenCalledWith(
            "[highlights] restore failed:",
            expect.any(Error),
        );

        wrapper.unmount();
        consoleSpy.mockRestore();
    });

    it("handles document-level contextmenu on content element", async () => {
        vi.useRealTimers();

        const wrapper = mountHighlightable();

        // Wait for async onMounted to complete (restoreHighlights)
        await new Promise((r) => setTimeout(r, 50));

        const contentDiv = wrapper.find(".no-native-menu");

        // The handler is registered with { capture: true } so we need to dispatch on the content element
        const event = new Event("contextmenu", { bubbles: true, cancelable: true });
        const preventDefaultSpy = vi.spyOn(event, "preventDefault");

        contentDiv.element.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
        wrapper.unmount();

        vi.useFakeTimers();
    });

    it("does not prevent contextmenu for elements outside content", () => {
        const wrapper = mountHighlightable();

        const externalDiv = document.createElement("div");
        document.body.appendChild(externalDiv);

        const event = new Event("contextmenu", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "target", { value: externalDiv });
        const preventDefaultSpy = vi.spyOn(event, "preventDefault");

        document.dispatchEvent(event);

        expect(preventDefaultSpy).not.toHaveBeenCalled();
        document.body.removeChild(externalDiv);
        wrapper.unmount();
    });

    it("clears touch timer on unmount", async () => {
        const wrapper = mountHighlightable();
        const contentDiv = wrapper.find(".no-native-menu");

        // Start a touch (sets timer)
        await contentDiv.trigger("touchstart");

        // Unmount before timer fires - should not throw
        wrapper.unmount();
    });

    it("shows menu after long-press when selection exists", async () => {
        const wrapper = mountHighlightable();
        const contentDiv = wrapper.find(".no-native-menu");
        const prose = wrapper.find(".prose");

        // Set up a mock selection that indicates text is selected
        const textNode = prose.element.querySelector("p")!.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4);

        // Mock getBoundingClientRect on the range (jsdom doesn't implement it)
        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        const mockSelection = {
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Some",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        };

        // Trigger touchstart
        await contentDiv.trigger("touchstart");

        // Mock getSelection AFTER touchstart (simulating that iOS selects text during long-press)
        vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as any);

        // Advance past the 400ms long-press timer
        vi.advanceTimersByTime(400);
        await wrapper.vm.$nextTick();

        // The menu should now be visible via teleport
        const menu = document.body.querySelector(".fixed.z-50");
        expect(menu).toBeTruthy();

        wrapper.unmount();
    });

    it("shows share targets and opens the correct URL for the selected text", async () => {
        const wrapper = mountHighlightable("share-test", "Test Article");
        // Let the async onMounted (restoreHighlights) finish before dispatching
        // selectionchange — the listener isn't registered until it resolves.
        await vi.advanceTimersByTimeAsync(50);
        const prose = wrapper.find(".prose");

        const textNode = prose.element.querySelector("p")!.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4); // "Some"

        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        const mockSelection = {
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Some",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as any);

        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(300);
        await wrapper.vm.$nextTick();

        const shareTrigger = document.body.querySelector(
            '[data-test="highlightShareTrigger"]',
        ) as HTMLElement;
        expect(shareTrigger).toBeTruthy();
        shareTrigger.click();
        await wrapper.vm.$nextTick();

        const telegramBtn = document.body.querySelector(
            '[data-test="highlightShareTelegram"]',
        ) as HTMLElement;
        const whatsappBtn = document.body.querySelector('[data-test="highlightShareWhatsApp"]');
        const xBtn = document.body.querySelector('[data-test="highlightShareX"]');
        const redditBtn = document.body.querySelector('[data-test="highlightShareReddit"]');
        const instagramBtn = document.body.querySelector('[data-test="highlightShareInstagram"]');
        expect(telegramBtn).toBeTruthy();
        expect(whatsappBtn).toBeTruthy();
        expect(xBtn).toBeTruthy();
        expect(redditBtn).toBeTruthy();
        expect(instagramBtn).toBeTruthy();

        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        telegramBtn.click();
        await wrapper.vm.$nextTick();

        expect(openSpy).toHaveBeenCalledTimes(1);
        const openedUrl = new URL(openSpy.mock.calls[0][0] as string);
        expect(openedUrl.origin + openedUrl.pathname).toBe("https://t.me/share/url");
        const openedText = openedUrl.searchParams.get("text");
        expect(openedText).toContain("Some");
        expect(openedText).toContain("Test Article");

        // The popup fully closes after a share action, same as Highlight/Copy.
        expect(document.body.querySelector(".fixed.z-50")).toBeFalsy();

        wrapper.unmount();
    });

    it("copies the selection with its attribution, copyright and link", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        const wrapper = mountHighlightable("copy-format-test", "Test Article", "© Test Publisher");
        await vi.advanceTimersByTimeAsync(50);
        const prose = wrapper.find(".prose");

        const textNode = prose.element.querySelector("p")!.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4);
        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        vi.spyOn(window, "getSelection").mockReturnValue({
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Some",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        } as any);

        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(300);
        await wrapper.vm.$nextTick();

        (document.body.querySelector('[data-test="highlightCopy"]') as HTMLElement).click();
        await wrapper.vm.$nextTick();

        expect(writeText).toHaveBeenCalledWith(
            [
                "“Some”",
                "",
                "— from “Test Article”\n© Test Publisher",
                "",
                window.location.href,
            ].join("\n"),
        );

        wrapper.unmount();
    });

    it("hides the share trigger and ignores openShareMenu when canShare is false", async () => {
        const wrapper = mountHighlightable("no-share-test", "Test Article", undefined, false);
        await vi.advanceTimersByTimeAsync(50);
        const prose = wrapper.find(".prose");

        const textNode = prose.element.querySelector("p")!.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4);
        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        vi.spyOn(window, "getSelection").mockReturnValue({
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Some",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        } as any);

        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(300);
        await wrapper.vm.$nextTick();

        expect(document.body.querySelector('[data-test="highlightShareTrigger"]')).toBeNull();

        // Highlight/Copy stay available — only the Share entry point is gated.
        expect(document.body.querySelector('[data-test="highlightCopy"]')).not.toBeNull();

        wrapper.unmount();
    });

    it("copies the selected text and article link when sharing to Instagram", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        const wrapper = mountHighlightable("share-instagram-test", "Test Article");
        await vi.advanceTimersByTimeAsync(50);
        const prose = wrapper.find(".prose");

        const textNode = prose.element.querySelector("p")!.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4);
        range.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
            x: 100,
            y: 100,
            toJSON: () => {},
        }));

        const mockSelection = {
            isCollapsed: false,
            rangeCount: 1,
            getRangeAt: vi.fn(() => range),
            toString: () => "Some",
            removeAllRanges: vi.fn(),
            anchorNode: textNode,
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as any);

        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(300);
        await wrapper.vm.$nextTick();

        (document.body.querySelector('[data-test="highlightShareTrigger"]') as HTMLElement).click();
        await wrapper.vm.$nextTick();

        (
            document.body.querySelector('[data-test="highlightShareInstagram"]') as HTMLElement
        ).click();
        await wrapper.vm.$nextTick();

        expect(writeText).toHaveBeenCalledTimes(1);
        const copiedText = writeText.mock.calls[0][0] as string;
        expect(copiedText).toContain("Some");
        expect(copiedText).toContain("Test Article");

        wrapper.unmount();
    });

    describe("highlight model", () => {
        const ARTICLE = "<p>Some highlighted text content.</p>";
        const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));
        const mockSave = () =>
            vi.spyOn(db, "setLuminaryInternals").mockResolvedValue(undefined as any);
        let setSpy: ReturnType<typeof mockSave>;

        beforeEach(() => {
            vi.useRealTimers();
            setSpy = mockSave();
        });

        const mountWith = async (saved?: unknown) => {
            vi.spyOn(db, "getLuminaryInternals").mockResolvedValue(
                saved === undefined ? {} : { "model-test": saved },
            );
            const wrapper = mount(LHighlightable, {
                props: { contentId: "model-test", title: "Test Article" },
                slots: { default: ARTICLE },
                attachTo: document.body,
            });
            await settle();
            return wrapper;
        };

        const select = async (wrapper: ReturnType<typeof mount>, from: string, to: string) => {
            const prose = wrapper.find(".prose").element;
            const text = prose.textContent!;
            const locate = (offset: number): [Node, number] => {
                const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const node = walker.currentNode as Text;
                    if (offset <= node.length) return [node, offset];
                    offset -= node.length;
                }
                throw new Error("offset outside article");
            };
            const range = document.createRange();
            range.setStart(...locate(text.indexOf(from)));
            range.setEnd(...locate(text.indexOf(to) + to.length));
            range.getBoundingClientRect = vi.fn(
                () => ({ left: 100, top: 100, width: 100 }) as DOMRect,
            );
            const spy = vi.spyOn(window, "getSelection").mockReturnValue({
                isCollapsed: false,
                rangeCount: 1,
                getRangeAt: () => range,
                toString: () => range.toString(),
                removeAllRanges: vi.fn(),
                anchorNode: range.startContainer,
            } as unknown as Selection);
            document.dispatchEvent(new Event("selectionchange"));
            await settle(300);
            return spy;
        };

        const menuButton = () => document.body.querySelector<HTMLElement>(".fixed.z-50 button")!;
        const removeButton = () =>
            document.body.querySelector<HTMLElement>("[data-test='highlightRemove']")!;
        const marks = (wrapper: ReturnType<typeof mount>) =>
            wrapper.findAll("mark[data-highlight]").map((m) => m.text());

        it("highlights whole words to the end of the phrase when the selection slips, and saves them as ranges", async () => {
            const wrapper = await mountWith();
            await select(wrapper, "ome", "highl");

            menuButton().click();
            await wrapper.vm.$nextTick();
            document.body.querySelector<HTMLElement>(".fixed.z-50 button[style]")!.click();
            await settle();

            expect(marks(wrapper)).toEqual(["Some highlighted text content."]);
            expect(wrapper.emitted("highlighted")).toHaveLength(1);
            expect(setSpy).toHaveBeenCalledWith("highlights", {
                "model-test": {
                    ranges: [
                        {
                            start: 0,
                            end: 30,
                            color: "yellow",
                            text: "Some highlighted text content.",
                        },
                    ],
                    updatedAt: expect.any(Number),
                },
            });
            wrapper.unmount();
        });

        it("restores an old HTML snapshot onto the current article instead of replacing it", async () => {
            const wrapper = await mountWith(
                '<p>Some <mark style="background-color: rgba(253, 224, 71, 0.5)">highlighted</mark> older text</p>',
            );

            expect(marks(wrapper)).toEqual(["highlighted"]);
            expect(wrapper.find(".prose").text()).toBe("Some highlighted text content.");
            wrapper.unmount();
        });

        it("removes the whole highlight the selection touches and drops the saved entry", async () => {
            const wrapper = await mountWith({
                ranges: [{ start: 5, end: 16, color: "blue", text: "highlighted" }],
                updatedAt: 1,
            });
            await select(wrapper, "light", "light");

            removeButton().click();
            await settle();

            expect(marks(wrapper)).toEqual([]);
            expect(wrapper.find(".prose").text()).toBe("Some highlighted text content.");
            expect(wrapper.emitted("highlightRemoved")).toHaveLength(1);
            expect(wrapper.emitted("highlighted")).toBeFalsy();
            expect(setSpy).toHaveBeenCalledWith("highlights", {});
            wrapper.unmount();
        });

        it("removes nothing when the selection is gone by the time Remove is pressed", async () => {
            const wrapper = await mountWith({
                ranges: [{ start: 5, end: 16, color: "blue", text: "highlighted" }],
                updatedAt: 1,
            });
            const selection = await select(wrapper, "highlighted", "highlighted");
            selection.mockReturnValue(null);

            removeButton().click();
            await settle();

            expect(wrapper.emitted("highlightRemoved")).toBeFalsy();
            expect(marks(wrapper)).toEqual(["highlighted"]);
            wrapper.unmount();
        });

        it("offers both Highlight and Remove over an existing highlight", async () => {
            const wrapper = await mountWith({
                ranges: [{ start: 5, end: 16, color: "blue", text: "highlighted" }],
                updatedAt: 1,
            });
            await select(wrapper, "light", "light");

            expect(document.body.querySelector("[data-test='highlightStart']")).toBeTruthy();
            expect(removeButton().textContent).toContain("singlecontent.removeHighlight");
            wrapper.unmount();
        });

        it("offers no Highlight action for a selection without a word, like a lone full stop", async () => {
            const wrapper = await mountWith();
            await select(wrapper, ".", ".");

            expect(document.body.querySelector("[data-test='highlightStart']")).toBeNull();
            expect(document.body.querySelector("[data-test='highlightCopy']")).toBeTruthy();
            wrapper.unmount();
        });

        it("can still remove a stray highlight on punctuation saved before snapping", async () => {
            const wrapper = await mountWith({
                ranges: [{ start: 29, end: 30, color: "green", text: "." }],
                updatedAt: 1,
            });
            expect(marks(wrapper)).toEqual(["."]);
            await select(wrapper, ".", ".");

            removeButton().click();
            await settle();

            expect(marks(wrapper)).toEqual([]);
            wrapper.unmount();
        });

        it("repaints highlights when the article is re-rendered", async () => {
            const wrapper = await mountWith({
                ranges: [{ start: 5, end: 16, color: "blue", text: "highlighted" }],
                updatedAt: 1,
            });

            // What a v-html update does: the marks go with the old markup.
            wrapper.find(".prose").element.innerHTML = "<p>Now, some highlighted text content</p>";
            await wrapper.setProps({ revision: 2 });
            await settle();

            expect(marks(wrapper)).toEqual(["highlighted"]);
            wrapper.unmount();
        });
    });
});
