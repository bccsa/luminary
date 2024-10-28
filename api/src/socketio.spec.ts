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
import { superAdminAccessMap } from "./test/mockdata";

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

    describe("ClientDataReq", () => {
        it("can receive 'clientDataReq' message and return data from the database", async () => {
            const res = await socketioTestClient({ cms: false, version: 0 });

            expect(Array.isArray(res.docs)).toBe(true);

            // CMS option is excluded, so the "group" type should not be included in result
            expect(res.docs.some((t) => t.type == DocType.Group)).toBe(false);
        });

        it("can return CMS specific data from the database when cms: true option is passed", async () => {
            const res = await socketioTestClient({ cms: true, version: 0 });

            expect(Array.isArray(res.docs)).toBe(true);

            // CMS option is included, so the "group" type should be included in result
            expect(res.docs.some((t) => t.type == DocType.Group)).toBe(true);
        });

        it("can send an accessMap to the client after receiving a 'clientDataReq' message", async () => {
            const res = await socketioTestClient({ cms: false, version: 0, getAccessMap: true });

            expect(res.accessMap).toBeDefined();
            expect(Object.keys(res.accessMap).length).toBeGreaterThan(0);
            expect(res.accessMap["group-private-users"].post.view).toBe(true);
        });

        it("can send the latest version number to the client after receiving a 'clientDataReq' message", async () => {
            const res = await socketioTestClient({ cms: false, version: 0 });

            expect(res.version).toBeGreaterThan(0);
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

        describe("Update data events", () => {
            describe("CMS client", () => {
                it("Post documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: true,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_post(),
                    });
                    expect(res.docs.length).toBe(2);
                    expect(res.docs[0].type).toBe("user");
                    expect(res.docs[1].type).toBe("post");
                });

                it("Tag documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: true,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_tag(),
                    });
                    expect(res.docs.length).toBe(2);
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "tag")).toBe(true);
                });

                it("Content documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: true,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_content(),
                    });
                    expect(res.docs.length).toBe(2);
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "content")).toBe(true);
                });

                it("Language documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: true,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_language(),
                    });
                    expect(res.docs.length).toBe(2);
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "language")).toBe(true);
                });

                it("Group documents: emits two data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: true,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_group(),
                    });
                    expect(res.docs.length).toBe(2);
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "group")).toBe(true);
                });
            });

            describe("APP client", () => {
                it("Post documents: emits a data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_post(),
                    });

                    // The response includes 3 documents:
                    // - The user document
                    // - The post document
                    // - The content document(s) that are children of the post document which were updated with essential properties from the post document
                    expect(res.docs.length).toBe(3);
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "post")).toBe(true);
                    expect(res.docs.some((d) => d.type == "content")).toBe(true);
                });

                it("Tag documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_tag(),
                    });
                    expect(res.docs.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "tag")).toBe(true);
                });

                it("Content documents: emits one data socket.io events after change request submission", async () => {
                    // add the parent document
                    await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_post(),
                    });

                    // add the child document
                    const res2 = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_content(),
                    });

                    expect(res2.docs.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res2.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res2.docs.some((d) => d.type == "content")).toBe(true);
                });

                it("Language documents: emits one data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_language(),
                    });
                    expect(res.docs.length).toBe(1 + 1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                    expect(res.docs.some((d) => d.type == "language")).toBe(true);
                });

                it("Group documents: emits no data socket.io events after change request submission", async () => {
                    const res = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        changeRequest: changeRequest_group(),
                    });
                    expect(res.docs.length).toBe(1); // The user document is returned in response to the clientDataReq sent message, giving one extra data event
                    expect(res.docs.some((d) => d.type == "user")).toBe(true);
                });

                it("gets historical data for newly accessibles groups", async () => {
                    const limitedAccessMap = { ...superAdminAccessMap };
                    delete limitedAccessMap["group-private-content"];
                    delete limitedAccessMap["group-super-admins"];
                    delete limitedAccessMap["group-private-editors"];

                    const res = await socketioTestClient({
                        cms: false,
                        version: Date.now() + 1000000,
                        getAccessMap: true,
                        timeout: 4000,
                    });

                    console.log(res);

                    // expect(res.docs.includes((d) => d["id"] == "group-private-content")).toBe(true);
                    // Check if the response includes an access map with access to "Group Private Content"
                    // Check if all private documents are included in the response
                });
            });
        });
    });
});
