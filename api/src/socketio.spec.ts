import { Socket, io } from "socket.io-client";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";
import { createTestingModule } from "./test/testingModule";
import { socketioTestClient } from "./test/socketioTestClient";

jest.mock("./configuration", () => {
    const originalModule = jest.requireActual("./configuration");
    const origConfig = originalModule.default();

    return {
        default: () => ({
            ...origConfig,
            permissionMap: `{
                "jwt": {
                    "groups": {
                        "group-super-admins": "() => true"
                    },
                    "userId": {
                        "user-super-admin": "() => true"
                    }
                }
            }`,
        }),
    };
});

describe("Socketio", () => {
    let server: Socketio;
    let client: Socket;
    let app: INestApplication;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule } = await createTestingModule("socketio");
        return testingModule.createNestApplication();
    }

    beforeAll(async () => {
        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
        client = io(`http://localhost:${process.env.PORT}`);
    });

    afterAll(async () => {
        client.off();
        await app.close();
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });

    describe("Change requests", () => {
        it("can submit a single change request and receive an acknowledgement", async () => {
            const changeRequest = {
                id: 42,
                doc: {
                    _id: "lang-eng",
                    type: "language",
                    memberOf: ["group-languages"],
                    languageCode: "eng",
                    name: "English",
                    translations: {
                        stringTranslation: "String Translation",
                    },
                },
            };

            const res = await socketioTestClient({
                cms: false,
                version: Date.now() + 1000000,
                changeRequest: changeRequest,
            });
            expect(res.ack.id).toBe(42);
            expect(res.ack.message).toBe(undefined);
            expect(res.ack.ack).toBe("accepted");
        });

        it("can correctly fail validation of an invalid change request", async () => {
            const changeRequest = {
                id: 42,
                invalidProperty: {},
            };

            const res = await socketioTestClient({
                cms: false,
                version: Date.now() + 1000000,
                // @ts-expect-error The change request is intentionally invalid
                changeRequest: changeRequest,
            });
            expect(res.ack.id).toBe(42);
            expect(res.ack.ack).toBe("rejected");
            expect(res.ack.message).toContain("Change request validation failed");
        });

        it("sends the existing document back when validation fails", async () => {
            const changeRequest = {
                id: 42,
                doc: {
                    _id: "lang-eng",
                    type: "invalid",
                    memberOf: ["group-languages"],
                    languageCode: "eng",
                    name: "Changed language name",
                },
            };

            const res = await socketioTestClient({
                cms: false,
                version: Date.now() + 1000000,
                changeRequest: changeRequest,
            });

            expect(res.ack.id).toBe(42);
            expect(res.ack.message).toContain("Invalid document type");
            expect(res.ack.ack).toBe("rejected");

            expect(res.ack.doc._id).toBe("lang-eng");
            expect(res.ack.doc.type).toBe("language");
            expect(res.ack.doc.name).toBe("English");
        });
    });
});
