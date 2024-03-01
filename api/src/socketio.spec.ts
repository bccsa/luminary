import { Socket, io } from "socket.io-client";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";
import { createTestingModule } from "./test/testingModule";
import { socketioTestClient } from "./test/socketioTestClient";
import {
    changeRequest_content,
    changeRequest_group,
    changeRequest_language,
    changeRequest_post,
    changeRequest_tag,
} from "./test/changeRequestDocuments";
import { DocType } from "./enums";

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
        await client.off();
        await app.close();
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });

    describe("ClientDataReq", () => {
        it("can receive 'clientDataReq' message and return data from the database", async () => {
            const res = await socketioTestClient(false, 0);

            expect(Array.isArray(res.data)).toBe(true);

            // CMS option is excluded, so the "group" type should not be included in result
            expect(res.data.some((t) => t.type == DocType.Group)).toBe(false);
        });

        it("can return CMS specific data from the database when cms: true option is passed", async () => {
            const res = await socketioTestClient(true, 0);

            expect(Array.isArray(res.data)).toBe(true);

            // CMS option is included, so the "group" type should be included in result
            expect(res.data.some((t) => t.type == DocType.Group)).toBe(true);
        });
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
                },
            };

            const res = await socketioTestClient(false, Date.now() + 1000000, changeRequest);
            expect(res.ack.id).toBe(42);
            expect(res.ack.message).toBe(undefined);
            expect(res.ack.ack).toBe("accepted");
        });

        it("can correctly fail validation of an invalid change request", async () => {
            const changeRequest = {
                id: 42,
                invalidProperty: {},
            };

            // @ts-expect-error The change request is intentionally invalid
            const res = await socketioTestClient(false, Date.now() + 1000000, changeRequest);
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

            const res = await socketioTestClient(false, Date.now() + 1000000, changeRequest);

            expect(res.ack.id).toBe(42);
            expect(res.ack.message).toContain("Invalid document type");
            expect(res.ack.ack).toBe("rejected");

            expect(res.ack.doc._id).toBe("lang-eng");
            expect(res.ack.doc.type).toBe("language");
            expect(res.ack.doc.name).toBe("English");
        });

        describe("Update data events", () => {
            describe("CMS client", () => {
                it("Post documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        true,
                        Date.now() + 1000000,
                        changeRequest_post(),
                    );
                    expect(res.data.length).toBe(2 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("post");
                    expect(res.data[2].type).toBe("change");
                });

                it("Tag documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        true,
                        Date.now() + 1000000,
                        changeRequest_tag(),
                    );
                    expect(res.data.length).toBe(2 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("tag");
                    expect(res.data[2].type).toBe("change");
                });

                it("Content documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        true,
                        Date.now() + 1000000,
                        changeRequest_content(),
                    );
                    expect(res.data.length).toBe(2 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("content");
                    expect(res.data[2].type).toBe("change");
                });

                it("Language documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        true,
                        Date.now() + 1000000,
                        changeRequest_language(),
                    );
                    expect(res.data.length).toBe(2 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("language");
                    expect(res.data[2].type).toBe("change");
                });

                it("Group documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        true,
                        Date.now() + 1000000,
                        changeRequest_group(),
                    );
                    expect(res.data.length).toBe(2 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("group");
                    expect(res.data[2].type).toBe("change");
                });
            });

            describe("APP client", () => {
                it("Post documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        false,
                        Date.now() + 1000000,
                        changeRequest_post(),
                    );
                    expect(res.data.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("post");
                });

                it("Tag documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        false,
                        Date.now() + 1000000,
                        changeRequest_tag(),
                    );
                    expect(res.data.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("tag");
                });

                it("Content documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        false,
                        Date.now() + 1000000,
                        changeRequest_content(),
                    );
                    expect(res.data.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("content");
                });

                it("Language documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        false,
                        Date.now() + 1000000,
                        changeRequest_language(),
                    );
                    expect(res.data.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                    expect(res.data[1].type).toBe("language");
                });

                it("Group documents: emits no data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient(
                        false,
                        Date.now() + 1000000,
                        changeRequest_group(),
                    );
                    expect(res.data.length).toBe(1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.data[0].type).toBe("user");
                });
            });
        });
    });
});
