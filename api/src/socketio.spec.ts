import { io } from "socket.io-client";
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
    let server;
    let client;
    let app: INestApplication;

    beforeAll(async () => {
        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
        client = io(`http://localhost:${process.env.PORT}`);
    });

    afterAll(async () => {
        app.close();
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });

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

    // TODO: Need to re-think how to test this. Currently the user access is hard-coded but
    // when we implement user authentication, the access will be determined by the user's group membership.
    it("can submit a ChangeReq and receive an acknowledgement", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "test change request",
                    type: "changeReq",
                    changes: [
                        {
                            id: 1,
                            doc: {
                                _id: "lang-eng",
                                type: "language",
                                memberOf: ["group-languages"],
                                languageCode: "eng",
                                name: "English",
                            },
                        },
                    ],
                });
            });
        }

        const res: any = await testSocket();
        expect(res.reqId).toBe("test change request");
        expect(res.type).toBe("changeReqAck");
        expect(res.message).toBe(undefined);
        expect(res.ack).toBe("accepted");
    });

    it("can correctly fail validation of an invalid ChangeReq document", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "invalid change request",
                    type: "changeReq",
                    invalidProperty: {},
                });
            });
        }

        const res: any = await testSocket();
        expect(res.reqId).toBe("invalid change request");
        expect(res.type).toBe("changeReqAck");
        expect(res.ack).toBe("rejected");
    });

    it("can correctly reject invalid document types", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "change request with invalid document type",
                    type: "changeReq",
                    doc: {
                        _id: "lang-eng",
                        type: "invalid document type",
                        memberOf: ["group-languages"],
                        languageCode: "eng",
                        name: "English",
                    },
                });
            });
        }

        const res: any = await testSocket();
        expect(res.reqId).toBe("change request with invalid document type");
        expect(res.type).toBe("changeReqAck");
        expect(res.ack).toBe("rejected");
    });

    it("can correctly fail validation for invalid document data passed with a Change Request", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "change request with invalid document data",
                    type: "changeReq",
                    doc: {
                        _id: "lang-eng",
                        type: "language",
                        memberOf: "invalid data (should have been an array)",
                        languageCode: "eng",
                        name: "English",
                    },
                });
            });
        }

        const res: any = await testSocket();

        expect(res.reqId).toBe("change request with invalid document data");
        expect(res.type).toBe("changeReqAck");
        expect(res.ack).toBe("rejected");
    });

    it("can correctly validate a nested type", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "test-group",
                    type: "changeReq",
                    doc: {
                        _id: "test-group",
                        type: "group",
                        name: "Test",
                        acl: [
                            {
                                type: "language",
                                groupId: "group-public-content",
                                permission: ["view"],
                            },
                            {
                                type: "invalid", // This field is modified to an invalid value
                                groupId: "group-private-content",
                                permission: ["view"],
                            },
                        ],
                    },
                });
            });
        }

        const res: any = await testSocket();
        expect(res.reqId).toBe("test-group");
        expect(res.type).toBe("changeReqAck");
        expect(res.ack).toBe("rejected");
    });

    it("can correctly validate a nested array of enums", async () => {
        function testSocket() {
            return new Promise((resolve) => {
                const c = function (data) {
                    client.off("data", c);
                    resolve(data);
                };
                client.on("data", c);

                client.emit("data", {
                    reqId: "test-group",
                    type: "changeReq",
                    doc: {
                        _id: "test-group",
                        type: "group",
                        name: "Test",
                        acl: [
                            {
                                type: "language",
                                groupId: "group-public-content",
                                permission: ["view"],
                            },
                            {
                                type: "language",
                                groupId: "group-private-content",
                                permission: ["view", "invalid"], // This field is modified to include an invalid value
                            },
                        ],
                    },
                });
            });
        }

        const res: any = await testSocket();
        expect(res.reqId).toBe("test-group");
        expect(res.type).toBe("changeReqAck");
        expect(res.ack).toBe("rejected");
    });
});
