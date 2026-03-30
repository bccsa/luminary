import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { createApp, nextTick } from "vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import express from "express";
import {
    accessMap,
    AckStatus,
    db,
    DocType,
    getRest,
    initConfig,
    isConnected,
    type AuthProviderConfigDto,
    type AuthProviderDto,
    type DefaultPermissionsDto,
} from "luminary-shared";
import { mockGroupDtoSuperAdmins } from "@/tests/mockdata";
import { useAuthProviders } from "./useAuthProviders";
import waitForExpect from "wait-for-expect";
import { CMS_DOCS_INDEX } from "@/docsIndex";

// ============================
// Access map with auth provider permissions
// ============================
const authProviderAdminAccessMap = {
    "group-super-admins": {
        authProvider: { view: true, edit: true, delete: true, assign: true },
        authProviderConfig: { view: true, edit: true, delete: true },
        defaultPermissions: { view: true, edit: true },
        group: { view: true, edit: true, assign: true },
    },
};

// ============================
// Mock data
// ============================
const mockProvider: AuthProviderDto = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-super-admins"],
    label: "Test Provider",
    domain: "test.auth0.com",
    clientId: "client-id-1",
    audience: "https://api.test.com",
};

const mockConfig: AuthProviderConfigDto = {
    _id: "config-1",
    type: DocType.AuthProviderConfig,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-super-admins"],
    providerId: "provider-1",
};

const mockDefaultPermissions: DefaultPermissionsDto = {
    _id: "default-permissions-1",
    type: DocType.DefaultPermissions,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    defaultGroups: ["group-super-admins"],
};

// ============================
// Mock API server
// ============================
const expressApp = express();
expressApp.use(express.json());

const randomPort = () => Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
const port = randomPort();

let providerSearchDocs: AuthProviderDto[] = [];
let configSearchDocs: AuthProviderConfigDto[] = [];

expressApp.get("/search", (req, res) => {
    const query = JSON.parse(req.headers["x-query"] as string);
    res.setHeader("Content-Type", "application/json");
    if (query.types?.includes(DocType.AuthProvider)) {
        res.end(JSON.stringify({ docs: providerSearchDocs }));
    } else if (query.types?.includes(DocType.AuthProviderConfig)) {
        res.end(JSON.stringify({ docs: configSearchDocs }));
    } else {
        res.end(JSON.stringify({ docs: [] }));
    }
});

expressApp.post("/changerequest", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ack: AckStatus.Accepted }));
});

expressApp.listen(port);

// ============================
// withSetup helper
// Wraps the composable in a real Vue app so onBeforeUnmount and other
// lifecycle hooks work correctly. Call teardown() to unmount and clean up.
// ============================
function withSetup<T>(composable: () => T): [T, () => void] {
    let result!: T;
    const vueApp = createApp({
        setup() {
            result = composable();
            return () => {};
        },
    });
    const div = document.createElement("div");
    vueApp.mount(div);
    return [result, () => vueApp.unmount()];
}

