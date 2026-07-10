import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import LanguageModal from "./LanguageModal.vue";
import { db, isConnected } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { appLanguageIdsAsRef, appSyncedLanguageIdsAsRef, initLanguage } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { createI18n } from "vue-i18n";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

const i18n = createI18n({
    locale: "en",
    messages: {
        en: {
            "language.modal.title": "Select Language",
            "language.modal.save": "Save",
            "language.modal.cancel": "Cancel",
            "language.modal.availableOffline": "Available offline",
            "language.modal.reorder": "Drag to reorder",
            "language.modal.remove": "Remove language",
            "language.modal.offlineCaption": "Downloaded languages are available offline.",
            "language.modal.primaryAlwaysOffline": "Your main language is always available offline",
            "language.modal.offline.add.title": "You're offline",
            "language.modal.offline.add.description": "New languages will download once online.",
            "language.modal.offline.clear.title": "You're offline",
            "language.modal.offline.clear.description": "Reconnect to remove or stop downloading.",
        },
    },
});

const mountModal = () =>
    mount(LanguageModal, { props: { isVisible: true }, global: { plugins: [i18n] } });

// jsdom reports every rect as 0×0, so the drag maths (which derives the row pitch from the first
// two rows' tops) would no-op. Give the rows a synthetic 48px pitch based on their sibling index.
const ROW_HEIGHT = 48;
const stubRowLayout = () =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
    ) {
        const index = this.parentElement
            ? Array.prototype.indexOf.call(this.parentElement.children, this)
            : 0;
        const top = index * ROW_HEIGHT;
        return { top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT } as DOMRect;
    });

const rowIds = (wrapper: ReturnType<typeof mountModal>) =>
    wrapper.findAll("[data-lang-row]").map((row) => row.attributes("id"));

const addButtonFor = async (wrapper: ReturnType<typeof mountModal>, name: string) => {
    await waitForExpect(async () => {
        expect((await wrapper.findAll('[data-test="add-language-button"]')).length).toBeGreaterThan(
            0,
        );
    });
    return (await wrapper.findAll('[data-test="add-language-button"]')).find((el) =>
        el.text().includes(name),
    );
};

