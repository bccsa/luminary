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
    type AuthProviderDto,
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

// ============================
// Mock API server
// ============================
const expressApp = express();
expressApp.use(express.json());

const randomPort = () => Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
const port = randomPort();

let providerSearchDocs: AuthProviderDto[] = [];
let lastChangeRequest: any = null;

expressApp.get("/search", (req, res) => {
    const query = JSON.parse(req.headers["x-query"] as string);
    res.setHeader("Content-Type", "application/json");
    if (query.types?.includes(DocType.AuthProvider)) {
        res.end(JSON.stringify({ docs: providerSearchDocs }));
    } else {
        res.end(JSON.stringify({ docs: [] }));
    }
});

expressApp.post("/changerequest", (req, res) => {
    lastChangeRequest = req.body;
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
                { type: DocType.AutoGroupMappings, contentOnly: true, syncPriority: 20 },
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
        lastChangeRequest = null;
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
        it("opens the modal with isEditing true", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                expect(c.showModal.value).toBe(true);
                expect(c.isEditing.value).toBe(true);
            } finally {
                teardown();
            }
        });

        it("populates currentProvider with a deep clone of the provided data", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
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

        it("editing the current provider mutates the editable array directly", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                // currentProvider is a reference into the editable array
                c.currentProvider.value!.label = "MUTATED";
                await nextTick();
                expect(c.providers.value[0].label).toBe("MUTATED");
            } finally {
                teardown();
            }
        });
    });

    // ── isProviderEdited / isDirtyAny ────────────────────────────────────────
    // Per-field dirty tracking + isDirty/isFormValid live in FormModal.vue
    // after the refactor — see FormModal tests for label/domain/clientId/audience
    // edit coverage. Here we only verify the composable's role in the route
    // guard: isDirtyAny is a function of `showModal` AND the `isFormDirty` ref
    // that FormModal writes back via v-model.

    describe("isDirtyAny route guard", () => {
        it("is false when modal is closed", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.isDirtyAny.value).toBe(false);
            } finally {
                teardown();
            }
        });

        it("is true when the modal is open and FormModal reports dirty", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.isFormDirty.value = true; // simulate FormModal's v-model write
                await nextTick();
                expect(c.isDirtyAny.value).toBe(true);
                c.closeModal();
                await nextTick();
                expect(c.isDirtyAny.value).toBe(false);
            } finally {
                teardown();
            }
        });
    });

    // ── isProviderEdited ──────────────────────────────────────────────────────

    describe("isProviderEdited", () => {
        it("returns false for an unedited provider", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                expect(c.isProviderEdited(c.providers.value[0]._id)).toBe(false);
            } finally {
                teardown();
            }
        });

        it("returns true once the editable provider diverges from the shadow", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                expect(c.isProviderEdited(c.providers.value[0]._id)).toBe(true);
            } finally {
                teardown();
            }
        });

        it("returns false for an unknown id", () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                expect(c.isProviderEdited("nope")).toBe(false);
                expect(c.isProviderEdited(undefined)).toBe(false);
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
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                c.revertProvider();
                await nextTick();
                expect(c.currentProvider.value?.label).toBe("Test Provider");
            } finally {
                teardown();
            }
        });

        it("clears the provider's edited state after revert", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.currentProvider.value!.label = "Changed";
                await nextTick();
                expect(c.isProviderEdited(c.providers.value[0]._id)).toBe(true);
                c.revertProvider();
                await nextTick();
                expect(c.isProviderEdited(c.providers.value[0]._id)).toBe(false);
            } finally {
                teardown();
            }
        });

        it("removes new provider from editable array when reverting during create", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                const initialLength = c.providers.value.length;
                c.openCreateModal();
                c.currentProvider.value!.label = "New";
                // revertProvider removes the new item (no shadow entry)
                c.revertProvider();
                await nextTick();
                expect(c.providers.value).toHaveLength(initialLength);
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

        it("resets isFormDirty, isEditing, and errors on close", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.isFormDirty.value = true; // simulate FormModal's v-model write
                c.errors.value = ["boom"];
                c.closeModal();
                await waitForExpect(() => {
                    expect(c.isFormDirty.value).toBe(false);
                    expect(c.isEditing.value).toBe(false);
                    expect(c.errors.value).toBeUndefined();
                });
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

    // NOTE: `isFormValid` and per-field validation now live in FormModal.vue
    // alongside the form they validate. See FormModal tests for coverage.

    // ── saveProvider (editing) ────────────────────────────────────────────────

    // NOTE: `saveProvider` now trusts the caller to have validated the form
    // (FormModal does this before emitting save). It no longer sets errors for
    // empty fields — it persists whatever staging config it's handed. Form-level
    // validation tests live in FormModal.spec.ts.

    describe("saveProvider (editing)", () => {
        it("keeps the modal open after a successful save", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
                c.currentProvider.value!.label = "Updated Label";
                await c.saveProvider();
                expect(c.showModal.value).toBe(true);
                expect(c.isLoading.value).toBe(false);
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
        it("keeps the modal open after a successful create", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                c.openCreateModal();
                c.currentProvider.value!.label = "Brand New";
                c.currentProvider.value!.domain = "new.auth0.com";
                c.currentProvider.value!.clientId = "new-client";
                c.currentProvider.value!.audience = "https://api.new.com";
                await c.saveProvider();
                expect(c.showModal.value).toBe(true);
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
    });

    // ── deleteProvider ────────────────────────────────────────────────────────

    describe("deleteProvider", () => {
        it("opens the delete modal and sets providerToDelete to the current provider", async () => {
            const [c, teardown] = withSetup(() => useAuthProviders());
            try {
                await waitForExpect(() => {
                    expect(c.providers.value).toHaveLength(1);
                });
                c.editProvider(c.providers.value[0]);
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
});