// ============================
// Tests
// ============================
describe("useAuthProviders", () => {
    beforeAll(() => {
        initConfig({
            cms: true,
            docsIndex: CMS_DOCS_INDEX,
            apiUrl: `http://localhost:${port}`,
            syncList: [
                { type: DocType.AuthProvider, contentOnly: true, syncPriority: 10 },
                { type: DocType.AuthProviderConfig, contentOnly: true, syncPriority: 20 },
                { type: DocType.Group, contentOnly: true, syncPriority: 30 },
            ],
        });
        getRest({ reset: true });
    });

    beforeEach(async () => {
        accessMap.value = authProviderAdminAccessMap as any;
        setActivePinia(createTestingPinia());
        await db.docs.bulkPut([mockGroupDtoSuperAdmins]);
        isConnected.value = true;
        providerSearchDocs = [mockProvider];
        configSearchDocs = [mockConfig];
    });

    afterEach(async () => {
        vi.useRealTimers();
        await db.docs.clear();
        vi.clearAllMocks();
    });

    // ── Data loading ─────────────────────────────────────────────────────────

    describe("data loading", () => {
        it("loads providers from the API", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                    expect(c.providers.value[0]._id).toBe("provider-1");
                });
            } finally {
                teardown();
            }
        });

        it("starts with isLoadingProviders true and sets it to false after load", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.isLoadingProviders.value).toBe(true);
                await waitForExpect(() => {
                    expect(c.isLoadingProviders.value).toBe(false);
                });
            } finally {
                teardown();
            }
        });

        it("returns empty providers when the API returns none", async () => {
            providerSearchDocs = [];
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.isLoadingProviders.value).toBe(false);
                    expect(c.providers.value).toHaveLength(0);
                });
            } finally {
                teardown();
            }
        });

        it("loads defaultPermissions from Dexie", async () => {
            await db.docs.put(mockDefaultPermissions);
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value?._id).toBe("default-permissions-1");
                    expect(c.defaultPermissions.value?.defaultGroups).toContain("group-super-admins");
                });
            } finally {
                teardown();
            }
        });
    });

    // ── Permission flags ─────────────────────────────────────────────────────

    describe("permission flags", () => {
        it("canEdit is true when user has authProvider Edit permission", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canEdit.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("canDelete is true when user has authProvider Delete permission", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canDelete.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("canEditDefaultPermissions is true when user has defaultPermissions Edit permission", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canEditDefaultPermissions.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("canEdit is false when user has no permissions", () => {
            accessMap.value = {};
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canEdit.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("canDelete is false when user has no permissions", () => {
            accessMap.value = {};
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canDelete.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("canEditDefaultPermissions is false when user has no permissions", () => {
            accessMap.value = {};
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.canEditDefaultPermissions.value).toBe(false);
            } finally {
                teardown();
            }
        });
    });

    // ── openCreateModal ───────────────────────────────────────────────────────

    describe("openCreateModal", () => {
        it("opens the modal with isEditing false", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                expect(c.showModal.value).toBe(true);
                expect(c.isEditing.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("populates currentProvider with empty required fields", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                expect(c.currentProvider.value?.label).toBe("");
                expect(c.currentProvider.value?.domain).toBe("");
                expect(c.currentProvider.value?.clientId).toBe("");
                expect(c.currentProvider.value?.audience).toBe("");
            } finally {
                teardown();
            }
        });

        it("starts with isDirty false", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                expect(c.isDirty.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("resets hasAttemptedSubmit to false", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                expect(c.hasAttemptedSubmit.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("each call generates a fresh provider with a new ID", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                const firstId = c.currentProvider.value?._id;
                c.closeModal();
                c.openCreateModal();
                expect(c.currentProvider.value?._id).not.toBe(firstId);
                expect(c.currentProvider.value?.label).toBe("");
            } finally {
                teardown();
            }
        });
    });

    // ── editProvider ─────────────────────────────────────────────────────────

    describe("editProvider", () => {
        it("opens the modal with isEditing true", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                expect(c.showModal.value).toBe(true);
                expect(c.isEditing.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("populates currentProvider with a deep clone of the provided data", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                expect(c.currentProvider.value?.label).toBe("Test Provider");
                expect(c.currentProvider.value?.domain).toBe("test.auth0.com");
                expect(c.currentProvider.value?.clientId).toBe("client-id-1");
                expect(c.currentProvider.value?.audience).toBe("https://api.test.com");
                // Must be a deep clone, not the same reference
                expect(c.currentProvider.value).not.toBe(mockProvider);
            } finally {
                teardown();
            }
        });

        it("sets editingProviderId to the provider's ID", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                expect(c.editingProviderId.value).toBe("provider-1");
            } finally {
                teardown();
            }
        });

        it("editing the local copy does not mutate providers.value", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                // Mutate via the local editing copy
                c.currentProvider.value!.label = "MUTATED";
                await nextTick();
                // The underlying reactive array must remain unchanged
                expect(c.providers.value[0].label).toBe("Test Provider");
            } finally {
                teardown();
            }
        });
    });

    // ── isDirty tracking ─────────────────────────────────────────────────────

    describe("isDirty tracking", () => {
        it("becomes true immediately when a field changes while editing", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                expect(c.isDirty.value).toBe(false);
                c.currentProvider.value!.label = "Changed Label";
                await nextTick();
                expect(c.isDirty.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("resets to false after the 500 ms accuracy check when user types back to the original", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                expect(c.isDirty.value).toBe(true);

                // Type back to the original value
                c.currentProvider.value!.label = "Test Provider";
                await nextTick();
                // Advance past the 500 ms debounce
                vi.advanceTimersByTime(600);
                await nextTick();
                expect(c.isDirty.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("stays true after the accuracy check when the value is actually different", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Permanently Different";
                await nextTick();
                vi.advanceTimersByTime(600);
                await nextTick();
                expect(c.isDirty.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("does not run the accuracy check for new providers (stays dirty)", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                c.currentProvider.value!.label = "New Provider";
                await nextTick();
                expect(c.isDirty.value).toBe(true);
                // No snapshot → accuracy check branch not taken → still dirty
                vi.advanceTimersByTime(600);
                await nextTick();
                expect(c.isDirty.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("isDirtyAny is true only when both modal is open and isDirty is true", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.isDirtyAny.value).toBe(false);
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                expect(c.isDirtyAny.value).toBe(true);
                c.closeModal();
                await nextTick();
                expect(c.isDirtyAny.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("debounce timer resets on each new change", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "One";
                await nextTick();
                // Advance only 300 ms (not enough to trigger first timer)
                vi.advanceTimersByTime(300);
                c.currentProvider.value!.label = "Test Provider"; // type back to original
                await nextTick();
                // Now advance the full 600 ms from the second change
                vi.advanceTimersByTime(600);
                await nextTick();
                expect(c.isDirty.value).toBe(false);
            } finally {
                teardown();
            }
        });
    });

    // ── revertProvider ────────────────────────────────────────────────────────

    describe("revertProvider", () => {
        it("resets currentProvider to the original snapshot values", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                c.revertProvider();
                await nextTick();
                expect(c.currentProvider.value?.label).toBe("Test Provider");
            } finally {
                teardown();
            }
        });

        it("resets isDirty to false after revert", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                expect(c.isDirty.value).toBe(true);
                c.revertProvider();
                await nextTick();
                expect(c.isDirty.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("does nothing when editingProviderId is not set (creating mode)", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                c.currentProvider.value!.label = "New";
                // revertProvider is a no-op when editingProviderId is undefined
                c.revertProvider();
                expect(c.currentProvider.value?.label).toBe("New");
            } finally {
                teardown();
            }
        });
    });

    // ── closeModal cleanup ────────────────────────────────────────────────────

    describe("closeModal", () => {
        it("closes the modal", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.closeModal();
                await nextTick();
                expect(c.showModal.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("resets isDirty, isEditing, errors and hasAttemptedSubmit on close", async () => {
            vi.useFakeTimers();
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                c.closeModal();
                await nextTick();
                expect(c.isDirty.value).toBe(false);
                expect(c.isEditing.value).toBe(false);
                expect(c.errors.value).toBeUndefined();
                expect(c.hasAttemptedSubmit.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("clears editingProviderId on close", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                await nextTick();
                expect(c.editingProviderId.value).toBe("provider-1");
                c.closeModal();
                await nextTick();
                await nextTick();
                expect(c.editingProviderId.value).toBeUndefined();
            } finally {
                teardown();
            }
        });
    });

    // ── isFormValid ───────────────────────────────────────────────────────────

    describe("isFormValid", () => {
        it("is false when no modal is open", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is false when label is empty", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, label: "" });
                await nextTick();
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is false when domain is empty", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, domain: "" });
                await nextTick();
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is false when clientId is empty", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, clientId: "" });
                await nextTick();
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is false when audience is empty", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, audience: "" });
                await nextTick();
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is true when all required fields are filled (editing)", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                await nextTick();
                expect(c.isFormValid.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("is true when all required fields are filled (creating)", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                c.currentProvider.value!.label = "My Provider";
                c.currentProvider.value!.domain = "test.auth0.com";
                c.currentProvider.value!.clientId = "client-1";
                c.currentProvider.value!.audience = "https://api.test.com";
                await nextTick();
                expect(c.isFormValid.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("is false for whitespace-only fields", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, label: "   " });
                await nextTick();
                expect(c.isFormValid.value).toBe(false);
            } finally {
                teardown();
            }
        });
    });

    // ── saveProvider (editing) ────────────────────────────────────────────────

    describe("saveProvider (editing)", () => {
        it("closes the modal after a successful save", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.currentProvider.value!.label = "Updated Label";
                await c.saveProvider();
                expect(c.showModal.value).toBe(false);
                expect(c.isLoading.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("sets hasAttemptedSubmit to true when save is called (visible while form is invalid)", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                // Use an invalid form so the modal stays open and hasAttemptedSubmit remains set
                c.editProvider({ ...mockProvider, label: "" });
                await c.saveProvider();
                expect(c.hasAttemptedSubmit.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("sets errors and keeps the modal open when the form is invalid", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider({ ...mockProvider, label: "" });
                await c.saveProvider();
                expect(c.errors.value).toBeDefined();
                expect(c.errors.value!.length).toBeGreaterThan(0);
                expect(c.showModal.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("sets isLoading to false after save completes", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                await c.saveProvider();
                expect(c.isLoading.value).toBe(false);
            } finally {
                teardown();
            }
        });
    });

    // ── saveProvider (creating) ───────────────────────────────────────────────

    describe("saveProvider (creating)", () => {
        it("closes the modal after a successful create", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                c.currentProvider.value!.label = "Brand New";
                c.currentProvider.value!.domain = "new.auth0.com";
                c.currentProvider.value!.clientId = "new-client";
                c.currentProvider.value!.audience = "https://api.new.com";
                await c.saveProvider();
                expect(c.showModal.value).toBe(false);
                expect(c.isLoading.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("resets newProvider to a fresh empty state after creation", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                const firstId = c.currentProvider.value!._id;
                c.currentProvider.value!.label = "Brand New";
                c.currentProvider.value!.domain = "new.auth0.com";
                c.currentProvider.value!.clientId = "new-client";
                c.currentProvider.value!.audience = "https://api.new.com";
                await c.saveProvider();
                c.openCreateModal();
                expect(c.currentProvider.value?._id).not.toBe(firstId);
                expect(c.currentProvider.value?.label).toBe("");
            } finally {
                teardown();
            }
        });

        it("sets errors and keeps the modal open when the form is invalid", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                // Leave required fields empty
                await c.saveProvider();
                expect(c.errors.value).toBeDefined();
                expect(c.showModal.value).toBe(true);
            } finally {
                teardown();
            }
        });
    });

    // ── deleteProvider ────────────────────────────────────────────────────────

    describe("deleteProvider", () => {
        it("opens the delete modal and sets providerToDelete to the current provider", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.editProvider(mockProvider);
                c.deleteProvider();
                expect(c.showDeleteModal.value).toBe(true);
                expect(c.providerToDelete.value?._id).toBe("provider-1");
                expect(c.providerToDelete.value?.label).toBe("Test Provider");
            } finally {
                teardown();
            }
        });
    });

    // ── confirmDelete ─────────────────────────────────────────────────────────

    describe("confirmDelete", () => {
        it("clears providerToDelete and closes the delete modal on success", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.deleteProvider();
                await c.confirmDelete();
                expect(c.showDeleteModal.value).toBe(false);
                expect(c.providerToDelete.value).toBeUndefined();
            } finally {
                teardown();
            }
        });

        it("also closes the edit modal when the edit modal was open", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                expect(c.showModal.value).toBe(true);
                c.deleteProvider();
                await c.confirmDelete();
                expect(c.showModal.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is a no-op when providerToDelete is not set", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await c.confirmDelete();
                expect(c.showDeleteModal.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("denies delete and shows error when user lacks delete access on provider groups", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                // Remove delete permission from the access map
                accessMap.value = {
                    "group-super-admins": {
                        authProvider: { view: true, edit: true }, // no delete
                    },
                } as any;
                c.editProvider(c.providers.value[0]);
                c.deleteProvider();
                await c.confirmDelete();
                // Modal should remain open because the delete was denied
                expect(c.showDeleteModal.value).toBe(true);
            } finally {
                accessMap.value = authProviderAdminAccessMap as any;
                teardown();
            }
        });
    });

    // ── default groups ────────────────────────────────────────────────────────

    describe("default groups", () => {
        beforeEach(async () => {
            await db.docs.put(mockDefaultPermissions);
        });

        it("openDefaultGroupsDialog opens the dialog with the current defaultGroups", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                expect(c.showDefaultGroupsDialog.value).toBe(true);
                expect(c.editableDefaultGroups.value).toContain("group-super-admins");
            } finally {
                teardown();
            }
        });

        it("isDefaultGroupsDirty is false when editableDefaultGroups matches defaultGroups", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                await nextTick();
                expect(c.isDefaultGroupsDirty.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("isDefaultGroupsDirty is true after modifying editableDefaultGroups", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                c.editableDefaultGroups.value = [];
                await nextTick();
                expect(c.isDefaultGroupsDirty.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("saveDefaultGroups persists changes to Dexie and closes the dialog", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                c.editableDefaultGroups.value = [];
                await c.saveDefaultGroups();
                expect(c.showDefaultGroupsDialog.value).toBe(false);
                const saved = (await db.docs.get("default-permissions-1")) as DefaultPermissionsDto;
                expect(saved?.defaultGroups).toEqual([]);
            } finally {
                teardown();
            }
        });

        it("saveDefaultGroups sets isSavingDefaultGroups back to false after completion", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                await c.saveDefaultGroups();
                expect(c.isSavingDefaultGroups.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("saveDefaultGroups is a no-op when defaultPermissions has not loaded", async () => {
            // Remove the defaultPermissions doc so the live query returns undefined
            await db.docs.delete("default-permissions-1");
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.showDefaultGroupsDialog.value = true;
                await c.saveDefaultGroups();
                // Dialog should remain open (early return)
                expect(c.showDefaultGroupsDialog.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("defaultGroupSelectedLabels includes a label entry for each group in editableDefaultGroups", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.defaultPermissions.value).toBeDefined();
                });
                c.openDefaultGroupsDialog();
                await waitForExpect(() => {
                    const labels = c.defaultGroupSelectedLabels.value;
                    const entry = labels.find((l) => l.id === "group-super-admins");
                    expect(entry).toBeDefined();
                    expect(entry?.label).toBe("Super Admins");
                });
            } finally {
                teardown();
            }
        });
    });
});
