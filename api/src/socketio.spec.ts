import { Socket, io } from "socket.io-client";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";
import { createTestingModule } from "./test/testingModule";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";

describe("Socketio", () => {
    let server: Socketio;
    let client: Socket;
    let app: INestApplication;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule } = await createTestingModule("socketio");
        return testingModule.createNestApplication();
    }

    // Emits the given changeRequests from the client, and returns all received acks as an array
    function createTestSocketForChangeRequests(changeRequest): () => Promise<ChangeReqAckDto> {
        return (): Promise<ChangeReqAckDto> => {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("changeRequestAck");
                    resolve(data);
                };
                client.on("changeRequestAck", c);

                client.emit("changeRequest", changeRequest);
            });
        };
    }

    beforeAll(async () => {
        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
        client = io(`http://localhost:${process.env.PORT}`);
    });

    afterAll(async () => {
        await client.off();
        await app.close();
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });

    describe("ClientDataReq", () => {
        it("can receive 'clientDataReq' message and return data from the database", async () => {
            function testSocket() {
                return new Promise((resolve) => {
                    const c = function (data) {
                        client.off("data", c);
                        resolve(data);
                    };
                    client.on("data", c);

                    client.emit("clientDataReq", {
                        updateVersion: 0,
                    });
                });
            }

            const res: any = await testSocket();
            expect(Array.isArray(res)).toBe(true);

            // CMS option is excluded, so the "group" type should not be included in result
            expect(res.filter((t) => t.type === "group").length).toBe(0);
        });

        it("can return CMS specific data from the database when cms: true option is passed", async () => {
            function testSocket() {
                return new Promise((resolve) => {
                    const c = function (data) {
                        client.off("data", c);
                        resolve(data);
                    };
                    client.on("data", c);

                    client.emit("clientDataReq", {
                        updateVersion: 0,
                        cms: true,
                    });
                });
            }

            const res: any = await testSocket();
            expect(res.filter((t) => t.type === "group").length).toBeGreaterThan(0);
        });
    });

    describe("Change requests", () => {
        // TODO: Need to re-think how to test this. Currently the user access is hard-coded but
        // when we implement user authentication, the access will be determined by the user's group membership.
        it("can submit a single change request and receive an acknowledgement", async () => {
            const changeRequest = {
                id: 42,
                doc: {
                    _id: "lang-eng",
                    type: "language",
                    memberOf: ["group-languages"],
                    languageCode: "eng",
                    name: "English",
                },
            };
            const testSocket = createTestSocketForChangeRequests(changeRequest);

            const ack = await testSocket();

            expect(ack.id).toBe(42);
            expect(ack.message).toBe(undefined);
            expect(ack.ack).toBe("accepted");
        });

        it("can correctly fail validation of an invalid change request", async () => {
            const changeRequest = {
                id: 42,
                invalidProperty: {},
            };
            const testSocket = createTestSocketForChangeRequests(changeRequest);

            const ack = await testSocket();

            expect(ack.id).toBe(42);
            expect(ack.ack).toBe("rejected");
            expect(ack.message).toContain("Change request validation failed");
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
            const testSocket = createTestSocketForChangeRequests(changeRequest);

            const ack = await testSocket();

            expect(ack.id).toBe(42);
            expect(ack.message).toContain("Invalid document type");
            expect(ack.ack).toBe("rejected");

            expect(ack.doc._id).toBe("lang-eng");
            expect(ack.doc.type).toBe("language");
            expect(ack.doc.name).toBe("English");
        });
    });
});
