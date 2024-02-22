import { Socket, io } from "socket.io-client";
import { Test } from "@nestjs/testing";
import { DbService } from "./db/db.service";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";

async function createNestApp(): Promise<INestApplication> {
    const testingModule = await Test.createTestingModule({
        providers: [Socketio, DbService],
    }).compile();
    return testingModule.createNestApplication();
}

describe("Socketio", () => {
    let server: Socketio;
    let client: Socket;
    let app: INestApplication;

    // Emits the given changeRequests from the client, and returns all received acks as an array
    function createTestSocketForChangeRequests(changeRequests) {
        return () => {
            return new Promise((resolve) => {
                const results = [];
                const c = function (data) {
                    results.push(data);

                    if (results.length == changeRequests.length) {
                        client.off("changeRequestAck", c);
                        resolve(results);
                    }
                };
                client.on("changeRequestAck", c);

                client.emit("data", changeRequests);
            });
        };
    }

    beforeEach(async () => {
        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
        client = io(`http://localhost:${process.env.PORT}`);
    });

    afterEach(async () => {
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
            const changeRequests = [
                {
                    id: 42,
                    doc: {
                        _id: "lang-eng",
                        type: "language",
                        memberOf: ["group-languages"],
                        languageCode: "eng",
                        name: "English",
                    },
                },
            ];
            const testSocket = createTestSocketForChangeRequests(changeRequests);

            const receivedAcks = await testSocket();

            expect(receivedAcks[0].id).toBe(42);
            expect(receivedAcks[0].message).toBe(undefined);
            expect(receivedAcks[0].ack).toBe("accepted");
        });

        // TODO re-enable when each test file uses its own database
        xit("can submit multiple change requests and receive an accepted acknowledgement for each", async () => {
            const changeRequests = [
                {
                    id: 43, // Deliberately higher than post, to check if they are sorted correctly. Post should be created first
                    doc: {
                        _id: "content-submitted-with-post",
                        type: "content",
                        memberOf: ["group-public-content"],
                        language: "lang-eng",
                        status: "draft",
                        slug: "post1-eng",
                        title: "Post 1",
                    },
                },
                {
                    id: 42,
                    doc: {
                        _id: "post-submitted-with-content",
                        type: "post",
                        memberOf: ["group-public-content"],
                        content: ["content-submitted-with-post"],
                        image: "img",
                        tags: [],
                    },
                },
            ];
            const testSocket = createTestSocketForChangeRequests(changeRequests);

            const receivedAcks = await testSocket();

            expect(receivedAcks[0].id).toBe(42);
            expect(receivedAcks[0].message).toBe(undefined);
            expect(receivedAcks[0].ack).toBe("accepted");
            expect(receivedAcks[1].id).toBe(43);
            expect(receivedAcks[1].message).toBe(undefined);
            expect(receivedAcks[1].ack).toBe("accepted");
        });

        it("can submit multiple change requests and receive an different acknowledgement for each", async () => {
            const changeRequests = [
                {
                    id: 42,
                    doc: {
                        _id: "lang-eng",
                        type: "language",
                        memberOf: ["group-languages"],
                        languageCode: "eng",
                        name: "English",
                    },
                },
                {
                    id: 43,
                    doc: {
                        _id: "lang-fra",
                        type: "post",
                        invalidProperty: {},
                    },
                },
            ];
            const testSocket = createTestSocketForChangeRequests(changeRequests);

            const receivedAcks = await testSocket();

            expect(receivedAcks[0].id).toBe(42);
            expect(receivedAcks[0].message).toBe(undefined);
            expect(receivedAcks[0].ack).toBe("accepted");
            expect(receivedAcks[1].id).toBe(43);
            expect(receivedAcks[1].message).toContain("Submitted post document validation failed");
            expect(receivedAcks[1].ack).toBe("rejected");
        });

        it("can correctly fail validation of an invalid change request", async () => {
            const changeRequests = [
                {
                    id: 42,
                    invalidProperty: {},
                },
            ];
            const testSocket = createTestSocketForChangeRequests(changeRequests);

            const receivedAcks = await testSocket();

            expect(receivedAcks[0].id).toBe(42);
            expect(receivedAcks[0].ack).toBe("rejected");
            expect(receivedAcks[0].message).toContain("Change request validation failed");
        });

        it("sends the existing document back when validation fails", async () => {
            const changeRequests = [
                {
                    id: 42,
                    doc: {
                        _id: "lang-eng",
                        type: "invalid",
                        memberOf: ["group-languages"],
                        languageCode: "eng",
                        name: "Changed language name",
                    },
                },
            ];
            const testSocket = createTestSocketForChangeRequests(changeRequests);

            const receivedAcks = await testSocket();

            expect(receivedAcks[0].id).toBe(42);
            expect(receivedAcks[0].message).toContain("Invalid document type");
            expect(receivedAcks[0].ack).toBe("rejected");

            expect(receivedAcks[0].doc._id).toBe("lang-eng");
            expect(receivedAcks[0].doc.type).toBe("language");
            expect(receivedAcks[0].doc.name).toBe("English");
        });
    });
});
