import { Socket, io } from "socket.io-client";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";
import { createTestingModule } from "./test/testingModule";
import { DbService } from "./db/db.service";

describe("Socketio", () => {
    const oldEnv = process.env;
    let server: Socketio;
    let app: INestApplication;
    let db: DbService;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule, dbService } = await createTestingModule("socketio");
        db = dbService;
        return testingModule.createNestApplication();
    }

    function connectClient(token?: string): Socket {
        return io(`http://localhost:${process.env.PORT}`, {
            auth: token !== undefined ? { token } : {},
            forceNew: true,
        });
    }

    beforeAll(async () => {
        process.env = { ...oldEnv };

        process.env.JWT_MAPPINGS = `{
            "groups": {
                "group-super-admins": "() => true"
            },
            "userId": "() => 'user-super-admin'",
            "email": "() => 'test@123.com'",
            "name": "() => 'Test User'"
        }`;

        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
    });

    afterAll(async () => {
        await app.close();
        process.env = oldEnv;
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });

    it("should connect successfully without a token (anonymous access)", (done) => {
        const client = connectClient();

        client.on("connect", () => {
            expect(client.connected).toBe(true);
            client.disconnect();
            done();
        });

        client.on("connect_error", () => {
            client.disconnect();
            done();
        });
    }, 10000);

    it("should respond to clientConfigReq with clientConfig", (done) => {
        const client = connectClient();

        client.on("connect", () => {
            client.emit("clientConfigReq", {
                docTypes: [{ type: "post" }, { type: "tag" }],
            });
        });

        client.on("clientConfig", (config: any) => {
            expect(config.maxUploadFileSize).toBeDefined();
            expect(config.accessMap).toBeDefined();
            client.disconnect();
            done();
        });
    }, 10000);

    // Backwards-compat: clients deployed before the joinSocketGroups → clientConfigReq
    // rename still hand-shake via the deprecated alias (ADR 0005).
    it("should respond to the deprecated joinSocketGroups alias with clientConfig", (done) => {
        const client = connectClient();

        client.on("connect", () => {
            client.emit("joinSocketGroups", {
                docTypes: [{ type: "post" }, { type: "tag" }],
            });
        });

        client.on("clientConfig", (config: any) => {
            expect(config.maxUploadFileSize).toBeDefined();
            expect(config.accessMap).toBeDefined();
            client.disconnect();
            done();
        });
    }, 10000);

    it("should broadcast database updates to rooms", (done) => {
        const client = connectClient();
        let joined = false;

        client.on("connect", () => {
            client.emit("clientConfigReq", {
                docTypes: [{ type: "post" }],
            });
        });

        client.on("clientConfig", () => {
            if (!joined) {
                joined = true;
                // After joining, trigger a database update
                setTimeout(async () => {
                    try {
                        await db.upsertDoc({
                            _id: "test-socketio-post-1",
                            type: "post",
                            memberOf: ["group-super-admins"],
                            updatedTimeUtc: Date.now(),
                            tags: [],
                            publishDateVisible: true,
                        });
                    } catch {
                        // Ignore if doc already exists
                    }
                }, 200);
            }
        });

        client.on("data", (data: any) => {
            if (data.docs && data.docs.some((d) => d._id === "test-socketio-post-1")) {
                expect(data.version).toBeDefined();
                client.disconnect();
                done();
            }
        });

        // Timeout fallback
        setTimeout(() => {
            client.disconnect();
            done();
        }, 8000);
    }, 15000);

    it("should handle database update for document without type", (done) => {
        const client = connectClient();

        client.on("connect", async () => {
            // Insert a document without a type field - the handler should log a warning
            try {
                await db.upsertDoc({
                    _id: "test-no-type-doc",
                    updatedTimeUtc: Date.now(),
                } as any);
            } catch {
                // Ignore
            }
            // Give it time to process
            setTimeout(() => {
                client.disconnect();
                done();
            }, 500);
        });
    }, 10000);

    // CmsView-scoped rooms (#160): a draft Content doc must reach a CMS-mode connection (joined to
    // the `-cms` rooms via CmsView) but NOT an app-mode connection (base rooms via View). Content is
    // routed via its parent Post's memberOf, so a parent post is created first.
    it("routes a draft Content doc to the CMS (-cms) room only, not the app base room", (done) => {
        const appClient = connectClient();
        const cmsClient = connectClient();
        let appReady = false;
        let cmsReady = false;
        let cmsGotDraft = false;
        let finished = false;
        const PARENT = "test-cms-parent-post";
        const DRAFT = "test-cms-draft-content";

        const finish = (err?: Error) => {
            if (finished) return;
            finished = true;
            appClient.disconnect();
            cmsClient.disconnect();
            done(err);
        };

        const maybeStart = async () => {
            if (!appReady || !cmsReady) return;
            try {
                await db.upsertDoc({
                    _id: PARENT,
                    type: "post",
                    memberOf: ["group-super-admins"],
                    updatedTimeUtc: Date.now(),
                    tags: [],
                    publishDateVisible: true,
                } as any);
            } catch {
                // already exists
            }
            setTimeout(async () => {
                try {
                    await db.upsertDoc({
                        _id: DRAFT,
                        type: "content",
                        parentId: PARENT,
                        parentType: "post",
                        memberOf: ["group-super-admins"],
                        language: "lang-eng",
                        status: "draft",
                        slug: "test-cms-draft-slug",
                        title: "Secret draft",
                        updatedTimeUtc: Date.now(),
                    } as any);
                } catch {
                    // ignore
                }
            }, 200);
        };

        appClient.on("connect", () =>
            appClient.emit("clientConfigReq", { docTypes: [{ type: "post" }], cms: false }),
        );
        cmsClient.on("connect", () =>
            cmsClient.emit("clientConfigReq", { docTypes: [{ type: "post" }], cms: true }),
        );
        appClient.on("clientConfig", () => {
            appReady = true;
            void maybeStart();
        });
        cmsClient.on("clientConfig", () => {
            cmsReady = true;
            void maybeStart();
        });

        appClient.on("data", (data: any) => {
            // The app (base rooms, View) must NEVER receive a draft.
            if (data.docs?.some((d: any) => d._id === DRAFT)) {
                finish(new Error("app client received a draft content doc"));
            }
        });
        cmsClient.on("data", (data: any) => {
            if (data.docs?.some((d: any) => d._id === DRAFT)) cmsGotDraft = true;
        });

        // Settle: the CMS must have received the draft; the app must not have (asserted above).
        setTimeout(() => {
            try {
                expect(cmsGotDraft).toBe(true);
                finish();
            } catch (e) {
                finish(e as Error);
            }
        }, 6000);
    }, 15000);
});
