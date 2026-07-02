import { Socketio } from "./socketio";
import { PermissionSystem } from "./permissions/permissions.service";
import { AclPermission, DocType, PublishStatus } from "./enums";

/**
 * PURE, fully-mocked unit test for the Socketio gateway.
 *
 * No CouchDB, no S3, no real socket.io server. Every dependency is hand-mocked
 * and the gateway is constructed directly with `new Socketio(...)` (house style,
 * mirroring auth.guard.spec.ts). The wiring registered inside `afterInit` (the
 * auth middleware and the db "update" handler) is captured from the mock call
 * args and invoked directly.
 *
 * NOTE: importing ./socketio eagerly evaluates `configuration().socketIo.maxHttpBufferSize`
 * at decorator (module-eval) time. `configuration()` is a pure object builder with
 * safe `|| default` fallbacks, so the import is side-effect free (no I/O, no throw).
 */
describe("Socketio (mocked)", () => {
    let gateway: Socketio;

    let mockLogger: any;
    let mockDb: any;
    let mockS3: any;
    let mockAuth: any;

    let accessMapToGroupsSpy: jest.SpyInstance;

    // Sentinel accessMap — its exact shape is irrelevant because
    // PermissionSystem.accessMapToGroups is mocked; it is only passed through.
    const sentinelAccessMap: any = {
        "group-A": { post: { view: true } },
    };

    beforeEach(() => {
        mockLogger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
        mockDb = { on: jest.fn(), getDoc: jest.fn() };
        mockS3 = {};
        mockAuth = { resolveOrDefault: jest.fn() };

        gateway = new Socketio(mockLogger, mockDb as any, mockS3 as any, mockAuth as any);

        // Static method — spy + restore in afterEach.
        accessMapToGroupsSpy = jest.spyOn(PermissionSystem, "accessMapToGroups");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ---- helpers -------------------------------------------------------------

    function makeServer() {
        const emitMock = jest.fn();
        const toMock = jest.fn(() => ({ emit: emitMock }));
        const server: any = {
            use: jest.fn(),
            to: toMock,
            emit: jest.fn(),
        };
        return { server, toMock, emitMock };
    }

    function makeSocket(opts: { token?: string; providerId?: string; accessMap?: any } = {}) {
        return {
            data: { userDetails: { accessMap: opts.accessMap ?? sentinelAccessMap } },
            handshake: {
                auth: {
                    token: opts.token,
                    providerId: opts.providerId,
                },
            },
            join: jest.fn(),
            leave: jest.fn(),
            emit: jest.fn(),
        } as any;
    }

    /** Runs afterInit against a fresh mock server and returns the captured wiring. */
    function initGateway() {
        const { server, toMock, emitMock } = makeServer();
        gateway.afterInit(server as any);

        // Captured auth middleware: server.use(async (socket, next) => {...})
        const authMiddleware = server.use.mock.calls[0][0];

        // Captured db update handler: this.db.on("update", async (update) => {...})
        const updateCall = mockDb.on.mock.calls.find((c: any[]) => c[0] === "update");
        const updateHandler = updateCall ? updateCall[1] : undefined;

        return { server, toMock, emitMock, authMiddleware, updateHandler };
    }

    // =========================================================================
    // A. afterInit — auth middleware
    // =========================================================================
    describe("afterInit / auth middleware", () => {
        it("registers an auth middleware and a db 'update' handler", () => {
            const { server } = initGateway();
            expect(server.use).toHaveBeenCalledTimes(1);
            expect(typeof server.use.mock.calls[0][0]).toBe("function");
            expect(mockDb.on).toHaveBeenCalledWith("update", expect.any(Function));
            // afterInit also sets this.config lazily.
            expect(gateway.config.socketIo.maxHttpBufferSize).toBe(1e7);
            expect(gateway.config.socketIo.maxMediaUploadFileSize).toBe(1.5e7);
        });

        it("A1: token without providerId -> next(err) with provider_not_found, resolveOrDefault NOT called", async () => {
            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: "tok", providerId: undefined });
            const next = jest.fn();

            await authMiddleware(socket, next);

            expect(mockAuth.resolveOrDefault).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith("Socket handshake: token without providerId");
            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe("auth_failed");
            expect(err.data).toEqual({ type: "auth_failed", reason: "provider_not_found" });
        });

        it("A2: valid token + providerId -> resolveOrDefault resolved -> userDetails set + next() with no error", async () => {
            const resolvedUserDetails = {
                groups: ["group-A"],
                userId: "user-1",
                accessMap: { "group-A": { post: { view: true } } },
            };
            mockAuth.resolveOrDefault.mockResolvedValue({
                status: "authenticated",
                userDetails: resolvedUserDetails,
            });

            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: "tok", providerId: "prov-1" });
            const next = jest.fn();

            await authMiddleware(socket, next);

            expect(mockAuth.resolveOrDefault).toHaveBeenCalledTimes(1);
            expect(mockAuth.resolveOrDefault).toHaveBeenCalledWith("tok", "prov-1");
            expect(socket.data.userDetails).toBe(resolvedUserDetails);
            expect(next).toHaveBeenCalledTimes(1);
            // success path -> next() with no args
            expect(next).toHaveBeenCalledWith();
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it("A3: resolveOrDefault throws WITH a reason -> next(err) carrying that reason, logger.warn(2 args)", async () => {
            const thrown: any = new Error("Invalid authentication token");
            thrown.reason = "token_invalid";
            mockAuth.resolveOrDefault.mockRejectedValue(thrown);

            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: "tok", providerId: "prov-1" });
            const next = jest.fn();

            await authMiddleware(socket, next);

            expect(mockAuth.resolveOrDefault).toHaveBeenCalledWith("tok", "prov-1");
            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Socket auth failed for providerId=prov-1",
                { error: "Invalid authentication token" },
            );
            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe("auth_failed");
            expect(err.data).toEqual({ type: "auth_failed", reason: "token_invalid" });
        });

        it("A3b: resolveOrDefault throws WITHOUT a reason -> err.data has no reason key", async () => {
            const thrown: any = new Error("boom");
            mockAuth.resolveOrDefault.mockRejectedValue(thrown);

            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: "tok", providerId: "prov-1" });
            const next = jest.fn();

            await authMiddleware(socket, next);

            const err = next.mock.calls[0][0];
            expect(err.data).toEqual({ type: "auth_failed" });
            expect(err.data).not.toHaveProperty("reason");
        });

        it("A3c: resolveOrDefault rejects with a NON-Error value -> logs the raw value, err.data has no reason", async () => {
            // error instanceof Error is false -> logger.warn logs `error` as-is; the
            // optional-chained `.reason` is undefined -> err.data omits reason.
            mockAuth.resolveOrDefault.mockRejectedValue("weird");

            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: "tok", providerId: "prov-1" });
            const next = jest.fn();

            await authMiddleware(socket, next);

            expect(mockLogger.warn).toHaveBeenCalledWith("Socket auth failed for providerId=prov-1", {
                error: "weird",
            });
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe("auth_failed");
            expect(err.data).toEqual({ type: "auth_failed" });
        });

        it("A4: guest (no token, no providerId) -> success path: resolveOrDefault called with (undefined, undefined), userDetails set, next()", async () => {
            const anonUserDetails = {
                groups: ["group-public"],
                accessMap: { "group-public": { post: { view: true } } },
            };
            mockAuth.resolveOrDefault.mockResolvedValue({
                status: "anonymous",
                userDetails: anonUserDetails,
            });

            const { authMiddleware } = initGateway();
            const socket = makeSocket({ token: undefined, providerId: undefined });
            const next = jest.fn();

            await authMiddleware(socket, next);

            // (no token) OR (token && providerId) -> not the early-return branch.
            expect(mockAuth.resolveOrDefault).toHaveBeenCalledTimes(1);
            expect(mockAuth.resolveOrDefault).toHaveBeenCalledWith(undefined, undefined);
            expect(socket.data.userDetails).toBe(anonUserDetails);
            expect(next).toHaveBeenCalledWith();
        });
    });

    // =========================================================================
    // B. db "update" fan-out
    // =========================================================================
    describe("db 'update' fan-out", () => {
        it("B1: normal doc with memberOf -> emit to app and CMS rooms with docs:[update] and version", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = {
                _id: "post-1",
                type: "post",
                memberOf: ["g1", "g2"],
                updatedTimeUtc: 1234,
            };
            await updateHandler(update);

            expect(mockDb.getDoc).not.toHaveBeenCalled();
            expect(toMock).toHaveBeenCalledTimes(2);
            expect(toMock).toHaveBeenCalledWith(["post-g1-cms", "post-g2-cms"]);
            expect(toMock).toHaveBeenCalledWith(["post-g1", "post-g2"]);
            expect(emitMock).toHaveBeenCalledTimes(2);
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 1234,
            });
        });

        it("B1b: normal doc without updatedTimeUtc -> version is undefined", async () => {
            const { emitMock, updateHandler } = initGateway();

            const update = { _id: "post-1", type: "post", memberOf: ["g1"] };
            await updateHandler(update);

            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: undefined,
            });
        });

        it("B2: content doc -> getDoc(parentId) resolves a parent -> emits to PARENT-type rooms, docs:[original update]", async () => {
            const parent = { _id: "post-parent", type: "post", memberOf: ["g1", "g2"] };
            mockDb.getDoc.mockResolvedValue({ docs: [parent] });

            const { toMock, emitMock, updateHandler } = initGateway();

            const update = {
                _id: "content-1",
                type: "content",
                parentId: "post-parent",
                status: PublishStatus.Published,
                updatedTimeUtc: 999,
            };
            await updateHandler(update);

            expect(mockDb.getDoc).toHaveBeenCalledWith("post-parent");
            // rooms derive from the PARENT (type "post" + parent.memberOf)
            expect(toMock).toHaveBeenCalledWith(["post-g1-cms", "post-g2-cms"]);
            expect(toMock).toHaveBeenCalledWith(["post-g1", "post-g2"]);
            // but the emitted doc is the ORIGINAL content update, not the parent
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 999,
            });
        });

        it("B3: content doc whose parent is missing (empty docs) -> logger.warn + NO emit", async () => {
            mockDb.getDoc.mockResolvedValue({ docs: [], warnings: ["Document not found"] });

            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "content-1", type: "content", parentId: "missing-parent" };
            await updateHandler(update);

            expect(mockDb.getDoc).toHaveBeenCalledWith("missing-parent");
            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Parent document not found for content document: content-1",
            );
            expect(toMock).not.toHaveBeenCalled();
            expect(emitMock).not.toHaveBeenCalled();
        });

        it("B3b: content doc whose getDoc result has no docs array -> logger.warn + NO emit", async () => {
            mockDb.getDoc.mockResolvedValue({});

            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "content-2", type: "content", parentId: "p" };
            await updateHandler(update);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Parent document not found for content document: content-2",
            );
            expect(toMock).not.toHaveBeenCalled();
            expect(emitMock).not.toHaveBeenCalled();
        });

        it("B4: group doc -> rooms use [refDoc._id] (group's own id), not memberOf", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = {
                _id: "group-X",
                type: "group",
                memberOf: ["ignored-1", "ignored-2"],
                updatedTimeUtc: 7,
            };
            await updateHandler(update);

            expect(toMock).toHaveBeenCalledWith(["group-group-X"]);
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 7,
            });
        });

        it("B5: change doc (type 'change' with .changes) -> refDoc derived from update.changes; emits original change doc", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = {
                _id: "change-1",
                type: "change",
                updatedTimeUtc: 42,
                changes: { _id: "post-9", type: "post", memberOf: ["g1"] },
            };
            await updateHandler(update);

            // refDoc = update.changes -> type "post", groups from changes.memberOf
            expect(toMock).toHaveBeenCalledWith(["post-g1"]);
            // emitted doc is the original change doc, not the embedded changes
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 42,
            });
        });

        it("B5b: change doc wrapping a content doc -> resolves parent, emits the change doc to parent rooms", async () => {
            const parent = { _id: "post-parent", type: "post", memberOf: ["g3"] };
            mockDb.getDoc.mockResolvedValue({ docs: [parent] });

            const { toMock, emitMock, updateHandler } = initGateway();

            const update = {
                _id: "change-2",
                type: "change",
                updatedTimeUtc: 11,
                changes: { _id: "content-9", type: "content", parentId: "post-parent" },
            };
            await updateHandler(update);

            expect(mockDb.getDoc).toHaveBeenCalledWith("post-parent");
            expect(toMock).toHaveBeenCalledWith(["post-g3"]);
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 11,
            });
        });

        it("B5c: change doc WITHOUT .changes -> refDoc stays the change doc, rooms use `change-${group}`", async () => {
            // `refDoc.type == 'change' && refDoc.changes` is false (no .changes), so refDoc
            // stays the top-level change doc: groups come from its own memberOf, type 'change'.
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "change-3", type: "change", memberOf: ["g1"], updatedTimeUtc: 5 };
            await updateHandler(update);

            expect(mockDb.getDoc).not.toHaveBeenCalled();
            expect(toMock).toHaveBeenCalledWith(["change-g1"]);
            expect(emitMock).toHaveBeenCalledWith("data", {
                docs: [update],
                version: 5,
            });
        });

        it("B6: update with no .type -> logger.warn + NO emit, NO getDoc", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "no-type-1" };
            await updateHandler(update);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "Document type not found in database update object: no-type-1",
            );
            expect(mockDb.getDoc).not.toHaveBeenCalled();
            expect(toMock).not.toHaveBeenCalled();
            expect(emitMock).not.toHaveBeenCalled();
        });

        it("B7: doc with empty memberOf (no rooms) -> NO emit and NO warn", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "post-1", type: "post", memberOf: [] };
            await updateHandler(update);

            expect(toMock).not.toHaveBeenCalled();
            expect(emitMock).not.toHaveBeenCalled();
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it("B7b: doc with missing memberOf -> NO emit", async () => {
            const { toMock, emitMock, updateHandler } = initGateway();

            const update = { _id: "post-1", type: "post" };
            await updateHandler(update);

            expect(toMock).not.toHaveBeenCalled();
            expect(emitMock).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // C. joinSocketGroups / clientConfigReq
    // =========================================================================
    describe("clientConfigReq (joinSocketGroups)", () => {
        beforeEach(() => {
            // clientConfigReq reads this.config; populate it via afterInit.
            initGateway();
        });

        it("C1: emits clientConfig (sizes + accessMap), calls accessMapToGroups with View + unique docTypes, joins view + deleteCmd rooms", () => {
            accessMapToGroupsSpy.mockReturnValue({
                [DocType.Post]: ["g1", "g2"],
                [DocType.Tag]: ["g2"],
            } as any);

            const socket = makeSocket();
            const reqData = {
                // duplicate "post" entries should de-dupe to a single "post".
                docTypes: [{ type: "post" }, { type: "post" }, { type: "tag" }],
            };

            gateway.clientConfigReq(reqData as any, socket);

            // clientConfig emit
            expect(socket.emit).toHaveBeenCalledWith("clientConfig", {
                maxUploadFileSize: 1e7,
                maxMediaUploadFileSize: 1.5e7,
                accessMap: socket.data.userDetails.accessMap,
            });

            // accessMapToGroups called with deduped doc types
            expect(accessMapToGroupsSpy).toHaveBeenCalledWith(
                socket.data.userDetails.accessMap,
                AclPermission.View,
                ["post", "tag"],
            );

            // view rooms: one join per (docType, group)
            expect(socket.join).toHaveBeenCalledWith("post-g1");
            expect(socket.join).toHaveBeenCalledWith("post-g2");
            expect(socket.join).toHaveBeenCalledWith("tag-g2");

            // deleteCmd rooms: one per UNIQUE accessible group (g1, g2) -> deduped.
            expect(socket.join).toHaveBeenCalledWith("deleteCmd-g1");
            expect(socket.join).toHaveBeenCalledWith("deleteCmd-g2");

            // total joins: 3 view rooms + 2 unique deleteCmd rooms
            expect(socket.join).toHaveBeenCalledTimes(5);
        });

        it("C2: maxMediaUploadFileSize falls back to 0 when config value falsy", () => {
            // Override config so maxMediaUploadFileSize is falsy.
            gateway.config = {
                socketIo: { maxHttpBufferSize: 1e7, maxMediaUploadFileSize: 0 },
            } as any;
            accessMapToGroupsSpy.mockReturnValue({} as any);

            const socket = makeSocket();
            gateway.clientConfigReq({ docTypes: [] } as any, socket);

            expect(socket.emit).toHaveBeenCalledWith("clientConfig", {
                maxUploadFileSize: 1e7,
                maxMediaUploadFileSize: 0,
                accessMap: socket.data.userDetails.accessMap,
            });
        });

        it("C3: empty deduped docTypes -> still emits clientConfig but joins nothing (accessMapToGroups not called)", () => {
            const socket = makeSocket();
            gateway.clientConfigReq({ docTypes: [] } as any, socket);

            expect(socket.emit).toHaveBeenCalledWith("clientConfig", expect.any(Object));
            expect(accessMapToGroupsSpy).not.toHaveBeenCalled();
            expect(socket.join).not.toHaveBeenCalled();
        });

        it("C4: deprecated joinSocketGroups alias delegates to clientConfigReq (backwards compat, ADR 0005)", () => {
            accessMapToGroupsSpy.mockReturnValue({ [DocType.Post]: ["g1"] } as any);

            const socket = makeSocket();
            gateway.joinSocketGroups({ docTypes: [{ type: "post" }] } as any, socket);

            // Same observable behaviour as clientConfigReq: clientConfig emit + room joins.
            expect(socket.emit).toHaveBeenCalledWith("clientConfig", expect.any(Object));
            expect(accessMapToGroupsSpy).toHaveBeenCalledWith(
                socket.data.userDetails.accessMap,
                AclPermission.View,
                ["post"],
            );
            expect(socket.join).toHaveBeenCalledWith("post-g1");
            expect(socket.join).toHaveBeenCalledWith("deleteCmd-g1");
        });
    });

    // =========================================================================
    // D. joinRooms
    // =========================================================================
    describe("joinRooms", () => {
        it("D1: joins the requested docTypes' view rooms + deleteCmd rooms", () => {
            accessMapToGroupsSpy.mockReturnValue({
                [DocType.Post]: ["g1"],
                [DocType.Tag]: ["g1"],
            } as any);

            const socket = makeSocket();
            gateway.joinRooms({ docTypes: [DocType.Post, DocType.Tag] } as any, socket);

            expect(accessMapToGroupsSpy).toHaveBeenCalledWith(
                socket.data.userDetails.accessMap,
                AclPermission.View,
                [DocType.Post, DocType.Tag],
            );
            expect(socket.join).toHaveBeenCalledWith("post-g1");
            expect(socket.join).toHaveBeenCalledWith("tag-g1");
            // g1 is shared across both doc types -> exactly one deleteCmd-g1 join.
            expect(socket.join).toHaveBeenCalledWith("deleteCmd-g1");
            // 2 view rooms + 1 unique deleteCmd room
            expect(socket.join).toHaveBeenCalledTimes(3);
        });

        it("D2: empty docTypes -> no joins, accessMapToGroups not called", () => {
            const socket = makeSocket();
            gateway.joinRooms({ docTypes: [] } as any, socket);

            expect(accessMapToGroupsSpy).not.toHaveBeenCalled();
            expect(socket.join).not.toHaveBeenCalled();
        });

        it("D3: undefined reqData -> tolerated (treated as []), no joins", () => {
            const socket = makeSocket();
            gateway.joinRooms(undefined as any, socket);

            expect(accessMapToGroupsSpy).not.toHaveBeenCalled();
            expect(socket.join).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // E. leaveRooms
    // =========================================================================
    describe("leaveRooms", () => {
        it("E1: leaves each `${docType}-${group}` room; does NOT leave deleteCmd rooms", () => {
            accessMapToGroupsSpy.mockReturnValue({
                [DocType.Post]: ["g1", "g2"],
                [DocType.Tag]: ["g2"],
            } as any);

            const socket = makeSocket();
            gateway.leaveRooms({ docTypes: [DocType.Post, DocType.Tag] } as any, socket);

            expect(accessMapToGroupsSpy).toHaveBeenCalledWith(
                socket.data.userDetails.accessMap,
                AclPermission.View,
                [DocType.Post, DocType.Tag],
            );
            expect(socket.leave).toHaveBeenCalledWith("post-g1");
            expect(socket.leave).toHaveBeenCalledWith("post-g2");
            expect(socket.leave).toHaveBeenCalledWith("tag-g2");
            // exactly the 3 view rooms — no deleteCmd leaves.
            expect(socket.leave).toHaveBeenCalledTimes(3);

            const leftRooms = socket.leave.mock.calls.map((c: any[]) => c[0]);
            expect(leftRooms.some((r: string) => r.startsWith("deleteCmd-"))).toBe(false);
        });

        it("E2: empty docTypes -> early return: accessMapToGroups not called, no leave", () => {
            const socket = makeSocket();
            gateway.leaveRooms({ docTypes: [] } as any, socket);

            expect(accessMapToGroupsSpy).not.toHaveBeenCalled();
            expect(socket.leave).not.toHaveBeenCalled();
        });

        it("E3: undefined reqData -> early return, no leave", () => {
            const socket = makeSocket();
            gateway.leaveRooms(undefined as any, socket);

            expect(accessMapToGroupsSpy).not.toHaveBeenCalled();
            expect(socket.leave).not.toHaveBeenCalled();
        });
    });
});
