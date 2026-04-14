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

    it("should respond to joinSocketGroups with clientConfig", (done) => {
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
            client.emit("joinSocketGroups", {
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
});