describe("LanguageModal.vue", () => {
    beforeAll(async () => {
        initLanguage();
    });

    let notify: ReturnType<typeof useNotificationStore>;

    beforeEach(async () => {
        setActivePinia(createTestingPinia({ createSpy: vi.fn }));
        notify = useNotificationStore(); // addNotification is an auto-spy under testing pinia
        isConnected.value = true; // online by default
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];
        appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id];
    });

    afterEach(async () => {
        isConnected.value = true;
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders when visible and not when hidden", async () => {
        expect(mountModal().find("h2").text()).toBe("Select Language");
        const hidden = mount(LanguageModal, {
            props: { isVisible: false },
            global: { plugins: [i18n] },
        });
        expect(hidden.find("h2").exists()).toBe(false);
    });

    it("blocks adding beyond the preferred-language cap (hides the add list at the cap)", async () => {
        // Seed a 4th language so there IS one available to add.
        const german = {
            ...mockLanguageDtoEng,
            _id: "lang-deu",
            languageCode: "deu",
            name: "German",
            default: 0,
        };
        await db.docs.bulkPut([german]);
        // Preferred already at the cap of 3.
        appLanguageIdsAsRef.value = [
            mockLanguageDtoEng._id,
            mockLanguageDtoFra._id,
            mockLanguageDtoSwa._id,
        ];

        const wrapper = mountModal();
        await waitForExpect(() => {
            expect(wrapper.find('[data-test="save-languages"]').exists()).toBe(true);
        });

        // At the cap the "add language" list is hidden, so the 4th language cannot be added.
        expect((await wrapper.findAll('[data-test="add-language-button"]')).length).toBe(0);
    });

    it("stages edits — adding a language does NOT touch the live ref until Save", async () => {
        const wrapper = mountModal();
        const frBtn = await addButtonFor(wrapper, mockLanguageDtoFra.name);
        await frBtn!.trigger("click");

        // staged only — committed refs untouched
        expect(appLanguageIdsAsRef.value).toEqual([mockLanguageDtoEng._id]);

        await wrapper.find('[data-test="save-languages"]').trigger("click");
        expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
        expect(wrapper.emitted()).toHaveProperty("close");
    });

    it("Cancel discards staged edits and emits close", async () => {
        const wrapper = mountModal();
        const frBtn = await addButtonFor(wrapper, mockLanguageDtoFra.name);
        await frBtn!.trigger("click");

        await wrapper.find('[data-test="cancel-languages"]').trigger("click");
        expect(appLanguageIdsAsRef.value).toEqual([mockLanguageDtoEng._id]); // unchanged
        expect(wrapper.emitted()).toHaveProperty("close");
    });

    it("the primary language's offline checkbox is checked and disabled", async () => {
        const wrapper = mountModal();
        await waitForExpect(async () => {
            expect(
                (await wrapper.findAll('[data-test="offline-checkbox"]')).length,
            ).toBeGreaterThan(0);
        });
        const primary = wrapper.find('[data-test="offline-checkbox"]').element as HTMLInputElement;
        expect(primary.checked).toBe(true);
        expect(primary.disabled).toBe(true);
    });

    it("shows the primary's offline checkbox as ticked, and reverts when demoted", async () => {
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
        appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id]; // French NOT ticked

        const wrapper = mountModal();
        await waitForExpect(async () => {
            expect((await wrapper.findAll('[data-test="offline-checkbox"]')).length).toBe(2);
        });

        // French (second row) starts un-ticked.
        let checkboxes = await wrapper.findAll('[data-test="offline-checkbox"]');
        expect((checkboxes[1]!.element as HTMLInputElement).checked).toBe(false);

        // Promote French to primary → its now-disabled checkbox shows ticked (always synced).
        await wrapper.findAll('[data-test="drag-handle"]')[1]!.trigger("keydown", {
            key: "ArrowUp",
        });
        checkboxes = await wrapper.findAll('[data-test="offline-checkbox"]');
        const frenchAsPrimary = checkboxes[0]!.element as HTMLInputElement;
        expect(frenchAsPrimary.checked).toBe(true);
        expect(frenchAsPrimary.disabled).toBe(true);

        // Demote it back → reverts to un-ticked (it was never actually ticked).
        await wrapper.findAll('[data-test="drag-handle"]')[0]!.trigger("keydown", {
            key: "ArrowDown",
        });
        checkboxes = await wrapper.findAll('[data-test="offline-checkbox"]');
        expect((checkboxes[1]!.element as HTMLInputElement).checked).toBe(false);
    });

    describe("drag-to-reorder", () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("dragging a row past its neighbour reorders it, and Save commits the new order", async () => {
            appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

            const wrapper = mountModal();
            await waitForExpect(async () => {
                expect((await wrapper.findAll('[data-test="drag-handle"]')).length).toBe(2);
            });
            stubRowLayout();

            // Grab English (row 0) and drag it a full row's height down. Events are dispatched on
            // the handle itself (not `window`): pointer capture retargets them there in real
            // browsers, and Vue reuses the same DOM node for a keyed row across reorders, so a
            // held reference stays valid even after the row moves.
            const handle = wrapper.findAll('[data-test="drag-handle"]')[0]!;
            await handle.trigger("pointerdown", { clientY: 0 });
            await handle.trigger("pointermove", { clientY: ROW_HEIGHT + 5 });

            expect(rowIds(wrapper)).toEqual([mockLanguageDtoFra._id, mockLanguageDtoEng._id]);

            await handle.trigger("pointerup");
            await wrapper.find('[data-test="save-languages"]').trigger("click");

            expect(appLanguageIdsAsRef.value).toEqual([
                mockLanguageDtoFra._id,
                mockLanguageDtoEng._id,
            ]);
        });

        it("ignores pointer movement after the drag has ended", async () => {
            appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];

            const wrapper = mountModal();
            await waitForExpect(async () => {
                expect((await wrapper.findAll('[data-test="drag-handle"]')).length).toBe(2);
            });
            stubRowLayout();

            const handle = wrapper.findAll('[data-test="drag-handle"]')[0]!;
            await handle.trigger("pointerdown", { clientY: 0 });
            await handle.trigger("pointerup");
            await handle.trigger("pointermove", { clientY: ROW_HEIGHT + 5 });

            expect(rowIds(wrapper)).toEqual([mockLanguageDtoEng._id, mockLanguageDtoFra._id]);
        });
    });

    it("ticking a non-primary language commits it to the synced set on Save", async () => {
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
        appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        const wrapper = mountModal();
        await waitForExpect(async () => {
            expect((await wrapper.findAll('[data-test="offline-checkbox"]')).length).toBe(2);
        });

        const checkboxes = await wrapper.findAll('[data-test="offline-checkbox"]');
        await checkboxes[1]!.setValue(true); // French (non-primary)

        // staged only until Save
        expect(appSyncedLanguageIdsAsRef.value).toEqual([mockLanguageDtoEng._id]);

        await wrapper.find('[data-test="save-languages"]').trigger("click");
        expect(appSyncedLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
    });

    it("does not allow removing the last preferred language", async () => {
        const wrapper = mountModal();
        await waitForExpect(async () => {
            expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(0);
        });

        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
        appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
        await wrapper.setProps({ isVisible: false });
        await wrapper.setProps({ isVisible: true });

        await waitForExpect(async () => {
            expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(2);
        });

        await (await wrapper.findAll('[data-test="remove-language-button"]'))[1]!.trigger("click");
        expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(0);

        // Last language — no remove button, and Save keeps English selected.
        await wrapper.find('[data-test="save-languages"]').trigger("click");
        expect(appLanguageIdsAsRef.value).toEqual([mockLanguageDtoEng._id]);
    });

    describe("offline behaviour", () => {
        beforeEach(() => {
            isConnected.value = false;
        });

        it("BLOCKS removing a DOWNLOADED language while offline and notifies", async () => {
            // French is in the committed synced set → it has downloaded content.
            appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            const wrapper = mountModal();
            await waitForExpect(async () => {
                expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(
                    2,
                );
            });

            // Remove French (the second row → index 1).
            await (
                await wrapper.findAll('[data-test="remove-language-button"]')
            )[1]!.trigger("click");

            // Still two languages — the removal was blocked — and a toast was raised.
            expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(2);
            expect(notify.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ id: "lang-offline-clear", type: "toast" }),
            );
        });

        it("ALLOWS removing a NON-downloaded language while offline with no toast", async () => {
            // French is preferred but NOT in the synced set → nothing downloaded for it.
            appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id];
            const wrapper = mountModal();
            await waitForExpect(async () => {
                expect((await wrapper.findAll('[data-test="remove-language-button"]')).length).toBe(
                    2,
                );
            });

            await (
                await wrapper.findAll('[data-test="remove-language-button"]')
            )[1]!.trigger("click");
            await wrapper.find('[data-test="save-languages"]').trigger("click");

            // French was removed (no downloaded content to clear) and no "clear" toast fired.
            expect(appLanguageIdsAsRef.value).toEqual([mockLanguageDtoEng._id]);
            expect(notify.addNotification).not.toHaveBeenCalledWith(
                expect.objectContaining({ id: "lang-offline-clear" }),
            );
        });

        it("ALLOWS adding a language while offline but notifies it will apply online", async () => {
            const wrapper = mountModal();
            const frBtn = await addButtonFor(wrapper, mockLanguageDtoFra.name);
            await frBtn!.trigger("click");

            // Added to the draft (one fewer in the available list) and the deferred toast fired.
            await wrapper.find('[data-test="save-languages"]').trigger("click");
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
            expect(notify.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ id: "lang-offline-add", type: "toast" }),
            );
        });

        it("BLOCKS un-ticking a downloaded language while offline and notifies", async () => {
            appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            appSyncedLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
            const wrapper = mountModal();
            await waitForExpect(async () => {
                expect((await wrapper.findAll('[data-test="offline-checkbox"]')).length).toBe(2);
            });

            // Try to un-tick French (non-primary, currently synced).
            await (await wrapper.findAll('[data-test="offline-checkbox"]'))[1]!.setValue(false);
            await wrapper.find('[data-test="save-languages"]').trigger("click");

            // French stays synced (un-tick blocked) and a toast was raised.
            expect(appSyncedLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
            expect(notify.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ id: "lang-offline-clear", type: "toast" }),
            );
        });
    });
});
