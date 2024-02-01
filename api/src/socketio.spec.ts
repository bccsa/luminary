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
});
